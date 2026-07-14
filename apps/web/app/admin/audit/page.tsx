'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader, ScrollText, Download, Shield, X } from 'lucide-react';
import { api, type AuditLogItem, type UserSummary } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { Avatar } from '@/components/Avatar';

const ACTION_COLOR: Record<string, string> = {
  created: 'bg-green-100 text-green-700', updated: 'bg-blue-100 text-blue-700',
  deleted: 'bg-red-100 text-red-700', changed: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700',
};
function actionColor(action: string) {
  const verb = action.split('.').pop() ?? '';
  return ACTION_COLOR[verb] ?? 'bg-gray-100 text-gray-600';
}

export default function AuditPage() {
  const { org, users } = useOrg();
  const { can, isSuperAdmin, loading } = usePermissions();
  const [action, setAction] = useState(''); const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState(''); const [selected, setSelected] = useState<AuditLogItem | null>(null);

  const usersById = useMemo(() => new Map((users as UserSummary[]).map(u => [u.id, u])), [users]);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', org?.id],
    queryFn: () => api.auditLogs.list({ organizationId: org!.id, limit: 200 }),
    enabled: !!org?.id && (isSuperAdmin || can('audit.view')),
    staleTime: 20_000,
  });

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  if (!isSuperAdmin && !can('audit.view')) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <Shield size={40} className="text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Access restricted</p>
        <p className="text-sm text-gray-400 mt-1">You need the <code>audit.view</code> permission.</p>
      </div>
    );
  }

  const items = data?.items ?? [];
  const actions = [...new Set(items.map(i => i.action))].sort();
  const entityTypes = [...new Set(items.map(i => i.entityType))].sort();
  const actors = [...new Set(items.map(i => i.userId))];
  const filtered = items.filter(i => (!action || i.action === action) && (!entityType || i.entityType === entityType) && (!actorId || i.userId === actorId));

  function exportCsv() {
    const rows = [['time', 'actor', 'action', 'entityType', 'entityId', 'ip'],
      ...filtered.map(i => {
        const u = i.user ?? usersById.get(i.userId);
        return [i.timestamp, u ? `${u.firstName} ${u.lastName}` : i.userId, i.action, i.entityType, i.entityId, i.ipAddress ?? ''];
      })];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'audit-logs.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><ScrollText size={20} className="text-brand-600" /> Audit Log</h1>
        <p className="text-sm text-gray-500 mt-0.5">Every privileged action, recorded immutably</p>
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <select value={action} onChange={e => setAction(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="">All actions</option>{actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={entityType} onChange={e => setEntityType(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="">All entities</option>{entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={actorId} onChange={e => setActorId(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="">All actors</option>{actors.map(a => { const u = usersById.get(a); return <option key={a} value={a}>{u ? `${u.firstName} ${u.lastName}`.trim() : a.slice(0, 8)}</option>; })}
          </select>
          <span className="text-xs text-gray-400">{filtered.length} of {items.length}</span>
          <button onClick={exportCsv} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"><Download size={14} /> Export CSV</button>
        </div>
      </div>
      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading audit log…</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[720px]">
              <thead><tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-2.5">Time</th><th className="px-3 py-2.5">Actor</th><th className="px-3 py-2.5">Action</th><th className="px-3 py-2.5">Entity</th><th className="px-3 py-2.5">IP</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(i => {
                  const u = i.user ?? usersById.get(i.userId);
                  return (
                    <tr key={i.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(i)}>
                      <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{new Date(i.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {u ? <Avatar user={u} size={24} /> : null}
                          <span className="text-gray-700">{u ? `${u.firstName} ${u.lastName}`.trim() : i.userId.slice(0, 8)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', actionColor(i.action))}>{i.action}</span></td>
                      <td className="px-3 py-2.5 text-gray-500">{i.entityType} <span className="text-gray-300">#{i.entityId.slice(0, 6)}</span></td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs">{i.ipAddress ?? '—'}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-gray-400">No audit entries.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Before/after detail drawer */}
      {selected && (() => {
        const u = selected.user ?? usersById.get(selected.userId);
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelected(null)} />
            <div className="fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-[90vw] bg-white shadow-2xl overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Audit entry</h3>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-4 text-sm">
                <div className="space-y-1">
                  <Row label="Action"><span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', actionColor(selected.action))}>{selected.action}</span></Row>
                  <Row label="Actor">{u ? `${u.firstName} ${u.lastName}`.trim() : selected.userId}</Row>
                  <Row label="Entity">{selected.entityType} #{selected.entityId}</Row>
                  <Row label="When">{new Date(selected.timestamp).toLocaleString()}</Row>
                  <Row label="IP">{selected.ipAddress ?? '—'}</Row>
                </div>
                {(selected.oldValue || selected.newValue) && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Change</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div><p className="text-[10px] text-red-500 mb-0.5">Before</p><pre className="bg-red-50 text-red-800 text-[11px] rounded p-2 overflow-x-auto">{JSON.stringify(selected.oldValue ?? null, null, 2)}</pre></div>
                      <div><p className="text-[10px] text-green-600 mb-0.5">After</p><pre className="bg-green-50 text-green-800 text-[11px] rounded p-2 overflow-x-auto">{JSON.stringify(selected.newValue ?? null, null, 2)}</pre></div>
                    </div>
                  </div>
                )}
                {selected.metadata && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Metadata</p>
                    <pre className="bg-gray-50 text-gray-700 text-[11px] rounded p-2 overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3 py-1"><span className="text-gray-400">{label}</span><span className="text-gray-800 text-right">{children}</span></div>;
}
