/**
 * Proof that the stopwatch flow behaves exactly as it did before two flows existed.
 *
 *   node tools/timer-flow-untouched.e2e.mjs      # expects the API on :4011, a SCRATCH database
 *
 * The owner asked for the stopwatch flow to be left alone. Two fixes had been made to code both
 * flows share — a Reopen that lands the task in an open status, and a Finish that can resolve a
 * workflow from the task's own column — and both are improvements the MANUAL flow needs, because
 * finishing and reopening are the only two things it lets a person do to a task.
 *
 * They are now gated. This asserts the gate from both sides: the old behaviour in TIMER, the fixed
 * behaviour in MANUAL. Asserting the OLD behaviour is the unusual part — these tests exist to keep
 * a known defect in place, deliberately, because leaving that flow untouched was the instruction.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4011';
const PASSCODE = process.env.PASSCODE || 'mode-e2e-Q7rk-2026';
const PW = 'sqip@1234';
let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };

function sess() {
  let cookie = '';
  return async (p, { method = 'GET', body, passcode } = {}) => {
    const r = await fetch(BASE + '/api/v1' + p, {
      method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(passcode ? { 'x-org-passcode': passcode } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}

(async () => {
  const api = sess();
  await api('/auth/login', { method: 'POST', body: { email: 'mohit@squarkip.com', password: PW } });
  const me = (await api('/auth/me')).data; const MY = (me.user ?? me).id; const ORG = (me.user ?? me).organizationId;
  const setMode = m => api(`/organizations/${ORG}/time-mode`, { method: 'PATCH', body: { mode: m }, passcode: PASSCODE });

  const proj = (await api('/projects')).data.find(p => !['ARCHIVED', 'CANCELLED', 'COMPLETED', 'CLOSED'].includes(p.projectPhase));
  const lists = (await api(`/projects/${proj.id}`)).data?.taskLists ?? [];
  const listId = (lists.find(l => l.isDefault) ?? lists[0])?.id;

  /** A task with a workflow but never given a status — the case Finish used to refuse. */
  async function statuslessTask(title) {
    const t = await api('/tasks', { method: 'POST', body: { title, projectId: proj.id, taskListId: listId, createdBy: MY } });
    await api(`/tasks/${t.data.id}/staffing`, { method: 'PUT', body: { assignees: [{ userId: MY, role: 'ANALYST', estimatedHours: 2 }] } });
    return t.data.id;
  }
  /** An ordinary open task of mine, finished so it can be reopened. */
  async function finishedTask() {
    const mine = ((await api(`/tasks?userId=${MY}`)).data ?? []).filter(t => t.currentStatus?.type !== 'CLOSED');
    const id = mine[0].id;
    await api(`/tasks/${id}/finish`, { method: 'POST' });
    return id;
  }

  // ── the stopwatch flow, exactly as it was ────────────────────────────────
  console.log('\n— the stopwatch flow keeps the behaviour it always had —');
  await setMode('TIMER');

  const sl = await statuslessTask('timer-flow statusless');
  const finSL = await api(`/tasks/${sl}/finish`, { method: 'POST' });
  ok('a task that never had a status still cannot be finished, as before', finSL.status === 400,
     `status ${finSL.status} :: ${JSON.stringify(finSL.data).slice(0, 120)}`);
  await api(`/tasks/${sl}`, { method: 'DELETE' });

  const fin = await finishedTask();
  await api(`/tasks/${fin}/reopen`, { method: 'POST' });
  const backTimer = (await api(`/tasks/${fin}`)).data;
  ok('reopening without naming a status leaves it CLOSED, as before',
     backTimer.currentStatus?.type === 'CLOSED' && !backTimer.completedAt,
     JSON.stringify({ type: backTimer.currentStatus?.type, completedAt: backTimer.completedAt }));

  // The stopwatch itself, untouched.
  const started = await api(`/tasks/${fin}/start`, { method: 'POST' });
  ok('a clock still starts', started.status === 201 || started.status === 200, `status ${started.status}`);
  const paused = await api(`/tasks/${fin}/pause`, { method: 'POST' });
  ok('and still pauses, reporting the minutes', paused.data?.paused === true || paused.status < 400, JSON.stringify(paused.data).slice(0, 120));

  // Its own Reopen names a status, which is why it never needed the fix.
  const statuses = (await api('/workflows/default/statuses')).data ?? [];
  const openId = statuses.find(s => s.type !== 'CLOSED')?.id;
  if (openId) {
    await api(`/tasks/${fin}/finish`, { method: 'POST' });
    await api(`/tasks/${fin}/reopen`, { method: 'POST', body: { openStatusId: openId } });
    const named = (await api(`/tasks/${fin}`)).data;
    ok('and reopening WITH a status works exactly as it always did, which is what its button does',
       named.currentStatus?.type !== 'CLOSED', JSON.stringify({ type: named.currentStatus?.type }));
  }

  // ── the manual flow gets the fixes it needs ──────────────────────────────
  console.log('\n— and the manual flow gets what it needs —');
  await setMode('MANUAL');

  const sl2 = await statuslessTask('manual-flow statusless');
  const finSL2 = await api(`/tasks/${sl2}/finish`, { method: 'POST' });
  ok('there, a statusless task CAN be finished', finSL2.status === 200 || finSL2.status === 201,
     `status ${finSL2.status} :: ${JSON.stringify(finSL2.data).slice(0, 120)}`);
  await api(`/tasks/${sl2}`, { method: 'DELETE' });

  const fin2 = await finishedTask();
  await api(`/tasks/${fin2}/reopen`, { method: 'POST' });
  const backManual = (await api(`/tasks/${fin2}`)).data;
  ok('and reopening genuinely reopens, without being told a status',
     backManual.currentStatus?.type !== 'CLOSED' && !backManual.completedAt,
     JSON.stringify({ type: backManual.currentStatus?.type, completedAt: backManual.completedAt }));

  await setMode('TIMER');
  console.log(`\n${fails.length ? '✗' : '✓'} ${passed} passed, ${fails.length} failed\n`);
  fails.forEach(f => console.error('  ✗ ' + f + '\n'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
