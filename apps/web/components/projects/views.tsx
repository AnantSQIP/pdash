'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Plus, CheckSquare, Users, Calendar, Flag, LayoutList, UserPlus, X as XIcon } from 'lucide-react';
import { api, type ApiTask, type ApiProject, type WorkflowStatus } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/date';
import { Avatar } from '@/components/Avatar';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { isTaskClosed, taskAssigneeUsers, OPEN_TYPE, CLOSED_TYPE } from '@/lib/tasks';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { useQueryClient } from '@tanstack/react-query';
import { fullName } from '@/lib/avatar';

const PRIORITY_FLAG: Record<string, string> = {
  CRITICAL: 'text-red-500', HIGH: 'text-orange-500', MEDIUM: 'text-amber-500', LOW: 'text-gray-300',
};
/** Alphabetical by display name — people lists read the same everywhere in the app. */
const byName = (a: { firstName?: string | null; lastName?: string | null }, b: { firstName?: string | null; lastName?: string | null }) =>
  fullName(a as never).toLowerCase().localeCompare(fullName(b as never).toLowerCase());

// The Task List and Overview bodies, shared by the single-project page and by each card on a
// multi-project PID page. They were local to the page until a PID could hold several projects;
// keeping one copy is what stops the two paths drifting apart.

export function TaskListView({
  tasks, loading, statuses, canAddTask, onTaskClick, onAddTask, onStatusChange,
}: {
  tasks: ApiTask[];
  loading: boolean;
  statuses: WorkflowStatus[];
  canAddTask: boolean;
  onTaskClick: (task: ApiTask) => void;
  onAddTask: () => void;
  onStatusChange: (taskId: string, statusId: string) => void;
}) {
  // Toggle done↔open from the row checkbox, via the workflow (reversible).
  function toggleComplete(task: ApiTask) {
    const target = isTaskClosed(task) ? statuses.find(s => s.type === OPEN_TYPE) : statuses.find(s => s.type === CLOSED_TYPE);
    if (target) onStatusChange(task.id, target.id);
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 animate-pulse">
            <div className="w-4 h-4 rounded border-2 border-gray-200 shrink-0" />
            <div className="flex-1 h-4 bg-gray-100 rounded" />
            <div className="w-24 h-3 bg-gray-100 rounded hidden md:block" />
            <div className="w-16 h-3 bg-gray-100 rounded hidden lg:block" />
          </div>
        ))}
      </div>
    );
  }

  // NO header here. The group card above owns the single bar — its editable name, its count and
  // its "Add task". This used to render a SECOND bar underneath saying "General", so a renamed
  // group showed two stacked bars with two different names for the same list.
  return (
    <div className="bg-white overflow-hidden">
      {/* Column headers */}
      <div className="flex items-center gap-4 px-5 py-2.5 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
        <span className="w-4 shrink-0" />
        <span className="flex-1">Task</span>
        <span className="w-32 hidden sm:block">Status</span>
        <span className="w-20 hidden lg:block">Priority</span>
        <span className="w-20 hidden sm:block">Assignees</span>
        <span className="w-24 hidden lg:block text-right">Due Date</span>
      </div>

      {tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-sm text-gray-400">
          <CheckSquare size={32} className="mb-3 text-gray-200" />
          <p>No tasks yet</p>
          <button onClick={onAddTask} className="mt-2 text-brand-600 hover:underline text-xs font-medium">
            Add the first task
          </button>
        </div>
      )}

      {tasks.map((task, i) => {
        const closed = isTaskClosed(task);

        return (
          <div
            key={task.id}
            onClick={() => onTaskClick(task)}
            className={clsx(
              'flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer',
              i < tasks.length - 1 && 'border-b border-gray-50',
            )}
          >
            <button
              onClick={e => { e.stopPropagation(); toggleComplete(task); }}
              aria-label={closed ? 'Reopen task' : 'Mark task complete'}
              title={closed ? 'Completed — click to reopen' : 'Mark complete'}
              className={clsx(
                'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                closed ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400',
              )}
            >
              {closed && (
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
            </button>

            <span className={clsx('flex-1 text-sm min-w-0 truncate', closed ? 'line-through text-gray-400' : 'text-gray-800')}>
              {task.title}
            </span>

            {/* Status control */}
            <div className="hidden sm:block w-32 shrink-0" onClick={e => e.stopPropagation()}>
              <select
                value={task.currentWorkflowStatusId ?? ''}
                onChange={e => onStatusChange(task.id, e.target.value)}
                disabled={statuses.length === 0}
                aria-label="Task status"
                className="w-full text-xs font-medium rounded-full px-2 py-1 border-0 focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer disabled:cursor-default"
                style={task.currentStatus ? { backgroundColor: task.currentStatus.colorHex + '22', color: task.currentStatus.colorHex } : { backgroundColor: '#f1f5f9', color: '#64748b' }}
              >
                {!task.currentStatus && <option value="">—</option>}
                {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>


            <div className="hidden lg:block w-20 shrink-0">
              <span className={clsx('text-xs font-medium', PRIORITY_FLAG[task.priority] ?? 'text-gray-400')}>
                <Flag size={11} className="inline mr-1" />
                {task.priority ? task.priority.charAt(0) + task.priority.slice(1).toLowerCase() : '—'}
              </span>
            </div>

            <div className="hidden sm:flex items-center w-20 shrink-0">
              <AvatarStack
                users={taskAssigneeUsers(task)}
                size={24}
                max={3}
                empty={<div className="w-6 h-6 rounded-full border-2 border-dashed border-gray-200" title="Unassigned" />}
              />
            </div>

            <span className="hidden lg:block w-24 shrink-0 text-right text-xs text-gray-500">
              {formatDate(task.dueDate)}
            </span>
          </div>
        );
      })}

      <div
        onClick={onAddTask}
        className="flex items-center gap-3 px-5 py-3 text-sm text-gray-400 hover:bg-gray-50 cursor-pointer transition-colors border-t border-dashed border-gray-200"
      >
        <Plus size={14} /> Add a task...
      </div>
    </div>
  );
}

// ── Overview View ──────────────────────────────────────────────────────────────

export function OverviewView({ project, tasks }: { project: ApiProject; tasks: ApiTask[] }) {
  const { toast } = useToast();
  const statusCounts: Record<string, { count: number; color: string }> = {};
  for (const t of tasks) {
    const name = t.currentStatus?.name ?? 'Open';
    const color = t.currentStatus?.colorHex ?? '#64748b';
    if (!statusCounts[name]) statusCounts[name] = { count: 0, color };
    statusCounts[name].count++;
  }
  const statuses = Object.entries(statusCounts).map(([label, { count, color }]) => ({ label, count, color }));
  const members = [...(project.members ?? [])].sort((a, b) => byName(a.user, b.user));

  // #11: add / remove project members.
  const { users } = useOrg();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const canManage = can('project.update');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const memberIds = new Set(members.map(m => m.userId));
  const candidates = (users ?? []).filter(u => !memberIds.has(u.id));
  const refresh = () => { qc.invalidateQueries({ queryKey: ['project', project.id] }); qc.invalidateQueries({ queryKey: ['projects'] }); };
  async function addMember(userId: string) {
    setBusy(true);
    try { await api.projects.addMember(project.id, userId); setAdding(false); refresh(); toast('Member added.', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not add member.', 'error'); }
    finally { setBusy(false); }
  }
  async function removeMember(userId: string) {
    if (!window.confirm('Remove this member from the project?')) return;
    setBusy(true);
    try { await api.projects.removeMember(project.id, userId); refresh(); toast('Member removed.', 'info'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not remove member.', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      {/* Progress card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Overall Progress</h3>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-24 h-24 shrink-0">
            <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke="#E8533A" strokeWidth="3"
                strokeDasharray={`${project.completionPercentage} ${100 - project.completionPercentage}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-gray-900">{project.completionPercentage}%</span>
            </div>
          </div>
          <div className="space-y-2">
            {statuses.length === 0 ? (
              <p className="text-sm text-gray-400">No tasks yet</p>
            ) : statuses.map(s => (
              <div key={s.label} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-gray-600">{s.label}</span>
                <span className="font-medium text-gray-900 ml-auto pl-4">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Team */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Team Members</h3>
          {canManage && !adding && candidates.length > 0 && (
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              <UserPlus size={13} /> Add member
            </button>
          )}
        </div>
        {canManage && adding && (
          <div className="flex items-center gap-2 mb-3">
            <select
              disabled={busy}
              defaultValue=""
              onChange={e => { if (e.target.value) addMember(e.target.value); }}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5"
              autoFocus
            >
              <option value="" disabled>Select a teammate…</option>
              {candidates.map(u => (
                <option key={u.id} value={u.id}>{`${u.firstName} ${u.lastName ?? ''}`.trim()}</option>
              ))}
            </select>
            <button onClick={() => setAdding(false)} className="p-1.5 text-gray-400 hover:text-gray-600"><XIcon size={15} /></button>
          </div>
        )}
        <div className="space-y-3">
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">No members assigned</p>
          ) : members.map((m, i) => (
            <div key={m.userId} className="flex items-center gap-3 group">
              <Avatar user={m.user} size={32} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{`${m.user.firstName} ${m.user.lastName ?? ''}`.trim()}</p>
                <p className="text-xs text-gray-500">{m.projectRole ?? (i === 0 ? 'Manager' : 'Member')}</p>
              </div>
              {canManage && (m.projectRole !== 'MANAGER') && (
                <button
                  onClick={() => removeMember(m.userId)}
                  disabled={busy}
                  title="Remove from project"
                  className="ml-auto p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
