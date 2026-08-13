'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  ArrowLeft, Plus, Loader, Archive, Users2, X, Trash2, UserPlus, Flag,
} from 'lucide-react';
import { api, type TeamSpace, type TeamTask } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useOrg, byName } from '@/lib/org-context';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/date';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

const PRIORITY_FLAG: Record<string, string> = {
  CRITICAL: 'text-red-600', HIGH: 'text-orange-500', MEDIUM: 'text-amber-500', LOW: 'text-gray-400',
};

/**
 * One team space: its board, its people.
 *
 * Intentionally simpler than a project. There is no Gantt, no capacity tab, no issues, no
 * timesheet tab and no PID — a hiring round does not have a critical path or a client to bill.
 * What it has is columns, tasks and the people in the space, which is what this kind of work
 * actually needs.
 */
export function TeamSpaceClient({ teamId }: { teamId: string }) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [managingPeople, setManagingPeople] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [addingList, setAddingList] = useState(false);

  const { data: team, isLoading, error } = useQuery<TeamSpace>({
    queryKey: ['team', teamId], queryFn: () => api.teams.get(teamId),
  });
  const { data: tasks = [] } = useQuery<TeamTask[]>({
    queryKey: ['team-tasks', teamId], queryFn: () => api.teams.tasks(teamId), enabled: !!team,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['team', teamId] });
    qc.invalidateQueries({ queryKey: ['team-tasks', teamId] });
    qc.invalidateQueries({ queryKey: ['teams'] });
  };

  const createList = useMutation({
    mutationFn: () => api.teams.createList(teamId, newListName.trim()),
    onSuccess: () => { setNewListName(''); setAddingList(false); refresh(); },
    onError: e => toast(msg(e), 'error'),
  });
  const removeList = useMutation({
    mutationFn: (listId: string) => api.teams.removeList(teamId, listId),
    onSuccess: refresh,
    onError: e => toast(msg(e), 'error'),
  });
  const moveTask = useMutation({
    mutationFn: ({ taskId, listId }: { taskId: string; listId: string }) => api.teams.moveTask(teamId, taskId, listId),
    onSuccess: refresh,
    onError: e => toast(msg(e), 'error'),
  });
  const removeTask = useMutation({
    mutationFn: (taskId: string) => api.teams.removeTask(teamId, taskId),
    onSuccess: refresh,
    onError: e => toast(msg(e), 'error'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }
  if (error || !team) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <Users2 className="mx-auto text-gray-300" size={40} />
        <h1 className="mt-3 text-lg font-semibold text-gray-800">Not available</h1>
        <p className="text-sm text-gray-500 mt-1">{error ? msg(error) : 'This team space could not be loaded.'}</p>
        <Link href="/teams" className="inline-block mt-4 text-sm text-brand-600 hover:underline">Back to team spaces</Link>
      </div>
    );
  }

  const lists = team.taskLists ?? [];
  const archived = !!team.archivedAt;
  const mayEdit = can('task.create') && !archived;

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <Link href="/teams" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 mb-2">
          <ArrowLeft size={12} /> Team Spaces
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 truncate">
              {team.name}
              {archived && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-400 font-sans font-medium shrink-0">
                  <Archive size={11} /> Archived
                </span>
              )}
            </h1>
            {team.description && <p className="text-sm text-gray-500 mt-0.5">{team.description}</p>}
          </div>
          <button
            onClick={() => setManagingPeople(true)}
            className="flex items-center gap-2 shrink-0 rounded-lg px-2 py-1.5 hover:bg-gray-50"
            title="Who is in this space"
          >
            <AvatarStack users={team.members.map(m => m.user)} max={5} size={26} />
            {can('team.manage') && <UserPlus size={14} className="text-gray-400" />}
          </button>
        </div>
        {archived && (
          <p className="mt-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            This space is archived. Everything is kept and still readable, but no new work can be added —
            restore it from the Team Spaces list to carry on.
          </p>
        )}
      </div>

      {/* The board */}
      <div className="p-4 sm:p-6 overflow-x-auto">
        <div className="flex gap-4 min-w-min items-start">
          {lists.map(list => {
            const inList = tasks.filter(t => t.taskListId === list.id);
            return (
              <div key={list.id} className="w-72 shrink-0 bg-gray-50 rounded-xl border border-gray-200">
                <div className="px-3 py-2.5 flex items-center justify-between border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700 truncate">
                    {list.name} <span className="ml-1 text-xs font-normal text-gray-400">{inList.length}</span>
                  </h2>
                  {can('tasklist.delete') && !archived && (
                    <button
                      onClick={() => removeList.mutate(list.id)}
                      title="Remove this column"
                      className="p-1 rounded text-gray-300 hover:text-red-500"
                    ><Trash2 size={12} /></button>
                  )}
                </div>
                <div className="p-2 space-y-2 min-h-[60px]">
                  {inList.map(t => (
                    <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-2.5 group">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-800 leading-snug">{t.title}</p>
                        {can('task.delete') && !archived && (
                          <button
                            onClick={() => removeTask.mutate(t.id)}
                            className="p-0.5 rounded text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"
                            title="Delete task"
                          ><Trash2 size={11} /></button>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <Flag size={11} className={PRIORITY_FLAG[t.priority] ?? 'text-gray-300'} />
                          {t.dueDate && <span className="text-[11px] text-gray-400 truncate">{formatDate(t.dueDate)}</span>}
                        </span>
                        <AvatarStack users={t.assignees.map(a => a.user)} max={2} size={20} empty="" />
                      </div>
                      {/* A dropdown rather than drag-and-drop: it works on a phone, it is
                          keyboard-reachable, and it never loses a card to a mis-drop. */}
                      {!archived && can('task.update') && lists.length > 1 && (
                        <select
                          value={list.id}
                          onChange={e => moveTask.mutate({ taskId: t.id, listId: e.target.value })}
                          className="mt-2 w-full text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-brand-400"
                        >
                          {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                  {mayEdit && (
                    <button
                      onClick={() => setAddingTo(list.id)}
                      className="w-full text-left text-xs text-gray-400 hover:text-brand-600 px-2 py-1.5 rounded hover:bg-white"
                    >
                      <Plus size={12} className="inline mr-1" /> Add task
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {can('tasklist.create') && !archived && (
            <div className="w-72 shrink-0">
              {addingList ? (
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-2">
                  <input
                    value={newListName} onChange={e => setNewListName(e.target.value)} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter' && newListName.trim()) createList.mutate(); if (e.key === 'Escape') setAddingList(false); }}
                    placeholder="Column name"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-brand-500"
                  />
                  <div className="flex gap-1.5 mt-2">
                    <button
                      onClick={() => createList.mutate()} disabled={!newListName.trim() || createList.isPending}
                      className="px-2.5 py-1 text-xs font-medium bg-brand-600 text-white rounded disabled:opacity-50"
                    >Add</button>
                    <button onClick={() => { setAddingList(false); setNewListName(''); }} className="px-2 py-1 text-xs text-gray-500">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingList(true)}
                  className="w-full text-sm text-gray-400 hover:text-brand-600 border border-dashed border-gray-300 rounded-xl py-3 hover:border-brand-400"
                >
                  <Plus size={14} className="inline mr-1" /> Add column
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {addingTo && (
        <NewTaskModal
          team={team} taskListId={addingTo}
          onClose={() => setAddingTo(null)}
          onCreated={() => { setAddingTo(null); refresh(); }}
        />
      )}
      {managingPeople && (
        <MembersModal team={team} onClose={() => setManagingPeople(false)} onSaved={() => { setManagingPeople(false); refresh(); }} />
      )}
    </div>
  );
}

function NewTaskModal({ team, taskListId, onClose, onCreated }: {
  team: TeamSpace; taskListId: string; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [err, setErr] = useState('');

  const create = useMutation({
    mutationFn: () => api.teams.createTask(team.id, {
      title: title.trim(), taskListId, priority,
      dueDate: dueDate || undefined,
      assigneeIds: assigneeIds.length ? assigneeIds : undefined,
    }),
    onSuccess: onCreated,
    onError: (e: unknown) => setErr(msg(e)),
  });

  const toggle = (id: string) => setAssigneeIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">New task</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <input
            value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="What needs doing?"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
              <select
                value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500"
              >
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due</label>
              <input
                type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Assign to
              <span className="ml-1 font-normal text-gray-400">— members of this space only</span>
            </label>
            <div className="rounded-lg border border-gray-300 max-h-36 overflow-y-auto divide-y divide-gray-50">
              {team.members.map(m => (
                <label key={m.userId} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox" checked={assigneeIds.includes(m.userId)} onChange={() => toggle(m.userId)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700">{m.user.firstName} {m.user.lastName}</span>
                </label>
              ))}
            </div>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-3.5 flex justify-end gap-2 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={() => { setErr(''); create.mutate(); }} disabled={create.isPending || !title.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {create.isPending ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Add
          </button>
        </div>
      </div>
    </div>
  );
}

function MembersModal({ team, onClose, onSaved }: { team: TeamSpace; onClose: () => void; onSaved: () => void }) {
  const { can } = usePermissions();
  const { users } = useOrg();
  const mayManage = can('team.manage');
  const [picked, setPicked] = useState<string[]>(team.members.map(m => m.userId));
  const [err, setErr] = useState('');

  const save = useMutation({
    mutationFn: () => api.teams.setMembers(team.id, picked),
    onSuccess: onSaved,
    onError: (e: unknown) => setErr(msg(e)),
  });

  const toggle = (id: string) => setPicked(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">
            People in {team.name}
            {mayManage && picked.length > 0 && <span className="ml-1.5 text-xs font-normal text-brand-600">· {picked.length}</span>}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={16} /></button>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
          {mayManage ? (
            [...users].sort(byName).map(u => (
              <label key={u.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox" checked={picked.includes(u.id)} onChange={() => toggle(u.id)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-700">{u.firstName} {u.lastName}</span>
                {u.designation && <span className="text-[11px] text-gray-400 ml-auto truncate">{u.designation}</span>}
              </label>
            ))
          ) : (
            team.members.map(m => (
              <div key={m.userId} className="px-4 py-2 text-sm text-gray-700">
                {m.user.firstName} {m.user.lastName}
                {m.user.designation && <span className="text-[11px] text-gray-400 ml-2">{m.user.designation}</span>}
              </div>
            ))
          )}
        </div>
        {err && <p className="px-5 pt-2 text-xs text-red-600">{err}</p>}
        {mayManage && (
          <div className="px-5 py-3.5 flex justify-end gap-2 border-t border-gray-100">
            <button onClick={onClose} className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button
              onClick={() => { setErr(''); save.mutate(); }} disabled={save.isPending || picked.length === 0}
              className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
