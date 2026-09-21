/**
 * THE TWO FLOWS' WORK NEVER MIXES, AND A ROUND TRIP CHANGES NOTHING.
 *
 *   BASE=http://127.0.0.1:4059 PASSCODE=<org passcode> node tools/workspace-flow-separation.e2e.mjs
 *
 * A SCRATCH DATABASE OF ITS OWN, restored from a clients-era dump, so the organisation starts in
 * the CLIENTS flow with real client work in it. The suite converts that organisation twice and
 * creates a project in between; never point it at a database anybody is using.
 *
 * The owner's rule: "I don't want the clients and projects data to collide, keep those data
 * separate." Every project/client row carries the flow it was made in, so switching flow HIDES one
 * flow's work and shows the other's instead of converting anything (docs/WORKSPACE_FLOWS.md,
 * "Each flow's work is its own"). Three things are pinned here, in this order:
 *
 *   1. A CENSUS OF THE CLIENT WORK — every client, every task under it with its seats, every hour
 *      logged against it — taken while the firm is in CLIENTS.
 *   2. SWITCHED TO PROJECTS, NONE OF IT IS ANYWHERE. The Projects module is empty, and empty in the
 *      ordinary way a new firm's is; the lists, the report, My Tasks, the day's time, the board,
 *      search and the client's own page all answer as if the client work were not there. A project
 *      is then built in PROJECTS, with a task, seats and logged time.
 *   3. SWITCHED BACK, THE CENSUS IS IDENTICAL, to the hour — and the project built in PROJECTS is
 *      nowhere in the clients screens. Then back to PROJECTS once more, where that project is
 *      still exactly as it was left.
 *
 * What this suite must NOT find is as important as what it finds: not one row of either flow may
 * appear on the other side of the line, and not one row may come back changed.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4059';
const PW = process.env.PW || 'sqip@1234';
const PASSCODE = process.env.PASSCODE || process.env.ORG_PASSCODE || 'sqip@infinity';
const ADMIN = process.env.ADMIN || 'mohit@squarkip.com';
const RUN = Date.now().toString(36).slice(-5);

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const step = h => console.log('\n— ' + h + ' —');
const brief = r => `${r.status} ${typeof r.data === 'string' ? r.data.slice(0, 200) : JSON.stringify(r.data)?.slice(0, 300)}`;
const list = d => (Array.isArray(d) ? d : d?.items ?? []);

function sess() {
  let cookie = '';
  return async (p, { method = 'GET', body, passcode } = {}) => {
    const headers = { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(passcode ? { 'x-org-passcode': passcode } : {}) };
    const r = await fetch(BASE + '/api/v1' + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}
const login = async (s, email) => (await s('/auth/login', { method: 'POST', body: { email, password: PW } })).status;
const idOf = async s => { const me = (await s('/auth/me')).data; return (me?.user ?? me)?.id; };

/**
 * Everything the firm's client work IS, in one comparable string: the clients, the tasks filed
 * under each, the seats on those tasks and every hour logged against them. Only fields a person
 * would notice going missing — no timestamps, nothing the database touches on its own — so that a
 * difference here is a difference somebody would see.
 */
async function census(s) {
  const projects = list((await s('/projects')).data)
    .slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const out = [];
  for (const p of projects) {
    const tasks = list((await s(`/tasks?projectId=${p.id}`)).data)
      .slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const time = list((await s(`/timesheets?projectId=${p.id}`)).data)
      .slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    out.push([
      `client ${p.id} ${p.code ?? '(no number)'} ${p.title} ${p.projectPhase} ${p.completionPercentage ?? ''}`,
      ...tasks.map(t => `  task ${t.id} ${t.title} ${t.currentStatus?.type ?? ''} ${t.dueDate ?? ''} `
        + (t.assignees ?? []).slice().sort((a, b) => String(a.userId).localeCompare(String(b.userId)))
          .map(a => `[${a.userId}:${a.role ?? ''}:${a.estimatedHours ?? ''}:${a.startDate ?? ''}]`).join('')),
      ...time.map(e => `  time ${e.id} ${String(e.date).slice(0, 10)} ${e.hoursLogged} ${e.billable} ${e.taskId ?? ''}`),
    ].join('\n'));
  }
  return { ids: projects.map(p => p.id), text: out.join('\n') };
}

/** The first line on which two censuses differ — a diff a person can read, not a wall of JSON. */
function firstDifference(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) return `line ${i + 1}\n        was: ${x[i] ?? '(nothing)'}\n        now: ${y[i] ?? '(nothing)'}`;
  }
  return '';
}

(async () => {
  const admin = sess();
  ok('the Super Admin signs in', [200, 201].includes(await login(admin, ADMIN)));
  const org = list((await admin('/organizations')).data)[0];
  if (!org?.id) { console.log('no organisation on this stack'); process.exit(2); }
  const ORG = org.id;
  const meId = await idOf(admin);
  const flowNow = async () => (await admin(`/organizations/${ORG}/workspace-flow`)).data?.flow;
  const convert = async to => admin(`/organizations/${ORG}/workspace-flow/convert`, {
    method: 'POST', passcode: PASSCODE,
    body: { to, confirm: org.name, backupTaken: true, note: `workspace-flow-separation.e2e ${RUN}` },
  });

  if (await flowNow() !== 'CLIENTS') {
    const c = await convert('CLIENTS');
    if (c.status >= 300) { console.log(`cannot start from CLIENTS: ${brief(c)}`); process.exit(2); }
  }
  ok('the organisation starts in the CLIENTS flow', await flowNow() === 'CLIENTS');

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('1. the client work, counted line by line');
  const before = await census(admin);
  ok('there are clients to lose', before.ids.length > 0, `${before.ids.length} clients`);
  console.log(`  ${before.ids.length} clients, ${before.text.split('\n').length} lines of work`);
  const clientIds = new Set(before.ids);
  const oneClient = before.ids[0];
  const clientTitle = list((await admin('/projects')).data).find(p => p.id === oneClient)?.title ?? '';
  const myClientTasks = list((await admin(`/tasks?userId=${meId}`)).data).map(t => t.id);
  const myClientTime = list((await admin(`/timesheets?userId=${meId}`)).data)
    .filter(e => clientIds.has(e.projectId)).map(e => e.id);
  ok('the task-group search is there in CLIENTS', (await admin('/task-groups?limit=5')).status === 200);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('2. CLIENTS → PROJECTS: the client work is nowhere, and a project is built instead');
  const toProjects = await convert('PROJECTS');
  ok('the conversion runs', toProjects.status < 300, brief(toProjects));
  ok('…and its own verification passes', toProjects.data?.verification?.ok === true,
    (toProjects.data?.verification?.invariants ?? []).filter(i => !i.ok).map(i => i.label).join(' · '));
  ok('…having changed no work at all',
    (toProjects.data?.verification?.invariants ?? []).find(i => i.key === 'work_untouched')?.ok === true);
  ok('the organisation runs PROJECTS', await flowNow() === 'PROJECTS');

  const emptied = list((await admin('/projects')).data);
  ok('the Projects module is empty', emptied.length === 0, `${emptied.length} still listed`);
  const report = (await admin('/projects/full-report')).data;
  ok('…so is the report', list(report?.projects ?? report).length === 0, JSON.stringify(report)?.slice(0, 200));
  ok('a client cannot be opened by its id', [403, 404].includes((await admin(`/projects/${oneClient}`)).status),
    String((await admin(`/projects/${oneClient}`)).status));
  const foundP = (await admin(`/search?q=${encodeURIComponent(clientTitle.slice(0, 12))}`)).data;
  ok('…and search does not find it either',
    !JSON.stringify(foundP?.projects ?? []).includes(oneClient), JSON.stringify(foundP?.projects ?? []).slice(0, 200));
  const myTasksP = list((await admin(`/tasks?userId=${meId}`)).data).map(t => t.id);
  ok('My Tasks holds none of the client tasks',
    myTasksP.every(id => !myClientTasks.includes(id)), myTasksP.filter(id => myClientTasks.includes(id)).join(','));
  const myTimeP = list((await admin(`/timesheets?userId=${meId}`)).data);
  ok('my time holds none of the client entries',
    myTimeP.every(e => !myClientTime.includes(e.id) && !clientIds.has(e.projectId)),
    myTimeP.filter(e => clientIds.has(e.projectId)).map(e => e.id).join(','));
  const boardP = (await admin('/capacity/team?days=14')).data;
  ok('the capacity board carries no client work',
    !before.ids.some(id => JSON.stringify(boardP ?? {}).includes(id)));
  ok('the task-group search does not exist in PROJECTS', (await admin('/task-groups?limit=5')).status === 404);
  ok('…but availability, which is neither flow’s, does',
    (await admin('/capacity/availability/preview', { method: 'POST', body: { userId: meId, hours: 4, days: 5 } })).status < 500);

  // A project, exactly as production makes one: a number, a task in the default list, seats, time.
  const pid = (await admin('/projects/generate-pid', { method: 'POST' })).data?.pid;
  const made = await admin('/projects', { method: 'POST', body: { title: `Separation ${RUN}`, pid, managerId: meId } });
  ok('a project is created in PROJECTS', made.status < 300, brief(made));
  const PROJECT = made.data?.id;
  const lists = list((await admin(`/projects/${PROJECT}/tasklists`)).data);
  const taskListId = (lists.find(l => l.isDefault) ?? lists[0])?.id;
  const task = await admin('/tasks', { method: 'POST', body: { title: `Separation task ${RUN}`, projectId: PROJECT, taskListId, createdBy: meId } });
  ok('…with a task in it', task.status < 300, brief(task));
  const seats = await admin(`/tasks/${task.data?.id}/staffing`, { method: 'PUT', body: { assignees: [{ userId: meId, role: 'ANALYST', estimatedHours: 4 }] } });
  ok('…somebody staffed on it', seats.status < 300, brief(seats));
  const logged = await admin('/timesheets', { method: 'POST', body: { taskId: task.data?.id, hoursLogged: 2, date: new Date().toISOString().slice(0, 10), notes: `separation ${RUN}` } });
  ok('…and time logged against it', logged.status < 300, brief(logged));
  const projectsCensus = await census(admin);
  ok('the Projects module holds the project just built', projectsCensus.ids.includes(PROJECT), projectsCensus.ids.join(','));
  ok('…and not one client', projectsCensus.ids.every(id => !clientIds.has(id)));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('3. PROJECTS → CLIENTS: every client, task, hour and seat exactly as it was');
  const backToClients = await convert('CLIENTS');
  ok('the conversion runs', backToClients.status < 300, brief(backToClients));
  ok('…having changed no work at all',
    (backToClients.data?.verification?.invariants ?? []).find(i => i.key === 'work_untouched')?.ok === true,
    JSON.stringify((backToClients.data?.verification?.invariants ?? []).find(i => i.key === 'work_untouched')));
  ok('the organisation runs CLIENTS again', await flowNow() === 'CLIENTS');

  const after = await census(admin);
  ok('every client is back', after.ids.join(',') === before.ids.join(','),
    `was ${before.ids.length}, now ${after.ids.length}`);
  ok('…and every task, seat and logged hour under them is unchanged',
    after.text === before.text, firstDifference(before.text, after.text));
  ok('the project built in PROJECTS is not among them', !after.ids.includes(PROJECT), String(PROJECT));
  ok('…and cannot be opened from here', [403, 404].includes((await admin(`/projects/${PROJECT}`)).status),
    String((await admin(`/projects/${PROJECT}`)).status));
  const myTasksC = list((await admin(`/tasks?userId=${meId}`)).data).map(t => t.id);
  ok('My Tasks does not hold the project task', !myTasksC.includes(task.data?.id));
  const myTimeC = list((await admin(`/timesheets?userId=${meId}`)).data);
  ok('…and my time does not hold the hour logged against it',
    !myTimeC.some(e => e.id === logged.data?.id), String(logged.data?.id));
  ok('the task-group search is back', (await admin('/task-groups?limit=5')).status === 200);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('…and the project work survived the same way round');
  const again = await convert('PROJECTS');
  ok('it converts to PROJECTS once more', again.status < 300, brief(again));
  const projectsAgain = await census(admin);
  ok('the project is exactly as it was left', projectsAgain.text === projectsCensus.text,
    firstDifference(projectsCensus.text, projectsAgain.text));
  ok('…and still no client is in sight', projectsAgain.ids.every(id => !clientIds.has(id)));

  step('housekeeping: the fixture is cleared and the stack left in CLIENTS, where it was found');
  if (task.data?.id) await admin(`/tasks/${task.data.id}`, { method: 'DELETE' });
  if (PROJECT) await admin(`/projects/${PROJECT}`, { method: 'DELETE' });
  ok('the project built here is cleared', !(await census(admin)).ids.includes(PROJECT));
  ok('it converts back', (await convert('CLIENTS')).status < 300);
  ok('…and the census still holds', (await census(admin)).text === before.text,
    firstDifference(before.text, (await census(admin)).text));

  console.log(`\n${fails.length ? '✗' : '✓'} workspace flow separation: ${passed} passed, ${fails.length} failed`);
  if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
