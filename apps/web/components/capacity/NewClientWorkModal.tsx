'use client';

/**
 * Start a WHOLE piece of client work from the Team Capacity board.
 *
 * The board could already create one task on a client that exists. The owner wanted the other
 * half: "create a new client and its task groups and tasks, and then assigning the tasks to the
 * team, also the working hours of the team — like the whole team per task — and other stuff must
 * not collide, everything should be well structured."
 *
 * So it is one dialog in three answerable steps, and each step asks what that step is about:
 *
 *   1. Client — who it is, the group it is filed under, who runs it. Its CID is issued
 *      automatically, exactly as it is on the Clients page; there is nothing to fill in for it.
 *   2. Work — its task groups (what kind of work, in what field, by when) and the tasks inside
 *      them, each with the people on it, their hours, their start and their hours a day.
 *   3. Hours — what all of that does to every person's week, across every client, before it is
 *      real; and, if it puts somebody past their working day, the tick that says so on purpose.
 *
 * The questions and the fields are the ones already in the product — "New client" asks 1 and
 * TaskGroupModal asks the group half of 2, in these words. The seat rows are literally the board's
 * own (SeatList), and "do they have the hours?" is literally the board's own panel
 * (AssignmentImpact), fed by the same POST /capacity/availability/preview. Nothing here invents a
 * second way to say any of it.
 *
 * ONE call saves it: POST /capacity/clients. A refused seat or a date the server will not take
 * leaves no client behind at all — see apps/api/src/modules/capacity/capacity-client-setup.ts.
 */

import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Building2, ChevronDown, ChevronRight, Gauge, KeyRound, Layers, Loader, Lock,
  Plus, Trash2, X,
} from 'lucide-react';
import {
  api, type CapacityNewClientGroup, type CapacityNewClientInput, type CapacityTaskOptions,
  type ProjectTypeDef,
} from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useAuth } from '@/lib/auth-context';
import { useOrg } from '@/lib/org-context';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { DateField } from '@/components/ui/DateField';
import { fullName } from '@/lib/avatar';
import { formatDate, fmtHours } from '@/lib/date';
import { invalidateTimesheetCaches } from '@/lib/timesheet-cache';
import { ClientGroupPicker } from '@/components/projects/ClientGroups';
import { TechnologyDomainPicker, domainPayload } from '@/components/projects/TechnologyDomainPicker';
import { AssignmentImpact, ImpactLegend, useAssignmentPreview, useOverrideGate } from './AssignmentImpact';
import {
  Field, INPUT, SMALL, SeatList, buildSeats, mergeProposed, seatsToProposed, type SeatRow,
} from './SeatList';

const CUSTOM_TYPE = '__custom__';
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

let draftKey = 0;
const nextKey = () => `d${++draftKey}`;

type TaskDraft = {
  key: string;
  title: string;
  start: string;
  due: string;
  priority: string;
  seats: SeatRow[];
  open: boolean;
};

type GroupDraft = {
  key: string;
  name: string;
  nameTouched: boolean;
  groupType: string;
  customLabel: string;
  saveTemplate: boolean;
  techDomain: string;
  customDomainLabel: string;
  saveDomain: boolean;
  start: string;
  due: string;
  clientDue: string;
  description: string;
  tasks: TaskDraft[];
  /** Somebody has edited the task list, so changing the type stops rewriting it under them. */
  tasksTouched: boolean;
  open: boolean;
};

const newTask = (title = '', start = ''): TaskDraft =>
  ({ key: nextKey(), title, start, due: '', priority: 'MEDIUM', seats: [], open: !title });

const newGroup = (): GroupDraft => ({
  key: nextKey(), name: '', nameTouched: false, groupType: '', customLabel: '', saveTemplate: false,
  techDomain: '', customDomainLabel: '', saveDomain: false, start: '', due: '', clientDue: '',
  description: '', tasks: [], tasksTouched: false, open: true,
});

const STEPS = ['Client', 'Work', 'Hours'] as const;

/**
 * The dialog. `onCreated` is handed the new client so the board can offer to open it.
 */
export function NewClientWorkModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated?: (clientId: string) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();
  const { user } = useAuth();
  const { org } = useOrg();
  const canSetClientDue = can('deadline.view.client');

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── 1. The client ──────────────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientGroupId, setClientGroupId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');

  // ── 2. Its work ────────────────────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<GroupDraft[]>(() => [newGroup()]);

  const { data: options } = useQuery<CapacityTaskOptions>({
    queryKey: ['capacity-task-options'],
    queryFn: () => api.capacity.taskOptions(),
    staleTime: 60_000,
  });
  const people = options?.people ?? [];

  const { data: types = [] } = useQuery<ProjectTypeDef[]>({
    queryKey: ['project-types'], queryFn: () => api.projects.types(), staleTime: 5 * 60_000,
  });
  const { data: managerData } = useQuery({
    queryKey: ['eligible-managers', org?.id],
    queryFn: () => api.projects.eligibleManagers(),
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
  });
  const managerOptions = (managerData?.managers ?? []).filter(u => !u.isSelf);

  const setGroup = (key: string, patch: Partial<GroupDraft>) =>
    setGroups(gs => gs.map(g => (g.key === key ? { ...g, ...patch } : g)));
  const setTask = (gKey: string, tKey: string, patch: Partial<TaskDraft>) => {
    // Folding a task open to look at its people is not editing it: only a change to what the task
    // IS counts, or picking a type of work would stop filling the list in the moment anybody
    // opened a row to read it.
    const edited = Object.keys(patch).some(k => k !== 'open');
    setGroups(gs => gs.map(g => (g.key === gKey
      ? { ...g, tasksTouched: g.tasksTouched || edited, tasks: g.tasks.map(t => (t.key === tKey ? { ...t, ...patch } : t)) }
      : g)));
  };

  /**
   * Picking a type of work names the group and fills in its standard tasks — the titles somebody
   * would otherwise retype, ready to be staffed, renamed or removed. It stops doing that the
   * moment the list has been touched, so a change of type never deletes typed work.
   */
  function pickType(g: GroupDraft, value: string) {
    const type = types.find(t => t.value === value);
    const standard = value === CUSTOM_TYPE ? [] : (type?.tasks ?? []);
    setGroup(g.key, {
      groupType: value,
      name: g.nameTouched ? g.name : (value === CUSTOM_TYPE ? g.customLabel.trim() : (type?.label ?? '')),
      ...(g.tasksTouched ? {} : { tasks: standard.map(t => newTask(t, g.start)) }),
    });
  }

  // ── 3. Do they have the hours? ─────────────────────────────────────────────────────────
  //
  // Every seat of every task of every group, as ONE proposal per person: somebody on three of
  // these tasks is carrying all three, and asking about each separately would report each one
  // fitting into the same free hours. The client does not exist yet, so nothing here is "this
  // client's" — every hour the preview finds is genuinely other work.
  const proposed = useMemo(
    () => mergeProposed(groups.flatMap(g => g.tasks.flatMap(t =>
      seatsToProposed(t.seats, { start: t.start || g.start, due: t.due || g.due })))),
    [groups],
  );
  const impact = useAssignmentPreview(proposed, { projectId: null, enabled: true });
  const gate = useOverrideGate(impact.over, impact.seats.map(s => `${s.userId}:${s.overHours}`).join('|'));

  const totals = useMemo(() => {
    const taskCount = groups.reduce((n, g) => n + g.tasks.length, 0);
    const seatCount = groups.reduce((n, g) => n + g.tasks.reduce((m, t) => m + t.seats.filter(s => s.userId).length, 0), 0);
    const hours = proposed.reduce((n, s) => n + (s.hours ?? 0), 0);
    return { taskCount, seatCount, hours, peopleCount: proposed.length };
  }, [groups, proposed]);

  // ── what each step will not let through ────────────────────────────────────────────────
  function problemWith(index: number): string {
    if (index === 0) return title.trim() ? '' : 'Give the client a name.';
    if (index !== 1) return '';
    if (!groups.length) return 'A new client starts with at least one piece of work.';
    for (const g of groups) {
      const label = g.name.trim() || 'the task group';
      if (!g.name.trim()) return 'Give every task group a name.';
      if (g.groupType === CUSTOM_TYPE && !g.customLabel.trim()) return `Give ${label}’s new type of work a name.`;
      if (g.start && g.due && g.due < g.start) return `${label}’s deadline cannot be before its start.`;
      if (g.clientDue && g.due && g.clientDue < g.due) return `The team’s deadline on ${label} cannot be after the date promised to the client.`;
      for (const t of g.tasks) {
        if (!t.title.trim()) return `Every task in ${label} needs a title.`;
        if (t.start && t.due && t.due < t.start) return `“${t.title.trim()}” cannot be due before it starts.`;
        if (g.due && (t.due || g.due) > g.due) return `“${t.title.trim()}” cannot be due after ${label}, which is due ${formatDate(g.due)}.`;
        const built = buildSeats(t.seats);
        if (typeof built === 'string') return `${built} (“${t.title.trim()}”)`;
      }
    }
    return '';
  }
  // Said when somebody tries to move on, never before: a form nobody has filled in yet is not
  // wrong, and a red line under an empty box on arrival is the fastest way to stop being read.
  // What IS live is the field itself — an inverted pair of dates is outlined where it happens.

  function go(next: number) {
    if (next > step) {
      for (let i = step; i < next; i++) {
        const p = problemWith(i);
        if (p) { setError(p); setStep(i); return; }
      }
    }
    setError('');
    setStep(next);
  }

  async function create() {
    for (let i = 0; i < STEPS.length; i++) {
      const p = problemWith(i);
      if (p) { setError(p); setStep(i); return; }
    }
    const payload: CapacityNewClientInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      clientGroupId: clientGroupId || undefined,
      managerId: managerId || undefined,
      priority,
      groups: groups.map<CapacityNewClientGroup>(g => ({
        name: g.name.trim(),
        description: g.description.trim() || undefined,
        groupType: g.groupType === CUSTOM_TYPE ? undefined : (g.groupType || undefined),
        customType: g.groupType === CUSTOM_TYPE
          ? { label: g.customLabel.trim(), tasks: g.tasks.map(t => t.title.trim()).filter(Boolean), save: g.saveTemplate }
          : undefined,
        ...domainPayload(g.techDomain, g.customDomainLabel, g.saveDomain),
        startDate: g.start || undefined,
        dueDate: g.due || undefined,
        clientDueDate: canSetClientDue && g.clientDue ? g.clientDue : undefined,
        tasks: g.tasks.map(t => {
          const seats = buildSeats(t.seats);
          return {
            title: t.title.trim(),
            priority: t.priority,
            startDate: t.start || undefined,
            dueDate: t.due || undefined,
            seats: typeof seats === 'string' ? [] : seats,
          };
        }),
      })),
    };
    setSaving(true);
    setError('');
    try {
      const made = await api.capacity.createClientWork(payload);
      // Everything that draws a task, its hours or its people — the board included.
      invalidateTimesheetCaches(qc);
      qc.invalidateQueries({ queryKey: ['capacity-task-options'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project-types'] });
      qc.invalidateQueries({ queryKey: ['technology-domains'] });
      const said = [
        `Created “${made.client.title}”${made.client.code ? ` · ${made.client.code}` : ''}`,
        `${made.groups.length} task group${made.groups.length === 1 ? '' : 's'}`,
        `${made.taskCount} task${made.taskCount === 1 ? '' : 's'}`,
      ].join(' — ');
      toast(said, 'success');
      if (made.addedToClient.length) {
        toast(`${made.addedToClient.length} ${made.addedToClient.length === 1 ? 'person was' : 'people were'} added to the client because they were given work on it`, 'info');
      }
      for (const w of made.scheduleWarnings.slice(0, 3)) toast(w, 'info');
      onCreated?.(made.client.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the client.');
      setSaving(false);
    }
  }

  const subtitle = step === 0
    ? 'Who the client is and who runs it. Its CID is issued automatically.'
    : step === 1
      ? 'Its pieces of work, the tasks inside them, and who does each one.'
      : 'What this does to everyone’s week — across every client, before it is real.';

  return (
    <Modal
      title="New client work"
      subtitle={subtitle}
      size="xl"
      onClose={() => { if (!saving) onClose(); }}
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11.5px] tabular-nums text-gray-500">
            {groups.length} group{groups.length === 1 ? '' : 's'} · {totals.taskCount} task{totals.taskCount === 1 ? '' : 's'}
            {totals.peopleCount > 0 && <> · {totals.peopleCount} {totals.peopleCount === 1 ? 'person' : 'people'}, {fmtHours(totals.hours)}</>}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => (step === 0 ? onClose() : go(step - 1))} disabled={saving}
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50">
              {step === 0 ? 'Cancel' : 'Back'}
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => go(step + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                Next
              </button>
            ) : (
              <button type="button" onClick={create} disabled={saving || !gate.allowed}
                title={gate.allowed ? undefined : 'This puts somebody past their working day — tick the box above to do it anyway.'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {saving && <Loader size={14} className="animate-spin" />}
                Create client and work
              </button>
            )}
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        <Stepper step={step} onStep={go} />

        {step === 0 && (
          <section className="space-y-4">
            <SectionHead Icon={Building2}>Client</SectionHead>
            <Field label="Client name">
              <input autoFocus value={title} onChange={e => setTitle(e.target.value)} maxLength={100}
                placeholder="e.g. Acme Technologies" className={INPUT} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client group">
                <ClientGroupPicker value={clientGroupId} onChange={setClientGroupId} />
              </Field>
              <Field label="Priority">
                <select value={priority} onChange={e => setPriority(e.target.value)} className={INPUT}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
                </select>
              </Field>
            </div>
            <Field label="About this client" hint="optional">
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={2000}
                placeholder="Who they are, what they usually ask us for" className={clsx(INPUT, 'resize-y')} />
            </Field>

            <SectionHead Icon={KeyRound}>Manager and CID</SectionHead>
            <Field label="Client manager" hint="optional">
              <select value={managerId} onChange={e => setManagerId(e.target.value)} className={INPUT}>
                <option value="">{user ? 'Me — I’ll manage it' : 'Me'}</option>
                {managerOptions.map(u => (
                  <option key={u.id} value={u.id}>{fullName(u)}{u.designation ? ` — ${u.designation}` : ''}</option>
                ))}
              </select>
            </Field>
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11.5px] leading-relaxed text-gray-500">
              The client is given the next <b>CID</b> in this financial year the moment it is created — in the same
              transaction as everything you set up here. If any of it is refused, none of it happens and no CID is spent.
            </p>
          </section>
        )}

        {step === 1 && (
          <section className="space-y-3">
            <SectionHead Icon={Layers}>Task groups</SectionHead>
            {groups.map((g, i) => (
              <GroupCard
                key={g.key}
                g={g}
                index={i}
                types={types}
                people={people}
                canSetClientDue={canSetClientDue}
                canRemove={groups.length > 1}
                onPatch={patch => setGroup(g.key, patch)}
                onPickType={v => pickType(g, v)}
                onTaskPatch={(tKey, patch) => setTask(g.key, tKey, patch)}
                onRemove={() => setGroups(gs => gs.filter(x => x.key !== g.key))}
              />
            ))}
            <button type="button" onClick={() => setGroups(gs => [...gs, newGroup()])}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-brand-700 hover:border-brand-300 hover:bg-brand-50/50">
              <Plus size={14} /> Add another task group
            </button>

            {(impact.isLoading || impact.seats.length > 0) && (
              <div className="pt-1">
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">Do they have the hours?</p>
                  <ImpactLegend />
                </div>
                <AssignmentImpact state={impact} compact />
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="space-y-3">
            <SectionHead Icon={Gauge}>Everyone’s week</SectionHead>
            {impact.seats.length === 0 && !impact.isLoading ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Nobody is on this work yet. You can still create it — the tasks will be unassigned and nothing lands on
                the board until somebody is given them.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[12.5px] text-gray-600">
                    Everything below counts <b>every client</b> they are on, not just this one — this client has no
                    hours yet, so all of it is other work.
                  </p>
                  <ImpactLegend />
                </div>
                <AssignmentImpact state={impact} />
                {gate.node}
              </>
            )}
            <dl className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 px-3 py-3 text-[12.5px] sm:grid-cols-4">
              <Stat label="Client" value={title.trim() || '—'} />
              <Stat label="Task groups" value={String(groups.length)} />
              <Stat label="Tasks" value={String(totals.taskCount)} />
              <Stat label="Planned" value={fmtHours(totals.hours)} />
            </dl>
          </section>
        )}

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>
        )}
      </div>
    </Modal>
  );
}

// ── the pieces ──────────────────────────────────────────────────────────────────────────────

function Stepper({ step, onStep }: { step: number; onStep: (n: number) => void }) {
  return (
    <ol className="flex items-center gap-1.5 text-[12px]">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onStep(i)}
            aria-current={i === step ? 'step' : undefined}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors',
              i === step ? 'bg-brand-600 text-white' : i < step ? 'text-brand-700 hover:bg-brand-50' : 'text-gray-400 hover:bg-gray-50',
            )}
          >
            <span className={clsx('grid h-4 w-4 place-items-center rounded-full text-[10px] tabular-nums',
              i === step ? 'bg-white/25' : i < step ? 'bg-brand-100' : 'bg-gray-100')}>{i + 1}</span>
            {label}
          </button>
          {i < STEPS.length - 1 && <ChevronRight size={12} className="text-gray-300" />}
        </li>
      ))}
    </ol>
  );
}

function SectionHead({ Icon, children }: { Icon: typeof Layers; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
      <Icon size={13} /> {children}
    </h3>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="truncate font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function GroupCard({ g, index, types, people, canSetClientDue, canRemove, onPatch, onPickType, onTaskPatch, onRemove }: {
  g: GroupDraft;
  index: number;
  types: ProjectTypeDef[];
  people: CapacityTaskOptions['people'];
  canSetClientDue: boolean;
  canRemove: boolean;
  onPatch: (patch: Partial<GroupDraft>) => void;
  onPickType: (value: string) => void;
  onTaskPatch: (taskKey: string, patch: Partial<TaskDraft>) => void;
  onRemove: () => void;
}) {
  const isCustom = g.groupType === CUSTOM_TYPE;
  const type = types.find(t => t.value === g.groupType);
  const datesInverted = !!g.start && !!g.due && g.due < g.start;
  const clientBeforeTeam = !!g.clientDue && !!g.due && g.clientDue < g.due;
  const staffed = g.tasks.reduce((n, t) => n + t.seats.filter(s => s.userId).length, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-3 py-2">
        <button type="button" onClick={() => onPatch({ open: !g.open })} aria-expanded={g.open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {g.open ? <ChevronDown size={14} className="shrink-0 text-gray-400" /> : <ChevronRight size={14} className="shrink-0 text-gray-400" />}
          <span className="truncate text-sm font-medium text-gray-800">{g.name.trim() || `Task group ${index + 1}`}</span>
          <span className="shrink-0 text-[11px] text-gray-500">
            · {g.tasks.length} task{g.tasks.length === 1 ? '' : 's'}{staffed > 0 && `, ${staffed} seat${staffed === 1 ? '' : 's'}`}
            {g.due && ` · due ${formatDate(g.due)}`}
          </span>
        </button>
        {canRemove && (
          <button type="button" onClick={onRemove} aria-label="Remove this task group" title="Remove this task group"
            className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-rose-600">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {g.open && (
        <div className="space-y-3 px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type of work">
              <select value={g.groupType} onChange={e => onPickType(e.target.value)} className={INPUT}>
                <option value="">General — no standard tasks</option>
                {types.filter(t => t.value !== 'GENERAL').map(t => (
                  <option key={t.value} value={t.value} disabled={t.comingSoon}>
                    {t.label}{t.comingSoon ? ' — coming soon' : ''}{t.custom ? ' (custom)' : ''}
                  </option>
                ))}
                <option value={CUSTOM_TYPE}>+ Create a new type…</option>
              </select>
            </Field>
            <Field label="Task group name">
              <input value={g.name} maxLength={100} onChange={e => onPatch({ name: e.target.value, nameTouched: true })}
                placeholder="e.g. FTO – Widget X" className={INPUT} />
            </Field>
          </div>

          {isCustom && (
            <div className="space-y-2.5 rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-3">
              <input value={g.customLabel} onChange={e => onPatch({ customLabel: e.target.value, ...(g.nameTouched ? {} : { name: e.target.value.trim() }) })}
                placeholder="New type name — e.g. Standard Essentiality Study"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={g.saveTemplate} onChange={e => onPatch({ saveTemplate: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                Save this type — and the tasks below — for everyone in the organisation
              </label>
            </div>
          )}
          {!isCustom && type?.tasks?.length ? (
            <p className="text-[11.5px] text-gray-500">
              {g.tasksTouched
                ? `“${type.label}” normally has ${type.tasks.length} standard tasks.`
                : `Filled in with the ${type.tasks.length} standard tasks of “${type.label}” — rename, remove or add to them.`}
            </p>
          ) : null}

          <TechnologyDomainPicker
            value={g.techDomain} onChange={v => onPatch({ techDomain: v })}
            customLabel={g.customDomainLabel} onCustomLabel={v => onPatch({ customDomainLabel: v })}
            save={g.saveDomain} onSave={v => onPatch({ saveDomain: v })}
          />

          <div className={clsx('grid gap-3', canSetClientDue ? 'grid-cols-3' : 'grid-cols-2')}>
            <Field label="Start">
              <DateField type="date" value={g.start} max={g.due || undefined} onChange={e => onPatch({ start: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Deadline" hint="team">
              <DateField type="date" value={g.due} min={g.start || undefined} max={(canSetClientDue && g.clientDue) || undefined}
                onChange={e => onPatch({ due: e.target.value })} className={clsx(INPUT, (datesInverted || clientBeforeTeam) && 'border-rose-400')} />
            </Field>
            {canSetClientDue && (
              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-sm font-medium text-amber-700"><Lock size={11} /> Client deadline</span>
                <DateField type="date" value={g.clientDue} min={g.due || g.start || undefined} onChange={e => onPatch({ clientDue: e.target.value })}
                  className="w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
              </label>
            )}
          </div>
          {(datesInverted || clientBeforeTeam) && (
            <p className="flex items-center gap-1.5 text-xs text-rose-700">
              <AlertTriangle size={12} />
              {datesInverted
                ? 'The deadline cannot be before the start.'
                : 'The team’s deadline cannot be after the date promised to the client.'}
            </p>
          )}

          <Field label="What this piece of work is for" hint="optional">
            <textarea value={g.description} onChange={e => onPatch({ description: e.target.value })} rows={2} maxLength={2000}
              className={clsx(INPUT, 'resize-y')} />
          </Field>

          {/* ── its tasks ───────────────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-gray-200">
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
              <p className="text-sm font-medium text-gray-800">Tasks</p>
              <button type="button"
                onClick={() => onPatch({ tasksTouched: true, tasks: [...g.tasks, newTask('', g.start)] })}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
                <Plus size={13} /> Add task
              </button>
            </div>
            {g.tasks.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-gray-400">
                No tasks yet{g.groupType && !isCustom ? ' — pick a type of work above to fill in its standard ones' : ''}.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {g.tasks.map((t, ti) => (
                  <TaskRow
                    key={t.key}
                    t={t}
                    index={ti}
                    people={people}
                    groupStart={g.start}
                    groupDue={g.due}
                    groupName={g.name.trim() || `Task group ${index + 1}`}
                    onPatch={patch => onTaskPatch(t.key, patch)}
                    onRemove={() => onPatch({ tasksTouched: true, tasks: g.tasks.filter(x => x.key !== t.key) })}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ t, index, people, groupStart, groupDue, groupName, onPatch, onRemove }: {
  t: TaskDraft;
  index: number;
  people: CapacityTaskOptions['people'];
  groupStart: string;
  groupDue: string;
  groupName: string;
  onPatch: (patch: Partial<TaskDraft>) => void;
  onRemove: () => void;
}) {
  const seated = t.seats.filter(s => s.userId).length;
  const hours = t.seats.reduce((n, s) => n + (Number(s.hours) || 0), 0);
  const dueAfterGroup = !!groupDue && !!t.due && t.due > groupDue;

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPatch({ open: !t.open })} aria-expanded={t.open} aria-label={t.open ? 'Hide the people on this task' : 'Show the people on this task'}
          className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100">
          {t.open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <input value={t.title} maxLength={200} onChange={e => onPatch({ title: e.target.value })}
          placeholder={`Task ${index + 1} — e.g. Prior-art search`}
          className={clsx(SMALL, 'w-0 min-w-0 flex-1')} aria-label="Task title" />
        <span className="shrink-0 text-[11px] tabular-nums text-gray-500">
          {seated ? `${seated} ${seated === 1 ? 'person' : 'people'}${hours ? `, ${fmtHours(hours)}` : ''}` : 'nobody'}
        </span>
        <button type="button" onClick={onRemove} aria-label="Remove this task" title="Remove this task"
          className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-rose-600">
          <X size={14} />
        </button>
      </div>

      {t.open && (
        <div className="mt-2 space-y-2 pl-7">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="text-[11px] text-gray-500">Starts
              <DateField type="date" value={t.start} max={t.due || undefined}
                onChange={e => onPatch({ start: e.target.value })} className={SMALL} />
            </label>
            <label className="text-[11px] text-gray-500">Due
              <DateField type="date" value={t.due} min={t.start || groupStart || undefined} max={groupDue || undefined}
                onChange={e => onPatch({ due: e.target.value })} className={clsx(SMALL, dueAfterGroup && 'border-rose-400')} />
            </label>
            <label className="text-[11px] text-gray-500">Priority
              <select value={t.priority} onChange={e => onPatch({ priority: e.target.value })} className={SMALL}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
              </select>
            </label>
          </div>
          {!t.due && groupDue && (
            <p className="text-[11px] text-gray-400">With no date of its own it takes {groupName}’s — due {formatDate(groupDue)}.</p>
          )}
          {dueAfterGroup && (
            <p className="flex items-center gap-1.5 text-xs text-rose-700">
              <AlertTriangle size={12} /> “{groupName}” is due {formatDate(groupDue)} — a task in it cannot be due later.
            </p>
          )}
          <SeatList
            compact
            rows={t.seats}
            people={people}
            onChange={next => onPatch({ seats: next })}
            defaultStart={t.start || groupStart}
          />
        </div>
      )}
    </li>
  );
}
