'use client';

import clsx from 'clsx';
import type { AppraisalScore } from '@/lib/api';

/**
 * The criteria a person is rated on, and the 1-5 marks against them.
 *
 * Both sides are shown at once on purpose. A manager scoring in a column beside what the employee
 * said is the whole point of a self-assessment — hiding it until afterwards turns the review into
 * a reveal, and the gaps between the two columns are exactly what the review call is for.
 */

const SCALE = [1, 2, 3, 4, 5];
/** Said out loud, because "4 out of 5" means different things at different firms. */
export const SCALE_LABEL: Record<number, string> = {
  1: 'Well below',
  2: 'Below',
  3: 'Meets',
  4: 'Above',
  5: 'Outstanding',
};

export function ScorePicker({ value, onChange, disabled }: {
  value?: number | null;
  onChange?: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1" role="radiogroup">
      {SCALE.map(n => {
        const on = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${n} — ${SCALE_LABEL[n]}`}
            title={`${n} — ${SCALE_LABEL[n]}`}
            disabled={disabled}
            onClick={() => onChange?.(n)}
            className={clsx(
              'w-8 h-8 rounded-lg text-sm font-semibold border transition-colors',
              on ? 'bg-brand-600 border-brand-600 text-white'
                 : 'bg-white border-gray-200 text-gray-500',
              !disabled && !on && 'hover:border-brand-400 hover:text-brand-600',
              disabled && 'opacity-60 cursor-default',
            )}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

/** A read-only mark, for the column you are not filling in. */
function Mark({ value }: { value?: number | null }) {
  if (value == null) return <span className="text-xs text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold grid place-items-center">{value}</span>
      <span className="text-[11px] text-gray-400 hidden sm:inline">{SCALE_LABEL[value]}</span>
    </span>
  );
}

export function ParameterGrid({ scores, editing, draft, onScore, onComment }: {
  scores: AppraisalScore[];
  /** Which column is being filled in now. `null` = read-only, both columns shown as marks. */
  editing: 'self' | 'manager' | null;
  draft: Record<string, { score?: number; comment?: string }>;
  onScore?: (parameterId: string, score: number) => void;
  onComment?: (parameterId: string, comment: string) => void;
}) {
  if (!scores.length) {
    return (
      <p className="text-sm text-gray-400 border border-gray-200 rounded-xl px-4 py-6 text-center">
        No rating parameters applied to this appraisal. HR sets these under Parameters.
      </p>
    );
  }
  const weighted = scores.some(s => s.parameter.weight !== 1);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 bg-gray-50/60 border-b border-gray-100">
            <th className="px-4 py-2.5 font-medium">Rated on</th>
            <th className="px-3 py-2.5 font-medium w-48">Self</th>
            <th className="px-3 py-2.5 font-medium w-48">Manager</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {scores.map(s => {
            const d = draft[s.parameter.id] ?? {};
            const selfValue = editing === 'self' ? (d.score ?? s.selfScore) : s.selfScore;
            const mgrValue = editing === 'manager' ? (d.score ?? s.managerScore) : s.managerScore;
            return (
              <tr key={s.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">
                    {s.parameter.name}
                    {weighted && s.parameter.weight !== 1 && (
                      <span className="ml-1.5 text-[11px] font-normal text-brand-600">×{s.parameter.weight}</span>
                    )}
                  </p>
                  {s.parameter.description && (
                    <p className="text-xs text-gray-500 mt-0.5 max-w-md">{s.parameter.description}</p>
                  )}
                  {/* A comment belongs to the criterion, not to the review as a whole — it is the
                      note that makes a 3 understandable six months later. */}
                  {editing ? (
                    <input
                      value={d.comment ?? s.comment ?? ''}
                      onChange={e => onComment?.(s.parameter.id, e.target.value)}
                      placeholder="Why this mark (optional)"
                      className="mt-2 w-full max-w-md px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500"
                    />
                  ) : s.comment ? (
                    <p className="mt-1.5 text-xs text-gray-600 italic">{s.comment}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  {editing === 'self'
                    ? <ScorePicker value={selfValue} onChange={v => onScore?.(s.parameter.id, v)} />
                    : <Mark value={selfValue} />}
                </td>
                <td className="px-3 py-3">
                  {editing === 'manager'
                    ? <ScorePicker value={mgrValue} onChange={v => onScore?.(s.parameter.id, v)} />
                    : <Mark value={mgrValue} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[11px] text-gray-400 bg-gray-50/60 border-t border-gray-100">
        1 well below · 2 below · 3 meets · 4 above · 5 outstanding.
        {weighted && ' Weighted criteria count more toward the overall figure.'}
      </p>
    </div>
  );
}
