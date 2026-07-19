'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, FileText, X, Loader, CheckSquare, Calendar, BadgeCheck } from 'lucide-react';
import clsx from 'clsx';
import { api, type LifecycleProcess, type HrLetter } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useToast } from '@/components/ui/Toast';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const LETTER_LABEL: Record<string, string> = {
  OFFER: 'Offer Letter', APPOINTMENT: 'Appointment Letter', CONFIRMATION: 'Confirmation Letter',
  RELIEVING: 'Relieving Letter', EXPERIENCE: 'Experience Letter', OTHER: 'Letter',
};

function LetterModal({ letter, onClose, onAck }: { letter: HrLetter; onClose: () => void; onAck: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[calc(100dvh-4rem)] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">{LETTER_LABEL[letter.type] ?? 'Letter'}</p>
            <h2 className="text-base font-semibold text-gray-900 truncate">{letter.title}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-6 py-5">
          <p className="text-xs text-gray-400 mb-3">Issued {fmtDate(letter.issuedAt)}</p>
          <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{letter.body}</div>
        </div>
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50">
          {letter.acknowledgedAt
            ? <span className="inline-flex items-center gap-1.5 text-xs text-green-600 font-medium"><BadgeCheck size={14} /> Acknowledged {fmtDate(letter.acknowledgedAt)}</span>
            : <span className="text-xs text-gray-400">Please acknowledge that you have received and read this letter.</span>}
          {!letter.acknowledgedAt && (
            <button onClick={onAck} className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
              Acknowledge receipt
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProcessCard({ process, onToggle }: { process: LifecycleProcess; onToggle: (taskId: string, done: boolean) => void }) {
  const tasks = process.tasks ?? [];
  const done = tasks.filter(t => t.done).length;
  const isOnboarding = process.type === 'ONBOARDING';
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{isOnboarding ? 'Your onboarding' : 'Your offboarding'}</h3>
          <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full',
            process.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : process.status === 'CANCELLED' ? 'bg-gray-100 text-gray-500' : 'bg-brand-100 text-brand-700')}>
            {process.status === 'IN_PROGRESS' ? 'In progress' : process.status === 'COMPLETED' ? 'Completed' : 'Cancelled'}
          </span>
        </div>
        {tasks.length > 0 && <p className="text-xs text-gray-500 mt-0.5">{done} of {tasks.length} tasks done</p>}
      </div>
      <div className="p-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-400 px-3 py-4 text-center">No tasks assigned yet.</p>
        ) : tasks.map(t => (
          <button key={t.id} onClick={() => onToggle(t.id, !t.done)} disabled={process.status !== 'IN_PROGRESS'}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 disabled:opacity-70 disabled:cursor-default">
            {t.done ? <CheckCircle2 size={18} className="text-green-500 shrink-0 mt-0.5" /> : <Circle size={18} className="text-gray-300 shrink-0 mt-0.5" />}
            <span className="min-w-0 flex-1">
              <span className={clsx('block text-sm', t.done ? 'text-gray-400 line-through' : 'text-gray-800')}>{t.title}</span>
              {t.description && <span className="block text-xs text-gray-400 mt-0.5">{t.description}</span>}
              {t.dueDate && <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 mt-0.5"><Calendar size={10} /> due {fmtDate(t.dueDate)}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MyHrPage() {
  const { currentUser } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openLetter, setOpenLetter] = useState<HrLetter | null>(null);

  const { data: processes = [], isLoading: pLoading } = useQuery<LifecycleProcess[]>({
    queryKey: ['my-lifecycle'], queryFn: () => api.lifecycle.mine(), enabled: !!currentUser?.id,
  });
  const { data: letters = [], isLoading: lLoading } = useQuery<HrLetter[]>({
    queryKey: ['my-letters'], queryFn: () => api.lifecycle.myLetters(), enabled: !!currentUser?.id,
  });

  async function toggle(taskId: string, done: boolean) {
    try { await api.lifecycle.toggleMyTask(taskId, done); qc.invalidateQueries({ queryKey: ['my-lifecycle'] }); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not update', 'error'); }
  }
  async function acknowledge(letter: HrLetter) {
    try {
      const updated = await api.lifecycle.acknowledgeLetter(letter.id);
      setOpenLetter(updated);
      qc.invalidateQueries({ queryKey: ['my-letters'] });
      toast('Letter acknowledged');
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not acknowledge', 'error'); }
  }

  const activeProcesses = processes.filter(p => p.status === 'IN_PROGRESS');
  const showProcesses = activeProcesses.length > 0 ? activeProcesses : processes;

  return (
    <div className="min-h-full">
      <div className="bg-white border-b px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">My HR</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your onboarding tasks and HR letters</p>
      </div>

      <div className="p-4 sm:p-6 max-w-3xl space-y-8">
        {/* Onboarding / offboarding */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><CheckSquare size={16} className="text-brand-600" /> Tasks</h2>
          {pLoading ? (
            <div className="flex items-center justify-center py-8"><Loader size={18} className="animate-spin text-gray-400" /></div>
          ) : showProcesses.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">No onboarding or offboarding tasks.</p>
          ) : (
            <div className="space-y-4">{showProcesses.map(p => <ProcessCard key={p.id} process={p} onToggle={toggle} />)}</div>
          )}
        </section>

        {/* Letters */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><FileText size={16} className="text-brand-600" /> My letters</h2>
          {lLoading ? (
            <div className="flex items-center justify-center py-8"><Loader size={18} className="animate-spin text-gray-400" /></div>
          ) : letters.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">No letters issued to you yet.</p>
          ) : (
            <div className="space-y-2">
              {letters.map(l => (
                <button key={l.id} onClick={() => setOpenLetter(l)}
                  className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:border-brand-300 hover:bg-brand-50/30 transition-colors text-left">
                  <FileText size={18} className="text-brand-500 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-800 truncate">{l.title}</span>
                    <span className="block text-[11px] text-gray-400">{LETTER_LABEL[l.type] ?? 'Letter'} · issued {fmtDate(l.issuedAt)}</span>
                  </span>
                  {l.acknowledgedAt
                    ? <span className="inline-flex items-center gap-1 text-[11px] text-green-600 font-medium shrink-0"><BadgeCheck size={13} /> Acknowledged</span>
                    : <span className="text-[11px] text-amber-600 font-medium shrink-0">Action needed</span>}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {openLetter && <LetterModal letter={openLetter} onClose={() => setOpenLetter(null)} onAck={() => acknowledge(openLetter)} />}
    </div>
  );
}
