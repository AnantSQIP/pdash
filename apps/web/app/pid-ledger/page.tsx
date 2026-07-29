'use client';

import { Loader, Shield, KeyRound } from 'lucide-react';
import { usePermissions } from '@/lib/permissions-context';
import { PidLedgerView } from '@/components/projects/PidLedgerView';

/** Admin-only PID Ledger module — every Project ID (working / discontinued / reserved) with full
 *  project context and CSV export. Gated on user.manage_access (Admin + Super Admin); the API
 *  behind it is admin-gated too. */
export default function PidLedgerPage() {
  const { can, isSuperAdmin, loading } = usePermissions();

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }
  if (!isSuperAdmin && !can('user.manage_access')) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <Shield size={40} className="text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Access restricted</p>
        <p className="text-sm text-gray-400 mt-1">The PID Ledger is available to administrators only.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><KeyRound size={20} className="text-brand-600" /> PID Ledger</h1>
        <p className="text-sm text-gray-500 mt-0.5">Every Project ID — working, discontinued and full history</p>
      </div>
      <div className="p-4 sm:p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <PidLedgerView />
        </div>
      </div>
    </div>
  );
}
