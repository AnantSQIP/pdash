/**
 * The CID: issued automatically when a client is created, never issued twice, and every change to
 * a client or its number written to the CID ledger.
 *
 *   BASE=http://127.0.0.1:4032 PASSCODE=... node tools/cid-ledger.e2e.mjs      # a SCRATCH database
 *
 * Re-runnable: every fixture carries this run's id. It creates clients, merges, splits, deletes and
 * PERMANENTLY deletes them — never point it at a database somebody is using.
 *
 * Actors are picked by what they may do (/me/effective-permissions), not by a hard-coded role
 * layout, so a roster change does not quietly turn a refusal check into a check of nothing:
 *   admin — project.generate_pid + project.delete (a Super Admin)
 *   lead  — project.approve, NOT project.generate_pid (runs clients, cannot renumber them)
 *   staff — project.create only (no project.approve, no user.manage_access)
 *   hr    — user.manage_access, NOT project.generate_pid
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4032';
const PW = process.env.PW || 'sqip@1234';
const PASSCODE = process.env.PASSCODE || 'cf-scratch-7713';
const RUN = Date.now().toString(36).slice(-5);
const CID_RE = /^[A-Z0-9]+_\d{2}_\d{2}_\d{3,6}$/;

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const step = h => console.log('\n— ' + h + ' —');
const brief = r => `${r.status} ${typeof r.data === 'string' ? r.data.slice(0, 160) : JSON.stringify(r.data)?.slice(0, 260)}`;
const serialOf = cid => Number(String(cid).split('_').pop());
const fyOf = cid => String(cid).split('_').slice(-3, -1).join('_');

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
const withPass = { 'x-org-passcode': PASSCODE };

(async () => {
  // ── Actors, chosen by permission ──────────────────────────────────────────────────────────
  const CANDIDATES = [
    'mohit@squarkip.com', 'yash@squarkip.com', 'ankit.verma@squarkip.com', 'ajay.sharma@squarkip.com',
    'neha.shukla@squarkip.com', 'anant.gupta@squarkip.com', 'meetu.singh@squarkip.com',
    'ketan.dagar@squarkip.com', 'khushi.gupta@squarkip.com', 'ritik.sharma@squarkip.com',
    'hr@squarkip.com', 'shavetasharma@squarkip.com',
  ];
  const pick = {};
  for (const email of CANDIDATES) {
    if (pick.admin && pick.lead && pick.staff && pick.hr) break;
    const s = sess();
    const r = await s('/auth/login', { method: 'POST', body: { email, password: PW } });
    if (!r.data?.user?.id) continue;
    const codes = new Set(((await s('/me/effective-permissions')).data?.codes ?? []).map(x => (typeof x === 'string' ? x : x.code)));
    const me = { s, id: r.data.user.id, email, name: `${r.data.user.firstName ?? ''} ${r.data.user.lastName ?? ''}`.trim(), codes };
    if (!pick.admin && codes.has('project.generate_pid') && codes.has('project.delete')) pick.admin = me;
    else if (!pick.lead && codes.has('project.approve') && !codes.has('project.generate_pid')) pick.lead = me;
    else if (!pick.staff && codes.has('project.create') && !codes.has('project.approve') && !codes.has('user.manage_access')) pick.staff = me;
    else if (!pick.hr && codes.has('user.manage_access') && !codes.has('project.generate_pid')) pick.hr = me;
  }
  for (const k of ['admin', 'lead', 'staff', 'hr']) {
    if (!pick[k]) { console.log(`FIXTURE: nobody in the roster can act as "${k}" — reseed the scratch database`); process.exit(2); }
  }
  const { admin, lead, staff, hr } = pick;
  console.log(`actors: admin=${admin.email} lead=${lead.email} staff=${staff.email} hr=${hr.email}`);

  const ledger = async (s = admin.s) => (await s('/projects/cid-ledger')).data ?? [];
  const rowFor = (rows, cid) => rows.find(r => r.cid === cid);
  const eventsOf = (row, type) => (row?.events ?? []).filter(e => e.type === type);
  const create = async (s, body) => s('/projects', { method: 'POST', body });
  const get = async (id, s = admin.s) => (await s(`/projects/${id}`)).data;
  const everIssued = async () => new Set((await ledger()).map(r => r.cid));

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('the PID request feature and manual generation are gone');
  const gone = [
    ['GET', '/projects/next-pid'], ['POST', '/projects/generate-pid'], ['GET', '/projects/pid-reservation'],
    ['GET', '/projects/pid-ledger'], ['GET', '/projects/pid-authorities'], ['GET', '/projects/pid-requests'],
    ['PATCH', '/projects/pid-requests/x/project'], ['POST', '/projects/pid-requests/x/fulfill'],
    ['POST', '/projects/pid-requests/x/decline'],
  ];
  const anyClient = ((await admin.s('/projects')).data ?? [])[0];
  if (anyClient) {
    gone.push(
      ['POST', `/projects/${anyClient.id}/pid-request`], ['POST', `/projects/${anyClient.id}/pid-request/nudge`],
      ['POST', `/projects/${anyClient.id}/pid-change-request`], ['POST', `/projects/${anyClient.id}/attach-pid`],
      ['POST', `/projects/${anyClient.id}/pid/reassign`], ['GET', `/projects/${anyClient.id}/pid-move`],
    );
  }
  for (const [method, path] of gone) {
    const r = await admin.s(path, { method, ...(method === 'GET' ? {} : { body: {} }), headers: withPass });
    ok(`${method} ${path.replace(anyClient?.id ?? '§', ':id')} → 404`, r.status === 404, brief(r));
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('every client gets its CID the moment it is created');
  const before = await everIssued();
  const s1 = await create(staff.s, { title: `CID staff ${RUN}` });
  ok('a member with no special authority creates a client', s1.status === 201, brief(s1));
  ok('…and it carries a CID straight away', CID_RE.test(s1.data?.code ?? ''), s1.data?.code);
  ok('…a number never issued before', s1.data?.code && !before.has(s1.data.code));
  ok('…as client 1 under it', s1.data?.roundSeq === 1);
  const s1View = await get(s1.data.id, staff.s);
  ok('the creator manages it when nobody else is named',
    (s1View?.members ?? []).some(m => m.userId === staff.id && m.projectRole === 'MANAGER'), JSON.stringify(s1View?.members?.map(m => [m.userId, m.projectRole])));
  ok('the client read carries no request/pending state', s1View && !('openPidRequest' in s1View));
  const legacy = await create(staff.s, { title: `Legacy fields ${RUN}`, pid: 'SQ_26_27_999', pidAssigneeId: admin.id });
  ok('the old pid / pidAssigneeId fields are refused, not honoured', legacy.status === 400, brief(legacy));
  const toStranger = await create(staff.s, { title: `Delegated ${RUN}`, managerId: hr.id });
  ok('a member cannot hand a client to someone who cannot run one', toStranger.status === 400, brief(toStranger));
  const toLead = await create(staff.s, { title: `Delegated ok ${RUN}`, managerId: lead.id });
  ok('…but may hand it to someone who can', toLead.status === 201 && CID_RE.test(toLead.data?.code ?? ''), brief(toLead));

  let rows = await ledger();
  const s1Row = rowFor(rows, s1.data.code);
  ok('the ledger has the new CID as Active', s1Row?.status === 'ACTIVE' && s1Row.registryStatus === 'ATTACHED', JSON.stringify(s1Row)?.slice(0, 200));
  ok('…with a MINTED event by the person who created it',
    eventsOf(s1Row, 'MINTED').length === 1 && eventsOf(s1Row, 'MINTED')[0].actorName === staff.name,
    JSON.stringify(s1Row?.events)?.slice(0, 200));
  ok('…and who created it, and when', s1Row?.createdBy === staff.name && !!s1Row?.createdAt);

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('ten clients created at the same moment');
  const burst = await Promise.all(Array.from({ length: 10 }, (_, i) => create(admin.s, { title: `Burst ${RUN} ${i}` })));
  ok('all ten are created — no 500s, no refusals', burst.every(r => r.status === 201), burst.map(r => r.status).join(','));
  const burstCids = burst.map(r => r.data?.code).filter(Boolean);
  ok('ten distinct CIDs', new Set(burstCids).size === 10, burstCids.join(' '));
  const serials = burstCids.map(serialOf).sort((a, b) => a - b);
  ok('…consecutive, with no gap and no repeat', serials.every((n, i) => i === 0 || n === serials[i - 1] + 1), serials.join(','));
  ok('…all after every number issued before them', serials[0] > Math.max(...[...before].filter(c => fyOf(c) === fyOf(burstCids[0])).map(serialOf), 0));

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('renaming, re-grouping, re-managing and pausing a client are all recorded');
  const c = (await create(admin.s, { title: `Ledger subject ${RUN}` })).data;
  const ren = await admin.s(`/projects/${c.id}`, { method: 'PATCH', body: { title: `Ledger subject renamed ${RUN}` } });
  ok('rename', ren.status === 200, brief(ren));
  const group = await admin.s('/client-groups', { method: 'POST', body: { name: `CID group ${RUN}` } });
  ok('setup: a client group', group.status === 201, brief(group));
  const regroup = await admin.s(`/projects/${c.id}`, { method: 'PATCH', body: { clientGroupId: group.data.id } });
  ok('file it under the group', regroup.status === 200, brief(regroup));
  const mgrSwap = await admin.s(`/projects/${c.id}/members`, { method: 'POST', body: { userId: lead.id, projectRole: 'MANAGER' } });
  ok('make the lead its manager', mgrSwap.status === 201 || mgrSwap.status === 200, brief(mgrSwap));
  const hold = await admin.s(`/projects/${c.id}`, { method: 'PATCH', body: { projectPhase: 'ON_HOLD' } });
  ok('put it on hold', hold.status === 200, brief(hold));
  rows = await ledger();
  let cRow = rowFor(rows, c.code);
  const renamed = eventsOf(cRow, 'RENAMED')[0];
  ok('RENAMED says from what to what', renamed?.fromTitle === `Ledger subject ${RUN}` && renamed?.toTitle === `Ledger subject renamed ${RUN}`, JSON.stringify(renamed));
  ok('…and the old name stays searchable', (cRow?.pastNames ?? []).includes(`Ledger subject ${RUN}`), JSON.stringify(cRow?.pastNames));
  ok('CLIENT_GROUP_CHANGED names the group', eventsOf(cRow, 'CLIENT_GROUP_CHANGED')[0]?.metadata?.toGroup === `CID group ${RUN}`);
  const mc = eventsOf(cRow, 'MANAGER_CHANGED')[0];
  ok('MANAGER_CHANGED says who it was and who it is', !!mc && (mc.metadata?.to ?? []).some(p => p.id === lead.id), JSON.stringify(mc?.metadata));
  ok('PHASE_CHANGED Active → On hold', eventsOf(cRow, 'PHASE_CHANGED').some(e => e.metadata?.from === 'ACTIVE' && e.metadata?.to === 'ON_HOLD'));
  ok('the ledger row reads On hold, in its group, with its manager',
    cRow?.status === 'ON_HOLD' && cRow.clientGroup === `CID group ${RUN}` && cRow.managers.includes(lead.name),
    JSON.stringify({ s: cRow?.status, g: cRow?.clientGroup, m: cRow?.managers }));
  const archive = await admin.s(`/client-groups/${group.data.id}/archive`, { method: 'POST' });
  if (archive.status === 404) console.log('      (no archive route at this path — skipping the archive check)');
  else {
    ok('archiving the group un-files the client', archive.status === 200 || archive.status === 201, brief(archive));
    cRow = rowFor(await ledger(), c.code);
    ok('…and that is recorded too', eventsOf(cRow, 'CLIENT_GROUP_CHANGED').some(e => e.metadata?.toGroup === null && /archived/.test(e.metadata?.reason ?? '')));
  }

  step('complete, re-initialize, reopen');
  await admin.s(`/projects/${c.id}`, { method: 'PATCH', body: { projectPhase: 'ACTIVE' } });
  const done = await admin.s(`/projects/${c.id}/complete`, { method: 'POST', body: {} });
  ok('complete it', done.status === 201 || done.status === 200, brief(done));
  ok('ledger: Completed, with a COMPLETED event', (r => r?.status === 'COMPLETED' && eventsOf(r, 'COMPLETED').length === 1)(rowFor(await ledger(), c.code)));
  const reinit = await admin.s(`/projects/${c.id}/reinitialize`, { method: 'POST' });
  ok('re-initialize keeps the same CID', (reinit.status === 201 || reinit.status === 200) && reinit.data?.code === c.code, brief(reinit));
  await admin.s(`/projects/${c.id}/complete`, { method: 'POST', body: {} });
  const reopen = await admin.s(`/projects/${c.id}/reopen`, { method: 'POST' });
  ok('reopen keeps the same CID', (reopen.status === 201 || reopen.status === 200) && reopen.data?.code === c.code, brief(reopen));
  cRow = rowFor(await ledger(), c.code);
  ok('REINITIALIZED and REOPENED are both on the timeline, and it is Active again',
    eventsOf(cRow, 'REINITIALIZED').length === 1 && eventsOf(cRow, 'REOPENED').length === 1 && cRow.status === 'ACTIVE');

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('deleting keeps the number reserved; restoring brings the client back as it was');
  const del = (await create(admin.s, { title: `Deleted then restored ${RUN}` })).data;
  await admin.s(`/projects/${del.id}`, { method: 'PATCH', body: { projectPhase: 'ON_HOLD' } });
  const d1 = await admin.s(`/projects/${del.id}`, { method: 'DELETE' });
  ok('delete it', d1.status === 200, brief(d1));
  ok('it leaves the client list', !((await admin.s('/projects')).data ?? []).some(p => p.id === del.id));
  let delRow = rowFor(await ledger(), del.code);
  ok('…but not the ledger: the CID reads Deleted, still reserved to it',
    delRow?.status === 'DELETED' && delRow.registryStatus === 'DELETED' && delRow.clientName === del.title,
    JSON.stringify(delRow && { s: delRow.status, r: delRow.registryStatus, n: delRow.clientName }));
  ok('…with a DELETED event that remembers it was On hold', eventsOf(delRow, 'DELETED')[0]?.metadata?.phaseBefore === 'ON_HOLD');
  ok('…and the round shows as deleted', delRow?.rounds?.[0]?.deleted === true);
  const burstAfterDelete = (await create(admin.s, { title: `After delete ${RUN}` })).data;
  ok('a deleted client\'s CID is not issued to the next client', burstAfterDelete.code !== del.code && serialOf(burstAfterDelete.code) > serialOf(del.code));
  const rs = await admin.s(`/admin/data/projects/${del.id}/restore`, { method: 'POST' });
  ok('restore it', rs.status === 201 || rs.status === 200, brief(rs));
  const back = await get(del.id);
  ok('…under the SAME CID', back?.code === del.code, `${back?.code} vs ${del.code}`);
  ok('…back On hold, the phase it had — not a blanket Active', back?.projectPhase === 'ON_HOLD', back?.projectPhase);
  delRow = rowFor(await ledger(), del.code);
  ok('ledger: On hold again, with a RESTORED event', delRow?.status === 'ON_HOLD' && eventsOf(delRow, 'RESTORED').length === 1);

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('a permanent delete leaves the number taken forever and the client in the ledger');
  const doomed = (await create(admin.s, { title: `Purged ${RUN}`, taskGroup: { name: 'Work', groupType: 'FTO' } })).data;
  ok('setup: a client with a task group', !!doomed?.code && (doomed.taskLists ?? []).length === 1, JSON.stringify(doomed?.taskLists)?.slice(0, 120));
  const notYet = await admin.s(`/projects/${doomed.id}/permanent?confirm=${encodeURIComponent(doomed.title)}`, { method: 'DELETE', headers: withPass });
  ok('a live client cannot be purged', notYet.status === 400, brief(notYet));
  await admin.s(`/projects/${doomed.id}`, { method: 'DELETE' });
  const purge = await admin.s(`/projects/${doomed.id}/permanent?confirm=${encodeURIComponent(doomed.title)}`, { method: 'DELETE', headers: withPass });
  ok('purge it (deleted first, title typed, passcode)', purge.status === 200, brief(purge));
  ok('the client row is gone', (await admin.s(`/projects/${doomed.id}`)).status === 404);
  const pRow = rowFor(await ledger(), doomed.code);
  ok('the ledger still has its CID, as Purged', pRow?.status === 'PURGED' && pRow.registryStatus === 'PURGED', JSON.stringify(pRow && { s: pRow.status, r: pRow.registryStatus }));
  ok('…under its last name', pRow?.clientName === doomed.title, pRow?.clientName);
  ok('…with a PURGED tombstone carrying what it had', (e => !!e && e.metadata?.taskGroupCount === 1 && typeof e.metadata?.loggedHours === 'number')(eventsOf(pRow, 'PURGED')[0]),
    JSON.stringify(eventsOf(pRow, 'PURGED')[0]?.metadata)?.slice(0, 200));
  ok('…and the purged client listed among its rounds', (pRow?.rounds ?? []).some(r => r.purged && r.title === doomed.title));
  ok('…its whole history still there (MINTED → DELETED → PURGED)',
    ['MINTED', 'DELETED', 'PURGED'].every(t => eventsOf(pRow, t).length === 1));
  const afterPurge = (await create(admin.s, { title: `After purge ${RUN}` })).data;
  ok('a purged CID is never issued again', afterPurge.code !== doomed.code && serialOf(afterPurge.code) > serialOf(doomed.code));

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('Change CID: merge, split, reassign');
  const A = (await create(admin.s, { title: `Merge A ${RUN}` })).data;
  const B = (await create(admin.s, { title: `Merge B ${RUN}` })).data;
  const prev = await admin.s(`/projects/${A.id}/cid-move?mode=MERGE&intoProjectId=${B.id}`);
  ok('the merge preview says what will happen', prev.data?.ok === true && prev.data?.toCid === B.code && prev.data?.retiresFromCid === true, brief(prev));
  ok('the lead may not change a CID', (await lead.s(`/projects/${A.id}/cid/merge`, { method: 'POST', headers: withPass, body: { intoProjectId: B.id } })).status === 403);
  ok('an admin may not without the passcode', [401, 403].includes((await admin.s(`/projects/${A.id}/cid/merge`, { method: 'POST', body: { intoProjectId: B.id } })).status));
  const merged = await admin.s(`/projects/${A.id}/cid/merge`, { method: 'POST', headers: withPass, body: { intoProjectId: B.id } });
  ok('merge A into B', (merged.status === 201 || merged.status === 200) && merged.data?.toCid === B.code && merged.data?.fromCidStatus === 'MERGED', brief(merged));
  const Anow = await get(A.id);
  ok('A now carries B\'s CID, as client 2 under it', Anow?.code === B.code && Anow?.roundSeq === 2, `${Anow?.code} r${Anow?.roundSeq}`);
  rows = await ledger();
  const oldA = rowFor(rows, A.code);
  ok('A\'s old CID reads Merged → B\'s', oldA?.status === 'MERGED' && oldA.mergedIntoCid === B.code, JSON.stringify(oldA && { s: oldA.status, m: oldA.mergedIntoCid }));
  ok('…under A\'s last name', oldA?.clientName === A.title, oldA?.clientName);
  const bRow = rowFor(rows, B.code);
  ok('B\'s CID holds both clients now', bRow?.liveRoundCount === 2 && bRow.status === 'ACTIVE');
  ok('the MERGED event is on both numbers\' timelines',
    eventsOf(oldA, 'MERGED').length === 1 && eventsOf(bRow, 'MERGED').length === 1
    && eventsOf(bRow, 'MERGED')[0].fromCid === A.code && eventsOf(bRow, 'MERGED')[0].toCid === B.code);
  const intoRetired = await admin.s(`/projects/${B.id}/cid/merge`, { method: 'POST', headers: withPass, body: { cid: A.code } });
  ok('nothing can be merged into a retired CID', intoRetired.status === 400, brief(intoRetired));
  const reuse = await admin.s(`/projects/${B.id}/cid/split`, { method: 'POST', headers: withPass, body: { cid: A.code } });
  ok('nor can a split take a retired CID over', reuse.status === 400, brief(reuse));

  const split = await admin.s(`/projects/${A.id}/cid/split`, { method: 'POST', headers: withPass, body: {} });
  ok('split A back out — it is issued the NEXT CID, not its old one', (split.status === 201 || split.status === 200)
    && split.data?.toCid !== A.code && serialOf(split.data?.toCid) > serialOf(afterPurge.code), brief(split));
  rows = await ledger();
  ok('B\'s CID stays Active with B alone', (r => r?.status === 'ACTIVE' && r.liveRoundCount === 1)(rowFor(rows, B.code)));
  ok('the SPLIT is recorded under A\'s new CID, from B\'s', (e => e?.fromCid === B.code)(eventsOf(rowFor(rows, split.data?.toCid), 'SPLIT')[0]));

  const C = (await create(admin.s, { title: `Reassign ${RUN}` })).data;
  const re = await admin.s(`/projects/${C.id}/cid/reassign`, { method: 'POST', headers: withPass, body: {} });
  ok('reassign a client to a fresh CID', (re.status === 201 || re.status === 200) && re.data?.toCid !== C.code, brief(re));
  rows = await ledger();
  ok('its old CID is retired, never to be issued again', (r => r?.status === 'RETIRED' && r.registryStatus === 'DISCONTINUED')(rowFor(rows, C.code)));
  ok('REASSIGNED from → to', (e => e?.fromCid === C.code && e?.toCid === re.data?.toCid)(eventsOf(rowFor(rows, re.data?.toCid), 'REASSIGNED')[0]));

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('a client restored after its number was retired gets a new one, never the old');
  const E = (await create(admin.s, { title: `Rounds E ${RUN}` })).data;
  const E2 = await admin.s(`/projects/${E.id}/rounds`, { method: 'POST', body: { title: `Rounds E2 ${RUN}` } });
  ok('a second client under E\'s CID', E2.status === 201 && E2.data?.code === E.code && E2.data?.roundSeq === 2, brief(E2));
  ok('ROUND_ADDED is recorded', eventsOf(rowFor(await ledger(), E.code), 'ROUND_ADDED').length === 1);
  await admin.s(`/projects/${E2.data.id}`, { method: 'DELETE' });
  const F = (await create(admin.s, { title: `Rounds F ${RUN}` })).data;
  const mergeE = await admin.s(`/projects/${E.id}/cid/merge`, { method: 'POST', headers: withPass, body: { intoProjectId: F.id } });
  ok('E merges away, leaving only the deleted E2 on E\'s CID', mergeE.data?.fromCidStatus === 'MERGED', brief(mergeE));
  const rE2 = await admin.s(`/admin/data/projects/${E2.data.id}/restore`, { method: 'POST' });
  ok('restoring E2 works', rE2.status === 201 || rE2.status === 200, brief(rE2));
  ok('…with a fresh CID, because its old one is merged away', rE2.data?.cidReissued === true && rE2.data?.cid !== E.code && CID_RE.test(rE2.data?.cid ?? ''), brief(rE2));
  rows = await ledger();
  ok('E\'s CID stays Merged → F\'s', (r => r?.status === 'MERGED' && r.mergedIntoCid === F.code)(rowFor(rows, E.code)));
  const e2Row = rowFor(rows, rE2.data?.cid);
  ok('the new CID\'s history says where it came from',
    eventsOf(e2Row, 'MINTED')[0]?.fromCid === E.code && eventsOf(e2Row, 'RESTORED')[0]?.fromCid === E.code);

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('who may read the ledger, and what it withholds');
  const hrL = await hr.s('/projects/cid-ledger');
  ok('HR reads the ledger', hrL.status === 200 && Array.isArray(hrL.data), brief(hrL));
  ok('a member without user.manage_access cannot', (await staff.s('/projects/cid-ledger')).status === 403);
  ok('nor can a client lead', (await lead.s('/projects/cid-ledger')).status === 403);
  const leaks = (hrL.data ?? []).filter(r => 'client' in r || (r.rounds ?? []).some(x => 'client' in x || 'clientId' in x));
  ok('the confidential client fact is never in HR\'s copy', leaks.length === 0, JSON.stringify(leaks[0])?.slice(0, 200));
  const hrRow = rowFor(hrL.data ?? [], B.code), suRow = rowFor(await ledger(), B.code);
  ok('…while the rest of the row is the same as the admin\'s', !!hrRow && hrRow.status === suRow.status
    && hrRow.clientName === suRow.clientName && hrRow.events.length === suRow.events.length && hrRow.totalLoggedHours === suRow.totalLoggedHours);

  step('everything the CSV exports is in the payload');
  rows = await ledger();
  const ROW_FIELDS = ['cid', 'status', 'registryStatus', 'mergedIntoCid', 'clientName', 'pastNames', 'clientGroup', 'managers',
    'createdBy', 'createdAt', 'roundCount', 'liveRoundCount', 'taskGroupCount', 'totalAllottedHours', 'totalLoggedHours', 'events', 'lastEventAt', 'rounds'];
  const EVENT_FIELDS = ['id', 'type', 'label', 'at', 'cid', 'clientTitle', 'fromCid', 'toCid', 'fromTitle', 'toTitle', 'actorName', 'metadata'];
  const ROUND_FIELDS = ['id', 'round', 'title', 'phase', 'deleted', 'purged', 'clientGroup', 'managers', 'loggedHours', 'allottedHours', 'taskGroupCount'];
  const missingRow = ROW_FIELDS.filter(f => rows.some(r => !(f in r)));
  const missingEv = EVENT_FIELDS.filter(f => rows.some(r => r.events.some(e => !(f in e))));
  const missingRd = ROUND_FIELDS.filter(f => rows.some(r => r.rounds.some(x => !(f in x))));
  ok('every CID row carries every CSV column', missingRow.length === 0, missingRow.join(','));
  ok('every event carries every events-CSV column', missingEv.length === 0, missingEv.join(','));
  ok('every client under a CID carries its columns', missingRd.length === 0, missingRd.join(','));

  // ─────────────────────────────────────────────────────────────────────────────────────────
  step('the invariants, over the whole organisation');
  const live = (await admin.s('/projects')).data ?? [];
  ok('every live client has a CID', live.every(p => CID_RE.test(p.code ?? '')), JSON.stringify(live.filter(p => !CID_RE.test(p.code ?? '')).map(p => p.title)));
  const cids = rows.map(r => r.cid);
  ok('no CID appears twice in the registry', new Set(cids).size === cids.length);
  const serialKey = rows.map(r => `${r.fyLabel}:${r.serial}`);
  ok('no serial is issued twice in a financial year', new Set(serialKey).size === serialKey.length);
  const liveIds = new Set(live.map(p => p.id));
  const placed = rows.flatMap(r => r.rounds.filter(x => !x.deleted).map(x => x.id)).filter(id => liveIds.has(id));
  ok('every live client sits under exactly one ledger row', placed.length === live.length && new Set(placed).size === placed.length,
    `${placed.length} placements for ${live.length} live clients`);
  ok('every CID has at least one event', rows.every(r => r.events.length > 0), rows.filter(r => !r.events.length).map(r => r.cid).join(','));
  ok('a retired CID holds no live client', rows.filter(r => ['MERGED', 'PURGED', 'RETIRED'].includes(r.status)).every(r => r.liveRoundCount === 0));
  ok('a merged CID always says where it went', rows.filter(r => r.status === 'MERGED').every(r => cids.includes(r.mergedIntoCid)));

  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) { console.log('\nFailures:\n  ' + fails.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
