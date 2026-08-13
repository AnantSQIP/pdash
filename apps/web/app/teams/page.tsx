'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Users2, Plus, Loader, Archive, ArchiveRestore, ShieldAlert, X } from 'lucide-react';
import { api, type TeamSpace } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useOrg, byName } from '@/lib/org-context';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { useToast } from '@/components/ui/Toast';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/**
 * Team Spaces — where HR, BD and operations work lives.
 *
 * Deliberately a separate destination from Projects. A project is a client matter: it carries a
 * PID, a client, billability and a client deadline, and it feeds the ledgers and delivery
 * reporting. None of that is true of a hiring round or a conference push, and making that work
 * pretend to be a project is what this module exists to stop.
 */
export default function TeamsPage() {
  const { can, loading } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { data: teams = [], isLoading } = useQuery<TeamSpace[]>({
    queryKey: ['teams'], queryFn: () => api.teams.list(), enabled: can('team.view'),
  });

  const setArchived = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? api.teams.archive(id) : api.teams.restore(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
    onError: e => toast(msg(e), 'error'),
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }
  if (!can('team.view')) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <ShieldAlert className="mx-auto text-gray-300" size={40} />
        <h1 className="mt-3 text-lg font-semibold text-gray-800">Restricted</h1>
        <p className="text-sm text-gray-500 mt-1">You do not have access to team spaces.</p>
      </div>
    );
  }

  const visible = teams.filter(t => showArchived || !t.archivedAt);
  const archivedCount = teams.filter(t => t.archivedAt).length;

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users2 size={20} className="text-brand-600" /> Team Spaces
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            HR, business development and operations — work that is not a client matter
          </p>
        </div>
        {can('team.manage') && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 shrink-0"
          >
            <Plus size={14} /> New space
          </button>
        )}
      </div>

      <div className="p-4 sm:p-6">
        {archivedCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer mb-3">
            <input
              type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Show {archivedCount} archived
          </label>
        )}

        {isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <Users2 size={32} className="mx-auto text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-700">No team spaces yet</p>
            <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
              {can('team.manage')
                ? 'Create one for HR, business development or operations — work that should not have to pretend to be a client project.'
                : 'You will see a space here once you are added to one.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(t => (
              <div
                key={t.id}
                className={clsx('bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 transition-colors',
                  t.archivedAt && 'opacity-60')}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/teams/${t.id}`} className="min-w-0 flex-1">
                    <h2 className="font-semibold text-gray-900 truncate hover:text-brand-600">{t.name}</h2>
                    {t.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>}
                  </Link>
                  {can('team.manage') && (
                    <button
                      onClick={() => setArchived.mutate({ id: t.id, archived: !t.archivedAt })}
                      title={t.archivedAt ? 'Restore' : 'Archive — keeps everything, takes no new work'}
                      className="p-1 rounded text-gray-300 hover:text-brand-600 shrink-0"
                    >
                      {t.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <AvatarStack users={t.members.map(m => m.user)} max={4} size={24} />
                  <span className="text-xs text-gray-400">
                    {t.archivedAt ? 'Archived' : `${t.openTasks ?? 0} open`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && <NewSpaceModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); qc.invalidateQueries({ queryKey: ['teams'] }); }} />}
    </div>
  );
}

function NewSpaceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { users } = useOrg();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [err, setErr] = useState('');

  const create = useMutation({
    mutationFn: () => api.teams.create({ name: name.trim(), description: description.trim() || undefined, memberIds }),
    onSuccess: onCreated,
    onError: (e: unknown) => setErr(msg(e)),
  });

  const toggle = (id: string) => setMemberIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">New team space</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input
              value={name} onChange={e => setName(e.target.value)} autoFocus
              placeholder="e.g. Business Development"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">What it is for</label>
            <textarea
              rows={2} value={description} onChange={e => setDescription(e.target.value)} maxLength={300}
              placeholder="Pipeline, conferences, outreach"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Who is in it
              {memberIds.length > 0 && <span className="ml-1 text-xs font-normal text-brand-600">· {memberIds.length} selected</span>}
            </label>
            <p className="text-[11px] text-gray-400 mb-1.5">You are included automatically.</p>
            <div className="rounded-lg border border-gray-300 max-h-44 overflow-y-auto divide-y divide-gray-50">
              {[...users].sort(byName).map(u => (
                <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox" checked={memberIds.includes(u.id)} onChange={() => toggle(u.id)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700">{u.firstName} {u.lastName}</span>
                  {u.designation && <span className="text-[11px] text-gray-400 ml-auto truncate">{u.designation}</span>}
                </label>
              ))}
            </div>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-3.5 flex justify-end gap-2 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={() => { setErr(''); create.mutate(); }}
            disabled={create.isPending || name.trim().length < 2}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {create.isPending ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Create
          </button>
        </div>
      </div>
    </div>
  );
}
