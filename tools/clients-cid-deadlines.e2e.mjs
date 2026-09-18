/**
 * The clients flow: every client created with its CID, and deadlines that nest.
 *
 *   BASE=http://127.0.0.1:4032 PASSCODE=... node tools/clients-cid-deadlines.e2e.mjs   # SCRATCH database
 *
 * (Was clients-pid-deadlines.e2e.mjs. The PID request pool it used to cover is gone: every client is
 * given its CID in the transaction that creates it. The full CID lifecycle — ledger events, registry
 * states, merges, purges, concurrency — is tools/cid-ledger.e2e.mjs.)
 *
 * Re-runnable: every fixture carries this run's id. Split, like the repo's other suites, into what
 * must work and what must be refused.
 *
 * Roles: mohit and yash = Super Admin; ankit.verma runs clients and sees client deadlines but
 * cannot change a CID; ketan.dagar is on a client with no client-deadline right; ajay.sharma and hr
 * are checked only for what they are refused. The drift check below refuses to run if a roster
 * change has broken those assumptions.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4011';
const PW = process.env.PW || 'sqip@1234';
const PASSCODE = process.env.PASSCODE || 'cf-scratch-7713';
const RUN = Date.now().toString(36).slice(-5);

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const step = h => console.log('\n— ' + h + ' —');
const brief = r => `${r.status} ${typeof r.data === 'string' ? r.data.slice(0, 160) : JSON.stringify(r.data)?.slice(0, 220)}`;
const day = (offset = 0) => { const d = new Date(Date.now() + 5.5 * 3600e3); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

function sess() {
  let cookie = '';
  return async (p, { method = 'GET', body, headers = {} } = {}) => {
    const r = await fetch(BASE + '/api/v1' + p, {
      method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}

(async () => {
  const su = sess(), yash = sess(), mgr = sess(), sra = sess(), emp = sess(), hr = sess();
  const who = {};
  for (const [s, email, key] of [
    [su, 'mohit@squarkip.com', 'su'], [yash, 'yash@squarkip.com', 'yash'], [mgr, 'ankit.verma@squarkip.com', 'mgr'],
    [sra, 'ketan.dagar@squarkip.com', 'sra'], [emp, 'ajay.sharma@squarkip.com', 'emp'], [hr, 'hr@squarkip.com', 'hr'],
  ]) {
    const r = await s('/auth/login', { method: 'POST', body: { email, password: PW } });
    who[key] = r.data?.user?.id;
    if (!who[key]) { console.log(`cannot log in as ${email}: ${brief(r)}`); process.exit(2); }
  }
  const codes = async s => new Set(((await s('/me/effective-permissions')).data?.codes ?? []).map(x => (typeof x === 'string' ? x : x.code)));
  const [suC, mgrC, sraC] = [await codes(su), await codes(mgr), await codes(sra)];
  if (!suC.has('project.generate_pid') || mgrC.has('project.generate_pid') || !mgrC.has('deadline.view.client') || sraC.has('deadline.view.client')) {
    console.log('FIXTURE DRIFT — reseed the scratch database'); process.exit(2);
  }
  const cidRe = /^[A-Z0-9]+_\d{2}_\d{2}_\d{3,6}$/;
  void yash; void emp;

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('every client is created with its CID — nothing to request, nothing pending');
  const a = await mgr('/projects', { method: 'POST', body: { title: `CID A ${RUN}`, managerId: who.mgr } });
  ok('a client lead creates a client and it carries a CID at once', a.status === 201 && cidRe.test(a.data?.code ?? ''), brief(a));
  const aView = (await mgr(`/projects/${a.data.id}`)).data;
  ok('the client read has no request or pending state', aView?.code === a.data.code && !('openPidRequest' in (aView ?? {})));
  const b = await su('/projects', { method: 'POST', body: { title: `CID B ${RUN}` } });
  ok('an admin creating one without doing anything about a number gets the next CID too',
    b.status === 201 && cidRe.test(b.data?.code ?? '') && b.data.code !== a.data.code, brief(b));
  ok('the old request queue is gone', (await su('/projects/pid-requests')).status === 404);
  ok('…and so is "Generate PID"', (await su('/projects/generate-pid', { method: 'POST' })).status === 404);
  const inLedger = ((await su('/projects/cid-ledger')).data ?? []).find(r => r.cid === a.data.code);
  ok('the CID is in the ledger with a MINTED event', inLedger?.events?.some(e => e.type === 'MINTED'), JSON.stringify(inLedger)?.slice(0, 160));
  const d = await mgr('/projects', { method: 'POST', body: { title: `Doomed ${RUN}`, managerId: who.mgr } });
  await su(`/projects/${d.data.id}`, { method: 'DELETE' });
  void hr;

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('deadlines: the promise lives on the task group');
  const cl = (await su('/projects', { method: 'POST', body: { title: `Deadlines ${RUN}`, managerId: who.mgr } })).data;
  // Put the SRA on the client so they can see it at all.
  await mgr(`/projects/${cl.id}/members`, { method: 'POST', body: { userId: who.sra, projectRole: 'MEMBER' } });
  const inv = await mgr(`/projects/${cl.id}/tasklists`, { method: 'POST', body: {
    name: 'Inverted', groupType: 'FTO', startDate: day(0), dueDate: day(10), clientDueDate: day(8),
  } });
  ok("the team's deadline after the client's is refused", inv.status === 400, brief(inv));
  const sraClient = await sra(`/projects/${cl.id}/tasklists`, { method: 'POST', body: { name: `SRA promise ${RUN}`, clientDueDate: day(12) } });
  ok('someone without the client-deadline right cannot set one', sraClient.status === 403, brief(sraClient));
  const g = await mgr(`/projects/${cl.id}/tasklists`, { method: 'POST', body: {
    name: 'FTO – Deadline test', groupType: 'FTO', startDate: day(0), dueDate: day(10), clientDueDate: day(12),
  } });
  ok('the client manager creates a group with both deadlines', g.status === 201 && g.data?.clientDueDate?.slice(0, 10) === day(12), brief(g));
  const sraSees = ((await sra(`/projects/${cl.id}/tasklists`)).data ?? []).find(x => x.id === g.data.id);
  ok('a team member sees the group but NOT the client deadline', !!sraSees && !('clientDueDate' in sraSees), JSON.stringify(sraSees)?.slice(0, 160));
  const mgrSees = ((await mgr(`/projects/${cl.id}/tasklists`)).data ?? []).find(x => x.id === g.data.id);
  ok('the client manager sees it', mgrSees?.clientDueDate?.slice(0, 10) === day(12));

  step('deadlines: a task stays inside its group');
  const own = await mgr('/tasks', { method: 'POST', body: { title: 'No date given', projectId: cl.id, taskListId: g.data.id } });
  ok('a task created with no date takes the group deadline', own.status === 201 && own.data?.dueDate?.slice(0, 10) === day(10), brief(own));
  const late = await mgr('/tasks', { method: 'POST', body: { title: 'Too late', projectId: cl.id, taskListId: g.data.id, dueDate: day(11) } });
  ok('a task due after its group is refused, saying what to do', late.status === 400 && /task group/i.test(late.data?.message ?? ''), brief(late));
  const early = await mgr('/tasks', { method: 'POST', body: { title: 'Milestone', projectId: cl.id, taskListId: g.data.id, dueDate: day(4) } });
  ok('an earlier milestone inside the group is fine', early.status === 201 && early.data?.dueDate?.slice(0, 10) === day(4), brief(early));
  const push = await mgr(`/tasks/${early.data.id}`, { method: 'PATCH', body: { dueDate: day(15) } });
  ok('editing a task past its group deadline is refused', push.status === 400, brief(push));
  const fine = await mgr(`/tasks/${early.data.id}`, { method: 'PATCH', body: { dueDate: day(5) } });
  ok('editing within it is fine', fine.status === 200 && fine.data?.dueDate?.slice(0, 10) === day(5), brief(fine));

  step('deadlines: moving a group deadline carries its tasks');
  const before = ((await mgr(`/tasks?projectId=${cl.id}`)).data ?? []).filter(t => t.projectTasks?.[0]?.taskListId === g.data.id);
  const atEnd = before.filter(t => t.dueDate?.slice(0, 10) === day(10)).length;
  const later = await mgr(`/projects/${cl.id}/tasklists/${g.data.id}`, { method: 'PATCH', body: { dueDate: day(12) } });
  ok('pushing the group deadline later moves every task that was due on the old date', later.status === 200 && later.data?.movedTasks === atEnd, brief(later));
  const after = ((await mgr(`/tasks?projectId=${cl.id}`)).data ?? []).filter(t => t.projectTasks?.[0]?.taskListId === g.data.id);
  ok('…and leaves a milestone with its own earlier date alone', after.find(t => t.id === early.data.id)?.dueDate?.slice(0, 10) === day(5));
  ok('the group deadline cannot pass the client deadline', (await mgr(`/projects/${cl.id}/tasklists/${g.data.id}`, { method: 'PATCH', body: { dueDate: day(13) } })).status === 400);
  const pull = await mgr(`/projects/${cl.id}/tasklists/${g.data.id}`, { method: 'PATCH', body: { dueDate: day(3) } });
  const pulled = ((await mgr(`/tasks?projectId=${cl.id}`)).data ?? []).filter(t => t.projectTasks?.[0]?.taskListId === g.data.id);
  ok('pulling it earlier brings every later task in to it', pull.status === 200
    && pulled.every(t => !t.dueDate || t.dueDate.slice(0, 10) <= day(3)), brief(pull));
  ok('an SRA may not move the client deadline', (await sra(`/projects/${cl.id}/tasklists/${g.data.id}`, { method: 'PATCH', body: { clientDueDate: day(20) } })).status === 403);

  step('deadlines: moving a task into a group due earlier');
  const g2 = (await mgr(`/projects/${cl.id}/tasklists`, { method: 'POST', body: { name: 'Later work', startDate: day(0), dueDate: day(30) } })).data;
  const t2 = (await mgr('/tasks', { method: 'POST', body: { title: 'Due late', projectId: cl.id, taskListId: g2.id, dueDate: day(25) } })).data;
  const mv = await mgr(`/tasks/${t2.id}/task-group`, { method: 'PUT', body: { projectId: cl.id, taskListId: g.data.id } });
  ok('an open task due after the target group is refused, saying what to do', mv.status === 400 && /deadline/i.test(mv.data?.message ?? ''), brief(mv));

  // A deleted client's CID stays reserved to it, so a restore brings it back with the SAME number
  // (the case where the number was retired meanwhile is in tools/cid-ledger.e2e.mjs).
  step('a client restored from the bin comes back with its CID');
  const restored = await su(`/admin/data/projects/${d.data.id}/restore`, { method: 'POST' });
  ok('an admin restores the deleted client', restored.status === 201 || restored.status === 200, brief(restored));
  ok('…with the same CID it had', (await mgr(`/projects/${d.data.id}`)).data?.code === d.data.code && restored.data?.cid === d.data.code,
    JSON.stringify(restored.data));

  step('the promise is not in the payload either');
  const leakR = await mgr('/projects', { method: 'POST', body: {
    title: `Leak ${RUN}`, managerId: who.mgr,
    taskGroup: { name: 'Promise', startDate: day(0), dueDate: day(10), clientDueDate: day(14) },
  } });
  ok('a client created with a first task group reports it back (the include ran before it existed)',
    (leakR.data?.taskLists ?? []).length === 1, JSON.stringify(leakR.data?.taskLists)?.slice(0, 120));
  // The member here is the SRA: the drift check above proved they hold no client-deadline right.
  // (It used to be ajay.sharma, who has since become a Senior Consultant and CAN see the promise.)
  await mgr(`/projects/${leakR.data.id}/members`, { method: 'POST', body: { userId: who.sra, projectRole: 'MEMBER' } });
  const leakMgrR = (await mgr(`/projects/${leakR.data.id}`)).data;
  const leakEmpR = (await sra(`/projects/${leakR.data.id}`)).data;
  ok('the manager reads the client deadline on the task group', !!leakMgrR?.taskLists?.[0]?.clientDueDate);
  ok('a member ON the client without the right does not — not even in the client payload',
    (leakEmpR?.taskLists ?? []).length > 0 && !('clientDueDate' in leakEmpR.taskLists[0]),
    JSON.stringify(leakEmpR?.taskLists?.[0])?.slice(0, 160));

  step('pulling a group deadline in leaves every task workable');
  const pullGroupR = (await mgr(`/projects/${leakR.data.id}/tasklists`)).data[0];
  const lateStarterR = await mgr('/tasks', { method: 'POST', body: {
    title: `Late starter ${RUN}`, projectId: leakR.data.id, taskListId: pullGroupR.id, startDate: day(8), dueDate: day(10),
  } });
  await mgr(`/projects/${leakR.data.id}/tasklists/${pullGroupR.id}`, { method: 'PATCH', body: { dueDate: day(3) } });
  const pulledR = (await mgr(`/tasks/${lateStarterR.data.id}`)).data;
  ok('the task comes in with the group', pulledR?.dueDate?.slice(0, 10) === day(3), JSON.stringify(pulledR?.dueDate));
  ok('…and never starts after it is due — the row stayed editable', pulledR?.startDate?.slice(0, 10) <= day(3)
    && (await mgr(`/tasks/${lateStarterR.data.id}`, { method: 'PATCH', body: { priority: 'HIGH' } })).status === 200,
    `start ${pulledR?.startDate} due ${pulledR?.dueDate}`);

  step('the same day means the same thing on both doors');
  const noonR = await mgr('/tasks', { method: 'POST', body: {
    title: `Noon ${RUN}`, projectId: leakR.data.id, taskListId: pullGroupR.id, dueDate: `${day(3)}T10:00:00.000Z`,
  } });
  ok('a task due mid-morning ON the group deadline is accepted', noonR.status === 201, brief(noonR));
  const sameDayTargetR = await mgr(`/projects/${leakR.data.id}/tasklists`, { method: 'POST', body: { name: `Same day ${RUN}`, dueDate: day(3) } });
  const moveNoonR = await mgr(`/tasks/${noonR.data.id}/task-group`, { method: 'PUT', body: { projectId: leakR.data.id, taskListId: sameDayTargetR.data.id } });
  ok('…and moving it into a group due that same day is allowed too', moveNoonR.status === 200, brief(moveNoonR));

  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) { console.log('\nFailures:\n  ' + fails.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
