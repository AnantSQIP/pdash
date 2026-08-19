'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Plus, Loader, Trash2, Users2, BadgeCheck, Globe } from 'lucide-react';
import { api, type AppraisalParameter, type TeamSpace, type UserSummary } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useToast } from '@/components/ui/Toast';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/**
 * What people are rated on — HR's side of the appraisal.
 *
 * The scoping is the whole feature: a criterion applies to a TEAM, or to a POSITION, or to
 * everyone. A person's form is assembled from whatever matches them, so BD and research staff are
 * rated on different things without HR keeping two forms in step by hand.
 */
export function ParametersAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { users } = useOrg();
  const [adding, setAdding] = useState(false);

  const { data: params = [], isLoading } = useQuery<AppraisalParameter[]>({
    queryKey: ['appraisal-parameters'], queryFn: () => api.appraisals.parameters(),
  });
  const { data: teams = [] } = useQuery<TeamSpace[]>({
    queryKey: ['teams'], queryFn: () => api.teams.list(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['appraisal-parameters'] });
  const remove = useMutation({
    mutationFn: (id: string) => api.appraisals.removeParameter(id),
    onSuccess: refresh,
    onError: e => toast(msg(e), 'error'),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.appraisals.updateParameter(id, { active }),
    onSuccess: refresh,
    onError: e => toast(msg(e), 'error'),
  });

  // Every distinct job title in the org — the position axis, taken from the roster rather than
  // typed, so a parameter cannot be scoped to a designation nobody holds.
  const designations = [...new Set((users as UserSummary[]).map(u => u.designation).filter(Boolean))].sort() as string[];

  const scopeOf = (p: AppraisalParameter) => {
    if (p.team) return { icon: Users2, label: p.team.name, tone: 'bg-brand-50 text-brand-700' };
    if (p.designation) return { icon: BadgeCheck, label: p.designation, tone: 'bg-purple-50 text-purple-700' };
    return { icon: Globe, label: 'Everyone', tone: 'bg-gray-100 text-gray-600' };
  };

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
          onClick={() => setAdding(v => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 shrink-0"
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {adding && (
        <NewParameter
          teams={teams} designations={designations}
          onClose={() => setAdding(false)}
          onCreated={() => { setAdding(false); refresh(); }}
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
          {params.map(p => {
            const scope = scopeOf(p);
            const Icon = scope.icon;
            return (
              <li key={p.id} className={clsx('px-4 py-2.5 flex items-start gap-3', !p.active && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    {p.name}
                    {p.weight !== 1 && <span className="ml-1.5 text-[11px] font-normal text-brand-600">×{p.weight}</span>}
                  </p>
                  {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                </div>
                <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] shrink-0', scope.tone)}>
                  <Icon size={10} /> {scope.label}
                </span>
                <label className="flex items-center gap-1 text-[11px] text-gray-400 shrink-0 cursor-pointer">
                  <input
                    type="checkbox" checked={p.active}
                    onChange={e => toggle.mutate({ id: p.id, active: e.target.checked })}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  live
                </label>
                <button
                  onClick={() => { if (confirm(`Retire "${p.name}"? Appraisals already scored against it keep their scores.`)) remove.mutate(p.id); }}
                  className="p-1 rounded text-gray-300 hover:text-red-500 shrink-0" title="Retire"
                ><Trash2 size={12} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NewParameter({ teams, designations, onClose, onCreated }: {
  teams: TeamSpace[]; designations: string[]; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'all' | 'team' | 'designation'>('all');
  const [teamId, setTeamId] = useState('');
  const [designation, setDesignation] = useState('');
  const [weight, setWeight] = useState('1');
  const [err, setErr] = useState('');

  const create = useMutation({
    mutationFn: () => api.appraisals.createParameter({
      name: name.trim(),
      description: description.trim() || undefined,
      teamId: scope === 'team' ? teamId : null,
      designation: scope === 'designation' ? designation : null,
      weight: Number(weight) || 1,
    }),
    onSuccess: onCreated,
    onError: (e: unknown) => setErr(msg(e)),
  });

  const ready = name.trim().length >= 2
    && (scope !== 'team' || !!teamId)
    && (scope !== 'designation' || !!designation);

  return (
    <div className="px-4 py-3 bg-gray-50/60 border-b border-gray-100 space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input
          value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="e.g. Client responsiveness"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
        />
        <input
          value={description} onChange={e => setDescription(e.target.value)} placeholder="What it means (optional)"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Applies to</span>
        {(['all', 'team', 'designation'] as const).map(m => (
          <button
            key={m} onClick={() => setScope(m)}
            className={clsx('px-2.5 py-1 text-xs rounded-lg border',
              scope === m ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500')}
          >
            {m === 'all' ? 'Everyone' : m === 'team' ? 'A team' : 'A position'}
          </button>
        ))}
        {scope === 'team' && (
          <select value={teamId} onChange={e => setTeamId(e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none">
            <option value="">Pick a team space…</option>
            {teams.filter(t => !t.archivedAt).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {scope === 'designation' && (
          <select value={designation} onChange={e => setDesignation(e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none">
            <option value="">Pick a position…</option>
            {designations.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <span className="text-xs text-gray-500 ml-2">Weight</span>
        <input
          value={weight} onChange={e => setWeight(e.target.value)} inputMode="decimal"
          className="w-16 px-2 py-1.5 text-xs border border-gray-300 rounded-lg tabular-nums focus:outline-none"
        />
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button
          onClick={() => { setErr(''); create.mutate(); }} disabled={!ready || create.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {create.isPending ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />} Add parameter
        </button>
      </div>
    </div>
  );
}
