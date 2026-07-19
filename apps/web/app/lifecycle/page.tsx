'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus, UserMinus, ClipboardList, Plus, X, Loader, CheckCircle2, Circle, Trash2,
  Calendar, FileText, Send, Check, Ban, ChevronRight, Lock,
} from 'lucide-react';
import clsx from 'clsx';
import { api, type LifecycleProcess, type ChecklistTemplate, type HrLetter } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { fullName } from '@/lib/avatar';
import { Avatar } from '@/components/Avatar';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

const LETTER_TYPES = [
  { v: 'OFFER', label: 'Offer Letter' }, { v: 'APPOINTMENT', label: 'Appointment Letter' },
  { v: 'CONFIRMATION', label: 'Confirmation Letter' }, { v: 'RELIEVING', label: 'Relieving Letter' },
  { v: 'EXPERIENCE', label: 'Experience Letter' }, { v: 'OTHER', label: 'Other' },
];

// ── Start a process ────────────────────────────────────────────────────────────
function StartProcessModal({ type, templates, onClose, onDone }: {
  type: string; templates: ChecklistTemplate[]; onClose: () => void; onDone: () => void;
}) {
  const { users } = useOrg();
  const { toast } = useToast();
  const [userId, setUserId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const [busy, setBusy] = useState(false);
  const isOff = type === 'OFFBOARDING';
  const activeUsers = users.filter(u => u.status !== 'INACTIVE');

  async function submit() {
    if (!userId) return;
    setBusy(true);
    try {
      await api.lifecycle.start({
        userId, type, templateId: templateId || undefined, notes: notes.trim() || undefined,
        reason: isOff ? (reason.trim() || undefined) : undefined,
        lastWorkingDay: isOff && lastWorkingDay ? lastWorkingDay : undefined,
      });
      toast(`${isOff ? 'Offboarding' : 'Onboarding'} started`);
      onDone(); onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not start', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Start {isOff ? 'offboarding' : 'onboarding'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Employee *</span>
            <select value={userId} onChange={e => setUserId(e.target.value)} className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500">
              <option value="">Select a person…</option>
              {activeUsers.map(u => <option key={u.id} value={u.id}>{fullName(u)}{u.designation ? ` · ${u.designation}` : ''}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Checklist template</span>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500">
              <option value="">No template (add tasks manually)</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.items.length} tasks)</option>)}
            </select>
          </label>
          {isOff && (
            <>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Last working day</span>
                <input type="date" value={lastWorkingDay} onChange={e => setLastWorkingDay(e.target.value)} min={todayISO()}
                  className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Reason</span>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Resignation, end of contract…" maxLength={500}
                  className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500" />
              </label>
            </>
          )}
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Notes</span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={2000}
              className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500 resize-none" />
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={!userId || busy} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {busy ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Start
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Issue a letter ─────────────────────────────────────────────────────────────
function IssueLetterModal({ userId, userName, onClose, onDone }: {
  userId: string; userName: string; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState('OFFER');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await api.lifecycle.issueLetter({ userId, type, title: title.trim(), body });
      toast('Letter issued'); onDone(); onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not issue letter', 'error'); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[calc(100dvh-4rem)] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Issue a letter to {userName}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto">
          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="text-xs font-medium text-gray-600">Type</span>
              <select value={type} onChange={e => setType(e.target.value)} className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500">
                {LETTER_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
            </label>
            <label className="block flex-[2]">
              <span className="text-xs font-medium text-gray-600">Title *</span>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Appointment Letter — Software Engineer" maxLength={200}
                className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Body *</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} maxLength={20000} placeholder="Dear …,"
              className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500 resize-none font-mono" />
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={!title.trim() || !body.trim() || busy} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {busy ? <Loader size={14} className="animate-spin" /> : <Send size={14} />} Issue
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Process detail drawer ──────────────────────────────────────────────────────
function ProcessDetail({ processId, onClose, onChanged }: { processId: string; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newTask, setNewTask] = useState('');
  const [showLetter, setShowLetter] = useState(false);
  const { data: p, isLoading } = useQuery<LifecycleProcess>({ queryKey: ['lifecycle-process', processId], queryFn: () => api.lifecycle.get(processId) });
  const { data: letters = [] } = useQuery<HrLetter[]>({ queryKey: ['lifecycle-letters', p?.userId], queryFn: () => api.lifecycle.letters(p!.userId), enabled: !!p?.userId });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['lifecycle-process', processId] }); onChanged(); };

  async function toggle(taskId: string, done: boolean) {
    try { await api.lifecycle.updateTask(processId, taskId, { done }); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not update', 'error'); }
  }
  async function addTask() {
    if (!newTask.trim()) return;
    try { await api.lifecycle.addTask(processId, { title: newTask.trim() }); setNewTask(''); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not add task', 'error'); }
  }
  async function delTask(taskId: string) {
    try { await api.lifecycle.deleteTask(processId, taskId); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not delete', 'error'); }
  }
  async function complete() {
    if (!confirm(p?.type === 'OFFBOARDING' ? 'Complete offboarding? This deactivates the employee.' : 'Mark onboarding complete?')) return;
    try { await api.lifecycle.complete(processId); toast('Process completed'); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not complete', 'error'); }
  }
  async function cancel() {
    if (!confirm('Cancel this process?')) return;
    try { await api.lifecycle.cancel(processId); toast('Process cancelled'); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not cancel', 'error'); }
  }

  const tasks = p?.tasks ?? [];
  const done = tasks.filter(t => t.done).length;
  const active = p?.status === 'IN_PROGRESS';

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
        {isLoading || !p ? (
          <div className="flex items-center justify-center h-full"><Loader size={20} className="animate-spin text-gray-400" /></div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar user={p.user} size={40} className="shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{p.user ? fullName(p.user) : 'Employee'}</p>
                    <p className="text-xs text-gray-400 truncate">{p.user?.designation ?? p.user?.email}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 shrink-0"><X size={18} /></button>
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs">
                <span className={clsx('font-semibold px-2 py-0.5 rounded-full',
                  p.type === 'ONBOARDING' ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700')}>
                  {p.type === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'}
                </span>
                <span className={clsx('font-semibold px-2 py-0.5 rounded-full',
                  p.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : p.status === 'CANCELLED' ? 'bg-gray-100 text-gray-500' : 'bg-brand-100 text-brand-700')}>
                  {p.status === 'IN_PROGRESS' ? 'In progress' : p.status === 'COMPLETED' ? 'Completed' : 'Cancelled'}
                </span>
              </div>
              {(p.reason || p.lastWorkingDay) && (
                <p className="text-xs text-gray-500 mt-2">
                  {p.lastWorkingDay && <>Last working day: {fmtDate(p.lastWorkingDay)}. </>}
                  {p.reason && <>Reason: {p.reason}.</>}
                </p>
              )}
              {p.notes && <p className="text-xs text-gray-500 mt-1 italic">{p.notes}</p>}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Checklist · {done}/{tasks.length}</p>
                <div className="space-y-1">
                  {tasks.map(t => (
                    <div key={t.id} className="group flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                      <button onClick={() => active && toggle(t.id, !t.done)} disabled={!active} className="shrink-0 mt-0.5 disabled:cursor-default">
                        {t.done ? <CheckCircle2 size={18} className="text-green-500" /> : <Circle size={18} className="text-gray-300" />}
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className={clsx('block text-sm', t.done ? 'text-gray-400 line-through' : 'text-gray-800')}>{t.title}</span>
                        {t.description && <span className="block text-xs text-gray-400">{t.description}</span>}
                        {t.dueDate && <span className="inline-flex items-center gap-1 text-[11px] text-gray-400"><Calendar size={10} /> due {fmtDate(t.dueDate)}</span>}
                      </span>
                      {active && <button onClick={() => delTask(t.id)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={13} /></button>}
                    </div>
                  ))}
                  {tasks.length === 0 && <p className="text-sm text-gray-400 px-2 py-2">No tasks yet.</p>}
                </div>
                {active && (
                  <div className="flex items-center gap-2 mt-2">
                    <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask(); }} placeholder="Add a task…"
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400" />
                    <button onClick={addTask} disabled={!newTask.trim()} className="p-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40"><Plus size={16} /></button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Letters</p>
                  <button onClick={() => setShowLetter(true)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"><Plus size={12} /> Issue letter</button>
                </div>
                <div className="space-y-1">
                  {letters.length === 0 && <p className="text-sm text-gray-400 px-2">No letters issued.</p>}
                  {letters.map(l => (
                    <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700">
                      <FileText size={14} className="text-brand-500 shrink-0" />
                      <span className="flex-1 truncate">{l.title}</span>
                      {l.acknowledgedAt ? <Check size={13} className="text-green-500 shrink-0" /> : <span className="text-[10px] text-amber-500 shrink-0">unread</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {active && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
                <button onClick={complete} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
                  <Check size={15} /> {p.type === 'OFFBOARDING' ? 'Complete & deactivate' : 'Mark complete'}
                </button>
                <button onClick={cancel} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"><Ban size={14} /> Cancel</button>
              </div>
            )}
          </>
        )}
      </div>
      {showLetter && p && <IssueLetterModal userId={p.userId} userName={p.user ? fullName(p.user) : 'employee'} onClose={() => setShowLetter(false)} onDone={() => qc.invalidateQueries({ queryKey: ['lifecycle-letters', p.userId] })} />}
    </div>
  );
}

// ── Process board (one type) ───────────────────────────────────────────────────
function ProcessBoard({ type }: { type: string }) {
  const qc = useQueryClient();
  const [showStart, setShowStart] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const isOff = type === 'OFFBOARDING';
  const { data: processes = [], isLoading } = useQuery<LifecycleProcess[]>({ queryKey: ['lifecycle', type], queryFn: () => api.lifecycle.list(type) });
  const { data: templates = [] } = useQuery<ChecklistTemplate[]>({ queryKey: ['lifecycle-templates', type], queryFn: () => api.lifecycle.templates(type) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['lifecycle', type] });

  const inProgress = processes.filter(p => p.status === 'IN_PROGRESS');
  const closed = processes.filter(p => p.status !== 'IN_PROGRESS');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{inProgress.length} in progress{closed.length ? ` · ${closed.length} closed` : ''}</p>
        <button onClick={() => setShowStart(true)} className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
          {isOff ? <UserMinus size={14} /> : <UserPlus size={14} />} Start {isOff ? 'offboarding' : 'onboarding'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader size={18} className="animate-spin text-gray-400" /></div>
      ) : processes.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center border border-dashed border-gray-200 rounded-xl">Nobody is being {isOff ? 'offboarded' : 'onboarded'} right now.</p>
      ) : (
        <div className="space-y-4">
          {[{ label: 'In progress', rows: inProgress }, { label: 'Closed', rows: closed }].filter(g => g.rows.length).map(g => (
            <div key={g.label}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{g.label}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.rows.map(p => {
                  const prog = p.progress ?? { done: 0, total: 0 };
                  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
                  return (
                    <button key={p.id} onClick={() => setOpenId(p.id)} className="text-left border border-gray-200 rounded-xl p-3.5 hover:border-brand-300 hover:shadow-sm transition-all">
                      <div className="flex items-center gap-2.5">
                        <Avatar user={p.user} size={34} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.user ? fullName(p.user) : 'Employee'}</p>
                          <p className="text-[11px] text-gray-400 truncate">{p.user?.designation ?? p.user?.email}</p>
                        </div>
                        <ChevronRight size={15} className="text-gray-300 shrink-0" />
                      </div>
                      <div className="mt-2.5">
                        <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                          <span>{prog.done}/{prog.total} tasks</span>
                          <span>{p.status === 'IN_PROGRESS' ? `${pct}%` : p.status === 'COMPLETED' ? 'Completed' : 'Cancelled'}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className={clsx('h-full rounded-full', p.status === 'COMPLETED' ? 'bg-green-500' : 'bg-brand-500')} style={{ width: `${p.status === 'COMPLETED' ? 100 : pct}%` }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showStart && <StartProcessModal type={type} templates={templates} onClose={() => setShowStart(false)} onDone={refresh} />}
      {openId && <ProcessDetail processId={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
}

// ── Templates tab ──────────────────────────────────────────────────────────────
function TemplatesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [type, setType] = useState('ONBOARDING');
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const { data: templates = [], isLoading } = useQuery<ChecklistTemplate[]>({ queryKey: ['lifecycle-templates', type], queryFn: () => api.lifecycle.templates(type) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['lifecycle-templates', type] });

  async function create() {
    if (!newName.trim()) return;
    try { await api.lifecycle.createTemplate({ type, name: newName.trim() }); setNewName(''); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not create', 'error'); }
  }
  async function remove(id: string) {
    if (!confirm('Delete this template?')) return;
    try { await api.lifecycle.deleteTemplate(id); invalidate(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not delete', 'error'); }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        {['ONBOARDING', 'OFFBOARDING'].map(t => (
          <button key={t} onClick={() => setType(t)} className={clsx('px-3 py-1.5 text-sm font-medium rounded-lg', type === t ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-100')}>
            {t === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} placeholder="New template name…"
          className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500" />
        <button onClick={create} disabled={!newName.trim()} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"><Plus size={14} /> Add</button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader size={18} className="animate-spin text-gray-400" /></div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">No templates yet.</p>
      ) : templates.map(t => <TemplateCard key={t.id} template={t} editing={editing === t.id} onEdit={() => setEditing(editing === t.id ? null : t.id)} onDelete={() => remove(t.id)} onSaved={invalidate} />)}
    </div>
  );
}

function TemplateCard({ template, editing, onEdit, onDelete, onSaved }: {
  template: ChecklistTemplate; editing: boolean; onEdit: () => void; onDelete: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState(template.items.map(i => ({ title: i.title, description: i.description ?? '', dueDays: i.dueDays ?? undefined as number | undefined })));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.lifecycle.setTemplateItems(template.id, items.filter(i => i.title.trim()).map(i => ({ title: i.title.trim(), description: i.description.trim() || undefined, dueDays: i.dueDays })));
      toast('Template saved'); onSaved(); onEdit();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
        <span className="font-medium text-gray-800">{template.name} <span className="text-xs text-gray-400">· {template.items.length} tasks</span></span>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className={clsx('px-2.5 py-1.5 text-xs font-medium rounded-lg', editing ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100')}>{editing ? 'Close' : 'Edit tasks'}</button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
        </div>
      </div>
      {editing && (
        <div className="p-3 space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={it.title} onChange={e => setItems(a => a.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Task title"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-400" />
              <input type="number" min={0} value={it.dueDays ?? ''} onChange={e => setItems(a => a.map((x, j) => j === i ? { ...x, dueDays: e.target.value === '' ? undefined : Number(e.target.value) } : x))} placeholder="due (days)" title="Due N days after start"
                className="w-24 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-400" />
              <button onClick={() => setItems(a => a.filter((_, j) => j !== i))} className="p-1.5 text-gray-400 hover:text-red-500"><X size={15} /></button>
            </div>
          ))}
          <button onClick={() => setItems(a => [...a, { title: '', description: '', dueDays: undefined }])} className="text-xs font-medium text-brand-600 hover:underline inline-flex items-center gap-1"><Plus size={13} /> Add task</button>
          <div className="flex justify-end pt-1">
            <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {busy ? <Loader size={13} className="animate-spin" /> : <Check size={14} />} Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'ONBOARDING', label: 'Onboarding', icon: UserPlus },
  { id: 'OFFBOARDING', label: 'Offboarding', icon: UserMinus },
  { id: 'templates', label: 'Templates', icon: ClipboardList },
];

export default function LifecyclePage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState('ONBOARDING');
  const canView = can('lifecycle.view');

  if (!canView) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center text-gray-400 p-8">
        <Lock size={40} className="mb-3 opacity-30" />
        <p className="text-base font-medium text-gray-500">This area is for HR &amp; managers</p>
        <p className="text-sm mt-1">Your own onboarding tasks and letters are under <span className="font-medium">My HR</span>.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="bg-white border-b px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Employee Lifecycle</h1>
        <p className="text-sm text-gray-500 mt-0.5">Onboarding, offboarding and HR letters</p>
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
        {tab === 'ONBOARDING' && <ProcessBoard type="ONBOARDING" />}
        {tab === 'OFFBOARDING' && <ProcessBoard type="OFFBOARDING" />}
        {tab === 'templates' && <TemplatesTab />}
      </div>
    </div>
  );
}
