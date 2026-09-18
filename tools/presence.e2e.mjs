/**
 * Presence, end to end — the dot everyone sees next to everyone.
 *
 *   BASE=http://127.0.0.1:4022 node tools/presence.e2e.mjs      # a SCRATCH database
 *
 * What the firm asked for (2026-09-18): anyone can see everyone's presence; five minutes without
 * using the PC turns a person yellow; and In a meeting is a real state. The browser decides
 * "five minutes without input" (on the whole PC where it may — see lib/presence-context.tsx) and
 * reports it on its heartbeat; this suite drives those heartbeats directly and checks what every
 * other person is then shown.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4011';
const PW = process.env.PW || 'sqip@1234';

let passed = 0; const fails = [];
const ok = (n, c, d = '') => { if (c) { passed++; console.log('  ok  ' + n); } else { fails.push(n + (d ? '\n      ' + d : '')); console.log('  FAIL ' + n + (d ? '\n      ' + d : '')); } };
const step = h => console.log('\n— ' + h + ' —');
const brief = r => `${r.status} ${JSON.stringify(r.data)?.slice(0, 200)}`;

function sess() {
  let cookie = '';
  return async (p, { method = 'GET', body } = {}) => {
    const r = await fetch(BASE + '/api/v1' + p, {
      method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
    return { status: r.status, data: d };
  };
}

(async () => {
  const su = sess(), emp = sess(), sra = sess(), hr = sess();
  const who = {};
  for (const [s, email, key] of [
    [su, 'mohit@squarkip.com', 'su'], [emp, 'ajay.sharma@squarkip.com', 'emp'],
    [sra, 'ketan.dagar@squarkip.com', 'sra'], [hr, 'hr@squarkip.com', 'hr'],
  ]) {
    const r = await s('/auth/login', { method: 'POST', body: { email, password: PW } });
    who[key] = r.data?.user?.id;
    if (!who[key]) { console.log(`cannot log in as ${email}: ${brief(r)}`); process.exit(2); }
  }
  const seenBy = async (viewer, userId) => ((await viewer('/presence/org')).data ?? []).find(p => p.userId === userId);
  await emp('/presence/clear', { method: 'POST' });

  step('everyone can see everyone');
  const roster = (await su('/users')).data;
  const people = (roster?.data ?? roster ?? []).filter(u => u.status === 'ACTIVE');
  for (const [name, s] of [['an Employee', emp], ['HR', hr], ['a Senior Research Associate', sra]]) {
    const r = await s('/presence/org');
    ok(`${name} reads the whole organisation's presence`, r.status === 200 && Array.isArray(r.data) && r.data.length === people.length,
      `${r.status}, ${r.data?.length} of ${people.length}`);
  }

  step('at the PC → green');
  await emp('/presence/heartbeat', { method: 'POST', body: { idle: false } });
  ok('an Employee who is using the PC is Available — to HR', (await seenBy(hr, who.emp))?.status === 'AVAILABLE');
  ok('…and to a colleague', (await seenBy(sra, who.emp))?.status === 'AVAILABLE');

  step('five minutes without using the PC → yellow');
  const before = Date.now();
  await emp('/presence/heartbeat', { method: 'POST', body: { idle: true } });
  const away = await seenBy(sra, who.emp);
  ok('reported idle → Away, for everyone', away?.status === 'AWAY' && (await seenBy(hr, who.emp))?.status === 'AWAY', JSON.stringify(away));
  const since = new Date(away?.inactiveSince ?? 0).getTime();
  ok('…inactive since the inactivity BEGAN, five minutes before it was reported',
    Math.abs(before - 5 * 60_000 - since) < 20_000, `inactiveSince ${away?.inactiveSince}`);
  await emp('/presence/heartbeat', { method: 'POST', body: { idle: true } });
  ok('a second idle heartbeat does not restart that clock', (await seenBy(sra, who.emp))?.inactiveSince === away?.inactiveSince);
  const mine = (await emp('/presence/me')).data;
  ok('the person sees it on themselves too', mine?.effective === 'AWAY' && mine?.idle === true, JSON.stringify(mine));

  step('back at the keyboard → green at once');
  await emp('/presence/heartbeat', { method: 'POST', body: { idle: false } });
  const back = await seenBy(sra, who.emp);
  ok('Available again, with no "inactive since"', back?.status === 'AVAILABLE' && !back?.inactiveSince, JSON.stringify(back));
  await emp('/presence/heartbeat', { method: 'POST', body: {} });
  ok('a browser on the previous build (no idle flag) still reads as at the PC', (await seenBy(sra, who.emp))?.status === 'AVAILABLE');

  step('statuses set by hand');
  await emp('/presence', { method: 'POST', body: { status: 'BUSY' } });
  ok('Busy while at the PC → Busy', (await seenBy(sra, who.emp))?.status === 'BUSY');
  await emp('/presence/heartbeat', { method: 'POST', body: { idle: true } });
  ok('Busy, then five minutes away from the PC → Away (not busy at the desk)', (await seenBy(sra, who.emp))?.status === 'AWAY');
  await emp('/presence/heartbeat', { method: 'POST', body: { idle: false } });
  await emp('/presence', { method: 'POST', body: { status: 'OFFLINE' } });
  const hidden = await seenBy(sra, who.emp);
  ok('"Appear offline" shows Offline, and never says when they were last around', hidden?.status === 'OFFLINE' && !hidden?.inactiveSince, JSON.stringify(hidden));
  await emp('/presence/clear', { method: 'POST' });

  step('in a meeting, from the calendar');
  const start = new Date(Date.now() - 5 * 60_000).toISOString();
  const end = new Date(Date.now() + 25 * 60_000).toISOString();
  const meU = (await su('/auth/me')).data; const ORG = (meU?.user ?? meU)?.organizationId;
  const m = await su('/calendar-events', { method: 'POST', body: {
    organizationId: ORG, title: 'Presence check', type: 'MEETING', startDate: start, endDate: end, allDay: false, attendeeIds: [who.sra, who.emp],
  } });
  ok('setup: a meeting happening now', m.status === 201 || m.status === 200, brief(m));
  await sra('/presence/heartbeat', { method: 'POST', body: { idle: false } });
  ok('an invited person is In a meeting', (await seenBy(emp, who.sra))?.status === 'IN_MEETING');
  await sra('/presence/heartbeat', { method: 'POST', body: { idle: true } });
  ok('…still In a meeting while away from the keyboard (in the meeting room)', (await seenBy(emp, who.sra))?.status === 'IN_MEETING');
  ok('the organiser is In a meeting too', (await seenBy(emp, who.su))?.status === 'IN_MEETING');
  await emp(`/calendar-events/${m.data.id}/respond`, { method: 'POST', body: { response: 'DECLINED' } });
  await emp('/presence/heartbeat', { method: 'POST', body: { idle: false } });
  ok('someone who DECLINED is not shown as in it', (await seenBy(sra, who.emp))?.status === 'AVAILABLE');
  await sra('/presence', { method: 'POST', body: { status: 'DND' } });
  await sra('/presence/heartbeat', { method: 'POST', body: { idle: false } });
  ok('Do not disturb set by hand outranks the calendar', (await seenBy(emp, who.sra))?.status === 'DND');
  await sra('/presence/clear', { method: 'POST' });
  await su(`/calendar-events/${m.data.id}`, { method: 'DELETE' });
  await sra('/presence/heartbeat', { method: 'POST', body: { idle: false } });
  ok('once the meeting is gone, back to Available', (await seenBy(emp, who.sra))?.status === 'AVAILABLE');

  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) { console.log('\nFailures:\n  ' + fails.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
