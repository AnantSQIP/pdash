/**
 * The conflict wall, pinned from both sides.
 *
 * Companion to tools/authz-holes.e2e.mjs, which found these two holes. This one exists because
 * that pin has two blind spots and because a wall is only proven by BOTH answers:
 *
 *   • Its pid-ledger assertion passes vacuously on a freshly seeded database — the ledger is
 *     empty until some project has a PID attached, so "HR is not handed the client name" was
 *     true because HR was handed nothing at all. Here the ledger is checked against the Super
 *     Admin's own view of it: whatever client SA can see in a row, HR must not.
 *   • Its rename assertion sources the list id from the read that is now (correctly) 403, so the
 *     check silently stops running the moment the bug is fixed. Here the id comes from an admin
 *     session, which does not disappear when the wall goes up.
 *
 * And a wall that refuses everyone is not a fix, so every refusal below is paired with the
 * legitimate path it must NOT have broken: a member on their own matter, a delivery lead on any
 * matter, a Super Admin seeing the client everywhere, and team-space columns — TaskList rows too,
 * but reached through /teams, which this must leave alone.
 *
 *   node tools/conflict-wall.e2e.mjs          # API on :4011, a SCRATCH database
 *   BASE=http://127.0.0.1:4021 node tools/conflict-wall.e2e.mjs
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4011';
const PW = process.env.SEED_PASSWORD || 'sqip@1234';
const PASSCODE = process.env.ORG_PASSCODE || 'Hunt-Passcode-4419';

const ADMIN = 'mohit@squarkip.com';          // Super Admin — the only role holding patent.manage
const MANAGER = 'ankit.verma@squarkip.com';  // delivery oversight, no patent.manage
const STAFF = 'ajay.sharma@squarkip.com';    // Employee
const HR = 'hr@squarkip.com';                // holds no tasklist permission of any kind
const CONSULTANT = 'meetu.singh@squarkip.com';

let passed = 0, skipped = 0; const fails = [];
const ok = (n, c, d = '') => {
  if (c) { passed++; console.log('  ok   ' + n); }
  else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); }
};
const skip = (n, why) => { skipped++; console.log(`  --   skipped: ${n} (${why})`); };

function sess() {
  let cookie = '';
  return async (p, { method = 'GET', body, passcode } = {}) => {
    const headers = {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(passcode ? { 'x-org-passcode': passcode } : {}),
    };
    const r = await fetch(BASE + '/api/v1' + p, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}
const login = (s, email) => s('/auth/login', { method: 'POST', body: { email, password: PW } });

(async () => {
  const admin = sess(), manager = sess(), staff = sess(), hr = sess(), consultant = sess();
  await Promise.all([
    login(admin, ADMIN), login(manager, MANAGER), login(staff, STAFF),
    login(hr, HR), login(consultant, CONSULTANT),
  ]);

  // ── Fixture: a matter whose client is resolvable ──────────────────────────────
  // An Employee holds patent.view, so they can tag a patent and mint a matter whose client the
  // server can resolve — which is exactly how the fact reached them in the first place.
  let client = ((await admin('/clients')).data ?? [])[0];
  if (!client) {
    client = (await admin('/clients', {
      method: 'POST', passcode: PASSCODE, body: { name: 'Mailike Industries', code: 'MLK' },
    })).data;
  }
  let patents = (await admin('/patents')).data ?? [];
  if (!patents.length) {
    patents = (await admin('/patents', {
      method: 'POST', passcode: PASSCODE, body: { clientId: client.id, realNumbers: ['US 10,123,456 B2'] },
    })).data ?? [];
  }
  const options = (await staff('/patents/options')).data ?? [];
  ok('setup: a client and a patent an Employee can pick', !!client?.name && options.length > 0);

  const authority = ((await staff('/projects/pid-authorities')).data ?? [])[0];
  const managers = ((await staff('/projects/eligible-managers')).data?.managers ?? []);
  const made = await staff('/projects', {
    method: 'POST',
    body: {
      title: 'conflict-wall probe',
      patentIds: [options[0]?.id].filter(Boolean),
      pidAssigneeId: authority?.id,
      managerId: managers[0]?.id,
    },
  });
  const mine = made.data?.id;
  ok('setup: the Employee mints a matter tagging that patent', made.status === 201 && !!mine,
    `status ${made.status} ${JSON.stringify(made.data).slice(0, 160)}`);
  ok('setup: the Super Admin really can read the client on it',
    (await admin(`/projects/${mine}`)).data?.client?.name === client.name);

  // Staff the Consultant onto it. Being ON a matter is what makes the leak interesting: a role
  // that cannot reach the matter at all proves nothing about what the matter withholds.
  const consultantId = ((await admin('/users')).data ?? []).find?.(u => u.email === CONSULTANT)?.id;
  const staffed = consultantId
    ? await admin(`/projects/${mine}/members`, { method: 'POST', body: { userId: consultantId, projectRole: 'MEMBER' } })
    : { status: 0 };
  ok('setup: the Consultant is staffed on it', staffed.status === 201 || staffed.status === 200,
    `status ${staffed.status}`);

  // ── 1. The client fact — withheld without patent.manage, kept with it ─────────
  const clientOf = r => (typeof r === 'string' ? r : r?.name ?? r?.code ?? null);

  for (const [who, s] of [['an Employee', staff], ['a Manager', manager], ['a Consultant', consultant]]) {
    const detail = (await s(`/projects/${mine}`)).data;
    ok(`GET /projects/:id withholds the client from ${who}`,
      detail?.client == null && detail?.clientId == null, `client=${JSON.stringify(detail?.client)}`);

    const rounds = (await s(`/projects/${mine}/rounds`)).data;
    const round = (rounds?.rounds ?? [])[0];
    ok(`GET /projects/:id/rounds withholds it from ${who}`, round != null && round.client == null,
      `client=${JSON.stringify(round?.client)}`);
    ok(`…and still returns the round itself to ${who}`, !!round?.title && round?.taskLists != null);

    const report = ((await s('/projects/full-report')).data ?? []).find(p => p.id === mine);
    ok(`GET /projects/full-report withholds it from ${who}`, report != null && report.client == null,
      `client=${JSON.stringify(report?.client)} on patents ${JSON.stringify(report?.patents)}`);
    ok(`…and still returns the row's tasks and hours to ${who}`,
      report?.tasks != null && report?.loggedHours != null && !!report?.title);
  }

  const adminDetail = (await admin(`/projects/${mine}`)).data;
  const adminRound = ((await admin(`/projects/${mine}/rounds`)).data?.rounds ?? [])[0];
  const adminRow = ((await admin('/projects/full-report')).data ?? []).find(p => p.id === mine);
  ok('a Super Admin still sees the client on /projects/:id', adminDetail?.client?.name === client.name);
  ok('a Super Admin still sees it on /rounds', clientOf(adminRound?.client) === client.name);
  ok('a Super Admin still sees it on /full-report', clientOf(adminRow?.client) === client.name);

  // ── 2. The PID ledger — checked against what the Super Admin can actually see ──
  const adminLedger = (await admin('/projects/pid-ledger')).data ?? [];
  const named = adminLedger.filter(r => (r.rounds ?? []).some(x => x.client) || r.project?.client);
  const hrLedger = await hr('/projects/pid-ledger');
  ok('HR still reaches the ledger (it is their module too)', hrLedger.status === 200, `status ${hrLedger.status}`);
  if (!named.length) {
    skip('the ledger withholds the client from HR', 'no PID in the ledger has a client to withhold');
  } else {
    const hrRows = hrLedger.data ?? [];
    const leaked = hrRows.filter(r => (r.rounds ?? []).some(x => x.client) || r.project?.client);
    ok('the ledger withholds the client from HR', leaked.length === 0,
      `${leaked.length} of ${hrRows.length} rows still name a client, e.g. ${JSON.stringify(leaked[0]?.project?.client)}`);
    const sameRow = (hrRows.find(r => r.pid === named[0].pid) ?? {});
    ok('…while the rest of the ledger row survives for HR',
      sameRow.pid === named[0].pid && sameRow.state === named[0].state
      && (sameRow.rounds ?? []).length === (named[0].rounds ?? []).length
      && sameRow.totalLoggedHours === named[0].totalLoggedHours,
      JSON.stringify(sameRow).slice(0, 200));
  }

  // ── 3. The task-list wall — and the paths it must not have closed ─────────────
  // A matter the Employee/Consultant/HR are not staffed on. Taken from the admin's list minus
  // everything the Employee's own scope returns — picking "any project that is not the probe"
  // quietly selects one they ARE on, and then every refusal below is asserted against a matter
  // they were entitled to all along.
  const staffScope = new Set(((await staff('/projects')).data ?? []).map(p => p.id));
  const foreign = ((await admin('/projects')).data ?? []).find(p => p.id !== mine && !staffScope.has(p.id));
  ok('setup: a matter the Employee is not staffed on', !!foreign);
  const lists = (await admin(`/projects/${foreign.id}/tasklists`)).data ?? [];
  const def = lists.find(l => l.isDefault) ?? lists[0];
  ok('setup: the admin can see that matter\'s lists', Array.isArray(lists) && !!def);

  ok('an Employee is refused a non-member matter\'s task lists',
    (await staff(`/projects/${foreign.id}/tasklists`)).status === 403);
  ok('a Consultant is refused them too',
    (await consultant(`/projects/${foreign.id}/tasklists`)).status === 403);
  ok('HR, who holds no tasklist permission at all, is refused them',
    (await hr(`/projects/${foreign.id}/tasklists`)).status === 403);
  ok('a single list is refused by id as well',
    (await staff(`/projects/${foreign.id}/tasklists/${def?.id}`)).status === 403);
  ok('a non-member cannot CREATE a list in that matter',
    (await consultant(`/projects/${foreign.id}/tasklists`, {
      method: 'POST', body: { name: 'conflict-wall injected' },
    })).status === 403);
  const renamed = await consultant(`/projects/${foreign.id}/tasklists/${def?.id}`, {
    method: 'PATCH', body: { name: 'conflict-wall renamed' },
  });
  ok('a non-member cannot RENAME one', renamed.status === 403, `status ${renamed.status}`);
  ok('a non-member cannot DELETE one',
    (await consultant(`/projects/${foreign.id}/tasklists/${def?.id}`, { method: 'DELETE' })).status === 403);
  ok('the refusal reads like every other delivery route',
    (await staff(`/projects/${foreign.id}/tasklists`)).data?.message === 'You do not have access to this project.');

  // The other side of the wall.
  ok('the Employee still reads the lists of their OWN matter',
    (await staff(`/projects/${mine}/tasklists`)).status === 200);
  ok('a delivery lead still reads any matter\'s lists (oversight)',
    (await manager(`/projects/${foreign.id}/tasklists`)).status === 200);
  const created = await manager(`/projects/${foreign.id}/tasklists`, {
    method: 'POST', body: { name: 'conflict-wall lead list' },
  });
  ok('…and can still create one', created.status === 201, `status ${created.status}`);
  ok('…and rename it', created.data?.id
    ? (await manager(`/projects/${foreign.id}/tasklists/${created.data.id}`, {
        method: 'PATCH', body: { name: 'conflict-wall lead list (renamed)' },
      })).status === 200
    : false);

  // ── 4. Team spaces — the other home of TaskList, through a different module ────
  let team = ((await admin('/teams')).data ?? [])[0];
  if (!team) team = (await admin('/teams', { method: 'POST', body: { name: 'conflict-wall space' } })).data;
  if (!team?.id) {
    skip('team-space columns still work', 'no team space available');
  } else {
    const col = await admin(`/teams/${team.id}/lists`, { method: 'POST', body: { name: 'conflict-wall column' } });
    ok('a team space can still gain a column', col.status === 201 || col.status === 200, `status ${col.status}`);
    const detail = (await admin(`/teams/${team.id}`)).data;
    const names = (detail?.taskLists ?? detail?.lists ?? []).map(l => l.name);
    ok('…and it comes back on the space', names.includes('conflict-wall column'), JSON.stringify(names));
  }

  console.log(`\n${passed} passed, ${fails.length} failed, ${skipped} skipped`);
  if (fails.length) { console.log('\nFailures:\n  ' + fails.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
