'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader, Check, Info, Layers, Users } from 'lucide-react';
import clsx from 'clsx';
import { api, type ProjectTypeDef, type TaskGroup, type UserSummary } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { DateField } from '@/components/ui/DateField';
import { toast } from '@/components/ui/Toast';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { fullName } from '@/lib/avatar';
import { invalidateTaskCaches } from '@/lib/task-cache';
import { TechnologyDomainPicker, domainPayload, CUSTOM_DOMAIN } from './TechnologyDomainPicker';

const day = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

/**
 * CLIENTS-FLOW: create or edit a task group — one piece of work for a client.
 *
 * Creating one asks the same questions a project used to — what kind of work, in what field,
 * by when — because this is where those answers now live. A type's standard tasks are created
 * inside the group, dated to it. For somebody who may assign work, the same dialog says who does
 * it and for how many hours each, which puts it on Team Capacity the moment the group exists:
 * making the group and staffing it are one act, not two errands.
 *
 * Editing changes the group's own facts. It never adds or removes tasks — changing the type
 * relabels the work, it does not re-template it, and the dialog says so.
 */
export function TaskGroupModal({ projectId, clientName, group, members, onClose, onSaved }: {
  projectId: string;
  clientName?: string;
  /** Present when editing. */
  group?: TaskGroup;
  /** The client's team, offered first when choosing who does the work. */
  members?: { userId: string; user?: UserSummary }[];
  onClose: () => void;
  onSaved?: (g: TaskGroup) => void;
}) {
  const qc = useQueryClient();
  const { users } = useOrg();
  const { can } = usePermissions();
  const editing = !!group;
  const canAssign = can('task.assign');
  const canStaffOutsiders = can('project.approve');

  const [name, setName] = useState(group?.name ?? '');
  const [nameTouched, setNameTouched] = useState(editing);
  const [groupType, setGroupType] = useState(group?.groupType ?? '');
  const [customLabel, setCustomLabel] = useState('');
  const [customTasks, setCustomTasks] = useState('');
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [techDomain, setTechDomain] = useState(group?.technologyDomain ?? '');
  const [customDomainLabel, setCustomDomainLabel] = useState('');
  const [saveDomain, setSaveDomain] = useState(false);
  const [startDate, setStartDate] = useState(day(group?.startDate));
  const [dueDate, setDueDate] = useState(day(group?.dueDate));
  const [description, setDescription] = useState(group?.description ?? '');
  const [assigneeId, setAssigneeId] = useState('');
  const [hoursPerTask, setHoursPerTask] = useState('4');
  const [error, setError] = useState('');

  const { data: types = [] } = useQuery<ProjectTypeDef[]>({
    queryKey: ['project-types'], queryFn: () => api.projects.types(), staleTime: 5 * 60_000,
  });
  const isCustom = groupType === '__custom__';
  const selectedType = types.find(t => t.value === groupType);
  const taskCount = isCustom
    ? customTasks.split('\n').map(t => t.trim()).filter(Boolean).length
    : (selectedType?.tasks?.length ?? 0);

  // Named after its kind of work until somebody types a name of their own.
  useEffect(() => {
    if (nameTouched) return;
    setName(isCustom ? customLabel.trim() : (selectedType?.label ?? ''));
  }, [groupType, customLabel, selectedType, isCustom, nameTouched]);

  // The client's own people first, then — for somebody who may staff outsiders — everyone else,
  // who is added to the client by the assignment itself.
  const memberIds = useMemo(() => new Set((members ?? []).map(m => m.userId)), [members]);
  const byName = (a: UserSummary, b: UserSummary) => fullName(a).localeCompare(fullName(b));
  const onClient = useMemo(() => users.filter(u => memberIds.has(u.id)).sort(byName), [users, memberIds]);
  const others = useMemo(() => users.filter(u => !memberIds.has(u.id) && u.status !== 'INACTIVE').sort(byName), [users, memberIds]);

  const datesInverted = !!startDate && !!dueDate && dueDate < startDate;
  const hours = hoursPerTask.trim() === '' ? undefined : Number(hoursPerTask);
  const hoursInvalid = hours !== undefined && (!Number.isFinite(hours) || hours < 0 || hours > 200);

  const refresh = () => {
    invalidateTaskCaches(qc);
    qc.invalidateQueries({ queryKey: ['task-groups', projectId] });
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    if (isCustom && saveTemplate) qc.invalidateQueries({ queryKey: ['project-types'] });
    if (techDomain === CUSTOM_DOMAIN && saveDomain) qc.invalidateQueries({ queryKey: ['technology-domains'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        return api.taskLists.update(projectId, group!.id, {
          name: name.trim(),
          description: description.trim() || null,
          groupType: groupType || null,
          ...(techDomain === CUSTOM_DOMAIN
            ? { customDomain: { label: customDomainLabel.trim(), save: saveDomain } }
            : { technologyDomain: techDomain || null }),
          startDate: startDate || null,
          dueDate: dueDate || null,
        });
      }
      return api.taskLists.create(projectId, {
        name: name.trim(),
        description: description.trim() || undefined,
        groupType: isCustom ? undefined : (groupType || undefined),
        customType: isCustom ? {
          label: customLabel.trim(),
          tasks: customTasks.split('\n').map(t => t.trim()).filter(Boolean),
          save: saveTemplate,
        } : undefined,
        ...domainPayload(techDomain, customDomainLabel, saveDomain),
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
        ...(assigneeId && taskCount > 0 ? { assigneeId, hoursPerTask: hours } : {}),
      });
    },
    onSuccess: g => {
      refresh();
      if (editing) {
        toast('Task group saved', 'success');
      } else {
        const made = (g as any).createdTaskCount ?? 0;
        const assigned = (g as any).assigned ?? 0;
        toast(made
          ? `Task group created with ${made} task${made === 1 ? '' : 's'}${assigned ? `, assigned to ${fullName(users.find(u => u.id === assigneeId) as UserSummary) || 'your pick'}` : ''}`
          : 'Task group created', 'success');
        if ((g as any).assignmentWarning) toast((g as any).assignmentWarning, 'error');
      }
      onSaved?.(g as TaskGroup);
      onClose();
    },
    onError: e => setError(e instanceof Error ? e.message : 'Could not save the task group'),
  });

  function submit() {
    setError('');
    if (!name.trim()) { setError('Give the task group a name.'); return; }
    if (!editing && isCustom && !customLabel.trim()) { setError('Give the new type of work a name.'); return; }
    if (datesInverted) { setError('The deadline cannot be before the start.'); return; }
    if (hoursInvalid) { setError('Hours per task must be between 0 and 200.'); return; }
    save.mutate();
  }

  const label = 'block text-sm font-medium text-gray-700 mb-1.5';
  const field = 'w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition bg-white';

  return (
    <Modal
      title={editing ? 'Edit task group' : 'New task group'}
      subtitle={clientName ? `For ${clientName}` : undefined}
      size="lg"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-red-600 min-h-[1em]" role="alert">{error}</p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={submit}
              disabled={save.isPending || !name.trim() || datesInverted || hoursInvalid || (!editing && isCustom && !customLabel.trim())}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {save.isPending ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
              {editing ? 'Save' : 'Create task group'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="tg-type" className={label}>Type of work</label>
          <select id="tg-type" value={groupType} onChange={e => setGroupType(e.target.value)} className={field}>
            <option value="">General — no standard tasks</option>
            {types.filter(t => t.value !== 'GENERAL').map(t => (
              <option key={t.value} value={t.value} disabled={t.comingSoon}>
                {t.label}{t.comingSoon ? ' — coming soon' : ''}{t.custom ? ' (custom)' : ''}
              </option>
            ))}
            {/* A group created with a one-off type keeps its label when edited. */}
            {editing && group?.groupType && !types.some(t => t.value === group.groupType) && (
              <option value={group.groupType}>{group.groupType.replace(/^CUSTOM_/, '').replace(/_/g, ' ').toLowerCase()}</option>
            )}
            {!editing && <option value="__custom__">+ Create a new type…</option>}
          </select>
          {editing ? (
            <p className="flex items-start gap-1.5 text-[11px] text-gray-400 mt-1">
              <Info size={12} className="mt-px shrink-0" /> Changing the type relabels this group. It does not add or remove tasks.
            </p>
          ) : isCustom ? (
            <div className="mt-2 rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-3 space-y-2.5">
              <input
                value={customLabel} onChange={e => setCustomLabel(e.target.value)}
                placeholder="New type name — e.g. Standard Essentiality Study"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white"
              />
              <textarea
                rows={3} value={customTasks} onChange={e => setCustomTasks(e.target.value)}
                placeholder={'Its tasks, one per line\nUnderstanding + KFs\nReport'}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white resize-none"
              />
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={saveTemplate} onChange={e => setSaveTemplate(e.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                Save this type for everyone in the organisation
              </label>
            </div>
          ) : selectedType?.tasks && selectedType.tasks.length > 0 && (
            <div className="mt-2 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2">
              <p className="text-xs font-medium text-brand-800 mb-1">Creates {selectedType.tasks.length} tasks in this group:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-xs text-brand-700">
                {selectedType.tasks.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="tg-name" className={label}>Name <span className="text-red-500">*</span></label>
          <input id="tg-name" value={name} maxLength={100} autoFocus={editing}
            onChange={e => { setName(e.target.value); setNameTouched(true); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            placeholder="e.g. FTO – Widget X" className={field} />
        </div>

        <TechnologyDomainPicker
          value={techDomain} onChange={setTechDomain}
          customLabel={customDomainLabel} onCustomLabel={setCustomDomainLabel}
          save={saveDomain} onSave={setSaveDomain}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Start</label>
            <DateField type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Deadline</label>
            <DateField type="date" value={dueDate} min={startDate || undefined} onChange={e => setDueDate(e.target.value)} className={field} />
          </div>
        </div>
        {datesInverted && <p className="-mt-2 text-xs text-red-600">The deadline cannot be before the start.</p>}
        {!editing && taskCount > 0 && (dueDate || startDate) && (
          <p className="-mt-2 text-[11px] text-gray-400">Each of the {taskCount} tasks takes the group’s dates; change any task on its own later.</p>
        )}

        <div>
          <label htmlFor="tg-desc" className={label}>Description <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea id="tg-desc" rows={2} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="What this piece of work is for" className={clsx(field, 'resize-none')} />
        </div>

        {/* Staffing at creation — for somebody who may assign work, and only when there are tasks to staff. */}
        {!editing && canAssign && taskCount > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3.5 space-y-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
              <Users size={14} className="text-brand-500" /> Assign the {taskCount} tasks
              <span className="text-xs font-normal text-gray-400">— optional; shows on Team Capacity right away</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={field} aria-label="Who does the work">
                  <option value="">Nobody yet — assign task by task later</option>
                  {onClient.length > 0 && (
                    <optgroup label="On this client">
                      {onClient.map(u => <option key={u.id} value={u.id}>{fullName(u)}{u.designation ? ` — ${u.designation}` : ''}</option>)}
                    </optgroup>
                  )}
                  {canStaffOutsiders && others.length > 0 && (
                    <optgroup label="Everyone else (added to the client)">
                      {others.map(u => <option key={u.id} value={u.id}>{fullName(u)}{u.designation ? ` — ${u.designation}` : ''}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <div className="relative">
                  <input type="number" min={0} max={200} step={0.5} value={hoursPerTask}
                    onChange={e => setHoursPerTask(e.target.value)} disabled={!assigneeId}
                    aria-label="Hours per task" className={clsx(field, 'pr-16 disabled:bg-gray-100 disabled:text-gray-400')} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">h / task</span>
                </div>
              </div>
            </div>
            {assigneeId && (
              <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
                <Layers size={12} className="mt-px shrink-0 text-gray-400" />
                {hours ? `${Math.round(hours * taskCount * 10) / 10}h in all, ` : ''}planned from {startDate ? 'the start date' : 'today'} in task order.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
