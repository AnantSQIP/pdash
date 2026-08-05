// The single source of truth for calendar event colours.
//
// Two rules drive this palette:
//
//  1. **Every type must be tellable apart at a glance.** The previous palette had MEETING and
//     LEAVE on the exact same hex (#fe841f), HOLIDAY and REMINDER on near-identical reds, and
//     EVENT / MILESTONE / COMPOFF / WFH all clustered in blue-violet. Hues here are spread
//     around the wheel, and where two sit close (cyan vs blue) they differ in lightness and
//     always carry their own icon + label.
//
//  2. **Green is reserved.** Across the dashboard green means "done / on time" — progress bars,
//     completed tasks, a fully-logged timesheet day. A task DUE is not a task DONE, so TASK_DUE
//     is amber-orange (a deadline needing attention), never green.
//
// Nothing else in the app should hardcode an event colour: import from here.

export type CalendarEventType =
  | 'EVENT' | 'MEETING' | 'TASK_DUE' | 'MILESTONE' | 'REMINDER'
  | 'HOLIDAY' | 'LEAVE' | 'COMPOFF' | 'WFH';

// These nine were chosen by search, not by eye, against three hard constraints:
//   · every pair is at least ΔE 34 apart in CIELAB (the closest is EVENT/COMPOFF at 34.2) —
//     the old palette had a pair at ΔE 0.0, i.e. literally the same colour;
//   · white text on each clears WCAG AA 4.5:1, because these render as filled chips;
//   · none of them is green.
// If you change one, re-check all three — a "nicer" shade that lands next to its neighbour
// puts us straight back to the calendar nobody could read.
export const EVENT_COLORS: Record<CalendarEventType, string> = {
  EVENT:     '#2563eb', // blue      — a generic scheduled item
  MEETING:   '#7c3aed', // violet    — people getting together
  TASK_DUE:  '#a16207', // dark amber— a deadline. NOT green: green means completed.
  MILESTONE: '#86198f', // magenta   — a marker on the plan
  REMINDER:  '#44403c', // warm grey — a low-key nudge
  HOLIDAY:   '#dc2626', // red       — org-wide non-working day
  LEAVE:     '#db2777', // pink      — this person is away
  COMPOFF:   '#1e3a8a', // navy      — comp-off earned or used
  WFH:       '#0e7490', // cyan      — working, from home
};

export const EVENT_LABELS: Record<CalendarEventType, string> = {
  EVENT: 'Event', MEETING: 'Meeting', TASK_DUE: 'Task due', MILESTONE: 'Milestone',
  REMINDER: 'Reminder', HOLIDAY: 'Holiday', LEAVE: 'Leave', COMPOFF: 'Comp-off', WFH: 'WFH',
};

/** The order types appear in legends — grouped: schedule, delivery, then availability. */
export const EVENT_LEGEND_ORDER: CalendarEventType[] = [
  'EVENT', 'MEETING', 'REMINDER', 'TASK_DUE', 'MILESTONE', 'HOLIDAY', 'LEAVE', 'WFH', 'COMPOFF',
];

const TYPES = new Set<string>(Object.keys(EVENT_COLORS));
export function asEventType(t: string | undefined | null): CalendarEventType {
  return TYPES.has(t ?? '') ? (t as CalendarEventType) : 'EVENT';
}

/**
 * The colour to paint an event.
 *
 * A stored `color` is deliberately IGNORED. No screen ever let anyone pick one — it was only
 * ever a snapshot of the type colour taken when the row was written, so honouring it would pin
 * every existing event to the old indistinguishable palette forever. Deriving from the type
 * instead means old rows heal themselves and a palette change is a one-line edit.
 */
export function eventColor(ev: { type?: string | null }): string {
  return EVENT_COLORS[asEventType(ev.type)];
}

/** A translucent wash of the type colour, for chip/tile backgrounds. */
export function eventTint(ev: { type?: string | null }, alpha = '1a'): string {
  return `${eventColor(ev)}${alpha}`;
}

/**
 * Whether a status/phase counts as "completed" — the ONE place green is allowed.
 * Kept here so the reservation is visible next to the palette it constrains.
 */
export const COMPLETED_GREEN = '#16a34a';
