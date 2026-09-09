/**
 * The gaps: everything the first suite did not reach.
 *
 *   node tools/time-mode-gaps.e2e.mjs      # expects the API on :4011, a SCRATCH database
 *
 * The first suite tested the feature as an administrator, on the happy paths, one request at a
 * time. That is the shape of test that passes while a product is quietly broken for everybody who
 * is not an administrator, or who does two things at once. These are the rest.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4011';
const PASSCODE = process.env.PASSCODE || 'mode-e2e-Q7rk-2026';
const ADMIN = 'mohit@squarkip.com';
const STAFF = 'divyanshu.saxena@squarkip.com'; // Employee with real work — the ordinary case
const PW = 'sqip@1234';

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const eq = (n, got, want) => ok(n, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

function session() {
  let cookie = '';
  return async function api(p, { method = 'GET', body, passcode } = {}) {
    const r = await fetch(BASE + '/api/v1' + p, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(passcode ? { 'x-org-passcode': passcode } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const msg = r => (typeof r.data?.message === 'string' ? r.data.message : JSON.stringify(r.data?.message ?? r.data));

(async () => {
  const admin = session(), staff = session();
  await admin('/auth/login', { method: 'POST', body: { email: ADMIN, password: PW } });
  const login2 = await staff('/auth/login', { method: 'POST', body: { email: STAFF, password: PW } });
  if (login2.status >= 400) { console.error(`cannot sign in as ${STAFF}: ${login2.status}`); process.exit(1); }
  const meA0 = (await admin('/auth/me')).data;
  const MY_ORG = (meA0.user ?? meA0)?.organizationId;
  // The signed-in user's own org — never index 0 (see the note in time-mode.e2e.mjs).
  const org = ((await admin('/organizations')).data ?? []).find(o => o.id === MY_ORG)
           ?? (await admin('/organizations')).data[0];
  const meS = (await staff('/auth/me')).data; const STAFF_ID = meS.user?.id ?? meS.id;
  const setMode = m => admin(`/organizations/${org.id}/time-mode`, { method: 'PATCH', body: { mode: m }, passcode: PASSCODE });

  // ── an ordinary employee ─────────────────────────────────────────────────
  console.log('\n— an ordinary employee, not an administrator —');
  const staffSwitch = await staff(`/organizations/${org.id}/time-mode`, { method: 'PATCH', body: { mode: 'MANUAL' }, passcode: PASSCODE });
  ok('cannot change how the firm records time', staffSwitch.status === 403, `status ${staffSwitch.status} ${msg(staffSwitch)}`);
  const staffHistory = await staff(`/organizations/${org.id}/time-mode/history`);
  ok('cannot read the switch log either', staffHistory.status === 403, `status ${staffHistory.status}`);

  await setMode('MANUAL');
  const staffTasks = ((await staff(`/tasks?userId=${STAFF_ID}`)).data ?? []).filter(t => t.currentStatus?.type !== 'CLOSED');
  ok('has tasks to work with', staffTasks.length > 0, `${staffTasks.length} open tasks`);
  let staffTaskId = null;
  if (staffTasks.length) {
    const S = staffTasks[0];
    staffTaskId = S.id;
    const blocked = await staff(`/tasks/${S.id}/start`, { method: 'POST' });
    eq('is refused a stopwatch, exactly as an administrator is', blocked.status, 403);
    // The duplicate guard refuses the same task, day AND duration — including the row this
    // suite wrote last time it ran. Clear it, so the assertion is about the day sheet.
    for (const t of ((await staff(`/timesheets?userId=${STAFF_ID}`)).data ?? [])
         .filter(t => t.notes === 'staff day sheet' && String(t.date).slice(0, 10) === today())) {
      await staff(`/timesheets/${t.id}`, { method: 'DELETE' });
    }
    const dayOK = await staff('/timesheets/day', { method: 'POST', body: { date: today(), entries: [{ taskId: S.id, hoursLogged: 1, notes: 'staff day sheet' }] } });
    eq('can fill in their own day', dayOK.data?.savedCount, 1);
    const finS = await staff(`/tasks/${S.id}/finish`, { method: 'POST' });
    ok('can finish their own task', finS.status === 200 || finS.status === 201, `status ${finS.status}`);
    await staff(`/tasks/${S.id}/reopen`, { method: 'POST' });
  }

  // ── one firm's settings are not another's ────────────────────────────────
  console.log('\n— the tenant boundary —');
  const foreign = await admin('/organizations/some-other-org-id/time-mode', { method: 'PATCH', body: { mode: 'MANUAL' }, passcode: PASSCODE });
  ok('an admin cannot switch a DIFFERENT organisation', foreign.status >= 400,
     `status ${foreign.status} ${msg(foreign)}`);

  // ── provenance now covers BOTH flows, not just one ───────────────────────
  console.log('\n— every new row says which flow wrote it —');
  await setMode('TIMER');
  const adminMe = (await admin('/auth/me')).data; const ADMIN_ID = adminMe.user?.id ?? adminMe.id;
  const mine = ((await admin(`/tasks?userId=${ADMIN_ID}`)).data ?? []).filter(t => t.currentStatus?.type !== 'CLOSED');
  const A = mine[0];
  // The duplicate guard refuses the same task, day AND duration — including one this suite left
  // behind on its last run. Clear them first, so the assertion is about provenance rather than
  // about whether anybody ran the tests before.
  for (const t of ((await admin(`/timesheets?userId=${ADMIN_ID}`)).data ?? [])
       .filter(t => ['typed', 'clocked', 'race'].includes(t.notes) && String(t.date).slice(0, 10) === today())) {
    await admin(`/timesheets/${t.id}`, { method: 'DELETE' });
  }
  const typed = await admin('/timesheets', { method: 'POST', body: { taskId: A.id, date: today(), hoursLogged: 0.25, notes: 'typed' } });
  eq('an entry a person typed is MANUAL, not blank', typed.data?.source, 'MANUAL');
  const clocked = await admin('/timesheets', { method: 'POST', body: { taskId: A.id, date: today(), hoursLogged: 0.75, notes: 'clocked', source: 'TIMER' } });
  eq('an entry filed from the stopwatch says so', clocked.data?.source, 'TIMER');
  const bogus = await admin('/timesheets', { method: 'POST', body: { taskId: A.id, date: today(), hoursLogged: 1.75, source: 'NONSENSE' } });
  eq('an invented provenance is refused', bogus.status, 400);

  // ── the day sheet respects the rules it delegates to ─────────────────────
  console.log('\n— the day sheet does not become a way around the rules —');
  const old = new Date(Date.now() - 200 * 86400e3).toISOString().slice(0, 10);
  for (const t of ((await admin(`/timesheets?userId=${ADMIN_ID}`)).data ?? [])
       .filter(t => String(t.date).slice(0, 10) === old)) {
    await admin(`/timesheets/${t.id}`, { method: 'DELETE' });
  }
  const adminOld = await admin('/timesheets/day', { method: 'POST', body: { date: old, entries: [{ taskId: A.id, hoursLogged: 1 }] } });
  ok('a Super Admin may still fill an old day, as they may everywhere else', adminOld.status < 400, `status ${adminOld.status}`);
  if (staffTaskId) {
    const tooOld = await staff('/timesheets/day', { method: 'POST', body: { date: old, entries: [{ taskId: staffTaskId, hoursLogged: 1 }] } });
    ok('but everybody else is refused a day older than the backdating window', tooOld.status >= 400,
       `status ${tooOld.status} ${msg(tooOld)}`);
  }
  const staffOnMine = await staff('/timesheets/day', { method: 'POST', body: { date: today(), entries: [{ taskId: A.id, hoursLogged: 1 }] } });
  ok('nobody can log time on a task they are not staffed on', (staffOnMine.data?.failedCount ?? 0) === 1 || staffOnMine.status >= 400,
     `status ${staffOnMine.status} ${JSON.stringify(staffOnMine.data?.failed ?? staffOnMine.data).slice(0, 160)}`);

  // ── two saves at once must not double-file ───────────────────────────────
  console.log('\n— a double-click does not book the day twice —');
  const beforeCount = ((await admin(`/timesheets?userId=${ADMIN_ID}`)).data ?? []).length;
  const both = await Promise.all([
    admin('/timesheets/day', { method: 'POST', body: { date: today(), entries: [{ taskId: A.id, hoursLogged: 0.25, notes: 'race' }] } }),
    admin('/timesheets/day', { method: 'POST', body: { date: today(), entries: [{ taskId: A.id, hoursLogged: 0.25, notes: 'race' }] } }),
  ]);
  const afterCount = ((await admin(`/timesheets?userId=${ADMIN_ID}`)).data ?? []).length;
  ok('both saves are accounted for, none lost and none doubled',
     afterCount - beforeCount === both.filter(r => (r.data?.savedCount ?? 0) > 0).reduce((s, r) => s + r.data.savedCount, 0),
     `added ${afterCount - beforeCount}, reported ${both.map(r => r.data?.savedCount).join('+')}`);

  // ── what a person mid-clock experiences when the firm switches ───────────
  console.log('\n— somebody with a clock running when the admin switches —');
  await setMode('TIMER');
  await admin(`/tasks/${A.id}/start`, { method: 'POST' });
  const runBefore = ((await admin('/tasks/timer/running')).data ?? []).length;
  ok('their clock is running', runBefore >= 1, `${runBefore} running`);
  const sw = await setMode('MANUAL');
  const runAfter = ((await admin('/tasks/timer/running')).data ?? []).length;
  eq('it is stopped for them, not left to grow', runAfter, 0);
  ok('and the minutes were kept, not thrown away', (sw.data?.timersClosed ?? 0) >= 1, JSON.stringify(sw.data));
  const stalePause = await admin(`/tasks/${A.id}/pause`, { method: 'POST' });
  ok('their stale tab pressing Pause gets an answer, not an error', stalePause.status === 200 || stalePause.status === 201, `status ${stalePause.status}`);
  const staleStart = await admin(`/tasks/${A.id}/start`, { method: 'POST' });
  eq('their stale tab pressing Start is told plainly', staleStart.status, 403);

  // ── performance and reports across a switch ──────────────────────────────
  console.log('\n— reports spanning a switch —');
  const perf = await admin(`/performance/users/${ADMIN_ID}?days=30`);
  ok('a person\'s performance still computes', perf.status === 200, `status ${perf.status} ${msg(perf).slice(0, 120)}`);
  ok('and counts hours logged under BOTH flows', (perf.data?.kpis?.hoursLogged ?? 0) > 0, `hoursLogged=${perf.data?.kpis?.hoursLogged}`);
  const orgPerf = await admin('/performance/org?days=30');
  ok('the organisation view still computes', orgPerf.status === 200, `status ${orgPerf.status}`);
  const cal = await admin(`/timesheets/calendar?year=${new Date().getUTCFullYear()}&month=${new Date().getUTCMonth() + 1}`);
  ok('the timesheet calendar still computes', cal.status === 200, `status ${cal.status}`);

  // ── the catch-up banner and the punch-out gate in the manual flow ────────
  console.log('\n— the catch-up banner and punch-out gate with no stopwatch —');
  const catchUp = await admin('/attendance/me/catch-up');
  ok('the catch-up check answers rather than erroring', catchUp.status === 200, `status ${catchUp.status} ${msg(catchUp).slice(0, 120)}`);
  ok('and reports no clock left running, because there are none', ((catchUp.data?.runningTimers ?? catchUp.data?.running ?? []).length ?? 0) === 0,
     JSON.stringify(catchUp.data).slice(0, 200));
  // The gate that stands between a person and punching out. In the manual flow it must still
  // measure the DAY, and must never claim there is clock time waiting to be filed — there is no
  // clock, so a prompt to file it would be unanswerable.
  const poc = await admin('/attendance/me/punch-out-check');
  ok('the punch-out gate answers', poc.status === 200, `status ${poc.status}`);
  const pday = poc.data?.day ?? {};
  eq('with no unfiled clock time to nag about', pday.unfiledHours ?? 0, 0);
  eq('and nothing on the clock', pday.trackedMinutes ?? 0, 0);
  eq('and no tracked tasks to list', (pday.tracked ?? []).length, 0);
  ok('while still measuring the day itself', (pday.target ?? 0) > 0, JSON.stringify({ target: pday.target, logged: pday.logged }));

  const gate = await admin('/tasks/timer/today');
  ok('the day status still answers', gate.status === 200, `status ${gate.status}`);
  eq('with nothing on the clock', gate.data?.trackedMinutes ?? 0, 0);

  await setMode('TIMER');

  // ── cover is visible on the board, not merely computed ───────────────────
  //
  // The split was right from the start and shown NOWHERE: a manager could arrange cover and
  // neither the person away nor the stand-in would ever see it on the board they plan from. Hours
  // moving silently looks exactly like hours going missing.
  console.log('\n— cover shows up on the board, on both sides —');
  const cproj = (await admin('/projects')).data.find(p => !['ARCHIVED', 'CANCELLED', 'COMPLETED', 'CLOSED'].includes(p.projectPhase));
  const cfull = (await admin(`/projects/${cproj.id}`)).data;
  const clist = (cfull.taskLists ?? []).find(l => l.isDefault) ?? (cfull.taskLists ?? [])[0];
  const mate = (cfull.members ?? []).map(m => m.userId).find(u => u !== ADMIN_ID);
  const fwd = n => { const d = new Date(Date.now() + 5.5 * 3600e3); let c = 0; while (c < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) c++; } return d.toISOString().slice(0, 10); };
  if (mate) {
    const ct = await admin('/tasks', { method: 'POST', body: { title: 'e2e cover visibility', projectId: cproj.id, taskListId: clist.id, createdBy: ADMIN_ID, dueDate: fwd(12), priority: 'HIGH' } });
    await admin(`/tasks/${ct.data.id}/staffing`, { method: 'PUT', body: { assignees: [{ userId: ADMIN_ID, role: 'ANALYST', estimatedHours: 16, startDate: fwd(1), dueDate: fwd(12) }] } });
    const made = await admin('/capacity/coverage', { method: 'POST', body: { taskId: ct.data.id, fromUserId: ADMIN_ID, toUserId: mate, fromDate: fwd(2), toDate: fwd(4), mode: 'COVER', reason: 'e2e' } });
    ok('the cover is created', made.status === 201 || made.status === 200, `status ${made.status} ${msg(made)}`);

    const board = (await admin('/capacity/team?days=20')).data;
    const rowOf = id => (board.rows ?? []).find(r => r.userId === id);
    const mineRow = (rowOf(ADMIN_ID)?.openTasks ?? []).find(t => t.id === ct.data.id);
    const theirRow = (rowOf(mate)?.openTasks ?? []).find(t => t.id === ct.data.id);

    ok('the covered person is marked as covered', mineRow?.coveredAway === true, JSON.stringify(mineRow ?? null).slice(0, 200));
    eq('and it names WHO is covering, not just that somebody is', mineRow?.coveredByUserId, mate);
    eq('the stand-in is shown whose work it is', theirRow?.coveringForUserId, ADMIN_ID);
    ok('and the two halves still add up to the whole job',
       Math.abs((mineRow?.remainingHours ?? 0) + (theirRow?.remainingHours ?? 0) - 16) < 0.05,
       `${mineRow?.remainingHours} + ${theirRow?.remainingHours}`);

    // Withdrawing restores the plan, which is the point of holding cover as a record.
    await admin(`/capacity/coverage/${made.data.id}/revoke`, { method: 'POST' });
    const after = (await admin('/capacity/team?days=20')).data;
    const restored = ((after.rows ?? []).find(r => r.userId === ADMIN_ID)?.openTasks ?? []).find(t => t.id === ct.data.id);
    ok('withdrawing it gives the whole job back', Math.abs((restored?.remainingHours ?? 0) - 16) < 0.05, `remaining=${restored?.remainingHours}`);
    ok('and clears the marking', !restored?.coveredAway, JSON.stringify({ coveredAway: restored?.coveredAway }));
    await admin(`/tasks/${ct.data.id}`, { method: 'DELETE' });
  }

  await setMode('TIMER');

  console.log(`\n${fails.length ? '✗' : '✓'} ${passed} passed, ${fails.length} failed\n`);
  fails.forEach(f => console.error('  ✗ ' + f + '\n'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
