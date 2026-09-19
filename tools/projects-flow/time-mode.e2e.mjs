/**
 * End-to-end tests for the two time-recording flows, against a REAL running API and a REAL
 * database.
 *
 *   node tools/time-mode.e2e.mjs            # expects the API on http://127.0.0.1:4011
 *   BASE=http://127.0.0.1:4011 node tools/time-mode.e2e.mjs
 *
 * Run it against a SCRATCH database — it switches the organisation's mode, logs time and finishes
 * tasks. Never point it at the live demo.
 *
 * These exist because the interesting part of this feature is not any single function: it is what
 * happens ACROSS a switch. A firm records time one way for months, changes its mind, and every
 * hour recorded under the old flow has to still be there, still mean the same thing, and still add
 * up. That is not something a unit test of a pure function can tell you.
 */

const BASE = process.env.BASE || 'http://127.0.0.1:4011';
const EMAIL = process.env.EMAIL || 'mohit@squarkip.com';
const PASSWORD = process.env.PASSWORD || 'sqip@1234';
const PASSCODE = process.env.PASSCODE || 'mode-e2e-Q7rk-2026';

let cookie = '';
let passed = 0;
const failures = [];

function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; console.log(`  ok  ${name}`); return true; }
  failures.push(`${name}\n      got:  ${g}\n      want: ${w}`);
  console.log(`  FAIL ${name}\n      got:  ${g}\n      want: ${w}`);
  return false;
}
function checkThat(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok  ${name}`); return true; }
  failures.push(`${name}${detail ? `\n      ${detail}` : ''}`);
  console.log(`  FAIL ${name}${detail ? `\n      ${detail}` : ''}`);
  return false;
}

async function api(path, { method = 'GET', body, passcode } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(passcode ? { 'x-org-passcode': passcode } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map(c => c.split(';')[0]).join('; ');
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const msg = r => (typeof r.data?.message === 'string' ? r.data.message : JSON.stringify(r.data?.message ?? r.data));
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

async function setMode(mode) {
  return api(`/organizations/${ORG_ID}/time-mode`, { method: 'PATCH', body: { mode }, passcode: PASSCODE });
}

let ORG_ID = '';
let MY_TASKS = [];

async function main() {
  console.log(`\n=== time-recording flows, end to end against ${BASE} ===\n`);

  // ── sign in ───────────────────────────────────────────────────────────────
  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  if (login.status !== 201 && login.status !== 200) {
    console.error(`Could not sign in as ${EMAIL}: ${login.status} ${JSON.stringify(login.data)}`);
    process.exit(1);
  }
  const me0 = await api('/auth/me');
  const MY_ORG = (me0.data?.user ?? me0.data)?.organizationId;
  const orgs = await api('/organizations');
  // The signed-in user's own org — never index 0. Anything else that creates an organisation
  // (tools/smoke.mjs does) would otherwise retarget the whole suite at a stranger's settings.
  ORG_ID = (orgs.data ?? []).find(o => o.id === MY_ORG)?.id ?? orgs.data?.[0]?.id;
  if (!ORG_ID) { console.error('No organisation found.'); process.exit(1); }

  console.log('— the flow a firm starts on —');
  check('a firm records time with the stopwatch until it says otherwise', orgs.data[0].timeTrackingMode, 'TIMER');

  // Tasks I am actually staffed on — time can only be logged against those.
  const me = await api('/auth/me');
  const MY_ID = me.data?.user?.id ?? me.data?.id ?? login.data?.user?.id;
  if (!MY_ID) { console.error('Could not resolve the signed-in user id.'); process.exit(1); }
  const mine = await api(`/tasks?userId=${MY_ID}`);
  MY_TASKS = (Array.isArray(mine.data) ? mine.data : mine.data?.items ?? [])
    .filter(t => t.currentStatus?.type !== 'CLOSED');
  if (MY_TASKS.length < 2) { console.error(`Need at least 2 open tasks assigned to ${EMAIL}; found ${MY_TASKS.length}.`); process.exit(1); }
  const [A, B] = MY_TASKS;

  // Put the firm back on the stopwatch BEFORE counting, so the suite gives the same answer
  // whether it inherits a database someone left mid-experiment or a fresh one.
  await setMode('TIMER');
  // Switches accumulate across runs, and the endpoint returns a capped page of the newest — so
  // counting rows stops telling you anything once the cap is reached. Remember the newest row
  // instead, and count how many appear in front of it.
  const historyTop = ((await api(`/organizations/${ORG_ID}/time-mode/history`)).data ?? [])[0]?.id ?? null;

  // ── the stopwatch flow works ──────────────────────────────────────────────
  console.log('\n— the stopwatch flow —');
  const started = await api(`/tasks/${A.id}/start`, { method: 'POST' });
  checkThat('a clock can be started', started.status === 201 || started.status === 200, `status ${started.status} ${msg(started)}`);

  const running = await api('/tasks/timer/running');
  checkThat('the clock is running', Array.isArray(running.data) && running.data.some(r => r.taskId === A.id));

  // ── switching away settles what is running ────────────────────────────────
  console.log('\n— switching to writing it down —');
  const toManual = await setMode('MANUAL');
  checkThat('the switch is accepted', toManual.status === 200 || toManual.status === 201, `status ${toManual.status} ${msg(toManual)}`);
  check('it reports the change', toManual.data?.changed, true);
  checkThat('the running clock was stopped, not abandoned', (toManual.data?.timersClosed ?? 0) >= 1,
    `timersClosed=${toManual.data?.timersClosed}`);

  const stillRunning = await api('/tasks/timer/running');
  check('nothing is left running', (stillRunning.data ?? []).length, 0);

  // ── the stopwatch is genuinely gone, not merely hidden ────────────────────
  console.log('\n— the stopwatch is refused, not just hidden —');
  const blocked = await api(`/tasks/${A.id}/start`, { method: 'POST' });
  check('starting a clock is refused', blocked.status, 403);
  checkThat('and it says why, without blaming the person', /records time by filling in the day/i.test(msg(blocked)), msg(blocked));

  const pauseAnyway = await api(`/tasks/${A.id}/pause`, { method: 'POST' });
  checkThat('pausing is still allowed, so an in-flight request can put its own clock down',
    pauseAnyway.status === 200 || pauseAnyway.status === 201, `status ${pauseAnyway.status}`);

  // ── filling in a day ──────────────────────────────────────────────────────
  console.log('\n— filling in a day —');
  const before = await api(`/timesheets?userId=${MY_ID}`);
  const countBefore = Array.isArray(before.data) ? before.data.length : null;

  // The seeded history already fills today, and the 16h cap is real — so clear the day first.
  // The test is about the day sheet, not about how much of today the fixture happened to use.
  for (const t of (before.data ?? []).filter(t => String(t.date).slice(0, 10) === today())) {
    await api(`/timesheets/${t.id}`, { method: 'DELETE' });
  }
  const cleared = await api('/tasks/timer/today');
  checkThat('the day starts empty for this test', (cleared.data?.logged ?? 0) < 0.01,
    `logged=${cleared.data?.logged}`);
  // Counted after the clear-down, so the check is about what the SWITCHES do to history rather
  // than about rows this test removed on purpose.
  const baseline = ((await api(`/timesheets?userId=${MY_ID}`)).data ?? []).length;

  const day = await api('/timesheets/day', {
    method: 'POST',
    body: { date: today(), entries: [
      { taskId: A.id, hoursLogged: 3, notes: 'prior art search' },
      { taskId: B.id, hoursLogged: 2.5, notes: 'drafting' },
    ] },
  });
  checkThat('a day of several tasks saves', day.status === 201 || day.status === 200, `status ${day.status} ${msg(day)}`);
  check('both lines were saved', day.data?.savedCount, 2);
  check('nothing failed', day.data?.failedCount, 0);

  const sameTaskTwice = await api('/timesheets/day', {
    method: 'POST',
    body: { date: today(), entries: [
      { taskId: A.id, hoursLogged: 1, notes: 'morning' },
      { taskId: A.id, hoursLogged: 1, notes: 'afternoon' },
    ] },
  });
  check('the same task twice on one day is two sittings, not a duplicate', sameTaskTwice.data?.savedCount, 2);

  // ── what a day sheet must refuse ──────────────────────────────────────────
  console.log('\n— what a day sheet refuses —');
  const future = await api('/timesheets/day', {
    method: 'POST',
    body: { date: '2099-01-01', entries: [{ taskId: A.id, hoursLogged: 1 }] },
  });
  check('a future date is refused', future.status, 400);

  const overCap = await api('/timesheets/day', {
    method: 'POST',
    body: { date: today(), entries: [{ taskId: A.id, hoursLogged: 9 }, { taskId: B.id, hoursLogged: 9 }] },
  });
  check('more than a day can hold is refused', overCap.status, 400);
  checkThat('and it says how much room is left', /left before the 16h limit|exceed/i.test(msg(overCap)), msg(overCap));

  const empty = await api('/timesheets/day', { method: 'POST', body: { date: today(), entries: [] } });
  check('an empty sheet is refused', empty.status, 400);

  const zero = await api('/timesheets/day', {
    method: 'POST', body: { date: today(), entries: [{ taskId: A.id, hoursLogged: 0 }] },
  });
  check('a line with no hours is refused', zero.status, 400);

  // A task nobody has staffed this person on: the ledger's own rule, still enforced through the
  // day sheet rather than bypassed by it.
  const projects = await api('/projects');
  const someProject = (projects.data ?? [])[0]?.id;
  const all = someProject ? await api(`/tasks?projectId=${someProject}`) : { data: [] };
  const foreign = (Array.isArray(all.data) ? all.data : []).find(t => !MY_TASKS.some(m => m.id === t.id));
  if (foreign) {
    const notMine = await api('/timesheets/day', {
      method: 'POST', body: { date: today(), entries: [{ taskId: foreign.id, hoursLogged: 1 }] },
    });
    checkThat('a task you are not staffed on is refused, per line',
      notMine.data?.failedCount === 1 || notMine.status === 400,
      `status ${notMine.status} ${JSON.stringify(notMine.data?.failed ?? notMine.data)}`);
  }

  // ── provenance survives, and so does everything recorded before ───────────
  console.log('\n— the history holds —');
  const after = await api(`/timesheets?userId=${MY_ID}`);
  const countAfter = Array.isArray(after.data) ? after.data.length : null;
  checkThat('every hour recorded under either flow is still there', countAfter >= baseline,
    `baseline=${baseline} after=${countAfter}`);
  checkThat('and the day sheet is what added to it', countAfter - baseline >= 4,
    `added ${countAfter - baseline}`);

  // ── switching back ────────────────────────────────────────────────────────
  console.log('\n— switching back to the stopwatch —');
  const toTimer = await setMode('TIMER');
  check('the switch back is accepted', toTimer.data?.changed, true);
  check('there were no clocks to stop this time', toTimer.data?.timersClosed, 0);

  const startsAgain = await api(`/tasks/${B.id}/start`, { method: 'POST' });
  checkThat('the stopwatch works again', startsAgain.status === 201 || startsAgain.status === 200, `status ${startsAgain.status}`);
  await api(`/tasks/${B.id}/pause`, { method: 'POST' });

  const asked = await setMode('TIMER');
  check('asking for the mode it is already in is not an error', asked.status, 200);
  check('and it reports that nothing changed', asked.data?.changed, false);

  // ── the record of the switches ────────────────────────────────────────────
  console.log('\n— the record of what changed and when —');
  const history = await api(`/organizations/${ORG_ID}/time-mode/history`);
  // Two REAL switches happened (to manual, back to timer). Asking for the mode it is already in
  // is deliberately not a switch and must not leave a row behind.
  const rows = history.data ?? [];
  const addedThisRun = historyTop === null ? rows.length : rows.findIndex(h => h.id === historyTop);
  check('both real switches are on the record, and the no-ops are not', addedThisRun, 2);
  const leaving = (history.data ?? []).find(h => h.toMode === 'MANUAL');
  checkThat('leaving the stopwatch recorded what it had to stop', (leaving?.timersClosed ?? 0) >= 1,
    JSON.stringify(leaving));

  // ── the hours still add up ────────────────────────────────────────────────
  console.log('\n— the hours still add up —');
  const taskA = await api(`/tasks/${A.id}`);
  const filedOnA = (after.data ?? []).filter(t => t.taskId === A.id && !t.deletedAt)
    .reduce((s, t) => s + (t.hoursLogged ?? 0), 0);
  checkThat('the task carries the ledger total, whichever flow filed it',
    Math.abs((taskA.data?.actualHours ?? 0) - filedOnA) < 0.05,
    `actualHours=${taskA.data?.actualHours} ledger=${filedOnA}`);


  // ── finishing and reopening, which in the manual flow is ALL a person can do ──────────────
  //
  // These were the last paths still untested, and both turned out to be broken in ways that
  // barely showed while the stopwatch existed: with five buttons on a task row, a Reopen that
  // silently did nothing and a Finish that refused a statusless task were annoyances. With two,
  // they are the feature.
  console.log('\n— finishing and reopening with no clock —');
  await setMode('MANUAL');
  const F = MY_TASKS[0];
  await api('/timesheets/day', { method: 'POST', body: { date: today(), entries: [{ taskId: F.id, hoursLogged: 2, notes: 'lifecycle' }] } });

  const stdBefore = (await api('/tasks/standards')).data;
  const fin = await api(`/tasks/${F.id}/finish`, { method: 'POST' });
  checkThat('a task finishes with no clock running', fin.status === 200 || fin.status === 201, `status ${fin.status}`);
  const closedNow = (await api(`/tasks/${F.id}`)).data;
  checkThat('and it really is closed', closedNow.currentStatus?.type === 'CLOSED' || !!closedNow.completedAt,
    JSON.stringify({ type: closedNow.currentStatus?.type, completedAt: closedNow.completedAt }));
  checkThat('the finish measured the FILED hours, there being no clock to measure',
    (fin.data?.settle?.trackedMinutes ?? 0) > 0, `trackedMinutes=${fin.data?.settle?.trackedMinutes}`);
  check('and filed nothing extra, because the hours were already filed', fin.data?.settle?.timesheetHours ?? 0, 0);

  const sizeOf = x => (Array.isArray(x) ? x.length : Object.keys(x ?? {}).length);
  const stdAfter = (await api('/tasks/standards')).data;
  checkThat('the firm still learns how long its work takes', sizeOf(stdAfter) >= sizeOf(stdBefore),
    `before=${sizeOf(stdBefore)} after=${sizeOf(stdAfter)}`);

  const re = await api(`/tasks/${F.id}/reopen`, { method: 'POST' });
  checkThat('a finished task reopens', re.status === 200 || re.status === 201, `status ${re.status}`);
  const openNow = (await api(`/tasks/${F.id}`)).data;
  // Reopening used to clear completedAt and leave the task in its CLOSED status, so every screen
  // still read it as closed and pressing Reopen appeared to do nothing at all.
  checkThat('and it is genuinely open again, not merely un-completed',
    openNow.currentStatus?.type !== 'CLOSED' && !openNow.completedAt,
    JSON.stringify({ type: openNow.currentStatus?.type, completedAt: openNow.completedAt }));

  await api(`/tasks/${F.id}/finish`, { method: 'POST' });
  check('finishing a second time counts once, not twice', sizeOf((await api('/tasks/standards')).data), sizeOf(stdAfter));
  await api(`/tasks/${F.id}/reopen`, { method: 'POST' });

  // A task with a workflow but no status yet — made by the API, an import, or any path that does
  // not name one. Finishing it used to fail with "this task has no completed status in its
  // workflow", which was untrue: the workflow had one, the task was not pointing at it.
  const proj = (await api('/projects')).data?.[0];
  const lists = (await api(`/projects/${proj.id}`)).data?.taskLists ?? [];
  const fresh = await api('/tasks', { method: 'POST', body: {
    title: 'e2e statusless task', projectId: proj.id,
    taskListId: (lists.find(l => l.isDefault) ?? lists[0])?.id, createdBy: MY_ID,
  } });
  if (fresh.data?.id) {
    await api(`/tasks/${fresh.data.id}/staffing`, { method: 'PUT', body: { assignees: [{ userId: MY_ID, role: 'ANALYST', estimatedHours: 2 }] } });
    const finFresh = await api(`/tasks/${fresh.data.id}/finish`, { method: 'POST' });
    checkThat('a task that never had a status can still be finished',
      finFresh.status === 200 || finFresh.status === 201,
      `status ${finFresh.status} :: ${JSON.stringify(finFresh.data).slice(0, 200)}`);
    check('and teaches the estimate nothing, having measured nothing', finFresh.data?.settle?.counted ?? false, false);
    await api(`/tasks/${fresh.data.id}`, { method: 'DELETE' });
  }

  // Somebody who simply forgot to start a clock must still be able to write the day down.
  await setMode('TIMER');
  const catchUp = await api('/timesheets/day', { method: 'POST', body: { date: today(), entries: [{ taskId: F.id, hoursLogged: 0.5, notes: 'catch-up' }] } });
  check('the day sheet works in the stopwatch flow too', catchUp.data?.savedCount, 1);

  // ── report ────────────────────────────────────────────────────────────────
  console.log(`\n${failures.length ? '✗' : '✓'} ${passed} passed, ${failures.length} failed\n`);
  if (failures.length) { failures.forEach(f => console.error(`  ✗ ${f}\n`)); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
