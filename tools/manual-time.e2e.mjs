/**
 * Time is logged, not clocked — end to end against a REAL API and a REAL database.
 *
 *   BASE=http://127.0.0.1:4031 node tools/manual-time.e2e.mjs      # a SCRATCH database
 *
 * The clients flow retired the stopwatch (Sep 2026). A task has two buttons, Finish and Reopen,
 * and hours go in through ONE Log time: the day sheet (POST /timesheets/day). This suite replaces
 * the two that tested the timer (time-mode.e2e.mjs, timer-flow-untouched.e2e.mjs) and checks:
 *
 *   - the stopwatch is gone from the API, not merely hidden, and cannot be switched back on;
 *   - the day sheet keeps every rule the ledger had (future dates, the 16h day, staffing …);
 *   - Finish closes the task, files nothing by itself, and learns from the hours LOGGED;
 *   - a task finished before its hours were logged is still offered on the sheet, and takes them;
 *   - Reopen really reopens, and the task returns to the open part of the sheet;
 *   - the punch-out check and the catch-up banner no longer talk about clocks.
 *
 * It finishes, reopens and logs time on the signed-in person's tasks, and puts them back open.
 */

const BASE = process.env.BASE || 'http://127.0.0.1:4031';
const EMAIL = process.env.EMAIL || 'mohit@squarkip.com';
const PASSWORD = process.env.PASSWORD || 'sqip@1234';
const PASSCODE = process.env.PASSCODE || 'cf-scratch-7713';

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
const isOk = r => r.status === 200 || r.status === 201;
const sizeOf = x => (Array.isArray(x) ? x.length : Object.keys(x ?? {}).length);

async function main() {
  console.log(`\n=== time is logged, not clocked — against ${BASE} ===\n`);

  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  if (!isOk(login)) { console.error(`Could not sign in as ${EMAIL}: ${login.status} ${msg(login)}`); process.exit(1); }
  const me = (await api('/auth/me')).data;
  const MY_ID = me?.user?.id ?? me?.id;
  const MY_ORG = me?.user?.organizationId ?? me?.organizationId;
  const org = ((await api('/organizations')).data ?? []).find(o => o.id === MY_ORG);
  if (!org) { console.error('No organisation for the signed-in user.'); process.exit(1); }

  const mine = ((await api(`/tasks?userId=${MY_ID}`)).data ?? []).filter(t => t.currentStatus?.type !== 'CLOSED'
    && !['COMPLETED', 'CLOSED'].includes(t.projectTasks?.[0]?.project?.projectPhase));
  if (mine.length < 2) { console.error(`Need 2 open tasks on live clients for ${EMAIL}; found ${mine.length}.`); process.exit(1); }
  const [A, B] = mine;

  // ── the stopwatch is gone ─────────────────────────────────────────────────
  console.log('— the stopwatch is gone, not hidden —');
  check('the firm records time by logging it', org.timeTrackingMode, 'MANUAL');
  check('there is no list of running clocks', (await api('/tasks/timer/running')).status, 404);
  check('there is no clock board for today', (await api('/tasks/timer/today')).status, 404);
  check('a clock cannot be started', (await api(`/tasks/${A.id}/start`, { method: 'POST' })).status, 404);
  check('nor paused', (await api(`/tasks/${A.id}/pause`, { method: 'POST' })).status, 404);
  const toTimer = await api(`/organizations/${org.id}/time-mode`, { method: 'PATCH', body: { mode: 'TIMER' }, passcode: PASSCODE });
  check('and the timer cannot be switched back on', toTimer.status, 400);
  checkThat('saying it was retired', /retired/i.test(msg(toTimer)), msg(toTimer));
  const same = await api(`/organizations/${org.id}/time-mode`, { method: 'PATCH', body: { mode: 'MANUAL' }, passcode: PASSCODE });
  checkThat('asking for the flow it is already in is fine', isOk(same) && same.data?.changed === false, `${same.status} ${msg(same)}`);

  // ── the one Log time: the day sheet ───────────────────────────────────────
  console.log('\n— the day sheet —');
  const beforeRows = (await api(`/timesheets?userId=${MY_ID}`)).data ?? [];
  // The 16h cap is real and the seeded history may already fill today — start the day empty.
  for (const t of beforeRows.filter(t => String(t.date).slice(0, 10) === today())) {
    await api(`/timesheets/${t.id}`, { method: 'DELETE' });
  }
  const plan0 = (await api(`/capacity/my-plan?date=${today()}`)).data;
  checkThat('the sheet opens on an empty day', (plan0?.logged ?? 1) < 0.01, `logged=${plan0?.logged}`);
  checkThat('and lists the open work to log against', (plan0?.rows ?? []).some(r => r.taskId === A.id && !r.closed),
    `${(plan0?.rows ?? []).length} rows`);

  const day = await api('/timesheets/day', { method: 'POST', body: { date: today(), entries: [
    { taskId: A.id, hoursLogged: 3, notes: 'prior art search' },
    { taskId: B.id, hoursLogged: 2.5, notes: 'drafting' },
  ] } });
  checkThat('a day of several tasks saves', isOk(day), `${day.status} ${msg(day)}`);
  check('both lines were saved', day.data?.savedCount, 2);
  const src = ((await api(`/timesheets?userId=${MY_ID}`)).data ?? []).filter(t => String(t.date).slice(0, 10) === today());
  checkThat('each line is recorded as typed in by the person', src.length >= 2 && src.every(t => t.source === 'MANUAL'),
    JSON.stringify(src.map(t => t.source)));

  check('a future date is refused', (await api('/timesheets/day', { method: 'POST', body: { date: '2099-01-01', entries: [{ taskId: A.id, hoursLogged: 1 }] } })).status, 400);
  const overCap = await api('/timesheets/day', { method: 'POST', body: { date: today(), entries: [{ taskId: A.id, hoursLogged: 9 }, { taskId: B.id, hoursLogged: 9 }] } });
  check('more than a day can hold is refused', overCap.status, 400);
  check('an empty sheet is refused', (await api('/timesheets/day', { method: 'POST', body: { date: today(), entries: [] } })).status, 400);
  check('a line with no hours is refused', (await api('/timesheets/day', { method: 'POST', body: { date: today(), entries: [{ taskId: A.id, hoursLogged: 0 }] } })).status, 400);

  // ── Finish: closes, files nothing, learns from what was logged ────────────
  console.log('\n— Finish —');
  const stdBefore = (await api('/tasks/standards')).data;
  const fin = await api(`/tasks/${A.id}/finish`, { method: 'POST' });
  checkThat('a task finishes with one click', isOk(fin), `${fin.status} ${msg(fin)}`);
  const closedA = (await api(`/tasks/${A.id}`)).data;
  checkThat('and it really is closed', closedA.currentStatus?.type === 'CLOSED' && !!closedA.completedAt,
    JSON.stringify({ type: closedA.currentStatus?.type, completedAt: closedA.completedAt }));
  checkThat('Finish measured the hours LOGGED on it', (fin.data?.settle?.trackedMinutes ?? 0) >= 180,
    `trackedMinutes=${fin.data?.settle?.trackedMinutes}`);
  check('and filed nothing by itself', fin.data?.settle?.timesheetHours ?? 0, 0);
  checkThat('the firm still learns how long its work takes', sizeOf((await api('/tasks/standards')).data) >= sizeOf(stdBefore));

  // ── a finished task still takes its hours ─────────────────────────────────
  console.log('\n— hours logged after Finish —');
  const plan1 = (await api(`/capacity/my-plan?date=${today()}`)).data;
  const rowA = (plan1?.rows ?? []).find(r => r.taskId === A.id);
  checkThat('the finished task is still on the sheet', !!rowA, `${(plan1?.rows ?? []).length} rows`);
  checkThat('marked finished, and when', rowA?.closed === true && rowA?.finishedOn === today(), JSON.stringify(rowA ?? null));
  check('with what is already logged on it today', rowA?.loggedToday, 3);
  const actualBefore = (await api(`/tasks/${A.id}`)).data?.actualHours ?? 0;
  const late = await api('/timesheets/day', { method: 'POST', body: { date: today(), entries: [{ taskId: A.id, hoursLogged: 0.5, notes: 'wrap-up' }] } });
  check('and it takes hours after it was finished', late.data?.savedCount, 1);
  // The task's total is everybody's time on it, so compare the MOVE, not the whole figure.
  const actualAfter = (await api(`/tasks/${A.id}`)).data?.actualHours ?? 0;
  checkThat('the task total moves by exactly what was logged', Math.abs(actualAfter - actualBefore - 0.5) < 0.01,
    `before=${actualBefore} after=${actualAfter}`);

  // ── Reopen ────────────────────────────────────────────────────────────────
  console.log('\n— Reopen —');
  const re = await api(`/tasks/${A.id}/reopen`, { method: 'POST' });
  checkThat('a finished task reopens', isOk(re), `${re.status} ${msg(re)}`);
  const openA = (await api(`/tasks/${A.id}`)).data;
  checkThat('and it is genuinely open again', openA.currentStatus?.type !== 'CLOSED' && !openA.completedAt,
    JSON.stringify({ type: openA.currentStatus?.type, completedAt: openA.completedAt }));
  const plan2 = (await api(`/capacity/my-plan?date=${today()}`)).data;
  checkThat('and back among the open work on the sheet', (plan2?.rows ?? []).some(r => r.taskId === A.id && !r.closed));
  const stdMid = sizeOf((await api('/tasks/standards')).data);
  await api(`/tasks/${A.id}/finish`, { method: 'POST' });
  check('finishing a second time counts once, not twice', sizeOf((await api('/tasks/standards')).data), stdMid);
  const reAgain = await api(`/tasks/${A.id}/reopen`, { method: 'POST' });
  checkThat('reopened again, the count goes up', isOk(reAgain) && (reAgain.data?.reopenedCount ?? 0) >= 2,
    JSON.stringify(reAgain.data));
  check('reopening an open task is refused', (await api(`/tasks/${A.id}/reopen`, { method: 'POST' })).status, 400);

  // A task created with no status must still finish.
  const proj = ((await api('/projects')).data ?? []).find(p => !['COMPLETED', 'CLOSED'].includes(p.projectPhase));
  const lists = (await api(`/projects/${proj.id}`)).data?.taskLists ?? [];
  const list = lists.find(l => l.isDefault && l.status !== 'COMPLETED') ?? lists.find(l => l.status !== 'COMPLETED');
  const fresh = await api('/tasks', { method: 'POST', body: { title: `e2e manual-time ${Date.now().toString(36)}`, projectId: proj.id, taskListId: list?.id } });
  if (fresh.data?.id) {
    await api(`/tasks/${fresh.data.id}/staffing`, { method: 'PUT', body: { assignees: [{ userId: MY_ID, role: 'ANALYST', estimatedHours: 2 }] } });
    const f2 = await api(`/tasks/${fresh.data.id}/finish`, { method: 'POST' });
    checkThat('a task that never had a status can still be finished', isOk(f2), `${f2.status} ${msg(f2)}`);
    check('and teaches nothing, nothing being logged on it', f2.data?.settle?.counted ?? false, false);
    await api(`/tasks/${fresh.data.id}`, { method: 'DELETE' });
  } else {
    checkThat('fixture task created', false, `${fresh.status} ${msg(fresh)}`);
  }

  // ── the door and the banner speak about logging, not clocks ───────────────
  console.log('\n— punch-out check and catch-up —');
  const po = await api('/attendance/me/punch-out-check');
  checkThat('the punch-out check answers', isOk(po), `${po.status} ${msg(po)}`);
  checkThat('with no clock hours in it', (po.data?.day?.trackedMinutes ?? 0) === 0 && po.data?.overTracked === false,
    JSON.stringify({ tracked: po.data?.day?.trackedMinutes, over: po.data?.overTracked }));
  const cu = await api('/attendance/me/catch-up');
  checkThat('the catch-up banner has no running clocks to report', isOk(cu) && (cu.data?.running ?? []).length === 0,
    `${cu.status} ${JSON.stringify(cu.data?.running)}`);

  console.log(`\n${failures.length ? '✗' : '✓'} ${passed} passed, ${failures.length} failed\n`);
  if (failures.length) { failures.forEach(f => console.error(`  ✗ ${f}\n`)); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
