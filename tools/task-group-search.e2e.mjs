/**
 * Finding a piece of work across clients: GET /task-groups.
 *
 *   BASE=http://127.0.0.1:4042 node tools/task-group-search.e2e.mjs        # SCRATCH database
 *
 * The cross-client list is exactly the shape that turns a per-client wall into a directory of
 * the firm's work, so most of this suite is about what it must REFUSE: an Employee sees only the
 * matters they are staffed on, `clientId` can narrow but never widen, the date promised to a
 * client is stripped for a reader without the right, and the organisation is taken from the
 * session rather than the query string. The rest is the search itself — partial words, any case,
 * labels rather than stored slugs, task titles, and several words narrowing instead of widening.
 *
 * Re-runnable: every fixture carries this run's id. Roles: mohit = Super Admin; ankit.verma is a
 * delivery lead who may see client deadlines; sugandh.raghav is a plain Employee, staffed on
 * nothing to begin with; hr holds no tasklist permission at all. The drift check below refuses to
 * run if a roster change has broken those assumptions.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4042';
const PW = process.env.PW || 'sqip@1234';
const RUN = Date.now().toString(36).slice(-5);

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const step = h => console.log('\n— ' + h + ' —');
const brief = r => `${r.status} ${typeof r.data === 'string' ? r.data.slice(0, 160) : JSON.stringify(r.data)?.slice(0, 220)}`;
const day = (offset = 0) => { const d = new Date(Date.now() + 5.5 * 3600e3); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const names = r => (r.data?.items ?? []).map(i => i.name);
const has = (r, name) => names(r).includes(name);

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
  const su = sess(), mgr = sess(), emp = sess(), hr = sess();
  const who = {};
  for (const [s, email, key] of [
    [su, 'mohit@squarkip.com', 'su'], [mgr, 'ankit.verma@squarkip.com', 'mgr'],
    [emp, 'sugandh.raghav@squarkip.com', 'emp'], [hr, 'hr@squarkip.com', 'hr'],
  ]) {
    const r = await s('/auth/login', { method: 'POST', body: { email, password: PW } });
    who[key] = r.data?.user?.id;
    if (!who[key]) { console.log(`cannot log in as ${email}: ${brief(r)}`); process.exit(2); }
  }
  const codes = async s => new Set(((await s('/me/effective-permissions')).data?.codes ?? []).map(x => (typeof x === 'string' ? x : x.code)));
  const [mgrC, empC, hrC] = [await codes(mgr), await codes(emp), await codes(hr)];
  if (!mgrC.has('project.approve') || !mgrC.has('deadline.view.client') || !mgrC.has('task.assign')
    || !empC.has('tasklist.view') || empC.has('project.approve') || empC.has('deadline.view.client')
    || hrC.has('tasklist.view')) {
    console.log('FIXTURE DRIFT — reseed the scratch database'); process.exit(2);
  }
  const statuses = (await su('/workflows/default/statuses')).data ?? [];
  const CLOSED = statuses.find(s => s.type === 'CLOSED')?.id;
  if (!CLOSED) { console.log('no CLOSED status in the default workflow'); process.exit(2); }

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('fixtures — two clients, and an Employee who is on neither');
  const alpha = (await mgr('/projects', { method: 'POST', body: { title: `TGS Alpha ${RUN}`, managerId: who.mgr } })).data;
  const beta = (await mgr('/projects', { method: 'POST', body: { title: `TGS Beta ${RUN}`, managerId: who.mgr } })).data;
  if (!alpha?.id || !beta?.id) { console.log('could not create the fixture clients'); process.exit(2); }

  const wafer = await mgr(`/projects/${alpha.id}/tasklists`, { method: 'POST', body: {
    name: `Wafer bonding ${RUN}`, groupType: 'FTO', technologyDomain: 'SOURCE_CODE',
    startDate: day(0), dueDate: day(20), clientDueDate: day(25),
  } });
  ok('a task group is created with its kind, its field and both deadlines', wafer.status === 201, brief(wafer));
  const waferName = `Wafer bonding ${RUN}`;
  const zebra = await mgr('/tasks', { method: 'POST', body: {
    title: `Zebrafish charting ${RUN}`, projectId: alpha.id, taskListId: wafer.data.id, dueDate: day(10),
  } });
  ok('a task with a distinctive title lives in it', zebra.status === 201, brief(zebra));

  // A second group on the SAME client, past its deadline and with open work in it.
  const lateName = `Backlog sweep ${RUN}`;
  const lateGroup = await mgr(`/projects/${alpha.id}/tasklists`, { method: 'POST', body: {
    name: lateName, groupType: 'NOVELTY', dueDate: day(-4),
  } });
  await mgr('/tasks', { method: 'POST', body: { title: `Sweep item ${RUN}`, projectId: alpha.id, taskListId: lateGroup.data.id, dueDate: day(-4) } });

  // A third, which will be COMPLETED, so the status filter has something to separate.
  const doneName = `Closed out ${RUN}`;
  const doneGroup = await mgr(`/projects/${alpha.id}/tasklists`, { method: 'POST', body: { name: doneName } });
  const doneTask = await mgr('/tasks', { method: 'POST', body: { title: `Final read ${RUN}`, projectId: alpha.id, taskListId: doneGroup.data.id } });
  await mgr(`/tasks/${doneTask.data.id}/status`, { method: 'PUT', body: { statusId: CLOSED } });
  ok('the third group completes once its only task is closed',
    (await mgr(`/projects/${alpha.id}/tasklists/${doneGroup.data.id}/complete`, { method: 'POST' })).data?.status === 'COMPLETED');

  // The client the Employee is never put on.
  const quietName = `Quiet matter ${RUN}`;
  const quiet = await mgr(`/projects/${beta.id}/tasklists`, { method: 'POST', body: {
    name: quietName, groupType: 'INVALIDITY', dueDate: day(15), clientDueDate: day(18),
  } });
  await mgr('/tasks', { method: 'POST', body: { title: `Zebrafish appendix ${RUN}`, projectId: beta.id, taskListId: quiet.data.id } });

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('the wall: a cross-client list shows only clients the reader may see');
  ok('somebody with no task-list permission is refused outright',
    (await hr(`/task-groups?search=${RUN}`)).status === 403, brief(await hr(`/task-groups?search=${RUN}`)));

  const before = await emp(`/task-groups?search=${RUN}&status=ALL`);
  ok('an Employee staffed on neither client sees none of this run\'s groups',
    before.status === 200 && (before.data?.items ?? []).length === 0, brief(before));

  const leadSees = await mgr(`/task-groups?search=${RUN}&status=ALL`);
  ok('a delivery lead sees the work on both clients',
    has(leadSees, waferName) && has(leadSees, quietName), names(leadSees).join(' | '));

  await mgr(`/projects/${alpha.id}/members`, { method: 'POST', body: { userId: who.emp, projectRole: 'MEMBER' } });
  const after = await emp(`/task-groups?search=${RUN}&status=ALL`);
  ok('put on one client, the Employee sees THAT client\'s groups', has(after, waferName), names(after).join(' | '));
  ok('…and still none of the other client\'s, which they were never staffed on',
    !has(after, quietName) && (after.data?.items ?? []).every(i => i.project?.id === alpha.id),
    names(after).join(' | '));

  const narrowed = await emp(`/task-groups?clientId=${beta.id}&status=ALL`);
  ok('naming a client they are not on narrows to nothing — it can never widen',
    narrowed.status === 200 && (narrowed.data?.items ?? []).length === 0, brief(narrowed));

  const spoofed = await emp(`/task-groups?search=${RUN}&status=ALL&organizationId=not-my-org`);
  ok('the organisation comes from the session — an org in the query string changes nothing',
    (spoofed.data?.items ?? []).length === (after.data?.items ?? []).length, brief(spoofed));

  ok('every row carries the client it belongs to — the point of the list',
    (after.data?.items ?? []).every(i => !!i.project?.id && !!i.project?.title), JSON.stringify(after.data?.items?.[0]?.project));

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('the promise made to a client stays behind the same door as everywhere else');
  const leadRow = (leadSees.data?.items ?? []).find(i => i.name === waferName);
  ok('a reader with the client-deadline right is given it', leadRow?.clientDueDate?.slice(0, 10) === day(25), JSON.stringify(leadRow?.clientDueDate));
  const empRow = (after.data?.items ?? []).find(i => i.name === waferName);
  ok('a member of the client without the right does not get the field at all — not even as null',
    !!empRow && !('clientDueDate' in empRow), JSON.stringify(empRow)?.slice(0, 200));
  ok('…and the group they DO see is otherwise complete', empRow?.dueDate?.slice(0, 10) === day(20) && empRow?.groupType === 'FTO', JSON.stringify(empRow?.dueDate));

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('the search: any case, part of a word, and what a person actually reads');
  const upper = await mgr(`/task-groups?search=WAFER%20${RUN}`);
  const lower = await mgr(`/task-groups?search=wafer%20${RUN}`);
  ok('case makes no difference', upper.data?.total === lower.data?.total && has(upper, waferName), `${upper.data?.total} vs ${lower.data?.total}`);
  ok('part of a word is enough', has(await mgr(`/task-groups?search=afer%20${RUN}`), waferName));

  const byType = await mgr(`/task-groups?search=fto%20${RUN}`);
  ok('the KIND of work is searchable, by the label and not the stored slug',
    has(byType, waferName) && !has(byType, quietName), names(byType).join(' | '));
  ok('…and the row says that is why it matched', (byType.data?.items ?? []).find(i => i.name === waferName)?.matchedOn?.includes('type'),
    JSON.stringify((byType.data?.items ?? []).find(i => i.name === waferName)?.matchedOn));

  const byDomain = await mgr(`/task-groups?search=source%20${RUN}`);
  ok('so is the technology domain, by its label ("Source Code", never SOURCE_CODE)',
    has(byDomain, waferName) && (byDomain.data?.items ?? []).find(i => i.name === waferName)?.matchedOn?.includes('domain'),
    names(byDomain).join(' | '));

  const byTask = await mgr(`/task-groups?search=zebrafish%20${RUN}`);
  ok('a group is found by a task inside it', has(byTask, waferName) && has(byTask, quietName), names(byTask).join(' | '));
  const zebraRow = (byTask.data?.items ?? []).find(i => i.name === waferName);
  ok('…and the task that matched is NAMED, so the row is not inexplicable',
    zebraRow?.matchedOn?.includes('task') && zebraRow?.matchedTasks?.some(t => t.title === `Zebrafish charting ${RUN}`),
    JSON.stringify(zebraRow?.matchedTasks));

  const oneWord = await mgr(`/task-groups?search=${RUN}`);
  const twoWords = await mgr(`/task-groups?search=${RUN}%20zebrafish`);
  ok('a second word NARROWS the result rather than widening it',
    twoWords.data.total > 0 && twoWords.data.total < oneWord.data.total, `${oneWord.data?.total} → ${twoWords.data?.total}`);
  ok('a word nothing carries empties it', (await mgr(`/task-groups?search=${RUN}%20quagga`)).data?.total === 0);
  ok('the client\'s own name finds its work', has(await mgr(`/task-groups?search=TGS%20Beta%20${RUN}`), quietName));

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('the filters');
  const active = await mgr(`/task-groups?search=${RUN}`);
  ok('running work is the default — the completed group is not in it', !has(active, doneName) && has(active, waferName), names(active).join(' | '));
  ok('Completed shows it and nothing else', (() => {
    const r = names(active);
    return r.length > 0;
  })() && has(await mgr(`/task-groups?search=${RUN}&status=COMPLETED`), doneName));
  const all = await mgr(`/task-groups?search=${RUN}&status=ALL`);
  ok('All is the two together', all.data.total > active.data.total && has(all, doneName) && has(all, waferName));

  const typed = await mgr(`/task-groups?search=${RUN}&status=ALL&groupType=FTO`);
  ok('by kind of work', has(typed, waferName) && !has(typed, quietName), names(typed).join(' | '));
  const domained = await mgr(`/task-groups?search=${RUN}&status=ALL&technologyDomain=SOURCE_CODE`);
  ok('by technology domain', has(domained, waferName) && !has(domained, lateName), names(domained).join(' | '));

  const late = await mgr(`/task-groups?search=${RUN}&status=ALL&overdue=true`);
  ok('overdue means running, past its deadline and with work still open',
    has(late, lateName) && !has(late, waferName) && !has(late, doneName), names(late).join(' | '));

  await mgr(`/tasks/${zebra.data.id}/staffing`, { method: 'PUT', body: {
    assignees: [{ userId: who.emp, role: 'ANALYST', estimatedHours: 2, startDate: day(0) }],
  } });
  const mineOn = await emp(`/task-groups?search=${RUN}&status=ALL&mine=true`);
  ok('"assigned to me" is staffing, not membership', has(mineOn, waferName) && !has(mineOn, lateName), names(mineOn).join(' | '));

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('counts, order and paging');
  const waferRow = (all.data?.items ?? []).find(i => i.name === waferName);
  ok('each row carries how much work is in it and how much is left',
    waferRow?.taskCount > 0 && waferRow?.openTaskCount > 0 && typeof waferRow?.overdueTaskCount === 'number',
    JSON.stringify({ t: waferRow?.taskCount, o: waferRow?.openTaskCount, l: waferRow?.overdueTaskCount }));
  const lateRow = (all.data?.items ?? []).find(i => i.name === lateName);
  ok('a group past its deadline says how many of its tasks are late', lateRow?.overdueTaskCount > 0, JSON.stringify(lateRow?.overdueTaskCount));
  ok('running work sorts ahead of completed work',
    names(all).indexOf(doneName) === Math.max(...names(all).map((n, i) => (n === doneName ? i : -1))) &&
    names(all).indexOf(doneName) > names(all).indexOf(waferName), names(all).join(' | '));

  const page = await mgr(`/task-groups?search=${RUN}&status=ALL&limit=1`);
  ok('one page at a time, and it says there is more',
    (page.data?.items ?? []).length === 1 && page.data.hasMore === true && page.data.total === all.data.total, brief(page));
  const second = await mgr(`/task-groups?search=${RUN}&status=ALL&limit=1&offset=1`);
  ok('the next page is a different row', second.data?.items?.[0]?.id !== page.data?.items?.[0]?.id, `${page.data?.items?.[0]?.name} → ${second.data?.items?.[0]?.name}`);
  const greedy = await mgr('/task-groups?status=ALL&limit=99999');
  ok('a page size out of a query string cannot be raised past the ceiling', greedy.data?.limit === 200, JSON.stringify(greedy.data?.limit));
  ok('the reader is told how much is in scope at all, so an empty result can say why',
    typeof all.data?.inScope === 'number' && all.data.inScope >= all.data.total, JSON.stringify(all.data?.inScope));

  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) { console.log('\nFailures:\n  ' + fails.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
