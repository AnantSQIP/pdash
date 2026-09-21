/**
 * Team Capacity: who may see it, and task CRUD from the board (capacity.manage).
 *
 *   BASE=http://127.0.0.1:4033 node tools/capacity-crud.e2e.mjs      # a SCRATCH database
 *
 * The owner, Sep 2026: CRUD on tasks from Team Capacity, assigning anyone any time, for people at
 * or above Senior Consultant — and the module visible only to them. So this pins both halves:
 *
 *   · the wall — Consultant, Senior Research Associate, Employee and Business Development are
 *     refused the board and every /capacity/tasks route, while /capacity/my-plan (the My Tasks day
 *     sheet) keeps working for all of them; /me/effective-permissions says the same thing.
 *     HR is the exception the owner made on 19 Sep 2026: HR may READ the board — who is loaded and
 *     who is free is a people question — but may not create, edit or delete a thing on it.
 *   · the power — a Senior Consultant creates a task with its people in ONE call for somebody who
 *     is not on the client (who is added to it), edits it, moves it between groups, reassigns it and
 *     deletes it; a refused seat leaves NOTHING behind; a task due after its group is refused in words.
 *
 * Every fixture carries this run's id, so the suite can be re-run on the same database. It creates a
 * client, so never point it at a database that is being demonstrated.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4033';
const PW = process.env.PW || 'sqip@1234';
const RUN = Date.now().toString(36).slice(-5);

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const step = h => console.log('\n— ' + h + ' —');
const brief = r => `${r.status} ${typeof r.data === 'string' ? r.data.slice(0, 160) : JSON.stringify(r.data)?.slice(0, 240)}`;

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

(async () => {
  const su = sess(), sc = sess(), sra = sess(), con = sess(), emp = sess(), hr = sess(), bd = sess();
  const who = {};
  for (const [s, email, key] of [
    [su, 'mohit@squarkip.com', 'su'], [sc, 'ankit.verma@squarkip.com', 'sc'],
    [sra, 'ketan.dagar@squarkip.com', 'sra'], [con, 'meetu.singh@squarkip.com', 'con'],
    [emp, 'poorvi.gupta@squarkip.com', 'emp'], [hr, 'hr@squarkip.com', 'hr'], [bd, 'ritik.sharma@squarkip.com', 'bd'],
  ]) {
    const r = await s('/auth/login', { method: 'POST', body: { email, password: PW } });
    who[key] = r.data?.user?.id;
    if (!who[key]) { console.log(`cannot log in as ${email}: ${brief(r)}`); process.exit(2); }
  }
  const below = [['Senior Research Associate', sra], ['Consultant', con], ['Employee', emp], ['Business Development', bd]];

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('who holds the board: /me/effective-permissions');
  const codesOf = async s => new Set(((await s('/me/effective-permissions')).data?.codes ?? []));
  for (const [label, s] of [['Super Admin', su], ['Senior Consultant', sc]]) {
    const c = await codesOf(s);
    ok(`${label} holds capacity.view and capacity.manage`, c.has('capacity.view') && c.has('capacity.manage'), [...c].filter(x => x.startsWith('capacity')).join(','));
  }
  for (const [label, s] of below) {
    const c = await codesOf(s);
    ok(`${label} holds neither`, !c.has('capacity.view') && !c.has('capacity.manage'), [...c].filter(x => x.startsWith('capacity')).join(','));
  }
  const hrCodes = await codesOf(hr);
  ok('HR reads the board but manages nothing on it',
    hrCodes.has('capacity.view') && !hrCodes.has('capacity.manage'), [...hrCodes].filter(x => x.startsWith('capacity')).join(','));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('fixture: a client with two task groups');
  const groupDue = dayKey(20), laterGroupDue = dayKey(40);
  const cr = await su('/projects', { method: 'POST', body: {
    title: `Capacity CRUD ${RUN}`, managerId: who.sc,
    taskGroup: { name: `Main ${RUN}`, startDate: dayKey(0), dueDate: groupDue },
  } });
  ok('a Super Admin creates the client', cr.status === 201 && !!cr.data?.id, brief(cr));
  const client = cr.data;
  const groups = (await su(`/projects/${client.id}/tasklists`)).data ?? [];
  const main = groups.find(g => g.name === `Main ${RUN}`);
  const deflt = groups.find(g => g.isDefault);
  ok('it has the named group and a default group', !!main && !!deflt, JSON.stringify(groups.map(g => [g.name, g.isDefault])));
  const g2r = await su(`/projects/${client.id}/tasklists`, { method: 'POST', body: { name: `Later ${RUN}`, dueDate: laterGroupDue } });
  ok('a second, later group is added', g2r.status === 201 && !!g2r.data?.id, brief(g2r));
  const later = g2r.data;

  const memberIds = async () => {
    const p = (await su(`/projects/${client.id}`)).data;
    return new Set((p?.members ?? []).filter(m => m.isActive !== false).map(m => m.userId ?? m.user?.id));
  };
  const before = await memberIds();
  ok('the employee we will assign is NOT on the client', !before.has(who.emp), [...before].join(','));
  ok('nor is the consultant we will hand it to', !before.has(who.con));
  ok('nor is the SRA used for the atomicity case', !before.has(who.sra));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('the wall: below Senior Consultant, no board and no task CRUD');
  for (const [label, s] of below) {
    ok(`${label}: GET /capacity/team is refused`, (await s('/capacity/team?days=7')).status === 403);
    ok(`${label}: GET /capacity/project/:id is refused`, (await s(`/capacity/project/${client.id}?days=7`)).status === 403);
    ok(`${label}: GET /capacity/coverage-risks is refused`, (await s('/capacity/coverage-risks')).status === 403);
    const routes = [
      ['GET', '/capacity/tasks/options'],
      ['GET', '/capacity/tasks/whatever'],
      ['POST', '/capacity/tasks', { projectId: client.id, title: `Nope ${RUN}`, seats: [] }],
      ['PATCH', '/capacity/tasks/whatever', { title: 'x' }],
      ['PUT', '/capacity/tasks/whatever/seats', { seats: [] }],
      ['DELETE', '/capacity/tasks/whatever'],
    ];
    const statuses = [];
    for (const [method, path, body] of routes) statuses.push((await s(path, { method, body })).status);
    ok(`${label}: every /capacity/tasks route is refused`, statuses.every(x => x === 403), statuses.join(','));
    const plan = await s(`/capacity/my-plan?date=${dayKey(0)}`);
    ok(`${label}: /capacity/my-plan still works`, plan.status === 200, brief(plan));
  }
  ok('the Senior Consultant sees the board', (await sc('/capacity/team?days=7')).status === 200);
  ok('…and my-plan works for them too', (await sc(`/capacity/my-plan?date=${dayKey(0)}`)).status === 200);

  // HR reads the board — the owner's amendment — but the wall on CHANGING it still holds for them.
  ok('HR sees the board', (await hr('/capacity/team?days=7')).status === 200);
  ok('…and one client\'s view of it', (await hr(`/capacity/project/${client.id}?days=7`)).status === 200);
  const hrWrites = [];
  for (const [method, path, body] of [
    ['POST', '/capacity/tasks', { projectId: client.id, title: `HR nope ${RUN}`, seats: [] }],
    ['PATCH', '/capacity/tasks/whatever', { title: 'x' }],
    ['PUT', '/capacity/tasks/whatever/seats', { seats: [] }],
    ['DELETE', '/capacity/tasks/whatever'],
  ]) hrWrites.push((await hr(path, { method, body })).status);
  ok('…but cannot create, edit, reassign or delete anything on it', hrWrites.every(x => x === 403), hrWrites.join(','));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('the editor’s choices');
  const opts = await sc('/capacity/tasks/options');
  ok('options load for a Senior Consultant', opts.status === 200, brief(opts));
  const optClient = opts.data?.clients?.find(c => c.id === client.id);
  ok('the fixture client is offered, with its groups', !!optClient && optClient.taskLists.some(g => g.id === later.id), JSON.stringify(optClient)?.slice(0, 200));
  ok('the date promised to the client is never in a picker', !JSON.stringify(opts.data).includes('clientDueDate'));
  ok('every active person is offered, not only client members', opts.data?.people?.some(p => p.id === who.emp) && opts.data?.people?.some(p => p.id === who.hr));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('create a task with its people in one call');
  const title = `Prior-art sweep ${RUN}`;
  const created = await sc('/capacity/tasks', { method: 'POST', body: {
    projectId: client.id, taskListId: main.id, title, priority: 'HIGH',
    startDate: dayKey(1), dueDate: dayKey(10),
    seats: [{ userId: who.emp, role: 'ANALYST', estimatedHours: 6, startDate: dayKey(1), hoursPerDay: 3 }],
  } });
  ok('a Senior Consultant creates it for somebody NOT on the client', created.status === 201, brief(created));
  const task = created.data;
  ok('it carries its seat', task?.assignees?.length === 1 && task.assignees[0].userId === who.emp && task.assignees[0].estimatedHours === 6, JSON.stringify(task?.assignees));
  ok('its estimate is the sum of its seats', task?.estimatedHours === 6, String(task?.estimatedHours));
  ok('it sits in the chosen group', task?.projectTasks?.[0]?.taskListId === main.id);
  ok('the person was added to the client', (await memberIds()).has(who.emp));
  const board = await sc('/capacity/team?days=14');
  const empRow = board.data?.rows?.find(r => r.userId === who.emp);
  ok('the task shows on GET /capacity/team, on their row', !!empRow?.openTasks?.some(t => t.id === task.id), JSON.stringify(empRow?.openTasks?.map(t => t.title))?.slice(0, 200));
  const read = await sc(`/capacity/tasks/${task.id}`);
  ok('and reads back through the board’s own route', read.status === 200 && read.data?.title === title, brief(read));

  const noGroup = await sc('/capacity/tasks', { method: 'POST', body: { projectId: client.id, title: `Default ${RUN}`, seats: [] } });
  ok('with no group named, a task lands in the client’s default group', noGroup.status === 201 && noGroup.data?.projectTasks?.[0]?.taskListId === deflt.id, brief(noGroup));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('edit, move, reassign, delete');
  const newTitle = `${title} (revised)`;
  const ed = await sc(`/capacity/tasks/${task.id}`, { method: 'PATCH', body: { title: newTitle, startDate: dayKey(2), dueDate: dayKey(12), priority: 'CRITICAL' } });
  ok('title, dates and priority are edited', ed.status === 200 && ed.data?.title === newTitle && ed.data?.priority === 'CRITICAL'
    && String(ed.data?.dueDate).slice(0, 10) === dayKey(12) && String(ed.data?.startDate).slice(0, 10) === dayKey(2), brief(ed));

  const late = await sc(`/capacity/tasks/${task.id}`, { method: 'PATCH', body: { dueDate: dayKey(30) } });
  ok('a deadline past its group’s is refused, in words', late.status === 400 && /cannot be due later/i.test(late.data?.message ?? ''), brief(late));
  const moved = await sc(`/capacity/tasks/${task.id}`, { method: 'PATCH', body: { dueDate: dayKey(30), taskListId: later.id } });
  ok('…but the same date is accepted when the task moves to a later group in the same save', moved.status === 200 && String(moved.data?.dueDate).slice(0, 10) === dayKey(30), brief(moved));
  const afterMove = (await sc(`/capacity/tasks/${task.id}`)).data;
  ok('…and it is in that group now', afterMove?.projectTasks?.[0]?.taskListId === later.id, JSON.stringify(afterMove?.projectTasks));
  const back = await sc(`/capacity/tasks/${task.id}`, { method: 'PATCH', body: { taskListId: main.id } });
  ok('moving it back while it is due after that group is refused', back.status === 400, brief(back));
  const foreign = await sc(`/capacity/tasks/${task.id}`, { method: 'PATCH', body: { taskListId: 'not-a-group' } });
  ok('a group of no client of this task is refused', foreign.status === 400, brief(foreign));

  const re = await sc(`/capacity/tasks/${task.id}/seats`, { method: 'PUT', body: { seats: [
    { userId: who.con, role: 'ANALYST', estimatedHours: 5, startDate: dayKey(3), dueDate: dayKey(20) },
    { userId: who.sc, role: 'PM', estimatedHours: 1 },
  ] } });
  ok('the work is reassigned to somebody else, with a PM', re.status === 200, brief(re));
  const seats = (re.data?.assignees ?? []).map(a => `${a.userId}:${a.role}:${a.estimatedHours}`).sort();
  ok('…exactly the new seats', JSON.stringify(seats) === JSON.stringify([`${who.con}:ANALYST:5`, `${who.sc}:PM:1`].sort()), JSON.stringify(seats));
  ok('…the estimate follows the seats', re.data?.estimatedHours === 6, String(re.data?.estimatedHours));
  ok('…and the new person joined the client', (await memberIds()).has(who.con));
  const board2 = await sc('/capacity/team?days=14');
  ok('the board moved it off the old person', !board2.data?.rows?.find(r => r.userId === who.emp)?.openTasks?.some(t => t.id === task.id));
  ok('…and onto the new one', !!board2.data?.rows?.find(r => r.userId === who.con)?.openTasks?.some(t => t.id === task.id));

  const twoPm = await sc(`/capacity/tasks/${task.id}/seats`, { method: 'PUT', body: { seats: [
    { userId: who.con, role: 'PM' }, { userId: who.sc, role: 'PM' },
  ] } });
  ok('two PMs are refused', twoPm.status === 400 && /only one manager/i.test(twoPm.data?.message ?? ''), brief(twoPm));
  const stillSeats = (await sc(`/capacity/tasks/${task.id}`)).data?.assignees?.length;
  ok('…and the seats are as they were', stillSeats === 2, String(stillSeats));

  const del = await sc(`/capacity/tasks/${task.id}`, { method: 'DELETE' });
  ok('the task is deleted', del.status === 200, brief(del));
  const board3 = await sc('/capacity/team?days=14');
  ok('…and is gone from the board', !(board3.data?.rows ?? []).some(r => r.openTasks.some(t => t.id === task.id)));
  ok('…and from the board’s own read', (await sc(`/capacity/tasks/${task.id}`)).status === 404);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('all or nothing');
  const titlesNow = async () => ((await su(`/tasks?projectId=${client.id}`)).data ?? []).map(t => t.title);
  const atomTitle = `Should not exist ${RUN}`;
  const bad = await sc('/capacity/tasks', { method: 'POST', body: {
    projectId: client.id, taskListId: main.id, title: atomTitle,
    seats: [{ userId: who.sra, role: 'ANALYST', estimatedHours: 2 }, { userId: 'no-such-person', role: 'ANALYST' }],
  } });
  ok('a seat naming nobody refuses the whole create', bad.status === 400, brief(bad));
  ok('…no task was made', !(await titlesNow()).includes(atomTitle));
  ok('…and the valid person was NOT added to the client', !(await memberIds()).has(who.sra));
  const dupe = await sc('/capacity/tasks', { method: 'POST', body: {
    projectId: client.id, taskListId: main.id, title: atomTitle,
    seats: [{ userId: who.sra, role: 'REVIEWER' }, { userId: who.sra, role: 'REVIEWER' }],
  } });
  ok('the same person twice in one role is refused', dupe.status === 400, brief(dupe));
  const pms = await sc('/capacity/tasks', { method: 'POST', body: {
    projectId: client.id, taskListId: main.id, title: atomTitle,
    seats: [{ userId: who.sra, role: 'PM' }, { userId: who.con, role: 'PM' }],
  } });
  ok('two PMs on create are refused', pms.status === 400, brief(pms));
  const inverted = await sc('/capacity/tasks', { method: 'POST', body: {
    projectId: client.id, taskListId: main.id, title: atomTitle,
    seats: [{ userId: who.sra, role: 'ANALYST', startDate: dayKey(5), dueDate: dayKey(2) }],
  } });
  ok('a seat starting after its own deadline is refused', inverted.status === 400, brief(inverted));
  ok('…and after all of those, still no task and no new member', !(await titlesNow()).includes(atomTitle) && !(await memberIds()).has(who.sra));

  step('the group’s deadline bounds the task');
  const pastGroup = await sc('/capacity/tasks', { method: 'POST', body: {
    projectId: client.id, taskListId: main.id, title: atomTitle, dueDate: dayKey(25),
    seats: [{ userId: who.sra, role: 'ANALYST' }],
  } });
  ok('a task due after its group is refused', pastGroup.status === 400, brief(pastGroup));
  ok('…with a message that says what to do', /cannot be due later.*Move the task group/i.test(pastGroup.data?.message ?? ''), pastGroup.data?.message);
  ok('…and nothing was made', !(await titlesNow()).includes(atomTitle) && !(await memberIds()).has(who.sra));
  const inherits = await sc('/capacity/tasks', { method: 'POST', body: { projectId: client.id, taskListId: main.id, title: `Inherits ${RUN}`, seats: [] } });
  ok('a task given no date takes its group’s', inherits.status === 201 && String(inherits.data?.dueDate).slice(0, 10) === groupDue, brief(inherits));

  step('other refusals');
  ok('an unknown client is a 404', (await sc('/capacity/tasks', { method: 'POST', body: { projectId: 'no-such-client', title: 'x', seats: [] } })).status === 404);
  ok('an unknown field is refused', (await sc('/capacity/tasks', { method: 'POST', body: { projectId: client.id, title: 'x', seats: [], organizationId: 'x' } })).status === 400);
  ok('an empty title is refused', (await sc('/capacity/tasks', { method: 'POST', body: { projectId: client.id, title: '   ', seats: [] } })).status === 400);

  // A team space's task has no client. The board edits client work only — and the access rule lets
  // an overseer through for a task with no client link at all, so this must be refused by the route.
  const team = await su('/teams', { method: 'POST', body: { name: `Ops ${RUN}` } });
  if (team.status === 201 && team.data?.id) {
    const detail = (await su(`/teams/${team.data.id}`)).data;
    let listId = (detail?.taskLists ?? detail?.lists ?? [])[0]?.id;
    if (!listId) listId = (await su(`/teams/${team.data.id}/lists`, { method: 'POST', body: { name: 'To do' } })).data?.id;
    const tt = await su(`/teams/${team.data.id}/tasks`, { method: 'POST', body: { title: `Team chore ${RUN}`, taskListId: listId } });
    // The route answers with the space's task list rather than the one task.
    if (Array.isArray(tt.data)) tt.data = tt.data.find(t => t.title === `Team chore ${RUN}`);
    if (tt.data?.id) {
      ok('a team-space task is not the board’s to read', (await sc(`/capacity/tasks/${tt.data.id}`)).status === 404);
      ok('…nor to edit', (await sc(`/capacity/tasks/${tt.data.id}`, { method: 'PATCH', body: { title: 'hijacked' } })).status === 404);
      ok('…nor to delete', (await sc(`/capacity/tasks/${tt.data.id}`, { method: 'DELETE' })).status === 404);
      await su(`/teams/${team.data.id}/tasks/${tt.data.id}`, { method: 'DELETE' });
    } else console.log('  (skipped the team-space case: could not make a team task — ' + brief(tt) + ')');
    await su(`/teams/${team.data.id}/archive`, { method: 'POST' });
  } else console.log('  (skipped the team-space case: could not make a team — ' + brief(team) + ')');

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // Tidy the fixture's tasks away so the board is not left carrying them.
  for (const t of ((await su(`/tasks?projectId=${client.id}`)).data ?? [])) await su(`/tasks/${t.id}`, { method: 'DELETE' });

  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) { console.log('\nFailures:\n  ' + fails.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
