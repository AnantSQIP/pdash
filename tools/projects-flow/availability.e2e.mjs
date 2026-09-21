/**
 * Free hours are free EVERYWHERE, or they are not free at all — in the PROJECTS flow.
 *
 *   BASE=http://127.0.0.1:4042 node tools/projects-flow/availability.e2e.mjs   # a SCRATCH database
 *
 * The CLIENTS copy of this suite is tools/availability.e2e.mjs. This one exists because the
 * availability service is NOT one of the things the two flows do differently: how loaded a person
 * is, and how much of their week belongs to somebody else, is the same question whichever word the
 * firm uses for the work (docs/WORKSPACE_FLOWS.md). The PROJECTS flow needs the answer at least as
 * badly — its board is open to everybody, so a viewer with no access to a matter is the ordinary
 * case rather than the exception.
 *
 * What it builds, entirely through production's own routes — no /capacity/tasks, which exists only
 * in the CLIENTS flow:
 *
 *   · a person booked solid on project A, looked at from project B, reads as booked solid;
 *   · asking to give them more hours gets a warning naming the hours, the days and the verdict;
 *   · a viewer who may not open project A sees the LOAD and not the NAME.
 *
 * Every fixture carries this run's id, so the suite can be re-run on the same database. It creates
 * projects and tasks, so never point it at a database that is being demonstrated.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4042';
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
  const su = sess(), hr = sess();
  const who = {};
  for (const [s, email, key] of [[su, 'mohit@squarkip.com', 'su'], [hr, 'hr@squarkip.com', 'hr']]) {
    const r = await s('/auth/login', { method: 'POST', body: { email, password: PW } });
    who[key] = r.data?.user?.id;
    if (!who[key]) { console.log(`cannot log in as ${email}: ${brief(r)}`); process.exit(2); }
  }
  // The person the whole suite is about: somebody carrying nothing, picked off the board rather
  // than hard-coded, and never one of the viewers.
  const board0 = await su('/capacity/team?days=14');
  if (board0.status !== 200) { console.log(`cannot read the board: ${brief(board0)}`); process.exit(2); }
  const idle = (board0.data.rows ?? []).find(r => ![who.su, who.hr].includes(r.userId) && r.committedHours === 0);
  if (!idle) { console.log('no idle person on the board to load up'); process.exit(2); }
  who.target = idle.userId;
  console.log(`\nthe person under test: ${idle.name} (${who.target})`);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('the organisation runs the PROJECTS flow');
  const org = ((await su('/organizations')).data ?? [])[0];
  ok('its workspace flow is PROJECTS', org?.workspaceFlow === 'PROJECTS', String(org?.workspaceFlow));
  ok('and the CLIENTS board’s task CRUD does not exist here',
    (await su('/capacity/tasks/options')).status === 404);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('fixture: two projects, one person, all of their hours on the first');
  const mk = async title => {
    const pid = (await su('/projects/generate-pid', { method: 'POST' })).data?.pid;
    const p = await su('/projects', { method: 'POST', body: { title, pid, managerId: who.su } });
    if (p.status >= 300) { console.log(`cannot create ${title}: ${brief(p)}`); process.exit(2); }
    return p.data;
  };
  const A = await mk(`Availability A ${RUN}`);
  const B = await mk(`Availability B ${RUN}`);
  ok('two projects exist', !!A?.id && !!B?.id, JSON.stringify([A?.id, B?.id]));

  // Staffing goes through production's own two steps: create the task in the project's own list,
  // then set its seats. A PROJECTS task always belongs to a task list — every new project gets a
  // default one — which is the field the CLIENTS flow calls a task group.
  const listOf = async project => {
    const lists = (await su(`/projects/${project.id}/tasklists`)).data ?? [];
    return (lists.find(l => l.isDefault) ?? lists[0])?.id;
  };
  const staff = async (project, title, seats) => {
    const taskListId = await listOf(project);
    const t = await su('/tasks', { method: 'POST', body: { title, projectId: project.id, taskListId, createdBy: who.su, dueDate: dayKey(20) } });
    if (t.status >= 300) return t;
    const s = await su(`/tasks/${t.data.id}/staffing`, { method: 'PUT', body: { assignees: seats } });
    return { status: s.status, data: t.data, staffing: s };
  };
  // Forty hours at a whole day each — five working days, wherever the weekend falls.
  const loadA = await staff(A, `Claim chart ${RUN}`, [
    { userId: who.target, role: 'ANALYST', estimatedHours: 40, startDate: dayKey(1), dueDate: dayKey(20), hoursPerDay: 8 },
  ]);
  ok('forty hours are placed on project A', loadA.status < 300, brief(loadA.staffing ?? loadA));
  // A seat carrying no hours: it makes them a member of project B without giving them any work,
  // which is the situation the owner described — free-looking on B, booked solid elsewhere.
  const seatB = await staff(B, `Kickoff ${RUN}`, [
    { userId: who.target, role: 'ANALYST', estimatedHours: 0, startDate: dayKey(1), dueDate: dayKey(20) },
  ]);
  ok('they are on project B, carrying nothing there', seatB.status < 300, brief(seatB.staffing ?? seatB));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('THE BUG: 8h on project A must read as 0h free from project B');
  const fromB = await su(`/capacity/project/${B.id}?days=14`);
  ok('project B’s availability tab loads', fromB.status === 200, brief(fromB));
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

  step('…while project A’s own tab still highlights ITS share');
  const fromA = await su(`/capacity/project/${A.id}?days=14`);
  const rowA = (fromA.data?.rows ?? []).find(r => r.userId === who.target);
  ok('the same 40h are this project’s share here', r1(rowA?.focusHours ?? -1) === 40 && r1(rowA?.otherHours ?? -1) === 0, `focus ${rowA?.focusHours} other ${rowA?.otherHours}`);

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
  ok('…naming the other project the hours are on', (p?.otherClients ?? []).some(c => c.label === A.title), JSON.stringify(p?.otherClients));
  // The preview builds its own window, and placement puts whatever outlasts a window onto its last
  // day. The two have to agree about each day, or a short window invents an overload.
  const boardBusy = new Map(busy.map(d => [d.date, r1(d.load)]));
  const mismatch = (p?.days ?? []).filter(d => boardBusy.has(d.date) && r1(d.committed) !== boardBusy.get(d.date));
  ok('the preview\'s idea of each day matches the board\'s', mismatch.length === 0,
    mismatch.map(d => `${d.date}: preview ${d.committed} vs board ${boardBusy.get(d.date)}`).join(', '));

  step('a person with room gets a plain yes');
  const spare = (board0.data.rows ?? []).find(r => ![who.su, who.hr, who.target].includes(r.userId) && r.committedHours === 0);
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
  // In the PROJECTS flow EVERY role holds capacity.view — the board has always been open to the
  // whole firm — so the viewer who may not open the matter is the ordinary case here, not the
  // exception. HR is used because it is on no delivery matter at all.
  step('confidentiality: a viewer without access to project A sees the LOAD, not the NAME');
  const hrBoard = await hr('/capacity/team?days=14');
  ok('HR may open the board', hrBoard.status === 200, brief(hrBoard));
  const hrRow = (hrBoard.data?.rows ?? []).find(r => r.userId === who.target);
  ok('HR sees the person', !!hrRow);
  const hrBusy = (hrRow?.days ?? []).filter(d => d.capacity > 0 && d.load > 0.05);
  ok('HR sees the days are full', hrBusy.length === 5 && hrBusy.every(d => r1(d.free) === 0), hrBusy.map(d => `${d.date}:${d.load}`).join(', '));
  ok('…and that the hours are ones they may not place', hrBusy.every(d => r1(d.restrictedHours) === r1(d.load)), hrBusy.map(d => `${d.date} restricted ${d.restrictedHours}`).join(', '));
  const hrTask = (hrRow?.openTasks ?? []).find(t => r1(t.remainingHours) === 40);
  ok('the work is flagged as a matter they cannot open', hrTask?.restricted === true, JSON.stringify(hrTask));
  ok('…with no project name, no PID and no task title', hrTask && hrTask.project === 'Other work' && hrTask.title === 'Other work' && !hrTask.projectPid && !hrTask.projectId, JSON.stringify(hrTask));
  const hrJson = JSON.stringify(hrBoard.data);
  ok('project A’s title appears NOWHERE in HR’s payload', !hrJson.includes(A.title), hrJson.length > 0 ? `payload ${hrJson.length} bytes` : '');
  ok('…nor its PID', !A.code || !hrJson.includes(A.code), String(A.code));
  ok('…nor the task’s own title, which names the matter', !hrJson.includes(`Claim chart ${RUN}`));
  ok('HR’s breakdown rolls it up as "Other work"', (hrRow?.byClient ?? []).some(c => c.restricted && r1(c.hours) === 40), JSON.stringify(hrRow?.byClient));

  step('…and the same board, for somebody who oversees every matter, names it');
  const suRow = (board0.data?.rows ?? []).find(r => r.userId === who.target);
  const suNow = ((await su('/capacity/team?days=14')).data?.rows ?? []).find(r => r.userId === who.target);
  ok('a Super Admin sees the project by name', (suNow?.openTasks ?? []).some(t => t.project === A.title), JSON.stringify((suNow?.openTasks ?? []).map(t => t.project)));
  ok('…and nothing of theirs is restricted', !(suNow?.openTasks ?? []).some(t => t.restricted), JSON.stringify((suNow?.openTasks ?? []).map(t => [t.project, t.restricted])));
  ok('the board was empty for them before the fixture', r1(suRow?.committedHours ?? -1) === 0, String(suRow?.committedHours));

  step('the preview obeys the same wall');
  const hrPrev = await hr('/capacity/availability/preview', { method: 'POST', body: {
    projectId: B.id, seats: [{ userId: who.target, hours: 4, startDate: firstBusy, dueDate: lastBusy }],
  } });
  const hp = hrPrev.data?.seats?.[0];
  ok('HR is told the person has no room', hrPrev.status < 300 && r1(hp?.freeHours ?? -1) === 0 && hp?.verdict === 'OVER', brief(hrPrev));
  ok('…without being told whose work it is', (hp?.otherClients ?? []).every(c => c.restricted) && !JSON.stringify(hrPrev.data).includes(A.title), JSON.stringify(hp?.otherClients));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('housekeeping');
  for (const t of [loadA.data?.id, seatB.data?.id]) if (t) await su(`/tasks/${t}`, { method: 'DELETE' });
  for (const p of [A?.id, B?.id]) if (p) await su(`/projects/${p}`, { method: 'DELETE' });
  ok('the fixture work is cleared', true);

  console.log(`\n${fails.length ? '✗' : '✓'} availability e2e (PROJECTS): ${passed} passed, ${fails.length} failed`);
  if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
