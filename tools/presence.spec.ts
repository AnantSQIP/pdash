/**
 * What colour a person's presence dot is — the rules in presence-rules.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/presence.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * WHY: the dot used to mean "the dashboard tab is open and in front". Somebody who left it open
 * and walked away stayed green all day; somebody working in another program went yellow in three
 * minutes. It now means what the firm asked for: five minutes without touching the PC → yellow.
 */
import { resolvePresence, inactiveSince, FRESH_MS, SILENT_AWAY_MS } from '../apps/api/src/modules/presence/presence-rules';

let passed = 0; const failures: string[] = [];
const check = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) passed++;
  else failures.push(`${name}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`);
};
const NOW = new Date('2026-09-18T10:00:00Z').getTime();
const ago = (ms: number) => new Date(NOW - ms);
const MIN = 60_000;
const facts = (o: Partial<{ status: string | null; statusExpiresAt: Date | null; lastSeenAt: Date; idleSince: Date | null }> = {}) =>
  ({ status: null, statusExpiresAt: null, lastSeenAt: ago(30_000), idleSince: null, ...o });
const plain = { onLeave: false, inMeeting: false };

// ── the five-minute rule ─────────────────────────────────────────────────────
check('at the PC (heartbeat 30s ago, not idle) → green', resolvePresence(NOW, facts(), plain), 'AVAILABLE');
check('dashboard in the background but the PC in use → still green',
  resolvePresence(NOW, facts({ lastSeenAt: ago(50_000) }), plain), 'AVAILABLE');
check('five minutes without touching the PC → yellow', resolvePresence(NOW, facts({ idleSince: ago(5 * MIN) }), plain), 'AWAY');
check('back at the keyboard → green again', resolvePresence(NOW, facts({ idleSince: null }), plain), 'AVAILABLE');

// ── the browser going quiet ──────────────────────────────────────────────────
check('no heartbeat for 4 minutes (lid shut, network dropped) → yellow', resolvePresence(NOW, facts({ lastSeenAt: ago(4 * MIN) }), plain), 'AWAY');
check('no heartbeat for 11 minutes → offline (grey)', resolvePresence(NOW, facts({ lastSeenAt: ago(11 * MIN) }), plain), 'OFFLINE');
check('never seen at all → offline', resolvePresence(NOW, null, plain), 'OFFLINE');
check('an idle flag from a browser that has since gone silent does not keep them yellow forever',
  resolvePresence(NOW, facts({ lastSeenAt: ago(SILENT_AWAY_MS + MIN), idleSince: ago(20 * MIN) }), plain), 'OFFLINE');
check('the connected window is the heartbeat window', [FRESH_MS, SILENT_AWAY_MS], [3 * MIN, 10 * MIN]);

// ── statuses set by hand ─────────────────────────────────────────────────────
check('Busy while at the PC → Busy', resolvePresence(NOW, facts({ status: 'BUSY' }), plain), 'BUSY');
check('Busy, then left the desk for five minutes → yellow (not busy AT the desk)',
  resolvePresence(NOW, facts({ status: 'BUSY', idleSince: ago(6 * MIN) }), plain), 'AWAY');
check('"Appear offline" always wins, even at the PC', resolvePresence(NOW, facts({ status: 'OFFLINE' }), plain), 'OFFLINE');
check('an expired status falls back to the automatic one',
  resolvePresence(NOW, facts({ status: 'DND', statusExpiresAt: ago(MIN) }), plain), 'AVAILABLE');

// ── meetings and leave ───────────────────────────────────────────────────────
check('in a meeting on the calendar → In a meeting', resolvePresence(NOW, facts(), { onLeave: false, inMeeting: true }), 'IN_MEETING');
check('in a meeting and away from the keyboard → still In a meeting (the truer answer)',
  resolvePresence(NOW, facts({ idleSince: ago(20 * MIN) }), { onLeave: false, inMeeting: true }), 'IN_MEETING');
check('in a meeting with the laptop shut → In a meeting', resolvePresence(NOW, facts({ lastSeenAt: ago(40 * MIN) }), { onLeave: false, inMeeting: true }), 'IN_MEETING');
check('a status set by hand outranks the calendar (Do not disturb during a meeting)',
  resolvePresence(NOW, facts({ status: 'DND' }), { onLeave: false, inMeeting: true }), 'DND');
check('on approved leave → On leave', resolvePresence(NOW, facts({ lastSeenAt: ago(3 * 3_600_000) }), { onLeave: true, inMeeting: false }), 'ON_LEAVE');

// ── the "since" shown in the tooltip ─────────────────────────────────────────
check('an idle person is inactive since they went idle',
  inactiveSince('AWAY', facts({ idleSince: ago(7 * MIN) }))?.toISOString(), ago(7 * MIN).toISOString());
check('an offline person was last seen at their last heartbeat',
  inactiveSince('OFFLINE', facts({ lastSeenAt: ago(2 * 3_600_000) }))?.toISOString(), ago(2 * 3_600_000).toISOString());
check('"appear offline" never says when they were really last around',
  inactiveSince('OFFLINE', facts({ status: 'OFFLINE' })), null);
check('nothing for someone who is green', inactiveSince('AVAILABLE', facts()), null);

if (failures.length) {
  console.log(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.log('  ✗ ' + f + '\n');
  process.exit(1);
}
console.log(`\n✓ presence: ${passed} passed, 0 failed`);
