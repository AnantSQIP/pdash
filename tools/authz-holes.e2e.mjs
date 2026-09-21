/**
 * Object-level authorization holes found by the 2026-09 hunt. Each check asserts the behaviour
 * the system ALREADY claims for itself elsewhere, so every failure here is a contradiction
 * inside the product rather than a matter of opinion.
 *
 *   node tools/authz-holes.e2e.mjs      # expects the API on :4011, a SCRATCH database
 *
 * The three claims being held to:
 *
 *   1. CLIENT IDENTITY IS SUPER-ADMIN ONLY. projects.service.get() deletes `client` and
 *      `clientId` from a project unless the caller holds `patent.manage`, with a comment saying
 *      exactly that. Two other routes over the same rows — /projects/:id/rounds and
 *      /projects/full-report — never apply it, so the name comes back to anyone who can reach
 *      the project. Any Employee can reach one: `project.create` plus the patent ids that
 *      `patent.view` already hands out is enough to mint a project that resolves a patent to
 *      its client.
 *
 *   2. A FILE YOU MAY NOT READ IS A FILE YOU MAY NOT DESTROY. documents.getContent() authorizes
 *      a read through the document's links (project member, channel member, uploader …);
 *      softDelete() checks only that the actor holds `document.delete`, which every seeded role
 *      does. So the 403 on the read and the 200 on the delete are the same person, same file.
 *
 *   3. THE CONFLICT WALL APPLIES TO A MATTER'S TASK LISTS. Every other delivery route calls
 *      assertProjectAccess; the task-list routes call nothing at all, and the two read routes
 *      carry no @RequirePermission either.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4011';
const PW = 'sqip@1234';
// Actors are chosen by what they may DO (/me/effective-permissions), not by name — the roster
// moves (ajay.sharma, once the Employee here, is now a Senior Consultant with oversight of every
// matter, and every "refused" check below then read 200):
//   ADMIN      — patent.manage (a Super Admin)
//   STAFF      — project.create, no project.approve (no oversight), no tasklist.create
//   CONSULTANT — tasklist.create, no project.approve
//   MEMBER     — anyone else without oversight who is staffed on some matter (uploads the file)
const CANDIDATES = [
  'mohit@squarkip.com', 'aman.sharma@squarkip.com', 'meetu.singh@squarkip.com', 'basant.goyal@squarkip.com',
  'ketan.dagar@squarkip.com', 'khushi.gupta@squarkip.com', 'amritpal.kaur@squarkip.com', 'vijay.mishra@squarkip.com',
  'drishti.jain@squarkip.com', 'rajesh.joshi@squarkip.com', 'ritik.sharma@squarkip.com',
];
const PASSCODE = process.env.ORG_PASSCODE || 'Hunt-Passcode-4419';

let passed = 0; const fails = [];
const ok = (n, c, d = '') => {
  if (c) { passed++; console.log('  ok  ' + n); }
  else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); }
};
let skipped = 0;
const skip = (n, why) => { skipped++; console.log(`  --   skipped: ${n} (${why})`); };

function sess() {
  let cookie = '';
  return async (p, { method = 'GET', body, form, passcode } = {}) => {
    const headers = { ...(cookie ? { cookie } : {}), ...(passcode ? { 'x-org-passcode': passcode } : {}) };
    if (!form) headers['content-type'] = 'application/json';
    const r = await fetch(BASE + '/api/v1' + p, {
      method, headers,
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const sc = r.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}

const login = async (s, email) => s('/auth/login', { method: 'POST', body: { email, password: PW } });

(async () => {
  const picked = {};
  for (const email of CANDIDATES) {
    if (picked.ADMIN && picked.STAFF && picked.CONSULTANT && picked.MEMBER) break;
    const s = sess();
    if ((await login(s, email)).status >= 300) continue;
    const c = new Set(((await s('/me/effective-permissions')).data?.codes ?? []).map(x => (typeof x === 'string' ? x : x.code)));
    if (!picked.ADMIN && c.has('patent.manage')) picked.ADMIN = s;
    else if (!picked.STAFF && c.has('project.create') && !c.has('project.approve') && !c.has('tasklist.create')) picked.STAFF = s;
    else if (!picked.CONSULTANT && c.has('tasklist.create') && !c.has('project.approve')) picked.CONSULTANT = s;
    else if (!picked.MEMBER && !c.has('project.approve') && ((await s('/projects')).data ?? []).length > 0) picked.MEMBER = s;
  }
  const missing = ['ADMIN', 'STAFF', 'CONSULTANT', 'MEMBER'].filter(k => !picked[k]);
  if (missing.length) { console.log(`FIXTURE: nobody in the roster fits ${missing.join(', ')} — reseed the scratch database`); process.exit(2); }
  const admin = picked.ADMIN, staff = picked.STAFF, consultant = picked.CONSULTANT, member = picked.MEMBER, hr = sess();
  await login(hr, 'hr@squarkip.com');

  // ── A client with patents to resolve ────────────────────────────────────────
  let client = ((await admin('/clients')).data ?? [])[0];
  if (!client) {
    client = (await admin('/clients', {
      method: 'POST', passcode: PASSCODE,
      body: { name: 'Mailike Industries', code: 'MLK' },
    })).data;
  }
  let patents = (await admin('/patents')).data ?? [];
  if (!patents.length) {
    patents = (await admin('/patents', {
      method: 'POST', passcode: PASSCODE,
      body: { clientId: client.id, realNumbers: ['US 10,123,456 B2'] },
    })).data ?? [];
  }
  // CLIENTS-FLOW: patents and client codes are switched off (PATENTS_AND_CLIENT_CODES=false).
  // Claim 1 is about a client identity that no longer exists to leak, so it is SKIPPED, not
  // deleted — it must run again the day the feature comes back. Claims 2 and 3 below are about
  // documents and task lists and still hold, so the suite carries on instead of dying at setup,
  // which is what it did when the flag first went off.
  const options = (await staff('/patents/options')).data ?? [];
  const patentsOff = !client?.name || patents.length === 0 || !options.length;
  if (patentsOff) {
    skip('claim 1: client identity must not reach a non-patent.manage caller',
      'patents and client codes are switched off — no client fact exists to leak');
  } else {
    ok('setup: a client with at least one patent exists', !!client?.name && patents.length > 0);
    ok('an Employee can list every patent id (patent.view, by design)', Array.isArray(options) && options.length > 0);
  }

  const managers = ((await staff('/projects/eligible-managers')).data?.managers ?? []);
  const made = await staff('/projects', {
    method: 'POST',
    body: {
      title: 'authz-holes probe',
      ...(patentsOff ? {} : { patentIds: [options[0].id] }),
      managerId: managers[0]?.id,
    },
  });
  const mineId = made.data?.id;
  ok(patentsOff ? 'an Employee can create a client' : 'an Employee can create a project tagging a patent they chose',
    made.status === 201 && !!mineId && !!made.data?.code, `status ${made.status} ${JSON.stringify(made.data).slice(0, 160)}`);

  if (patentsOff) {
    skip('the client fact on /projects/:id, /rounds, /full-report and /cid-ledger', 'no client fact exists');
  } else {
    const detail = (await staff(`/projects/${mineId}`)).data;
    ok('GET /projects/:id withholds the client from a non-patent.manage caller',
      detail?.client == null && detail?.clientId == null,
      `client=${JSON.stringify(detail?.client)}`);

    const rounds = (await staff(`/projects/${mineId}/rounds`)).data;
    const roundClient = (rounds?.rounds ?? [])[0]?.client;
    ok('GET /projects/:id/rounds must withhold it too', roundClient == null,
      `leaked client=${JSON.stringify(roundClient)}`);

    const report = (await staff('/projects/full-report')).data ?? [];
    const mine = report.find(p => p.id === mineId);
    ok('GET /projects/full-report must withhold it too', mine != null && mine.client == null,
      `leaked client=${JSON.stringify(mine?.client)} on patents ${JSON.stringify(mine?.patents)}`);

    // HR holds user.manage_access but no patent permission at all — /patents is 403 for them.
    const hrPatents = await hr('/patents');
    const ledger = await hr('/projects/cid-ledger');
    const ledgerClients = JSON.stringify(ledger.data ?? []).includes(client.name);
    ok('HR is refused the patent portal', hrPatents.status === 403);
    ok('GET /projects/cid-ledger must not hand HR the client name either', !ledgerClients,
      `cid-ledger contains "${client.name}"`);
  }

  // ── 2. A file you may not read is a file you may not destroy ────────────────
  // A matter the member is on and neither the Employee nor the Consultant is — every refusal below
  // is asserted for one or the other, and a matter they ARE on would prove nothing.
  const outsiders = new Set([
    ...((await staff('/projects')).data ?? []).map(p => p.id),
    ...((await consultant('/projects')).data ?? []).map(p => p.id),
  ]);
  const foreign = ((await member('/projects')).data ?? []).find(p => p.id !== mineId && !outsiders.has(p.id));
  ok('setup: a matter the Employee is not staffed on', !!foreign);

  const fd = new FormData();
  fd.append('file', new Blob(['CONFIDENTIAL — claim chart'], { type: 'text/plain' }), 'claim-chart.txt');
  fd.append('projectId', foreign.id);
  const doc = (await member('/documents', { method: 'POST', form: fd })).data;
  ok('setup: a member uploaded a file to that matter', !!doc?.id);

  const read = await staff(`/documents/${doc.id}/content`);
  ok('the Employee is refused the READ', read.status === 403, `status ${read.status}`);

  const del = await staff(`/documents/${doc.id}`, { method: 'DELETE' });
  ok('the Employee must be refused the DELETE as well', del.status === 403,
    `status ${del.status} — the file was destroyed by someone who could not open it`);

  // Reachable with no id-guessing at all: every policy attachment's id is public to the firm.
  const policies = (await staff('/company/policies')).data ?? [];
  const withDoc = policies.find(p => p.document?.id);
  if (withDoc) {
    const delPolicy = await staff(`/documents/${withDoc.document.id}`, { method: 'DELETE' });
    ok('an Employee must not be able to destroy an HR policy attachment', delPolicy.status === 403,
      `status ${delPolicy.status} — "${withDoc.title}" lost its document`);
  } else {
    console.log('  --  skipped: no HR policy with an attachment to test against');
  }

  // ── 3. The conflict wall applies to a matter's task lists ───────────────────
  const listRead = await staff(`/projects/${foreign.id}/tasklists`);
  ok('a non-member must not read a matter\'s task lists', listRead.status === 403,
    `status ${listRead.status} ${JSON.stringify(listRead.data).slice(0, 160)}`);

  const hrRead = await hr(`/projects/${foreign.id}/tasklists`);
  ok('HR, who holds no tasklist.view at all, must not read them', hrRead.status === 403,
    `status ${hrRead.status}`);

  const injected = await consultant(`/projects/${foreign.id}/tasklists`, {
    method: 'POST', body: { name: 'authz-holes injected list' },
  });
  ok('a non-member must not CREATE a task list inside a matter', injected.status === 403,
    `status ${injected.status} — created ${JSON.stringify(injected.data?.name)}`);

  const def = (listRead.data ?? []).find?.(l => l.isDefault);
  if (def) {
    const renamed = await consultant(`/projects/${foreign.id}/tasklists/${def.id}`, {
      method: 'PATCH', body: { name: 'authz-holes renamed' },
    });
    ok('a non-member must not RENAME a matter\'s task list', renamed.status === 403,
      `status ${renamed.status}`);
  }

  console.log(`\n${passed} passed, ${fails.length} failed${skipped ? `, ${skipped} skipped` : ''}`);
  if (fails.length) { console.log('\nFailures:\n  ' + fails.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
