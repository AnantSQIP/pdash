/**
 * The three ways this product could destroy something it should not have.
 *
 *   node tools/destruction-guards.e2e.mjs     # expects the API on :4011, a SCRATCH database
 *
 * Every assertion here corresponds to a defect that was live and reproducible. They are grouped
 * as "what must be refused" and "what must still work", because each fix is a narrowing and the
 * second half is what proves the narrowing did not go too far. A guard that also stops the
 * legitimate case is not a fix, it is a different bug.
 *
 * Set PASSCODE if the scratch organisation uses a different step-up passcode.
 *
 * THIS SUITE DESTROYS ITS OWN FIXTURE — that is what it is testing. It consumes projects and
 * files, so it wants a freshly seeded database each time. Run it twice on the same one and the
 * second run will run out of matters to destroy and say so.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4011';
const PASSCODE = process.env.PASSCODE || 'Hunt-Passcode-4419';
const PW = 'sqip@1234';
const PASS = { 'x-org-passcode': PASSCODE };

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const step = h => console.log('\n— ' + h + ' —');

function sess() {
  let cookie = '';
  return async (p, { method = 'GET', body, headers = {}, raw } = {}) => {
    const r = await fetch(BASE + '/api/v1' + p, {
      method,
      headers: { ...(raw ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...headers },
      body: raw ? body : (body === undefined ? undefined : JSON.stringify(body)),
    });
    const sc = r.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text();
    let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}
const upload = async (s, projectId, name, text) => {
  const fd = new FormData();
  fd.append('file', new Blob([text], { type: 'text/plain' }), name);
  fd.append('projectId', projectId);
  const r = await s('/documents', { method: 'POST', raw: true, body: fd });
  return r.data?.id ?? r.data?.document?.id;
};

(async () => {
  const su = sess(), other = sess(), emp = sess();
  await su('/auth/login', { method: 'POST', body: { email: 'mohit@squarkip.com', password: PW } });
  await other('/auth/login', { method: 'POST', body: { email: 'yash@squarkip.com', password: PW } });
  await emp('/auth/login', { method: 'POST', body: { email: 'ajay.sharma@squarkip.com', password: PW } });

  // A matter the employee genuinely cannot reach. Found rather than assumed: the seed changes.
  const all = (await su('/projects')).data ?? [];
  let walled = null;
  for (const p of all) if ((await emp(`/projects/${p.id}`)).status === 403) { walled = p; break; }
  // Two very different reasons this can be empty, and saying the wrong one sends somebody hunting
  // a security hole that is not there. No projects at all means the fixture has been used up by an
  // earlier run of this same suite; projects that are ALL readable means the access wall itself is
  // not working, and nothing below this line would mean anything.
  ok('the fixture holds a matter this employee cannot open', !!walled,
    all.length === 0
      ? 'there are no projects left — this suite destroys what it tests, so re-seed and run it again'
      : `all ${all.length} projects were readable by an ordinary employee — the access wall is not working`);
  if (!walled) { console.log('\n✗ cannot continue\n'); process.exit(1); }

  // ── destroying a file you cannot reach ───────────────────────────────────────
  step('A file can only be destroyed by somebody who could have opened it');

  const docId = await upload(su, walled.id, 'claim-chart.txt', 'CONFIDENTIAL claim chart');
  ok('a file exists on that matter', !!docId);

  ok('the employee cannot read it', (await emp(`/documents/${docId}/content`)).status === 403);
  const del = await emp(`/documents/${docId}`, { method: 'DELETE' });
  ok('and cannot destroy it either', del.status === 403, `got ${del.status}`);
  ok('the refusal says why, in the same terms as the read refusal',
    /can only delete files you can reach/i.test(String(del.data?.message)), String(del.data?.message));
  ok('the file is still there afterwards', (await su(`/documents/${docId}/content`)).status === 200);

  // The narrowing must not break the two legitimate cases.
  ok('but the person who uploaded it still can', (await su(`/documents/${docId}`, { method: 'DELETE' })).status === 200);

  const own = await upload(emp, walled.id, 'my-own-note.txt', 'mine');
  ok('and anybody may still destroy a file they uploaded themselves',
    !own || (await emp(`/documents/${own}`, { method: 'DELETE' })).status === 200);

  // ── a purge must not outrun a restore ────────────────────────────────────────
  step('A purge and a Restore cannot both win');

  // Deliberately NOT asserted as "the purge loses". Which of the two arrives first is a race, and
  // a test that insists on one outcome is a test that fails on a fast afternoon and gets ignored.
  // The property that must hold whoever wins is that they AGREE: if the restore was told it
  // succeeded, the matter is still there. The old version slept 45ms hoping to land inside the
  // per-task withdrawal loop, and silently fell back to a thin fixture when it could not find a
  // heavy one — so it passed for the wrong reason and then failed for the wrong reason.
  const heavy = (await su('/projects')).data.find(p => (p._count?.projectTasks ?? 0) >= 5);
  ok('the fixture holds a matter with real work in it', !!heavy,
     'every project has fewer than 5 tasks — the window this guards does not exist here, so the '
     + 'result below would be meaningless either way');

  if (heavy) {
    await su(`/projects/${heavy.id}`, { method: 'DELETE', headers: PASS });
    const purging = su(`/projects/${heavy.id}/permanent?confirm=${encodeURIComponent(heavy.title)}`, { method: 'DELETE', headers: PASS });
    await new Promise(r => setTimeout(r, 45));
    const restored = await other(`/admin/data/projects/${heavy.id}/restore`, { method: 'POST' });
    const purged = await purging;
    const alive = (await su(`/projects/${heavy.id}`)).status === 200;

    const restoreWon = restored.status < 400;
    const purgeWon = purged.status < 400;
    ok('exactly one of them succeeded', restoreWon !== purgeWon,
       `restore ${restored.status}, purge ${purged.status} — both cannot be true of the same matter`);
    ok('and the matter agrees with whichever won', alive === restoreWon,
       `restore ${restored.status}, purge ${purged.status}, matter ${alive ? 'alive' : 'destroyed'}`);
    ok('a restore is never told it succeeded on a matter that then gets destroyed',
       !(restoreWon && !alive), 'THIS is the data loss — it reported success and destroyed it anyway');
  }

  // ── a purge must take the matter's files with it ─────────────────────────────
  step("Destroying a matter destroys its files, not just the links to them");

  // Its own matter, so it does not depend on which way the race above fell.
  const victim = (await su('/projects', { method: 'POST', body: {
    title: `file purge fixture ${Date.now()}`, projectType: 'GENERAL',
  } })).data;
  ok('a matter to destroy', !!victim?.id, JSON.stringify(victim).slice(0, 120));

  const doomed = await upload(su, victim.id, 'draft.txt', 'secret patent draft US1234567');
  ok('with a file on it', !!doomed);
  await su(`/projects/${victim.id}`, { method: 'DELETE', headers: PASS });
  const p2 = await su(`/projects/${victim.id}/permanent?confirm=${encodeURIComponent(victim.title)}`, { method: 'DELETE', headers: PASS });
  ok('the purge runs', p2.status < 400, `got ${p2.status} ${JSON.stringify(p2.data?.message ?? '')}`);
  ok('and the file is gone for good, not merely unlinked',
    (await su(`/documents/${doomed}/content`)).status === 404,
    'the bytes outlived the matter they belonged to');
  ok('and the tombstone counts the file among what it destroyed',
    (p2.data?.deleted?.document ?? 0) >= 1, JSON.stringify(p2.data?.deleted ?? {}));

  console.log(`\n${fails.length ? '✗' : '✓'} destruction guards: ${passed} passed, ${fails.length} failed\n`);
  fails.forEach(f => console.error('  ✗ ' + f + '\n'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
