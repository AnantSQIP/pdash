/**
 * The clients flow, phases 6 and 7: the PID request pool, and deadlines that nest.
 *
 *   BASE=http://127.0.0.1:4021 PASSCODE=... node tools/clients-pid-deadlines.e2e.mjs   # SCRATCH database
 *
 * Re-runnable: every fixture carries this run's id. Split, like the repo's other suites, into what
 * must work and what must be refused.
 *
 * Roles (the seeded roster): mohit and yash = Super Admin (PID authorities), ankit.verma = Manager
 * (runs clients, sees client deadlines, cannot mint), ketan.dagar = SRA (on a client, no client
 * deadlines), ajay.sharma = Employee, hr = HR.
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
  const queue = async s => (await s('/projects/pid-requests')).data ?? [];
  const inQueue = async (s, projectId) => (await queue(s)).find(r => r.projectId === projectId);

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('PID requests are a pool, not one person');
  const a = await mgr('/projects', { method: 'POST', body: { title: `Pool A ${RUN}`, managerId: who.mgr } });
  ok('a manager creates a client WITHOUT naming who assigns the PID', a.status === 201 && !a.data?.code, brief(a));
  const aView = (await mgr(`/projects/${a.data.id}`)).data;
  ok('the client shows what it is waiting for', aView?.openPidRequest?.kind === 'NEW' && aView.openPidRequest.askedFirst === null, JSON.stringify(aView?.openPidRequest));
  ok('EVERY authority sees it — Mohit…', !!(await inQueue(su, a.data.id)));
  ok('…and Yash', !!(await inQueue(yash, a.data.id)));
  ok('a manager cannot open the queue', (await mgr('/projects/pid-requests')).status === 403);

  const b = await mgr('/projects', { method: 'POST', body: { title: `Pool B ${RUN}`, managerId: who.mgr, pidAssigneeId: who.yash } });
  ok('naming someone to ask first still works', b.status === 201, brief(b));
  const bForYash = await inQueue(yash, b.data.id), bForSu = await inQueue(su, b.data.id);
  ok('the named authority sees it marked as theirs, first in their queue',
    bForYash?.askedYou === true && (await queue(yash))[0]?.askedYou === true, JSON.stringify(bForYash)?.slice(0, 160));
  ok('the other authority sees it too, and who was asked', bForSu?.askedYou === false && bForSu?.askedFirst?.startsWith('Yash'), JSON.stringify(bForSu)?.slice(0, 160));
  const gen = await su('/projects/generate-pid', { method: 'POST' });
  const fb = await su(`/projects/pid-requests/${bForSu.id}/fulfill`, { method: 'POST', body: { pid: gen.data.pid } });
  ok('a DIFFERENT authority than the one asked can fulfil it', (fb.status === 201 || fb.status === 200) && fb.data?.pid === gen.data.pid, brief(fb));
  ok('…the client carries the PID', (await mgr(`/projects/${b.data.id}`)).data?.code === gen.data.pid);
  ok('…and the request is gone from every queue', !(await inQueue(yash, b.data.id)) && !(await inQueue(su, b.data.id)));

  step('a client never waits silently for a PID');
  const c = await su('/projects', { method: 'POST', body: { title: `Auth no PID ${RUN}` } });
  ok('an authority who skips "Generate PID" still leaves a request in the queue', !!(await inQueue(yash, c.data.id)), brief(c));
  const cReq = await inQueue(su, c.data.id);
  const att = await su(`/projects/${c.data.id}/attach-pid`, { method: 'POST', body: {} });
  ok('attaching a PID from the client page works', (att.status === 201 || att.status === 200) && !!att.data?.pid, brief(att));
  ok('…and closes the open request', !(await inQueue(su, c.data.id)));
  const stale = await yash(`/projects/pid-requests/${cReq.id}/fulfill`, { method: 'POST', body: {} });
  ok('fulfilling that stale request is refused, and the PID is NOT overwritten',
    stale.status === 400 && (await su(`/projects/${c.data.id}`)).data?.code === att.data.pid, brief(stale));

  const d = await mgr('/projects', { method: 'POST', body: { title: `Doomed ${RUN}`, managerId: who.mgr } });
  const dReq = await inQueue(su, d.data.id);
  await su(`/projects/${d.data.id}`, { method: 'DELETE' });
  ok('deleting a client takes its request out of the queue', !(await inQueue(su, d.data.id)));
  const dead = await su(`/projects/pid-requests/${dReq.id}/fulfill`, { method: 'POST', body: {} });
  ok('…and it cannot be fulfilled (no serial is burned on a deleted client)', dead.status === 400, brief(dead));

  ok('asking again for a client that already has an open request is refused',
    (await mgr(`/projects/${a.data.id}/pid-request`, { method: 'POST', body: {} })).status === 400);
  ok('asking for a PID for a client that has one is refused',
    (await mgr(`/projects/${b.data.id}/pid-request`, { method: 'POST', body: {} })).status === 400);
  // Raising the request just told every authority, so a nudge in the same hour is refused in
  // words. (The success path — a nudge after an hour — is the same rule the daily sweep uses,
  // covered without a clock in tools/pid-reminder.spec.ts.)
  const n1 = await mgr(`/projects/${a.data.id}/pid-request/nudge`, { method: 'POST' });
  ok('a nudge within the hour of being told is refused, in words', n1.status === 400 && /hour/i.test(n1.data?.message ?? ''), brief(n1));
  ok('HR cannot nudge', (await hr(`/projects/${a.data.id}/pid-request/nudge`, { method: 'POST' })).status === 403);
  ok('nudging a client with no open request is refused',
    (await mgr(`/projects/${b.data.id}/pid-request/nudge`, { method: 'POST' })).status === 400);
  const aReq = await inQueue(su, a.data.id);
  ok('the queue says how long a request has waited', typeof aReq?.waitingHours === 'number' && aReq.reminderCount === 0, JSON.stringify(aReq)?.slice(0, 200));

  step('asking for a PID change');
  const bad = await mgr(`/projects/${b.data.id}/pid-change-request`, { method: 'POST', body: { reason: 'Wrong number', suggestedPid: 'NOT-A-PID' } });
  ok('a suggested PID in the wrong format is refused', bad.status === 400, brief(bad));
  const same = await mgr(`/projects/${b.data.id}/pid-change-request`, { method: 'POST', body: { reason: 'Wrong number', suggestedPid: gen.data.pid } });
  ok('suggesting the PID it already has is refused', same.status === 400, brief(same));
  ok('an employee cannot ask for a change', (await emp(`/projects/${b.data.id}/pid-change-request`, { method: 'POST', body: { reason: 'x yz' } })).status === 403);
  ok('a client without a PID cannot ask for a CHANGE',
    (await mgr(`/projects/${a.data.id}/pid-change-request`, { method: 'POST', body: { reason: 'Wrong number' } })).status === 400);
  const ch = await mgr(`/projects/${b.data.id}/pid-change-request`, { method: 'POST', body: { reason: 'Invoiced under the wrong financial year' } });
  ok("the client's manager asks for a change, with a reason", (ch.status === 201 || ch.status === 200) && ch.data?.kind === 'CHANGE', brief(ch));
  const chReq = await inQueue(yash, b.data.id);
  ok('it lands in the shared queue as a change, with the reason and current PID',
    chReq?.kind === 'CHANGE' && chReq.reason === 'Invoiced under the wrong financial year' && chReq.currentPid === gen.data.pid, JSON.stringify(chReq)?.slice(0, 200));
  ok('a second request while one is open is refused',
    (await mgr(`/projects/${b.data.id}/pid-change-request`, { method: 'POST', body: { reason: 'Again please' } })).status === 400);
  ok('a change request cannot be "fulfilled" like a new PID — it is made with Change PID',
    (await yash(`/projects/pid-requests/${chReq.id}/fulfill`, { method: 'POST', body: {} })).status === 400);
  ok('declining needs a reason', (await yash(`/projects/pid-requests/${chReq.id}/decline`, { method: 'POST', body: { reason: '' } })).status === 400);
  const dec = await yash(`/projects/pid-requests/${chReq.id}/decline`, { method: 'POST', body: { reason: 'The FY is correct for this engagement' } });
  ok('an authority declines it with a reason', (dec.status === 201 || dec.status === 200) && dec.data?.declined, brief(dec));
  ok('…and it leaves the queue', !(await inQueue(yash, b.data.id)));
  const newReq = (await mgr('/projects/pid-requests')).status; // (manager cannot see the queue — asserted above)
  const ch2 = await mgr(`/projects/${b.data.id}/pid-change-request`, { method: 'POST', body: { reason: 'Client asked for a fresh number' } });
  ok('after a decline, the team may ask again', ch2.status === 201 || ch2.status === 200, brief(ch2));
  const next = await su('/projects/generate-pid', { method: 'POST' });
  // Give the reservation back: the move will reserve the number itself.
  const move = await su(`/projects/${b.data.id}/pid/reassign`, { method: 'POST', headers: { 'x-org-passcode': PASSCODE }, body: { pid: next.data.pid } });
  ok('an authority changes the PID with the existing Change PID route', move.status === 201 || move.status === 200, brief(move));
  ok('…which closes the open change request', !(await inQueue(su, b.data.id)));
  ok('…and the client carries the new number', (await mgr(`/projects/${b.data.id}`)).data?.code === next.data.pid);
  void newReq;

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

  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) { console.log('\nFailures:\n  ' + fails.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
