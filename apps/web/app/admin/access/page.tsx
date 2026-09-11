'use client';

/**
 * Access Control — the role × permission matrix.
 *
 * Until now role permissions could only be changed by editing permissions-catalog.ts and running
 * the regrant script, which meant a deploy for a question as ordinary as "can a Manager see the
 * team's attendance?". This screen answers that question in the product, for a Super Admin, in
 * about four clicks.
 *
 * Three things make it safe to hand someone a grid with nine hundred boxes in it:
 *
 *  1. Only a Super Admin reaches it, and the passcode step-up still applies on save. The server
 *     enforces both (RbacService.setRolePermissions) — the checks here are the courtesy, not the
 *     control.
 *  2. Nothing saves until the change is read back as prose. PUT /roles/:id/permissions REPLACES a
 *     role's rows wholesale, so a stray click does not error — it quietly takes a capability away
 *     from everyone holding that role. The review step names every removal and how many people it
 *     lands on, because that is the mistake this screen would otherwise make easy.
 *  3. The Super Admin row is locked. The resolver grants that role everything regardless of what
 *     is stored, so unticking a box there would look like it did something and would not.
 */

import { Fragment, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Info, Loader, Lock,
  RotateCcw, Search, Shield, ShieldCheck, SlidersHorizontal, X,
} from 'lucide-react';
import { api, type RoleSummary } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { toast, toastError } from '@/components/ui/Toast';
import {
  MODULES, UNCATALOGUED_KEY, describeDiff, groupByModule, isImplicitAllRole,
  labelForCode, planChanges, type MatrixCell, type RoleGrantChange,
} from '@/lib/permission-matrix';

// Jump straight to the two things the review actually asked for, so nobody has to know that
// "can a Manager see everyone's attendance" lives under a module called Attendance.
const SHORTCUTS: { label: string; module: string; search: string }[] = [
  { label: 'Attendance', module: 'attendance', search: '' },
  { label: 'Project creation', module: 'project', search: 'create' },
  { label: 'Performance', module: 'performance', search: '' },
  { label: 'Permanent deletion', module: '', search: 'delete.permanent' },
];

export default function AccessControlPage() {
  const { org } = useOrg();
  const { isSuperAdmin, loading } = usePermissions();

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }

  // Requirement 23, verbatim: "only a Super Admin may change them". Holding role.update is not
  // enough — the server agrees (see RbacService.setRolePermissions).
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <Shield size={40} className="text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Super Admin only</p>
        <p className="text-sm text-gray-400 mt-1 max-w-sm">
          Role permissions decide what everyone in the firm can do, so only a Super Admin may open
          or change them.
        </p>
        <Link href="/admin" className="mt-4 text-sm text-brand-600 hover:underline">Back to Administration</Link>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-600 mb-3">
          <ArrowLeft size={15} /> Back to Administration
        </Link>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <SlidersHorizontal size={20} className="text-brand-600" /> Access Control
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          What each role may do. Changes here apply to everybody holding the role, immediately.
        </p>
      </div>
      {org
        ? <AccessMatrix orgId={org.id} />
        : <p className="p-6 text-sm text-gray-400">Loading organisation…</p>}
    </div>
  );
}

function AccessMatrix({ orgId }: { orgId: string }) {
  const qc = useQueryClient();

  const { data: perms = [], isLoading: permsLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.permissions.list(),
    staleTime: 60_000,
    refetchOnMount: 'always',
  });
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['roles', orgId],
    queryFn: () => api.roles.list(orgId),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });

  // Only roles the Super Admin has actually touched appear here. Keeping the untouched ones out
  // is what makes the save plan honest: a role with no entry is a role we will not write to.
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { groups, missingFromDatabase, unknownToCatalog } = useMemo(() => groupByModule(perms), [perms]);
  const idByCode = useMemo(() => new Map(perms.map(p => [p.code, p.id])), [perms]);

  // Super Admin first — it is the reference column everything else is read against.
  const orderedRoles = useMemo(
    () => [...roles].sort((a, b) =>
      (isImplicitAllRole(a.name) ? 0 : 1) - (isImplicitAllRole(b.name) ? 0 : 1) || a.name.localeCompare(b.name)),
    [roles],
  );

  const heldByRole = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of orderedRoles) m.set(r.id, new Set(draft[r.id] ?? r.permissionCodes));
    return m;
  }, [orderedRoles, draft]);

  const baseByRole = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of orderedRoles) m.set(r.id, new Set(r.permissionCodes));
    return m;
  }, [orderedRoles]);

  const changes = useMemo(() => planChanges(orderedRoles, draft), [orderedRoles, draft]);
  const removalCount = changes.reduce((n, c) => n + c.diff.removed.length, 0);
  const peopleAffected = changes.reduce((n, c) => n + c.memberCount, 0);

  const toggle = useCallback((role: RoleSummary, code: string) => {
    setDraft(prev => {
      const next = new Set(prev[role.id] ?? role.permissionCodes);
      if (next.has(code)) next.delete(code); else next.add(code);
      return { ...prev, [role.id]: [...next].sort() };
    });
  }, []);

  /** Whole module, one role — the shape requirement 24 is phrased in ("all the attendance ones"). */
  const setModuleForRole = useCallback((role: RoleSummary, codes: string[], on: boolean) => {
    setDraft(prev => {
      const next = new Set(prev[role.id] ?? role.permissionCodes);
      codes.forEach(c => (on ? next.add(c) : next.delete(c)));
      return { ...prev, [role.id]: [...next].sort() };
    });
  }, []);

  const cellChanged = useCallback((roleId: string, code: string) => {
    const held = heldByRole.get(roleId)?.has(code) ?? false;
    const base = baseByRole.get(roleId)?.has(code) ?? false;
    return held !== base;
  }, [heldByRole, baseByRole]);

  // ── filtering ──────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const visibleGroups = useMemo(() => groups
    .filter(g => !moduleFilter || g.key === moduleFilter)
    .map(g => ({
      ...g,
      cells: g.cells.filter(c => {
        if (q && !(c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q) || g.label.toLowerCase().includes(q))) return false;
        if (changedOnly && !orderedRoles.some(r => cellChanged(r.id, c.code))) return false;
        return true;
      }),
    }))
    .filter(g => g.cells.length > 0),
  [groups, moduleFilter, q, changedOnly, orderedRoles, cellChanged]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    const saved: string[] = [];
    try {
      // One request per changed role, in sequence. The org passcode is collected once by the
      // api client and reused for the rest, so a nine-role edit is still a single prompt.
      for (const change of changes) {
        const ids = change.codes.map(c => idByCode.get(c)).filter((id): id is string => !!id);
        await api.roles.setPermissions(change.roleId, ids);
        saved.push(change.roleId);
      }
      setDraft({});
      setReviewing(false);
      toast(`Saved — ${changes.length} role${changes.length === 1 ? '' : 's'} updated`, 'success');
    } catch (e) {
      // A partial failure is the dangerous case: some roles are already written. Drop those from
      // the draft so a retry does not re-send them, and say plainly which ones landed.
      if (saved.length) {
        setDraft(prev => {
          const next = { ...prev };
          saved.forEach(id => delete next[id]);
          return next;
        });
      }
      const names = changes.filter(c => saved.includes(c.roleId)).map(c => c.roleName);
      setSaveError(
        `${e instanceof Error ? e.message : 'Save failed.'}${names.length ? ` Already saved: ${names.join(', ')}. The rest are still pending below.` : ''}`,
      );
      toastError(e, 'Could not save role permissions');
    } finally {
      setSaving(false);
      await qc.invalidateQueries({ queryKey: ['roles', orgId] });
      await qc.invalidateQueries({ queryKey: ['effective-permissions'] });
      await qc.invalidateQueries({ queryKey: ['eff'] });
    }
  }

  if (permsLoading || rolesLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading the permission catalog…</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* ── controls ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-56"
            placeholder="Find a permission…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          value={moduleFilter}
          onChange={e => setModuleFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
        >
          <option value="">All modules</option>
          {MODULES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          {unknownToCatalog.length > 0 && <option value={UNCATALOGUED_KEY}>Not in the catalog</option>}
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 px-2">
          <input type="checkbox" checked={changedOnly} onChange={e => setChangedOnly(e.target.checked)} className="rounded" />
          Changed only
        </label>
        <span className="text-gray-200">|</span>
        {SHORTCUTS.map(s => (
          <button
            key={s.label}
            onClick={() => { setModuleFilter(s.module); setSearch(s.search); setCollapsed(new Set()); }}
            className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => { setModuleFilter(''); setSearch(''); setChangedOnly(false); }}
          className="text-xs px-2.5 py-1 rounded-full text-gray-400 hover:text-gray-600"
        >
          Clear
        </button>

        <div className="ml-auto flex items-center gap-2">
          {changes.length > 0 && (
            <button onClick={() => setDraft({})} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 rounded-lg hover:bg-gray-100">
              <RotateCcw size={14} /> Discard
            </button>
          )}
          <button
            disabled={changes.length === 0}
            onClick={() => setReviewing(true)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-40"
          >
            <Check size={14} />
            {changes.length === 0
              ? 'No changes'
              : `Review ${changes.length} role${changes.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {changes.length > 0 && (
        <div className={clsx(
          'rounded-xl border px-3 py-2.5 text-xs flex items-start gap-2',
          removalCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800',
        )}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            Unsaved: {changes.map(c => `${c.roleName} (${describeDiff(c.diff)})`).join(' · ')}.
            {removalCount > 0 && <> <b>{removalCount} permission{removalCount === 1 ? '' : 's'} would be taken away</b> from roles held by {peopleAffected} {peopleAffected === 1 ? 'person' : 'people'}.</>}
          </span>
        </div>
      )}

      {saveError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /><span>{saveError}</span>
        </div>
      )}

      {missingFromDatabase.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600 flex items-start gap-2">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>
            {missingFromDatabase.length} permission{missingFromDatabase.length === 1 ? ' is' : 's are'} defined in the
            catalog but not yet present in this database, so {missingFromDatabase.length === 1 ? 'it cannot' : 'they cannot'} be
            granted here: <span className="font-mono">{missingFromDatabase.join(', ')}</span>. Run the regrant script on this
            environment.
          </span>
        </div>
      )}

      {unknownToCatalog.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600 flex items-start gap-2">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>
            {unknownToCatalog.length} permission{unknownToCatalog.length === 1 ? '' : 's'} in this database
            {unknownToCatalog.length === 1 ? ' is' : ' are'} not in the catalog. They are shown at the bottom under
            <b> Not in the catalog</b> so they can still be revoked.
          </span>
        </div>
      )}

      {/* ── the grid ─────────────────────────────────────────────────────── */}
      {/* Both axes scroll and both headers stick: with nine roles and ninety-eight codes, a cell
          you cannot trace back to its row and its column is a cell you will tick by accident. */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[calc(100vh-22rem)] min-h-[24rem]">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-gray-50 border-b border-r border-gray-200 text-left px-4 py-2.5 min-w-[16rem]">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Permission</span>
              </th>
              {orderedRoles.map(role => {
                const held = heldByRole.get(role.id)!;
                const implicit = isImplicitAllRole(role.name);
                return (
                  <th key={role.id} className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-2 py-2.5 min-w-[7.5rem] align-bottom">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs font-semibold text-gray-700 text-center leading-tight">{role.name}</span>
                      <span className="text-[10px] text-gray-400">
                        {role.memberCount} {role.memberCount === 1 ? 'person' : 'people'}
                      </span>
                      <span className="text-[10px] text-gray-400 inline-flex items-center gap-1">
                        {implicit
                          ? <><Lock size={9} /> all</>
                          : <>{held.size} granted</>}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map(group => {
              const isCollapsed = collapsed.has(group.key);
              const groupCodes = group.cells.filter(c => c.id).map(c => c.code);
              return (
                <Fragment key={group.key}>
                  <tr className="bg-gray-50/70">
                    <td className="sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-200 px-3 py-2">
                      <button
                        onClick={() => setCollapsed(prev => {
                          const next = new Set(prev);
                          if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                          return next;
                        })}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700"
                      >
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        {group.label}
                        <span className="text-[10px] font-normal text-gray-400">{group.cells.length}</span>
                      </button>
                    </td>
                    {orderedRoles.map(role => {
                      const implicit = isImplicitAllRole(role.name);
                      const held = heldByRole.get(role.id)!;
                      const on = groupCodes.filter(c => held.has(c)).length;
                      return (
                        <td key={role.id} className="border-b border-gray-200 text-center px-2 py-1.5">
                          {implicit ? (
                            <span className="text-[10px] text-gray-400">all</span>
                          ) : (
                            <button
                              onClick={() => setModuleForRole(role, groupCodes, on < groupCodes.length)}
                              // Deliberately the SHOWN cells, not the whole module: with a filter
                              // on, what you see is what you toggle. The review step lists the
                              // result either way.
                              title={on < groupCodes.length
                                ? `Grant the ${groupCodes.length} ${group.label} permissions shown to ${role.name}`
                                : `Remove the ${groupCodes.length} ${group.label} permissions shown from ${role.name}`}
                              className={clsx(
                                'text-[10px] px-1.5 py-0.5 rounded border',
                                on === 0 ? 'border-gray-200 text-gray-400 hover:bg-gray-100'
                                  : on === groupCodes.length ? 'border-brand-200 bg-brand-50 text-brand-700'
                                    : 'border-gray-300 text-gray-600 hover:bg-gray-100',
                              )}
                            >
                              {on}/{groupCodes.length}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {!isCollapsed && group.cells.map(cell => (
                    <MatrixRow
                      key={cell.code}
                      cell={cell}
                      roles={orderedRoles}
                      heldByRole={heldByRole}
                      cellChanged={cellChanged}
                      onToggle={toggle}
                    />
                  ))}
                </Fragment>
              );
            })}
            {visibleGroups.length === 0 && (
              <tr>
                <td colSpan={orderedRoles.length + 1} className="px-4 py-10 text-center text-sm text-gray-400">
                  Nothing matches that filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <ShieldCheck size={13} />
        The <b className="font-medium text-gray-500">Super Admin</b> column is locked: that role is granted everything by
        the permission resolver whatever is stored against it, so a tick box there would be decoration.
      </p>

      {reviewing && (
        <ReviewModal
          changes={changes}
          saving={saving}
          onCancel={() => setReviewing(false)}
          onConfirm={save}
        />
      )}
    </div>
  );
}

function MatrixRow({ cell, roles, heldByRole, cellChanged, onToggle }: {
  cell: MatrixCell;
  roles: RoleSummary[];
  heldByRole: Map<string, Set<string>>;
  cellChanged: (roleId: string, code: string) => boolean;
  onToggle: (role: RoleSummary, code: string) => void;
}) {
  return (
    <tr className="hover:bg-gray-50/60">
      <td className="sticky left-0 z-10 bg-white border-b border-r border-gray-100 px-4 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-700">{cell.label}</span>
          {cell.note && (
            <span title={cell.note} className="text-gray-300 hover:text-brand-500 cursor-help">
              <Info size={12} />
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-gray-400">{cell.code}</span>
      </td>
      {roles.map(role => {
        const implicit = isImplicitAllRole(role.name);
        const held = heldByRole.get(role.id)?.has(cell.code) ?? false;
        const changed = cellChanged(role.id, cell.code);
        // A code with no row in the `permission` table has no id to send, so it cannot be granted.
        const grantable = !!cell.id;
        return (
          <td key={role.id} className={clsx('border-b border-gray-100 text-center px-2 py-1.5', changed && (held ? 'bg-green-50' : 'bg-red-50'))}>
            {implicit ? (
              <Lock size={13} className="inline text-gray-300" aria-label={`${role.name} always holds every permission`} />
            ) : (
              <input
                type="checkbox"
                className="rounded cursor-pointer disabled:cursor-not-allowed"
                checked={held}
                disabled={!grantable}
                title={grantable ? `${role.name} — ${cell.code}` : 'Not present in this database yet'}
                aria-label={`${role.name}: ${cell.code}`}
                onChange={() => onToggle(role, cell.code)}
              />
            )}
          </td>
        );
      })}
    </tr>
  );
}

/**
 * The last thing between a click and a live permission change. Deliberately wordy: it lists every
 * code by its human name AND how many people hold the role, because "Manager −1" is not enough
 * information to catch a mistake with.
 */
function ReviewModal({ changes, saving, onCancel, onConfirm }: {
  changes: RoleGrantChange[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const removals = changes.reduce((n, c) => n + c.diff.removed.length, 0);
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Confirm permission changes</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {removals > 0 && (
            <div className="flex gap-2.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                This takes {removals} permission{removals === 1 ? '' : 's'} away. Anyone holding these roles loses the
                capability the moment you save — including work they may be part-way through.
              </p>
            </div>
          )}

          {changes.map(change => (
            <div key={change.roleId} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-800">{change.roleName}</span>
                <span className="text-[11px] text-gray-500">
                  {change.memberCount} {change.memberCount === 1 ? 'person' : 'people'} · {describeDiff(change.diff)}
                </span>
              </div>
              <div className="p-3 space-y-2">
                {change.diff.added.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-green-700 mb-1">Granted</p>
                    <ul className="space-y-0.5">
                      {change.diff.added.map(code => (
                        <li key={code} className="text-xs text-gray-700 flex items-baseline gap-2">
                          <Check size={11} className="text-green-600 shrink-0 translate-y-0.5" />
                          <span>{labelForCode(code)} <span className="font-mono text-gray-400">{code}</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {change.diff.removed.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700 mb-1">Taken away</p>
                    <ul className="space-y-0.5">
                      {change.diff.removed.map(code => (
                        <li key={code} className="text-xs text-gray-700 flex items-baseline gap-2">
                          <X size={11} className="text-red-600 shrink-0 translate-y-0.5" />
                          <span>{labelForCode(code)} <span className="font-mono text-gray-400">{code}</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}

          <p className="text-[11px] text-gray-400">
            You will be asked for the organisation passcode — role permissions are a “big change”.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
          <button
            disabled={saving}
            onClick={onConfirm}
            className={clsx(
              'inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-50',
              removals > 0 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-brand-600 hover:bg-brand-700',
            )}
          >
            {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Saving…' : 'Apply changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
