'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, KeyRound, RefreshCw, Check, Loader, Inbox } from 'lucide-react';
import { api, type PidRequestItem } from '@/lib/api';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/** The authority's queue of pending PID requests. For each, generate or paste a PID and assign
 *  it — the requester's project code is set and they are notified. */
export function PidRequestsModal({ onClose, onAssigned }: { onClose: () => void; onAssigned?: () => void }) {
  const qc = useQueryClient();
  const { data: requests = [], isLoading } = useQuery({
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
            <p className="text-sm text-gray-500 mt-0.5">Assign a Project ID to each pending request.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
          {!isLoading && requests.length === 0 && (
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

function RequestRow({ req, onDone }: { req: PidRequestItem; onDone: () => void }) {
  const [pid, setPid] = useState('');
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState('');

  const assign = useMutation({
    mutationFn: () => api.projects.fulfillPidRequest(req.id, pid.trim()),
    onSuccess: () => { setErr(''); onDone(); },
    onError: e => setErr(msg(e)),
  });

  async function generate() {
    setGenerating(true); setErr('');
    try {
      const res = await api.projects.generatePid();
      setPid(res.pid);
    } catch (e) { setErr(msg(e)); }
    finally { setGenerating(false); }
  }

  return (
    <div className="rounded-xl border border-gray-200 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{req.projectTitle}</p>
          <p className="text-[11px] text-gray-400">
            {req.projectType ? `${req.projectType} · ` : ''}requested by {req.requestedBy}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <div className="relative flex-1">
          <KeyRound size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={pid}
            onChange={e => setPid(e.target.value.toUpperCase())}
            placeholder="SQ_26_27_001"
            className="w-full pl-8 pr-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
            onKeyDown={e => { if (e.key === 'Enter' && pid.trim()) assign.mutate(); }}
          />
        </div>
        <button type="button" onClick={generate} disabled={generating} title="Generate a PID"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 shrink-0">
          <RefreshCw size={13} className={generating ? 'animate-spin' : ''} /> Generate
        </button>
        <button type="button" onClick={() => assign.mutate()} disabled={assign.isPending || !pid.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 shrink-0">
          {assign.isPending ? <Loader size={13} className="animate-spin" /> : <Check size={13} />} Assign
        </button>
      </div>
      {err && <p className="text-[11px] text-red-500 mt-1.5">{err}</p>}
    </div>
  );
}
