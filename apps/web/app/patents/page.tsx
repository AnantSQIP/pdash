'use client';

import Link from 'next/link';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  FileLock2, Plus, Trash2, Loader, ShieldAlert, KeyRound, Eye, EyeOff, Pencil, Check, X, Hash, FileText, Paperclip, Upload,
  Archive, ArchiveRestore, Search, ChevronDown} from 'lucide-react';
import { api, type ClientSummary, type PatentOverview } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

// Mirror of the server's patent-number check, so files that aren't named like a patent number
// are skipped before uploading (and the rest still go through).
function isPatentNumber(name: string): boolean {
  const n = (name || '').replace(/\.[^.]+$/, '').replace(/[\s,._()\-\/]/g, '').toUpperCase();
  return /^[A-Z]{0,2}\d{5,13}[A-Z]{0,2}\d?$/.test(n);
}

export default function PatentsPortalPage() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const allowed = can('patent.manage');

  const [selected, setSelected] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [numbersText, setNumbersText] = useState('');
  const [editingClient, setEditingClient] = useState(false);
  const [ecode, setEcode] = useState('');
  // Once the code is typed by hand, stop overwriting it with suggestions.
  const [codeTouched, setCodeTouched] = useState(false);
  // Debounced so a suggestion isn't requested on every keystroke.
  const [nameForSuggest, setNameForSuggest] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setNameForSuggest(newName.trim()), 350);
    return () => clearTimeout(t);
  }, [newName]);
  // The typed code is debounced too, so the live verdict costs one request per pause rather
  // than one per keystroke.
  const [codeForCheck, setCodeForCheck] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setCodeForCheck(newCode.trim()), 350);
    return () => clearTimeout(t);
  }, [newCode]);
  const { data: suggestion } = useQuery({
    queryKey: ['client-code-suggestion', nameForSuggest, codeForCheck],
    queryFn: () => api.clients.codeSuggestion(nameForSuggest, codeForCheck || undefined),
    enabled: nameForSuggest.length >= 2 || codeForCheck.length >= 2,
    staleTime: 60_000,
  });
  // The relationship facts, offered at creation rather than only afterwards on the ledger. All
  // optional: a client created for one search does not need an address, and demanding one only
  // produces a row of full stops.
  const [moreOpen, setMoreOpen] = useState(false);
  const [extra, setExtra] = useState<{
    contactName: string; contactEmail: string; contactPhone: string;
    website: string; country: string; industry: string; billingRate: string; billingCurrency: string;
  }>({ contactName: '', contactEmail: '', contactPhone: '', website: '', country: '', industry: '', billingRate: '', billingCurrency: 'INR' });
  const setExtraField = (k: keyof typeof extra) => (v: string) => setExtra(p => ({ ...p, [k]: v }));
  // Only trust a verdict that is about the code CURRENTLY in the box — the debounce means a stale
  // one can otherwise be on screen for a moment, marking a good code red or a bad code fine.
  const codeVerdict = suggestion?.typed && suggestion.typed.code === newCode.trim().toUpperCase()
    ? suggestion.typed : null;
  // Fill the code only while the user hasn't touched it — never clobber what they typed.
  useEffect(() => {
    if (!codeTouched && suggestion?.code) setNewCode(suggestion.code);
  }, [suggestion?.code, codeTouched]);
  const [ename, setEname] = useState('');
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
  // Open a patent's document — fetched as a blob so the passcode header is sent, then opened.
  async function openDoc(id: string) {
    try {
      const blob = await api.patents.downloadDocument(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { setErr(msg(e)); }
  }

  const createClient = useMutation({
    mutationFn: () => api.clients.create({
      code: newCode.trim(),
      name: newName.trim() || undefined,
      contactName: extra.contactName.trim() || null,
      contactEmail: extra.contactEmail.trim() || null,
      contactPhone: extra.contactPhone.trim() || null,
      website: extra.website.trim() || null,
      country: extra.country.trim() || null,
      industry: extra.industry.trim() || null,
      billingRate: extra.billingRate.trim() === '' ? null : Number(extra.billingRate),
      billingCurrency: extra.billingCurrency,
    }),
    onSuccess: (c) => {
      setNewCode(''); setNewName(''); setErr(''); setMoreOpen(false); setCodeTouched(false);
      setExtra({ contactName: '', contactEmail: '', contactPhone: '', website: '', country: '', industry: '', billingRate: '', billingCurrency: 'INR' });
      qc.invalidateQueries({ queryKey: ['clients'] }); pick(c.id);
    },
    onError: e => setErr(msg(e)),
  });
  const removeClient = useMutation({
    mutationFn: (id: string) => api.clients.remove(id),
    onSuccess: () => { setSelected(null); resetReveal(); qc.invalidateQueries({ queryKey: ['clients'] }); },
    onError: e => setErr(msg(e)),
  });
  // Archive/restore: reversible, no passcode, and the client stays selected so the effect of
  // the change is visible where it was made.
  const setArchived = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? api.clients.archive(id) : api.clients.restore(id),
    onSuccess: () => { setErr(''); qc.invalidateQueries({ queryKey: ['clients'] }); },
    onError: e => setErr(msg(e)),
  });
  const register = useMutation({
    // Split on NEWLINES only — a comma is a legal thousands-separator in a patent number
    // ("US 9,876,543 B2"), so splitting on it shredded one number into junk rows. One per line.
    mutationFn: () => api.patents.register({ clientId: selected!, realNumbers: numbersText.split(/\n/).map(s => s.trim()).filter(Boolean) }),
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
    // Don't clear err here — the "skipped bad-named files" notice is set on file-select.
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['patents', selected] }); qc.invalidateQueries({ queryKey: ['clients'] }); },
    onError: e => setErr(msg(e)),
  });
  const editClient = useMutation({
    mutationFn: () => api.clients.update(selected!, { code: ecode.trim() || undefined, name: ename.trim() || undefined }),
    onSuccess: () => { setEditingClient(false); setErr(''); resetReveal(); qc.invalidateQueries({ queryKey: ['clients'] }); qc.invalidateQueries({ queryKey: ['patents', selected] }); },
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

      <HandleLookup />

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
                  selected === c.id && 'bg-brand-50/70',
                  // Archived codes stay listed and selectable — their patents are still real —
                  // but they read as retired rather than current.
                  c.archivedAt && 'opacity-55')}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-mono font-semibold text-gray-800 truncate">
                    {c.code}
                    {c.archivedAt && <span className="ml-1.5 font-sans text-[10px] font-medium text-gray-400 uppercase tracking-wide">Archived</span>}
                  </span>
                  {c.name && <span className="block text-[11px] text-gray-400 truncate">{c.name}</span>}
                </span>
                <span className="text-xs text-gray-400 shrink-0">{c._count?.patents ?? 0}</span>
              </button>
            ))}
          </div>
          {/* New client code */}
          <div className="p-3 border-t border-gray-100 bg-gray-50/50 space-y-2">
            {/* Name first, then the code — the code is DERIVED from the name, so asking for it
                the other way round meant everyone invented their own convention. The suggestion
                is only a default: typing over it is expected, and the server has the final say. */}
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Client name (optional)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
            />
            <div>
              <input
                value={newCode}
                onChange={e => { setCodeTouched(true); setNewCode(e.target.value.toUpperCase()); }}
                placeholder="Client code * (e.g. MLK)"
                className={clsx('w-full px-3 py-2 text-sm border rounded-lg font-mono focus:outline-none',
                  codeVerdict && !codeVerdict.ok ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-brand-500')}
              />
              {/* The verdict runs the SAME check the save runs, so the form can never green-light
                  a code the save then refuses — including the retired-code rule, which plain
                  validation cannot see (a code can be free and still be unusable because patent
                  IDs were once issued under it). */}
              {codeVerdict && !codeVerdict.ok && (
                <p className="text-[11px] text-red-600 mt-1">{codeVerdict.reason}</p>
              )}
              {codeVerdict?.ok && codeVerdict.readable && (
                <p className="text-[11px] text-amber-700 mt-1">
                  This code can be pronounced, so it is a code people remember — and every patent ID
                  built from it carries that hint outside the firm. Fine if you want it readable.
                </p>
              )}
              {!codeTouched && newCode && !codeVerdict && (
                <p className="text-[11px] text-gray-400 mt-1">Suggested — it says nothing about the client.</p>
              )}

              {/* Alternatives, so choosing a different code is one click rather than a reload. */}
              {(suggestion?.options?.length || suggestion?.mnemonic) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-gray-400 mr-0.5">Or:</span>
                  {(suggestion?.options ?? []).filter(o => o !== newCode).slice(0, 4).map(o => (
                    <button
                      key={o} onClick={() => { setCodeTouched(true); setNewCode(o); }}
                      className="px-1.5 py-0.5 text-[11px] font-mono rounded border border-gray-200 text-gray-600 hover:bg-white hover:border-brand-300"
                    >
                      {o}
                    </button>
                  ))}
                  {suggestion?.mnemonic && suggestion.mnemonic !== newCode && (
                    <button
                      onClick={() => { setCodeTouched(true); setNewCode(suggestion.mnemonic); }}
                      title="Readable, and therefore a hint at the client's name on every patent ID."
                      className="px-1.5 py-0.5 text-[11px] font-mono rounded border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    >
                      {suggestion.mnemonic} ·  readable
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Everything else about the client. Collapsed, because a code and a name are all
                that is REQUIRED to mint handles — but available here, because the alternative is
                creating the client and then going to a second screen to say who they are. */}
            <button
              onClick={() => setMoreOpen(v => !v)}
              className="w-full flex items-center justify-between text-[11px] font-medium text-gray-500 hover:text-gray-700 px-0.5"
            >
              <span>Contact, country and rate {moreOpen ? '' : '(optional)'}</span>
              <ChevronDown size={12} className={clsx('transition-transform', moreOpen && 'rotate-180')} />
            </button>
            {moreOpen && (
              <div className="space-y-2">
                <input
                  value={extra.contactName} onChange={e => setExtraField('contactName')(e.target.value)}
                  placeholder="Contact person"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
                />
                <input
                  value={extra.contactEmail} onChange={e => setExtraField('contactEmail')(e.target.value)}
                  placeholder="Email" type="email"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={extra.contactPhone} onChange={e => setExtraField('contactPhone')(e.target.value)}
                    placeholder="Phone"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
                  />
                  <input
                    value={extra.country} onChange={e => setExtraField('country')(e.target.value)}
                    placeholder="Country"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={extra.website} onChange={e => setExtraField('website')(e.target.value)}
                    placeholder="Website"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
                  />
                  <input
                    value={extra.industry} onChange={e => setExtraField('industry')(e.target.value)}
                    placeholder="Industry"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={extra.billingCurrency} onChange={e => setExtraField('billingCurrency')(e.target.value)}
                    className="px-2 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500"
                  >
                    {['INR', 'USD', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input
                    value={extra.billingRate} onChange={e => setExtraField('billingRate')(e.target.value)}
                    placeholder="Hourly rate" inputMode="decimal"
                    className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg tabular-nums focus:outline-none focus:border-brand-500"
                  />
                </div>
                <p className="text-[11px] text-gray-400">
                  A rate lets the client ledger price the hours instead of waiting for someone to type a total.
                </p>
              </div>
            )}
            {/* The failure this prevents: a second code for a company we already have, which
                silently splits that client's patents across two portfolios. */}
            {suggestion?.similar?.length ? (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                Already on file: {suggestion.similar.map(c => `${c.name || '—'} (${c.code})`).join(', ')}. Use the
                existing code unless this is genuinely a different client.
              </p>
            ) : null}
            <button
              onClick={() => createClient.mutate()}
              disabled={createClient.isPending || !newCode.trim() || codeVerdict?.ok === false}
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
                <div className="min-w-0 flex-1">
                  {editingClient ? (
                    <div className="flex items-center gap-2">
                      <input value={ecode} onChange={e => setEcode(e.target.value.toUpperCase())} placeholder="CODE" autoFocus
                        className="w-24 px-2 py-1 text-sm font-mono border border-brand-300 rounded focus:outline-none focus:border-brand-500" />
                      <input value={ename} onChange={e => setEname(e.target.value)} placeholder="Name (optional)"
                        className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-brand-500" />
                      <button onClick={() => editClient.mutate()} disabled={editClient.isPending || !ecode.trim()} title="Save"
                        className="p-1 text-green-600 hover:bg-green-50 rounded shrink-0 disabled:opacity-40">
                        {editClient.isPending ? <Loader size={15} className="animate-spin" /> : <Check size={15} />}
                      </button>
                      <button onClick={() => setEditingClient(false)} title="Cancel" className="p-1 text-gray-400 hover:bg-gray-100 rounded shrink-0"><X size={15} /></button>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-sm font-semibold text-gray-800 font-mono flex items-center gap-2">
                        <span className="truncate">{active.code}{active.name ? <span className="ml-2 font-sans font-normal text-gray-400">{active.name}</span> : null}</span>
                        <button onClick={() => { setEditingClient(true); setEcode(active.code); setEname(active.name ?? ''); setErr(''); }}
                          title="Edit code / name" className="text-gray-300 hover:text-brand-600 shrink-0"><Pencil size={12} /></button>
                      </h2>
                      <p className="text-[11px] text-gray-400">
                        IDs mint as <span className="font-mono">Pat_{active.code}_001</span>, in serial order ·
                        renaming the code re-mints the IDs, and the old ones keep resolving
                      </p>
                    </>
                  )}
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
                  {/* Archive is the button people should reach for; Remove sits beside it as the
                      smaller, destructive one, and the server refuses it while anything depends
                      on the client. */}
                  <button
                    onClick={() => {
                      // Archiving a client whose work is still running is occasionally right and
                      // usually a mistake. Say what is live before it happens, not after.
                      const live = active.activeProjects ?? 0;
                      if (!active.archivedAt && live > 0 && !confirm(
                        `${active.code} still has ${live} project${live === 1 ? '' : 's'} running. `
                        + `Archiving keeps everything, but the client leaves the patent picker and takes no new patents.\n\nArchive anyway?`,
                      )) return;
                      setArchived.mutate({ id: active.id, archived: !active.archivedAt });
                    }}
                    disabled={setArchived.isPending}
                    title={active.archivedAt ? 'Restore this client to active use' : 'Retire this client — nothing is deleted'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    {setArchived.isPending ? <Loader size={13} className="animate-spin" />
                      : active.archivedAt ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                    {active.archivedAt ? 'Restore' : 'Archive'}
                  </button>
                  <button
                    onClick={() => {
                      const held = (active._count?.patents ?? 0) + (active._count?.projects ?? 0);
                      if (held) {
                        setErr(`${active.code} still has ${active._count?.patents ?? 0} patent(s) and ${active._count?.projects ?? 0} project(s). Removing it would destroy those records — archive it instead.`);
                        return;
                      }
                      if (confirm(`Permanently remove client code ${active.code}? This cannot be undone.`)) removeClient.mutate(active.id);
                    }}
                    disabled={removeClient.isPending} title="Remove client code permanently"
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Add patents — by number, or by uploading documents (one patent per file).
                  An archived client accepts neither, so the whole block is replaced by the reason
                  and the way out; the server refuses these calls regardless. */}
              {active.archivedAt ? (
                <div className="p-4 border-b border-gray-100 bg-gray-50/60 flex items-start gap-2.5">
                  <Archive size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-500">
                    <b className="text-gray-700">This client is archived.</b> Its patents are kept and stay linked to
                    their projects, but no new patents can be added and it no longer appears in the project patent
                    picker. Restore it to work with it again.
                  </p>
                </div>
              ) : (
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
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Or upload documents — one patent per file. <b className="text-gray-700">Name each file as its patent number</b> (e.g. <span className="font-mono">US1234567.pdf</span>); others are skipped.</label>
                  <label className={clsx('inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-dashed rounded-lg cursor-pointer transition',
                    createFromDoc.isPending ? 'border-brand-300 bg-brand-50/40 text-brand-600' : 'border-gray-300 text-gray-600 hover:border-brand-400 hover:bg-brand-50/40')}>
                    {createFromDoc.isPending ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
                    {createFromDoc.isPending ? 'Uploading…' : 'Choose files'}
                    <input type="file" multiple className="hidden" accept=".pdf,.doc,.docx,image/*,application/*"
                      onChange={e => {
                        const fs = Array.from(e.target.files ?? []);
                        const valid = fs.filter(f => isPatentNumber(f.name));
                        const skipped = fs.filter(f => !isPatentNumber(f.name));
                        setErr(skipped.length ? `Skipped ${skipped.length} file(s) not named like a patent number: ${skipped.map(f => f.name).join(', ')}` : '');
                        if (valid.length) createFromDoc.mutate(valid);
                        (e.target as HTMLInputElement).value = '';
                      }} />
                  </label>
                </div>
              </div>
              )}

              {/* Patent list */}
              <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
                {patentsLoading ? (
                  <p className="px-5 py-4 text-xs text-gray-400">Loading…</p>
                ) : patents.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-gray-400 text-center">No patents yet — upload some above.</p>
                ) : patents.map(p => (
                  <div key={p.id} className="px-5 py-2.5 flex items-center gap-4 hover:bg-gray-50">
                    <span className="w-32 shrink-0">
                      <span className="block text-sm font-mono font-semibold text-brand-700">{p.handle}</span>
                      {/* IDs this patent was shared under before a code rename. They still
                          resolve, and showing them is how anyone knows that. */}
                      {p.formerHandles?.length ? (
                        <span className="block text-[10px] text-gray-400 font-mono truncate" title={p.formerHandles.join(', ')}>
                          was {p.formerHandles.join(', ')}
                        </span>
                      ) : null}
                      {/* WHERE THIS PATENT HAS ACTUALLY BEEN WORKED ON. Without it the portal
                          answers "which patents exist" and not "what have we done about this
                          one" — and a patent with a year of work behind it looked identical to
                          one nobody has touched. */}
                      {p.projects?.length ? (
                        <span className="block mt-0.5 space-y-0.5">
                          {p.projects.slice(0, 2).map(pr => (
                            <Link key={pr.id} href={`/projects/${pr.id}`}
                              className="block text-[10px] font-mono text-gray-500 hover:text-brand-600 truncate"
                              title={pr.title}>
                              {pr.code}{pr.roundSeq > 1 ? ` · r${pr.roundSeq}` : ''}
                            </Link>
                          ))}
                          {p.projects.length > 2 && (
                            <span className="block text-[10px] text-gray-400">+{p.projects.length - 2} more</span>
                          )}
                        </span>
                      ) : (
                        <span className="block mt-0.5 text-[10px] text-amber-600">not tagged to any work</span>
                      )}
                    </span>
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
                      {/* Show a generic "Document" link (never the filename — an upload's filename
                          is the confidential real number and must not appear on this passcode-free
                          list). The bytes come from the passcode-gated document route by patent id. */}
                      {p.documentId && (
                        <button type="button" onClick={() => openDoc(p.id)} title="View document (passcode required)"
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                          <FileText size={13} className="shrink-0" /> <span>Document</span>
                        </button>
                      )}
                      <label title={p.documentId ? 'Replace document' : 'Attach PDF/media'}
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

/**
 * "A client just quoted Pat_MLK_7 at us — what is that now?"
 *
 * Renaming a client code re-mints every ID under it, and the old ones are already out in the
 * world. Without somewhere to type one in, the answer to that question was "search the portal,
 * find nothing, and assume the patent was deleted".
 */
function HandleLookup() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ handle: string; current: boolean; ambiguous?: boolean; searchedFor: string } | null>(null);
  const [error, setError] = useState('');

  const lookup = useMutation({
    mutationFn: () => api.patents.resolve(query.trim()),
    onSuccess: r => { setResult(r); setError(''); },
    onError: e => { setResult(null); setError(msg(e)); },
  });

  return (
    <div className="mt-4 bg-white rounded-xl border border-gray-200 px-4 py-3">
      <form
        onSubmit={e => { e.preventDefault(); if (query.trim()) lookup.mutate(); }}
        className="flex flex-wrap items-center gap-2"
      >
        <label className="text-xs font-medium text-gray-600 shrink-0">Look up a patent ID</label>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setResult(null); setError(''); }}
          placeholder="Pat_MLK_7"
          className="w-44 px-3 py-1.5 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
        />
        <button
          type="submit" disabled={lookup.isPending || !query.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {lookup.isPending ? <Loader size={13} className="animate-spin" /> : <Search size={13} />} Find
        </button>
        {result && (
          result.ambiguous ? (
            // Legacy data only — new codes can no longer be recycled, but IDs issued before
            // that rule existed can still mean two things, and saying so beats picking one.
            <span className="text-xs text-red-700">
              <span className="font-mono">{result.searchedFor}</span> is ambiguous — it is live for{' '}
              <span className="font-mono font-semibold">{result.handle}</span> and was also retired from another
              patent. Check which client the ID came from.
            </span>
          ) : result.current ? (
            <span className="text-xs text-gray-500">
              <span className="font-mono font-semibold text-brand-700">{result.handle}</span> is current.
            </span>
          ) : (
            <span className="text-xs text-amber-700">
              <span className="font-mono">{result.searchedFor}</span> was renamed — it is now{' '}
              <span className="font-mono font-semibold">{result.handle}</span>.
            </span>
          )
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>
      <p className="text-[11px] text-gray-400 mt-1.5">
        Finds retired IDs too, so an ID quoted from an older report still resolves.
      </p>
    </div>
  );
}
