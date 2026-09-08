'use client';

// Per-project availability — the Team Capacity board, scoped to this project's members.
//
// The same board, the same colours, the same hover and panel as the full page (it is the same
// component), with two things only a project can add: its own work is pinned so everyone else's
// reads as context, and a summary that answers the question the deadline poses — does what is
// left on this project fit into the hours these people have before it is due?

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Users, Loader, ArrowRight, CalendarRange, Flag, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, type CapacityRow } from '@/lib/api';
import { Board } from '@/components/capacity/Board';
import { LiveStatus } from '@/components/capacity/LiveStatus';
import { PersonPanel } from '@/components/capacity/PersonPanel';
import { projectsOf, holidaysOf } from '@/components/capacity/grid';
import { assignProjectHues, deadlineState } from '@/lib/project-colors';
import { formatDate, todayIST } from '@/lib/date';
import { AddTaskModal } from '@/components/tasks/AddTaskModal';
import { invalidateTaskCaches } from '@/lib/task-cache';

const RANGES = [7, 14, 30] as const;
const POLL_MS = 30_000;

/** Working days from `from` (inclusive) to `to` (inclusive), skipping weekends and the firm's holidays. */
function workingDaysBetween(from: string, to: string, holidays: ReadonlySet<string>): number {
  if (to < from) return 0;
  let n = 0;
  const d = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < 400 && d.toISOString().slice(0, 10) <= to; i++) {
    const k = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(k)) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export function ProjectCapacityTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [days, setDays] = useState<number>(14);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  // Adding work: the add-task flow, pre-assigned to that person on that day.
  const [assign, setAssign] = useState<{ userId: string; date: string } | null>(null);
  // This project starts pinned: its segments at full strength, everything else faded to context.
  const [focusProjectId, setFocusProjectId] = useState<string | null>(projectId);
  const [focusDate, setFocusDate] = useState<string | undefined>();
  const today = todayIST();

  const { data, isLoading, isError, dataUpdatedAt, isFetching, refetch } = useQuery({
    queryKey: ['capacity', 'project', projectId, days],
    queryFn: () => api.capacity.forProject(projectId, days),
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId),
    staleTime: 60_000,
  });
  const defaultTaskList = project?.taskLists?.find(tl => tl.isDefault) ?? project?.taskLists?.[0];
  const rows: CapacityRow[] = useMemo(() => data?.rows ?? [], [data]);
  const hues = useMemo(() => assignProjectHues(projectsOf(rows)), [rows]);
  const holidays = useMemo(() => holidaysOf(rows), [rows]);
  const selected = useMemo(() => rows.find(r => r.userId === selectedUserId) ?? null, [rows, selectedUserId]);

  // Does what is left on this project fit before its deadline, in the hours these people have?
  const summary = useMemo(() => {
    const due = project?.dueDate ? project.dueDate.slice(0, 10) : null;
    const windowEnd = rows[0]?.days[rows[0].days.length - 1]?.date ?? today;
    let remaining = 0, plannedBefore = 0, freeBefore = 0, people = 0, overdueTasks = 0;
    for (const r of rows) {
      const mine = r.openTasks.filter(t => t.projectId === projectId);
      if (mine.length) people++;
      for (const t of mine) { remaining += t.remainingHours; if (t.overdue) overdueTasks++; }
      const mineIds = new Set(mine.map(t => t.id));
      for (const d of r.days) {
        if (d.capacity <= 0 || (due && d.date > due)) continue;
        plannedBefore += (d.tasks ?? []).filter(t => mineIds.has(t.taskId)).reduce((s, t) => s + t.hours, 0);
        freeBefore += d.free;
      }
    }
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const workdays = due ? workingDaysBetween(today, due, holidays) : null;
    const beyondWindow = !!due && due > windowEnd;
    const capacityBefore = plannedBefore + freeBefore; // hours this team can put on it before the deadline, inside the window
    const shortBy = due && !beyondWindow ? Math.max(0, remaining - capacityBefore) : 0;
    return {
      due, state: deadlineState(due, today, holidays), workdays, beyondWindow,
      remaining: r1(remaining), plannedBefore: r1(plannedBefore), freeBefore: r1(freeBefore), capacityBefore: r1(capacityBefore),
      perDay: workdays ? r1(remaining / workdays) : null, shortBy: r1(shortBy), people, overdueTasks,
    };
  }, [rows, project?.dueDate, projectId, today, holidays]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader className="animate-spin mr-2" size={18} /> Loading availability…</div>;
  }
  // capacity.view is required; without it the API returns 403 and this tab simply explains why.
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users size={34} className="text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Availability isn&apos;t visible to you</p>
        <p className="text-sm text-gray-400 mt-1">You need the <code>capacity.view</code> permission to see who is free.</p>
      </div>
    );
  }

  const dueWords = summary.due
    ? summary.state === 'overdue' ? `Overdue since ${formatDate(summary.due)}`
      : summary.state === 'today' ? 'Due today'
        : `Due ${formatDate(summary.due, { weekday: 'short', day: 'numeric', month: 'short' })}`
    : 'No deadline set';
  const verdict = !summary.due
    ? null
    : summary.remaining === 0
      ? { tone: 'ok' as const, text: 'Nothing left on this project.' }
      : summary.state === 'overdue'
        ? { tone: 'bad' as const, text: `${summary.remaining}h still left after the deadline — extend it, or add people.` }
        : summary.beyondWindow
          ? { tone: 'info' as const, text: `${summary.perDay}h a day needed across the team to finish in time; the deadline is past this window.` }
          : summary.shortBy > 0
            ? { tone: 'bad' as const, text: `${summary.shortBy}h short: the team has ${summary.capacityBefore}h for it before the deadline, ${summary.remaining}h is left.` }
            : { tone: 'ok' as const, text: `Fits: ${summary.remaining}h left, ${summary.capacityBefore}h available for it before the deadline.` };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          When each member of this project is free — across <span className="font-medium text-gray-700">all</span> their projects,
          so you can see who has real room for more of this one. This project&apos;s work is pinned; the rest is faded.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <LiveStatus updatedAt={dataUpdatedAt} isFetching={isFetching} onRefresh={() => refetch()} intervalMs={POLL_MS} />
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className={clsx('px-3 py-1.5 text-xs font-medium', days === r ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-50')}
              >
                {r}d
              </button>
            ))}
          </div>
          <Link href="/capacity" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            Full board <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {rows.length > 0 && (
        // The deadline against the hours: what is left, what the team can give it before then.
        <div className={clsx('rounded-xl border px-4 py-3 text-sm',
          verdict?.tone === 'bad' ? 'border-gray-900/20 bg-gray-50' : verdict?.tone === 'ok' ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-200 bg-white')}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span className={clsx('inline-flex items-center gap-1.5 font-medium', summary.state === 'overdue' || summary.state === 'today' ? 'text-red-700' : summary.state === 'soon' ? 'text-amber-700' : 'text-gray-800')}>
              <Flag size={14} /> {dueWords}
              {summary.workdays != null && summary.state !== 'overdue' && <span className="font-normal text-gray-500"> · {summary.workdays} working {summary.workdays === 1 ? 'day' : 'days'} left</span>}
            </span>
            <span className="text-gray-700 tabular-nums"><span className="font-semibold text-gray-900">{summary.remaining}h</span> left on this project across {summary.people} {summary.people === 1 ? 'person' : 'people'}</span>
            {summary.due && summary.remaining > 0 && summary.perDay != null && (
              <span className="text-gray-700 tabular-nums"><span className="font-semibold text-gray-900">{summary.perDay}h</span> a day needed to finish in time</span>
            )}
            {summary.due && !summary.beyondWindow && (
              <span className="text-gray-700 tabular-nums" title={`${summary.plannedBefore}h of it already placed on days before the deadline, plus ${summary.freeBefore}h free on those days`}>
                <span className="font-semibold text-gray-900">{summary.capacityBefore}h</span> the team can give it before then
              </span>
            )}
            {summary.overdueTasks > 0 && <span className="text-red-700">{summary.overdueTasks} overdue {summary.overdueTasks === 1 ? 'task' : 'tasks'}</span>}
          </div>
          {verdict && (
            <p className={clsx('mt-1.5 inline-flex items-center gap-1.5 text-[12.5px]', verdict.tone === 'bad' ? 'font-medium text-gray-900' : verdict.tone === 'ok' ? 'text-emerald-800' : 'text-gray-600')}>
              {verdict.tone === 'bad' ? <AlertTriangle size={13} /> : verdict.tone === 'ok' ? <CheckCircle2 size={13} /> : null}
              {verdict.text}
            </p>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center text-gray-400">
          <CalendarRange size={30} className="mb-2" />
          This project has no active members yet.
        </div>
      ) : (
        <Board
          allRows={rows}
          groups={[{ key: 'all', rows }]}
          days={days}
          focusProjectId={focusProjectId}
          onFocus={setFocusProjectId}
          defaultPinnedProjectId={projectId}
          highlightProjectId={projectId}
          onSelectPerson={(userId, date) => { setFocusDate(date); setSelectedUserId(userId); }}
          onAssign={row => setAssign({ userId: row.userId, date: row.nextFreeDate ?? today })}
          emptyText="This project has no active members yet."
          hoverSuppressed={!!selected || !!assign}
        />
      )}

      {/* Click a member to see what they're working on — same drill-down as the full board. */}
      {selected && (
        <PersonPanel
          row={selected} hues={hues} holidays={holidays} today={today} focusDate={focusDate}
          onClose={() => { setSelectedUserId(null); setFocusDate(undefined); }}
          onAssign={() => { const r = selected; setSelectedUserId(null); setFocusDate(undefined); setAssign({ userId: r.userId, date: focusDate ?? r.nextFreeDate ?? today }); }}
        />
      )}

      {/* Add a task into THIS project, pre-assigned to that person + day. */}
      {assign && defaultTaskList && (
        <AddTaskModal
          projectId={projectId}
          taskListId={defaultTaskList.id}
          workflowId={project?.workflowId}
          initialAssigneeIds={[assign.userId]}
          initialStartDate={assign.date}
          initialDueDate={assign.date}
          onClose={() => setAssign(null)}
          // A new task moves this board, the full board, the task lists and the project's progress.
          onSuccess={() => { setAssign(null); invalidateTaskCaches(qc); }}
        />
      )}
    </div>
  );
}
