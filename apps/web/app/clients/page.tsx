'use client';

import { useMemo, useState, Fragment } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Building2, Plus, Search, ChevronRight, ChevronDown, Loader, Pencil, Trash2, X, Check,
  ExternalLink, KeyRound, Lock,
} from 'lucide-react';
import { api, type ClientLedgerEntry, type ProjectClient } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/date';
import { projectTypeLabel, pidLabel } from '@/lib/mock-data';

/**
 * THE CLIENT LEDGER — the mirror image of the PID ledger.
 *
 * The PID ledger answers "what is this number". This answers "what do we have for this client":
 * every Project ID under them and where each one stands. A PID row links straight into the PID
 * ledger, so the two read as one system rather than two lists.
 *
 * Client CODES are shareable and shown to anyone who can see projects. The NAME and contact
 * details are the client's identity — the server sends them only to Super Admins, so a non-admin
 * sees the code and a lock rather than a blank space pretending there's nothing there.
 */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  WORKING:      { label: 'Working',      cls: 'bg-brand-100 text-brand-700' },
  COMPLETED:    { label: 'Completed',    cls: 'bg-green-100 text-green-700' },
  CLOSED:       { label: 'Closed',       cls: 'bg-slate-200 text-slate-600' },
  DISCONTINUED: { label: 'Discontinued', cls: 'bg-red-100 text-red-700' },
};

type Draft = Partial<ProjectClient>;

function ClientForm({ initial, busy, onCancel, onSave }: {
  initial: Draft; busy: boolean; onCancel: () => void; onSave: (d: Draft) => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setD(prev => ({ ...prev, [k]: e.target.value }));
  const valid = !!d.code && d.code.trim().length >= 2;
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Client code <span className="text-red-500">*</span></label>
          <input value={d.code ?? ''} onChange={set('code')} placeholder="MLK" autoFocus
            className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
          <p className="text-[10px] text-gray-400 mt-1">Shareable — everyone with project access sees this.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Company name</label>
          <input value={d.name ?? ''} onChange={set('name')} placeholder="Milkyway Corporation"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
          <p className="text-[10px] text-gray-400 mt-1">Restricted — Super Admins only.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input value={d.contactName ?? ''} onChange={set('contactName')} placeholder="Contact person"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
        <input value={d.contactEmail ?? ''} onChange={set('contactEmail')} placeholder="Email"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
        <input value={d.contactPhone ?? ''} onChange={set('contactPhone')} placeholder="Phone"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
      </div>
      <input value={d.address ?? ''} onChange={set('address')} placeholder="Address"
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
      <textarea value={d.notes ?? ''} onChange={set('notes')} placeholder="Notes" rows={2}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 resize-none" />
      <div className="flex gap-2">
        <button onClick={() => onSave(d)} disabled={busy || !valid}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {busy ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Save
        </button>
        <button onClick={onCancel} className="px-3 py-2 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const { can, isSuperAdmin, loading: permLoading } = usePermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const allowed = can('project.view');
  const { data: clients = [], isLoading, isError, refetch } = useQuery<ClientLedgerEntry[]>({
    queryKey: ['client-ledger'], queryFn: () => api.projectClients.ledger(), enabled: allowed, staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['client-ledger'] });
    qc.invalidateQueries({ queryKey: ['project-clients'] });
  };
  const create = useMutation({
    mutationFn: (d: Draft) => api.projectClients.create(d),
    onSuccess: () => { invalidate(); setAdding(false); toast('Client added', 'success'); },
    onError: e => toast(e instanceof Error ? e.message : 'Could not add the client', 'error'),
  });
  const update = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Draft }) => api.projectClients.update(id, d),
    onSuccess: () => { invalidate(); setEditingId(null); toast('Client updated', 'success'); },
    onError: e => toast(e instanceof Error ? e.message : 'Could not update the client', 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.projectClients.remove(id),
    onSuccess: () => { invalidate(); toast('Client deleted', 'success'); },
    onError: e => toast(e instanceof Error ? e.message : 'Could not delete the client', 'error'),
  });

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => (q
    ? clients.filter(c => `${c.code} ${c.name ?? ''} ${c.pids.map(p => `${p.pid} ${p.title}`).join(' ')}`.toLowerCase().includes(q))
    : clients), [clients, q]);

  const totals = useMemo(() => ({
    clients: clients.length,
    pids: clients.reduce((n, c) => n + c.pidCount, 0),
    live: clients.reduce((n, c) => n + c.liveCount, 0),
    hours: Math.round(clients.reduce((n, c) => n + c.totalLoggedHours, 0) * 10) / 10,
  }), [clients]);

  if (permLoading) return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  if (!allowed) return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <Building2 size={40} className="text-gray-300 mb-3" />
      <p className="text-gray-600 font-medium">Access restricted</p>
      <p className="text-sm text-gray-400 mt-1">The client ledger is available to people who can see projects.</p>
    </div>
  );

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Building2 size={20} className="text-brand-600" /> Client ledger</h1>
          <p className="text-sm text-gray-500 mt-0.5">Every client, the Project IDs under them, and where each one stands.</p>
        </div>
        {isSuperAdmin && (
          <button onClick={() => { setAdding(a => !a); setEditingId(null); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700">
            <Plus size={15} /> New client
          </button>
        )}
      </header>

      <div className="p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {([['Clients', totals.clients], ['Project IDs', totals.pids], ['Live PIDs', totals.live], ['Hours logged', totals.hours]] as const).map(([l, v]) => (
            <div key={l} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{v}</p>
              <p className="text-xs text-gray-500 mt-1">{l}</p>
            </div>
          ))}
        </div>

        {!isSuperAdmin && (
          <p className="text-[11px] text-gray-400 inline-flex items-center gap-1.5">
            <Lock size={11} /> Client codes are shown to everyone with project access; company names and contacts are Super-Admin only.
          </p>
        )}

        {adding && isSuperAdmin && (
          <ClientForm initial={{}} busy={create.isPending} onCancel={() => setAdding(false)} onSave={d => create.mutate(d)} />
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client, code or PID…"
                className="w-64 pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13} /></button>}
            </div>
            <span className="ml-auto text-[11px] text-gray-400">Click a client to see its Project IDs</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400"><Loader size={18} className="animate-spin mr-2" />Loading…</div>
          ) : isError ? (
            <div className="py-10 text-center text-sm text-gray-400">
              Couldn&apos;t load the clients. <button onClick={() => refetch()} className="text-brand-600 hover:underline">Retry</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['', 'Code', 'Client', 'Project IDs', 'Live', 'Hours', 'Added', ''].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-400">
                      {q ? `No client matches “${search.trim()}”.` : 'No clients yet.'}
                    </td></tr>
                  )}
                  {filtered.map(c => {
                    const open = openId === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr className={clsx('hover:bg-gray-50 cursor-pointer', open && 'bg-brand-50/60')} onClick={() => setOpenId(open ? null : c.id)}>
                          <td className="px-3 py-2.5 text-gray-400">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                          <td className="px-3 py-2.5"><span className="font-mono font-bold text-brand-700">{c.code}</span></td>
                          <td className="px-3 py-2.5 text-gray-800">
                            {c.name ?? <span className="text-gray-400 inline-flex items-center gap-1"><Lock size={11} /> restricted</span>}
                            {!c.isActive && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">inactive</span>}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-gray-700">{c.pidCount}</td>
                          <td className="px-3 py-2.5 tabular-nums">{c.liveCount > 0 ? <span className="text-brand-700 font-semibold">{c.liveCount}</span> : <span className="text-gray-300">0</span>}</td>
                          <td className="px-3 py-2.5 tabular-nums text-gray-600">{c.totalLoggedHours}h</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{c.createdAt ? formatDate(c.createdAt) : '—'}</td>
                          <td className="px-3 py-2.5 text-right">
                            {isSuperAdmin && (
                              <span className="inline-flex items-center gap-1">
                                <button onClick={e => { e.stopPropagation(); setEditingId(c.id); setAdding(false); setOpenId(c.id); }}
                                  className="p-1 text-gray-400 hover:text-brand-600 rounded" title="Edit client"><Pencil size={13} /></button>
                                <button onClick={e => { e.stopPropagation(); if (confirm(`Delete client ${c.code}?`)) remove.mutate(c.id); }}
                                  className="p-1 text-gray-400 hover:text-red-600 rounded" title="Delete client"><Trash2 size={13} /></button>
                              </span>
                            )}
                          </td>
                        </tr>

                        {open && (
                          <tr className="bg-brand-50/30">
                            <td />
                            <td colSpan={7} className="px-3 py-3">
                              {editingId === c.id && isSuperAdmin ? (
                                <ClientForm initial={c} busy={update.isPending} onCancel={() => setEditingId(null)}
                                  onSave={d => update.mutate({ id: c.id, d })} />
                              ) : (
                                <>
                                  {(c.contactName || c.contactEmail || c.contactPhone || c.address || c.notes) && (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-1.5 text-xs mb-3">
                                      <div><span className="text-gray-400">Contact</span><p className="text-gray-800">{c.contactName ?? '—'}</p></div>
                                      <div><span className="text-gray-400">Email</span><p className="text-gray-800">{c.contactEmail ?? '—'}</p></div>
                                      <div><span className="text-gray-400">Phone</span><p className="text-gray-800">{c.contactPhone ?? '—'}</p></div>
                                      <div><span className="text-gray-400">Address</span><p className="text-gray-800">{c.address ?? '—'}</p></div>
                                      {c.notes && <div className="sm:col-span-4"><span className="text-gray-400">Notes</span><p className="text-gray-800 whitespace-pre-wrap">{c.notes}</p></div>}
                                    </div>
                                  )}

                                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                    Project IDs ({c.pids.length})
                                  </p>
                                  {c.pids.length === 0 ? (
                                    <p className="text-xs text-gray-400">No Project IDs are attached to this client yet.</p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {c.pids.map(p => {
                                        const st = STATUS_META[p.status] ?? STATUS_META.DISCONTINUED;
                                        return (
                                          <div key={p.projectId} className="rounded-lg border border-gray-200 bg-white px-3 py-2 flex items-center gap-3 flex-wrap">
                                            {/* Straight through to this PID in the PID ledger. */}
                                            <Link href={`/pid-ledger?pid=${encodeURIComponent(p.pid ?? '')}`} onClick={e => e.stopPropagation()}
                                              title="Open this Project ID in the PID ledger"
                                              className="font-mono font-bold text-brand-700 hover:underline inline-flex items-center gap-1 shrink-0">
                                              <KeyRound size={12} />{p.pid ?? 'PID pending'}
                                            </Link>
                                            {p.rounds > 1 && (
                                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
                                                {p.rounds} projects
                                              </span>
                                            )}
                                            <Link href={`/projects/${p.projectId}`} onClick={e => e.stopPropagation()}
                                              className="text-gray-800 hover:text-brand-600 hover:underline truncate max-w-[220px] inline-flex items-center gap-1">
                                              {p.title}<ExternalLink size={10} className="text-gray-300" />
                                            </Link>
                                            {p.type && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{projectTypeLabel(p.type)}</span>}
                                            <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-medium', st.cls)}>{st.label}</span>
                                            <span className="ml-auto flex items-center gap-3 text-[11px] text-gray-500 shrink-0">
                                              <span>{p.progress}%</span>
                                              <span>{p.tasks} tasks</span>
                                              <span>{p.loggedHours}h</span>
                                              <span>{p.dueDate ? formatDate(p.dueDate) : 'no deadline'}</span>
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
