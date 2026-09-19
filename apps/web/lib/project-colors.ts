// The colour of a project, and of a task inside it, on the capacity board.
//
// Three variables, three visual channels, never sharing one:
//
//   hue        = WHICH PROJECT.  Seven hues, assigned by a project's rank (by PID) among the
//                projects on the board, so no two projects visible together share a hue until
//                there are more than seven. The PID is always printed beside the swatch — in the
//                legend, the hover card and the person panel — so hue never has to carry meaning
//                on its own.
//   lightness  = HOW URGENT THE TASK IS.  Critical darkest, low lightest. The four steps are
//                matched on RELATIVE LUMINANCE (0.035 / 0.08 / 0.16 / 0.40), not on HSL
//                lightness: an HSL L of 50% is far lighter to the eye in pink than in indigo,
//                and the ladder must read the same in every column.
//   a rail     = HOW CLOSE THE DEADLINE IS.  A 3px strip on the segment's bottom edge — solid
//                red for overdue, dotted amber for due within two working days — in the two
//                hues no project is ever given. Position and pattern, so it survives greyscale.
//   a texture  = WHICH PROJECT, AGAIN, for the fifth hue onwards. With green, teal, red and amber
//                all reserved, seven distinct hues cannot all survive red–green colour blindness:
//                simulated (Machado 2009) the blue-purple family collapses to a ΔE of 2. So the
//                hues are ASSIGNED in the order that keeps the first four furthest apart for
//                protan, deutan and normal vision alike (worst-case ΔE 121 → 51 → 20), and the
//                last three carry a faint hatch or dot texture as a second, colour-free channel
//                (Bertin's texture variable). The PID label inside wide segments, in the legend
//                and in every hover is the third.
//
// Palette rules inherited from lib/calendar-colors.ts and kept here:
//   · no green or teal (40°–195° is excluded outright): green means "done" everywhere else;
//   · red and amber are reserved for the deadline rail;
//   · white text is used only where it clears 4.5:1 — CRITICAL, HIGH and MEDIUM fills
//     (12.3:1, 8.1:1, 5.0:1); LOW fills take dark text (8.1:1). Verified for every hue.
//   · colour is never the only carrier: priority is also a word, deadline is also a date,
//     and a red/green-blind viewer sees the lightness ladder and the rail unchanged.
//
// The one green on the board is the FREE base of a working-day cell — the owner's "green box".
// It means "unallocated hours", it predates this file, and nothing here may be confused with it.

export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type HueTexture = 'none' | 'hatch' | 'dots' | 'cross';

export type ProjectHue = {
  name: string;
  h: number; s: number;
  /** Segment fills, luminance-matched per priority. */
  critical: string; high: string; medium: string; low: string;
  /** Chip surfaces in the app's tint + ring form. Text on a tint uses `critical`. */
  tint: string; ring: string;
  /** A colour-free second channel for the hues that collide under colour blindness. */
  texture: HueTexture;
};

/**
 * Seven hues, in ASSIGNMENT order — the order that keeps each prefix furthest apart under normal,
 * protan and deutan vision at once (greedy on the worst case of the three; see the header). The
 * first four are plain; the last three carry a texture, because from the fifth hue on no
 * arrangement of these families keeps a red–green-blind viewer's ΔE above 10.
 *
 * Bronze was tried and dropped: it sits in the amber band, so the due-soon rail vanished on it.
 * Slate is deliberately desaturated — separated from the blues by chroma rather than by angle,
 * which is also how a colour-blind viewer separates them.
 */
export const PROJECT_HUES: readonly ProjectHue[] = [
  { name: 'copper',  h: 19,  s: 0.82, critical: '#5c2309', high: '#8a350e', medium: '#bf4a13', low: '#e69772', tint: '#fdeee8', ring: '#f6bda2', texture: 'none' },
  { name: 'violet',  h: 268, s: 0.80, critical: '#480f88', high: '#6b17cb', medium: '#9143ea', low: '#c099ec', tint: '#f2e8fc', ring: '#c9a3f5', texture: 'none' },
  { name: 'pink',    h: 330, s: 0.72, critical: '#66113b', high: '#971958', medium: '#d02279', low: '#e490ba', tint: '#fbe9f2', ring: '#f1a7cc', texture: 'none' },
  { name: 'azure',   h: 203, s: 0.80, critical: '#093854', high: '#0e5480', medium: '#1475b1', low: '#65b2e2', tint: '#e8f5fc', ring: '#a3d6f5', texture: 'none' },
  { name: 'slate',   h: 215, s: 0.26, critical: '#293546', high: '#3f516b', medium: '#577195', low: '#9cabc0', tint: '#eff2f6', ring: '#bfcad9', texture: 'hatch' },
  { name: 'fuchsia', h: 293, s: 0.68, critical: '#591363', high: '#861c94', medium: '#b827cc', low: '#d890e1', tint: '#f9eafb', ring: '#e7a9ef', texture: 'dots' },
  { name: 'indigo',  h: 244, s: 0.72, critical: '#221a9d', high: '#392ddd', medium: '#655ce4', low: '#a7a2e9', tint: '#eae9fb', ring: '#aca7f1', texture: 'cross' },
];

/**
 * The texture as a CSS background: a faint white pattern laid over the fill. Faint on purpose —
 * it is a tie-breaker for the eye that cannot use the hue, not decoration for the one that can.
 * Textures scale with nothing, so a 6px sliver shows a hint of one and a 60px bar shows it plainly.
 */
export function textureStyle(texture: HueTexture): { backgroundImage?: string; backgroundSize?: string } {
  switch (texture) {
    case 'hatch': return { backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0 1px, transparent 1px 4px)' };
    case 'dots':  return { backgroundImage: 'radial-gradient(rgba(255,255,255,0.45) 0.7px, transparent 0.8px)', backgroundSize: '4px 4px' };
    case 'cross': return { backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.22) 0 1px, transparent 1px 5px)' };
    default:      return {};
  }
}

/** Work that belongs to no project (a team space, or nothing at all): neutral, never a hue. */
export const NO_PROJECT_HUE: ProjectHue = {
  name: 'none', h: 0, s: 0, critical: '#374151', high: '#4b5563', medium: '#6b7280', low: '#b0b6bf', tint: '#f3f4f6', ring: '#d1d5db', texture: 'none',
};

/** The deadline rail. Red and amber are excluded from PROJECT_HUES so these are unambiguous. */
export const RAIL = {
  overdue: '#dc2626',   // red-600, solid
  dueSoon: '#d97706',   // amber-600, dotted
} as const;

/**
 * Over-commitment on a day: a black line UNDER the cell — not red, and not on the box itself.
 * Red on the board means exactly one thing, "this task is late" (the rail); and the green box
 * with its segments stays exactly as drawn, the line beneath it saying "more than a day's work".
 */
export const OVER_COMMITTED = '#111827';

/** The 1px inset ring every segment carries, so a LOW fill keeps a ≥3:1 edge on the free base. */
export const SEGMENT_RING = 'inset 0 0 0 1px rgba(0,0,0,0.18)';

/** The free base — the one sanctioned green (see the header comment). */
export const FREE_BASE = { bg: '#d1fae5', border: '#a7f3d0' } as const;

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

/** Text colour that clears 4.5:1 on a segment fill: white on the three darker steps, near-black on LOW. */
export function textOnFill(priority: string | null | undefined): string {
  return (priority ?? 'MEDIUM').toUpperCase() === 'LOW' ? '#111827' : '#ffffff';
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
  // Dotted: amber on white, so it stays visible on a LOW fill as well as a CRITICAL one.
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
