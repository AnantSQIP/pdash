/**
 * A/B: the previous release against this branch, on identical data.
 *
 *   BEFORE=http://127.0.0.1:4012 AFTER=http://127.0.0.1:4011 node tools/ab-before-after.mjs
 *
 * A green test suite proves the code does what the tests say. It does not prove the code still
 * does what it did last week, because a test only covers what somebody thought to write down.
 * This runs the same requests, as the same people, against both builds and DIFFS the answers.
 *
 * The point is the SILENCE. Every endpoint listed below is one this batch was not meant to touch,
 * so any difference is a regression until explained. The handful that ARE meant to differ are
 * listed separately and asserted to differ — a change nobody can see is as suspicious as a
 * change nobody asked for.
 *
 * Volatile fields (clocks, freshly minted ids, "generated at" stamps) are stripped before the
 * comparison; everything else is compared exactly.
 *
 * THE TWO DATABASES MUST BE IN SYNC WHEN THIS RUNS. Copy one from the other immediately before,
 * and do not run the e2e suites in between — they WRITE, and they only write to one side, so the
 * next comparison reports their own edits as regressions. That is not a hypothetical: it happened
 * once here and read convincingly, right down to a plausible-looking progress percentage.
 *
 *   pg_dump -h 127.0.0.1 -U pdash -d <after-db> --no-owner --no-acl | psql -U pdash -d <before-db>
 */
const BEFORE = process.env.BEFORE || 'http://127.0.0.1:4012';
const AFTER = process.env.AFTER || 'http://127.0.0.1:4011';
const PW = 'sqip@1234';

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };

function sess(base) {
  let cookie = '';
  return async (p, { method = 'GET', body } = {}) => {
    const r = await fetch(base + '/api/v1' + p, {
      method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text();
    let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}

/**
 * Anything that legitimately differs between two processes started seconds apart: wall clocks,
 * relative day counts derived from them, and the cuids minted by whichever build was asked first.
 * Comparing these would produce noise that buries a real difference.
 */
const VOLATILE = new Set([
  'generatedAt', 'timestamp', 'createdAt', 'updatedAt', 'lastSeenAt', 'at', 'now',
  'expiresAt', 'issuedAt', 'runningSince', 'startedAt', 'elapsedMinutes', 'seconds',
]);
function normalise(v) {
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (VOLATILE.has(k)) continue;
      out[k] = normalise(v[k]);
    }
    return out;
  }
  return v;
}
const same = (a, b) => JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));

/**
 * The same content, whatever order it arrived in.
 *
 * A few endpoints have no stable sort — two rows tie on everything the query orders by, and
 * Postgres is free to return them either way round. Each BUILD is self-consistent (asked twice,
 * it answers the same), so this is not flakiness inside one release; it only shows up when two
 * processes are compared. Those endpoints are compared by content instead, and named below, so
 * the looser comparison is a decision on the record rather than a silent weakening.
 */
const deepSort = v => Array.isArray(v)
  ? v.map(deepSort).sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1))
  : (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, deepSort(v[k])])) : v);
const sameContent = (a, b) => JSON.stringify(deepSort(normalise(a))) === JSON.stringify(deepSort(normalise(b)));

/** Endpoints whose row order is not deterministic. Compared by content, not by sequence. */
const UNORDERED = new Set(['/departments', '/capacity/team?days=14', '/capacity/team?days=7']);
const brief = v => { const s = JSON.stringify(normalise(v)); return s.length > 220 ? s.slice(0, 220) + '…' : s; };

/** The first place two JSON values disagree, so a failure points somewhere rather than dumping. */
function firstDiff(a, b, path = '') {
  const na = normalise(a), nb = normalise(b);
  if (JSON.stringify(na) === JSON.stringify(nb)) return null;
  if (na === null || nb === null || typeof na !== 'object' || typeof nb !== 'object') {
    return `${path || '(root)'}: before=${JSON.stringify(na)} after=${JSON.stringify(nb)}`;
  }
  if (Array.isArray(na) !== Array.isArray(nb)) return `${path}: one is an array, the other is not`;
  if (Array.isArray(na)) {
    if (na.length !== nb.length) return `${path}: ${na.length} items before, ${nb.length} after`;
    for (let i = 0; i < na.length; i++) { const d = firstDiff(na[i], nb[i], `${path}[${i}]`); if (d) return d; }
    return null;
  }
  for (const k of new Set([...Object.keys(na), ...Object.keys(nb)])) {
    const d = firstDiff(na[k], nb[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return null;
}

/** Endpoints this batch was NOT meant to change. Any difference here is a regression. */
const UNCHANGED = [
  ['the team directory', '/users'],
  ['the project list', '/projects'],
  ['the permission catalogue', '/permissions'],
  ['my own effective permissions', '/permissions/me/effective-permissions'],
  ['the workflow statuses', '/statuses'],
  ['the departments', '/departments'],
  ['the holidays', '/holidays'],
  ['the leave types', '/leave/types'],
  ['my leave', '/leave/me'],
  ['my attendance', '/attendance/me'],
  ['my expenses', '/expenses/me'],
  ['my notifications', '/notifications'],
  ['the tags', '/tags'],
  ['the channels', '/channels'],
  ['the org-wide analytics', '/analytics/overview'],
  ['the daily digest', '/daily-digest/preview'],
  ['the capacity board on a plain length', '/capacity/team?days=14'],
  ['the capacity board for a week', '/capacity/team?days=7'],
  ['the coverage risks', '/capacity/coverage-risks?days=14'],
  ['my plan for today', '/capacity/my-plan?date=' + new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)],
  ['the running timer', '/tasks/timer/running'],
  ['what the timer has today', '/tasks/timer/today'],
  ['the task standards', '/tasks/standards'],
  ['the PID ledger', '/patents/pid-ledger'],
  ['the appraisal cycles', '/appraisals/cycles'],
  ['the company feed', '/company/announcements'],
  ['the HR policies', '/company/policies'],
  ['the BD pipeline', '/deals'],
  ['the team spaces', '/teams'],
];

/** Endpoints this batch WAS meant to change. A difference here is the feature working. */
const CHANGED = [
  ['the capacity board asked to start on a named day', '/capacity/team?days=5&from=2026-09-14'],
  // Found BY this comparison: asked without an organisation id, the old build answered with every
  // organisation's roles, because `where: { organizationId: undefined }` is not an empty filter in
  // Prisma — it is no filter. The new build answers with the caller's own organisation only.
  ['the roles, asked without naming an organisation', '/roles'],
];

(async () => {
  const b = sess(BEFORE), a = sess(AFTER);
  for (const [s, base] of [[b, BEFORE], [a, AFTER]]) {
    const r = await s('/auth/login', { method: 'POST', body: { email: 'mohit@squarkip.com', password: PW } });
    if (r.status >= 400) { console.error(`cannot sign in on ${base}: ${r.status}`); process.exit(1); }
  }

  console.log('\n— endpoints this batch was not meant to touch —');
  for (const [name, path] of UNCHANGED) {
    const [rb, ra] = await Promise.all([b(path), a(path)]);
    if (rb.status !== ra.status) {
      ok(name, false, `status ${rb.status} before, ${ra.status} after`);
      continue;
    }
    // A 404 on both means the route does not exist in either build; that is still agreement,
    // but say so rather than quietly counting it as a pass for a thing nobody tested.
    if (rb.status === 404) { ok(`${name} (no such route in either build)`, true); continue; }
    if (UNORDERED.has(path)) {
      ok(`${name} (same content, row order is not deterministic in either build)`,
        sameContent(rb.data, ra.data), firstDiff(rb.data, ra.data) ?? '');
      continue;
    }
    ok(name, same(rb.data, ra.data), firstDiff(rb.data, ra.data) ?? '');
  }

  console.log('\n— endpoints this batch was meant to change —');
  for (const [name, path] of CHANGED) {
    const [rb, ra] = await Promise.all([b(path), a(path)]);
    ok(`${name} answers differently, as intended`, !same(rb.data, ra.data),
      `identical on both builds — the change did not take: ${brief(ra.data)}`);
  }

  // The new routes must be absent before and present after. A route that answers on BOTH would
  // mean the "before" build is not what it claims to be, and every comparison above is worthless.
  console.log('\n— the new routes exist only on the new build —');
  for (const [name, path] of [
    ['the KPI endpoint', '/performance/kpis/me'],
    ['the project KPIs', '/performance/kpis/projects'],
    ['the deleted-data screen', '/admin/data/deleted'],
  ]) {
    const [rb, ra] = await Promise.all([b(path), a(path)]);
    ok(`${name} is new`, rb.status === 404 && ra.status === 200, `before ${rb.status}, after ${ra.status}`);
  }

  console.log('\n— a permission that must now be refused, and was not before —');
  const mb = sess(BEFORE), ma = sess(AFTER);
  for (const s of [mb, ma]) await s('/auth/login', { method: 'POST', body: { email: 'ankit.verma@squarkip.com', password: PW } });
  const [ob, oa] = await Promise.all([mb('/performance/org'), ma('/performance/org')]);
  ok('a Manager could read org performance before, and cannot now',
    ob.status === 200 && oa.status === 403, `before ${ob.status}, after ${oa.status}`);

  console.log(`\n${fails.length ? '✗' : '✓'} ${passed} passed, ${fails.length} failed\n`);
  fails.forEach(f => console.error('  ✗ ' + f + '\n'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
