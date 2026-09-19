/**
 * Correcting a project's PID — the arithmetic, with no database in it.
 *
 * A PID (SQ_26_27_001) is the number the firm files a matter under: it goes on invoices, on
 * reports, and into what a client says on the phone. It is set once, when the project is created,
 * by a person reading a brief — so it is sometimes set wrong, and the three ways it is wrong are
 * the three ways this file knows how to fix:
 *
 *   REASSIGN — the number itself is wrong. The project moves to a different PID.
 *   SPLIT    — two pieces of work were filed under one number and are actually separate matters.
 *              One of them leaves and takes a number of its own.
 *   MERGE    — two numbers were issued for what is one matter. One project moves under the other's
 *              PID and becomes the next round of it.
 *
 * They are one mechanic — a project's `code` changes and its `roundSeq` is re-dealt — so they are
 * planned by one function. What differs is only which destination was chosen, and that is derived
 * here rather than trusted from the caller.
 *
 * THE INVARIANTS THIS FILE EXISTS TO HOLD
 *
 *  1. A SERIAL IS NEVER REISSUED. Nothing here ever frees a number. `nextSerial` only ever looks
 *     one past the highest number ever taken, and a plan that empties a PID reports
 *     `vacatesSource` — "retire it" — and never "release it". The day somebody writes code that
 *     deletes a reservation to make its number available again, two different matters end up
 *     quoting the same PID on two different invoices, and no record in the system says which is
 *     which. Retiring a number costs one integer; reissuing one costs the firm's paper trail.
 *
 *  2. ROUND NUMBERS STAY A SEQUENCE. Rounds are labelled "project 2 of 3", and that label is only
 *     true while the live rounds under one PID are numbered 1..N with no gaps and no duplicates.
 *     A project leaving the middle of a group leaves a hole, so the rounds behind it close ranks.
 *     A project arriving takes N+1 — computed AFTER the destination has been made contiguous, so
 *     merging into a group that legacy data left with a hole heals it instead of inheriting it.
 *
 *  3. NOTHING BUT THE NUMBER MOVES. A plan only ever names `code` and `roundSeq`. Tasks,
 *     timesheets, members, files and patents hang off the project id, and the project id does not
 *     change — which is exactly why this correction is safe to offer at all.
 *
 * Kept free of Nest and Prisma so every case above can be tested without a database:
 * see tools/pid-move.spec.ts.
 */

/** Which of the owner's three corrections a move turned out to be. */
export type MoveMode = 'REASSIGN' | 'SPLIT' | 'MERGE';

/**
 * Why a move was refused. A code rather than a sentence, so callers (and tests) can be exact
 * about which rule fired without matching on prose that will be reworded.
 */
export type MoveRefusal =
  | 'DELETED'        // the project being moved is in the bin
  | 'NO_PID'         // it has no PID to move away from — that is "attach", not "move"
  | 'SELF'           // asked to merge a project into itself
  | 'SAME_PID'       // the destination is the PID it already has: a no-op dressed as a change
  | 'NOT_SHARED'     // asked to split a project that is already alone under its PID
  | 'MODE_MISMATCH'  // the destination turned out to be a different operation from the one asked for
  | 'CROSS_FY';      // the destination PID belongs to another financial year

/** A project as this file needs to see it. Deliberately tiny — a move reads almost nothing. */
export interface MoveProject {
  id: string;
  /** The PID it currently carries; null when it has never been given one. */
  code: string | null;
  roundSeq: number;
  /** ACTIVE | ON_HOLD | COMPLETED | CLOSED | ARCHIVED | CANCELLED. */
  phase: string;
  /** Soft-deleted projects can neither be moved nor counted as a member of a group. */
  deleted?: boolean;
  title?: string;
}

/** One round's number changing. Only emitted where the number actually differs. */
export interface RoundChange {
  id: string;
  from: number;
  to: number;
  title?: string;
}

export interface MoveInput {
  /** The project being moved. */
  project: MoveProject;
  /** Every project sharing `project.code`, the project itself included. Any order. */
  sourceGroup: MoveProject[];
  /** The PID to move onto; null means "mint a fresh serial". */
  targetPid: string | null;
  /** Every project already under `targetPid`. Empty for a free serial or a fresh mint. */
  targetGroup: MoveProject[];
  /** Set when the destination was named as a PROJECT rather than a PID — used to catch a self-merge. */
  targetProjectId?: string;
  /** The operation the caller believes they are performing. Checked, not trusted. */
  declaredMode?: MoveMode;
}

export interface MovePlan {
  mode: MoveMode;
  /** The PID being left. */
  fromPid: string;
  /** The PID being taken, or null when it is still to be minted. */
  toPid: string | null;
  /** The round number the moved project takes under its new PID. */
  newRoundSeq: number;
  /** The moved project's number before the move, so the audit record can say what changed. */
  oldRoundSeq: number;
  /** Renumbering of the rounds LEFT BEHIND, only where a number changes. */
  sourceRenumber: RoundChange[];
  /** Renumbering of the destination's existing rounds, only where a number changes. */
  targetRenumber: RoundChange[];
  /** Live rounds still under the old PID after the move. */
  sourceRemaining: number;
  /** Live rounds under the destination after the move, the arrival included. */
  targetTotal: number;
  /**
   * True when the old PID is left holding nothing. Its reservation must be RETIRED (marked
   * discontinued and kept in the ledger forever) — never deleted, and never made available.
   */
  vacatesSource: boolean;
  /** Every OTHER project this move renumbers — what the modal has to warn about before it runs. */
  affected: string[];
}

export type MoveDecision =
  | { ok: true; plan: MovePlan }
  | { ok: false; reason: MoveRefusal; message: string };

/** Phases that mean the work is over. A PID holding only these is a finished matter, not a live one. */
export const TERMINAL_PHASES = ['COMPLETED', 'CLOSED', 'ARCHIVED', 'CANCELLED'];

export const isTerminal = (phase: string): boolean => TERMINAL_PHASES.includes(phase);

/**
 * The financial-year segment of a PID (the `26_27` of `SQ_26_27_001`), or null if it does not
 * parse. Read off the string rather than taken from the reservation row because the modal needs
 * the same answer for a PID somebody has merely typed.
 */
export function pidFy(pid: string | null | undefined): string | null {
  if (!pid) return null;
  const m = /^[A-Za-z0-9]+_(\d{2}_\d{2})_\d{1,6}$/.exec(pid.trim());
  return m ? m[1] : null;
}

/**
 * The next serial in a financial year's continuing series: one past the highest ever taken.
 *
 * `taken` must include every serial the ledger knows about in ANY state — reserved, attached AND
 * discontinued — plus every serial a live project's code carries. Passing only the numbers
 * currently in use is the bug this function exists to make impossible to write by accident: it
 * would hand a retired number to new work the moment its project was closed.
 */
export function nextSerial(taken: Iterable<number>): number {
  let max = 0;
  for (const n of taken) if (Number.isFinite(n) && n > max) max = n;
  return max + 1;
}

/**
 * Re-deal a PID's rounds as 1..N, oldest first, returning only the ones whose number changes.
 *
 * The order is by existing round number and then by id. The id tie-break is not decoration: two
 * rounds can legitimately hold the same number after a soft delete and restore, and without a
 * total order the same input would renumber differently on two runs — which is how a "project 2
 * of 3" quietly becomes a different project between two page loads.
 */
export function renumberRounds(rounds: MoveProject[]): RoundChange[] {
  const ordered = [...rounds].sort(
    (a, b) => a.roundSeq - b.roundSeq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const changes: RoundChange[] = [];
  ordered.forEach((r, i) => {
    const to = i + 1;
    if (r.roundSeq !== to) changes.push({ id: r.id, from: r.roundSeq, to, title: r.title });
  });
  return changes;
}

/**
 * Which of the three corrections a move is, worked out from the destination rather than asked.
 *
 * The caller's word for it is a label on a button; what actually happened is decided by whether
 * the destination already holds work and whether the project was sharing its number. Deriving it
 * means the audit record says what occurred, not what someone meant to do.
 */
export function deriveMode(sourceGroupSize: number, targetGroupSize: number): MoveMode {
  if (targetGroupSize > 0) return 'MERGE';
  return sourceGroupSize > 1 ? 'SPLIT' : 'REASSIGN';
}

const refuse = (reason: MoveRefusal, message: string): MoveDecision => ({ ok: false, reason, message });

/**
 * Decide whether a move is legal and, if it is, exactly what it changes.
 *
 * Every refusal below is a move that would leave the records saying something untrue, and each is
 * refused rather than silently corrected — a person who asked for the wrong thing needs to know
 * that, not to have something else done quietly on their behalf.
 */
export function planMove(input: MoveInput): MoveDecision {
  const { project, targetPid, targetProjectId, declaredMode } = input;

  // Live members only, on both sides. A soft-deleted round is not work the firm is doing, so it
  // neither occupies a round number nor keeps a PID from being vacated.
  const sourceGroup = input.sourceGroup.filter(p => !p.deleted);
  const targetGroup = input.targetGroup.filter(p => !p.deleted);

  if (project.deleted) {
    return refuse('DELETED', 'This project is in the bin. Restore it before changing its Project ID.');
  }
  if (!project.code) {
    return refuse('NO_PID', 'This project has no Project ID yet — attach one instead of moving it.');
  }

  // A self-merge. Only reachable when the destination was named as a project, and worth its own
  // refusal because "merge A into A" is a slip anyone can make in a picker of similar titles.
  if (targetProjectId && targetProjectId === project.id) {
    return refuse('SELF', 'A project cannot be merged into itself.');
  }
  if (targetPid && targetPid === project.code) {
    return refuse(
      'SAME_PID',
      `This project is already under ${project.code}. Choose a different Project ID, or a fresh one.`,
    );
  }

  // The financial year is a claim about WHEN a matter was opened. A fresh number is minted in the
  // current year and is therefore true by construction; claiming an existing number from another
  // year backdates the work and files this year's engagement inside last year's series. So a
  // typed or chosen destination must share the source's year, and a correction that crosses years
  // is done by minting — which is the only way to get a number that is honest about its date.
  if (targetPid) {
    const from = pidFy(project.code);
    const to = pidFy(targetPid);
    if (from && to && from !== to) {
      return refuse(
        'CROSS_FY',
        `${targetPid} belongs to financial year ${to.replace('_', '–')} and this project is filed under `
        + `${from.replace('_', '–')}. A Project ID cannot be moved across financial years — mint a fresh one instead.`,
      );
    }
  }

  const mode = deriveMode(sourceGroup.length, targetGroup.length);

  // Splitting a project that is already alone under its number is not a split — there is nothing
  // to split it from. Saying so is more useful than doing a reassign under the wrong name, because
  // the person asking believes another project is sharing this PID and it is worth them finding
  // out that none is.
  if (declaredMode === 'SPLIT' && sourceGroup.length <= 1) {
    return refuse(
      'NOT_SHARED',
      `${project.code} holds only this project, so there is nothing to split it from. `
      + 'Reassign it to a different Project ID instead.',
    );
  }
  if (declaredMode && declaredMode !== mode) {
    // The message has to name what the CALLER asked for, not only what was derived. Written as a
    // two-way choice it read the wrong way round for the third case: asking to reassign a project
    // that shares its number answered "there is nothing to merge into", which mentions an
    // operation nobody requested and names a Project ID nobody supplied. On a rare admin action
    // that is the difference between a correction and a lost afternoon.
    const explain: Record<MoveMode, string> = {
      MERGE: `${targetPid ?? 'That Project ID'} holds no work, so there is nothing to merge into. `
        + 'Reassign this project to that number instead.',
      SPLIT: `${project.code} holds only this project, so there is nothing to split it from. `
        + 'Reassign it to a different Project ID instead.',
      REASSIGN: mode === 'MERGE'
        ? `${targetPid} already holds work, so this would put this project under it rather than giving it a number of its own. `
          + 'Merge it instead, or choose a number nothing is filed under.'
        : `${project.code} is shared with ${sourceGroup.length - 1} other project`
          + `${sourceGroup.length === 2 ? '' : 's'}, so moving this one off it is a split, not a reassignment.`,
    };
    return refuse('MODE_MISMATCH', explain[declaredMode]);
  }

  // The destination is made contiguous first, so the arrival's number is N+1 of a real sequence
  // rather than one past whatever the highest surviving number happened to be.
  const targetRenumber = renumberRounds(targetGroup);
  const newRoundSeq = targetGroup.length + 1;

  // What is left behind closes ranks. Computed on the group WITHOUT the departing project, so a
  // project leaving from the middle does not leave a hole where it used to be.
  const remaining = sourceGroup.filter(p => p.id !== project.id);
  const sourceRenumber = renumberRounds(remaining);

  return {
    ok: true,
    plan: {
      mode,
      fromPid: project.code,
      toPid: targetPid,
      newRoundSeq,
      oldRoundSeq: project.roundSeq,
      sourceRenumber,
      targetRenumber,
      sourceRemaining: remaining.length,
      targetTotal: targetGroup.length + 1,
      // Nothing left under the old number. Its reservation is retired, not released — see the
      // first invariant at the top of this file.
      vacatesSource: remaining.length === 0,
      affected: [...new Set([...sourceRenumber, ...targetRenumber].map(c => c.id))],
    },
  };
}

/**
 * The round a PID's reservation should point at after a move.
 *
 * A reservation carries one `projectId`, and plenty of code still reads it as "the project this
 * number is about". With several rounds under one number that pointer has to mean something, and
 * the only useful meaning is the piece of work someone would land on: the newest round that is
 * still running, falling back to the newest round of all when every one of them is finished.
 * Returns null when the PID is left holding nothing.
 */
export function reservationPointer(rounds: MoveProject[]): string | null {
  const live = rounds.filter(p => !p.deleted);
  if (!live.length) return null;
  const newestFirst = [...live].sort((a, b) => b.roundSeq - a.roundSeq || (a.id < b.id ? 1 : -1));
  return (newestFirst.find(p => !isTerminal(p.phase)) ?? newestFirst[0]).id;
}
