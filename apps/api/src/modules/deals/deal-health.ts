import { DealStage, OPEN_STAGES } from '../../common/deal-stages';

/**
 * What a pipeline is supposed to tell you, which a board of typed-in cards does not.
 *
 * THE PROBLEM THIS SOLVES
 *
 * A deal that has sat at Proposal untouched for four months looks exactly as healthy on a kanban
 * board as one that moved yesterday. Both are cards in the same column, the same colour, the same
 * size. The pipeline records what somebody typed and never says anything back.
 *
 * A pipeline's real failure mode is not losing deals — losing is half the job. It is FORGETTING
 * them: nobody decides to drop a prospect, they simply stop being looked at. Everything below is
 * one of four ways of noticing that, computed rather than typed.
 *
 * All of it is derived from data already recorded — stage-change activities, an expected close
 * date, a next action — so a deal nobody has curated still gets an honest assessment.
 *
 * DELIBERATELY NOT A SCORE. It would be easy to reduce this to "deal health: 72%", and it would be
 * worse: a number invites comparison it cannot support and hides which of four different problems
 * a deal actually has. Each flag names one thing, and the reasons are the useful part.
 */

/** How long a deal may go untouched before it is considered to be drifting. */
export const STALE_AFTER_DAYS = 14;
/** Past this, nobody is working it — it is being carried. */
export const VERY_STALE_AFTER_DAYS = 30;

export type DealFlagKind =
  | 'STALE'              // no activity for a while
  | 'NEXT_ACTION_DUE'    // the next step is due or overdue
  | 'NO_NEXT_ACTION'     // nobody has said what happens next
  | 'CLOSE_DATE_PASSED'  // past its own expected close, still open
  | 'STUCK_IN_STAGE'     // in one stage far longer than the others take
  | 'AWAITING_CLIENT';   // won, but the client record was never created

export interface DealFlag {
  kind: DealFlagKind;
  /** 'warn' is worth a glance; 'urgent' is worth doing something about today. */
  severity: 'warn' | 'urgent';
  /** Written for the person reading the board, not for a log file. */
  message: string;
}

export interface DealHealthInput {
  stage: string;
  createdAt: Date;
  expectedCloseDate?: Date | null;
  nextActionAt?: Date | null;
  clientId?: string | null;
  /** Every activity on the deal, newest first or oldest first — order does not matter. */
  activities: { occurredAt: Date; toStage?: string | null }[];
}

const DAY = 86_400_000;
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DAY);

/** Plain English for a day count, because "1 days ago" reads as a bug. */
function ago(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** When this deal was last touched at all — an activity, or failing that its creation. */
export function lastTouchedAt(input: DealHealthInput): Date {
  const latest = input.activities.reduce<Date | null>(
    (acc, a) => (!acc || a.occurredAt > acc ? a.occurredAt : acc), null,
  );
  return latest ?? input.createdAt;
}

/**
 * How long the deal has been sitting in its CURRENT stage.
 *
 * Read from the stage-change activities that were already being logged, so this needs no new
 * field and works on every deal in the system today — including ones closed months ago.
 */
export function daysInCurrentStage(input: DealHealthInput, now = new Date()): number {
  const lastMove = input.activities
    .filter(a => a.toStage === input.stage)
    .reduce<Date | null>((acc, a) => (!acc || a.occurredAt > acc ? a.occurredAt : acc), null);
  return daysBetween(now, lastMove ?? input.createdAt);
}

/**
 * Everything wrong with one deal, most pressing first.
 *
 * Closed deals get one flag at most: a won deal still waiting for its client record. Nothing else
 * applies — chasing a lost deal for inactivity would be noise, and that noise is what makes people
 * stop reading warnings.
 */
export function assessDeal(input: DealHealthInput, now = new Date()): DealFlag[] {
  const flags: DealFlag[] = [];
  const isOpen = OPEN_STAGES.includes(input.stage as DealStage);

  if (!isOpen) {
    // Won, but nobody created the client record. The deal is finished and the handover is not:
    // minting a client needs the confidential-client permission, so BD cannot do it themselves
    // and the request is easily forgotten by whoever can.
    if (input.stage === 'WON' && !input.clientId) {
      flags.push({
        kind: 'AWAITING_CLIENT',
        severity: 'warn',
        message: 'Won, but no client record yet — delivery cannot pick this up until somebody creates one.',
      });
    }
    return flags;
  }

  // ── The next step ────────────────────────────────────────────────────────────
  if (input.nextActionAt) {
    const overdueBy = daysBetween(now, input.nextActionAt);
    if (overdueBy > 0) {
      flags.push({
        kind: 'NEXT_ACTION_DUE',
        severity: overdueBy >= 7 ? 'urgent' : 'warn',
        message: `Next step was due ${ago(overdueBy)}.`,
      });
    } else if (overdueBy === 0) {
      flags.push({ kind: 'NEXT_ACTION_DUE', severity: 'warn', message: 'Next step is due today.' });
    }
  } else {
    flags.push({
      kind: 'NO_NEXT_ACTION',
      severity: 'warn',
      message: 'No next step set — this is how a deal gets forgotten rather than lost.',
    });
  }

  // ── Silence ──────────────────────────────────────────────────────────────────
  const quietFor = daysBetween(now, lastTouchedAt(input));
  if (quietFor >= VERY_STALE_AFTER_DAYS) {
    flags.push({
      kind: 'STALE',
      severity: 'urgent',
      message: `Nothing has happened since ${ago(quietFor)}. Worth closing as lost if it is gone.`,
    });
  } else if (quietFor >= STALE_AFTER_DAYS) {
    flags.push({ kind: 'STALE', severity: 'warn', message: `No activity since ${ago(quietFor)}.` });
  }

  // ── Its own deadline ─────────────────────────────────────────────────────────
  if (input.expectedCloseDate) {
    const past = daysBetween(now, input.expectedCloseDate);
    if (past > 0) {
      flags.push({
        kind: 'CLOSE_DATE_PASSED',
        severity: past >= 30 ? 'urgent' : 'warn',
        message: `Expected to close ${ago(past)} and still open — the date or the deal needs revisiting.`,
      });
    }
  }

  return flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'urgent' ? -1 : 1));
}

/**
 * How long deals typically sit in each stage, and how many are sitting there now.
 *
 * This is the question "where do our deals die?", which no individual card can answer. A firm that
 * loses everything at Proposal has a pricing problem; one that loses at Contacted has a
 * qualification problem. Same board, entirely different fix.
 *
 * The median is used rather than the mean on purpose: one deal that took two years would drag an
 * average into telling you nothing about a typical deal.
 */
export function stageDurations(
  deals: { stage: string; createdAt: Date; activities: { occurredAt: Date; toStage?: string | null }[] }[],
  now = new Date(),
): { stage: string; medianDays: number | null; openNow: number; longestOpenDays: number | null }[] {
  const perStage = new Map<string, number[]>();
  const openNow = new Map<string, number>();
  const longest = new Map<string, number>();

  for (const d of deals) {
    // Completed spells: every transition INTO a stage, ended by the next transition out of it.
    const moves = [...d.activities]
      .filter(a => a.toStage)
      .sort((x, y) => x.occurredAt.getTime() - y.occurredAt.getTime());
    let enteredAt = d.createdAt;
    let current = 'NEW';
    for (const m of moves) {
      const days = daysBetween(m.occurredAt, enteredAt);
      if (days >= 0) perStage.set(current, [...(perStage.get(current) ?? []), days]);
      current = m.toStage as string;
      enteredAt = m.occurredAt;
    }
    // The spell still running does not count toward the median — it is not finished, and
    // including it would report every stage as shorter than it really is.
    if (OPEN_STAGES.includes(d.stage as DealStage)) {
      openNow.set(d.stage, (openNow.get(d.stage) ?? 0) + 1);
      const running = daysBetween(now, enteredAt);
      longest.set(d.stage, Math.max(longest.get(d.stage) ?? 0, running));
    }
  }

  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  };

  return OPEN_STAGES.map(stage => ({
    stage,
    medianDays: median(perStage.get(stage) ?? []),
    openNow: openNow.get(stage) ?? 0,
    longestOpenDays: longest.get(stage) ?? null,
  }));
}
