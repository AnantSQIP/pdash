/**
 * Tests for correcting a project's PID — apps/api/src/modules/projects/pid-move.ts.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/pid-move.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * WHY THESE EXIST
 *
 * A PID is the number the firm files a matter under: it is on the invoice, in the client's email,
 * and in the report. Moving a project between numbers is therefore not a cosmetic edit — it is an
 * edit to the firm's index of its own work, made by hand, usually months after the fact, by
 * somebody who has just noticed something is wrong.
 *
 * Two things can go wrong and neither announces itself. A serial can be handed out twice, which
 * puts two unrelated matters under one number and leaves no record saying which invoice meant
 * which. And a group's round numbers can drift out of sequence, which turns "project 2 of 3" into
 * a label that points at the wrong project — wrong in a way that looks perfectly normal on screen.
 *
 * So every case below is one of those two, or one of the refusals that keeps a move from creating
 * them. The arithmetic is pure precisely so it can be checked here rather than against a database.
 */
process.env.TZ = 'Asia/Kolkata';

import {
  deriveMode,
  nextSerial,
  pidFy,
  planMove,
  renumberRounds,
  reservationPointer,
  type MoveInput,
  type MoveProject,
} from '../apps/api/src/modules/projects/pid-move';

let passed = 0;
const failures: string[] = [];

function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

// ── fixtures ────────────────────────────────────────────────────────────────
/** A project under a PID. Active unless a case says otherwise, because most of them are. */
const proj = (id: string, code: string | null, roundSeq: number, over: Partial<MoveProject> = {}): MoveProject =>
  ({ id, code, roundSeq, phase: 'ACTIVE', title: id, ...over });

/** The shape planMove takes, with the boring halves defaulted. */
const move = (over: Partial<MoveInput> & Pick<MoveInput, 'project'>): MoveInput => ({
  sourceGroup: [over.project],
  targetPid: null,
  targetGroup: [],
  ...over,
});

/** The plan, or the refusal code — so a case reads as one line either way. */
const outcome = (input: MoveInput) => {
  const d = planMove(input);
  return d.ok ? d.plan : d.reason;
};
const numbers = (changes: { id: string; to: number }[]) => changes.map(c => [c.id, c.to]);

// ── 1. reassign: the number itself was wrong ────────────────────────────────
// One project, alone under its PID, moving to a freshly minted one. Nothing else in the firm is
// touched, and the number it leaves is left holding nothing.
{
  const p = proj('p1', 'SQ_26_27_004', 1);
  const plan = planMove(move({ project: p, sourceGroup: [p], targetPid: null }));
  check('reassigning a lone project to a fresh PID is a REASSIGN', plan.ok && plan.plan.mode, 'REASSIGN');
  check('the fresh PID starts the arrival at round 1', plan.ok && plan.plan.newRoundSeq, 1);
  check('the PID it leaves is vacated', plan.ok && plan.plan.vacatesSource, true);
  check('nothing else is renumbered', plan.ok && plan.plan.affected, []);
  check('the old number is reported so the audit record can name it', plan.ok && plan.plan.fromPid, 'SQ_26_27_004');
}

// Reassigning onto a PID that exists but holds nothing — a serial reserved and never used, say.
// Still a reassign, still round 1: an empty number has no rounds to queue behind.
{
  const p = proj('p1', 'SQ_26_27_004', 1);
  const plan = planMove(move({ project: p, sourceGroup: [p], targetPid: 'SQ_26_27_009', targetGroup: [] }));
  check('reassigning onto an existing but empty PID is a REASSIGN', plan.ok && plan.plan.mode, 'REASSIGN');
  check('the arrival takes round 1 of the empty PID', plan.ok && plan.plan.newRoundSeq, 1);
  check('the destination PID is carried into the plan', plan.ok && plan.plan.toPid, 'SQ_26_27_009');
  check('the vacated PID is still vacated', plan.ok && plan.plan.vacatesSource, true);
}

// ── the three ways a caller can ask for the wrong operation ─────────────────
// Each refusal must name what the CALLER asked for. Written as a two-way choice, the third case
// answered "there is nothing to merge into" to somebody who had asked to reassign — an operation
// they never requested, about a Project ID they never supplied.
{
  const a = proj('p1', 'SQ_26_27_004', 1), b = proj('p2', 'SQ_26_27_004', 2);
  const d = planMove(move({ project: a, sourceGroup: [a, b], targetPid: null, declaredMode: 'REASSIGN' }));
  check('asking to reassign a SHARED number is refused', d.ok, false);
  check('and it is refused as a mode mismatch', !d.ok && d.reason, 'MODE_MISMATCH');
  check('and the message says it is a split, not a merge',
    !d.ok && /split, not a reassignment/.test(d.message) && !/merge/.test(d.message), true);
  check('and it says how many others share the number',
    !d.ok && /shared with 1 other project\b/.test(d.message), true);
}
{
  const a = proj('p1', 'SQ_26_27_004', 1), b = proj('p2', 'SQ_26_27_004', 2), c = proj('p3', 'SQ_26_27_004', 3);
  const d = planMove(move({ project: a, sourceGroup: [a, b, c], targetPid: null, declaredMode: 'REASSIGN' }));
  check('the count is pluralised when more than one other shares it',
    !d.ok && /shared with 2 other projects/.test(d.message), true);
}
{
  const p = proj('p1', 'SQ_26_27_004', 1), q = proj('p2', 'SQ_26_27_002', 1);
  const d = planMove(move({ project: p, sourceGroup: [p], targetPid: 'SQ_26_27_002', targetGroup: [q], declaredMode: 'REASSIGN' }));
  check('asking to reassign ONTO an occupied number is refused', !d.ok && d.reason, 'MODE_MISMATCH');
  check('and the message offers the merge that was actually meant',
    !d.ok && /Merge it instead/.test(d.message), true);
}
{
  const p = proj('p1', 'SQ_26_27_004', 1);
  const d = planMove(move({ project: p, sourceGroup: [p], targetPid: 'SQ_26_27_009', targetGroup: [], declaredMode: 'MERGE' }));
  check('asking to merge into an EMPTY number is refused', !d.ok && d.reason, 'MODE_MISMATCH');
  check('and the message names the empty number and offers a reassign',
    !d.ok && /SQ_26_27_009 holds no work/.test(d.message) && /Reassign/.test(d.message), true);
}

// ── 2. split: two matters were filed under one number ───────────────────────
// Three rounds under one PID. The FIRST one leaves — the hardest case, because the two behind it
// must both move down or the group is left starting at 2.
{
  const a = proj('a', 'SQ_26_27_004', 1);
  const b = proj('b', 'SQ_26_27_004', 2);
  const c = proj('c', 'SQ_26_27_004', 3);
  const d = planMove(move({ project: a, sourceGroup: [a, b, c], targetPid: null, declaredMode: 'SPLIT' }));
  check('splitting one of three is a SPLIT', d.ok && d.plan.mode, 'SPLIT');
  check('the departing project restarts at round 1 under its own PID', d.ok && d.plan.newRoundSeq, 1);
  check('the two left behind close ranks to 1 and 2', d.ok && numbers(d.plan.sourceRenumber), [['b', 1], ['c', 2]]);
  check('two rounds remain under the old PID', d.ok && d.plan.sourceRemaining, 2);
  check('the old PID is NOT vacated — work is still under it', d.ok && d.plan.vacatesSource, false);
  check('both remaining projects are named as affected', d.ok && d.plan.affected, ['b', 'c']);
}

// The LAST one leaves. Nobody behind it, so nothing is renumbered — and a plan that renumbered
// anyway would be writing to two projects for no reason.
{
  const a = proj('a', 'SQ_26_27_004', 1);
  const b = proj('b', 'SQ_26_27_004', 2);
  const c = proj('c', 'SQ_26_27_004', 3);
  const d = planMove(move({ project: c, sourceGroup: [a, b, c], targetPid: null, declaredMode: 'SPLIT' }));
  check('splitting the last round out is still a SPLIT', d.ok && d.plan.mode, 'SPLIT');
  check('splitting the last round renumbers nobody', d.ok && d.plan.sourceRenumber, []);
  check('the rounds before it are untouched', d.ok && d.plan.affected, []);
  check('two rounds remain', d.ok && d.plan.sourceRemaining, 2);
}

// A middle round leaving is the case that makes the hole most obvious.
{
  const rounds = [proj('a', 'SQ_26_27_004', 1), proj('b', 'SQ_26_27_004', 2), proj('c', 'SQ_26_27_004', 3)];
  const d = planMove(move({ project: rounds[1], sourceGroup: rounds, targetPid: null, declaredMode: 'SPLIT' }));
  check('a middle round leaving pulls the ones behind it down', d.ok && numbers(d.plan.sourceRenumber), [['c', 2]]);
}

// ── 3. merge: two numbers were issued for one matter ────────────────────────
// Two singletons. The mover becomes round 2 of the number it joins, and its own number empties.
{
  const p = proj('p1', 'SQ_26_27_004', 1);
  const q = proj('q1', 'SQ_26_27_002', 1);
  const d = planMove(move({ project: p, sourceGroup: [p], targetPid: 'SQ_26_27_002', targetGroup: [q], declaredMode: 'MERGE' }));
  check('merging two singletons is a MERGE', d.ok && d.plan.mode, 'MERGE');
  check('the arrival becomes round 2', d.ok && d.plan.newRoundSeq, 2);
  check('the destination keeps its existing round numbers', d.ok && d.plan.targetRenumber, []);
  check('the number it left is vacated', d.ok && d.plan.vacatesSource, true);
  check('the destination now holds two rounds', d.ok && d.plan.targetTotal, 2);
}

// A group moving into a group: one of two rounds joins a PID that already holds three. It takes
// round 4, and the round left behind becomes the only one under its old number.
{
  const src = [proj('s1', 'SQ_26_27_007', 1), proj('s2', 'SQ_26_27_007', 2)];
  const dst = [proj('d1', 'SQ_26_27_002', 1), proj('d2', 'SQ_26_27_002', 2), proj('d3', 'SQ_26_27_002', 3)];
  const d = planMove(move({ project: src[0], sourceGroup: src, targetPid: 'SQ_26_27_002', targetGroup: dst, declaredMode: 'MERGE' }));
  check('a round moving into a group of three takes round 4', d.ok && d.plan.newRoundSeq, 4);
  check('the round left behind becomes round 1', d.ok && numbers(d.plan.sourceRenumber), [['s2', 1]]);
  check('the old PID keeps one round and is not vacated', d.ok && [d.plan.sourceRemaining, d.plan.vacatesSource], [1, false]);
  check('the destination ends up with four rounds', d.ok && d.plan.targetTotal, 4);
}

// A destination whose numbering has drifted (a round was deleted from the middle long ago) is
// healed on arrival rather than having the hole copied into the new round's number.
{
  const dst = [proj('d1', 'SQ_26_27_002', 1), proj('d3', 'SQ_26_27_002', 3)];
  const p = proj('p1', 'SQ_26_27_004', 1);
  const d = planMove(move({ project: p, sourceGroup: [p], targetPid: 'SQ_26_27_002', targetGroup: dst, declaredMode: 'MERGE' }));
  check('a gapped destination is made contiguous', d.ok && numbers(d.plan.targetRenumber), [['d3', 2]]);
  check('and the arrival takes 3, not 4', d.ok && d.plan.newRoundSeq, 3);
}

// ── 4. the moves that must be refused ───────────────────────────────────────
{
  const p = proj('p1', 'SQ_26_27_004', 1);
  check('moving a project onto the PID it already has is refused',
    outcome(move({ project: p, sourceGroup: [p], targetPid: 'SQ_26_27_004' })), 'SAME_PID');

  check('merging a project into itself is refused',
    outcome(move({ project: p, sourceGroup: [p], targetPid: 'SQ_26_27_004', targetGroup: [p], targetProjectId: 'p1', declaredMode: 'MERGE' })),
    'SELF');

  check('splitting a project that is alone under its PID is refused',
    outcome(move({ project: p, sourceGroup: [p], targetPid: null, declaredMode: 'SPLIT' })), 'NOT_SHARED');

  check('a project in the bin cannot be moved',
    outcome(move({ project: { ...p, deleted: true }, sourceGroup: [p], targetPid: null })), 'DELETED');

  check('a project with no PID is told to attach one instead',
    outcome(move({ project: proj('p1', null, 1), sourceGroup: [], targetPid: null })), 'NO_PID');

  check('a destination in another financial year is refused',
    outcome(move({ project: p, sourceGroup: [p], targetPid: 'SQ_25_26_011', targetGroup: [proj('x', 'SQ_25_26_011', 1)], declaredMode: 'MERGE' })),
    'CROSS_FY');

  // Asking to merge into a number nothing is filed under, or to give a number of its own to a
  // project by picking one that is already occupied, is a different operation from the one asked
  // for — and doing it silently would put work under a client's number by accident.
  check('a merge into an empty PID is refused as the wrong operation',
    outcome(move({ project: p, sourceGroup: [p], targetPid: 'SQ_26_27_009', targetGroup: [], declaredMode: 'MERGE' })),
    'MODE_MISMATCH');
  check('a reassign onto an occupied PID is refused as the wrong operation',
    outcome(move({ project: p, sourceGroup: [p], targetPid: 'SQ_26_27_002', targetGroup: [proj('q', 'SQ_26_27_002', 1)], declaredMode: 'REASSIGN' })),
    'MODE_MISMATCH');

  // A soft-deleted sibling neither holds a round number nor keeps the PID alive: leaving a group
  // whose only other member is in the bin still vacates the number.
  const ghost = proj('gone', 'SQ_26_27_004', 2, { deleted: true });
  const d = planMove(move({ project: p, sourceGroup: [p, ghost], targetPid: null }));
  check('a deleted sibling does not keep a vacated PID alive', d.ok && d.plan.vacatesSource, true);
  check('and it does not make the move a split', d.ok && d.plan.mode, 'REASSIGN');
}

// ── 5. round numbers stay contiguous after EVERY operation ──────────────────
// The property the whole "project N of M" label rests on, asserted as a property rather than case
// by case: apply a plan, and both sides must read 1..N with no duplicates and no holes.
{
  const applied = (group: MoveProject[], plan: { sourceRenumber: { id: string; to: number }[] }, removeId: string) => {
    const by = new Map(plan.sourceRenumber.map(c => [c.id, c.to]));
    return group.filter(p => p.id !== removeId && !p.deleted)
      .map(p => by.get(p.id) ?? p.roundSeq)
      .sort((a, b) => a - b);
  };
  const contiguous = (n: number[]) => n.every((v, i) => v === i + 1);

  for (const leaving of [0, 1, 2, 3]) {
    const group = [0, 1, 2, 3].map(i => proj(`r${i}`, 'SQ_26_27_004', i + 1));
    const d = planMove(move({ project: group[leaving], sourceGroup: group, targetPid: null, declaredMode: 'SPLIT' }));
    check(`round numbers stay contiguous when round ${leaving + 1} of 4 leaves`,
      d.ok && contiguous(applied(group, d.plan, group[leaving].id)), true);
  }

  // And the destination, including the arrival, is 1..N too.
  const dst = [proj('d1', 'SQ_26_27_002', 1), proj('d2', 'SQ_26_27_002', 4), proj('d3', 'SQ_26_27_002', 9)];
  const p = proj('p1', 'SQ_26_27_004', 1);
  const d = planMove(move({ project: p, sourceGroup: [p], targetPid: 'SQ_26_27_002', targetGroup: dst, declaredMode: 'MERGE' }));
  const after = d.ok
    ? [...dst.map(x => d.plan.targetRenumber.find(c => c.id === x.id)?.to ?? x.roundSeq), d.plan.newRoundSeq].sort((a, b) => a - b)
    : [];
  check('the destination reads 1..N after the arrival', after, [1, 2, 3, 4]);
}

// renumberRounds on its own — the ordering rule, including the tie-break that keeps two runs
// over the same data producing the same answer.
check('renumbering an already-correct group changes nothing',
  renumberRounds([proj('a', null, 1), proj('b', null, 2)]), []);
// Two rounds sharing a number is resolved by id, not by the order the rows came back in — so the
// lower id takes 1 and the other keeps the 2 it already had, whichever way round they arrive.
check('renumbering breaks a tie by id, not by query order',
  numbers(renumberRounds([proj('b', null, 2), proj('a', null, 2)])), [['a', 1]]);
check('and gives the same answer when the rows arrive the other way round',
  numbers(renumberRounds([proj('a', null, 2), proj('b', null, 2)])), [['a', 1]]);
check('renumbering closes a hole',
  numbers(renumberRounds([proj('a', null, 1), proj('c', null, 7)])), [['c', 2]]);

// ── 6. a serial is never handed out twice, across a whole sequence of moves ──
// The series is driven exactly as the service drives it: the taken set only ever GROWS. A vacated
// PID's serial stays in it, because vacating retires a number rather than releasing it. If a
// future edit ever removed a vacated serial from that set, this is the check that would fail.
{
  const taken = new Set<number>([1, 2, 3, 4]); // four projects already filed this year
  const issued: number[] = [];

  // Six corrections in a row, each minting a fresh number and each vacating the one it left.
  for (let i = 0; i < 6; i++) {
    const serial = nextSerial(taken);
    issued.push(serial);
    taken.add(serial);          // the new number is now taken …
    // … and the vacated one is NOT removed. That single absent line is the invariant.
  }
  check('six moves issue six distinct serials', new Set(issued).size, 6);
  check('and they continue the series past every number ever used', issued, [5, 6, 7, 8, 9, 10]);
  check('a discontinued serial is still counted as taken', nextSerial([1, 2, 3, 99]), 100);
  check('an empty year starts at 1', nextSerial([]), 1);
}

// ── 7. small pieces the rest of the module leans on ─────────────────────────
check('a PID yields its financial year', pidFy('SQ_26_27_001'), '26_27');
check('a two-letter org code is not required', pidFy('SQIP_26_27_1'), '26_27');
check('nonsense yields no financial year', pidFy('not-a-pid'), null);
check('nothing yields no financial year', pidFy(null), null);

check('a destination holding work makes it a merge', deriveMode(1, 2), 'MERGE');
check('leaving a shared PID for an empty one is a split', deriveMode(3, 0), 'SPLIT');
check('leaving a PID of your own for an empty one is a reassign', deriveMode(1, 0), 'REASSIGN');

// The reservation's single projectId has to point at something a person would land on.
check('a reservation points at the newest LIVE round',
  reservationPointer([proj('a', null, 1), proj('b', null, 2, { phase: 'CLOSED' })]), 'a');
check('when every round is finished it points at the newest of them',
  reservationPointer([proj('a', null, 1, { phase: 'COMPLETED' }), proj('b', null, 2, { phase: 'CLOSED' })]), 'b');
check('a PID holding nothing points at nothing', reservationPointer([]), null);
check('a deleted round is not something to point at',
  reservationPointer([proj('a', null, 1, { deleted: true })]), null);

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ pid move: ${passed}/${passed} passed`);
