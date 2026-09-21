'use client';

// Task CRUD from the capacity board — for holders of capacity.manage (Senior Consultant and up).
//
// One editor for every way in: "New task" in the board's header, the "+" at the end of a person's
// row, "Assign a task to …" in the person panel, and Edit / Reassign / Delete on any task shown for
// a person (the panel's list and the hover card). It talks only to /capacity/tasks, so:
//
//   · a new task and its people are ONE call — a refused seat leaves nothing behind (the board used
//     to create the task and then staff it, and a failed second call left an orphan task);
//   · the people offered are everyone active in the organisation, not a client's members — the
//     server adds whoever is not on the client yet, and says so to them;
//   · every rule is the server's (a task is never due after its group, one PM, …) and its refusal
//     is shown in the editor, in its words.
//
// useCapacityTaskActions() owns the dialogs and the refresh, so the full board and a client's
// Capacity tab behave identically. Without capacity.manage it returns no actions and the board is
// read-only.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader, Trash2, AlertTriangle } from 'lucide-react';
import {
  api, type ApiTask, type CapacityOpenTask, type CapacityTaskOptions, type TaskRole,
} from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { DateField } from '@/components/ui/DateField';
import { formatDate } from '@/lib/date';
import { cidLabel } from '@/lib/mock-data';
import { invalidateTimesheetCaches } from '@/lib/timesheet-cache';
import { AssignmentImpact, ImpactLegend, useAssignmentPreview, useOverrideGate } from './AssignmentImpact';
import {
  Field, INPUT, SeatList, buildSeats, day, mergeProposed, newSeatKey, seatSig, seatsToProposed,
  type SeatRow,
} from './SeatList';

// ── what opens the editor ───────────────────────────────────────────────────────────────────

export type EditorTarget =
  | {
      mode: 'create';
      /** Assign to this person from the start (the row's "+", the panel's button). */
      person?: { userId: string; name: string };
      /** The day that was clicked — the task's and the seat's start. */
      start?: string;
      /** Pin the client (a client's own Capacity tab). */
      projectId?: string;
    }
  | {
      mode: 'edit';
      taskId: string;
      /** Reassign: open on the people, with this person's seat picked out. */
      reassignFrom?: string;
    };

/** The three things a board may do to a task it shows. Absent = read-only board. */
export type TaskActions = {
  edit: (task: Pick<CapacityOpenTask, 'id'>) => void;
  reassign: (task: Pick<CapacityOpenTask, 'id'>, fromUserId?: string) => void;
  remove: (task: Pick<CapacityOpenTask, 'id' | 'title'>) => void;
  create: (target?: Omit<Extract<EditorTarget, { mode: 'create' }>, 'mode'>) => void;
};

/**
 * The editor, the delete confirmation and the refresh, as one hook. `null` actions when the viewer
 * lacks capacity.manage — every control that would open these is then simply not drawn.
 */
export function useCapacityTaskActions(opts: { projectId?: string } = {}): { actions: TaskActions | null; dialogs: ReactNode } {
  const { can } = usePermissions();
  const allowed = can('capacity.manage');
  const qc = useQueryClient();
  const { toast } = useToast();
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);

  /** Everything that draws a task, its hours or its people — the board included. */
  const refresh = () => {
    invalidateTimesheetCaches(qc); // task caches, capacity, coverage, timesheets, performance
    qc.invalidateQueries({ queryKey: ['capacity-task'] });
    qc.invalidateQueries({ queryKey: ['capacity-task-options'] });
    qc.invalidateQueries({ queryKey: ['project-members'] });
  };

  const actions = useMemo<TaskActions | null>(() => allowed ? {
    edit: t => setTarget({ mode: 'edit', taskId: t.id }),
    reassign: (t, fromUserId) => setTarget({ mode: 'edit', taskId: t.id, reassignFrom: fromUserId }),
    remove: t => setDeleting({ id: t.id, title: t.title }),
    create: (t = {}) => setTarget({ mode: 'create', projectId: opts.projectId, ...t }),
  } : null, [allowed, opts.projectId]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.capacity.deleteTask(deleting.id);
      refresh();
      toast(`Deleted “${deleting.title}”`, 'success');
      setDeleting(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete the task', 'error');
    } finally { setBusy(false); }
  }

  const dialogs = allowed ? (
    <>
      {target && (
        <TaskEditor
          key={target.mode === 'edit' ? target.taskId : 'new'}
          target={target}
          onClose={() => setTarget(null)}
          onSaved={said => { refresh(); toast(said, 'success'); setTarget(null); }}
          onDelete={t => { setTarget(null); setDeleting(t); }}
        />
      )}
      {deleting && (
        <Modal
          title="Delete this task?"
          size="sm"
          onClose={() => { if (!busy) setDeleting(null); }}
          footer={(
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(null)} disabled={busy}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Keep it</button>
              <button type="button" onClick={confirmDelete} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                {busy ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
              </button>
            </div>
          )}
        >
          <p className="text-sm text-gray-700">
            <span className="font-medium text-gray-900">“{deleting.title}”</span> leaves the board, its client’s task
            list and everybody’s plan. Anyone assigned to it stops seeing it in My Tasks.
          </p>
        </Modal>
      )}
    </>
  ) : null;

  return { actions, dialogs };
}

// ── the editor ──────────────────────────────────────────────────────────────────────────────

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function seatsOf(task: ApiTask): SeatRow[] {
  return (task.assignees ?? []).map(a => ({
    key: newSeatKey(), userId: a.userId, role: (a.role ?? 'ANALYST') as TaskRole,
    hours: a.estimatedHours != null ? String(a.estimatedHours) : '',
    start: day(a.startDate), due: day(a.dueDate),
    perDay: a.hoursPerDay != null ? String(a.hoursPerDay) : '',
  }));
}

function TaskEditor({ target, onClose, onSaved, onDelete }: {
  target: EditorTarget;
  onClose: () => void;
  onSaved: (said: string) => void;
  onDelete: (t: { id: string; title: string }) => void;
}) {
  const isEdit = target.mode === 'edit';
  const { data: options, isLoading: optionsLoading, isError: optionsError } = useQuery<CapacityTaskOptions>({
    queryKey: ['capacity-task-options'],
    queryFn: () => api.capacity.taskOptions(),
    staleTime: 60_000,
  });
  const { data: task, isLoading: taskLoading, isError: taskError } = useQuery<ApiTask>({
    queryKey: ['capacity-task', isEdit ? target.taskId : ''],
    queryFn: () => api.capacity.getTask((target as Extract<EditorTarget, { mode: 'edit' }>).taskId),
    enabled: isEdit,
    staleTime: 0,
  });

  const [projectId, setProjectId] = useState(target.mode === 'create' ? (target.projectId ?? '') : '');
  const [groupId, setGroupId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [start, setStart] = useState(target.mode === 'create' ? (target.start ?? '') : '');
  const [due, setDue] = useState('');
  const [estimate, setEstimate] = useState('');
  const [seats, setSeats] = useState<SeatRow[]>(() => target.mode === 'create' && target.person
    ? [{ key: newSeatKey(), userId: target.person.userId, role: 'ANALYST', hours: '', start: target.start ?? '', due: '', perDay: '' }]
    : []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const seatsRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(!isEdit);

  // Edit: fill the form once, from the task as the server has it.
  useEffect(() => {
    if (!isEdit || !task || loaded) return;
    const link = task.projectTasks?.[0];
    setProjectId(link?.projectId ?? '');
    setGroupId(link?.taskListId ?? '');
    setTitle(task.title);
    setDescription(task.description ?? '');
    setPriority(task.priority ?? 'MEDIUM');
    setStart(day(task.startDate));
    setDue(day(task.dueDate));
    setEstimate(task.estimatedHours != null ? String(task.estimatedHours) : '');
    setSeats(seatsOf(task));
    setLoaded(true);
  }, [isEdit, task, loaded]);

  // Reassign: bring the people into view with the named person's seat focused.
  const reassignFrom = target.mode === 'edit' ? target.reassignFrom : undefined;
  useEffect(() => {
    if (!loaded || target.mode !== 'edit') return;
    const el = seatsRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    const pick = reassignFrom
      ? el.querySelector<HTMLSelectElement>(`select[data-seat-user="${reassignFrom}"]`)
      : null;
    pick?.focus();
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const clients = options?.clients ?? [];
  const people = options?.people ?? [];
  const client = clients.find(c => c.id === projectId);
  // A new task goes into a group that still takes work; an existing one may also stay where it is.
  const groups = (client?.taskLists ?? []).filter(g => g.status === 'ACTIVE' || g.id === groupId);
  // Until one is picked: the default group when it is open, else the first open one.
  useEffect(() => {
    if (!client || (groupId && client.taskLists.some(g => g.id === groupId))) return;
    const open = client.taskLists.filter(g => g.status === 'ACTIVE');
    setGroupId((open.find(g => g.isDefault) ?? open[0])?.id ?? '');
  }, [client, groupId]);
  const group = client?.taskLists.find(g => g.id === groupId);
  const groupDue = day(group?.dueDate);
  const dueAfterGroup = !!groupDue && !!due && due > groupDue;
  const clientGone = isEdit && loaded && !!projectId && !!options && !client;

  // Once any person carries hours, the task's estimate IS their sum (the server sets it so). Until
  // then the task keeps an estimate of its own, which the board splits evenly between its people.
  const seatHours = seats.filter(s => s.userId).reduce((n, s) => n + (Number(s.hours) || 0), 0);

  const nameOf = (id: string) => {
    const p = people.find(x => x.id === id);
    return p ? `${p.firstName} ${p.lastName}`.trim() : 'someone';
  };

  // The whole point of opening this editor from a day that looked free: say whether it IS free.
  // A seat with no dates of its own inherits the task's, because that is what the server does
  // with it — otherwise the check would be about a different fortnight from the one being saved.
  const proposed = useMemo(() => {
    const list = mergeProposed(seatsToProposed(seats, { start, due }));
    // Nobody carries hours yet: the task's own estimate is what the board will split between them,
    // so check THAT rather than reporting that nothing is being asked of anyone.
    const named = list.length;
    if (named > 0 && list.every(s => !s.hours)) {
      const est = Number(seatHours > 0 ? seatHours : estimate);
      if (Number.isFinite(est) && est > 0) for (const s of list) s.hours = est / named;
    }
    return list;
  }, [seats, start, due, estimate, seatHours]);
  const impact = useAssignmentPreview(proposed, {
    projectId: projectId || null,
    excludeTaskId: target.mode === 'edit' ? target.taskId : null,
    enabled: !clientGone && loaded,
  });
  const gate = useOverrideGate(impact.over, impact.seats.map(s => `${s.userId}:${s.overHours}`).join('|'));

  async function save() {
    setError('');
    if (!title.trim()) { setError('Give the task a title.'); return; }
    if (!projectId) { setError('Pick a client.'); return; }
    if (start && due && start > due) { setError('The task cannot be due before it starts.'); return; }
    if (dueAfterGroup) { setError(`“${group?.name}” is due ${formatDate(groupDue)}, so the task cannot be due later. Move the task group's deadline first.`); return; }
    const built = buildSeats(seats);
    if (typeof built === 'string') { setError(built); return; }
    setSaving(true);
    try {
      if (target.mode === 'create') {
        const created = await api.capacity.createTask({
          projectId, taskListId: groupId || undefined, title: title.trim(),
          description: description.trim() || undefined, priority,
          startDate: start || null, dueDate: due || null, seats: built,
        });
        const names = [...new Set(built.map(s => nameOf(s.userId).split(' ')[0]))];
        onSaved(`Created “${created.title}”${names.length ? ` — assigned to ${names.join(', ')}` : ''}`);
        return;
      }
      if (!task) return;
      const patch: Parameters<typeof api.capacity.updateTask>[1] = {};
      if (title.trim() !== task.title) patch.title = title.trim();
      if (description !== (task.description ?? '')) patch.description = description;
      if (priority !== task.priority) patch.priority = priority;
      if (start !== day(task.startDate)) patch.startDate = start || null;
      if (due !== day(task.dueDate)) patch.dueDate = due || null;
      if (groupId && groupId !== task.projectTasks?.[0]?.taskListId) patch.taskListId = groupId;
      const before = buildSeats(seatsOf(task));
      const seatsChanged = typeof before === 'string' || seatSig(before) !== seatSig(built);
      // Saving seats sets the estimate to the sum of their hours. When nobody carries hours, the
      // task's own estimate is what the board splits between them — so it is (re)sent AFTER the
      // seats, or re-saving the people would silently zero it.
      let estimateToSend: number | undefined;
      if (seatHours === 0 && estimate.trim() !== '') {
        const n = Number(estimate);
        if (!Number.isFinite(n) || n < 0) { setError('The estimate cannot be negative.'); setSaving(false); return; }
        if (n !== (task.estimatedHours ?? 0) || seatsChanged) estimateToSend = n;
      }
      if (Object.keys(patch).length) await api.capacity.updateTask(task.id, patch);
      if (seatsChanged) await api.capacity.setSeats(task.id, built);
      if (estimateToSend !== undefined) await api.capacity.updateTask(task.id, { estimatedHours: estimateToSend });
      const changed = Object.keys(patch).length > 0 || seatsChanged || estimateToSend !== undefined;
      onSaved(changed ? `Saved “${title.trim()}”` : 'Nothing to change');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the task');
    } finally {
      setSaving(false);
    }
  }

  const loading = optionsLoading || (isEdit && (taskLoading || !loaded));
  const failed = optionsError || (isEdit && taskError);
  const heading = target.mode === 'edit' ? 'Edit task' : target.person ? `New task for ${target.person.name.split(' ')[0]}` : 'New task';

  return (
    <Modal
      title={heading}
      subtitle={isEdit
        ? 'Change anything, move it between the client’s task groups, or give it to someone else.'
        : 'Any client, any task group, anyone in the organisation — people who are not on the client are added to it.'}
      size="xl"
      onClose={onClose}
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {isEdit && task && (
              <button type="button" onClick={() => onDelete({ id: task.id, title: task.title })} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
            <button type="button" onClick={save} disabled={saving || loading || !!failed || clientGone || !gate.allowed}
              title={gate.allowed ? undefined : 'This puts somebody past their working day — tick the box in the panel to do it anyway.'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {saving && <Loader size={14} className="animate-spin" />}
              {isEdit ? 'Save' : 'Create task'}
            </button>
          </div>
        </div>
      )}
    >
      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-gray-400"><Loader size={16} className="mr-2 animate-spin" /> Loading…</div>
      ) : failed ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">This task could not be loaded — it may have been deleted.</p>
      ) : (
        <div className="space-y-4">
          {clientGone && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This task’s client is completed or closed, so its work cannot be changed until it is reopened.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client">
              {isEdit ? (
                <p className="truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700" title="A task stays with its client; move it between that client's task groups instead">
                  {client ? `${client.code ? `${cidLabel(client.code, client.roundSeq)} · ` : ''}${client.title}` : '—'}
                </p>
              ) : (
                <select autoFocus value={projectId} onChange={e => { setProjectId(e.target.value); setGroupId(''); }} className={INPUT}>
                  <option value="">Select a client…</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.code ? `${cidLabel(c.code, c.roundSeq)} · ` : ''}{c.title}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Task group" hint={groupDue ? `due ${formatDate(groupDue)}` : undefined}>
              <select value={groupId} onChange={e => setGroupId(e.target.value)} disabled={!client || !groups.length} className={INPUT}>
                {!groups.length && <option value="">{client ? 'No open task group' : '—'}</option>}
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}{g.isDefault ? ' (default)' : ''}{g.status === 'COMPLETED' ? ' (complete)' : ''}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Title">
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Prior-art search" className={INPUT} />
          </Field>
          <Field label="Description" hint="optional">
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={5000} className={clsx(INPUT, 'resize-y')} />
          </Field>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Priority">
              <select value={priority} onChange={e => setPriority(e.target.value)} className={INPUT}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
              </select>
            </Field>
            <Field label="Starts">
              <DateField type="date" value={start} max={due || undefined} onChange={e => setStart(e.target.value)} className={INPUT} />
            </Field>
            <Field label="Due" hint={!due && groupDue ? 'takes the group’s' : undefined}>
              <DateField type="date" value={due} min={start || undefined} max={groupDue || undefined} onChange={e => setDue(e.target.value)}
                className={clsx(INPUT, dueAfterGroup && 'border-rose-400')} />
            </Field>
            {isEdit && (
              <Field label="Estimate (h)" hint={seatHours > 0 ? 'sum of people' : undefined}>
                <input type="number" min={0} step={0.5} value={seatHours > 0 ? String(seatHours) : estimate}
                  disabled={seatHours > 0} onChange={e => setEstimate(e.target.value)} className={INPUT} />
              </Field>
            )}
          </div>
          {dueAfterGroup && (
            <p className="flex items-center gap-1.5 text-xs text-rose-700">
              <AlertTriangle size={12} /> “{group?.name}” is due {formatDate(groupDue)} — a task in it cannot be due later.
            </p>
          )}

          <SeatList
            containerRef={seatsRef}
            rows={seats}
            people={people}
            onChange={setSeats}
            defaultStart={start}
            highlightUserId={reassignFrom}
          />

          {/* Free on this client is not free. Every other matter they are on is in here too. */}
          {(impact.isLoading || impact.seats.length > 0) && (
            <div>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-gray-800">Do they have the hours?</p>
                <ImpactLegend />
              </div>
              <AssignmentImpact state={impact} compact />
              {gate.node}
            </div>
          )}

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
