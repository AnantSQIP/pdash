// The colour of a project, and of a task inside it, on the capacity board.
//
// LIGHT, SEP 2026. The owner: "the current colours are too dark, I want light colours". The board
// used to fill each task with a deep shade and white text; it now uses pastel fills with dark ink,
// a saturated EDGE per client, and softer signals. Chosen with the dataviz method and its validator
// (skill dataviz, scripts/validate_palette.js — OKLab ΔE ×100, Machado 2009 CVD simulation), not
// by eye. The numbers below are what that run reported.
//
// Four variables, four channels, never sharing one:
//
//   hue        = WHICH CLIENT.  Seven families, assigned by a client's rank (by PID) among the
//                clients on the board, so no two clients visible together share a hue until there
//                are more than seven. Every family has a pastel FILL ladder and one saturated EDGE
//                (OKLCH L 0.58, C 0.15) drawn as the segment's 1px ring. The edge carries identity
//                where the pastels cannot: light fills compress hue differences, and under red–green
//                colour blindness no two pastels of this set stay ≥ 8 apart past the second. The
//                first three EDGES pass the validator all-pairs (CVD ΔE 10.7, normal-vision 15.8,
//                ≥ 4:1 on the free base); the fourth onwards cannot, for any order of any set that
//                avoids green, teal, red and amber — so from the fourth on each family also carries
//                a TEXTURE (Bertin's second channel), and the PID label, the legend and every hover
//                name the client in words.
//   lightness  = HOW URGENT THE TASK IS.  Critical deepest, low lightest, as an ordinal ramp:
//                OKLCH L 0.725 / 0.79 / 0.855 / 0.92, one hue per family, validator ordinal check
//                "monotone, every step ≥ 0.06". The light end is pale BY REQUEST, below the 2:1 the
//                method asks of a lightest step — the edge ring (≥ 3.99:1) is what keeps a LOW
//                segment visible on the free base. Priority is also a word in every hover.
//   a rail     = HOW CLOSE THE DEADLINE IS.  A 3px strip on the segment's bottom edge — solid soft
//                red for overdue, dotted amber for due within two working days — in the two hues no
//                client is ever given. Position and pattern, so it survives greyscale.
//   a line     = MORE THAN A DAY'S WORK.  A rose line UNDER the day's box (not a near-black one any
//                more). Under, not on: the box and the work in it stay exactly as drawn.
//
// Text on a fill is the family's own dark INK (OKLCH L 0.32), never white: ≥ 5.1:1 on the deepest
// fill of every family, ≥ 9:1 on the palest. Verified for every hue.
//
// Palette rules inherited from lib/calendar-colors.ts and kept here:
//   · no green or teal (40°–195° is excluded outright): green means "free" on this board;
//   · red and amber are reserved for the deadline rail, rose for the over-committed line;
//   · colour is never the only carrier: priority is also a word, deadline is also a date,
//     over-committed is also "over by Nh", and a client is also its PID.
//
// The one green on the board is the FREE base of a working-day cell — the owner's "green box",
// now a paler one. It means "unallocated hours", and nothing here may be confused with it.

export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type HueTexture = 'none' | 'hatch' | 'dots' | 'cross' | 'backhatch';

export type ProjectHue = {
  name: string;
  /** OKLCH hue angle of the family. */
  h: number;
  /** Segment fills, pastel, luminance-stepped per priority (OKLCH L .725 / .79 / .855 / .92). */
  critical: string; high: string; medium: string; low: string;
  /** The family's saturated edge: every segment's 1px ring, and its swatch border. Carries identity. */
  edge: string;
  /** Dark text for anything written ON a fill or a tint of this family. */
  ink: string;
  /** Chip surfaces in the app's tint + ring form. Text on a tint uses `ink`. */
  tint: string; ring: string;
  /** A colour-free second channel from the fourth hue on (see the header). */
  texture: HueTexture;
};

/**
 * Seven families, in ASSIGNMENT order. The first three were chosen, and their angles tuned
 * (copper 52°, azure 242°, pink 348° in OKLCH), to maximise the worst all-pairs separation of the
 * edges under normal, protan and deutan vision at once; the last four are textured because no
 * fourth colour can clear the floor against all three (see the header). Slate is deliberately
 * desaturated — separated from the blues by chroma, which is also how a colour-blind viewer
 * separates them — and therefore sits below the chroma floor by design; it is textured.
 */
export const PROJECT_HUES: readonly ProjectHue[] = [
  { name: 'copper',  h: 52,  critical: '#e68d54', high: '#f0a77b', medium: '#fac19f', low: '#ffddc9', edge: '#bc5b03', ink: '#532300', tint: '#fff2ec', ring: '#f5cab1', texture: 'none' },
  { name: 'azure',   h: 242, critical: '#51aff0', high: '#7bc3f8', medium: '#a2d6ff', low: '#cde9ff', edge: '#0082c4', ink: '#003656', tint: '#edf7fe', ring: '#b2daf9', texture: 'none' },
  { name: 'pink',    h: 348, critical: '#e183b4', high: '#ed9fc6', medium: '#f8bbd9', low: '#fed8ea', edge: '#b84f8a', ink: '#521c3b', tint: '#fef1f7', ring: '#f3c5db', texture: 'none' },
  { name: 'violet',  h: 300, critical: '#b392eb', high: '#c5abf4', medium: '#d7c4fd', low: '#e9dffe', edge: '#8962c5', ink: '#3a2659', tint: '#f6f3ff', ring: '#daccf7', texture: 'hatch' },
  { name: 'slate',   h: 257, critical: '#91a8c9', high: '#a9bcd7', medium: '#c2d1e6', low: '#dce5f3', edge: '#627ca0', ink: '#263446', tint: '#f2f5fa', ring: '#cad5e5', texture: 'dots' },
  { name: 'fuchsia', h: 322, critical: '#cc89d6', high: '#dba4e3', medium: '#e9bfef', low: '#f5daf9', edge: '#a258ae', ink: '#47204e', tint: '#faf2fc', ring: '#e8c8ec', texture: 'cross' },
  { name: 'indigo',  h: 278, critical: '#939df6', high: '#aab4fe', medium: '#c4ccff', low: '#dee3fe', edge: '#676ed1', ink: '#292c5f', tint: '#f3f4ff', ring: '#cad1fc', texture: 'backhatch' },
];

/**
 * The texture as a CSS background: a dark, translucent pattern laid over the pastel fill. Faint on
 * purpose — it is a tie-breaker for the eye that cannot use the hue, not decoration for the one
 * that can — and dark because a white pattern vanishes on a light fill. Textures scale with
 * nothing, so a 6px sliver shows a hint of one and a 60px bar shows it plainly.
 */
const STROKE = 'rgba(15,23,42,0.20)';
export function textureStyle(texture: HueTexture): { backgroundImage?: string; backgroundSize?: string } {
  switch (texture) {
    case 'hatch':     return { backgroundImage: `repeating-linear-gradient(45deg, ${STROKE} 0 1px, transparent 1px 4px)` };
    case 'backhatch': return { backgroundImage: `repeating-linear-gradient(135deg, ${STROKE} 0 1px, transparent 1px 4px)` };
    case 'dots':      return { backgroundImage: 'radial-gradient(rgba(15,23,42,0.32) 0.7px, transparent 0.8px)', backgroundSize: '4px 4px' };
    case 'cross':     return { backgroundImage: 'repeating-linear-gradient(45deg, rgba(15,23,42,0.15) 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, rgba(15,23,42,0.15) 0 1px, transparent 1px 5px)' };
    default:          return {};
  }
}

/** Work that belongs to no client (a team space, or nothing at all): a cool neutral, never a hue. */
export const NO_PROJECT_HUE: ProjectHue = {
  name: 'none', h: 260, critical: '#a2a6ae', high: '#b6bbc2', medium: '#cbd0d7', low: '#e0e5ed', edge: '#767b82', ink: '#2f3339', tint: '#f3f4f6', ring: '#d0d4dc', texture: 'none',
};

/** The same four depths with no hue, for the legend's "priority" key. */
export const PRIORITY_RAMP = [NO_PROJECT_HUE.critical, NO_PROJECT_HUE.high, NO_PROJECT_HUE.medium, NO_PROJECT_HUE.low] as const;

/**
 * The deadline rail. Red and amber are excluded from PROJECT_HUES so these are unambiguous.
 * Softer than the red-600 / amber-600 they replace, and still clear on a pastel fill: the soft red
 * is 3.9:1 on white; the amber is dotted against white, so its pattern — not its contrast — is what
 * reads, and the date is always written beside it in the hover and the panel.
 */
export const RAIL = {
  overdue: '#e5484d',   // soft red, solid
  dueSoon: '#f59e0b',   // amber-500, dotted
} as const;

/**
 * Over-commitment on a day: a rose line UNDER the cell (it was near-black). Not on the box itself —
 * the green box with its segments stays exactly as drawn, the line beneath it saying "more than a
 * day's work" — and lighter and pinker than the overdue rail's red, which sits INSIDE a segment.
 * The same rose is the "over" band of every total bar.
 */
export const OVER_COMMITTED = '#fb7185'; // rose-400

/** The 1px inset ring of a segment in its family's edge — a LOW fill keeps a ≥ 3.99:1 edge on the free base. */
export function segmentRing(hue: ProjectHue): string {
  return `inset 0 0 0 1px ${hue.edge}`;
}

/** The free base — the one sanctioned green (see the header comment), emerald-50 on emerald-200. */
export const FREE_BASE = { bg: '#ecfdf5', border: '#a7f3d0' } as const;

/**
 * Give every project on a board its hue.
 *
 * Rank by PID (then by id for anything without one) and take rank mod 7. Deterministic for a
 * given set of projects, collision-free up to seven, and it reshuffles ONLY when the set of
 * projects on the board changes — never on hover, sort, filter or search, because callers pass
 * the whole payload's project set, not what is currently on screen.
 *
 * Why rank rather than a hash or the PID's serial: a hash collides at random, and serial mod 7
 * collides as soon as two visible projects are seven apart (003 and 010) — which, with a dozen
 * open matters, is most windows. Rank keeps the seven projects you are looking at distinct.
 */
export function assignProjectHues(
  projects: Iterable<{ id: string; pid?: string | null }>,
): Map<string, ProjectHue> {
  const seen = new Map<string, { id: string; pid: string | null }>();
  for (const p of projects) if (!seen.has(p.id)) seen.set(p.id, { id: p.id, pid: p.pid ?? null });
  const ranked = [...seen.values()].sort((a, b) => {
    if (a.pid && b.pid) return a.pid.localeCompare(b.pid) || a.id.localeCompare(b.id);
    if (a.pid) return -1;
    if (b.pid) return 1;
    return a.id.localeCompare(b.id);
  });
  const out = new Map<string, ProjectHue>();
  ranked.forEach((p, i) => out.set(p.id, PROJECT_HUES[i % PROJECT_HUES.length]));
  return out;
}

/** The fill for one task: its project's hue at its priority's depth. Unknown priority reads as MEDIUM. */
export function segmentFill(hue: ProjectHue, priority: string | null | undefined): string {
  switch ((priority ?? 'MEDIUM').toUpperCase()) {
    case 'CRITICAL': return hue.critical;
    case 'HIGH':     return hue.high;
    case 'LOW':      return hue.low;
    default:         return hue.medium;
  }
}

/** Text on a segment fill: the family's dark ink, which clears 5.1:1 on every one of its fills. */
export function textOnFill(hue: ProjectHue): string {
  return hue.ink;
}

export type DeadlineState = 'overdue' | 'today' | 'soon' | 'later' | 'none';

/**
 * How close a task's deadline is, in the org's working days.
 *
 * `today` and `due` are `YYYY-MM-DD`. Weekends are skipped; `holidays` is the set of company
 * holiday day-keys the board already knows about (from the rows' HOLIDAY cells), so "two working
 * days" means the same thing here as it does to the capacity API. Bounded, so a malformed date
 * cannot spin.
 */
export function deadlineState(
  due: string | null | undefined,
  today: string,
  holidays: ReadonlySet<string> = new Set(),
  soonWithinWorkingDays = 2,
): DeadlineState {
  if (!due) return 'none';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  let count = 0;
  const d = new Date(`${today}T00:00:00Z`);
  for (let i = 0; i < 31; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const k = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(k)) count++;
    if (k === due) return count <= soonWithinWorkingDays ? 'soon' : 'later';
    if (k > due) return 'later';
  }
  return 'later';
}

/** Days overdue, for the words beside the colour ("Overdue 3d"). */
export function daysOverdue(due: string, today: string): number {
  const a = new Date(`${due}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** The rail's CSS background for a deadline state, or null when there is no rail. */
export function railStyle(state: DeadlineState): string | null {
  if (state === 'overdue' || state === 'today') return RAIL.overdue;
  // Dotted: amber on white, so the pattern reads on a LOW fill as well as a CRITICAL one.
  if (state === 'soon') return `repeating-linear-gradient(90deg, ${RAIL.dueSoon} 0 3px, #ffffff 3px 5px)`;
  return null;
}

/** Order segments inside a day, and rows inside a project: most urgent first, then stable keys. */
export const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
export function urgencyOrder(
  a: { overdue?: boolean; priority?: string; dueDate?: string | null; projectPid?: string | null; id: string },
  b: { overdue?: boolean; priority?: string; dueDate?: string | null; projectPid?: string | null; id: string },
): number {
  if (!!a.overdue !== !!b.overdue) return a.overdue ? -1 : 1;
  const pa = PRIORITY_RANK[(a.priority ?? 'MEDIUM').toUpperCase()] ?? 2;
  const pb = PRIORITY_RANK[(b.priority ?? 'MEDIUM').toUpperCase()] ?? 2;
  if (pa !== pb) return pa - pb;
  const da = a.dueDate ?? '9999', db = b.dueDate ?? '9999';
  if (da !== db) return da < db ? -1 : 1;
  const ka = a.projectPid ?? '', kb = b.projectPid ?? '';
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
