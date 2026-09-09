'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Clock, Loader, Plus, X, AlertTriangle, Check } from 'lucide-react';
import { api, type ApiTask, type DayStatus } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { todayIST, formatDate } from '@/lib/date';
import { pidLabel } from '@/lib/mock-data';

/** Nobody may book more than this against one calendar day — the server's rule, said here first. */
const MAX_HOURS_PER_DAY = 16;

type Line = { key: string; taskId: string; hours: string; notes: string };

const newLine = (): Line => ({ key: Math.random().toString(36).slice(2), taskId: '', hours: '', notes: '' });
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * Fill in a day — the manual flow's only way of recording time.
 *
 * One dialog for the whole day rather than a Log time button on every task row. That is the point
 * of the flow: a person remembers their day as "three hours on the search, two on the report", not
 * as a series of visits to individual task rows, and asking them to open five dialogs to say one
 * thing is how timesheets end up filled in on Friday for a week nobody remembers.
 *
 * The hard rules live on the server — the day cap, the backdating windows, needing a seat on the
 * task, a matter still being open. What is repeated here is only what makes the form answerable
 * before it is submitted; anything else it would be guessing at.
 */
export function DaySheet({ tasks, onClose, onSaved }: {
  tasks: ApiTask[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const today = todayIST();
  const [date, setDate] = useState(today);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [failures, setFailures] = useState<Record<number, string>>({});

  // What today already owes and holds. Only meaningful for today — the endpoint is about the
  // current day — so on a backdated sheet the target is simply not shown rather than shown wrong.
  const { data: day } = useQuery<DayStatus>({
    queryKey: ['timer-today'],
    queryFn: () => api.tasks.today(),
    staleTime: 30_000,
  });
  const isToday = date === today;

  /**
   * Tasks that can actually take time: still open, and on a matter that is still open. The ledger
   * refuses a completed or closed project, so offering one here would only produce a failure
   * after the save.
   */
  const options = useMemo(() => {
    const live = tasks.filter(t => {
      const closed = t.currentStatus?.type === 'CLOSED';
      const phase = t.projectTasks?.[0]?.project?.projectPhase;
      return !closed && phase !== 'COMPLETED' && phase !== 'CLOSED';
    });
    const byProject = new Map<string, { label: string; tasks: ApiTask[] }>();
    for (const t of live) {
      const p = t.projectTasks?.[0]?.project;
      const id = p?.id ?? '—';
      const label = p ? `${p.code ? `${pidLabel(p.code, p.roundSeq)} · ` : ''}${p.title}` : 'No project';
      if (!byProject.has(id)) byProject.set(id, { label, tasks: [] });
      byProject.get(id)!.tasks.push(t);
    }
    return [...byProject.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks]);

  const entered = lines.reduce((s, l) => s + num(l.hours), 0);
  const alreadyFiled = day?.logged ?? 0;
  const dayTotal = isToday ? alreadyFiled + entered : entered;
  const overCap = dayTotal > MAX_HOURS_PER_DAY;
  const target = day?.target ?? 8;
  const usable = lines.filter(l => l.taskId && num(l.hours) > 0);
  const duplicateTask = new Set(usable.map(l => l.taskId)).size !== usable.length;

  const set = (key: string, patch: Partial<Line>) =>
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));

  /** Spread whatever is left of the day's target across the lines that have a task but no hours. */
  function fillRemaining() {
    const blanks = lines.filter(l => l.taskId && num(l.hours) === 0);
    if (!blanks.length) return;
    const left = Math.max(0, target - alreadyFiled - entered);
    if (left <= 0) return;
    // Quarter-hours, because that is the unit the rest of the product records time in.
    const each = Math.max(0.25, Math.round((left / blanks.length) * 4) / 4);
    setLines(ls => ls.map(l => (blanks.some(b => b.key === l.key) ? { ...l, hours: String(each) } : l)));
  }

  async function save() {
    if (!usable.length) { toast('Choose a task and enter some hours first.', 'error'); return; }
    setSaving(true);
    setFailures({});
    try {
      const res = await api.timesheets.createDay(date, usable.map(l => ({
        taskId: l.taskId, hoursLogged: num(l.hours), notes: l.notes.trim() || undefined,
      })));
      if (res.failedCount === 0) {
        toast(`${res.savedCount} ${res.savedCount === 1 ? 'entry' : 'entries'} logged for ${formatDate(date)}`, 'success');
        onSaved();
        onClose();
        return;
      }
      // Partial: keep the failed lines on the form with their reason, and drop the ones that went
      // in. Clearing the whole sheet would make somebody retype work that is already saved.
      const failedIdx = new Set(res.failed.map(f => f.index));
      setFailures(Object.fromEntries(res.failed.map(f => [f.index, f.message])));
      setLines(usable.filter((_, i) => failedIdx.has(i)));
      toast(
        res.savedCount === 0
          // Everything bounced — usually the day is already full. "0 saved" is a true sentence
          // that reads like a bug; say what happened instead.
          ? `Nothing could be saved — the reason is on ${res.failedCount === 1 ? 'the line' : 'each line'} below.`
          : `${res.savedCount} saved, ${res.failedCount} could not be — see the lines below.`,
        'error',
      );
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not log the day', 'error');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Clock size={16} className="text-brand-600" /> Log your day
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">Pick what you worked on and how long it took. One save for the whole day.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="flex items-end gap-3 border-b border-gray-100 px-6 py-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
            <input
              type="date" value={date} max={today}
              onChange={e => setDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          {isToday && (
            <div className="min-w-0 flex-1">
              {/* Wraps rather than colliding: on a phone the label and the figures have no room
                  to sit on one line, and "Today11.5h of 8h" is not a sentence. */}
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                <span className="font-medium text-gray-600">Today</span>
                <span className={clsx('tabular-nums', overCap ? 'font-semibold text-red-600' : 'text-gray-500')}>
                  {Math.round(dayTotal * 100) / 100}h of {target}h
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
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={l.key}>
                <div className="flex items-start gap-2">
                  <select
                    value={l.taskId}
                    onChange={e => set(l.key, { taskId: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">Which task?</option>
                    {options.map(g => (
                      <optgroup key={g.label} label={g.label}>
                        {g.tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <div className="relative w-24 shrink-0">
                    <input
                      type="number" min="0" max="24" step="0.25" value={l.hours} placeholder="0"
                      onChange={e => set(l.key, { hours: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 py-2 pl-2.5 pr-6 text-sm tabular-nums focus:border-brand-500 focus:outline-none"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">h</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLines(ls => (ls.length > 1 ? ls.filter(x => x.key !== l.key) : [newLine()]))}
                    className="shrink-0 rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    aria-label="Remove line"
                  ><X size={14} /></button>
                </div>
                <input
                  type="text" value={l.notes} placeholder="What did you do? (optional)"
                  onChange={e => set(l.key, { notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] text-gray-600 focus:border-brand-500 focus:outline-none"
                />
                {failures[i] && (
                  <p className="mt-1 flex items-start gap-1.5 text-[11.5px] font-medium text-red-600">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {failures[i]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button" onClick={() => setLines(ls => [...ls, newLine()])}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-brand-600 hover:bg-brand-50"
            ><Plus size={13} /> Add another task</button>
            {isToday && (
              <button
                type="button" onClick={fillRemaining}
                disabled={!lines.some(l => l.taskId && num(l.hours) === 0) || alreadyFiled + entered >= target}
                className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                title="Split what is left of the day evenly across the tasks with no hours yet"
              >Split the rest evenly</button>
            )}
          </div>

          {options.length === 0 && (
            <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5 text-[12.5px] text-gray-500">
              You have no open tasks on a live project, so there is nothing to log against yet.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-3">
          <div className="min-w-0 text-[12px]">
            {overCap ? (
              <span className="font-medium text-red-600">
                That is {Math.round(dayTotal * 100) / 100}h — more than the {MAX_HOURS_PER_DAY}h a day can hold.
              </span>
            ) : duplicateTask ? (
              <span className="text-gray-500">The same task twice is fine — two sittings on one day.</span>
            ) : (
              <span className="tabular-nums text-gray-500">
                {usable.length} {usable.length === 1 ? 'line' : 'lines'} · {Math.round(entered * 100) / 100}h
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              onClick={save} disabled={saving || !usable.length || overCap}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Save the day
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
