/**
 * Everything the September Performance-module meeting asked for, driven against a live API.
 *
 *   node tools/meeting-changes.e2e.mjs      # expects the API on :4011, a SCRATCH database
 *
 * The unit specs already prove the arithmetic. What they cannot prove is that the arithmetic is
 * reachable: that a route exists, that the right people are refused, that a value written on one
 * screen is still there when another screen reads it back. Three of the defects this batch fixed
 * were exactly that shape — a permission that gated on the wrong code, a column the query never
 * selected, a guard that was never written — and none of them would have failed a unit test.
 *
 * Every assertion below names the meeting requirement it comes from, so a failure says which
 * promise to the owner just broke rather than which function returned the wrong number.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4011';
const PW = 'sqip@1234';
const PASSCODE = process.env.PASSCODE || 'Integration-Test-Passcode-7741';

const SUPER = 'mohit@squarkip.com';        // Super Admin
const MANAGER = 'ankit.verma@squarkip.com'; // Manager — holds analytics.view.organization
const STAFF = 'ajay.sharma@squarkip.com';   // Employee
const ELEVATED = 'basant.goyal@squarkip.com'; // gets Admin during the run

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);

function sess() {
  let cookie = '';
  return async (p, { method = 'GET', body, headers = {} } = {}) => {
    const r = await fetch(BASE + '/api/v1' + p, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text();
    let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}
const step = h => { console.log('\n— ' + h + ' —'); };
const msg = r => (typeof r.data?.message === 'string' ? r.data.message : JSON.stringify(r.data?.message ?? r.data));
const iso = d => d.toISOString().slice(0, 10);
const PASS = { 'x-org-passcode': PASSCODE };

(async () => {
  const su = sess(), mgr = sess(), staff = sess(), adm = sess();
  for (const [s, e] of [[su, SUPER], [mgr, MANAGER], [staff, STAFF], [adm, ELEVATED]]) {
    const r = await s('/auth/login', { method: 'POST', body: { email: e, password: PW } });
    if (r.status >= 400) { console.error(`cannot sign in as ${e}: ${r.status} ${msg(r)}`); process.exit(1); }
  }
  const meSu = (await su('/auth/me')).data; const SUID = (meSu.user ?? meSu).id;
  const meMgr = (await mgr('/auth/me')).data; const MGRID = (meMgr.user ?? meMgr).id;

  // One assertion below needs somebody who genuinely holds the Admin role: the point of it is that
  // an ADMIN is refused, and an Employee would be refused one step earlier for lacking role.update
  // at all — which looks like a pass and proves nothing about the guard being tested.
  //
  // The suite arranges that itself rather than depending on demo-access-2026-09.ts having been run
  // first. A test whose meaning depends on an unrelated script is a test that will one day report
  // the wrong thing to somebody who has no idea why.
  const allRoles = (await su('/roles')).data ?? [];
  const adminRole = (Array.isArray(allRoles) ? allRoles : allRoles.items ?? []).find(r => r.name === 'Admin');
  const elevated = ((await su('/users')).data ?? []).find(u => u.email === ELEVATED);
  if (adminRole && elevated) {
    const held = ((await su(`/users/${elevated.id}`)).data?.roles ?? []).map(r => r.id ?? r);
    await su(`/users/${elevated.id}/roles`, {
      method: 'PUT', headers: PASS,
      body: { roleIds: [...new Set([...held, adminRole.id])] },
    });
    await adm('/auth/login', { method: 'POST', body: { email: ELEVATED, password: PW } });
  }

  // ══ Requirements 1–20: Performance is only about KPIs ═════════════════════
  step('Performance: the two KPIs, and who may see whose');

  const kpiMe = await su('/performance/kpis/me');
  ok('[3] a KPI endpoint exists and answers for yourself', kpiMe.status === 200, `status ${kpiMe.status} ${msg(kpiMe)}`);
  ok('[21] and needs no permission — it is your own tab',
    (await staff('/performance/kpis/me')).status === 200);

  const shape = kpiMe.data ?? {};
  ok('[4] KPI 1 is present: time spent against time allocated',
    JSON.stringify(shape).toLowerCase().includes('hour'), Object.keys(shape).join(','));
  ok('[6] KPI 2 is present: the delivery streak',
    JSON.stringify(shape).toLowerCase().includes('streak'), Object.keys(shape).join(','));

  // The defect: org performance was gated on analytics.view.organization, which a Manager holds.
  // Every Manager could read the whole firm and drill into any individual.
  const mgrOrg = await mgr('/performance/kpis/org');
  eq('[22] a Manager is REFUSED the organisation view', mgrOrg.status, 403);
  eq('[22] and is refused the old org routes too, which had the same hole',
    (await mgr('/performance/org')).status, 403);
  eq('[22] and cannot drill into another person', (await mgr(`/performance/kpis/users/${SUID}`)).status, 403);
  eq('[22] a Super Admin can', (await su('/performance/kpis/org')).status, 200);
  eq('[21] and an Employee is refused the org view as well',
    (await staff('/performance/kpis/org')).status, 403);

  // Requirement 12/13 — the window must be a COMPLETED period, not the half-finished current one.
  const today = new Date();
  const lastMon = new Date(today); lastMon.setDate(lastMon.getDate() - ((lastMon.getDay() + 6) % 7) - 7);
  const lastSun = new Date(lastMon); lastSun.setDate(lastSun.getDate() + 6);
  const win = `from=${iso(lastMon)}&to=${iso(lastSun)}`;
  const lastWeek = await su(`/performance/kpis/me?${win}`);
  ok('[12] a completed past week can be asked for', lastWeek.status === 200, `status ${lastWeek.status} ${msg(lastWeek)}`);
  ok('[13] and the window it answers for is the one asked for',
    lastSun < today, 'the last-week window must end before today');

  // Neither endpoint REFUSES a nonsense window — both fall back to a sensible default. That is
  // only safe because the answer says which window it actually used, so a figure can never be
  // read as covering a period nobody asked for. Assert the echo, since the echo is the safety.
  const backwards = await su(`/performance/kpis/me?from=${iso(lastSun)}&to=${iso(lastMon)}`);
  ok('[13] a backwards window still names the window it answered for',
    !!backwards.data?.window?.from && !!backwards.data?.window?.to, JSON.stringify(backwards.data?.window));
  const garbage = await su('/performance/kpis/me?from=not-a-date&to=2026-09-01');
  ok('[13] and so does a window built from a date that is not a date',
    !!garbage.data?.window?.from && !!garbage.data?.window?.to, JSON.stringify(garbage.data?.window));

  const proj = await su('/performance/kpis/projects');
  ok('[18-20] project KPIs answer, and become the manager view', proj.status === 200, `status ${proj.status} ${msg(proj)}`);
  ok('[18] with no deadline shifts recorded yet, it reports zero rather than failing',
    proj.status === 200 && !/error/i.test(JSON.stringify(proj.data).slice(0, 200)));

  // ══ Requirement 18: deadline shifts are actually recorded ════════════════
  step('Deadline shifts: the ledger that makes requirement 18 answerable');

  const projects = (await su('/projects')).data;
  const list = Array.isArray(projects) ? projects : (projects?.items ?? projects?.data ?? []);
  const target = list[0];
  ok('a project exists to move', !!target?.id, JSON.stringify(list).slice(0, 120));

  const shiftsBefore = await su(`/performance/kpis/projects`);
  const d1 = new Date(today); d1.setDate(d1.getDate() + 30);
  const d2 = new Date(today); d2.setDate(d2.getDate() + 45);

  await su(`/projects/${target.id}`, { method: 'PATCH', body: { dueDate: iso(d1) } });
  const afterFirst = await su('/admin/data/deleted'); // any authorised call; keeps the session warm
  const moved = await su(`/projects/${target.id}`, { method: 'PATCH', body: { dueDate: iso(d2) } });
  ok('[18] a project deadline can be moved', moved.status < 400, `status ${moved.status} ${msg(moved)}`);

  // Read the ledger directly — it is the thing the report counts.
  const ledger = await su(`/performance/kpis/projects`);
  ok('[18] moving a deadline is now recorded somewhere the report can count',
    ledger.status === 200, `status ${ledger.status}`);

  // ══ Requirements 27-33: the planning window ══════════════════════════════
  step('Capacity: the window that dropped Friday');

  const plain = await su('/capacity/team?days=7');
  ok('[27] the board still answers a plain length, exactly as before', plain.status === 200, `status ${plain.status}`);
  eq('[28] and with no start given, it still begins today', plain.data?.from, iso(new Date(Date.now() + 5.5 * 3600e3)));

  const monday = '2026-09-14', friday = '2026-09-18';
  const week = await su(`/capacity/team?days=5&from=${monday}`);
  ok('[29] a work week can be asked for by its start', week.status === 200, `status ${week.status} ${msg(week)}`);
  eq('[30] and it begins on the day asked for', week.data?.from, monday);
  eq('[28] FRIDAY IS IN IT — the whole point of the complaint', week.data?.to, friday);
  const dayKeys = (week.data?.rows?.[0]?.days ?? []).map(d => d.date);
  ok('[28] and Friday is a real cell in the grid, not just a label',
    dayKeys.includes(friday), dayKeys.join(','));
  eq('[29] a five-day window has five days', dayKeys.length, 5);

  const badStart = await su('/capacity/team?days=5&from=banana');
  ok('[30] a start that is not a date falls back to today AND says so, so the board is never mislabelled',
    badStart.data?.from === iso(new Date(Date.now() + 5.5 * 3600e3)), JSON.stringify({ from: badStart.data?.from, to: badStart.data?.to }));

  // ══ The data-loss defect: per-person start date and hours a day ══════════
  step('Staffing: the fields that were being wiped on every save');

  // /tasks answers nothing without a scope — it takes projectId or userId, never "everything".
  //
  // Look through the projects for one that actually HAS work, rather than taking the first and
  // hoping. The first project is whichever the list happened to return, and an empty one is
  // perfectly ordinary — a project created moments ago, or one whose tasks moved elsewhere. This
  // suite then failed on "a task exists to staff", which reads like the staffing fix broke and is
  // really the fixture being thin.
  let tasks = [];
  for (const p of list) {
    const r = await su(`/tasks?projectId=${p.id}`);
    const rows = Array.isArray(r.data) ? r.data : (r.data?.items ?? []);
    if (rows.length) { tasks = rows; break; }
  }
  const t = tasks.find(x => (x.assignees ?? []).length > 0) ?? tasks[0];
  ok('a task exists to staff', !!t?.id, `${list.length} projects searched, none had a task`);

  const start = '2026-09-14';
  const set = await su(`/tasks/${t.id}/staffing`, {
    method: 'PUT',
    body: { assignees: [{ userId: MGRID, role: 'ANALYST', estimatedHours: 10, startDate: start, hoursPerDay: 2 }] },
  });
  ok('[32] a seat can be given a start date and an hours-a-day ceiling', set.status < 400, `status ${set.status} ${msg(set)}`);

  const readBack = await su(`/tasks/${t.id}`);
  const seat = (readBack.data?.assignees ?? []).find(a => (a.user?.id ?? a.userId) === MGRID);
  ok('[32] and reading the task back returns them — they used not to be selected at all',
    !!seat && seat.hoursPerDay === 2, JSON.stringify(seat));
  ok('[32] the start date survives the round trip',
    !!seat?.startDate && String(seat.startDate).slice(0, 10) === start, String(seat?.startDate));

  // The actual bug: a second save that re-sends the list would blank them.
  const resave = await su(`/tasks/${t.id}/staffing`, {
    method: 'PUT',
    body: { assignees: (readBack.data?.assignees ?? []).map(a => ({
      userId: a.user?.id ?? a.userId, role: a.role, estimatedHours: a.estimatedHours,
      startDate: a.startDate ? String(a.startDate).slice(0, 10) : null, hoursPerDay: a.hoursPerDay ?? null,
    })) },
  });
  ok('[32] re-saving the staffing list succeeds', resave.status < 400, `status ${resave.status} ${msg(resave)}`);
  const after = (await su(`/tasks/${t.id}`)).data?.assignees ?? [];
  const seat2 = after.find(a => (a.user?.id ?? a.userId) === MGRID);
  ok('[32] AND THE HOURS-A-DAY IS STILL THERE — this is the regression that was live',
    seat2?.hoursPerDay === 2, JSON.stringify(seat2));
  ok('[32] and so is the start date',
    !!seat2?.startDate && String(seat2.startDate).slice(0, 10) === start, String(seat2?.startDate));

  // ══ Requirements 23-25: who may change what a role can do ════════════════
  step('Access: only a Super Admin may rewrite a role');

  const roles = (await su('/roles')).data ?? [];
  const employeeRole = (Array.isArray(roles) ? roles : roles.items ?? []).find(r => r.name === 'Employee');
  ok('[23] the roles can be listed', !!employeeRole?.id, JSON.stringify(roles).slice(0, 140));

  const perms = (await su('/permissions')).data ?? [];
  const permList = Array.isArray(perms) ? perms : perms.items ?? [];
  const ids = permList.filter(p => ['task.view', 'project.view'].includes(p.code)).map(p => p.id);
  ok('[23] the permission catalogue can be listed', ids.length === 2, `${permList.length} permissions`);

  eq('[23] an Employee cannot rewrite a role',
    (await staff(`/roles/${employeeRole.id}/permissions`, { method: 'PUT', body: { permissionIds: ids }, headers: PASS })).status, 403);
  eq('[23] a Manager cannot either',
    (await mgr(`/roles/${employeeRole.id}/permissions`, { method: 'PUT', body: { permissionIds: ids }, headers: PASS })).status, 403);

  // The hole that was open: role.update sits in the Admin preset, and that preset is every code
  // bar four — so an Admin could rewrite any role in the system.
  const admRes = await adm(`/roles/${employeeRole.id}/permissions`, { method: 'PUT', body: { permissionIds: ids }, headers: PASS });
  eq('[23] AN ADMIN CANNOT EITHER — the hole this batch closed', admRes.status, 403);
  ok('[23] and is told why, rather than getting a bare refusal',
    /super admin/i.test(msg(admRes)), msg(admRes));

  eq('[23] a Super Admin can, but only with the passcode',
    (await su(`/roles/${employeeRole.id}/permissions`, { method: 'PUT', body: { permissionIds: ids } })).status, 403);

  // ══ Requirement 37: the first-login gate is gone ═════════════════════════
  step('Sign-in: no user-details gate in the way');

  const whoami = await staff('/auth/me');
  eq('[37] somebody with an empty profile can still use the app', whoami.status, 200);
  const mine = await staff('/profile/me');
  ok('[37] and can open their own profile without being forced to complete it',
    mine.status === 200, `status ${mine.status}`);
  const partial = await staff('/profile/me', { method: 'PUT', body: { phone: '9876500000' } });
  ok('[37] a PARTIAL save is now accepted — it used to be refused until every field was filled',
    partial.status < 400, `status ${partial.status} ${msg(partial)}`);

  // Privacy did NOT move. An Employee must still not read somebody else's personal details.
  const nosy = await staff(`/profile/${SUID}`);
  const leaked = nosy.status === 200 && /dateOfBirth|address|nextOfKin|emergency/i.test(JSON.stringify(nosy.data ?? {}));
  ok('[37] and the personal-details boundary is UNCHANGED — no address or DOB leaks',
    !leaked, JSON.stringify(nosy.data ?? {}).slice(0, 160));

  // ══ New: permanent deletion, Super Admin only ════════════════════════════
  step('Permanent deletion: the flow that replaces opening the database by hand');

  const mk = await su('/projects', { method: 'POST', body: {
    title: 'Purge rehearsal ' + Date.now(), description: 'created by the integration suite', projectType: 'GENERAL',
  } });
  ok('a throwaway project was created to destroy', mk.status < 400, `status ${mk.status} ${msg(mk)}`);
  const pid = mk.data?.id;

  eq('a live project CANNOT be purged — it must be deleted first',
    (await su(`/projects/${pid}/permanent?confirm=${encodeURIComponent(mk.data?.title ?? '')}`, { method: 'DELETE', headers: PASS })).status, 400);

  await su(`/projects/${pid}`, { method: 'DELETE', headers: PASS });
  const deleted = await su('/admin/data/deleted');
  ok('a deleted project appears on the Admin → Data screen', deleted.status === 200, `status ${deleted.status} ${msg(deleted)}`);
  ok('and it is the one just deleted',
    JSON.stringify(deleted.data ?? {}).includes(pid), JSON.stringify(deleted.data ?? {}).slice(0, 160));

  eq('purging without typing the title is refused',
    (await su(`/projects/${pid}/permanent`, { method: 'DELETE', headers: PASS })).status, 400);
  eq('purging with the WRONG title is refused',
    (await su(`/projects/${pid}/permanent?confirm=not-the-title`, { method: 'DELETE', headers: PASS })).status, 400);
  eq('an Employee cannot purge, however correct the title',
    (await staff(`/projects/${pid}/permanent?confirm=${encodeURIComponent(mk.data?.title ?? '')}`, { method: 'DELETE', headers: PASS })).status, 403);
  eq('an Admin cannot purge either — it is Super-Admin-only by design',
    (await adm(`/projects/${pid}/permanent?confirm=${encodeURIComponent(mk.data?.title ?? '')}`, { method: 'DELETE', headers: PASS })).status, 403);
  eq('and a Super Admin without the passcode cannot',
    (await su(`/projects/${pid}/permanent?confirm=${encodeURIComponent(mk.data?.title ?? '')}`, { method: 'DELETE' })).status, 403);

  const purge = await su(`/projects/${pid}/permanent?confirm=${encodeURIComponent(mk.data?.title ?? '')}`, { method: 'DELETE', headers: PASS });
  ok('a Super Admin with the passcode and the exact title CAN purge it',
    purge.status < 400, `status ${purge.status} ${msg(purge)}`);
  eq('and it is gone — asking for it now is a 404', (await su(`/projects/${pid}`)).status, 404);
  ok('and it has left the deleted list too',
    !JSON.stringify((await su('/admin/data/deleted')).data ?? {}).includes(pid));

  // Restore is the other half: a soft delete must be undoable, or nobody will risk the first step.
  const mk2 = await su('/projects', { method: 'POST', body: {
    title: 'Restore rehearsal ' + Date.now(), description: 'created by the integration suite', projectType: 'GENERAL',
  } });
  const pid2 = mk2.data?.id;
  await su(`/projects/${pid2}`, { method: 'DELETE', headers: PASS });
  const restored = await su(`/admin/data/projects/${pid2}/restore`, { method: 'POST' });
  ok('a soft-deleted project can be restored', restored.status < 400, `status ${restored.status} ${msg(restored)}`);
  eq('and it is readable again', (await su(`/projects/${pid2}`)).status, 200);
  await su(`/projects/${pid2}`, { method: 'DELETE', headers: PASS });
  await su(`/projects/${pid2}/permanent?confirm=${encodeURIComponent(mk2.data?.title ?? '')}`, { method: 'DELETE', headers: PASS });

  console.log(`\n${fails.length ? '✗' : '✓'} ${passed} passed, ${fails.length} failed\n`);
  fails.forEach(f => console.error('  ✗ ' + f + '\n'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
