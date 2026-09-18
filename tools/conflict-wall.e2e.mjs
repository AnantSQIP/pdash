/**
 * The conflict wall, pinned from both sides.
 *
 * Companion to tools/authz-holes.e2e.mjs, which found these two holes. This one exists because
 * that pin has two blind spots and because a wall is only proven by BOTH answers:
 *
 *   • Its ledger assertion passed vacuously on a freshly seeded database — the ledger was empty
 *     until some project had a number attached, so "HR is not handed the client name" was true
 *     because HR was handed nothing at all. Here the (now CID) ledger is checked against the Super
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

// The actors are chosen by what they may DO (/me/effective-permissions), not by name: the roster
// moves (ajay.sharma, once the Employee here, became a Senior Consultant with oversight, and the
// "matter the Employee is not staffed on" setup then found nothing). Each role is described by the
// permissions the checks below depend on:
//   ADMIN      — patent.manage (a Super Admin)
//   MANAGER    — project.approve (delivery oversight), no patent.manage
//   STAFF      — project.create, no project.approve (no oversight), no tasklist.create
//   HR         — user.manage_access and no tasklist permission of any kind
//   CONSULTANT — tasklist.create but no project.approve (can make lists, only where staffed)
const CANDIDATES = [
  // Likeliest first, so a normal run logs in five times, not fifteen (the login is rate-limited).
  'mohit@squarkip.com', 'ankit.verma@squarkip.com', 'meetu.singh@squarkip.com', 'aman.sharma@squarkip.com',
  'hr@squarkip.com', 'yash@squarkip.com', 'ajay.sharma@squarkip.com', 'neha.shukla@squarkip.com',
  'vijay.mishra@squarkip.com', 'ketan.dagar@squarkip.com', 'khushi.gupta@squarkip.com', 'shavetasharma@squarkip.com',
  'ritik.sharma@squarkip.com', 'drishti.jain@squarkip.com', 'rajesh.joshi@squarkip.com',
];
const ROLE_TESTS = {
  ADMIN: c => c.has('patent.manage'),
  MANAGER: c => c.has('project.approve') && !c.has('patent.manage'),
  STAFF: c => c.has('project.create') && !c.has('project.approve') && !c.has('tasklist.create') && !c.has('user.manage_access'),
  HR: c => c.has('user.manage_access') && ![...c].some(x => x.startsWith('tasklist.')) && !c.has('project.approve'),
  CONSULTANT: c => c.has('tasklist.create') && !c.has('project.approve'),
};

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
  const picked = {};
  for (const email of CANDIDATES) {
    if (Object.keys(ROLE_TESTS).every(k => picked[k])) break;
    const s = sess();
    if ((await login(s, email)).status >= 300) continue;
    const codes = new Set(((await s('/me/effective-permissions')).data?.codes ?? []).map(x => (typeof x === 'string' ? x : x.code)));
    const role = Object.keys(ROLE_TESTS).find(k => !picked[k] && ROLE_TESTS[k](codes));
    if (role) picked[role] = { s, email };
  }
  const missing = Object.keys(ROLE_TESTS).filter(k => !picked[k]);
  if (missing.length) { console.log(`FIXTURE: nobody in the roster fits ${missing.join(', ')} — reseed the scratch database`); process.exit(2); }
  console.log('actors: ' + Object.entries(picked).map(([k, v]) => `${k}=${v.email}`).join(' '));
  const admin = picked.ADMIN.s, manager = picked.MANAGER.s, staff = picked.STAFF.s, hr = picked.HR.s, consultant = picked.CONSULTANT.s;
  const CONSULTANT = picked.CONSULTANT.email;

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
  // CLIENTS-FLOW: patents and client codes are switched off (PATENTS_AND_CLIENT_CODES=false), so
  // there is no client fact to leak. The checks that need one are skipped rather than deleted —
  // they are the proof this suite exists for, and must run again the day the feature comes back.
  const patentsOff = !client?.name || options.length === 0;
  if (patentsOff) skip('setup: a client and a patent an Employee can pick', 'patents and client codes are switched off');
  else ok('setup: a client and a patent an Employee can pick', !!client?.name && options.length > 0);

  const managers = ((await staff('/projects/eligible-managers')).data?.managers ?? []);
  const made = await staff('/projects', {
    method: 'POST',
    body: {
      title: 'conflict-wall probe',
      ...(patentsOff ? {} : { patentIds: [options[0]?.id].filter(Boolean) }),
      managerId: managers[0]?.id,
    },
  });
  const mine = made.data?.id;
  ok(patentsOff ? 'setup: the Employee mints a matter' : 'setup: the Employee mints a matter tagging that patent',
    made.status === 201 && !!mine, `status ${made.status} ${JSON.stringify(made.data).slice(0, 160)}`);
  if (patentsOff) skip('setup: the Super Admin really can read the client on it', 'no client to read');
  else ok('setup: the Super Admin really can read the client on it',
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
  if (patentsOff) {
    skip('a Super Admin still sees the client on /projects/:id, /rounds and /full-report',
      'patents and client codes are switched off — nobody sees a client, which the checks above assert');
  } else {
    ok('a Super Admin still sees the client on /projects/:id', adminDetail?.client?.name === client.name);
    ok('a Super Admin still sees it on /rounds', clientOf(adminRound?.client) === client.name);
    ok('a Super Admin still sees it on /full-report', clientOf(adminRow?.client) === client.name);
  }

  // ── 2. The CID ledger — checked against what the Super Admin can actually see ──
  const adminLedger = (await admin('/projects/cid-ledger')).data ?? [];
  const named = adminLedger.filter(r => (r.rounds ?? []).some(x => x.client) || r.client);
  const hrLedger = await hr('/projects/cid-ledger');
  ok('HR still reaches the ledger (it is their module too)', hrLedger.status === 200, `status ${hrLedger.status}`);
  if (!named.length) {
    skip('the ledger withholds the client from HR', 'no CID in the ledger has a client to withhold');
    // The rest of the wall still holds: HR's rows are the admin's rows, minus nothing but the client fact.
    const hrRows = hrLedger.data ?? [];
    const probe = adminLedger.find(r => (r.rounds ?? []).some(x => x.id === mine));
    const hrProbe = hrRows.find(r => r.cid === probe?.cid) ?? {};
    ok('HR sees the probe client\'s CID row as the admin does', !!probe && hrProbe.cid === probe.cid
      && hrProbe.status === probe.status && hrProbe.clientName === probe.clientName
      && (hrProbe.events ?? []).length === (probe.events ?? []).length, JSON.stringify(hrProbe).slice(0, 200));
    ok('…and no row of HR\'s carries a client key at all',
      hrRows.every(r => !('client' in r) && (r.rounds ?? []).every(x => !('client' in x) && !('clientId' in x))));
  } else {
    const hrRows = hrLedger.data ?? [];
    const leaked = hrRows.filter(r => (r.rounds ?? []).some(x => x.client) || r.client);
    ok('the ledger withholds the client from HR', leaked.length === 0,
      `${leaked.length} of ${hrRows.length} rows still name a client, e.g. ${JSON.stringify(leaked[0]?.client)}`);
    const sameRow = (hrRows.find(r => r.cid === named[0].cid) ?? {});
    ok('…while the rest of the ledger row survives for HR',
      sameRow.cid === named[0].cid && sameRow.status === named[0].status
      && (sameRow.rounds ?? []).length === (named[0].rounds ?? []).length
      && sameRow.totalLoggedHours === named[0].totalLoggedHours,
      JSON.stringify(sameRow).slice(0, 200));
  }

  // ── 3. The task-list wall — and the paths it must not have closed ─────────────
  // A matter the Employee/Consultant/HR are not staffed on. Taken from the admin's list minus
  // everything the Employee's own scope returns — picking "any project that is not the probe"
  // quietly selects one they ARE on, and then every refusal below is asserted against a matter
  // they were entitled to all along.
  // …and one the CONSULTANT is not on either, since every refusal below is asserted for both.
  const staffScope = new Set([
    ...((await staff('/projects')).data ?? []).map(p => p.id),
    ...((await consultant('/projects')).data ?? []).map(p => p.id),
  ]);
  let foreign = ((await admin('/projects')).data ?? []).find(p => p.id !== mine && !staffScope.has(p.id));
  // A roster where the two are on everything leaves nothing to test against; make one.
  if (!foreign) foreign = (await admin('/projects', { method: 'POST', body: { title: 'conflict-wall foreign' } })).data;
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
    // CLIENTS-FLOW: a project row IS a client now, and the shared refusal says so.
    (await staff(`/projects/${foreign.id}/tasklists`)).data?.message === 'You do not have access to this client.');

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
  // A LIVE space: an archived one refuses new work by design, and another suite may have left one
  // archived at the top of the list.
  let team = ((await admin('/teams')).data ?? []).find(t => !t.archivedAt);
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
