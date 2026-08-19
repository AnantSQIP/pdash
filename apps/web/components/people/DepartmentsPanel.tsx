'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Crown, Loader, Pencil, Plus, Search, Trash2, UserMinus, UserPlus, X,
} from 'lucide-react';
import { api, type DepartmentSummary, type UserSummary } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/Avatar';
import { fullName } from '@/lib/avatar';

/**
 * Department management.
 *
 * The API for this has existed since Phase 1 — list, create, add and remove members, all
 * permission-gated — but the web client only ever called `list`. So departments could be read and
 * never created, and the card carried a "Manage in Admin →" link to a page with no department
 * management on it. This screen is the missing half.
 *
 * Everything here is gated on the same permission the server enforces, so a Consultant sees the
 * departments and none of the controls, rather than buttons that fail on click.
 */

// ── Create / rename ───────────────────────────────────────────────────────────
function DepartmentModal({
  existing, onClose, onDone,
}: { existing?: DepartmentSummary; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) { toast('A department needs a name.', 'error'); return; }
    setBusy(true);
    try {
      if (existing) await api.departments.update(existing.id, { name: trimmed, description: description.trim() });
      else await api.departments.create({ name: trimmed, description: description.trim() });
      toast(existing ? 'Department updated' : `“${trimmed}” created`);
      onDone(); onClose();
    } catch (e) {
      // The server answers 409 with the clashing name in the message — show it rather than a
      // generic failure, because "already exists" is something the user can act on.
      toast(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally { setBusy(false); }
  }

  return (
    <Modal
      title={existing ? 'Edit department' : 'New department'}
      size="md"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={save} disabled={busy || !name.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60">
            {busy && <Loader size={14} className="animate-spin" />}{existing ? 'Save' : 'Create'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus
            placeholder="e.g. Search &amp; Analytics"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description <span className="font-normal normal-case text-gray-400">(optional)</span></label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={500}
            placeholder="What this department is responsible for"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>
    </Modal>
  );
}

// ── Add members ───────────────────────────────────────────────────────────────
function AddMembersModal({
  dept, everyone, onClose, onDone,
}: { dept: DepartmentSummary; everyone: UserSummary[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const inDept = new Set((dept.members ?? []).map(m => m.id));

  // Someone already in the department is not a candidate. Sorted by name so the list does not
  // reorder as people are added out of it.
  const candidates = useMemo(() => {
    const s = q.trim().toLowerCase();
    return everyone
      .filter(u => !inDept.has(u.id) && u.status === 'ACTIVE')
      .filter(u => !s || `${fullName(u)} ${u.email} ${u.designation ?? ''}`.toLowerCase().includes(s))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [everyone, q, dept.members]);

  async function add(u: UserSummary) {
    setBusyId(u.id);
    try { await api.departments.addMember(dept.id, u.id); onDone(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not add', 'error'); }
    finally { setBusyId(null); }
  }

  return (
    <Modal title={`Add to ${dept.name}`} subtitle={`${candidates.length} available`} size="md" onClose={onClose}
      footer={<div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Done</button></div>}>
      <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 mb-3 focus-within:border-brand-400">
        <Search size={15} className="text-gray-400 shrink-0" />
        <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Search people…"
          className="flex-1 text-sm focus:outline-none bg-transparent" />
      </div>
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {candidates.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            {q ? `Nobody matches “${q}”.` : 'Everyone active is already in this department.'}
          </p>
        )}
        {candidates.map(u => (
          <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50">
            <Avatar user={u} size={30} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{fullName(u)}</p>
              <p className="text-xs text-gray-400 truncate">{u.designation ?? u.email}</p>
            </div>
            <button onClick={() => add(u)} disabled={busyId === u.id}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-60">
              {busyId === u.id ? <Loader size={13} className="animate-spin" /> : <UserPlus size={13} />} Add
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── One department card ───────────────────────────────────────────────────────
function DepartmentCard({
  dept, everyone, canUpdate, canDelete, onChanged,
}: {
  dept: DepartmentSummary; everyone: UserSummary[];
  canUpdate: boolean; canDelete: boolean; onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const members = dept.members ?? [];

  async function removeMember(userId: string, name: string) {
    if (!confirm(`Remove ${name} from ${dept.name}?`)) return;
    try {
      const r = await api.departments.removeMember(dept.id, userId);
      toast(r.headCleared ? `${name} removed — the department has no head now` : `${name} removed`);
      onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not remove', 'error'); }
  }

  async function setHead(userId: string | null, name?: string) {
    try {
      await api.departments.setHead(dept.id, userId);
      toast(userId ? `${name} is now head of ${dept.name}` : 'Head cleared');
      onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not set head', 'error'); }
  }

  async function del() {
    if (!confirm(`Delete “${dept.name}”? Its ${members.length} membership${members.length === 1 ? '' : 's'} go with it. People themselves are not affected.`)) return;
    try { await api.departments.remove(dept.id); toast(`“${dept.name}” deleted`); onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not delete', 'error'); }
  }

  // Everyone is shown once the card is expanded; collapsed shows six avatars and a count.
  const shown = expanded ? members : members.slice(0, 6);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{dept.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {members.length} member{members.length === 1 ? '' : 's'}
            {dept.head && <> · Head: <span className="font-medium text-gray-700">{fullName(dept.head)}</span></>}
          </p>
          {dept.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{dept.description}</p>}
        </div>
        {(canUpdate || canDelete) && (
          <div className="flex items-center gap-1 shrink-0">
            {canUpdate && (
              <button onClick={() => setEditing(true)} title="Rename or edit description"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"><Pencil size={14} /></button>
            )}
            {canDelete && (
              <button onClick={del} title="Delete department"
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
            )}
          </div>
        )}
      </div>

      {members.length === 0 ? (
        <p className="text-xs text-gray-400 py-3">No members yet.</p>
      ) : !expanded ? (
        <button onClick={() => setExpanded(true)} className="flex items-center gap-2 mb-3 group" title="Show members">
          <span className="flex -space-x-2">
            {shown.map(u => <Avatar key={u.id} user={u} size={28} className="ring-2 ring-white" />)}
          </span>
          {members.length > 6 && <span className="text-xs text-gray-400">+{members.length - 6}</span>}
          <span className="text-xs text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">Manage</span>
        </button>
      ) : (
        <div className="space-y-1 mb-3 max-h-64 overflow-y-auto">
          {members.map(u => {
            const isHead = dept.headUserId === u.id || dept.head?.id === u.id;
            return (
              <div key={u.id} className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-gray-50">
                <Avatar user={u} size={28} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                    {fullName(u)}
                    {isHead && <Crown size={12} className="text-amber-500 shrink-0" aria-label="Department head" />}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{u.roleInDepartment || u.designation || u.email}</p>
                </div>
                {canUpdate && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => setHead(isHead ? null : u.id, fullName(u))}
                      title={isHead ? 'Remove as head' : 'Make head of department'}
                      className={`p-1.5 rounded-lg hover:bg-amber-50 ${isHead ? 'text-amber-500' : 'text-gray-300 hover:text-amber-500'}`}>
                      <Crown size={13} />
                    </button>
                    <button onClick={() => removeMember(u.id, fullName(u))} title="Remove from department"
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50"><UserMinus size={13} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        {canUpdate && (
          <button onClick={() => setAdding(true)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <UserPlus size={13} /> Add members
          </button>
        )}
        {members.length > 0 && (
          <button onClick={() => setExpanded(v => !v)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">
            {expanded ? 'Collapse' : 'Members'}
          </button>
        )}
      </div>

      {editing && <DepartmentModal existing={dept} onClose={() => setEditing(false)} onDone={onChanged} />}
      {adding && <AddMembersModal dept={dept} everyone={everyone} onClose={() => setAdding(false)} onDone={onChanged} />}
    </div>
  );
}

// ── The panel ─────────────────────────────────────────────────────────────────
export function DepartmentsPanel({ everyone }: { everyone: UserSummary[] }) {
  const { org } = useOrg();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const canCreate = can('department.create');
  const canUpdate = can('department.update');
  const canDelete = can('department.delete');

  const { data: departments = [], isLoading } = useQuery<DepartmentSummary[]>({
    queryKey: ['departments', org?.id],
    queryFn: () => api.departments.list(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['departments'] });

  // People in no department at all. Worth surfacing: a department structure that covers half the
  // firm looks complete on screen while quietly leaving people out of anything scoped by it.
  const unassigned = useMemo(() => {
    const assigned = new Set(departments.flatMap(d => (d.members ?? []).map(m => m.id)));
    return everyone.filter(u => u.status === 'ACTIVE' && !assigned.has(u.id));
  }, [departments, everyone]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader size={18} className="animate-spin mr-2" /><span className="text-sm">Loading departments…</span></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          {departments.length === 0 ? 'No departments yet' : `${departments.length} department${departments.length === 1 ? '' : 's'}`}
          {unassigned.length > 0 && departments.length > 0 && (
            <> · <span className="text-amber-700">{unassigned.length} {unassigned.length === 1 ? 'person is' : 'people are'} in none</span></>
          )}
        </p>
        {canCreate && (
          <button onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">
            <Plus size={15} /> New department
          </button>
        )}
      </div>

      {departments.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-xl py-14 text-center">
          <Building2 size={26} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-medium text-gray-600">No departments have been set up yet.</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            A department groups people by function. It is separate from a role, which decides what
            somebody can do, and from a team space, which is where non-delivery work lives.
          </p>
          {canCreate && (
            <button onClick={() => setCreating(true)} className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">
              <Plus size={15} /> Create the first one
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {departments.map(d => (
            <DepartmentCard key={d.id} dept={d} everyone={everyone}
              canUpdate={canUpdate} canDelete={canDelete} onChanged={refresh} />
          ))}
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-900 mb-1.5">
            {unassigned.length} {unassigned.length === 1 ? 'person is' : 'people are'} not in any department
          </p>
          <p className="text-xs text-amber-800 mb-2.5">
            Anything filtered by department will leave them out.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map(u => (
              <span key={u.id} className="inline-flex items-center gap-1.5 bg-white/70 rounded-full pl-1 pr-2.5 py-0.5">
                <Avatar user={u} size={20} />
                <span className="text-xs font-medium text-amber-900">{fullName(u)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {creating && <DepartmentModal onClose={() => setCreating(false)} onDone={refresh} />}
    </div>
  );
}
