'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Clock, Loader, X, AlertTriangle, Check, ChevronDown } from 'lucide-react';
import { api, type DayPlan, type DayPlanRow as PlanRow } from '@/lib/api';
import { warningsForSheet, sheetSummary } from '@/lib/day-plan';
import { useToast } from '@/components/ui/Toast';
import { todayIST, formatDate } from '@/lib/date';
import { pidLabel } from '@/lib/mock-data';

/** Nobody may book more than this against one calendar day — the server's rule, said here first. */
const MAX_HOURS_PER_DAY = 16;

const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) && n > 0 ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Fill in a day.
 *
 * WHY THERE IS NO DROPDOWN
 *
 * The work is already known: the same plan the capacity board draws says what this person was
 * meant to be doing today and tomorrow. Making them find each task in a picker asks them to
 * re-answer a question the system can already answer, and every one of those clicks is a chance to
 * pick the wrong row. So the tasks are listed, and all that is asked for is hours.
 *
 * WHY HOURS ARE NEVER PRE-FILLED
 *
 * The most important decision here, and it is a decision NOT to be helpful. Planned hours appear
 * beside each task as grey context, never as a value in the box. If the box arrived holding "4h",
 * everybody would save their plan every evening whether they worked it or not, and the timesheet
 * would stop recording the day and start recording the intention — which is worse than no
 * timesheet at all, because it still looks like data.
 *
 * WHAT HAPPENS WHEN SOMEBODY LOGS AGAINST WORK THEY DID NOT DO
 *
 * Nothing can know that. What CAN be known is when a line looks unlike the day that was planned:
 * hours on work that was not on the plan, more hours than a task had left, a task already
 * finished, one task swallowing a whole day. Those are said on the line as it is typed, and the
 * save asks once. They are never blocked — people work on unplanned things all week — while the
 * things that are genuinely impossible (a task you are not staffed on, a closed matter, the 16h
 * cap, the backdating window) are refused by the server whatever this file believes.
 */
export function DaySheet({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const today = todayIST();
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showOther, setShowOther] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [failures, setFailures] = useState<Record<string, string>>({});

  const { data: plan, isLoading, isError } = useQuery<DayPlan>({
    queryKey: ['my-plan', date],
    queryFn: () => api.capacity.myPlan(date),
    staleTime: 30_000,
  });

  const rows = useMemo(() => plan?.rows ?? [], [plan]);
  const groups = useMemo(() => ({
    TODAY: rows.filter(r => r.when === 'TODAY'),
    TOMORROW: rows.filter(r => r.when === 'TOMORROW'),
    OTHER: rows.filter(r => r.when === 'OTHER'),
  }), [rows]);

  const hoursByTask = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(hours)) out[id] = num(v);
    return out;
  }, [hours]);

  const warnings = useMemo(() => warningsForSheet(rows, hoursByTask), [rows, hoursByTask]);
  const summary = useMemo(() => sheetSummary(warnings), [warnings]);

  const filled = rows.filter(r => (hoursByTask[r.taskId] ?? 0) > 0);
  const entered = filled.reduce((s, r) => s + hoursByTask[r.taskId], 0);
  const alreadyFiled = plan?.logged ?? 0;
  const target = plan?.target ?? 8;
  const dayTotal = r2(alreadyFiled + entered);
  const overCap = dayTotal > MAX_HOURS_PER_DAY;

  /** A new date is a new day: nothing typed for the old one may follow it across. */
  function pickDate(next: string) {
    setDate(next);
    setHours({});
    setNotes({});
    setFailures({});
    setConfirming(false);
  }

  async function save() {
    if (!filled.length) { toast('Enter hours against the work you did.', 'error'); return; }
    // Asked once, never twice, and never at all for an ordinary sheet.
    if (summary && !confirming) { setConfirming(true); return; }
    setSaving(true);
    setFailures({});
    try {
      const res = await api.timesheets.createDay(date, filled.map(r => ({
        taskId: r.taskId,
        hoursLogged: hoursByTask[r.taskId],
        notes: notes[r.taskId]?.trim() || undefined,
      })));
      if (res.failedCount === 0) {
        toast(`${res.savedCount} ${res.savedCount === 1 ? 'entry' : 'entries'} logged for ${formatDate(date)}`, 'success');
        onSaved();
        onClose();
        return;
      }
      // Keep the failed lines with their reason and clear the ones that went in, so nobody
      // retypes work that is already saved.
      const failedByTask: Record<string, string> = {};
      res.failed.forEach(f => { const r = filled[f.index]; if (r) failedByTask[r.taskId] = f.message; });
      setFailures(failedByTask);
      setHours(h => Object.fromEntries(Object.entries(h).filter(([id]) => failedByTask[id])));
      setConfirming(false);
      toast(
        res.savedCount === 0
          ? `Nothing could be saved — the reason is on ${res.failedCount === 1 ? 'the line' : 'each line'} below.`
          : `${res.savedCount} saved, ${res.failedCount} could not be — see the lines below.`,
        'error',
      );
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not log the day', 'error');
    } finally { setSaving(false); }
  }

  const Row = ({ r }: { r: PlanRow }) => {
    const w = warnings[r.taskId] ?? [];
    const typed = (hoursByTask[r.taskId] ?? 0) > 0;
    return (
      <div className={clsx('rounded-lg border px-3 py-2.5 transition-colors',
        failures[r.taskId] ? 'border-red-300 bg-red-50/40'
          : w.length ? 'border-amber-300 bg-amber-50/40'
            : typed ? 'border-brand-300 bg-brand-50/30' : 'border-gray-200')}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-gray-900" title={r.title}>{r.title}</p>
            <p className="mt-0.5 truncate text-[11px] text-gray-500">
              {r.projectPid ? `${pidLabel(r.projectPid, r.projectRound)} · ` : ''}{r.project ?? 'No project'}
              {r.plannedHours > 0 && <span className="text-gray-400"> · planned {r.plannedHours}h</span>}
              {r.loggedToday > 0 && <span className="text-gray-400"> · {r.loggedToday}h already logged</span>}
              {r.dueDate && <span className={r.overdue ? 'text-red-500' : 'text-gray-400'}> · {r.overdue ? 'overdue' : 'due'} {formatDate(r.dueDate)}</span>}
            </p>
          </div>
          <div className="relative w-[88px] shrink-0">
            <input
              type="number" min="0" max="24" step="0.25" inputMode="decimal"
              value={hours[r.taskId] ?? ''}
              // A dash, not the planned hours. A number sitting in the box is a number people accept.
              placeholder="—"
              onChange={e => setHours(h => ({ ...h, [r.taskId]: e.target.value }))}
              aria-label={`Hours worked on ${r.title}`}
              className="w-full rounded-lg border border-gray-300 py-2 pl-2.5 pr-6 text-sm tabular-nums focus:border-brand-500 focus:outline-none"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">h</span>
          </div>
        </div>
        {typed && (
          <input
            type="text" value={notes[r.taskId] ?? ''} placeholder="What did you do? (optional)"
            onChange={e => setNotes(n => ({ ...n, [r.taskId]: e.target.value }))}
            className="mt-2 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] text-gray-600 focus:border-brand-500 focus:outline-none"
          />
        )}
        {w.map(x => (
          <p key={x.code} className="mt-1.5 flex items-start gap-1.5 text-[11px] font-medium text-amber-700">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />{x.message}
          </p>
        ))}
        {failures[r.taskId] && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-medium text-red-600">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />{failures[r.taskId]}
          </p>
        )}
      </div>
    );
  };

  const Section = ({ label, list }: { label: string; list: PlanRow[] }) => !list.length ? null : (
    <div className="mb-3">
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <div className="space-y-1.5">{list.map(r => <Row key={r.taskId} r={r} />)}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Clock size={16} className="text-brand-600" /> Log your day
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">Your work is listed — put the hours against what you actually did.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 px-6 py-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
            <input
              type="date" value={date} max={today}
              onChange={e => pickDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
              <span className="font-medium text-gray-600">{date === today ? 'Today' : formatDate(date)}</span>
              <span className={clsx('tabular-nums', overCap ? 'font-semibold text-red-600' : 'text-gray-500')}>
                {dayTotal}h of {target}h
                {alreadyFiled > 0 && <span className="text-gray-400"> · {alreadyFiled}h already filed</span>}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className={clsx('h-full rounded-full transition-all', overCap ? 'bg-red-500' : dayTotal >= target ? 'bg-emerald-500' : 'bg-brand-500')}
                style={{ width: `${Math.min(100, target > 0 ? (dayTotal / target) * 100 : 0)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {isLoading && <p className="py-8 text-center text-sm text-gray-500">Working out what you were on…</p>}
          {isError && <p className="py-8 text-center text-sm text-red-600">Could not load your work for that day.</p>}

          {!isLoading && !isError && (
            <>
              {plan && !plan.hasPlan && (
                <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-500">
                  That day has already passed, so there is no plan for it — all your open work is listed instead.
                </p>
              )}
              <Section label={plan?.hasPlan ? 'Planned for this day' : 'Your open work'} list={groups.TODAY} />
              <Section label="Planned for the next day" list={groups.TOMORROW} />

              {groups.OTHER.length > 0 && (
                <div>
                  <button
                    type="button" onClick={() => setShowOther(v => !v)}
                    className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
                  >
                    <ChevronDown size={12} className={clsx('transition-transform', !showOther && '-rotate-90')} />
                    Anything else ({groups.OTHER.length})
                  </button>
                  {/* Collapsed on purpose. It is everything else they hold, and an open list of it
                      buries the two or three lines that are actually today's. */}
                  {showOther && <div className="space-y-1.5">{groups.OTHER.map(r => <Row key={r.taskId} r={r} />)}</div>}
                </div>
              )}

              {rows.length === 0 && (
                <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-[12.5px] text-gray-500">
                  You have no open work on a live project, so there is nothing to log against yet.
                </p>
              )}
            </>
          )}
        </div>

        <div className="border-t border-gray-100 px-6 py-3">
          {confirming && summary && (
            <p className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{summary} Save anyway if that is right.</span>
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-[12px]">
              {overCap ? (
                <span className="font-medium text-red-600">That is {dayTotal}h — more than the {MAX_HOURS_PER_DAY}h a day can hold.</span>
              ) : (
                <span className="tabular-nums text-gray-500">
                  {filled.length} {filled.length === 1 ? 'task' : 'tasks'} · {r2(entered)}h
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={onClose} className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                onClick={save} disabled={saving || !filled.length || overCap}
                className={clsx('inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50',
                  confirming ? 'bg-amber-600 hover:bg-amber-700' : 'bg-brand-600 hover:bg-brand-700')}
              >
                {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                {confirming ? 'Save anyway' : 'Save the day'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
