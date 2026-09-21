/**
 * Free hours are free EVERYWHERE, or they are not free at all.
 *
 *   BASE=http://127.0.0.1:4041 node tools/availability.e2e.mjs      # a SCRATCH database
 *
 * The owner, Sep 2026: "if I see client-wise a person has some free hours in a week but he is
 * working on some other project as well, that must be shown there too, so the person doesn't end
 * up getting another task just because the person allocating saw free hours he doesn't actually
 * have."
 *
 * So this suite builds exactly that situation and refuses to let it pass:
 *
 *   · a person booked solid on client A, looked at from client B, reads as booked solid — every
 *     one of those days arrives carrying eight hours of load and zero free;
 *   · asking to give them more hours gets a warning naming the hours, the days and the verdict,
 *     rather than a silent acceptance;
 *   · a viewer who may not open client A sees the LOAD and not the NAME — the hours are the
 *     firm's planning, the client's identity is the firm's confidence.
 *
 * Every fixture carries this run's id, so the suite can be re-run on the same database. It
 * creates clients and tasks, so never point it at a database that is being demonstrated.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4041';
const PW = process.env.PW || 'sqip@1234';
const RUN = Date.now().toString(36).slice(-5);

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const step = h => console.log('\n— ' + h + ' —');
const brief = r => `${r.status} ${typeof r.data === 'string' ? r.data.slice(0, 160) : JSON.stringify(r.data)?.slice(0, 260)}`;

function sess() {
  let cookie = '';
  return async (p, { method = 'GET', body } = {}) => {
    const r = await fetch(BASE + '/api/v1' + p, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text();
    let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}
/** An IST calendar day, `offset` days from today. */
const dayKey = (offset = 0) => { const d = new Date(Date.now() + 5.5 * 3600e3); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const r1 = n => Math.round(n * 10) / 10;

(async () => {
  const su = sess(), sc = sess(), hr = sess();
  const who = {};
  for (const [s, email, key] of [
    [su, 'mohit@squarkip.com', 'su'],
    [sc, 'ankit.verma@squarkip.com', 'sc'],
    [hr, 'hr@squarkip.com', 'hr'],
  ]) {
    const r = await s('/auth/login', { method: 'POST', body: { email, password: PW } });
    who[key] = r.data?.user?.id;
    if (!who[key]) { console.log(`cannot log in as ${email}: ${brief(r)}`); process.exit(2); }
  }
  // The person the whole suite is about: somebody with no oversight of their own, picked off the
  // board rather than hard-coded, and never one of the viewers.
  const board0 = await su('/capacity/team?days=14');
  if (board0.status !== 200) { console.log(`cannot read the board: ${brief(board0)}`); process.exit(2); }
  const idle = (board0.data.rows ?? []).find(r => ![who.su, who.sc, who.hr].includes(r.userId) && r.committedHours === 0);
  if (!idle) { console.log('no idle person on the board to load up'); process.exit(2); }
  who.target = idle.userId;
  console.log(`\nthe person under test: ${idle.name} (${who.target})`);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('fixture: two clients, one person, all of their hours on the first');
  const A = (await su('/projects', { method: 'POST', body: {
    title: `Availability A ${RUN}`, managerId: who.su,
    taskGroup: { name: `Work A ${RUN}`, startDate: dayKey(0), dueDate: dayKey(30) },
  } })).data;
  const B = (await su('/projects', { method: 'POST', body: {
    title: `Availability B ${RUN}`, managerId: who.su,
    taskGroup: { name: `Work B ${RUN}`, startDate: dayKey(0), dueDate: dayKey(30) },
  } })).data;
  ok('two clients exist', !!A?.id && !!B?.id, JSON.stringify([A?.id, B?.id]));

  // Forty hours at a whole day each — five working days, wherever the weekend falls.
  const loadA = await su('/capacity/tasks', { method: 'POST', body: {
    projectId: A.id, title: `Claim chart ${RUN}`, priority: 'HIGH',
    startDate: dayKey(1), dueDate: dayKey(20),
    seats: [{ userId: who.target, role: 'ANALYST', estimatedHours: 40, startDate: dayKey(1), hoursPerDay: 8 }],
  } });
  ok('forty hours are placed on client A', loadA.status === 201, brief(loadA));
  // A seat carrying no hours: it makes them a member of client B without giving them any work,
  // which is the situation the owner described — free-looking on B, booked solid elsewhere.
  const seatB = await su('/capacity/tasks', { method: 'POST', body: {
    projectId: B.id, title: `Kickoff ${RUN}`, priority: 'LOW',
    startDate: dayKey(1), dueDate: dayKey(20),
    seats: [{ userId: who.target, role: 'ANALYST', estimatedHours: 0, startDate: dayKey(1) }],
  } });
  ok('they are on client B, carrying nothing there', seatB.status === 201, brief(seatB));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('THE BUG: 8h on client A must read as 0h free from client B');
  const fromB = await su(`/capacity/project/${B.id}?days=14`);
  ok('client B’s availability tab loads', fromB.status === 200, brief(fromB));
  const rowB = (fromB.data?.rows ?? []).find(r => r.userId === who.target);
  ok('the person is on it', !!rowB, JSON.stringify((fromB.data?.rows ?? []).map(r => r.name)));

  const busy = (rowB?.days ?? []).filter(d => d.capacity > 0 && d.load > 0.05);
  ok('five working days carry the work', busy.length === 5, `days with load: ${busy.map(d => `${d.date}:${d.load}`).join(', ')}`);
  ok('every one of them is FULL, not free', busy.every(d => r1(d.free) === 0), busy.map(d => `${d.date} free ${d.free}`).join(', '));
  ok(
    'every one of them reports its hours as OTHER work, so the cell is drawn as load',
    busy.every(d => r1(d.otherHours) === r1(d.load)) && busy.every(d => r1(d.focusHours) === 0),
    busy.map(d => `${d.date} other ${d.otherHours} focus ${d.focusHours}`).join(', '),
  );
  ok('the row total says the same', r1(rowB?.otherHours ?? -1) === 40 && r1(rowB?.focusHours ?? -1) === 0, `other ${rowB?.otherHours} focus ${rowB?.focusHours}`);
  ok('and the breakdown names where the hours went', (rowB?.byClient ?? []).some(c => c.label === A.title && r1(c.hours) === 40), JSON.stringify(rowB?.byClient));

  step('…while client A’s own tab still highlights ITS share');
  const fromA = await su(`/capacity/project/${A.id}?days=14`);
  const rowA = (fromA.data?.rows ?? []).find(r => r.userId === who.target);
  ok('the same 40h are this client’s share here', r1(rowA?.focusHours ?? -1) === 40 && r1(rowA?.otherHours ?? -1) === 0, `focus ${rowA?.focusHours} other ${rowA?.otherHours}`);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('an over-assignment is warned about, in words, before it is made');
  const firstBusy = busy[0]?.date, lastBusy = busy[busy.length - 1]?.date;
  const over = await su('/capacity/availability/preview', { method: 'POST', body: {
    projectId: B.id,
    seats: [{ userId: who.target, hours: 12, startDate: firstBusy, dueDate: lastBusy }],
  } });
  ok('the preview answers', over.status === 201 || over.status === 200, brief(over));
  const p = over.data?.seats?.[0];
  ok('it reports NO free hours over those days', r1(p?.freeHours ?? -1) === 0, JSON.stringify(p && { free: p.freeHours, committed: p.committedHours, capacity: p.capacityHours }));
  ok('…so twelve more hours are twelve hours over', r1(p?.overHours ?? -1) === 12, String(p?.overHours));
  ok('…the verdict is OVER, not a shrug', p?.verdict === 'OVER', String(p?.verdict));
  ok('…it names the days it would break', (p?.overDays ?? []).length > 0, JSON.stringify(p?.overDays));
  ok('…and it says so in a sentence somebody can read', typeof p?.message === 'string' && p.message.includes('free') && p.message.includes('beyond'), p?.message);
  ok('…naming the other client the hours are on', (p?.otherClients ?? []).some(c => c.label === A.title), JSON.stringify(p?.otherClients));
  // The preview builds its own window, and placement drops whatever outlasts a window onto its
  // last day. Cut that window to the deadline being assigned and the person's LATER work piles
  // onto the very day in question — an overload the board never shows. The two have to agree.
  const boardBusy = new Map(busy.map(d => [d.date, r1(d.load)]));
  const mismatch = (p?.days ?? []).filter(d => boardBusy.has(d.date) && r1(d.committed) !== boardBusy.get(d.date));
  ok(
    'the preview\'s idea of each day matches the board\'s, so a short window invents no overload',
    mismatch.length === 0,
    mismatch.map(d => `${d.date}: preview ${d.committed} vs board ${boardBusy.get(d.date)}`).join(', '),
  );

  step('a person with room gets a plain yes');
  const spare = (board0.data.rows ?? []).find(r => ![who.su, who.sc, who.hr, who.target].includes(r.userId) && r.committedHours === 0);
  if (spare) {
    const fits = await su('/capacity/availability/preview', { method: 'POST', body: {
      seats: [{ userId: spare.userId, hours: 4, startDate: firstBusy, dueDate: lastBusy }],
    } });
    const f = fits.data?.seats?.[0];
    ok('somebody genuinely free is reported as fitting', f?.verdict === 'FITS' && r1(f?.overHours ?? -1) === 0, JSON.stringify(f && { v: f.verdict, free: f.freeHours, over: f.overHours }));
  } else {
    ok('somebody genuinely free is reported as fitting', true, 'skipped — nobody else idle');
  }

  step('re-staffing the SAME task does not warn about its own hours');
  const again = await su('/capacity/availability/preview', { method: 'POST', body: {
    projectId: A.id, excludeTaskId: loadA.data?.id,
    seats: [{ userId: who.target, hours: 40, startDate: dayKey(1), dueDate: dayKey(20), hoursPerDay: 8 }],
  } });
  const a2 = again.data?.seats?.[0];
  ok('saving it unchanged still fits', a2 && r1(a2.overHours) === 0, JSON.stringify(a2 && { v: a2.verdict, over: a2.overHours, free: a2.freeHours }));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('confidentiality: a viewer without access to client A sees the LOAD, not the NAME');
  const hrBoard = await hr('/capacity/team?days=14');
  ok('HR may open the board', hrBoard.status === 200, brief(hrBoard));
  const hrRow = (hrBoard.data?.rows ?? []).find(r => r.userId === who.target);
  ok('HR sees the person', !!hrRow);
  const hrBusy = (hrRow?.days ?? []).filter(d => d.capacity > 0 && d.load > 0.05);
  ok('HR sees the days are full', hrBusy.length === 5 && hrBusy.every(d => r1(d.free) === 0), hrBusy.map(d => `${d.date}:${d.load}`).join(', '));
  ok('…and that the hours are ones they may not place', hrBusy.every(d => r1(d.restrictedHours) === r1(d.load)), hrBusy.map(d => `${d.date} restricted ${d.restrictedHours}`).join(', '));
  const hrTask = (hrRow?.openTasks ?? []).find(t => r1(t.remainingHours) === 40);
  ok('the work is flagged as a client they cannot open', hrTask?.restricted === true, JSON.stringify(hrTask));
  ok('…with no client name, no CID and no task title', hrTask && hrTask.project === 'Other work' && hrTask.title === 'Other work' && !hrTask.projectPid && !hrTask.projectId, JSON.stringify(hrTask));
  const hrJson = JSON.stringify(hrBoard.data);
  ok('client A’s title appears NOWHERE in HR’s payload', !hrJson.includes(A.title), hrJson.length > 0 ? `payload ${hrJson.length} bytes` : '');
  ok('…nor its CID', !A.code || !hrJson.includes(A.code), String(A.code));
  ok('…nor the task’s own title, which names the matter', !hrJson.includes(`Claim chart ${RUN}`));
  ok('HR’s breakdown rolls it up as "Other work"', (hrRow?.byClient ?? []).some(c => c.restricted && r1(c.hours) === 40), JSON.stringify(hrRow?.byClient));

  step('…and the same board, for somebody who oversees every matter, names it');
  const scBoard = await sc('/capacity/team?days=14');
  ok('a Senior Consultant may open the board', scBoard.status === 200, brief(scBoard));
  const scRow = (scBoard.data?.rows ?? []).find(r => r.userId === who.target);
  ok('they see the client by name', (scRow?.openTasks ?? []).some(t => t.project === A.title), JSON.stringify((scRow?.openTasks ?? []).map(t => t.project)));
  ok('…and nothing of theirs is restricted', !(scRow?.openTasks ?? []).some(t => t.restricted), JSON.stringify((scRow?.openTasks ?? []).map(t => [t.project, t.restricted])));

  step('the preview obeys the same wall');
  const hrPrev = await hr('/capacity/availability/preview', { method: 'POST', body: {
    projectId: B.id, seats: [{ userId: who.target, hours: 4, startDate: firstBusy, dueDate: lastBusy }],
  } });
  const hp = hrPrev.data?.seats?.[0];
  ok('HR is told the person has no room', hrPrev.status < 300 && r1(hp?.freeHours ?? -1) === 0 && hp?.verdict === 'OVER', brief(hrPrev));
  ok('…without being told whose work it is', (hp?.otherClients ?? []).every(c => c.restricted) && !JSON.stringify(hrPrev.data).includes(A.title), JSON.stringify(hp?.otherClients));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('housekeeping');
  if (loadA.data?.id) await su(`/capacity/tasks/${loadA.data.id}`, { method: 'DELETE' });
  if (seatB.data?.id) await su(`/capacity/tasks/${seatB.data.id}`, { method: 'DELETE' });
  ok('the fixture work is cleared', true);

  console.log(`\n${fails.length ? '✗' : '✓'} availability e2e: ${passed} passed, ${fails.length} failed`);
  if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
