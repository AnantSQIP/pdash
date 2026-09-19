/**
 * The day sheet: the list it puts in front of somebody, and what it does with what they type.
 *
 *   node tools/day-sheet.e2e.mjs      # expects the API on :4011, a SCRATCH database
 *
 * The sheet's whole promise is that nobody has to hunt for their work in a dropdown — so the list
 * has to be right, and it has to be THEIRS. The rest of these check the thing the design cannot
 * solve and can only contain: somebody putting hours against work they did not do. Nothing can
 * know that. What the server can do is refuse the impossible, and it is the refusals that are
 * worth pinning down, because they are the only part not subject to opinion.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4011';
const ADMIN = 'mohit@squarkip.com';
const STAFF = 'divyanshu.saxena@squarkip.com';
const PW = 'sqip@1234';

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);

function sess() {
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
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const daysAgo = n => new Date(Date.now() + 5.5 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
const msg = r => (typeof r.data?.message === 'string' ? r.data.message : JSON.stringify(r.data?.message ?? r.data));

(async () => {
  const admin = sess(), staff = sess();
  await admin('/auth/login', { method: 'POST', body: { email: ADMIN, password: PW } });
  await staff('/auth/login', { method: 'POST', body: { email: STAFF, password: PW } });
  const meA = (await admin('/auth/me')).data; const AID = (meA.user ?? meA).id;
  const meS = (await staff('/auth/me')).data; const SID = (meS.user ?? meS).id;

  // Start from a clean day, so totals are about this run.
  for (const t of ((await admin(`/timesheets?userId=${AID}`)).data ?? []).filter(t => String(t.date).slice(0, 10) === today())) {
    await admin(`/timesheets/${t.id}`, { method: 'DELETE' });
  }

  // ── the list ─────────────────────────────────────────────────────────────
  console.log('\n— the list somebody is shown —');
  const plan = await admin(`/capacity/my-plan?date=${today()}`);
  ok('a plan comes back for today', plan.status === 200, `status ${plan.status} ${msg(plan)}`);
  eq('and it is for the day asked for', plan.data?.date, today());
  eq('today has a plan', plan.data?.hasPlan, true);
  ok('it lists real work', (plan.data?.rows ?? []).length > 0, `${(plan.data?.rows ?? []).length} rows`);
  ok('every row is bucketed as today, tomorrow or other',
     (plan.data?.rows ?? []).every(r => ['TODAY', 'TOMORROW', 'OTHER'].includes(r.when)),
     JSON.stringify([...new Set((plan.data?.rows ?? []).map(r => r.when))]));
  ok('planned work sorts above the rest',
     (() => { const w = (plan.data?.rows ?? []).map(r => r.when); const rank = { TODAY: 0, TOMORROW: 1, OTHER: 2 };
              return w.every((x, i) => i === 0 || rank[w[i - 1]] <= rank[x]); })(),
     (plan.data?.rows ?? []).map(r => r.when).join(','));
  ok('anything bucketed TODAY really is planned for today',
     (plan.data?.rows ?? []).filter(r => r.when === 'TODAY').every(r => r.plannedHours > 0),
     JSON.stringify((plan.data?.rows ?? []).filter(r => r.when === 'TODAY' && !(r.plannedHours > 0)).slice(0, 2)));
  ok('no hours are pre-filled anywhere — the sheet asks, it does not assume',
     (plan.data?.rows ?? []).every(r => typeof r.plannedHours === 'number' && r.loggedToday === 0),
     'loggedToday should be 0 on a cleared day');

  // ── it is YOUR list, and only yours ──────────────────────────────────────
  console.log('\n— it is your list and nobody else\'s —');
  const staffPlan = await staff(`/capacity/my-plan?date=${today()}`);
  ok('somebody else gets their own plan', staffPlan.status === 200, `status ${staffPlan.status}`);
  const adminIds = new Set((plan.data?.rows ?? []).map(r => r.taskId));
  const staffIds = new Set((staffPlan.data?.rows ?? []).map(r => r.taskId));
  ok('and it is a different list', [...staffIds].some(id => !adminIds.has(id)) || staffIds.size !== adminIds.size,
     `admin=${adminIds.size} staff=${staffIds.size}`);
  // There is no userId to supply, so it cannot be aimed at anybody. Prove the extra param is inert.
  const aimed = await staff(`/capacity/my-plan?date=${today()}&userId=${AID}`);
  const aimedIds = new Set((aimed.data?.rows ?? []).map(r => r.taskId));
  ok('and passing somebody else\'s id changes nothing',
     [...aimedIds].every(id => staffIds.has(id)) && aimedIds.size === staffIds.size,
     `aimed=${aimedIds.size} own=${staffIds.size}`);

  // ── days that have no plan, and days that cannot be asked about ──────────
  console.log('\n— days with no plan, and days that make no sense —');
  const past = await admin(`/capacity/my-plan?date=${daysAgo(5)}`);
  ok('a day already gone still answers', past.status === 200, `status ${past.status}`);
  eq('but says it has no plan, rather than inventing one', past.data?.hasPlan, false);
  ok('and offers the open work instead of nothing',
     (past.data?.rows ?? []).length > 0 && (past.data?.rows ?? []).every(r => r.plannedHours === 0),
     `${(past.data?.rows ?? []).length} rows`);
  ok('a missing date is refused', (await admin('/capacity/my-plan')).status === 400);
  ok('a date that is not a date is refused', (await admin('/capacity/my-plan?date=not-a-date')).status === 400);

  // ── what the sheet then saves ────────────────────────────────────────────
  console.log('\n— saving what was typed —');
  const rows = plan.data.rows;
  const planned = rows.find(r => r.when === 'TODAY');
  const other = rows.find(r => r.when === 'OTHER') ?? rows[rows.length - 1];
  const save = await admin('/timesheets/day', { method: 'POST', body: { date: today(), entries: [
    { taskId: planned.taskId, hoursLogged: 2, notes: 'planned work' },
    { taskId: other.taskId, hoursLogged: 1, notes: 'something that came up' },
  ] } });
  eq('both lines save — unplanned work is allowed, not blocked', save.data?.savedCount, 2);
  eq('and nothing failed', save.data?.failedCount, 0);

  const after = await admin(`/capacity/my-plan?date=${today()}`);
  const plannedAfter = (after.data?.rows ?? []).find(r => r.taskId === planned.taskId);
  eq('reopening the sheet shows what is already logged, so it is not typed twice', plannedAfter?.loggedToday, 2);
  ok('and the day total moved by exactly what was saved', Math.abs((after.data?.logged ?? 0) - 3) < 0.01,
     `logged=${after.data?.logged}`);

  // ── the impossible, which is the only part not open to opinion ───────────
  console.log('\n— what cannot be logged, whatever anybody types —');
  const notMine = await staff('/timesheets/day', { method: 'POST', body: { date: today(), entries: [{ taskId: planned.taskId, hoursLogged: 1 }] } });
  ok('hours on somebody else\'s task are refused',
     (notMine.data?.failedCount ?? 0) === 1 || notMine.status >= 400,
     `status ${notMine.status} ${JSON.stringify(notMine.data?.failed ?? notMine.data).slice(0, 140)}`);
  ok('a future day is refused',
     (await admin('/timesheets/day', { method: 'POST', body: { date: '2099-01-01', entries: [{ taskId: planned.taskId, hoursLogged: 1 }] } })).status === 400);
  ok('a day past the backdating window is refused for anybody subject to it',
     (await staff('/timesheets/day', { method: 'POST', body: { date: daysAgo(200), entries: [{ taskId: (staffPlan.data.rows[0] ?? {}).taskId, hoursLogged: 1 }] } })).status >= 400);
  const over = await admin('/timesheets/day', { method: 'POST', body: { date: today(), entries: [
    { taskId: planned.taskId, hoursLogged: 9 }, { taskId: other.taskId, hoursLogged: 9 },
  ] } });
  eq('and a day that would exceed sixteen hours is refused whole', over.status, 400);
  ok('with the hours that are actually left', /left before the 16h limit|exceed/i.test(msg(over)), msg(over));

  console.log(`\n${fails.length ? '✗' : '✓'} ${passed} passed, ${fails.length} failed\n`);
  fails.forEach(f => console.error('  ✗ ' + f + '\n'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
