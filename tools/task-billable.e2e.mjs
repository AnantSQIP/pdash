/**
 * Billable is a property of the TASK — end to end against a REAL API and a REAL database.
 *
 *   BASE=http://127.0.0.1:4031 node tools/task-billable.e2e.mjs      # a SCRATCH database
 *
 * Every task starts billable. Anybody associated with it — on its client, or staffed on it — may
 * mark it non-billable (one task, or a whole task group at once). Time logged on a task always
 * carries the task's flag, whatever the screen asked for, and changing the flag re-marks the
 * task's existing entries — so no report can show a non-billable task with billable hours.
 *
 * Actors are chosen by what they can do, not by name, except the staffed employee, who is found
 * as "somebody who is not a Super Admin and holds a seat on an open client task".
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4031';
const PW = process.env.PW || 'sqip@1234';
const ADMIN = process.env.ADMIN || 'mohit@squarkip.com';
const OUTSIDER = process.env.OUTSIDER || 'aman.sharma@squarkip.com';
const HR = process.env.HR || 'hr@squarkip.com';

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const eq = (n, got, want) => ok(n, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const msg = r => (typeof r.data?.message === 'string' ? r.data.message : JSON.stringify(r.data?.message ?? r.data));

function session() {
  let cookie = '';
  return async (p, { method = 'GET', body } = {}) => {
    const r = await fetch(BASE + '/api/v1' + p, {
      method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}
async function signIn(email) {
  const s = session();
  const r = await s('/auth/login', { method: 'POST', body: { email, password: PW } });
  if (r.status >= 400) throw new Error(`cannot sign in as ${email}: ${r.status} ${msg(r)}`);
  const me = (await s('/auth/me')).data; s.id = me.user?.id ?? me.id; s.email = email;
  return s;
}

(async () => {
  console.log(`\n=== billable per task — against ${BASE} ===\n`);
  const admin = await signIn(ADMIN);

  // A live client task staffed on somebody who is not a Super Admin.
  const board = (await admin('/capacity/team?days=14')).data;
  let staff = null, T = null;
  for (const row of board?.rows ?? []) {
    if (row.userId === admin.id) continue;
    const t = (row.openTasks ?? []).find(x => !x.isTeamWork && x.projectId);
    if (!t) continue;
    const email = (await admin(`/users/${row.userId}`)).data?.email;
    if (!email || /^(mohit|yash)@/.test(email)) continue;
    try {
      const s = await signIn(email);
      // Somebody associated ONLY by being staffed / on the client — not by delivery oversight.
      const eff = (await s('/me/effective-permissions')).data;
      if (eff?.isSuperAdmin || (eff?.codes ?? []).includes('project.approve') || !(eff?.codes ?? []).includes('task.view')) continue;
      staff = s; T = t; break;
    } catch { /* try the next person */ }
  }
  if (!staff) { console.error('No staffed non-admin person found on a live client.'); process.exit(1); }
  console.log(`  (staffed person: ${staff.email}; task: ${T.title})`);

  const entriesOnT = async () => ((await admin(`/timesheets?userId=${staff.id}`)).data ?? []).filter(e => e.taskId === T.id && !e.deletedAt);
  const created = [];
  const log = async (hours, body = {}) => {
    const r = await staff('/timesheets', { method: 'POST', body: { taskId: T.id, date: today(), hoursLogged: hours, notes: `billable-e2e ${Date.now()}`, ...body } });
    if (r.data?.id) created.push(r.data.id);
    return r;
  };

  // ── the default ────────────────────────────────────────────────────────────
  console.log('\n— a task starts billable, and so does its time —');
  await admin(`/tasks/${T.id}/billable`, { method: 'PATCH', body: { billable: true } }); // a clean start
  eq('the task is billable', (await admin(`/tasks/${T.id}`)).data?.billable, true);
  const e1 = await log(0.25);
  ok('time logged on it saves', e1.status < 300, `${e1.status} ${msg(e1)}`);
  eq('and is billable', e1.data?.billable, true);

  // ── who may change it ──────────────────────────────────────────────────────
  console.log('\n— who may mark it non-billable —');
  const outsider = await signIn(OUTSIDER);
  const byOutsider = await outsider(`/tasks/${T.id}/billable`, { method: 'PATCH', body: { billable: false } });
  ok('somebody on neither the client nor the task is refused', byOutsider.status === 403 || byOutsider.status === 404, `${byOutsider.status} ${msg(byOutsider)}`);
  const hr = await signIn(HR);
  const byHr = await hr(`/tasks/${T.id}/billable`, { method: 'PATCH', body: { billable: false } });
  ok('HR, with no delivery access, is refused', byHr.status === 403 || byHr.status === 404, `${byHr.status} ${msg(byHr)}`);
  eq('and the task is still billable', (await admin(`/tasks/${T.id}`)).data?.billable, true);
  const bad = await staff(`/tasks/${T.id}/billable`, { method: 'PATCH', body: { billable: 'no' } });
  eq('a value that is not true/false is refused', bad.status, 400);

  const off = await staff(`/tasks/${T.id}/billable`, { method: 'PATCH', body: { billable: false } });
  ok('the person staffed on it may mark it non-billable', off.status === 200, `${off.status} ${msg(off)}`);
  ok('and is told how many existing entries followed', (off.data?.entriesUpdated ?? 0) >= 1, JSON.stringify(off.data));
  eq('the task now says non-billable', (await admin(`/tasks/${T.id}`)).data?.billable, false);
  ok('every existing entry on it is now non-billable', (await entriesOnT()).every(e => e.billable === false),
     JSON.stringify((await entriesOnT()).map(e => e.billable)));
  const again = await staff(`/tasks/${T.id}/billable`, { method: 'PATCH', body: { billable: false } });
  eq('saying it twice changes nothing', again.data?.changed, false);

  // ── time follows the task, whatever the screen asks for ──────────────────────
  console.log('\n— new time follows the task —');
  const e2 = await log(0.5, { billable: true });
  eq('an entry that asks to be billable on a non-billable task is not', e2.data?.billable, false);
  const flip = await staff(`/timesheets/${e2.data?.id}`, { method: 'PATCH', body: { billable: true } });
  ok('editing it', flip.status < 300, `${flip.status} ${msg(flip)}`);
  eq('cannot make it billable either', flip.data?.billable, false);
  const plan = (await staff(`/capacity/my-plan?date=${today()}`)).data;
  eq('the Log time sheet shows the task as non-billable', (plan?.rows ?? []).find(r => r.taskId === T.id)?.billable, false);

  // ── and back ───────────────────────────────────────────────────────────────
  console.log('\n— and back —');
  const on = await admin(`/tasks/${T.id}/billable`, { method: 'PATCH', body: { billable: true } });
  ok('delivery oversight may mark it billable again', on.status === 200 && on.data?.changed === true, `${on.status} ${msg(on)}`);
  ok('and every entry on it follows', (await entriesOnT()).every(e => e.billable === true),
     JSON.stringify((await entriesOnT()).map(e => e.billable)));
  const act = (await admin(`/activity?entityType=TASK&entityId=${T.id}&limit=50`)).data ?? [];
  ok('each change is on the task\'s record', act.filter(a => a.action === 'task.billable_changed').length >= 2,
     [...new Set(act.map(a => a.action))].join(','));

  // ── a change racing new time ─────────────────────────────────────────────────
  console.log('\n— a change landing while time is being logged —');
  const race = await Promise.all([
    log(0.75), log(1), admin(`/tasks/${T.id}/billable`, { method: 'PATCH', body: { billable: false } }), log(1.25), log(1.5),
  ]);
  ok('nothing in the race returned a server error', race.every(r => r.status < 500), race.map(r => r.status).join(' '));
  const flag = (await admin(`/tasks/${T.id}`)).data?.billable;
  ok('afterwards every entry on the task agrees with it', (await entriesOnT()).every(e => e.billable === flag),
     `task=${flag} entries=${JSON.stringify((await entriesOnT()).map(e => e.billable))}`);
  await admin(`/tasks/${T.id}/billable`, { method: 'PATCH', body: { billable: true } });

  // ── a whole task group at once ───────────────────────────────────────────────
  console.log('\n— a whole task group —');
  const client = (await admin(`/projects/${T.projectId}`)).data;
  const group = (client?.taskLists ?? []).find(l => l.id === T.taskGroupId) ?? (client?.taskLists ?? [])[0];
  const groupTasks = async () => ((await admin(`/tasks?projectId=${T.projectId}&taskListId=${group.id}`)).data ?? []);
  const gOff = await staff(`/tasks/groups/${group.id}/billable`, { method: 'PATCH', body: { billable: false } });
  ok('somebody on the client may mark a whole group non-billable', gOff.status === 200, `${gOff.status} ${msg(gOff)}`);
  ok('every task in it is now non-billable', (await groupTasks()).every(t => t.billable === false),
     JSON.stringify((await groupTasks()).map(t => t.billable)));
  ok('including the time already logged on them', (await entriesOnT()).every(e => e.billable === false));
  const gOut = await outsider(`/tasks/groups/${group.id}/billable`, { method: 'PATCH', body: { billable: true } });
  ok('somebody not on the client is refused', gOut.status === 403 || gOut.status === 404, `${gOut.status} ${msg(gOut)}`);
  const gOn = await admin(`/tasks/groups/${group.id}/billable`, { method: 'PATCH', body: { billable: true } });
  ok('and it can be put back', gOn.status === 200 && (await groupTasks()).every(t => t.billable === true), `${gOn.status} ${msg(gOn)}`);

  // ── team-space work ──────────────────────────────────────────────────────────
  const teams = (await admin('/teams')).data ?? [];
  let teamTask = null;
  for (const tm of teams) {
    const tt = (await admin(`/teams/${tm.id}/tasks`)).data;
    teamTask = (Array.isArray(tt) ? tt : tt?.tasks ?? [])[0];
    if (teamTask) break;
  }
  if (teamTask) {
    const tt = await admin(`/tasks/${teamTask.id}/billable`, { method: 'PATCH', body: { billable: true } });
    eq('team-space work cannot be made billable', tt.status, 400);
  } else {
    console.log('  (no team-space task in this database — skipped)');
  }

  // ── tidy up ──────────────────────────────────────────────────────────────────
  for (const id of created) await staff(`/timesheets/${id}`, { method: 'DELETE' });

  console.log(`\n${fails.length ? '✗' : '✓'} ${passed} passed, ${fails.length} failed\n`);
  fails.forEach(f => console.error('  ✗ ' + f + '\n'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
