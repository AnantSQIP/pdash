'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Star, ClipboardList, UserCheck, Plus, X, Loader, Trash2, Rocket, ChevronRight, Send, BadgeCheck,
} from 'lucide-react';
import clsx from 'clsx';
import { api, type Appraisal, type AppraisalCycle, type AppraisalGoal } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useOrg } from '@/lib/org-context';
import { useToast } from '@/components/ui/Toast';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';

function fmtDate(iso?: string | null) { return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING_SELF: { label: 'Self-assessment', cls: 'bg-amber-100 text-amber-700' },
  PENDING_MANAGER: { label: 'Manager review', cls: 'bg-brand-100 text-brand-700' },
  COMPLETED: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  ACKNOWLEDGED: { label: 'Acknowledged', cls: 'bg-green-100 text-green-700' },
};
function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full', m.cls)}>{m.label}</span>;
}

function StarRating({ value, onChange, readOnly }: { value?: number | null; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" disabled={readOnly} onClick={() => onChange?.(n)}
          className={clsx('p-0.5', readOnly ? 'cursor-default' : 'hover:scale-110 transition-transform')}>
          <Star size={17} className={clsx((value ?? 0) >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
        </button>
      ))}
      {value ? <span className="text-xs text-gray-400 ml-1">{value}/5</span> : !readOnly ? <span className="text-xs text-gray-300 ml-1">rate</span> : null}
    </span>
  );
}

// ── Appraisal detail drawer ─────────────────────────────────────────────────────
function AppraisalDetail({ id, currentUserId, onClose, onChanged }: { id: string; currentUserId?: string; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newGoal, setNewGoal] = useState('');
  const [selfRating, setSelfRating] = useState<number | undefined>();
  const [selfComments, setSelfComments] = useState('');
  const [mgrRating, setMgrRating] = useState<number | undefined>();
  const [overallRating, setOverallRating] = useState<number | undefined>();
  const [mgrComments, setMgrComments] = useState('');
  const { data: a, isLoading } = useQuery<Appraisal>({
    queryKey: ['appraisal', id], queryFn: () => api.appraisals.get(id),
  });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['appraisal', id] }); onChanged(); };

  const isEmployee = !!a && a.employeeId === currentUserId;
  const isReviewer = !!a && a.reviewerId === currentUserId;
  const selfStage = a?.status === 'PENDING_SELF';
  const mgrStage = a?.status === 'PENDING_MANAGER';

  async function addGoal() {
    if (!newGoal.trim()) return;
    try { await api.appraisals.addGoal(id, { title: newGoal.trim() }); setNewGoal(''); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }
  async function rateGoal(g: AppraisalGoal, field: 'selfRating' | 'managerRating', v: number) {
    try { await api.appraisals.updateGoal(id, g.id, { [field]: v }); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }
  async function commentGoal(g: AppraisalGoal, field: 'selfComment' | 'managerComment', v: string) {
    try { await api.appraisals.updateGoal(id, g.id, { [field]: v }); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }
  async function delGoal(g: AppraisalGoal) {
    try { await api.appraisals.deleteGoal(id, g.id); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }
  async function submitSelf() {
    if (!confirm('Submit your self-assessment? You will not be able to edit it after.')) return;
    try { await api.appraisals.submitSelf(id, { selfRating, selfComments: selfComments.trim() || undefined }); toast('Self-assessment submitted'); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }
  async function submitManager() {
    if (!confirm('Submit this review? The employee will be able to see it.')) return;
    try { await api.appraisals.submitManager(id, { managerRating: mgrRating, overallRating: overallRating ?? mgrRating, managerComments: mgrComments.trim() || undefined }); toast('Review submitted'); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }
  async function acknowledge() {
    try { await api.appraisals.acknowledge(id); toast('Acknowledged'); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full">
        {isLoading || !a ? (
          <div className="flex items-center justify-center h-full"><Loader size={20} className="animate-spin text-gray-400" /></div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs text-gray-400">{a.cycle?.name}</p>
                <h2 className="font-semibold text-gray-900">{a.employee ? fullName(a.employee) : 'Appraisal'}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <StatusPill status={a.status} />
                  {a.reviewer && <span className="text-[11px] text-gray-400">Reviewer: {fullName(a.reviewer)}</span>}
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 shrink-0"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Goals */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Goals &amp; competencies</p>
                <div className="space-y-3">
                  {(a.goals ?? []).map(g => (
                    <div key={g.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{g.title}</p>
                        {isEmployee && selfStage && <button onClick={() => delGoal(g)} className="p-1 text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={13} /></button>}
                      </div>
                      {g.description && <p className="text-xs text-gray-400 mt-0.5">{g.description}</p>}
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400 w-16">Self</span>
                          <StarRating value={g.selfRating} readOnly={!(isEmployee && selfStage)} onChange={v => rateGoal(g, 'selfRating', v)} />
                        </div>
                        {(isEmployee && selfStage) ? (
                          <input defaultValue={g.selfComment ?? ''} onBlur={e => e.target.value !== (g.selfComment ?? '') && commentGoal(g, 'selfComment', e.target.value)}
                            placeholder="Your comment…" className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-brand-400" />
                        ) : g.selfComment ? <p className="text-xs text-gray-600 pl-[72px]">“{g.selfComment}”</p> : null}
                        {(a.status !== 'PENDING_SELF') && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-gray-400 w-16">Manager</span>
                              <StarRating value={g.managerRating} readOnly={!(isReviewer && mgrStage)} onChange={v => rateGoal(g, 'managerRating', v)} />
                            </div>
                            {(isReviewer && mgrStage) ? (
                              <input defaultValue={g.managerComment ?? ''} onBlur={e => e.target.value !== (g.managerComment ?? '') && commentGoal(g, 'managerComment', e.target.value)}
                                placeholder="Manager comment…" className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-brand-400" />
                            ) : g.managerComment ? <p className="text-xs text-gray-600 pl-[72px]">“{g.managerComment}”</p> : null}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {(a.goals ?? []).length === 0 && <p className="text-sm text-gray-400">No goals added yet.</p>}
                </div>
                {isEmployee && selfStage && (
                  <div className="flex items-center gap-2 mt-2">
                    <input value={newGoal} onChange={e => setNewGoal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addGoal(); }} placeholder="Add a goal / competency…"
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400" />
                    <button onClick={addGoal} disabled={!newGoal.trim()} className="p-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40"><Plus size={16} /></button>
                  </div>
                )}
              </div>

              {/* Self-assessment summary */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Self-assessment</p>
                {isEmployee && selfStage ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Overall</span><StarRating value={selfRating} onChange={setSelfRating} /></div>
                    <textarea value={selfComments} onChange={e => setSelfComments(e.target.value)} rows={3} placeholder="Summarise your performance…"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-400 resize-none" />
                  </div>
                ) : (
                  <div className="text-sm">
                    <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Overall</span><StarRating value={a.selfRating} readOnly /></div>
                    {a.selfComments && <p className="text-gray-600 mt-1">“{a.selfComments}”</p>}
                    {!a.selfComments && a.status === 'PENDING_SELF' && <p className="text-gray-400 text-xs">Not submitted yet.</p>}
                  </div>
                )}
              </div>

              {/* Manager review summary */}
              {a.status !== 'PENDING_SELF' && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Manager review</p>
                  {isReviewer && mgrStage ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2"><span className="text-xs text-gray-500 w-16">Rating</span><StarRating value={mgrRating} onChange={setMgrRating} /></div>
                      <div className="flex items-center gap-2"><span className="text-xs text-gray-500 w-16">Overall</span><StarRating value={overallRating ?? mgrRating} onChange={setOverallRating} /></div>
                      <textarea value={mgrComments} onChange={e => setMgrComments(e.target.value)} rows={3} placeholder="Overall feedback…"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-400 resize-none" />
                    </div>
                  ) : (
                    <div className="text-sm">
                      <div className="flex items-center gap-2"><span className="text-xs text-gray-500 w-16">Overall</span><StarRating value={a.overallRating ?? a.managerRating} readOnly /></div>
                      {a.managerComments && <p className="text-gray-600 mt-1">“{a.managerComments}”</p>}
                      {!a.managerComments && a.status === 'PENDING_MANAGER' && <p className="text-gray-400 text-xs">Awaiting the reviewer.</p>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Stage action */}
            {(isEmployee && selfStage) && (
              <div className="px-5 py-3 border-t border-gray-100">
                <button onClick={submitSelf} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700"><Send size={15} /> Submit self-assessment</button>
              </div>
            )}
            {(isReviewer && mgrStage) && (
              <div className="px-5 py-3 border-t border-gray-100">
                <button onClick={submitManager} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700"><Send size={15} /> Submit review</button>
              </div>
            )}
            {(isEmployee && a.status === 'COMPLETED') && (
              <div className="px-5 py-3 border-t border-gray-100">
                <button onClick={acknowledge} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"><BadgeCheck size={15} /> Acknowledge my review</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AppraisalCard({ a, who, onOpen }: { a: Appraisal; who: 'employee' | 'reviewer'; onOpen: () => void }) {
  const person = who === 'employee' ? a.reviewer : a.employee;
  return (
    <button onClick={onOpen} className="w-full text-left border border-gray-200 rounded-xl p-4 hover:border-brand-300 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{a.cycle?.name}</p>
          {person && <p className="text-[11px] text-gray-400 truncate">{who === 'employee' ? 'Reviewer' : 'Employee'}: {fullName(person)}</p>}
        </div>
        <StatusPill status={a.status} />
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
        <span>Due {fmtDate(a.cycle?.dueDate)}</span>
        {(a.overallRating ?? a.selfRating) ? <span className="inline-flex items-center gap-1"><Star size={11} className="fill-amber-400 text-amber-400" /> {a.overallRating ?? a.selfRating}/5</span> : <ChevronRight size={14} className="text-gray-300" />}
      </div>
    </button>
  );
}

// ── Cycles (HR) ──────────────────────────────────────────────────────────────
function CycleModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [periodStart, setStart] = useState('');
  const [periodEnd, setEnd] = useState('');
  const [dueDate, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim()) return; setBusy(true);
    try { await api.appraisals.createCycle({ name: name.trim(), periodStart: periodStart || undefined, periodEnd: periodEnd || undefined, dueDate: dueDate || undefined }); toast('Cycle created'); onDone(); onClose(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"><h2 className="text-base font-semibold text-gray-900">New appraisal cycle</h2><button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
        <div className="px-6 py-4 space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. H1 2026 Review" maxLength={120} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500" />
          <div className="flex gap-3">
            <label className="flex-1 text-xs text-gray-500">Period start<input type="date" value={periodStart} onChange={e => setStart(e.target.value)} className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5" /></label>
            <label className="flex-1 text-xs text-gray-500">Period end<input type="date" value={periodEnd} onChange={e => setEnd(e.target.value)} className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5" /></label>
          </div>
          <label className="block text-xs text-gray-500">Due date<input type="date" value={dueDate} onChange={e => setDue(e.target.value)} className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5" /></label>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={!name.trim() || busy} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">{busy ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Create</button>
        </div>
      </div>
    </div>
  );
}

function CycleRoster({ cycleId, onOpen }: { cycleId: string; onOpen: (id: string) => void }) {
  const { data: cycle } = useQuery<AppraisalCycle>({ queryKey: ['cycle', cycleId], queryFn: () => api.appraisals.getCycle(cycleId) });
  const appraisals = cycle?.appraisals ?? [];
  if (!appraisals.length) return <p className="text-sm text-gray-400 px-4 py-3">No appraisals yet — launch the cycle to create them.</p>;
  return (
    <div className="divide-y divide-gray-50">
      {appraisals.map(a => (
        <button key={a.id} onClick={() => onOpen(a.id)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left">
          <Avatar user={a.employee} size={28} className="shrink-0" />
          <span className="flex-1 min-w-0"><span className="block text-sm text-gray-800 truncate">{a.employee ? fullName(a.employee) : ''}</span><span className="block text-[11px] text-gray-400 truncate">{a.reviewer ? `Reviewer: ${fullName(a.reviewer)}` : 'No reviewer'}</span></span>
          <StatusPill status={a.status} />
        </button>
      ))}
    </div>
  );
}

function CyclesTab({ onOpenAppraisal }: { onOpenAppraisal: (id: string) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: cycles = [], isLoading } = useQuery<AppraisalCycle[]>({ queryKey: ['cycles'], queryFn: () => api.appraisals.cycles() });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['cycles'] }); if (expanded) qc.invalidateQueries({ queryKey: ['cycle', expanded] }); };

  async function launch(c: AppraisalCycle) {
    if (!confirm('Launch this cycle for all active employees? This creates a self-assessment for each.')) return;
    try { const r = await api.appraisals.launch(c.id); toast(`Created ${r.created} appraisal(s)`); refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }
  async function close(c: AppraisalCycle) { try { await api.appraisals.closeCycle(c.id); refresh(); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); } }
  async function del(c: AppraisalCycle) { if (!confirm('Delete this cycle and all its appraisals?')) return; try { await api.appraisals.deleteCycle(c.id); refresh(); } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); } }

  return (
    <div className="max-w-3xl space-y-4">
      <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"><Plus size={14} /> New cycle</button>
      {isLoading ? <div className="flex justify-center py-10"><Loader size={18} className="animate-spin text-gray-400" /></div>
        : cycles.length === 0 ? <p className="text-sm text-gray-400 py-10 text-center border border-dashed border-gray-200 rounded-xl">No appraisal cycles yet.</p>
        : cycles.map(c => {
          const p = c.progress ?? { total: 0, completed: 0, pendingSelf: 0, pendingManager: 0 };
          const pct = p.total ? Math.round((p.completed / p.total) * 100) : 0;
          return (
            <div key={c.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><h3 className="font-semibold text-gray-900">{c.name}</h3>
                      <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : c.status === 'CLOSED' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700')}>{c.status}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">Due {fmtDate(c.dueDate)} · {p.total} appraisals</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.status !== 'CLOSED' && <button onClick={() => launch(c)} title="Launch / add employees" className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-lg"><Rocket size={13} /> Launch</button>}
                    {c.status === 'ACTIVE' && <button onClick={() => close(c)} className="px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg">Close</button>}
                    <button onClick={() => del(c)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </div>
                {p.total > 0 && (
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1"><span>{p.completed}/{p.total} completed</span><span>{p.pendingSelf} self · {p.pendingManager} review</span></div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} /></div>
                  </div>
                )}
                <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="mt-2 text-xs font-medium text-brand-600 hover:underline">{expanded === c.id ? 'Hide roster' : 'View roster'}</button>
              </div>
              {expanded === c.id && <div className="border-t border-gray-100"><CycleRoster cycleId={c.id} onOpen={onOpenAppraisal} /></div>}
            </div>
          );
        })}
      {showNew && <CycleModal onClose={() => setShowNew(false)} onDone={refresh} />}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function AppraisalsPage() {
  const { can } = usePermissions();
  const { currentUser } = useOrg();
  const canManage = can('appraisal.manage');
  const [openId, setOpenId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: mine = [], isLoading: mineLoading } = useQuery<Appraisal[]>({ queryKey: ['my-appraisals'], queryFn: () => api.appraisals.mine(), enabled: !!currentUser?.id });
  const { data: toReview = [] } = useQuery<Appraisal[]>({ queryKey: ['to-review'], queryFn: () => api.appraisals.toReview(), enabled: !!currentUser?.id });

  const tabs = useMemo(() => {
    const t = [{ id: 'mine', label: 'My reviews', icon: Star }];
    if (toReview.length) t.push({ id: 'review', label: `To review (${toReview.length})`, icon: UserCheck });
    if (canManage) t.push({ id: 'cycles', label: 'Cycles', icon: ClipboardList });
    return t;
  }, [toReview.length, canManage]);
  const [tab, setTab] = useState('mine');
  const activeTab = tabs.some(t => t.id === tab) ? tab : 'mine';

  const refreshLists = () => {
    qc.invalidateQueries({ queryKey: ['my-appraisals'] });
    qc.invalidateQueries({ queryKey: ['to-review'] });
    qc.invalidateQueries({ queryKey: ['cycles'] });
  };

  return (
    <div className="min-h-full">
      <div className="bg-white border-b px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Appraisals</h1>
        <p className="text-sm text-gray-500 mt-0.5">Performance review cycles — self-assessment, manager review and sign-off</p>
      </div>
      <div className="px-4 sm:px-6 pt-4">
        <div className="flex gap-1 border-b border-gray-200">
          {tabs.map(t => { const Icon = t.icon; return (
            <button key={t.id} onClick={() => setTab(t.id)} className={clsx('inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              <Icon size={15} /> {t.label}
            </button>
          ); })}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {activeTab === 'mine' && (
          <div className="max-w-2xl">
            {mineLoading ? <div className="flex justify-center py-10"><Loader size={18} className="animate-spin text-gray-400" /></div>
              : mine.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400"><Star size={32} className="mb-3 opacity-30" /><p className="text-sm font-medium">No appraisals yet</p><p className="text-xs mt-1">When HR launches a review cycle, yours will appear here.</p></div>
              ) : <div className="grid gap-2 sm:grid-cols-2">{mine.map(a => <AppraisalCard key={a.id} a={a} who="employee" onOpen={() => setOpenId(a.id)} />)}</div>}
          </div>
        )}
        {activeTab === 'review' && (
          <div className="max-w-2xl">
            {toReview.length === 0 ? <p className="text-sm text-gray-400 py-10 text-center">Nothing to review.</p>
              : <div className="grid gap-2 sm:grid-cols-2">{toReview.map(a => <AppraisalCard key={a.id} a={a} who="reviewer" onOpen={() => setOpenId(a.id)} />)}</div>}
          </div>
        )}
        {activeTab === 'cycles' && canManage && <CyclesTab onOpenAppraisal={setOpenId} />}
      </div>

      {openId && <AppraisalDetail id={openId} currentUserId={currentUser?.id} onClose={() => setOpenId(null)} onChanged={refreshLists} />}
    </div>
  );
}
