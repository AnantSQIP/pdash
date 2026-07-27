'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, KeyRound, RefreshCw, Check, Loader, Inbox, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { api, type PidRequestItem, type ProjectTypeDef } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { DateField } from '@/components/ui/DateField';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const toDay = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

/** The authority's queue of pending PID requests. Each expands to a full review/edit of the
 *  project — the authority verifies (and can correct) the details, then attaches a PID, which
 *  sets the project's code and notifies the requester. */
export function PidRequestsModal({ onClose, onAssigned }: { onClose: () => void; onAssigned?: () => void }) {
  const qc = useQueryClient();
  const { data: requests = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['pid-requests'],
    queryFn: () => api.projects.pidRequests(),
    staleTime: 15_000,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">PID Requests</h2>
            <p className="text-sm text-gray-500 mt-0.5">Review the details, then assign a Project ID.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
          {!isLoading && isError && (
            <div className="text-sm text-gray-500 text-center py-6">
              <p className="text-red-500">Couldn’t load PID requests.</p>
              <button onClick={() => refetch()} className="mt-2 text-brand-600 hover:underline">Retry</button>
            </div>
          )}
          {!isLoading && !isError && requests.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                <Inbox size={22} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">No pending PID requests</p>
              <p className="text-sm text-gray-400 mt-1">You&apos;re all caught up.</p>
            </div>
          )}
          {requests.map(r => (
            <RequestRow key={r.id} req={r} onDone={() => { qc.invalidateQueries({ queryKey: ['pid-requests'] }); onAssigned?.(); }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 transition';

function RequestRow({ req, onDone }: { req: PidRequestItem; onDone: () => void }) {
  const { users } = useOrg();
  const [open, setOpen] = useState(false);
  // Editable project fields, seeded from the request's project detail.
  const [title, setTitle] = useState(req.projectTitle);
  const [description, setDescription] = useState(req.description ?? '');
  const [priority, setPriority] = useState(req.priority ?? 'MEDIUM');
  const [projectType, setProjectType] = useState(req.projectType ?? '');
  const [managerId, setManagerId] = useState(req.managerId ?? '');
  const [startDate, setStartDate] = useState(toDay(req.startDate));
  const [dueDate, setDueDate] = useState(toDay(req.dueDate));
  const [pid, setPid] = useState('');
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const { data: types = [] } = useQuery<ProjectTypeDef[]>({
    queryKey: ['project-types'], queryFn: () => api.projects.types(), staleTime: Infinity,
  });
  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => `${a.firstName} ${a.lastName}`.toLowerCase().localeCompare(`${b.firstName} ${b.lastName}`.toLowerCase())),
    [users],
  );

  const save = useMutation({
    mutationFn: () => api.projects.editPidRequestProject(req.id, {
      title: title.trim(), description, priority,
      projectType: projectType || null,
      managerId: managerId || undefined,
      startDate: startDate || null, dueDate: dueDate || null,
    }),
    onSuccess: () => { setErr(''); setSaved(true); setTimeout(() => setSaved(false), 1500); },
    onError: e => setErr(msg(e)),
  });

  const assign = useMutation({
    mutationFn: () => api.projects.fulfillPidRequest(req.id, pid.trim()),
    onSuccess: () => { setErr(''); onDone(); },
    onError: e => setErr(msg(e)),
  });

  async function generate() {
    setGenerating(true); setErr('');
    try { const res = await api.projects.generatePid(); setPid(res.pid); }
    catch (e) { setErr(msg(e)); }
    finally { setGenerating(false); }
  }

  return (
    <div className="rounded-xl border border-gray-200">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 p-3.5 text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{title || req.projectTitle}</p>
          <p className="text-[11px] text-gray-400 truncate">
            requested by {req.requestedBy}
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-3.5 space-y-3">
          <Field label="Project Title">
            <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Description">
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className={`${inputCls} resize-none`} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Project Type">
              <select value={projectType} onChange={e => setProjectType(e.target.value)} className={`${inputCls} bg-white`}>
                <option value="">None</option>
                {types.map(t => (
                  <option key={t.value} value={t.value} disabled={t.comingSoon}>{t.label}{t.comingSoon ? ' — coming soon' : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="Project Manager">
              <select value={managerId} onChange={e => setManagerId(e.target.value)} className={`${inputCls} bg-white`}>
                <option value="">Unassigned</option>
                {sortedUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}{u.designation ? ` — ${u.designation}` : ''}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Field label="Priority">
              <select value={priority} onChange={e => setPriority(e.target.value)} className={`${inputCls} bg-white`}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </Field>
            <Field label="Start">
              <DateField type="date" value={startDate} max={dueDate || undefined} onChange={e => setStartDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Deadline">
              <DateField type="date" value={dueDate} min={startDate || undefined} onChange={e => setDueDate(e.target.value)} className={inputCls} />
            </Field>
          </div>
          {req.note && <p className="text-[11px] text-gray-500">Requester note: “{req.note}”</p>}

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !title.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              {save.isPending ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Save changes
            </button>
            {saved && <span className="text-[11px] text-green-600 flex items-center gap-1"><Check size={12} /> Saved</span>}
          </div>

          <div className="border-t border-gray-100 pt-3">
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Assign Project ID</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <KeyRound size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={pid}
                  onChange={e => setPid(e.target.value.toUpperCase())}
                  placeholder="SQ_26_27_001"
                  className="w-full pl-8 pr-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
                  onKeyDown={e => { if (e.key === 'Enter' && pid.trim() && !assign.isPending) assign.mutate(); }}
                />
              </div>
              <button type="button" onClick={generate} disabled={generating} title="Generate a PID"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 shrink-0">
                <RefreshCw size={13} className={generating ? 'animate-spin' : ''} /> Generate
              </button>
              <button type="button" onClick={() => assign.mutate()} disabled={assign.isPending || !pid.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 shrink-0">
                {assign.isPending ? <Loader size={13} className="animate-spin" /> : <Check size={13} />} Attach &amp; Create
              </button>
            </div>
          </div>
          {err && <p className="text-[11px] text-red-500">{err}</p>}
        </div>
      )}
    </div>
  );
}
