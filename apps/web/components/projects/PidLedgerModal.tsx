'use client';

import { X, KeyRound } from 'lucide-react';
import { PidLedgerView } from './PidLedgerView';

/** Admin/Super-Admin ledger of every Project ID — working, discontinued, and full history.
 *  Thin modal wrapper around the shared PidLedgerView (also used by the /pid-ledger page). */
export function PidLedgerModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[calc(100dvh-2rem)] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><KeyRound size={18} className="text-brand-600" /> Project ID Ledger</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 overflow-auto">
          <PidLedgerView />
        </div>
      </div>
    </div>
  );
}
