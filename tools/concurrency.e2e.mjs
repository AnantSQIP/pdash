/**
 * What happens when the whole firm uses it at once.
 *
 *   node tools/concurrency.e2e.mjs      # expects the API on :4011, a SCRATCH database
 *
 * Every other suite sends one request and waits. That is the shape of test that passes while a
 * product loses data the moment two people press the same button in the same second — and the
 * things this feature touches (a day's total against a cap, one clock per person per task, a
 * setting that closes everybody's clocks) are exactly where that goes wrong.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4011';
const PASSCODE = process.env.PASSCODE || 'cf-scratch-7713';
const PW = 'sqip@1234';

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);

function sess() {
  let cookie = '';
  return async (p, { method = 'GET', body, passcode } = {}) => {
    const r = await fetch(BASE + '/api/v1' + p, {
      method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(passcode ? { 'x-org-passcode': passcode } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const sum = a => a.reduce((s, x) => s + x, 0);

(async () => {
  const admin = sess();
  await admin('/auth/login', { method: 'POST', body: { email: 'mohit@squarkip.com', password: PW } });
  const meA = (await admin('/auth/me')).data; const AID = (meA.user ?? meA).id;
  const MY_ORG = (meA.user ?? meA).organizationId;
  const org = ((await admin('/organizations')).data ?? []).find(o => o.id === MY_ORG);

  const mine = ((await admin(`/tasks?userId=${AID}`)).data ?? []).filter(t => t.currentStatus?.type !== 'CLOSED');
  const A = mine[0];
  if (!A) { console.error('no open task'); process.exit(1); }

  // ── the day cap under a stampede ─────────────────────────────────────────
  //
  // Ten saves of 2h at once against a 16h day. The cap has to hold across all of them: whatever
  // is accepted must total at most 16h, and nothing accepted may be missing afterwards.
  console.log('\n— ten people-worth of saves hitting one day at once —');
  for (const t of ((await admin(`/timesheets?userId=${AID}`)).data ?? []).filter(t => String(t.date).slice(0, 10) === today())) {
    await admin(`/timesheets/${t.id}`, { method: 'DELETE' });
  }
  const dayLogged = async () => (await admin(`/capacity/my-plan?date=${today()}`)).data?.logged ?? 0;
  const before = await dayLogged();
  const saves = await Promise.all(Array.from({ length: 10 }, () =>
    admin('/timesheets/day', { method: 'POST', body: { date: today(), entries: [{ taskId: A.id, hoursLogged: 2, notes: 'stampede' }] } })));
  const acceptedHours = sum(saves.filter(r => (r.data?.savedCount ?? 0) > 0).map(r => r.data.savedCount * 2));
  const after = await dayLogged();

  ok('the day cap is never breached', after <= 16.001, `day now ${after}h`);
  ok('nothing accepted went missing', Math.abs((after - before) - acceptedHours) < 0.01,
     `ledger moved ${(after - before).toFixed(2)}h, responses claimed ${acceptedHours}h`);
  // A sheet is processed row by row, so a save that fits nothing reports failedCount rather than
  // an HTTP error — the day is partly savable in general, and that is the honest shape. What
  // matters is that nothing is dropped in SILENCE: every row is either saved or explained.
  ok('every row is either saved or explained, none dropped silently',
     saves.every(r => r.status >= 400 || ((r.data?.savedCount ?? 0) + (r.data?.failedCount ?? 0)) === 1),
     saves.map(r => `${r.status}:${r.data?.savedCount ?? '-'}/${r.data?.failedCount ?? '-'}`).join(' '));
  ok('and a sheet that saved nothing says so with a reason',
     saves.filter(r => (r.data?.savedCount ?? 0) === 0).every(r => (r.data?.failed ?? []).every(f => !!f.message)),
     JSON.stringify(saves.find(r => (r.data?.savedCount ?? 0) === 0)?.data?.failed ?? null).slice(0, 160));

  // ── Finish and Reopen pressed at once ─────────────────────────────────────
  //
  // The timer is gone (clients flow), so the race worth having is the two buttons a task has
  // left: ten Finish presses on one task, then ten Reopen presses. Each must end in ONE state,
  // with no server error, and the reopen count must move by exactly one.
  console.log('\n— ten Finish presses, then ten Reopen presses, on one task —');
  const fins = await Promise.all(Array.from({ length: 10 }, () => admin(`/tasks/${A.id}/finish`, { method: 'POST' })));
  ok('every Finish press got an answer, none a server error', fins.every(r => r.status < 500), fins.map(r => r.status).join(' '));
  const closedA = (await admin(`/tasks/${A.id}`)).data;
  ok('the task is closed once', closedA.currentStatus?.type === 'CLOSED' && !!closedA.completedAt,
     JSON.stringify({ type: closedA.currentStatus?.type, completedAt: closedA.completedAt }));
  const reopenedBefore = closedA.reopenedCount ?? 0;
  const reopens = await Promise.all(Array.from({ length: 10 }, () => admin(`/tasks/${A.id}/reopen`, { method: 'POST' })));
  ok('every Reopen press got an answer, none a server error', reopens.every(r => r.status < 500), reopens.map(r => r.status).join(' '));
  const openA = (await admin(`/tasks/${A.id}`)).data;
  ok('the task is open again', openA.currentStatus?.type !== 'CLOSED' && !openA.completedAt,
     JSON.stringify({ type: openA.currentStatus?.type, completedAt: openA.completedAt }));
  eq('and it was reopened once, not ten times', (openA.reopenedCount ?? 0) - reopenedBefore, 1);

  // ── the board stays coherent while being hammered ────────────────────────
  console.log('\n— twenty boards read at once —');
  const t0 = Date.now();
  const boards = await Promise.all(Array.from({ length: 20 }, () => admin('/capacity/team?days=30')));
  const ms = Date.now() - t0;
  ok('every read succeeds', boards.every(b => b.status === 200), boards.map(b => b.status).join(' '));
  const shapes = new Set(boards.map(b => (b.data?.rows ?? []).length));
  eq('and they all agree on how many people there are', shapes.size, 1);
  ok('twenty concurrent boards stay under 10s in total', ms < 10000, `${ms}ms`);

  console.log(`\n${fails.length ? '✗' : '✓'} ${passed} passed, ${fails.length} failed\n`);
  fails.forEach(f => console.error('  ✗ ' + f + '\n'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
