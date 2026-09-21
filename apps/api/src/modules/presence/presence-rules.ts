/**
 * How a person's presence dot is decided — pure, so it can be tested without a clock or a
 * database (tools/presence.spec.ts).
 *
 * Two different signals, kept apart on purpose:
 *
 *   CONNECTED — the browser is still sending heartbeats (one a minute, whether or not the tab is
 *   in front). Silence means the browser was closed, the PC slept, or the network dropped.
 *
 *   IDLE — the browser reported five minutes with no keyboard or mouse input. On Chrome and Edge,
 *   once the person allows it, that is input ANYWHERE on the PC (and a locked screen), so someone
 *   working in Word with the dashboard in the background stays green. Elsewhere it can only be
 *   input inside the dashboard.
 *
 * The heartbeat used to be the only signal, and it was sent only while the tab was visible — so a
 * person who left the dashboard open and walked away stayed green all day, and a person working in
 * another program turned yellow after three minutes.
 */

/** A heartbeat within this long → the browser is connected. Heartbeats arrive every minute. */
export const FRESH_MS = 3 * 60_000;
/** Silent for up to this long → Away (a closed lid, a dropped network). Longer → Offline. */
export const SILENT_AWAY_MS = 10 * 60_000;
/** No input for this long → idle. The browser applies it; the server records when it started. */
export const IDLE_MS = 5 * 60_000;

/** Statuses a person may set by hand. OFFLINE = "appear offline". */
export const MANUAL = new Set(['AVAILABLE', 'BUSY', 'DND', 'BRB', 'OFFLINE']);

export type PresenceFacts = {
  status: string | null;
  statusExpiresAt: Date | null;
  lastSeenAt: Date;
  idleSince: Date | null;
} | null;

/**
 * The presence everyone else sees, in order:
 *   1. "Appear offline" always wins — it is a privacy choice.
 *   2. A status the person set (Busy, Do not disturb…) while they are at their PC.
 *   3. In a meeting on the calendar right now.
 *   4. On approved leave today.
 *   5. At the PC → Available (green).
 *   6. Connected but idle for five minutes → Away (yellow).
 *   7. Browser silent for under ten minutes → Away; longer → Offline (grey).
 *
 * Idleness overrides a status set by hand: somebody who set "Busy" and then left their desk is not
 * busy at their desk. A meeting outranks idleness for the same reason the other way round — a
 * person in a meeting room is not at their keyboard, and "In a meeting" is the truer answer.
 */
export function resolvePresence(nowMs: number, p: PresenceFacts, ctx: { onLeave: boolean; inMeeting: boolean }): string {
  const age = p?.lastSeenAt ? nowMs - p.lastSeenAt.getTime() : Number.MAX_SAFE_INTEGER;
  const connected = age < FRESH_MS;
  const idle = connected && !!p?.idleSince;
  const manual = p?.status && MANUAL.has(p.status) && (!p.statusExpiresAt || p.statusExpiresAt.getTime() > nowMs)
    ? p.status : null;

  if (manual === 'OFFLINE') return 'OFFLINE';
  if (manual && connected && !idle) return manual;
  if (ctx.inMeeting) return 'IN_MEETING';
  if (ctx.onLeave) return 'ON_LEAVE';
  if (connected && !idle) return 'AVAILABLE';
  if (idle) return 'AWAY';
  if (age < SILENT_AWAY_MS) return 'AWAY';
  return 'OFFLINE';
}

/**
 * Since when an Away or Offline person has been so — the moment their activity stopped — for the
 * tooltip ("inactive since 3:42 pm", "last seen 11:05 am"). Null for everyone else, and for
 * "appear offline", which must not say when the person was really last around.
 */
export function inactiveSince(effective: string, p: PresenceFacts): Date | null {
  if (!p || p.status === 'OFFLINE') return null;
  if (effective === 'AWAY') return p.idleSince ?? p.lastSeenAt;
  if (effective === 'OFFLINE') return p.lastSeenAt;
  return null;
}
