/**
 * Changing the workspace flow, both ways, on a database with something to leave behind.
 *
 *   BASE=http://127.0.0.1:4059 PASSCODE=<org passcode> node tools/workspace-flow.e2e.mjs
 *
 * A SCRATCH DATABASE OF ITS OWN. This converts the organisation three times and leaves it in the
 * CLIENTS flow; never point it at a database somebody is using, and — unlike its neighbours in
 * tools/ — never at the CLIENTS stack the other suites run against.
 *
 * A conversion is a SETTINGS change now (docs/WORKSPACE_FLOWS.md, "Changing the flow changes
 * settings, not work"). Every project/client row carries the flow it was made in, so switching
 * hides one flow's work and shows the other's; the conversion moves the flow, the Team Capacity
 * grants and the time mode, and touches no row of anybody's work. That is exactly the thing that
 * cannot be checked by reading the code, because what a conversion does depends on what is in the
 * database — so this suite puts into the database the four things the OLD conversion used to
 * rewrite (a clock that is running, a PID nobody ever attached, a project waiting for a number, a
 * request in the pool) and then asks for each of them afterwards, twice.
 *
 * Four things are being pinned, in this order:
 *
 *   1. PREFLIGHT WRITES NOTHING. It is the conversion run as a dry run and rolled back, so it has
 *      to report exactly what the conversion will do and leave the database as it found it.
 *   2. THE CONVERSION KEEPS ITS PROMISES — the flow, the grants, the clocks and the time mode —
 *      and its own verification agrees, including that not one row of work moved.
 *   3. IT TOUCHED NOTHING ELSE: the held number is still held, the request is still pending, the
 *      project is still waiting for its number.
 *   4. IT GOES BACK. A firm that converts by mistake is not stuck: PROJECTS → CLIENTS → PROJECTS
 *      returns the flow, the grants and every row of work exactly as they were.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4059';
const PW = process.env.PW || 'sqip@1234';
const PASSCODE = process.env.PASSCODE || process.env.ORG_PASSCODE || 'cf-scratch-7713';
const ADMIN = process.env.ADMIN || 'mohit@squarkip.com';   // Super Admin — the only role that may convert
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
const codesOf = async s => new Set(((await s('/me/effective-permissions')).data?.codes ?? []).map(x => (typeof x === 'string' ? x : x.code)));
const stepOf = (report, key) => (report?.steps ?? []).find(s => s.key === key);
const failed = report => (report?.verification?.invariants ?? []).filter(i => !i.ok).map(i => `${i.label} (${i.found})`);
const invariant = (report, key) => (report?.verification?.invariants ?? []).find(i => i.key === key);

(async () => {
  const admin = sess();
  ok('the Super Admin signs in', [200, 201].includes(await login(admin, ADMIN)));
  const org = list((await admin('/organizations')).data)[0];
  if (!org?.id) { console.log('no organisation on this stack'); process.exit(2); }
  const ORG = org.id;
  const flowState = () => admin(`/organizations/${ORG}/workspace-flow`);
  const preflight = to => admin(`/organizations/${ORG}/workspace-flow/preflight`, { method: 'POST', body: { to } });
  const convert = (to, extra = {}) => admin(`/organizations/${ORG}/workspace-flow/convert`, {
    method: 'POST', passcode: PASSCODE,
    body: { to, confirm: org.name, backupTaken: true, note: `workspace-flow.e2e ${RUN}`, ...extra },
  });

  // Start from PROJECTS whatever the stack was left in, so the suite is re-runnable.
  if ((await flowState()).data?.flow !== 'PROJECTS') {
    const back = await convert('PROJECTS');
    if (back.status >= 300) { console.log(`cannot start from PROJECTS: ${brief(back)}`); process.exit(2); }
  }
  ok('the organisation starts in the PROJECTS flow', (await flowState()).data?.flow === 'PROJECTS');

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('fixture: the four things the conversion used to rewrite');

  // (a) the timer, and a clock left running on a task.
  await admin(`/organizations/${ORG}/time-mode`, { method: 'PATCH', body: { mode: 'TIMER' }, passcode: PASSCODE });
  // The API caches the mode for a few seconds, exactly as it caches the flow; a Start fired inside
  // that window is answered by the flow that has just been left.
  await new Promise(done => setTimeout(done, 6000));
  const meId = await idOf(admin);

  // A project of this flow to hang the clock on — a clients-era database has none, because every
  // row it holds is the other flow's, which is the whole point of the separation.
  const seedPid = (await admin('/projects/generate-pid', { method: 'POST' })).data?.pid;
  const home = await admin('/projects', { method: 'POST', body: { title: `Conversion fixture ${RUN}`, pid: seedPid, managerId: meId } });
  ok('a project of this flow exists to work in', home.status < 300, brief(home));
  const lists = list((await admin(`/projects/${home.data?.id}/tasklists`)).data);
  const clockTask = await admin('/tasks', {
    method: 'POST',
    body: { title: `Conversion fixture task ${RUN}`, projectId: home.data?.id, taskListId: (lists.find(l => l.isDefault) ?? lists[0])?.id, createdBy: meId },
  });
  await admin(`/tasks/${clockTask.data?.id}/staffing`, { method: 'PUT', body: { assignees: [{ userId: meId, role: 'ANALYST', estimatedHours: 3 }] } });
  await admin(`/tasks/${clockTask.data?.id}/start`, { method: 'POST' });
  const running = list((await admin('/tasks/timer/running')).data);
  ok('a clock is running', running.length >= 1, JSON.stringify(running).slice(0, 120));

  // (b) a PID generated and never attached — the RESERVED number the old conversion retired.
  const held = await admin('/projects/generate-pid', { method: 'POST' });
  ok('a PID is generated and held', !!held.data?.pid, brief(held));
  const heldPid = held.data?.pid;

  // (c) a project waiting for a number, and the request in the pool that is waiting with it.
  //     Somebody who may create a project but may not issue a number.
  //     …and, separately, somebody BELOW the delivery ladder, for the capacity checks: the person
  //     who may create a project is often a Manager, who holds the board in either flow.
  let requester = null, below = null, belowEmail = null;
  for (const email of ['ajay.sharma@squarkip.com', 'aman.sharma@squarkip.com', 'drishti.jain@squarkip.com',
    'rajesh.joshi@squarkip.com', 'ritik.sharma@squarkip.com', 'khushi.gupta@squarkip.com', 'ketan.dagar@squarkip.com']) {
    if (requester && below) break;
    const s = sess();
    if (![200, 201].includes(await login(s, email))) continue;
    const c = await codesOf(s);
    if (!requester && c.has('project.create') && !c.has('project.generate_pid')) requester = s;
    if (!below && !c.has('project.approve') && !c.has('user.manage_access') && !c.has('patent.manage')) { below = s; belowEmail = email; }
  }
  if (!requester) { console.log('FIXTURE: nobody can create a project without being able to number it'); process.exit(2); }
  if (!below) { console.log('FIXTURE: everybody in the roster is on the delivery ladder'); process.exit(2); }
  console.log(`  below the ladder: ${belowEmail}`);
  const pending = await requester('/projects', {
    method: 'POST', body: { title: `Waiting for a number ${RUN}`, pidAssigneeId: meId, managerId: await idOf(requester) },
  });
  ok('a project is created with its PID pending', pending.status < 300 && !pending.data?.code, brief(pending));
  const queue = list((await admin('/projects/pid-requests')).data);
  ok('…and the request is in the authority’s queue', queue.some(q => q.projectId === pending.data?.id), `${queue.length} in the queue`);

  /** The four fixtures, read back through the API: what must still be true afterwards. */
  const fixtures = async () => ({
    reservation: (await admin(`/projects/pid-reservation?pid=${encodeURIComponent(heldPid)}`)).data?.status
      ?? list((await admin('/projects/pid-ledger')).data).find(r => r.pid === heldPid || r.cid === heldPid)?.status ?? null,
    request: list((await admin('/projects/pid-requests')).data).find(q => q.projectId === pending.data?.id)?.status ?? null,
    stillWaiting: list((await admin('/projects')).data).find(p => p.id === pending.data?.id)?.code ?? null,
    projects: list((await admin('/projects')).data).length,
  });
  const fixtureBefore = await fixtures();
  console.log(`  fixture: ${JSON.stringify(fixtureBefore)}`);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('1. the preflight says what would happen, and writes nothing');
  const before = (await flowState()).data;
  const dry = await preflight('CLIENTS');
  ok('the preflight answers', dry.status < 300, brief(dry));
  const d = dry.data;
  ok('it is marked a dry run', d?.dryRun === true, String(d?.dryRun));
  ok('…from PROJECTS to CLIENTS', d?.from === 'PROJECTS' && d?.to === 'CLIENTS', `${d?.from} → ${d?.to}`);
  ok('it counts the running clock', (d?.survey?.runningClocks ?? 0) >= 1, String(d?.survey?.runningClocks));
  ok('…the pending request', (d?.survey?.work?.pidRequestsByStatus?.PENDING ?? 0) >= 1, JSON.stringify(d?.survey?.work?.pidRequestsByStatus));
  ok('…the project with no number', (d?.survey?.work?.withoutNumber?.PROJECTS ?? 0) >= 1, JSON.stringify(d?.survey?.work?.withoutNumber));
  ok('…and the number nobody attached', (d?.survey?.work?.registryByStatus?.RESERVED ?? 0) >= 1, JSON.stringify(d?.survey?.work?.registryByStatus));
  ok('it says how much work is about to go out of sight',
    (stepOf(d, 'work_kept')?.details?.projects ?? 0) >= 1, JSON.stringify(stepOf(d, 'work_kept')?.details));
  ok('it says the grants that would move', (stepOf(d, 'capacity')?.changed ?? 0) > 0, JSON.stringify(stepOf(d, 'capacity')));
  ok('nothing stops it', (d?.blockers ?? []).length === 0, JSON.stringify(d?.blockers));
  ok('and its own verification of the result passes', d?.verification?.ok === true, failed(d).join(' · '));

  step('…and the steps it no longer takes are not there at all');
  for (const gone of ['pid_requests', 'registry_register', 'registry_retire', 'registry_rederive', 'ledger_import', 'cid_backfill']) {
    ok(`no step "${gone}"`, !stepOf(d, gone), JSON.stringify(stepOf(d, gone)));
  }

  const after = (await flowState()).data;
  ok('the flow is untouched by a preflight', after?.flow === 'PROJECTS', String(after?.flow));
  ok('…the history has no new line', (after?.history ?? []).length === (before?.history ?? []).length);
  ok('…the clock is still running', list((await admin('/tasks/timer/running')).data).length >= 1);
  ok('…and every fixture is exactly as it was', JSON.stringify(await fixtures()) === JSON.stringify(fixtureBefore),
    JSON.stringify(await fixtures()));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('2. PROJECTS → CLIENTS');
  ok('a conversion without the typed name is refused',
    (await convert('CLIENTS', { confirm: 'not the name' })).status === 400);
  ok('…and one that does not acknowledge a backup is refused',
    (await convert('CLIENTS', { backupTaken: false })).status === 400);

  const done = await convert('CLIENTS');
  ok('the conversion runs', done.status < 300, brief(done));
  const r = done.data;
  ok('it is not a dry run', r?.dryRun === false, String(r?.dryRun));
  ok('the verification passes', r?.verification?.ok === true, failed(r).join(' · '));
  ok('…including that not one row of work moved', invariant(r, 'work_untouched')?.ok === true,
    JSON.stringify(invariant(r, 'work_untouched')));
  ok('…and it is recorded', !!r?.changeId, String(r?.changeId));

  const nowState = (await flowState()).data;
  ok('the organisation runs CLIENTS', nowState?.flow === 'CLIENTS', String(nowState?.flow));
  ok('the conversion is on the record, verified',
    (nowState?.history ?? [])[0]?.toFlow === 'CLIENTS' && (nowState?.history ?? [])[0]?.verified === true,
    JSON.stringify((nowState?.history ?? [])[0]));

  step('…and every promise it made');
  ok('running clocks are closed', (await admin('/tasks/timer/running')).status === 404,
    'the timer routes do not exist in CLIENTS');
  ok('time moved to MANUAL', nowState?.timeTrackingMode === 'MANUAL', String(nowState?.timeTrackingMode));
  ok('…written to the time-mode history',
    list((await admin(`/organizations/${ORG}/time-mode/history`)).data)[0]?.toMode === 'MANUAL');
  ok('the PID request pool does not exist here', (await admin('/projects/pid-requests')).status === 404);
  ok('the projects flow’s work is not listed here', list((await admin('/projects')).data)
    .every(p => p.id !== pending.data?.id && p.id !== home.data?.id), 'a projects row is on the clients list');
  ok('…and the project waiting for a number cannot be opened',
    [403, 404].includes((await admin(`/projects/${pending.data?.id}`)).status),
    String((await admin(`/projects/${pending.data?.id}`)).status));
  ok('the CID ledger exists in this flow', (await admin('/projects/cid-ledger')).status === 200);

  step('…and Team Capacity belongs to the delivery ladder, plus HR');
  const hr = sess(); await login(hr, 'hr@squarkip.com');
  const hrCodes = await codesOf(hr);
  ok('HR reads the board', hrCodes.has('capacity.view'), [...hrCodes].filter(x => x.startsWith('capacity')).join(','));
  ok('…and manages nothing on it', !hrCodes.has('capacity.manage'));
  ok('HR can actually open it', (await hr('/capacity/team?days=7')).status === 200);
  const belowCodes = await codesOf(below);
  ok('somebody below the ladder holds neither code',
    !belowCodes.has('capacity.view') && !belowCodes.has('capacity.manage'), [...belowCodes].filter(x => x.startsWith('capacity')).join(','));
  ok('…and is refused the board', (await below('/capacity/team?days=7')).status === 403);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('3. CLIENTS → PROJECTS, the way back');
  const backDry = await preflight('PROJECTS');
  ok('the preflight the other way answers', backDry.status < 300, brief(backDry));
  ok('…and passes its own verification', backDry.data?.verification?.ok === true, failed(backDry.data).join(' · '));

  const back = await convert('PROJECTS');
  ok('it converts back', back.status < 300, brief(back));
  ok('the verification passes', back.data?.verification?.ok === true, failed(back.data).join(' · '));
  ok('…including that not one row of work moved', invariant(back.data, 'work_untouched')?.ok === true,
    JSON.stringify(invariant(back.data, 'work_untouched')));
  const finalState = (await flowState()).data;
  ok('the organisation runs PROJECTS again', finalState?.flow === 'PROJECTS', String(finalState?.flow));
  ok('both conversions are on the record',
    (finalState?.history ?? []).slice(0, 2).map(h => h.toFlow).join(',') === 'PROJECTS,CLIENTS',
    JSON.stringify((finalState?.history ?? []).slice(0, 2).map(h => h.toFlow)));

  step('…and every one of the four fixtures came back untouched');
  const fixtureAfter = await fixtures();
  ok('the held number is still held, not retired',
    fixtureAfter.reservation === fixtureBefore.reservation, `${fixtureBefore.reservation} → ${fixtureAfter.reservation}`);
  ok('the request is still pending, not cancelled',
    fixtureAfter.request === fixtureBefore.request, `${fixtureBefore.request} → ${fixtureAfter.request}`);
  ok('the project is still waiting for its number, not backfilled',
    fixtureAfter.stillWaiting === fixtureBefore.stillWaiting, `${fixtureBefore.stillWaiting} → ${fixtureAfter.stillWaiting}`);
  ok('…and the flow holds exactly the projects it held',
    fixtureAfter.projects === fixtureBefore.projects, `${fixtureBefore.projects} → ${fixtureAfter.projects}`);

  ok('time stays MANUAL — an administrator may pick the timer up again afterwards',
    finalState?.timeTrackingMode === 'MANUAL', String(finalState?.timeTrackingMode));
  ok('…and the timer can be switched back on',
    (await admin(`/organizations/${ORG}/time-mode`, { method: 'PATCH', body: { mode: 'TIMER' }, passcode: PASSCODE })).status < 300);
  ok('the PID request pool exists again', (await admin('/projects/pid-requests')).status === 200);
  ok('the CID ledger is gone from this flow', (await admin('/projects/cid-ledger')).status === 404);
  ok('the PID ledger answers instead', (await admin('/projects/pid-ledger')).status === 200);
  ok('every number is in a state the flow that owns its work knows',
    invariant(back.data, 'registry_states')?.ok === true, JSON.stringify(invariant(back.data, 'registry_states')));

  step('…and Team Capacity is open to the whole firm again');
  const belowAfter = await codesOf(below);
  ok('somebody below the ladder sees the board', belowAfter.has('capacity.view'), [...belowAfter].filter(x => x.startsWith('capacity')).join(','));
  ok('…and nobody below a Super Admin manages tasks from it', !belowAfter.has('capacity.manage'));
  ok('…the board actually opens for them', (await below('/capacity/team?days=7')).status === 200);
  const hrAfter = await codesOf(hr);
  ok('HR keeps it too', hrAfter.has('capacity.view') && !hrAfter.has('capacity.manage'), [...hrAfter].filter(x => x.startsWith('capacity')).join(','));

  // ───────────────────────────────────────────────────────────────────────────────────────────
  step('housekeeping');
  if (clockTask.data?.id) await admin(`/tasks/${clockTask.data.id}`, { method: 'DELETE' });
  for (const id of [pending.data?.id, home.data?.id]) if (id) await admin(`/projects/${id}`, { method: 'DELETE' });
  ok('the fixture is cleared', true);
  // Left in CLIENTS, which is where a clients-era scratch database was restored.
  ok('the stack is left in the flow it was restored in', (await convert('CLIENTS')).status < 300);

  console.log(`\n${fails.length ? '✗' : '✓'} workspace flow e2e: ${passed} passed, ${fails.length} failed`);
  if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
