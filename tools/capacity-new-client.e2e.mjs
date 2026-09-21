/**
 * Team Capacity: starting a WHOLE piece of client work from the board.
 *
 *   BASE=http://127.0.0.1:4043 node tools/capacity-new-client.e2e.mjs      # a SCRATCH database
 *
 * The owner, Sep 2026: "in the team capacity option there is an option to create a new task; I want
 * the option to create a new client and its task groups and tasks, and then assigning the tasks to
 * the team, also the working hours of the team — like the whole team per task — and other stuff must
 * not collide, everything should be well structured."
 *
 * So this pins the four things that claim makes true:
 *
 *   · ONE call. POST /capacity/clients makes the client, its CID, every task group, every task in
 *     them and every seat — and the board then shows exactly that.
 *   · ALL of it or NONE of it. A refused seat (two PMs, somebody who is not in the organisation) or
 *     a date the server will not take leaves no client, no task group, no task, no membership and
 *     no CID spent — even when the refusal is in the LAST group, after earlier ones were written.
 *   · The WALL. Employee and HR are refused (HR may look at the board and change nothing on it),
 *     and so is anybody holding the board without the right to start a client.
 *   · The HOURS. What the assignment dialog was told before saving — POST /capacity/availability
 *     /preview — is what the board draws afterwards, day for day.
 *
 * Every fixture carries this run's id, so the suite can be re-run on the same database. It creates
 * clients, so never point it at a database that is being demonstrated.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4043';
const PW = process.env.PW || 'sqip@1234';
const RUN = Date.now().toString(36).slice(-5);

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const step = h => console.log('\n— ' + h + ' —');
const brief = r => `${r.status} ${typeof r.data === 'string' ? r.data.slice(0, 160) : JSON.stringify(r.data)?.slice(0, 260)}`;
const msg = r => (Array.isArray(r.data?.message) ? r.data.message.join('; ') : r.data?.message ?? '');

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
const near = (a, b, tol = 0.15) => Math.abs((a ?? 0) - (b ?? 0)) <= tol;
/** The serial at the end of a CID (SQ_26_27_013 → 13). */
const serialOf = cid => Number(String(cid ?? '').split('_').pop());

(async () => {
  const su = sess(), sc = sess(), emp = sess(), hr = sess();
  const who = {};
  for (const [s, email, key] of [
    [su, 'mohit@squarkip.com', 'su'], [sc, 'ankit.verma@squarkip.com', 'sc'],
    [emp, 'poorvi.gupta@squarkip.com', 'emp'], [hr, 'hr@squarkip.com', 'hr'],
  ]) {
    const r = await s('/auth/login', { method: 'POST', body: { email, password: PW } });
    who[key] = r.data?.user?.id;
    if (!who[key]) { console.log(`cannot log in as ${email}: ${brief(r)}`); process.exit(2); }
  }

  /** Every live client of this organisation whose title is exactly `t` — the orphan detector. */
  const clientsTitled = async t => ((await su('/projects')).data ?? []).filter(p => p.title === t);
  const groupsOf = async id => (await su(`/projects/${id}/tasklists`)).data ?? [];
  const tasksOf = async id => (await su(`/tasks?projectId=${id}`)).data ?? [];

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('the wall: who may start a piece of client work from the board');
  const minimal = t => ({ title: t, groups: [{ name: `Work ${RUN}`, dueDate: dayKey(20) }] });

  const empTry = await emp('/capacity/clients', { method: 'POST', body: minimal(`Employee try ${RUN}`) });
  ok('an Employee is refused (no capacity.manage)', empTry.status === 403, brief(empTry));
  ok('…and nothing of theirs was created', (await clientsTitled(`Employee try ${RUN}`)).length === 0);

  const hrBoard = await hr('/capacity/team?days=7');
  ok('HR may still READ the board', hrBoard.status === 200, brief(hrBoard));
  const hrTry = await hr('/capacity/clients', { method: 'POST', body: minimal(`HR try ${RUN}`) });
  ok('…but HR is refused the new client', hrTry.status === 403, brief(hrTry));
  ok('…and nothing of theirs was created', (await clientsTitled(`HR try ${RUN}`)).length === 0);

  const noGroups = await sc('/capacity/clients', { method: 'POST', body: { title: `No work ${RUN}`, groups: [] } });
  ok('a client with no piece of work at all is refused', noGroups.status === 400, brief(noGroups));
  ok('…and nothing was created', (await clientsTitled(`No work ${RUN}`)).length === 0);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('the hours, before: what the dialog is told');
  const board0 = (await sc('/capacity/team?days=21')).data;
  ok('the board answers the Senior Consultant', !!board0?.rows?.length, brief({ status: 0, data: board0?.from }));
  // Somebody with room, who is NOT the creator: their seat must also ADD them to the new client.
  const free = [...board0.rows].filter(r => r.userId !== who.sc).sort((a, b) => b.freeHours - a.freeHours)[0];
  const mate = [...board0.rows].filter(r => r.userId !== who.sc && r.userId !== free.userId).sort((a, b) => b.freeHours - a.freeHours)[0];
  ok('two people with room to plan against', !!free && !!mate, `${free?.name} / ${mate?.name}`);

  const seatStart = dayKey(1), groupDue = dayKey(18);
  // Explicit start and hours-a-day, so the placement is not a guess: 6h at 2h a day from tomorrow.
  const seat = { userId: free.userId, hours: 6, startDate: seatStart, dueDate: groupDue, hoursPerDay: 2 };
  const pre = await sc('/capacity/availability/preview', { method: 'POST', body: { seats: [seat], projectId: null } });
  // A POST that only reads: Nest answers 201 for a POST, which is what the dialog gets too.
  ok('the preview answers for that person', pre.status < 300 && pre.data?.seats?.length === 1, brief(pre));
  const preview = pre.data.seats[0];
  ok('it reports their whole week, not this client’s', preview.capacityHours > 0 && preview.requestedHours === 6,
    `cap ${preview.capacityHours} req ${preview.requestedHours} free ${preview.freeHours}`);
  // The committed hours it counts ARE the board's, over the same days.
  const loadOn = (row, from, to) => row.days.filter(d => d.date >= from && d.date <= to && d.capacity > 0)
    .reduce((n, d) => n + d.load, 0);
  ok('its committed hours are the board’s own, over the same days',
    near(preview.committedHours, loadOn(free, preview.from, preview.to), 0.2),
    `preview ${preview.committedHours} vs board ${loadOn(free, preview.from, preview.to)}`);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('one call: a client, its task groups, their tasks and the people on them');
  const title = `Capacity new client ${RUN}`;
  const body = {
    title,
    priority: 'HIGH',
    managerId: who.sc,
    groups: [
      {
        name: `FTO – Widget ${RUN}`,
        groupType: 'FTO',
        startDate: dayKey(0),
        dueDate: groupDue,
        tasks: [
          {
            title: `Understanding + KFs ${RUN}`,
            seats: [
              { userId: free.userId, role: 'ANALYST', estimatedHours: 6, startDate: seatStart, dueDate: groupDue, hoursPerDay: 2 },
              { userId: who.sc, role: 'PM', estimatedHours: 2, startDate: seatStart },
            ],
          },
          { title: `Search ${RUN}`, dueDate: dayKey(12), seats: [{ userId: mate.userId, estimatedHours: 4, startDate: seatStart }] },
          { title: `Report ${RUN}`, seats: [] },
        ],
      },
      {
        name: `Novelty follow-up ${RUN}`,
        startDate: dayKey(5),
        dueDate: dayKey(30),
        tasks: [{ title: `Second opinion ${RUN}`, seats: [{ userId: mate.userId, role: 'REVIEWER', estimatedHours: 3, startDate: dayKey(6) }] }],
      },
    ],
  };
  const made = await sc('/capacity/clients', { method: 'POST', body });
  ok('a Senior Consultant creates the whole thing', made.status === 201 && !!made.data?.client?.id, brief(made));
  const client = made.data?.client;
  if (!client) { console.log('\ncannot continue without the client'); process.exit(1); }
  ok('it was given a CID in the same breath', /^[A-Z0-9]+_\d{2}_\d{2}_\d+$/.test(client.code ?? ''), String(client.code));
  ok('the answer counts what it made', made.data.groups?.length === 2 && made.data.taskCount === 4,
    JSON.stringify({ groups: made.data.groups?.length, tasks: made.data.taskCount }));

  const groups = await groupsOf(client.id);
  ok('both task groups are there, the first one the default',
    groups.length === 2 && groups.find(g => g.name === `FTO – Widget ${RUN}`)?.isDefault === true,
    JSON.stringify(groups.map(g => [g.name, g.isDefault, g.groupType])));
  ok('the first carries its type of work', groups.find(g => g.isDefault)?.groupType === 'FTO');

  const tasks = await tasksOf(client.id);
  ok('four tasks, and no duplicates of the type’s standard ones', tasks.length === 4,
    JSON.stringify(tasks.map(t => t.title)));
  const kfs = tasks.find(t => t.title === `Understanding + KFs ${RUN}`);
  const search = tasks.find(t => t.title === `Search ${RUN}`);
  const second = tasks.find(t => t.title === `Second opinion ${RUN}`);
  ok('a task with no date of its own took its group’s deadline', kfs?.dueDate?.slice(0, 10) === groupDue, String(kfs?.dueDate));
  ok('a task with its own deadline kept it', search?.dueDate?.slice(0, 10) === dayKey(12), String(search?.dueDate));
  ok('the whole team is on one task — a seat each',
    (kfs?.assignees ?? []).length === 2 && kfs.assignees.some(a => a.role === 'PM') && kfs.assignees.some(a => a.role === 'ANALYST'),
    JSON.stringify((kfs?.assignees ?? []).map(a => [a.role, a.estimatedHours])));
  const mine = (kfs?.assignees ?? []).find(a => a.userId === free.userId);
  ok('the seat carries the hours, the start and the hours a day',
    mine?.estimatedHours === 6 && mine?.startDate?.slice(0, 10) === seatStart && mine?.hoursPerDay === 2,
    JSON.stringify(mine));
  ok('the task’s estimate is the sum of its seats', kfs?.estimatedHours === 8, String(kfs?.estimatedHours));
  ok('one person can be on several tasks, in several groups',
    [search, second].every(t => (t?.assignees ?? []).some(a => a.userId === mate.userId)));

  const full = (await su(`/projects/${client.id}`)).data;
  const memberIds = (full?.members ?? []).filter(m => m.isActive).map(m => m.userId);
  ok('people who were not on the client were added to it',
    memberIds.includes(free.userId) && memberIds.includes(mate.userId),
    JSON.stringify(made.data.addedToClient));
  ok('and the named manager manages it',
    (full?.members ?? []).find(m => m.userId === who.sc)?.projectRole === 'MANAGER');

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('the hours, after: the board draws what the dialog promised');
  const board1 = (await sc('/capacity/team?days=21')).data;
  const after = board1.rows.find(r => r.userId === free.userId);
  ok('their new task is on the board, under this client',
    (after?.openTasks ?? []).some(t => t.title === `Understanding + KFs ${RUN}` && t.projectId === client.id),
    JSON.stringify((after?.openTasks ?? []).map(t => t.title).slice(0, 6)));
  const before = new Map(free.days.map(d => [d.date, d.load]));
  const predicted = preview.days.filter(d => d.add > 0.05);
  ok('the preview said which days it would land on', predicted.length > 0, JSON.stringify(preview.days.slice(0, 5)));
  const off = predicted
    .map(d => ({ date: d.date, add: d.add, delta: (after.days.find(x => x.date === d.date)?.load ?? 0) - (before.get(d.date) ?? 0) }))
    .filter(x => !near(x.add, x.delta));
  ok('…and every one of them moved by exactly that much', off.length === 0, JSON.stringify(off));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('all of it, or none of it');
  const cidBefore = serialOf(client.code);

  const badSeat = `Two PMs ${RUN}`;
  const twoPms = await sc('/capacity/clients', { method: 'POST', body: {
    title: badSeat,
    groups: [
      { name: `First ${RUN}`, dueDate: groupDue, tasks: [{ title: `Fine ${RUN}`, seats: [{ userId: free.userId, estimatedHours: 2 }] }] },
      // The refusal is in the LAST group, after the first one has already been written.
      { name: `Second ${RUN}`, dueDate: groupDue, tasks: [{ title: `Bad ${RUN}`, seats: [
        { userId: free.userId, role: 'PM', estimatedHours: 1 }, { userId: mate.userId, role: 'PM', estimatedHours: 1 },
      ] }] },
    ],
  } });
  ok('a task with two PMs is refused, in words', twoPms.status === 400 && /only one manager/i.test(msg(twoPms)), brief(twoPms));
  ok('…and the client it was going to belong to does not exist', (await clientsTitled(badSeat)).length === 0);

  const strangerTitle = `Stranger ${RUN}`;
  const stranger = await sc('/capacity/clients', { method: 'POST', body: {
    title: strangerTitle,
    groups: [{ name: `Work ${RUN}`, dueDate: groupDue, tasks: [{ title: `T ${RUN}`, seats: [{ userId: 'nobody-at-all', estimatedHours: 1 }] }] }],
  } });
  ok('a seat naming somebody who is not in the organisation is refused',
    stranger.status === 400 && /not active members/i.test(msg(stranger)), brief(stranger));
  ok('…and left no client behind', (await clientsTitled(strangerTitle)).length === 0);

  const lateTitle = `Late task ${RUN}`;
  const late = await sc('/capacity/clients', { method: 'POST', body: {
    title: lateTitle,
    groups: [{ name: `Bounded ${RUN}`, dueDate: dayKey(10), tasks: [
      { title: `Inside ${RUN}`, dueDate: dayKey(9), seats: [] },
      { title: `Outside ${RUN}`, dueDate: dayKey(25), seats: [] },
    ] }],
  } });
  ok('a task cannot be due after its task group', late.status === 400 && /cannot be due later/i.test(msg(late)), brief(late));
  ok('…and neither the group nor the client survives it', (await clientsTitled(lateTitle)).length === 0);

  const invertedTitle = `Inverted ${RUN}`;
  const inverted = await sc('/capacity/clients', { method: 'POST', body: {
    title: invertedTitle,
    groups: [{ name: `Backwards ${RUN}`, startDate: dayKey(20), dueDate: dayKey(5) }],
  } });
  ok('a task group whose deadline is before its start is refused',
    inverted.status === 400 && /before the start/i.test(msg(inverted)), brief(inverted));
  ok('…and left nothing behind', (await clientsTitled(invertedTitle)).length === 0);

  const seatBackTitle = `Seat backwards ${RUN}`;
  const seatBack = await sc('/capacity/clients', { method: 'POST', body: {
    title: seatBackTitle,
    groups: [{ name: `Work ${RUN}`, dueDate: groupDue, tasks: [{ title: `T ${RUN}`, seats: [
      { userId: free.userId, estimatedHours: 2, startDate: dayKey(9), dueDate: dayKey(3) },
    ] }] }],
  } });
  ok('a seat that starts after it is due is refused',
    seatBack.status === 400 && /start date cannot be after/i.test(msg(seatBack)), brief(seatBack));
  ok('…and left nothing behind', (await clientsTitled(seatBackTitle)).length === 0);

  // Four refusals took a CID reservation each and gave every one of them back.
  const nextTitle = `Next in the series ${RUN}`;
  const next = await sc('/capacity/clients', { method: 'POST', body: {
    title: nextTitle, groups: [{ name: `Work ${RUN}`, dueDate: groupDue }],
  } });
  ok('the next client is created', next.status === 201, brief(next));
  ok('…and takes the very next CID — no refusal spent a number',
    serialOf(next.data?.client?.code) === cidBefore + 1,
    `${client.code} then ${next.data?.client?.code}`);
  const bare = await groupsOf(next.data.client.id);
  ok('a group with no tasks and no type is still the client’s default group',
    bare.length === 1 && bare[0].isDefault === true && bare[0].name === `Work ${RUN}`,
    JSON.stringify(bare.map(g => [g.name, g.isDefault])));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('a typed group with no tasks of its own still brings its standard ones');
  const stdTitle = `Standard tasks ${RUN}`;
  const std = await sc('/capacity/clients', { method: 'POST', body: {
    title: stdTitle, groups: [{ name: `FTO ${RUN}`, groupType: 'FTO', dueDate: groupDue }],
  } });
  ok('it is created', std.status === 201, brief(std));
  const stdTasks = await tasksOf(std.data?.client?.id ?? '');
  ok('the type’s standard tasks are inside it', stdTasks.length > 0 && std.data.taskCount === stdTasks.length,
    `${stdTasks.length} tasks, answer said ${std.data.taskCount}`);
  ok('…dated to the group', stdTasks.every(t => t.dueDate?.slice(0, 10) === groupDue));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('housekeeping');
  // Every client this suite makes is a live client with people on it, and a seat PUTS somebody on
  // a client they were not on. Another suite that looks for "somebody not on this client" would
  // otherwise find its outsider quietly enrolled here. So the fixtures go.
  const fixtures = [client.id, next.data?.client?.id, std.data?.client?.id].filter(Boolean);
  let cleared = 0;
  for (const id of fixtures) if ((await su(`/projects/${id}`, { method: 'DELETE' })).status < 300) cleared++;
  ok('the fixture clients are cleared', cleared === fixtures.length, `${cleared} of ${fixtures.length}`);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) { console.log('\nFAILURES:\n' + fails.map(f => '  · ' + f).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
