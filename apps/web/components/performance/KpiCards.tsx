'use client';

/**
 * The pieces both KPI views are built from — one person's, and the whole firm's.
 *
 * They live together because the two views must read as the same report at two scales. When the
 * organisation panel and the personal panel each grew their own tiles, the same figure ended up
 * with two labels and two roundings, and the first question anybody asked was which of the two
 * screens was right.
 */

import type { ReactNode } from 'react';
import clsx from 'clsx';
import { RiInformationLine } from '@remixicon/react';
import type { BreachCount, HoursKpi, DeadlineKpi, StreakKpi } from '@/lib/api';
import { C } from './tokens';

/** Green when nothing breached, amber for an over-run, red once it doubles. */
export function overrunColor(ratio: number | null): string {
  if (ratio == null) return C.slate;
  if (ratio >= 2) return C.red;
  if (ratio > 1.1) return C.amber;
  return C.green;
}

/**
 * The headline card a KPI leads with: one figure the size of a headline, and the sentence that
 * says what it means.
 *
 * The rest of the page is deliberately quieter than this. The complaint that started the rework
 * was that there was too much on screen and no way to tell what mattered, and the fix for that is
 * not fewer facts — it is one obvious place for the eye to land first.
 */
export function KpiHero({
  eyebrow, value, unit, caption, tone = 'neutral', children, info,
}: {
  eyebrow: string;
  value: string | number;
  unit?: string;
  caption: ReactNode;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
  children?: ReactNode;
  info?: string;
}) {
  const ring = {
    good: 'ring-emerald-200 bg-emerald-50/40',
    warn: 'ring-amber-200 bg-amber-50/40',
    bad: 'ring-red-200 bg-red-50/40',
    neutral: 'ring-gray-950/[0.06] bg-white',
  }[tone];
  const figure = {
    good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700', neutral: 'text-gray-900',
  }[tone];

  return (
    <div className={clsx('rounded-xl ring-1 p-5 flex flex-col', ring)}>
      <div className="flex items-center gap-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{eyebrow}</h3>
        {info && (
          <span title={info} className="inline-flex text-gray-300 hover:text-gray-500 cursor-help">
            <RiInformationLine size={13} />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={clsx('text-[40px] leading-none font-semibold tabular-nums', figure)}>{value}</span>
        {unit && <span className="text-sm font-medium text-gray-400">{unit}</span>}
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-gray-600">{caption}</p>
      {children && <div className="mt-4 pt-4 border-t border-gray-950/[0.06]">{children}</div>}
    </div>
  );
}

/**
 * "5 times · 3 projects".
 *
 * Both halves, always. Five slips on one matter and five matters slipping once each are different
 * problems, and a single count cannot tell them apart — which is exactly why the owner asked for
 * two parameters rather than one.
 */
export function Breaches({ count, thing = 'task', className }: { count: BreachCount; thing?: string; className?: string }) {
  if (count.times === 0) return <span className={clsx('text-gray-400', className)}>none</span>;
  const things = count.things === 1 ? thing : `${thing}s`;
  return (
    <span className={clsx('tabular-nums', className)}>
      <span className="font-semibold text-gray-800">{count.times}</span>
      <span className="text-gray-400"> {count.times === 1 ? 'time' : 'times'} · </span>
      <span className="font-semibold text-gray-800">{count.things}</span>
      <span className="text-gray-400"> {things}</span>
    </span>
  );
}

/** A labelled figure in a row under a hero card. */
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'bad' | 'muted' }) {
  return (
    <div className="min-w-0">
      <div className={clsx('text-sm font-semibold tabular-nums truncate',
        tone === 'bad' ? 'text-red-600' : tone === 'muted' ? 'text-gray-400' : 'text-gray-800')}>{value}</div>
      <div className="text-[11px] text-gray-400 truncate">{label}</div>
    </div>
  );
}

/**
 * The honesty line: how many deliveries nothing could judge, and why that is not a failing grade.
 *
 * A task with no estimate cannot breach an estimate, so it is excluded from KPI 1's denominator
 * rather than counted as a pass. Excluding it silently would be worse than either: the rate on
 * screen would be true of a set the reader cannot see. So the count is always shown next to it.
 */
export function ExcludedNote({ unmeasured, total, what = 'had no allocated hours' }: {
  unmeasured: number; total: number; what?: string;
}) {
  if (!unmeasured) return null;
  return (
    <p className="text-[11.5px] text-gray-400 leading-relaxed">
      {unmeasured} of {total} {unmeasured === 1 ? 'delivery' : 'deliveries'} {what}, so {unmeasured === 1 ? 'it is' : 'they are'} left
      out of this figure rather than counted as a pass.
    </p>
  );
}

/** Plain-language definitions, shown on the ⓘ next to each KPI and in the glossary. */
export const KPI_HELP = {
  overrun:
    'KPI 1 — time spent ÷ time allocated, across everything finished in the period. 1.0 means the work cost '
    + 'exactly what it was given. Anything past 1.1 counts as an over-run (a tenth is the rounding of a '
    + 'quarter-hour timesheet, not a decision); 2.0 or more is a red flag — eight hours allocated, sixteen taken. '
    + 'Your allocation is YOUR seat on the task, not the whole task: a reviewer is never judged against the '
    + 'analyst\'s hours. Work nobody estimated is excluded, not passed.',
  hoursBreaches:
    'How many TIMES the allocated hours were crossed, and across how many PROJECTS. Both, because somebody '
    + 'consistently over on ten matters is a different problem from somebody who had one bad one.',
  streak:
    'KPI 2 — consecutive deliveries that were BOTH on or before the deadline AND within the allocated hours, '
    + 'in the order the work was finished. Either one alone breaks it: delivered on the day at twice the cost is '
    + 'not a reliable delivery. Work with neither a deadline nor an allocation is passed over — it neither '
    + 'extends the run nor ends it.',
  onTime:
    'Finished on or before the DEADLINE DATE. Finishing on the deadline counts as on time. Work with no '
    + 'deadline is not counted at all, rather than counted as punctual.',
  withinHours:
    'Finished within the ALLOCATED HOURS. This is the chart form of KPI 1 and is a different question from '
    + '"on time" — a task can meet its date and still cost double.',
  completed:
    'Everything finished inside the period, against the work that was due to be finished by the end of it and '
    + 'is still open.',
  deadlineShifts:
    'Requirement 18 — how many times a project\'s deadline was moved in the period, from the recorded deadline '
    + 'changes. A project with no recorded change shows zero: the ledger only holds moves made since it was '
    + 'introduced, so zero means "none recorded", not "provably never".',
  pmPerformance:
    'A project\'s aggregated overshoot set against its aggregated delivery, rolled up per project manager. '
    + 'A co-managed project counts in full for each manager rather than being split — each of them is wholly '
    + 'answerable for it.',
  importantOverrun:
    'Requirement 19 — the same over-run arithmetic restricted to the HIGH and CRITICAL tasks. A project can '
    + 'look calm in aggregate while every critical piece of it doubled.',
};

/** The two KPIs written out, shown at the foot of each view. */
export function KpiGlossary() {
  const rows: { label: string; help: string }[] = [
    { label: 'KPI 1 · Time vs allocated', help: KPI_HELP.overrun },
    { label: 'KPI 1 · Breaches', help: KPI_HELP.hoursBreaches },
    { label: 'KPI 2 · On-time & on-budget streak', help: KPI_HELP.streak },
    { label: 'Completed on time', help: KPI_HELP.onTime },
    { label: 'Completed within allocated hours', help: KPI_HELP.withinHours },
    { label: 'Deadline shifts', help: KPI_HELP.deadlineShifts },
  ];
  return (
    <details className="bg-white rounded-xl border border-gray-200 group">
      <summary className="flex items-center gap-2 px-5 py-3 cursor-pointer select-none text-sm font-medium text-gray-600 hover:text-gray-800">
        <RiInformationLine size={16} className="text-gray-400" />
        How these two numbers are calculated
      </summary>
      <dl className="px-5 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {rows.map(r => (
          <div key={r.label}>
            <dt className="text-xs font-semibold text-gray-700">{r.label}</dt>
            <dd className="text-xs text-gray-500 leading-snug mt-0.5">{r.help}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** The three donuts, as data — completed out of total, on time, and within the hours. */
export function kpiDonuts(opts: { completed: number; outstanding: number; hours: HoursKpi; deadlines: DeadlineKpi }) {
  return {
    completed: [
      { name: 'Completed', value: opts.completed, color: C.green },
      { name: 'Still open', value: Math.max(0, opts.outstanding), color: C.slate },
    ],
    onTime: [
      { name: 'On time', value: opts.deadlines.onTime, color: C.green },
      { name: 'Late', value: opts.deadlines.late, color: C.red },
    ],
    withinHours: [
      { name: 'Within hours', value: opts.hours.within, color: C.green },
      { name: 'Over', value: opts.hours.over, color: C.amber },
      { name: 'Red flag (2×+)', value: opts.hours.redFlag, color: C.red },
    ],
  };
}

/** "2 · longest 6" and the sentence about what ended it. */
export function streakCaption(streak: StreakKpi): ReactNode {
  if (streak.judged === 0) {
    return <>Nothing with a deadline or an allocation was finished in this period, so there is nothing to be reliable at yet.</>;
  }
  if (streak.brokenBy) {
    const why = streak.brokenBy.reason === 'BOTH' ? 'was late AND over its hours'
      : streak.brokenBy.reason === 'LATE' ? 'missed its deadline' : 'went over its allocated hours';
    return <>The run ended on {streak.brokenBy.at} — <span className="font-medium text-gray-700">{streak.brokenBy.title ?? 'a task'}</span> {why}. Best run in this period: {streak.longest}.</>;
  }
  return <>Consecutive deliveries on time <em>and</em> within their allocated hours. Best run in this period: {streak.longest}.</>;
}
