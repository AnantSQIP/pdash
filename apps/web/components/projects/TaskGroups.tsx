'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Plus, Pencil, Check, X, Loader, Trash2, ChevronDown, LayoutList } from 'lucide-react';
import { api, type ApiTask, type WorkflowStatus } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { TaskListView } from './views';
import { invalidateTaskCaches } from '@/lib/task-cache';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

type Group = { id: string; name: string; isDefault: boolean; sequence: number };

/**
 * A project's tasks, split into named GROUPS.
 *
 * Every project starts with one group called "General", which is fine until the same project runs
 * a second piece of work — then everything lands in one undifferentiated pile. So a group can be
 * renamed to say what it actually is ("Claim charts", "Round 2 search"), new groups can be added,
 * and each keeps its own tasks and its own "Add task".
 *
 * The rename is the point: "General" is a placeholder, not a label anybody chose.
 */
export function TaskGroups({ projectId, tasks, loading, statuses, canEdit, onTaskClick, onAddTask, onStatusChange }: {
  projectId: string;
  tasks: ApiTask[];
  loading: boolean;
  statuses: WorkflowStatus[];
  canEdit: boolean;
  onTaskClick: (t: ApiTask) => void;
  onAddTask: (taskListId: string) => void;
  onStatusChange: (taskId: string, statusId: string) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ['task-groups', projectId],
    queryFn: () => api.taskLists.list(projectId),
    staleTime: 60_000,
  });

  const refresh = () => {
    // Was project-scoped only, so My Tasks kept showing the previous status.
    invalidateTaskCaches(qc);
  };

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.taskLists.update(projectId, id, { name }),
    onSuccess: () => { refresh(); setEditingId(null); toast('Group renamed', 'success'); },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not rename the group', 'error'),
  });
  const create = useMutation({
    mutationFn: (name: string) => api.taskLists.create(projectId, { name }),
    onSuccess: () => { refresh(); setAdding(false); setNewName(''); toast('Group added', 'success'); },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not add the group', 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.taskLists.remove(projectId, id),
    onSuccess: () => { refresh(); toast('Group deleted', 'success'); },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not delete the group', 'error'),
  });

  /** Tasks bucketed by group. Anything whose group was deleted falls into "Ungrouped". */
  const byGroup = useMemo(() => {
    const m = new Map<string, ApiTask[]>();
    const known = new Set(groups.map(g => g.id));
    for (const t of tasks) {
      const link = (t.projectTasks ?? []).find(pt => pt.projectId === projectId);
      const key = link?.taskListId && known.has(link.taskListId) ? link.taskListId : '__ungrouped__';
      (m.get(key) ?? m.set(key, []).get(key)!).push(t);
    }
    return m;
  }, [tasks, groups, projectId]);

  const ungrouped = byGroup.get('__ungrouped__') ?? [];

  function startRename(g: Group) { setEditingId(g.id); setDraft(g.name); }

  function GroupCard({ id, name, isDefault, count, children }: {
    id: string; name: string; isDefault?: boolean; count: number; children: React.ReactNode;
  }) {
    const open = !collapsed[id];
    return (
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/70 flex-wrap">
          <button onClick={() => setCollapsed(c => ({ ...c, [id]: !!open }))}
            className="p-0.5 text-gray-400 hover:text-gray-700 shrink-0" title={open ? 'Collapse' : 'Expand'}>
            <ChevronDown size={15} className={clsx('transition-transform', !open && '-rotate-90')} />
          </button>

          {editingId === id ? (
            <>
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && draft.trim()) rename.mutate({ id, name: draft.trim() });
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
                className="flex-1 min-w-[140px] px-2 py-1 text-sm font-semibold border border-brand-400 rounded focus:outline-none"
              />
              <button onClick={() => draft.trim() && rename.mutate({ id, name: draft.trim() })}
                disabled={rename.isPending || !draft.trim()}
                className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50" title="Save">
                {rename.isPending ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="Cancel"><X size={14} /></button>
            </>
          ) : (
            <>
              <LayoutList size={14} className="text-gray-400 shrink-0" />
              <span className="text-sm font-semibold text-gray-800 truncate">{name}</span>
              <span className="text-[11px] font-medium text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5 shrink-0">{count}</span>
              {canEdit && id !== '__ungrouped__' && (
                <button onClick={() => startRename({ id, name, isDefault: !!isDefault, sequence: 0 })}
                  className="p-1 text-gray-400 hover:text-brand-600 rounded shrink-0" title="Rename this group">
                  <Pencil size={13} />
                </button>
              )}
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                {canEdit && id !== '__ungrouped__' && (
                  <button onClick={() => onAddTask(id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand-700 border border-brand-200 bg-brand-50 rounded-lg hover:bg-brand-100">
                    <Plus size={12} /> Add task
                  </button>
                )}
                {/* The default group is the fallback for new tasks, so it must always exist. */}
                {canEdit && id !== '__ungrouped__' && !isDefault && (
                  <button
                    onClick={async () => {
                      if (count > 0) { toast('Move or delete this group’s tasks first.', 'error'); return; }
                      if (await confirmDialog({ title: `Delete the group “${name}”?`, danger: true, confirmLabel: 'Delete' })) remove.mutate(id);
                    }}
                    className="p-1 text-gray-400 hover:text-red-600 rounded" title="Delete this group">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {open && children}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(g => (
        <GroupCard key={g.id} id={g.id} name={g.name} isDefault={g.isDefault} count={(byGroup.get(g.id) ?? []).length}>
          <TaskListView
            tasks={byGroup.get(g.id) ?? []}
            loading={loading}
            statuses={statuses}
            canAddTask={false}   /* the group header owns "Add task" */
            onTaskClick={onTaskClick}
            onAddTask={() => onAddTask(g.id)}
            onStatusChange={onStatusChange}
          />
        </GroupCard>
      ))}

      {/* Tasks whose group was removed still have to be reachable. */}
      {ungrouped.length > 0 && (
        <GroupCard id="__ungrouped__" name="Ungrouped" count={ungrouped.length}>
          <TaskListView
            tasks={ungrouped} loading={loading} statuses={statuses} canAddTask={false}
            onTaskClick={onTaskClick} onAddTask={() => {}} onStatusChange={onStatusChange}
          />
        </GroupCard>
      )}

      {canEdit && (adding ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 px-4 py-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newName.trim()) create.mutate(newName.trim());
              if (e.key === 'Escape') { setAdding(false); setNewName(''); }
            }}
            autoFocus
            placeholder="Group name — e.g. Claim charts"
            className="flex-1 px-2.5 py-1.5 text-sm border border-brand-400 rounded-lg focus:outline-none"
          />
          <button onClick={() => newName.trim() && create.mutate(newName.trim())} disabled={create.isPending || !newName.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {create.isPending ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Add
          </button>
          <button onClick={() => { setAdding(false); setNewName(''); }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"><X size={15} /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/40 transition-colors">
          <Plus size={15} /> New task group
        </button>
      ))}
    </div>
  );
}
