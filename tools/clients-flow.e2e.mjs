/**
 * The clients flow, end to end: client groups, clients, task groups, and the rules they keep.
 *
 *   BASE=http://127.0.0.1:4021 node tools/clients-flow.e2e.mjs     # a SCRATCH database
 *
 * Every fixture carries this run's id, so the suite can be run again on the same database. It is
 * split, as the repo's other suites are, into what must work and what must be refused — a guard
 * that also stops the legitimate case is a different bug, not a fix.
 *
 * Roles used (the seeded roster): mohit = Super Admin (mints PIDs), ankit.verma = Manager
 * (runs clients, assigns), ketan.dagar = Senior Research Associate (makes groups, cannot assign),
 * meetu.singh = Consultant (never put on the fixture client), ajay.sharma = Employee (cannot make
 * groups), hr = HR (no delivery access at all).
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4011';
const PW = process.env.PW || 'sqip@1234';
const RUN = Date.now().toString(36).slice(-5);

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const step = h => console.log('\n— ' + h + ' —');
const brief = r => `${r.status} ${typeof r.data === 'string' ? r.data.slice(0, 160) : JSON.stringify(r.data)?.slice(0, 200)}`;

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
const dayKey = (offset = 0) => { const d = new Date(Date.now() + 5.5 * 3600e3); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

(async () => {
  const su = sess(), mgr = sess(), sra = sess(), con = sess(), emp = sess(), hr = sess();
  const who = {};
  for (const [s, email, key] of [
    [su, 'mohit@squarkip.com', 'su'], [mgr, 'ankit.verma@squarkip.com', 'mgr'], [sra, 'ketan.dagar@squarkip.com', 'sra'],
    [con, 'meetu.singh@squarkip.com', 'con'], [emp, 'ajay.sharma@squarkip.com', 'emp'], [hr, 'hr@squarkip.com', 'hr'],
  ]) {
    const r = await s('/auth/login', { method: 'POST', body: { email, password: PW } });
    who[key] = r.data?.user?.id;
    if (!who[key]) { console.log(`cannot log in as ${email}: ${brief(r)}`); process.exit(2); }
  }

  // The suite leans on each person's ROLE. Other suites elevate people mid-run (meeting-changes
  // makes basant.goyal an Admin, and leaves it if it fails), so check the fixture rather than
  // report a wall that "broke" when it was really the seed that moved.
  const codesOf = async s => {
    const r = await s('/me/effective-permissions');
    return new Set((r.data?.permissions ?? r.data?.codes ?? []).map(x => (typeof x === 'string' ? x : x.code)));
  };
  const sraCodes = await codesOf(sra), empCodes = await codesOf(emp), mgrCodes = await codesOf(mgr);
  const drift = [];
  if (sraCodes.has('task.assign') || !sraCodes.has('tasklist.create')) drift.push('the SRA should make groups but not assign');
  if (empCodes.has('tasklist.create')) drift.push('the Employee should not make groups');
  if (!mgrCodes.has('task.assign') || !mgrCodes.has('project.approve')) drift.push('the Manager should assign and approve');
  if (drift.length) { console.log('FIXTURE DRIFT — reseed the scratch database: ' + drift.join('; ')); process.exit(2); }

  const statuses = (await su('/workflows/default/statuses')).data ?? [];
  const CLOSED = statuses.find(s => s.type === 'CLOSED')?.id;
  const OPEN = statuses.find(s => s.type === 'OPEN')?.id;
  if (!CLOSED || !OPEN) { console.log('no OPEN/CLOSED status in the default workflow'); process.exit(2); }

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('client groups: who may see and arrange them');
  ok('HR, who has no delivery access, is refused the list', (await hr('/client-groups')).status === 403);
  const empList = await emp('/client-groups');
  ok('an employee may read the list', empList.status === 200 && Array.isArray(empList.data), brief(empList));
  ok('an employee may not create one', (await emp('/client-groups', { method: 'POST', body: { name: `Nope ${RUN}` } })).status === 403);

  const g1r = await mgr('/client-groups', { method: 'POST', body: { name: `Law firms ${RUN}` } });
  ok('a manager creates a group', g1r.status === 201 && g1r.data?.name === `Law firms ${RUN}`, brief(g1r));
  const g1 = g1r.data;
  const dup = await mgr('/client-groups', { method: 'POST', body: { name: `  law FIRMS ${RUN}  ` } });
  ok('the same name in another case is refused, in words', dup.status === 400 && /already/i.test(dup.data?.message ?? ''), brief(dup));
  ok('a blank name is refused', (await mgr('/client-groups', { method: 'POST', body: { name: '   ' } })).status === 400);
  const g2 = (await mgr('/client-groups', { method: 'POST', body: { name: `Corporates ${RUN}` } })).data;
  ok('a second group is created', !!g2?.id);
  const clash = await mgr(`/client-groups/${g2.id}`, { method: 'PATCH', body: { name: `Law firms ${RUN}` } });
  ok('renaming onto another live group is refused', clash.status === 400, brief(clash));
  const ren = await mgr(`/client-groups/${g2.id}`, { method: 'PATCH', body: { name: `Corporate clients ${RUN}` } });
  ok('a plain rename works', ren.status === 200 && ren.data?.name === `Corporate clients ${RUN}`, brief(ren));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('creating a client: its group and its first task group');
  const types = (await su('/projects/types')).data ?? [];
  const fto = types.find(t => t.value === 'FTO');
  const soon = types.find(t => t.comingSoon);
  ok('the FTO type exists and brings standard tasks', !!fto && (fto.tasks?.length ?? 0) > 0, JSON.stringify(fto)?.slice(0, 160));

  const before = ((await su('/projects')).data ?? []).length;
  const inverted = await su('/projects', { method: 'POST', body: {
    title: `Inverted ${RUN}`, taskGroup: { name: 'Bad dates', startDate: dayKey(5), dueDate: dayKey(1) },
  } });
  ok('a first group whose deadline is before its start is refused', inverted.status === 400, brief(inverted));
  ok('…and no client was half-created', ((await su('/projects')).data ?? []).length === before);
  if (soon) {
    const cs = await su('/projects', { method: 'POST', body: { title: `Soon ${RUN}`, taskGroup: { name: 'x', groupType: soon.value } } });
    ok('a coming-soon type is refused for a group', cs.status === 400, brief(cs));
  }
  const unknown = await su('/projects', { method: 'POST', body: { title: `Unknown ${RUN}`, taskGroup: { name: 'x', groupType: 'NOT_A_TYPE' } } });
  ok('an unknown type is refused for a group', unknown.status === 400, brief(unknown));
  const badGroup = await su('/projects', { method: 'POST', body: { title: `Badgroup ${RUN}`, clientGroupId: 'not-a-group' } });
  ok('an unknown client group is refused', badGroup.status === 400, brief(badGroup));

  const start = dayKey(0), due = dayKey(14);
  const cr = await su('/projects', { method: 'POST', body: {
    title: `Acme Corp ${RUN}`, clientGroupId: g1.id, managerId: who.mgr,
    taskGroup: { name: 'FTO – Widget X', groupType: 'FTO', startDate: start, dueDate: due, description: 'Freedom to operate for the widget' },
  } });
  ok('a Super Admin creates a client in a group with a first task group', cr.status === 201, brief(cr));
  const client = cr.data;
  const got = (await mgr(`/projects/${client.id}`)).data;
  ok('the client is filed under its group', got?.clientGroup?.id === g1.id, JSON.stringify(got?.clientGroup));
  ok('the client carries no project-level type (the group does)', got?.projectType == null, String(got?.projectType));
  const firstGroup = got?.taskLists?.[0];
  ok('it has exactly one task group, the first one, as its default',
    got?.taskLists?.length === 1 && firstGroup?.name === 'FTO – Widget X' && firstGroup?.isDefault === true,
    JSON.stringify(got?.taskLists));
  ok('the group carries its type, dates, description and status',
    firstGroup?.groupType === 'FTO' && firstGroup?.status === 'ACTIVE' && firstGroup?.startDate?.slice(0, 10) === start
      && firstGroup?.dueDate?.slice(0, 10) === due && firstGroup?.description === 'Freedom to operate for the widget',
    JSON.stringify(firstGroup));
  const firstTasks = (await mgr(`/tasks?projectId=${client.id}`)).data ?? [];
  ok('the FTO standard tasks were created inside the group', firstTasks.length === fto.tasks.length
    && firstTasks.every(t => t.projectTasks?.[0]?.taskListId === firstGroup.id), `got ${firstTasks.length}, want ${fto.tasks.length}`);
  ok('every standard task inherits the group deadline', firstTasks.every(t => t.dueDate?.slice(0, 10) === due));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('task groups: creation, staffing and Team Capacity');
  const inv = types.find(t => t.value === 'INVALIDITY');
  const gr = await mgr(`/projects/${client.id}/tasklists`, { method: 'POST', body: {
    name: 'Invalidity – US 10,123,456', groupType: 'INVALIDITY', startDate: start, dueDate: dayKey(10),
    assigneeId: who.sra, hoursPerTask: 3,
  } });
  ok('the manager creates a staffed task group', gr.status === 201 && gr.data?.createdTaskCount === (inv?.tasks?.length ?? -1)
    && gr.data?.assigned === gr.data?.createdTaskCount && !gr.data?.assignmentWarning, brief(gr));
  const invGroup = gr.data;
  const board = (await mgr('/capacity/team?days=21')).data;
  const sraRow = (board?.rows ?? board ?? []).find?.(r => r.userId === who.sra);
  const onBoard = (sraRow?.openTasks ?? []).filter(t => t.taskGroupId === invGroup.id);
  ok('the assigned work appears on Team Capacity for that person', onBoard.length === invGroup.createdTaskCount, `found ${onBoard.length}`);
  ok('…labelled with its client and its task group', onBoard.every(t => t.project === client.title && t.taskGroup === invGroup.name));
  ok('…with the planned hours, placed from the start date', onBoard.every(t => t.estimatedHours === 3 && t.scheduled === true));
  const mine = (await sra(`/tasks?userId=${who.sra}`)).data ?? [];
  ok('My Tasks carries the group name', mine.filter(t => t.projectTasks?.[0]?.taskList?.name === invGroup.name).length === invGroup.createdTaskCount);

  const noTemplate = await mgr(`/projects/${client.id}/tasklists`, { method: 'POST', body: { name: `Risk review ${RUN}`, groupType: 'RISK_STRATEGY' } });
  ok('a built-in type with no standard tasks is still a valid type of work', noTemplate.status === 201
    && noTemplate.data?.groupType === 'RISK_STRATEGY' && noTemplate.data?.createdTaskCount === 0, brief(noTemplate));
  if (noTemplate.data?.id) await mgr(`/projects/${client.id}/tasklists/${noTemplate.data.id}`, { method: 'DELETE' });

  const sraAssign = await sra(`/projects/${client.id}/tasklists`, { method: 'POST', body: { name: `SRA try ${RUN}`, assigneeId: who.emp } });
  ok('an SRA (no right to assign) is told so, and nothing is created', sraAssign.status === 403
    && !((await mgr(`/projects/${client.id}/tasklists`)).data ?? []).some(g => g.name === `SRA try ${RUN}`), brief(sraAssign));
  const sraPlain = await sra(`/projects/${client.id}/tasklists`, { method: 'POST', body: { name: `Claim charts ${RUN}` } });
  ok('an SRA on the client may create an unstaffed group', sraPlain.status === 201, brief(sraPlain));
  const plainGroup = sraPlain.data;
  ok('an employee may not create a group', (await emp(`/projects/${client.id}/tasklists`, { method: 'POST', body: { name: 'x' } })).status === 403);
  ok('a consultant who is not on the client is walled off', (await con(`/projects/${client.id}/tasklists`, { method: 'POST', body: { name: 'x' } })).status === 403);
  ok('…and cannot read its groups', (await con(`/projects/${client.id}/tasklists`)).status === 403);
  ok('HR cannot read them', (await hr(`/projects/${client.id}/tasklists`)).status === 403);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('editing a task group');
  const badDates = await mgr(`/projects/${client.id}/tasklists/${invGroup.id}`, { method: 'PATCH', body: { startDate: dayKey(20) } });
  ok('moving the start past the existing deadline is refused', badDates.status === 400, brief(badDates));
  const badType = await mgr(`/projects/${client.id}/tasklists/${invGroup.id}`, { method: 'PATCH', body: { groupType: 'NOT_A_TYPE' } });
  ok('an unknown type is refused on edit', badType.status === 400, brief(badType));
  const ed = await mgr(`/projects/${client.id}/tasklists/${invGroup.id}`, { method: 'PATCH', body: { name: 'Invalidity – US 10,123,456 (rev)', dueDate: dayKey(12), description: 'Revised' } });
  ok('a valid edit saves name, deadline and description', ed.status === 200 && ed.data?.name.endsWith('(rev)') && ed.data?.dueDate?.slice(0, 10) === dayKey(12) && ed.data?.description === 'Revised', brief(ed));
  const cleared = await mgr(`/projects/${client.id}/tasklists/${invGroup.id}`, { method: 'PATCH', body: { description: null } });
  ok('null clears a field', cleared.status === 200 && cleared.data?.description === null, brief(cleared));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('completing a task group');
  const early = await mgr(`/projects/${client.id}/tasklists/${invGroup.id}/complete`, { method: 'POST' });
  ok('a group with open work cannot be completed, and says how much is open', early.status === 400 && /still open/i.test(early.data?.message ?? ''), brief(early));
  const emptyDone = await mgr(`/projects/${client.id}/tasklists/${plainGroup.id}/complete`, { method: 'POST' });
  ok('an empty group cannot be completed', emptyDone.status === 400, brief(emptyDone));
  const invTasks = (await mgr(`/tasks?projectId=${client.id}`)).data.filter(t => t.projectTasks?.[0]?.taskListId === invGroup.id);
  for (const t of invTasks) await mgr(`/tasks/${t.id}/status`, { method: 'PUT', body: { statusId: CLOSED } });
  const done = await mgr(`/projects/${client.id}/tasklists/${invGroup.id}/complete`, { method: 'POST' });
  ok('once every task is closed, the group completes', done.status === 201 && done.data?.status === 'COMPLETED' && !!done.data?.completedAt, brief(done));
  const boardAfter = (await mgr('/capacity/team?days=21')).data;
  const sraAfter = (boardAfter?.rows ?? boardAfter ?? []).find?.(r => r.userId === who.sra);
  ok('finished work leaves Team Capacity', !(sraAfter?.openTasks ?? []).some(t => t.taskGroupId === invGroup.id));

  const intoDone = await mgr('/tasks', { method: 'POST', body: { title: 'late addition', projectId: client.id, taskListId: invGroup.id } });
  ok('a task cannot be created in a completed group', intoDone.status === 400 && /complete/i.test(intoDone.data?.message ?? ''), brief(intoDone));
  await mgr(`/tasks/${invTasks[0].id}/status`, { method: 'PUT', body: { statusId: OPEN } });
  const afterReopen = (await mgr(`/projects/${client.id}/tasklists/${invGroup.id}`)).data;
  ok('reopening a task inside it re-opens the group', afterReopen?.status === 'ACTIVE' && afterReopen?.completedAt === null, JSON.stringify(afterReopen)?.slice(0, 160));
  await mgr(`/tasks/${invTasks[0].id}/status`, { method: 'PUT', body: { statusId: CLOSED } });
  ok('it completes again once that task is closed', (await mgr(`/projects/${client.id}/tasklists/${invGroup.id}/complete`, { method: 'POST' })).data?.status === 'COMPLETED');
  const ro = await mgr(`/projects/${client.id}/tasklists/${invGroup.id}/reopen`, { method: 'POST' });
  ok('Reopen brings a completed group back', ro.status === 201 && ro.data?.status === 'ACTIVE', brief(ro));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('moving tasks between groups');
  const mover = firstTasks[0];
  const mv = await mgr(`/tasks/${mover.id}/task-group`, { method: 'PUT', body: { projectId: client.id, taskListId: plainGroup.id } });
  ok('a task moves to another group of the same client', mv.status === 200 && mv.data?.projectTasks?.[0]?.taskListId === plainGroup.id, brief(mv));
  await mgr(`/projects/${client.id}/tasklists/${invGroup.id}/complete`, { method: 'POST' });
  const intoCompleted = await mgr(`/tasks/${mover.id}/task-group`, { method: 'PUT', body: { projectId: client.id, taskListId: invGroup.id } });
  ok('an open task cannot be moved into a completed group', intoCompleted.status === 400, brief(intoCompleted));
  const otherClient = (await su('/projects', { method: 'POST', body: { title: `Other Co ${RUN}`, managerId: who.mgr } })).data;
  const otherGroup = ((await mgr(`/projects/${otherClient.id}/tasklists`)).data ?? [])[0];
  const cross = await mgr(`/tasks/${mover.id}/task-group`, { method: 'PUT', body: { projectId: client.id, taskListId: otherGroup?.id } });
  ok("a task cannot be moved into another client's group", cross.status === 400, brief(cross));
  ok('an employee cannot move tasks', (await emp(`/tasks/${mover.id}/task-group`, { method: 'PUT', body: { projectId: client.id, taskListId: firstGroup.id } })).status === 403);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('deleting a group never deletes work');
  const holding = ((await mgr(`/tasks?projectId=${client.id}`)).data ?? []).filter(t => t.projectTasks?.[0]?.taskListId === plainGroup.id).length;
  const del = await mgr(`/projects/${client.id}/tasklists/${plainGroup.id}`, { method: 'DELETE' });
  ok('a group with tasks is deleted and says where they went', del.status === 200 && del.data?.movedTasks === holding && del.data?.movedTo?.id === firstGroup.id, brief(del));
  const stillThere = ((await mgr(`/tasks?projectId=${client.id}`)).data ?? []).filter(t => t.id === mover.id);
  ok('…and the moved task still exists, in the default group', stillThere.length === 1 && stillThere[0].projectTasks?.[0]?.taskListId === firstGroup.id);
  const delDefault = await mgr(`/projects/${client.id}/tasklists/${firstGroup.id}`, { method: 'DELETE' });
  ok('the default group cannot be deleted', delDefault.status === 400, brief(delDefault));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('filing clients into groups');
  const mv2 = await mgr(`/projects/${client.id}`, { method: 'PATCH', body: { clientGroupId: g2.id } });
  ok('a client moves to another group', mv2.status === 200 && (await mgr(`/projects/${client.id}`)).data?.clientGroup?.id === g2.id, brief(mv2));
  const unf = await mgr(`/projects/${client.id}`, { method: 'PATCH', body: { clientGroupId: null } });
  ok('null takes it out of any group', unf.status === 200 && (await mgr(`/projects/${client.id}`)).data?.clientGroup === null, brief(unf));
  await mgr(`/projects/${client.id}`, { method: 'PATCH', body: { clientGroupId: g1.id } });
  ok('an employee cannot re-file a client', (await emp(`/projects/${client.id}`, { method: 'PATCH', body: { clientGroupId: g2.id } })).status === 403);

  const listed = ((await mgr('/projects')).data ?? []).find(p => p.id === client.id);
  ok('the client list carries the group, the task groups and the open count',
    listed?.clientGroup?.id === g1.id && Array.isArray(listed?.taskLists) && typeof listed?.openTaskCount === 'number', JSON.stringify(listed)?.slice(0, 200));

  const conCount = ((await con('/client-groups')).data ?? []).find(g => g.id === g1.id)?.clientCount;
  const mgrCount = ((await mgr('/client-groups')).data ?? []).find(g => g.id === g1.id)?.clientCount;
  ok('a group counts only the clients the reader can see', conCount === 0 && mgrCount >= 1, `consultant ${conCount}, manager ${mgrCount}`);

  const arch = await mgr(`/client-groups/${g1.id}/archive`, { method: 'POST' });
  ok('archiving a group un-files its clients', arch.status === 201 && arch.data?.movedClients >= 1
    && (await mgr(`/projects/${client.id}`)).data?.clientGroup === null, brief(arch));
  ok('an archived group is not offered', !((await mgr('/client-groups')).data ?? []).some(g => g.id === g1.id));
  ok('…but a manager can still see it when asking for archived groups', ((await mgr('/client-groups?includeArchived=true')).data ?? []).some(g => g.id === g1.id));
  const intoArchived = await mgr(`/projects/${client.id}`, { method: 'PATCH', body: { clientGroupId: g1.id } });
  ok('a client cannot be filed under an archived group', intoArchived.status === 400, brief(intoArchived));
  const rest = await mgr(`/client-groups/${g1.id}/restore`, { method: 'POST' });
  ok('an archived group can be restored', rest.status === 201 && rest.data?.archivedAt === null, brief(rest));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('a completed client takes no new groups');
  // A client completes only when all of its work is closed — the project's own rule, unchanged.
  for (const t of (await mgr(`/tasks?projectId=${client.id}`)).data ?? []) {
    if (t.currentStatus?.type !== 'CLOSED') await mgr(`/tasks/${t.id}/status`, { method: 'PUT', body: { statusId: CLOSED } });
  }
  const comp = await su(`/projects/${client.id}/complete`, { method: 'POST', body: {} });
  if (comp.status === 201 || comp.status === 200) {
    const late = await mgr(`/projects/${client.id}/tasklists`, { method: 'POST', body: { name: 'After the end' } });
    ok('adding a group to a completed client is refused', late.status >= 400 && late.status < 500, brief(late));
  } else {
    ok('the client could be completed for this check', false, brief(comp));
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('patents, patent IDs and client codes are switched off');
  for (const path of ['/patents', '/patents/options', '/clients', '/client-ledger', `/projects/${client.id}/patent-numbers`]) {
    const r = await su(path);
    ok(`${path} is gone (404), even for a Super Admin`, r.status === 404, brief(r));
  }
  ok('tagging patents on a client is gone', (await su(`/projects/${client.id}/patents`, { method: 'PUT', body: { patentIds: [] } })).status === 404);
  ok('naming a client code on a client is gone', (await su(`/projects/${client.id}/client`, { method: 'PUT', body: { clientId: null } })).status === 404);
  const withPatents = await su('/projects', { method: 'POST', body: { title: `Patents ${RUN}`, patentIds: ['x'] } });
  ok('creating with patent IDs is refused in words', withPatents.status === 400 && /switched off/i.test(withPatents.data?.message ?? ''), brief(withPatents));
  const withCode = await su('/projects', { method: 'POST', body: { title: `Code ${RUN}`, clientId: 'x' } });
  ok('creating with a client code is refused in words', withCode.status === 400 && /switched off/i.test(withCode.data?.message ?? ''), brief(withCode));
  const suView = (await su(`/projects/${client.id}`)).data ?? {};
  ok('a client carries no patents and no client code, even for a Super Admin', !('patents' in suView) && !('client' in suView) && !('clientId' in suView),
    Object.keys(suView).filter(k => /client|patent/i.test(k)).join(','));
  const ledger = await su('/projects/pid-ledger');
  ok('the PID ledger carries no client code or patents', ledger.status === 200 && !/"client"|"patents"/.test(JSON.stringify(ledger.data)), brief(ledger));

  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) { console.log('\nFailures:\n  ' + fails.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
