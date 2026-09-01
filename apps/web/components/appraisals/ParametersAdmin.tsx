'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Plus, Loader, Trash2, Users2, BadgeCheck, Globe, Pencil, Copy, ChevronUp, ChevronDown, Info,
} from 'lucide-react';
import { api, type AppraisalParameter, type TeamSpace, type UserSummary } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/**
 * What people are rated on — HR's side of the appraisal.
 *
 * The scoping is the whole feature: a criterion applies to a TEAM, or to a POSITION, or to
 * everyone. A person's form is assembled from whatever matches them, so BD and research staff are
 * rated on different things without HR keeping two forms in step by hand.
 *
 * EDITING. This screen could originally create, retire and switch off a parameter — but never
 * change one. Fixing a typo, or moving a weight from 1 to 2, meant deleting and recreating, which
 * detaches every score already recorded against it. The API supported editing all along; only the
 * screen did not, and it sent nothing but `{ active }`.
 *
 * The same form now serves create and edit, so the two cannot drift apart.
 */

type Scope = 'all' | 'team' | 'designation';
type Draft = {
  name: string; description: string; scope: Scope;
  teamId: string; designation: string; weight: string;
};

const emptyDraft = (): Draft => ({ name: '', description: '', scope: 'all', teamId: '', designation: '', weight: '1' });
const draftOf = (p: AppraisalParameter): Draft => ({
  name: p.name,
  description: p.description ?? '',
  scope: p.teamId ? 'team' : p.designation ? 'designation' : 'all',
  teamId: p.teamId ?? '',
  designation: p.designation ?? '',
  weight: String(p.weight ?? 1),
});

export function ParametersAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { users } = useOrg();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  const { data: params = [], isLoading } = useQuery<AppraisalParameter[]>({
    queryKey: ['appraisal-parameters'], queryFn: () => api.appraisals.parameters(),
  });
  const { data: teams = [] } = useQuery<TeamSpace[]>({
    queryKey: ['teams'], queryFn: () => api.teams.list(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['appraisal-parameters'] });
  const fail = (e: unknown) => toast(msg(e), 'error');

  const remove = useMutation({ mutationFn: (id: string) => api.appraisals.removeParameter(id), onSuccess: refresh, onError: fail });
  const patch = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.appraisals.updateParameter(id, data),
    onSuccess: refresh, onError: fail,
  });

  // Every distinct job title in the org — the position axis, taken from the roster rather than
  // typed, so a parameter cannot be scoped to a designation nobody holds.
  const roster = users as UserSummary[];
  const designations = useMemo(
    () => [...new Set(roster.map(u => u.designation).filter(Boolean))].sort() as string[],
    [roster],
  );

  /**
   * How many people a parameter actually reaches.
   *
   * Worth showing because the failure is silent: a criterion scoped to a team nobody has joined,
   * or a job title nobody currently holds, saves cleanly and then appears on no form at all. HR
   * would not find out until an appraisal cycle came back thinner than expected.
   */
  const reach = (p: { teamId?: string | null; designation?: string | null }) => {
    if (p.designation) return roster.filter(u => u.designation === p.designation && u.status === 'ACTIVE').length;
    if (p.teamId) return teams.find(t => t.id === p.teamId)?.members?.length ?? 0;
    return roster.filter(u => u.status === 'ACTIVE').length;
  };

  const scopeOf = (p: AppraisalParameter) => {
    if (p.team) return { icon: Users2, label: p.team.name, tone: 'bg-brand-50 text-brand-700' };
    if (p.designation) return { icon: BadgeCheck, label: p.designation, tone: 'bg-purple-50 text-purple-700' };
    return { icon: Globe, label: 'Everyone', tone: 'bg-gray-100 text-gray-600' };
  };

  const save = () => {
    const data = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      teamId: draft.scope === 'team' ? draft.teamId : null,
      designation: draft.scope === 'designation' ? draft.designation : null,
      weight: Number(draft.weight) || 1,
    };
    if (editing === 'new') {
      api.appraisals.createParameter(data)
        .then(() => { setEditing(null); refresh(); })
        .catch(fail);
    } else if (editing) {
      patch.mutate({ id: editing, data }, { onSuccess: () => setEditing(null) });
    }
  };

  /** Move a parameter up or down by swapping its sequence with its neighbour's. */
  const reorder = (index: number, dir: -1 | 1) => {
    const a = params[index], b = params[index + dir];
    if (!a || !b) return;
    Promise.all([
      api.appraisals.updateParameter(a.id, { name: a.name, sequence: b.sequence }),
      api.appraisals.updateParameter(b.id, { name: b.name, sequence: a.sequence }),
    ]).then(refresh).catch(fail);
  };

  // A weight means nothing on its own — ×2 among ×1s is a very different share from ×2 among ×5s.
  // Shown per SCOPE, because those are the parameters that actually appear on one form together.
  const shareOf = (p: AppraisalParameter) => {
    const siblings = params.filter(q =>
      q.active && (q.teamId ?? null) === (p.teamId ?? null) && (q.designation ?? null) === (p.designation ?? null));
    const total = siblings.reduce((n, q) => n + (q.weight || 1), 0);
    return total > 0 ? Math.round(((p.weight || 1) / total) * 100) : null;
  };

  const ready = draft.name.trim().length >= 2
    && (draft.scope !== 'team' || !!draft.teamId)
    && (draft.scope !== 'designation' || !!draft.designation);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Rating parameters</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            What people are rated on. Scoped to a team, a position, or everyone.
          </p>
        </div>
        <button
          onClick={() => { setDraft(emptyDraft()); setEditing(editing === 'new' ? null : 'new'); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 shrink-0"
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {editing === 'new' && (
        <ParameterForm
          draft={draft} setDraft={setDraft} teams={teams} designations={designations}
          reach={reach(draft.scope === 'team' ? { teamId: draft.teamId }
            : draft.scope === 'designation' ? { designation: draft.designation } : {})}
          ready={ready} saving={false} isNew
          onCancel={() => setEditing(null)} onSave={save}
        />
      )}

      {isLoading ? (
        <p className="px-4 py-4 text-xs text-gray-400">Loading…</p>
      ) : params.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400 text-center">
          No parameters yet. Without any, an appraisal falls back to a single overall mark.
        </p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {params.map((p, i) => {
            const scope = scopeOf(p);
            const Icon = scope.icon;
            const n = reach(p);
            const share = shareOf(p);
            if (editing === p.id) {
              return (
                <li key={p.id}>
                  <ParameterForm
                    draft={draft} setDraft={setDraft} teams={teams} designations={designations}
                    reach={reach(draft.scope === 'team' ? { teamId: draft.teamId }
                      : draft.scope === 'designation' ? { designation: draft.designation } : {})}
                    ready={ready} saving={patch.isPending}
                    onCancel={() => setEditing(null)} onSave={save}
                  />
                </li>
              );
            }
            return (
              <li key={p.id} className={clsx('px-4 py-2.5 flex items-start gap-3', !p.active && 'opacity-50')}>
                <div className="flex flex-col shrink-0 -my-0.5">
                  <button onClick={() => reorder(i, -1)} disabled={i === 0}
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30" title="Move up">
                    <ChevronUp size={11} />
                  </button>
                  <button onClick={() => reorder(i, 1)} disabled={i === params.length - 1}
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30" title="Move down">
                    <ChevronDown size={11} />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    {p.name}
                    {share !== null && (
                      <span className="ml-1.5 text-[11px] font-normal text-brand-600" title={`Weight ×${p.weight} — ${share}% of this form's mark`}>
                        {share}% of the mark
                      </span>
                    )}
                  </p>
                  {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                  {n === 0 && (
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Applies to nobody right now — no active person matches this scope.
                    </p>
                  )}
                </div>
                <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] shrink-0', scope.tone)}
                  title={`${n} ${n === 1 ? 'person' : 'people'}`}>
                  <Icon size={10} /> {scope.label} · {n}
                </span>
                <label className="flex items-center gap-1 text-[11px] text-gray-400 shrink-0 cursor-pointer">
                  <input
                    type="checkbox" checked={p.active}
                    onChange={e => patch.mutate({ id: p.id, data: { name: p.name, active: e.target.checked } })}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  live
                </label>
                <button onClick={() => { setDraft(draftOf(p)); setEditing(p.id); }}
                  className="p-1 rounded text-gray-300 hover:text-brand-600 shrink-0" title="Edit">
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => { setDraft({ ...draftOf(p), name: `${p.name} (copy)` }); setEditing('new'); }}
                  className="p-1 rounded text-gray-300 hover:text-brand-600 shrink-0"
                  title="Duplicate — the usual way to give another team the same criterion">
                  <Copy size={12} />
                </button>
                <button
                  onClick={async () => { if (await confirmDialog({ title: `Retire "${p.name}"? Appraisals already scored against it keep their scores.`, danger: true, confirmLabel: 'Retire' })) remove.mutate(p.id); }}
                  className="p-1 rounded text-gray-300 hover:text-red-500 shrink-0" title="Retire"
                ><Trash2 size={12} /></button>
              </li>
            );
          })}
        </ul>
      )}

      {params.length > 0 && (
        <p className="px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-400 flex items-start gap-1.5">
          <Info size={11} className="mt-0.5 shrink-0" />
          <span>
            Changing a weight affects appraisals scored from now on. Ratings already recorded keep
            the figure they were given — they are not recalculated behind somebody&apos;s back.
          </span>
        </p>
      )}
    </div>
  );
}

/** One form, used for both creating and editing, so the two cannot drift apart. */
function ParameterForm({
  draft, setDraft, teams, designations, reach, ready, saving, isNew, onCancel, onSave,
}: {
  draft: Draft; setDraft: (d: Draft) => void;
  teams: TeamSpace[]; designations: string[];
  reach: number; ready: boolean; saving: boolean; isNew?: boolean;
  onCancel: () => void; onSave: () => void;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });

  return (
    <div className="px-4 py-3 bg-gray-50/60 border-b border-gray-100 space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input
          value={draft.name} onChange={e => set('name', e.target.value)} autoFocus
          placeholder="e.g. Client responsiveness" maxLength={80}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
        />
        <input
          value={draft.description} onChange={e => set('description', e.target.value)}
          placeholder="What it means (optional)" maxLength={300}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Applies to</span>
        {(['all', 'team', 'designation'] as const).map(m => (
          <button
            key={m} onClick={() => set('scope', m)}
            className={clsx('px-2.5 py-1 text-xs rounded-lg border',
              draft.scope === m ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500')}
          >
            {m === 'all' ? 'Everyone' : m === 'team' ? 'A team' : 'A position'}
          </button>
        ))}
        {draft.scope === 'team' && (
          <select value={draft.teamId} onChange={e => set('teamId', e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none">
            <option value="">Pick a team space…</option>
            {teams.filter(t => !t.archivedAt).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {draft.scope === 'designation' && (
          <select value={draft.designation} onChange={e => set('designation', e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none">
            <option value="">Pick a position…</option>
            {designations.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <span className="text-xs text-gray-500 ml-2">Weight</span>
        <input
          value={draft.weight} onChange={e => set('weight', e.target.value)} inputMode="decimal"
          className="w-16 px-2 py-1.5 text-xs border border-gray-300 rounded-lg tabular-nums focus:outline-none"
        />
      </div>

      {/* Who this will actually reach. The failure it prevents is silent: a criterion scoped to a
          team nobody has joined saves cleanly and then shows up on no form at all. */}
      <p className={clsx('text-[11px]', reach === 0 ? 'text-amber-700' : 'text-gray-500')}>
        {reach === 0
          ? 'This would apply to nobody — no active person matches that scope yet.'
          : `Will appear on ${reach} ${reach === 1 ? "person's" : "people's"} form.`}
      </p>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button
          onClick={onSave} disabled={!ready || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? <Loader size={12} className="animate-spin" /> : isNew ? <Plus size={12} /> : <Pencil size={12} />}
          {isNew ? 'Add parameter' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
