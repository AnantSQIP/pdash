'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Check, FolderTree, Loader, Pencil, Plus, X } from 'lucide-react';
import { api, type ClientGroup } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

/**
 * CLIENTS-FLOW: groups of clients — the picker every client form uses, and the dialog that
 * arranges them.
 *
 * A client group is a shelf, nothing more: it grants no access and moves no work. So the picker is
 * a plain choice, "No group" is always a valid answer, and anybody who may run clients
 * (project.approve) can add a shelf without leaving the form they are in.
 */

export const CLIENT_GROUPS_KEY = ['client-groups'] as const;

export function useClientGroups(opts: { includeArchived?: boolean } = {}) {
  return useQuery<ClientGroup[]>({
    queryKey: [...CLIENT_GROUPS_KEY, opts.includeArchived ? 'all' : 'live'],
    queryFn: () => api.clientGroups.list(opts),
    staleTime: 60_000,
  });
}

/** Everything that shows a client's group has to hear about a change to one. */
export function invalidateClientGroups(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: CLIENT_GROUPS_KEY });
  qc.invalidateQueries({ queryKey: ['projects'] });
  qc.invalidateQueries({ queryKey: ['project'] });
}

const NEW = '__new_group__';

/**
 * Choose a client group, or make one on the spot. The new group is created the moment "Add" is
 * pressed — not deferred to the form's submit — so a cancelled form does not have to explain what
 * happened to a group it half-made, and a failed client save does not lose the group either.
 */
export function ClientGroupPicker({ value, onChange, disabled, id }: {
  value: string;
  onChange: (groupId: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const mayArrange = can('project.approve');
  const { data: groups = [], isLoading } = useClientGroups();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: () => api.clientGroups.create({ name: name.trim() }),
    onSuccess: g => {
      invalidateClientGroups(qc);
      onChange(g.id);
      setAdding(false);
      setName('');
      toast(`Client group “${g.name}” added`, 'success');
    },
    onError: e => toast(e instanceof Error ? e.message : 'Could not add the group', 'error'),
  });

  if (adding) {
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          value={name}
          onChange={e => setName(e.target.value)}
          // Enter inside a form would submit the CLIENT. Here it means "add this group".
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (name.trim()) create.mutate(); }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAdding(false); setName(''); }
          }}
          autoFocus
          maxLength={80}
          placeholder="e.g. Law firms"
          className="flex-1 px-3.5 py-2.5 text-sm border border-brand-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <button type="button" onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {create.isPending ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Add
        </button>
        <button type="button" onClick={() => { setAdding(false); setName(''); }}
          className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg" title="Cancel">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      value={value}
      disabled={disabled || isLoading}
      onChange={e => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))}
      className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition bg-white disabled:bg-gray-50"
    >
      <option value="">No group</option>
      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
      {mayArrange && <option value={NEW}>+ New client group…</option>}
    </select>
  );
}

/**
 * Arrange the shelves: add, rename, reorder, archive and restore. Archiving moves the group's
 * clients to "No group" — the confirmation says how many, counted from what the reader can see.
 */
export function ManageClientGroupsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: groups = [], isLoading } = useClientGroups({ includeArchived: true });
  const live = groups.filter(g => !g.archivedAt).sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
  const archived = groups.filter(g => g.archivedAt);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => invalidateClientGroups(qc);
  const fail = (e: unknown, what: string) => toast(e instanceof Error ? e.message : `Could not ${what}`, 'error');

  async function run(id: string, what: string, fn: () => Promise<unknown>, done?: string) {
    setBusyId(id);
    try { await fn(); refresh(); if (done) toast(done, 'success'); }
    catch (e) { fail(e, what); }
    finally { setBusyId(null); }
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    await run('__new__', 'add the group', () => api.clientGroups.create({ name }), `Client group “${name}” added`);
    setNewName('');
  }

  async function rename(g: ClientGroup) {
    const name = draft.trim();
    if (!name || name === g.name) { setEditingId(null); return; }
    await run(g.id, 'rename the group', () => api.clientGroups.update(g.id, { name }), 'Group renamed');
    setEditingId(null);
  }

  /** Swap with the neighbour, then renumber everyone — sequences can be equal after imports. */
  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= live.length) return;
    const order = [...live];
    [order[index], order[target]] = [order[target], order[index]];
    await run(order[target].id, 'reorder the groups', async () => {
      for (let i = 0; i < order.length; i++) {
        if (order[i].sequence !== i) await api.clientGroups.update(order[i].id, { sequence: i });
      }
    });
  }

  async function archive(g: ClientGroup) {
    const ok = await confirmDialog({
      title: `Archive “${g.name}”?`,
      body: g.clientCount > 0
        ? `Its ${g.clientCount === 1 ? 'client moves' : `${g.clientCount} clients move`} to “No group”. Nothing else about ${g.clientCount === 1 ? 'it' : 'them'} changes, and the group can be restored.`
        : 'It has no clients. It can be restored later.',
      confirmLabel: 'Archive',
    });
    if (ok) await run(g.id, 'archive the group', () => api.clientGroups.archive(g.id), 'Group archived');
  }

  return (
    <Modal title="Client groups" subtitle="Shelves for clients — they decide where a client is listed, nothing else." size="lg" onClose={onClose}
      footer={<div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Done</button></div>}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            maxLength={80}
            placeholder="New group — e.g. Law firms, Corporates, Samsung family"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
          />
          <button onClick={add} disabled={!newName.trim() || busyId === '__new__'}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {busyId === '__new__' ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Add
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6"><Loader size={18} className="animate-spin text-gray-400" /></div>
        ) : live.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">
            <FolderTree size={20} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No client groups yet.</p>
            <p className="text-xs text-gray-400 mt-0.5">Clients without a group are listed under “No group”.</p>
          </div>
        ) : (
          <ul className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {live.map((g, i) => (
              <li key={g.id} className="flex items-center gap-2 px-3 py-2.5 bg-white">
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} disabled={i === 0 || !!busyId} title="Move up"
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30"><ArrowUp size={12} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === live.length - 1 || !!busyId} title="Move down"
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30"><ArrowDown size={12} /></button>
                </div>
                {editingId === g.id ? (
                  <input
                    value={draft} onChange={e => setDraft(e.target.value)} autoFocus maxLength={80}
                    onKeyDown={e => { if (e.key === 'Enter') rename(g); if (e.key === 'Escape') setEditingId(null); }}
                    className="flex-1 px-2 py-1 text-sm border border-brand-400 rounded focus:outline-none"
                  />
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{g.name}</p>
                    <p className="text-[11px] text-gray-400">{g.clientCount === 1 ? '1 client' : `${g.clientCount} clients`}</p>
                  </div>
                )}
                {busyId === g.id && <Loader size={14} className="animate-spin text-gray-400" />}
                {editingId === g.id ? (
                  <>
                    <button onClick={() => rename(g)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Save"><Check size={14} /></button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded" title="Cancel"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditingId(g.id); setDraft(g.name); }} disabled={!!busyId}
                      className="p-1.5 text-gray-400 hover:text-brand-600 rounded" title="Rename"><Pencil size={13} /></button>
                    <button onClick={() => archive(g)} disabled={!!busyId}
                      className="p-1.5 text-gray-400 hover:text-amber-600 rounded" title="Archive"><Archive size={13} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {archived.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Archived</p>
            <ul className="rounded-xl border border-gray-100 divide-y divide-gray-50">
              {archived.map(g => (
                <li key={g.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-sm text-gray-400 line-through truncate">{g.name}</span>
                  <button
                    onClick={() => run(g.id, 'restore the group', () => api.clientGroups.restore(g.id), 'Group restored')}
                    disabled={!!busyId}
                    className={clsx('inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg',
                      'text-gray-600 hover:bg-gray-100 disabled:opacity-50')}>
                    <ArchiveRestore size={12} /> Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * The client's group, on the client's own page. A plain label for people who may not re-file the
 * client; a compact picker for people who may (project.update). Re-filing is one PATCH.
 */
export function ClientGroupChip({ projectId, groupId, groupName, canEdit }: {
  projectId: string;
  groupId?: string | null;
  groupName?: string | null;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const { data: groups = [] } = useClientGroups();
  const [saving, setSaving] = useState(false);

  async function move(next: string) {
    if ((next || null) === (groupId ?? null)) return;
    setSaving(true);
    try {
      await api.projects.update(projectId, { clientGroupId: next || null });
      invalidateClientGroups(qc);
      const name = groups.find(g => g.id === next)?.name;
      toast(next ? `Filed under “${name ?? 'the group'}”` : 'Taken out of its group', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not move the client', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return groupName ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 ring-1 ring-violet-100" title="Client group">
        <FolderTree size={12} /> {groupName}
      </span>
    ) : null;
  }
  return (
    <label className={clsx('relative inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium ring-1 cursor-pointer',
      groupName ? 'bg-violet-50 text-violet-700 ring-violet-100' : 'bg-white text-gray-400 ring-gray-200')}
      title="Client group — change it here">
      {saving ? <Loader size={12} className="animate-spin" /> : <FolderTree size={12} />}
      <select
        value={groupId ?? ''}
        onChange={e => move(e.target.value)}
        disabled={saving}
        aria-label="Client group"
        className="bg-transparent pr-1 py-0.5 text-xs font-medium focus:outline-none cursor-pointer appearance-none"
      >
        <option value="">No group</option>
        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <ChevronDownTiny />
    </label>
  );
}

function ChevronDownTiny() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="m6 9 6 6 6-6" /></svg>;
}
