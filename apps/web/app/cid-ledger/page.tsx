'use client';

import { Loader, Shield, KeyRound } from 'lucide-react';
import { usePermissions } from '@/lib/permissions-context';
import { CidLedgerView } from '@/components/projects/CidLedgerView';

/** The CID Ledger module — every CID the organisation has ever issued, with its clients, hours
 *  and full event history, and CSV export of both. Gated on user.manage_access (Admin, Super
 *  Admin, HR); the API behind it is gated the same way. */
export default function CidLedgerPage() {
  const { can, isSuperAdmin, loading } = usePermissions();

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }
  if (!isSuperAdmin && !can('user.manage_access')) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <Shield size={40} className="text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Access restricted</p>
        <p className="text-sm text-gray-400 mt-1">The CID Ledger is available to administrators only.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><KeyRound size={20} className="text-brand-600" /> CID Ledger</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Every Client ID ever issued — active, completed, deleted, merged and permanently deleted — and everything that happened to it
        </p>
      </div>
      <div className="p-4 sm:p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <CidLedgerView />
        </div>
      </div>
    </div>
  );
}
