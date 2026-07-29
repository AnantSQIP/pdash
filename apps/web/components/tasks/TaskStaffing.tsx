'use client';

import { useMemo, useState } from 'react';
import { Loader, Plus, X, UserCog, ShieldCheck, FlaskConical } from 'lucide-react';
import { api, type ApiTask, type StaffingEntry, type TaskRole } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/Avatar';
import { fmtHours } from '@/lib/date';

type Row = { userId: string; hours: string };
const rowsFor = (task: ApiTask, role: TaskRole): Row[] =>
  (task.assignees ?? []).filter(a => a.role === role).map(a => ({ userId: a.userId, hours: a.estimatedHours != null ? String(a.estimatedHours) : '' }));
// The task's PM defaults to the project's manager (defaultManagerId) until the task sets its own
// — so every task inherits the project's PM, but it can be changed per task.
const pmOf = (task: ApiTask, defaultManagerId?: string | null): Row => {
  const pm = (task.assignees ?? []).find(a => a.role === 'PM');
  if (pm) return { userId: pm.userId, hours: pm.estimatedHours != null ? String(pm.estimatedHours) : '' };
  return { userId: defaultManagerId ?? '', hours: '' };
};

/**
 * Role-based task staffing: one Project Manager, many Reviewers, many Analysts. Per-person
 * estimated hours are OPTIONAL (blank = 0) — e.g. a reviewer can be added with no estimate, or
 * a small one added later. The task's total estimate is the sum, saved server-side.
 */
export function TaskStaffing({ task, readOnly, canAssign, defaultManagerId, onSaved }: {
  task: ApiTask; readOnly?: boolean; canAssign: boolean; defaultManagerId?: string | null; onSaved?: (t: ApiTask) => void;
}) {
  const { users } = useOrg();
  const { toast } = useToast();
  const [pm, setPm] = useState<Row>(() => pmOf(task, defaultManagerId));
  const [reviewers, setReviewers] = useState<Row[]>(() => rowsFor(task, 'REVIEWER'));
  const [analysts, setAnalysts] = useState<Row[]>(() => rowsFor(task, 'ANALYST'));
  const [saving, setSaving] = useState(false);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => `${a.firstName} ${a.lastName}`.toLowerCase().localeCompare(`${b.firstName} ${b.lastName}`.toLowerCase())),
    [users],
  );
  const editable = canAssign && !readOnly;

  const total = useMemo(() => {
    const all = [pm.hours, ...reviewers.map(r => r.hours), ...analysts.map(r => r.hours)];
    return all.map(h => parseFloat(h)).filter(n => Number.isFinite(n)).reduce((s, n) => s + n, 0);
  }, [pm, reviewers, analysts]);

  function build(): StaffingEntry[] | string {
    const out: StaffingEntry[] = [];
    const add = (userId: string, role: TaskRole, hoursStr: string): string | null => {
      if (!userId) return null; // an empty picker row is simply ignored
      // Hours are optional — a blank field means 0 (e.g. a reviewer with no estimate yet).
      const trimmed = hoursStr.trim();
      const h = trimmed === '' ? 0 : parseFloat(trimmed);
      if (!Number.isFinite(h) || h < 0) return 'Estimated hours cannot be negative.';
      out.push({ userId, role, estimatedHours: h });
      return null;
    };
    for (const [uid, role, hrs] of ([[pm.userId, 'PM', pm.hours]] as [string, TaskRole, string][])
      .concat(reviewers.map(r => [r.userId, 'REVIEWER', r.hours]))
      .concat(analysts.map(r => [r.userId, 'ANALYST', r.hours]))) {
      const err = add(uid, role, hrs);
      if (err) return err;
    }
    const ids = out.map(e => e.userId);
    if (new Set(ids).size !== ids.length) return 'The same person is added to more than one role.';
    return out;
  }

  async function save() {
    const built = build();
    if (typeof built === 'string') { toast(built, 'error'); return; }
    setSaving(true);
    try {
      const updated = await api.tasks.setStaffing(task.id, built);
      onSaved?.(updated);
      toast('Staffing saved', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save staffing', 'error');
    } finally { setSaving(false); }
  }

  const PersonRow = ({ row, onChange, onRemove }: { row: Row; onChange: (r: Row) => void; onRemove?: () => void }) => {
    const picked = users.find(u => u.id === row.userId);
    return (
      <div className="flex items-center gap-2">
        {picked && <Avatar user={picked} size={26} className="shrink-0" />}
        <select
          value={row.userId} disabled={!editable}
          onChange={e => onChange({ ...row, userId: e.target.value })}
          className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">Select a person…</option>
          {sortedUsers.map(u => (
            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}{u.designation ? ` — ${u.designation}` : ''}</option>
          ))}
        </select>
        <div className="relative w-24 shrink-0">
          <input
            type="number" min="0" step="0.25" value={row.hours} disabled={!editable}
            onChange={e => onChange({ ...row, hours: e.target.value })}
            placeholder="0"
            className="w-full pr-7 pl-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">h</span>
        </div>
        {editable && onRemove && (
          <button type="button" onClick={onRemove} className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 shrink-0" title="Remove">
            <X size={14} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {readOnly && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          This project is completed or closed — staffing is read-only.
        </p>
      )}

      {/* Project Manager — one */}
      <section>
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2"><UserCog size={15} className="text-brand-600" /> Project Manager</h3>
        <PersonRow row={pm} onChange={setPm} onRemove={pm.userId ? () => setPm({ userId: '', hours: '' }) : undefined} />
      </section>

      {/* Reviewers — many */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><ShieldCheck size={15} className="text-indigo-600" /> Reviewers</h3>
          {editable && (
            <button type="button" onClick={() => setReviewers(r => [...r, { userId: '', hours: '' }])}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"><Plus size={13} /> Add reviewer</button>
          )}
        </div>
        <div className="space-y-2">
          {reviewers.length === 0 && <p className="text-xs text-gray-400 italic">No reviewers added.</p>}
          {reviewers.map((r, i) => (
            <PersonRow key={i} row={r}
              onChange={next => setReviewers(list => list.map((x, j) => j === i ? next : x))}
              onRemove={() => setReviewers(list => list.filter((_, j) => j !== i))} />
          ))}
        </div>
      </section>

      {/* Analysts — many */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><FlaskConical size={15} className="text-emerald-600" /> Analysts</h3>
          {editable && (
            <button type="button" onClick={() => setAnalysts(a => [...a, { userId: '', hours: '' }])}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"><Plus size={13} /> Add analyst</button>
          )}
        </div>
        <div className="space-y-2">
          {analysts.length === 0 && <p className="text-xs text-gray-400 italic">No analysts added.</p>}
          {analysts.map((r, i) => (
            <PersonRow key={i} row={r}
              onChange={next => setAnalysts(list => list.map((x, j) => j === i ? next : x))}
              onRemove={() => setAnalysts(list => list.filter((_, j) => j !== i))} />
          ))}
        </div>
      </section>

      {/* Total + save */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total estimated hours</p>
          <p className="text-lg font-bold text-gray-900">{fmtHours(total)}</p>
          <p className="text-[11px] text-gray-400">Auto-summed from everyone’s hours.</p>
        </div>
        {editable && (
          <button type="button" onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {saving ? <Loader size={14} className="animate-spin" /> : null} Save staffing
          </button>
        )}
      </div>
    </div>
  );
}
