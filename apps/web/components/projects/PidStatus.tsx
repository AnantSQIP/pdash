'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { BellRing, Clock, KeyRound, Loader, Send, ArrowRightLeft, Check } from 'lucide-react';
import { api, type ApiProject } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';

function since(iso: string) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/**
 * CLIENTS-FLOW (PID rework): a client's PID, and what it is waiting on, in the page header.
 *
 *   • No PID yet — says since when and who was asked, and offers the next step: an authority
 *     attaches one; anyone else on the client nudges the authorities (or, for a client with no
 *     open request — one restored from the bin — asks for one).
 *   • Has a PID — an authority changes it (the audited Change PID dialog, pre-filled with any
 *     number the team suggested); the client's manager can ask for a change with a reason.
 *
 * The server re-checks every one of these; the buttons only avoid offering what would be refused.
 */
export function PidStatus({ project, multiRound, roundsCount, attaching, onAttach, onChangePid }: {
  project: ApiProject;
  multiRound: boolean;
  roundsCount: number;
  attaching: boolean;
  onAttach: () => void;
  /** Open the Change PID dialog, with the team's suggested number if there is one. */
  onChangePid: (suggested?: string | null) => void;
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const isAuthority = can('project.generate_pid');
  const mayEdit = can('project.update');
  const req = project.openPidRequest ?? null;
  const [asking, setAsking] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['project', project.id] });
    qc.invalidateQueries({ queryKey: ['pid-requests'] });
  };
  const nudge = useMutation({
    mutationFn: () => api.projects.nudgePidRequest(project.id),
    onSuccess: r => { refresh(); toast(`Reminded ${r.reminded} PID ${r.reminded === 1 ? 'authority' : 'authorities'}`, 'success'); },
    onError: e => toast(e instanceof Error ? e.message : 'Could not send the reminder', 'error'),
  });
  const request = useMutation({
    mutationFn: () => api.projects.requestPid(project.id),
    onSuccess: () => { refresh(); toast('PID requested — every PID authority can see it', 'success'); },
    onError: e => toast(e instanceof Error ? e.message : 'Could not request a PID', 'error'),
  });

  if (!project.code) {
    return (
      <>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200"
          title={req ? `Requested by ${req.requestedBy ?? 'a colleague'}${req.askedFirst ? `; ${req.askedFirst} asked first` : ''}` : 'Nobody has asked for a PID yet'}
        >
          <span className="font-mono">PID pending</span>
          {req && (
            <span className="inline-flex items-center gap-0.5 font-medium text-amber-600">
              <Clock size={11} /> {since(req.createdAt)}
            </span>
          )}
        </span>
        {isAuthority ? (
          <button onClick={onAttach} disabled={attaching} title="Attach the next free PID to this client"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-brand-700 border border-brand-200 bg-brand-50 hover:bg-brand-100 disabled:opacity-50 transition-colors">
            <KeyRound size={12} /> {attaching ? 'Attaching…' : 'Attach PID'}
          </button>
        ) : req ? (
          <button onClick={() => nudge.mutate()} disabled={nudge.isPending}
            title="Remind every PID authority that this client is waiting (at most once an hour)"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50">
            {nudge.isPending ? <Loader size={12} className="animate-spin" /> : <BellRing size={12} />} Nudge
          </button>
        ) : mayEdit ? (
          <button onClick={() => request.mutate()} disabled={request.isPending}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-brand-700 border border-brand-200 bg-brand-50 hover:bg-brand-100 disabled:opacity-50">
            {request.isPending ? <Loader size={12} className="animate-spin" /> : <Send size={12} />} Request a PID
          </button>
        ) : null}
      </>
    );
  }

  const changeOpen = req?.kind === 'CHANGE';
  return (
    <>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 font-mono ring-1 ring-gray-200">
        {project.code}
        {multiRound && <span className="font-sans font-medium text-gray-500">· {roundsCount} under this PID</span>}
      </span>
      {changeOpen && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200"
          title={req?.reason ?? undefined}>
          <ArrowRightLeft size={11} /> Change requested {req?.suggestedPid ? `→ ${req.suggestedPid}` : ''} · {since(req!.createdAt)}
        </span>
      )}
      {changeOpen && isAuthority && (
        <button onClick={() => onChangePid(req?.suggestedPid)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-brand-700 border border-brand-200 bg-brand-50 hover:bg-brand-100">
          <KeyRound size={12} /> Make the change
        </button>
      )}
      {changeOpen && !isAuthority && (
        <button onClick={() => nudge.mutate()} disabled={nudge.isPending}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50">
          {nudge.isPending ? <Loader size={12} className="animate-spin" /> : <BellRing size={12} />} Nudge
        </button>
      )}
      {!changeOpen && !isAuthority && mayEdit && (
        <button onClick={() => setAsking(true)} title="Ask a PID authority to correct this client's PID"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium text-gray-500 hover:text-brand-700 hover:bg-brand-50">
          <ArrowRightLeft size={11} /> Request change
        </button>
      )}
      {asking && <RequestChangeDialog projectId={project.id} currentPid={project.code} onClose={() => setAsking(false)} onDone={refresh} />}
    </>
  );
}

function RequestChangeDialog({ projectId, currentPid, onClose, onDone }: {
  projectId: string; currentPid: string; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [suggested, setSuggested] = useState('');
  const [err, setErr] = useState('');
  const send = useMutation({
    mutationFn: () => api.projects.requestPidChange(projectId, { reason: reason.trim(), suggestedPid: suggested.trim() || undefined }),
    onSuccess: () => { onDone(); toast('PID change requested — every PID authority can see it', 'success'); onClose(); },
    onError: e => setErr(e instanceof Error ? e.message : 'Could not send the request'),
  });
  const field = 'w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white';
  return (
    <Modal title="Request a PID change" subtitle={`Currently ${currentPid}`} size="md" onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-red-600" role="alert">{err}</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={() => send.mutate()} disabled={send.isPending || reason.trim().length < 3}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {send.isPending ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Send request
            </button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        <div>
          <label htmlFor="pc-reason" className="block text-sm font-medium text-gray-700 mb-1.5">Why should it change? <span className="text-red-500">*</span></label>
          <textarea id="pc-reason" rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} autoFocus
            placeholder="e.g. The client's purchase order quotes a different PID"
            className={clsx(field, 'resize-none')} />
        </div>
        <div>
          <label htmlFor="pc-suggest" className="block text-sm font-medium text-gray-700 mb-1.5">The PID it should be <span className="text-gray-400 font-normal">(optional)</span></label>
          <input id="pc-suggest" value={suggested} onChange={e => setSuggested(e.target.value.toUpperCase())}
            placeholder="Leave empty for the next free number" className={clsx(field, 'font-mono')} />
        </div>
        <p className="text-xs text-gray-500">Every PID authority sees the request. Whoever acts on it makes the change or tells you why not.</p>
      </div>
    </Modal>
  );
}
