'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Megaphone, FileText, Network, Plus, X, Loader, Pin, PinOff, Pencil, Trash2, Check,
  Cake, PartyPopper, Download, CheckCircle2, ChevronRight, Users as UsersIcon,
} from 'lucide-react';
import clsx from 'clsx';
import {
  api, type Announcement, type Celebrations, type OrgChartNode, type Policy, type PolicyAckStatus,
} from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';
import { AttachButton, PendingAttachmentChips, useAttachmentUploads } from '@/components/files/Attachments';

function fmtDate(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const inDaysLabel = (d: number) => d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `in ${d} days`;

// ── Announcement composer ───────────────────────────────────────────────────────
function AnnouncementModal({ existing, onClose, onDone }: { existing?: Announcement; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [pinned, setPinned] = useState(!!existing?.pinnedAt);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      if (existing) await api.company.updateAnnouncement(existing.id, { title: title.trim(), body, pinned });
      else await api.company.createAnnouncement({ title: title.trim(), body, pinned });
      toast(existing ? 'Announcement updated' : 'Announcement posted'); onDone(); onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'error'); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{existing ? 'Edit announcement' : 'New announcement'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" maxLength={200}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500" />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} maxLength={10000} placeholder="Write your announcement…"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500 resize-none" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Pin to the top of the feed</span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={!title.trim() || !body.trim() || busy} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {busy ? <Loader size={14} className="animate-spin" /> : <Megaphone size={14} />} {existing ? 'Save' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Feed tab ──────────────────────────────────────────────────────────────────
function FeedTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({ queryKey: ['announcements'], queryFn: () => api.company.announcements() });
  const { data: celebrations } = useQuery<Celebrations>({ queryKey: ['celebrations'], queryFn: () => api.company.celebrations() });
  const refresh = () => qc.invalidateQueries({ queryKey: ['announcements'] });

  async function pin(a: Announcement) { try { await api.company.pinAnnouncement(a.id); refresh(); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); } }
  async function del(a: Announcement) { if (!confirm('Delete this announcement?')) return; try { await api.company.deleteAnnouncement(a.id); refresh(); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); } }

  const anniversaries = celebrations?.anniversaries ?? [];
  const birthdays = celebrations?.birthdays ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-3">
        {canManage && (
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
            <Plus size={14} /> New announcement
          </button>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader size={18} className="animate-spin text-gray-400" /></div>
        ) : announcements.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center border border-dashed border-gray-200 rounded-xl">No announcements yet.</p>
        ) : announcements.map(a => (
          <article key={a.id} className={clsx('border rounded-xl p-4', a.pinnedAt ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200')}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {a.pinnedAt && <Pin size={14} className="text-amber-500 shrink-0" />}
                <h3 className="font-semibold text-gray-900">{a.title}</h3>
              </div>
              {canManage && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => pin(a)} title={a.pinnedAt ? 'Unpin' : 'Pin'} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg">{a.pinnedAt ? <PinOff size={14} /> : <Pin size={14} />}</button>
                  <button onClick={() => setEditing(a)} title="Edit" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><Pencil size={14} /></button>
                  <button onClick={() => del(a)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mt-1.5">{a.body}</p>
            <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
              {a.author && <Avatar user={a.author} size={18} />}
              <span>{a.author ? fullName(a.author) : 'HR'} · {fmtDate(a.createdAt)}</span>
            </div>
          </article>
        ))}
      </div>

      {/* Celebrations */}
      <aside className="space-y-4">
        <div className="border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3"><PartyPopper size={16} className="text-brand-600" /> Work anniversaries</h3>
          {anniversaries.length === 0 ? <p className="text-xs text-gray-400">None in the next 30 days.</p> : (
            <ul className="space-y-2.5">
              {anniversaries.map(c => (
                <li key={c.user.id} className="flex items-center gap-2.5">
                  <Avatar user={c.user} size={30} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">{fullName(c.user)}</p>
                    <p className="text-[11px] text-gray-400">{c.years} yr{c.years === 1 ? '' : 's'} · {MONTHS[c.month]} {c.day} · {inDaysLabel(c.inDays)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3"><Cake size={16} className="text-pink-500" /> Birthdays</h3>
          {birthdays.length === 0 ? <p className="text-xs text-gray-400">None in the next 30 days.</p> : (
            <ul className="space-y-2.5">
              {birthdays.map(c => (
                <li key={c.user.id} className="flex items-center gap-2.5">
                  <Avatar user={c.user} size={30} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">{fullName(c.user)}</p>
                    <p className="text-[11px] text-gray-400">{MONTHS[c.month]} {c.day} · {inDaysLabel(c.inDays)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {showNew && <AnnouncementModal onClose={() => setShowNew(false)} onDone={refresh} />}
      {editing && <AnnouncementModal existing={editing} onClose={() => setEditing(null)} onDone={refresh} />}
    </div>
  );
}

// ── Policy composer ─────────────────────────────────────────────────────────────
function PolicyModal({ existing, onClose, onDone }: { existing?: Policy; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const attachments = useAttachmentUploads();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [requiresAck, setRequiresAck] = useState(!!existing?.requiresAck);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    const documentId = attachments.documentIds[0] || existing?.documentId || undefined;
    if (!body.trim() && !documentId) { toast('Add a document or some text', 'error'); return; }
    setBusy(true);
    try {
      const data = { title: title.trim(), category: category.trim() || undefined, description: description.trim() || undefined, body: body.trim() || undefined, documentId, requiresAck };
      if (existing) await api.company.updatePolicy(existing.id, data);
      else await api.company.createPolicy(data);
      toast(existing ? 'Policy updated' : 'Policy published'); onDone(); onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'error'); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[calc(100dvh-4rem)] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{existing ? 'Edit policy' : 'New policy'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto">
          <div className="flex gap-3">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Policy title *" maxLength={200}
              className="flex-[2] text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500" />
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category" maxLength={60}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500" />
          </div>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description" maxLength={1000}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500" />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} maxLength={50000} placeholder="Policy text (or attach a document below)"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500 resize-none" />
          <div>
            {attachments.error && <p className="text-xs text-red-600 mb-1">{attachments.error}</p>}
            <PendingAttachmentChips items={attachments.pending} onRemove={attachments.remove} />
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <AttachButton onPick={attachments.add} title="Attach a document (PDF, etc.)" />
              <span>{existing?.document && !attachments.pending.length ? `Current file: ${existing.document.name}` : 'Attach a document (optional)'}</span>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={requiresAck} onChange={e => setRequiresAck(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Require employees to acknowledge they&apos;ve read this</span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={!title.trim() || attachments.uploading || busy} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {busy ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} {existing ? 'Save' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AckStatusModal({ policy, onClose }: { policy: Policy; onClose: () => void }) {
  const { data: rows = [], isLoading } = useQuery<PolicyAckStatus[]>({ queryKey: ['policy-acks', policy.id], queryFn: () => api.company.policyAckStatus(policy.id) });
  const done = rows.filter(r => r.acknowledgedAt);
  const pending = rows.filter(r => !r.acknowledgedAt);
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[calc(100dvh-4rem)] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div><h2 className="text-base font-semibold text-gray-900">Acknowledgements</h2><p className="text-xs text-gray-400">{done.length}/{rows.length} acknowledged</p></div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-4 py-3">
          {isLoading ? <div className="flex justify-center py-8"><Loader size={18} className="animate-spin text-gray-400" /></div> : (
            <>
              {pending.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 px-2 mb-1">Pending ({pending.length})</p>}
              {pending.map(r => <div key={r.user.id} className="flex items-center gap-2.5 px-2 py-1.5"><Avatar user={r.user} size={26} /><span className="text-sm text-gray-700">{fullName(r.user)}</span></div>)}
              {done.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wide text-green-600 px-2 mt-3 mb-1">Acknowledged ({done.length})</p>}
              {done.map(r => (
                <div key={r.user.id} className="flex items-center gap-2.5 px-2 py-1.5">
                  <Avatar user={r.user} size={26} /><span className="text-sm text-gray-700 flex-1">{fullName(r.user)}</span>
                  <span className="text-[11px] text-gray-400">{fmtDate(r.acknowledgedAt)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Policies tab ──────────────────────────────────────────────────────────────
function PoliciesTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [ackFor, setAckFor] = useState<Policy | null>(null);
  const { data: policies = [], isLoading } = useQuery<Policy[]>({ queryKey: ['policies'], queryFn: () => api.company.policies() });
  const refresh = () => qc.invalidateQueries({ queryKey: ['policies'] });

  async function acknowledge(p: Policy) { try { await api.company.acknowledgePolicy(p.id); refresh(); toast('Acknowledged'); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); } }
  async function del(p: Policy) { if (!confirm('Delete this policy?')) return; try { await api.company.deletePolicy(p.id); refresh(); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); } }

  const groups = useMemo(() => {
    const m = new Map<string, Policy[]>();
    for (const p of policies) { const k = p.category || 'General'; (m.get(k) ?? m.set(k, []).get(k)!).push(p); }
    return [...m.entries()];
  }, [policies]);

  return (
    <div className="max-w-3xl space-y-5">
      {canManage && (
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
          <Plus size={14} /> New policy
        </button>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader size={18} className="animate-spin text-gray-400" /></div>
      ) : policies.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center border border-dashed border-gray-200 rounded-xl">No policies published yet.</p>
      ) : groups.map(([cat, items]) => (
        <div key={cat}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{cat}</p>
          <div className="space-y-2">
            {items.map(p => (
              <div key={p.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900">{p.title}</h3>
                    {p.description && <p className="text-sm text-gray-500 mt-0.5">{p.description}</p>}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {p.requiresAck && <button onClick={() => setAckFor(p)} title="Acknowledgements" className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100 rounded-lg"><UsersIcon size={12} /> {p.ackCount}</button>}
                      <button onClick={() => setEditing(p)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><Pencil size={14} /></button>
                      <button onClick={() => del(p)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
                {p.body && <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mt-2">{p.body}</p>}
                <div className="flex items-center gap-3 mt-3">
                  {p.document && (
                    <a href={p.document.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
                      <Download size={13} /> {p.document.name}
                    </a>
                  )}
                  {p.requiresAck && (
                    p.acknowledgedByMe
                      ? <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle2 size={13} /> You acknowledged</span>
                      : <button onClick={() => acknowledge(p)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100">I acknowledge this policy</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showNew && <PolicyModal onClose={() => setShowNew(false)} onDone={refresh} />}
      {editing && <PolicyModal existing={editing} onClose={() => setEditing(null)} onDone={refresh} />}
      {ackFor && <AckStatusModal policy={ackFor} onClose={() => setAckFor(null)} />}
    </div>
  );
}

// ── Org chart tab ──────────────────────────────────────────────────────────────
function OrgChartTab() {
  const { data: nodes = [], isLoading } = useQuery<OrgChartNode[]>({ queryKey: ['org-chart'], queryFn: () => api.company.orgChart() });

  const { roots, childrenOf } = useMemo(() => {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const childrenOf = new Map<string, OrgChartNode[]>();
    const roots: OrgChartNode[] = [];
    for (const n of nodes) {
      const parent = n.managerIds.find(id => byId.has(id));
      if (parent && parent !== n.id) { (childrenOf.get(parent) ?? childrenOf.set(parent, []).get(parent)!).push(n); }
      else roots.push(n);
    }
    return { roots, childrenOf };
  }, [nodes]);

  function Node({ node, depth }: { node: OrgChartNode; depth: number }) {
    const kids = childrenOf.get(node.id) ?? [];
    return (
      <div>
        <div className="flex items-center gap-2.5 py-1.5" style={{ paddingLeft: depth * 22 }}>
          {depth > 0 && <ChevronRight size={13} className="text-gray-300 shrink-0" />}
          <Avatar user={node} size={30} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{fullName(node)}</p>
            {node.designation && <p className="text-[11px] text-gray-400 truncate">{node.designation}</p>}
          </div>
          {kids.length > 0 && <span className="text-[10px] text-gray-400 ml-1">{kids.length} report{kids.length === 1 ? '' : 's'}</span>}
        </div>
        {kids.map(k => <Node key={k.id} node={k} depth={depth + 1} />)}
      </div>
    );
  }

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader size={18} className="animate-spin text-gray-400" /></div>;
  if (nodes.length === 0) return <p className="text-sm text-gray-400 py-10 text-center">No people to chart.</p>;
  return (
    <div className="max-w-2xl border border-gray-200 rounded-xl p-4 overflow-x-auto">
      {roots.map(r => <Node key={r.id} node={r} depth={0} />)}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'feed', label: 'Feed', icon: Megaphone },
  { id: 'policies', label: 'Policies', icon: FileText },
  { id: 'orgchart', label: 'Org chart', icon: Network },
];

export default function CompanyPage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState('feed');
  const canAnnounce = can('announcement.manage');
  const canPolicy = can('policy.manage');

  return (
    <div className="min-h-full">
      <div className="bg-white border-b px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Company</h1>
        <p className="text-sm text-gray-500 mt-0.5">Announcements, HR policies and the org chart</p>
      </div>
      <div className="px-4 sm:px-6 pt-4">
        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={clsx('inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                  tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-4 sm:p-6">
        {tab === 'feed' && <FeedTab canManage={canAnnounce} />}
        {tab === 'policies' && <PoliciesTab canManage={canPolicy} />}
        {tab === 'orgchart' && <OrgChartTab />}
      </div>
    </div>
  );
}
