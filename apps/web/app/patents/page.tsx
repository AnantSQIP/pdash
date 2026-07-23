'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  FileLock2, Plus, Trash2, Loader, ShieldAlert, KeyRound, Eye, EyeOff, Pencil, Check, X, Hash, FileText, Paperclip, Upload,
} from 'lucide-react';
import { api, type ClientSummary, type PatentOverview } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export default function PatentsPortalPage() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const allowed = can('patent.manage');

  const [selected, setSelected] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [numbersText, setNumbersText] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({}); // patentId → real number
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [err, setErr] = useState('');

  const { data: clients = [], isLoading: clientsLoading } = useQuery<ClientSummary[]>({
    queryKey: ['clients'], queryFn: () => api.clients.list(), enabled: allowed,
  });
  const { data: patents = [], isLoading: patentsLoading } = useQuery<PatentOverview[]>({
    queryKey: ['patents', selected], queryFn: () => api.patents.list(selected!), enabled: allowed && !!selected,
  });

  const resetReveal = () => { setRevealed({}); setEditingId(null); };
  const pick = (id: string) => { setSelected(id); resetReveal(); setErr(''); };

  const createClient = useMutation({
    mutationFn: () => api.clients.create({ code: newCode.trim(), name: newName.trim() || undefined }),
    onSuccess: (c) => { setNewCode(''); setNewName(''); setErr(''); qc.invalidateQueries({ queryKey: ['clients'] }); pick(c.id); },
    onError: e => setErr(msg(e)),
  });
  const removeClient = useMutation({
    mutationFn: (id: string) => api.clients.remove(id),
    onSuccess: () => { setSelected(null); resetReveal(); qc.invalidateQueries({ queryKey: ['clients'] }); },
    onError: e => setErr(msg(e)),
  });
  const register = useMutation({
    mutationFn: () => api.patents.register({ clientId: selected!, realNumbers: numbersText.split(/[\n,]/).map(s => s.trim()).filter(Boolean) }),
    onSuccess: () => { setNumbersText(''); setErr(''); qc.invalidateQueries({ queryKey: ['patents', selected] }); qc.invalidateQueries({ queryKey: ['clients'] }); },
    onError: e => setErr(msg(e)),
  });
  const removePatent = useMutation({
    mutationFn: (id: string) => api.patents.remove(id),
    onSuccess: (_r, id) => { setRevealed(prev => { const n = { ...prev }; delete n[id as string]; return n; }); qc.invalidateQueries({ queryKey: ['patents', selected] }); qc.invalidateQueries({ queryKey: ['clients'] }); },
    onError: e => setErr(msg(e)),
  });
  const reveal = useMutation({
    mutationFn: () => api.patents.reveal(selected!),
    onSuccess: (rows) => { setRevealed(Object.fromEntries(rows.map(r => [r.id, r.realNumber]))); setErr(''); },
    onError: e => setErr(msg(e)),
  });
  const attachDoc = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => api.patents.uploadDocument(id, file),
    onSuccess: () => { setErr(''); qc.invalidateQueries({ queryKey: ['patents', selected] }); },
    onError: e => setErr(msg(e)),
  });
  const createFromDoc = useMutation({
    mutationFn: async (files: File[]) => { for (const f of files) await api.patents.createFromDocument(selected!, f); },
    onSuccess: () => { setErr(''); qc.invalidateQueries({ queryKey: ['patents', selected] }); qc.invalidateQueries({ queryKey: ['clients'] }); },
    onError: e => setErr(msg(e)),
  });
  const saveEdit = useMutation({
    mutationFn: (id: string) => api.patents.update(id, editValue.trim()),
    onSuccess: (_r, id) => { setRevealed(prev => ({ ...prev, [id as string]: editValue.trim() })); setEditingId(null); setErr(''); },
    onError: e => setErr(msg(e)),
  });

  if (!allowed) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <ShieldAlert className="mx-auto text-gray-300" size={40} />
        <h1 className="mt-3 text-lg font-semibold text-gray-800">Restricted</h1>
        <p className="text-sm text-gray-500 mt-1">The patent portal holds confidential client data and is limited to Super Admins.</p>
      </div>
    );
  }

  const active = clients.find(c => c.id === selected);
  const isRevealed = Object.keys(revealed).length > 0;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><FileLock2 size={20} /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Patent Portal</h1>
          <p className="text-sm text-gray-500 flex items-center gap-1.5">
            <KeyRound size={12} className="text-amber-500" /> Confidential — real patent numbers unlock only with the organization passcode.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 mt-5">
        {/* ── Client Code ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden self-start">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Hash size={14} /> Client Code</h2>
          </div>
          <div className="divide-y divide-gray-50 max-h-[340px] overflow-y-auto">
            {clientsLoading ? (
              <p className="px-4 py-3 text-xs text-gray-400">Loading…</p>
            ) : clients.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-400">No client codes yet. Add one below.</p>
            ) : clients.map(c => (
              <button
                key={c.id}
                onClick={() => pick(c.id)}
                className={clsx('w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 transition',
                  selected === c.id && 'bg-brand-50/70')}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-mono font-semibold text-gray-800 truncate">{c.code}</span>
                  {c.name && <span className="block text-[11px] text-gray-400 truncate">{c.name}</span>}
                </span>
                <span className="text-xs text-gray-400 shrink-0">{c._count?.patents ?? 0}</span>
              </button>
            ))}
          </div>
          {/* New client code */}
          <div className="p-3 border-t border-gray-100 bg-gray-50/50 space-y-2">
            <input
              value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())}
              placeholder="Client code * (e.g. MLK)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:border-brand-500"
            />
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Client name (optional)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
            />
            <button
              onClick={() => createClient.mutate()}
              disabled={createClient.isPending || !newCode.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              {createClient.isPending ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Add code
            </button>
            <p className="text-[11px] text-amber-600 flex items-center gap-1"><KeyRound size={11} /> Passcode required.</p>
          </div>
        </div>

        {/* ── Patents for the selected code ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {!active ? (
            <div className="p-10 text-center text-sm text-gray-400">Select a client code to view and manage its patents.</div>
          ) : (
            <>
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-gray-800 font-mono">{active.code}{active.name ? <span className="ml-2 font-sans font-normal text-gray-400">{active.name}</span> : null}</h2>
                  <p className="text-[11px] text-gray-400">IDs mint as <span className="font-mono">Pat_{active.code}_001</span>, in serial order</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isRevealed ? (
                    <button onClick={resetReveal} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                      <EyeOff size={13} /> Hide numbers
                    </button>
                  ) : (
                    <button onClick={() => reveal.mutate()} disabled={reveal.isPending || patents.length === 0}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
                      {reveal.isPending ? <Loader size={13} className="animate-spin" /> : <Eye size={13} />} Reveal numbers
                    </button>
                  )}
                  <button onClick={() => { if (confirm(`Remove client code ${active.code} and all its patents?`)) removeClient.mutate(active.id); }}
                    disabled={removeClient.isPending} title="Remove client code"
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Add patents — by number, or by uploading documents (one patent per file). */}
              <div className="p-4 border-b border-gray-100 bg-gray-50/40 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Add by number — one real number per line</label>
                  <textarea rows={3} value={numbersText} onChange={e => setNumbersText(e.target.value)} placeholder={'US1234567\nUS2345678'}
                    className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 resize-none" />
                  <div className="flex justify-end mt-2">
                    <button onClick={() => register.mutate()} disabled={register.isPending || !numbersText.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                      {register.isPending ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Add patents
                    </button>
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Or upload documents (PDF / Word / media) — one patent per file, ID auto-generated</label>
                  <label className={clsx('inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-dashed rounded-lg cursor-pointer transition',
                    createFromDoc.isPending ? 'border-brand-300 bg-brand-50/40 text-brand-600' : 'border-gray-300 text-gray-600 hover:border-brand-400 hover:bg-brand-50/40')}>
                    {createFromDoc.isPending ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
                    {createFromDoc.isPending ? 'Uploading…' : 'Choose files'}
                    <input type="file" multiple className="hidden" accept=".pdf,.doc,.docx,image/*,application/*"
                      onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) createFromDoc.mutate(fs); (e.target as HTMLInputElement).value = ''; }} />
                  </label>
                </div>
              </div>

              {/* Patent list */}
              <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
                {patentsLoading ? (
                  <p className="px-5 py-4 text-xs text-gray-400">Loading…</p>
                ) : patents.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-gray-400 text-center">No patents yet — upload some above.</p>
                ) : patents.map(p => (
                  <div key={p.id} className="px-5 py-2.5 flex items-center gap-4 hover:bg-gray-50">
                    <span className="text-sm font-mono font-semibold text-brand-700 w-32 shrink-0">{p.handle}</span>
                    <span className="text-sm text-gray-800 flex-1 font-mono min-w-0">
                      {editingId === p.id ? (
                        <span className="flex items-center gap-1.5">
                          <input value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus
                            className="flex-1 px-2 py-1 text-sm border border-brand-300 rounded focus:outline-none" />
                          <button onClick={() => saveEdit.mutate(p.id)} disabled={saveEdit.isPending} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={15} /></button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={15} /></button>
                        </span>
                      ) : revealed[p.id] !== undefined ? (
                        <span className="flex items-center gap-2">
                          {revealed[p.id]}
                          <button onClick={() => { setEditingId(p.id); setEditValue(revealed[p.id]); }} title="Edit number" className="p-0.5 text-gray-300 hover:text-brand-600"><Pencil size={13} /></button>
                        </span>
                      ) : (
                        <span className="text-gray-300 tracking-widest">•••••••••</span>
                      )}
                    </span>
                    {/* Attached patent document (PDF/media) — view + attach/replace */}
                    <span className="shrink-0 flex items-center gap-1">
                      {p.documentName && (
                        <a href={api.patents.documentUrl(p.id)} target="_blank" rel="noreferrer" title={p.documentName}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline max-w-[130px]">
                          <FileText size={13} className="shrink-0" /> <span className="truncate">{p.documentName}</span>
                        </a>
                      )}
                      <label title={p.documentName ? 'Replace document' : 'Attach PDF/media'}
                        className="inline-flex items-center p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-brand-600 cursor-pointer">
                        {attachDoc.isPending && attachDoc.variables?.id === p.id ? <Loader size={14} className="animate-spin" /> : <Paperclip size={14} />}
                        <input type="file" className="hidden" accept=".pdf,image/*,application/*"
                          onChange={e => { const f = e.target.files?.[0]; if (f) attachDoc.mutate({ id: p.id, file: f }); (e.target as HTMLInputElement).value = ''; }} />
                      </label>
                    </span>
                    <button onClick={() => { if (confirm(`Remove ${p.handle}?`)) removePatent.mutate(p.id); }} disabled={removePatent.isPending}
                      title="Remove patent" className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 shrink-0">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </div>
  );
}
