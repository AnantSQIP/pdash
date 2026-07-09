'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { X, Users as UsersIcon, Copy, KeyRound, ChevronRight, Check } from 'lucide-react';
import { api, type RoleSummary, type UserSummary, type PermissionDef } from '@/lib/api';
import { fullName } from '@/lib/avatar';

type Method = 'roles' | 'copy' | 'direct';
const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

/** AWS-IAM-style "Add permissions" wizard: pick method → configure → review diff → apply. */
export function AddPermissionsWizard({ orgId, user, onClose, onDone }: {
  orgId: string; user: UserSummary; onClose: () => void; onDone: () => void;
}) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<Method | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);

  const { data: roles = [] } = useQuery({ queryKey: ['roles', orgId], queryFn: () => api.roles.list(orgId), staleTime: 30_000 });
  const { data: users = [] } = useQuery({ queryKey: ['users', orgId], queryFn: () => api.users.list(orgId), staleTime: 30_000 });
  const { data: perms = [] } = useQuery({ queryKey: ['permissions'], queryFn: () => api.permissions.list(), staleTime: 60_000 });
  const { data: targetEff } = useQuery({ queryKey: ['eff', user.id], queryFn: () => api.users.effectivePermissions(user.id), staleTime: 5_000 });

  // selections
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [sourceUserId, setSourceUserId] = useState('');
  const [permIds, setPermIds] = useState<string[]>([]);
  const [permSearch, setPermSearch] = useState('');
  const { data: sourceEff } = useQuery({ queryKey: ['eff', sourceUserId], queryFn: () => api.users.effectivePermissions(sourceUserId), enabled: !!sourceUserId, staleTime: 5_000 });

  // Current role ids of the target — from the authoritative eff.roles (not the lossy
  // sources map, which drops roles whose codes are all shadowed by higher-precedence grants).
  const currentRoleIds = useMemo(() => {
    if (!targetEff) return [] as string[];
    return roles.filter(r => targetEff.roles?.includes(r.name)).map(r => r.id);
  }, [targetEff, roles]);
  const currentDirectCodes = useMemo(() => targetEff ? Object.entries(targetEff.sources).filter(([, s]) => s === 'direct').map(([c]) => c) : [], [targetEff]);

  const codeById = useMemo(() => new Map(perms.map(p => [p.id, p.code])), [perms]);
  const idByCode = useMemo(() => new Map(perms.map(p => [p.code, p.id])), [perms]);

  // compute the resulting change set for the review step
  const review = useMemo(() => {
    if (method === 'roles') {
      const added = roles.filter(r => roleIds.includes(r.id) && !currentRoleIds.includes(r.id));
      return { kind: 'roles' as const, addedRoles: added, finalRoleIds: Array.from(new Set([...currentRoleIds, ...roleIds])) };
    }
    if (method === 'direct') {
      const finalCodes = Array.from(new Set([...currentDirectCodes, ...permIds.map(id => codeById.get(id)!).filter(Boolean)]));
      const added = permIds.map(id => codeById.get(id)!).filter(c => c && !currentDirectCodes.includes(c));
      return { kind: 'direct' as const, addedCodes: added, finalDirectIds: finalCodes.map(c => idByCode.get(c)!).filter(Boolean) };
    }
    if (method === 'copy' && sourceEff) {
      const srcRoleIds = roles.filter(r => sourceEff.roles?.includes(r.name)).map(r => r.id);
      const srcDirect = Object.entries(sourceEff.sources).filter(([, s]) => s === 'direct').map(([c]) => c);
      const finalRoleIds = Array.from(new Set([...currentRoleIds, ...srcRoleIds]));
      const finalDirectCodes = Array.from(new Set([...currentDirectCodes, ...srcDirect]));
      return {
        kind: 'copy' as const,
        addedRoles: roles.filter(r => srcRoleIds.includes(r.id) && !currentRoleIds.includes(r.id)),
        addedCodes: srcDirect.filter(c => !currentDirectCodes.includes(c)),
        finalRoleIds, finalDirectIds: finalDirectCodes.map(c => idByCode.get(c)!).filter(Boolean),
      };
    }
    return null;
  }, [method, roles, roleIds, currentRoleIds, permIds, currentDirectCodes, codeById, idByCode, sourceEff, sourceUserId]);

  async function apply() {
    if (!review) return;
    setBusy(true);
    try {
      if (review.kind === 'roles') await api.users.setRoles(user.id, review.finalRoleIds);
      else if (review.kind === 'direct') await api.users.setPermissions(user.id, review.finalDirectIds);
      else if (review.kind === 'copy') { await api.users.setRoles(user.id, review.finalRoleIds); await api.users.setPermissions(user.id, review.finalDirectIds); }
      qc.invalidateQueries({ queryKey: ['eff', user.id] });
      qc.invalidateQueries({ queryKey: ['users', orgId] });
      qc.invalidateQueries({ queryKey: ['effective-permissions'] }); // M34: refresh the live gate/sidebar
      onDone(); onClose();
    } finally { setBusy(false); }
  }

  const filteredPerms = perms.filter(p => p.code.toLowerCase().includes(permSearch.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Add permissions</h3>
            <p className="text-xs text-gray-500">to {fullName(user)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* step indicator */}
        <div className="flex items-center gap-2 px-5 pt-3 text-xs text-gray-400">
          {['Method', 'Configure', 'Review'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={clsx('w-5 h-5 rounded-full flex items-center justify-center font-semibold', step === i + 1 ? 'bg-brand-600 text-white' : step > i + 1 ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400')}>{step > i + 1 ? <Check size={12} /> : i + 1}</span>
              {s}{i < 2 && <ChevronRight size={12} />}
            </div>
          ))}
        </div>

        <div className="p-5">
          {step === 1 && (
            <div className="space-y-2">
              {([
                { m: 'roles' as Method, icon: KeyRound, t: 'Assign role(s)', d: 'Grant a named bundle of permissions via roles.' },
                { m: 'copy' as Method, icon: Copy, t: 'Copy from existing user', d: 'Mirror another user’s roles and direct grants.' },
                { m: 'direct' as Method, icon: UsersIcon, t: 'Grant specific permissions', d: 'Attach individual permissions directly (inline).' },
              ]).map(({ m, icon: Icon, t, d }) => (
                <button key={m} onClick={() => { setMethod(m); setStep(2); }} className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-brand-400 hover:bg-brand-50/40 text-left">
                  <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Icon size={17} /></div>
                  <div><p className="text-sm font-medium text-gray-900">{t}</p><p className="text-xs text-gray-500">{d}</p></div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && method === 'roles' && (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {roles.map(r => (
                <label key={r.id} className={clsx('flex items-center gap-2 text-sm py-1', currentRoleIds.includes(r.id) && 'opacity-50')}>
                  <input type="checkbox" disabled={currentRoleIds.includes(r.id)} checked={roleIds.includes(r.id) || currentRoleIds.includes(r.id)} onChange={e => setRoleIds(p => e.target.checked ? [...p, r.id] : p.filter(x => x !== r.id))} />
                  {r.name} <span className="text-xs text-gray-400">{r.permissionIds.length} perms{currentRoleIds.includes(r.id) ? ' · already assigned' : ''}</span>
                </label>
              ))}
            </div>
          )}
          {step === 2 && method === 'copy' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">Copy roles + direct grants from:</p>
              <select className={inputCls} value={sourceUserId} onChange={e => setSourceUserId(e.target.value)}>
                <option value="">Select a user…</option>
                {users.filter(u => u.id !== user.id).map(u => <option key={u.id} value={u.id}>{fullName(u)} — {u.designation}</option>)}
              </select>
              {sourceEff && <p className="text-xs text-gray-500">{sourceEff.isSuperAdmin ? 'Super Admin (all permissions)' : `${sourceEff.codes.length} effective permissions`}</p>}
            </div>
          )}
          {step === 2 && method === 'direct' && (
            <div className="space-y-2">
              <input className={inputCls} placeholder="Search permissions…" value={permSearch} onChange={e => setPermSearch(e.target.value)} />
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {filteredPerms.slice(0, 200).map(p => (
                  <label key={p.id} className={clsx('flex items-center gap-2 text-sm py-0.5', currentDirectCodes.includes(p.code) && 'opacity-50')}>
                    <input type="checkbox" disabled={currentDirectCodes.includes(p.code)} checked={permIds.includes(p.id) || currentDirectCodes.includes(p.code)} onChange={e => setPermIds(prev => e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id))} />
                    <code className="text-xs text-gray-600">{p.code}</code>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && review && (() => {
            const addedRoles = (review as { addedRoles?: RoleSummary[] }).addedRoles ?? [];
            const addedCodes = (review as { addedCodes?: string[] }).addedCodes ?? [];
            return (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Review changes</p>
                {addedRoles.length > 0 && (
                  <div><p className="text-xs text-gray-500 mb-1">Roles to add</p>{addedRoles.map(r => <span key={r.id} className="inline-block text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded mr-1 mb-1">+ {r.name}</span>)}</div>
                )}
                {addedCodes.length > 0 && (
                  <div><p className="text-xs text-gray-500 mb-1">Permissions to add</p><div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">{addedCodes.map(c => <span key={c} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">+ {c}</span>)}</div></div>
                )}
                {addedRoles.length === 0 && addedCodes.length === 0 && (
                  <p className="text-sm text-gray-400">No new access — selections are already granted.</p>
                )}
              </div>
            );
          })()}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <button onClick={() => step === 1 ? onClose() : setStep((step - 1) as 1 | 2)} className="text-sm text-gray-500 hover:text-gray-700">{step === 1 ? 'Cancel' : 'Back'}</button>
          {step === 2 && <button onClick={() => setStep(3)} disabled={method === 'copy' && !sourceUserId} className="px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">Next</button>}
          {step === 3 && <button onClick={apply} disabled={busy} className="px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">{busy ? 'Applying…' : 'Confirm & Apply'}</button>}
        </div>
      </div>
    </div>
  );
}
