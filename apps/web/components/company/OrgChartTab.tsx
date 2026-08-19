'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader, Network, Search, TriangleAlert } from 'lucide-react';
import { api, type OrgChartPerson } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { fullName } from '@/lib/avatar';

/**
 * The org chart.
 *
 * The Company page has advertised "the org chart" in its subtitle since the module was built and
 * has never had one. It could not have: reporting lines were only written in Phase 2 — before that
 * `user_manager` was empty, so a chart would have drawn 26 disconnected people.
 *
 * Built from flat edges rather than a nested payload, because the chart legitimately has more than
 * one root: the person at the top, plus anybody whose line is not recorded yet.
 *
 * Nobody is ever silently omitted. Anyone the tree cannot hold is named in one of two groups, and
 * the distinction matters because the fixes differ: WITHOUT A LINE means nobody has recorded their
 * manager, and IN A LOOP means the recorded lines contradict each other.
 */

type Node = { person: OrgChartPerson; reports: Node[]; total: number };

/**
 * Builds the forest, and accounts for EVERY person exactly once.
 *
 * The subtle failure this guards against: a cycle in the data — A manages B, B manages A — makes
 * both of them, and everybody reporting beneath them, unreachable from any root. The first version
 * of this only listed people whose managerId was null as "not placed", so a two-person cycle
 * quietly removed eleven people from a chart of twenty-seven and said nothing. A chart that omits
 * people without telling you is worse than one that refuses to draw.
 *
 * So placement is decided by reachability, not by whether a manager id happens to be set.
 */
function buildForest(people: OrgChartPerson[]) {
  const byId = new Map(people.map(p => [p.id, p]));
  const childrenOf = new Map<string, OrgChartPerson[]>();
  const roots: OrgChartPerson[] = [];
  const noLine: OrgChartPerson[] = [];

  for (const p of people) {
    if (!p.managerId) {
      // Somebody with no manager AND no reports is not the top of the chart — they are simply
      // missing a line. Separating the two keeps a data gap from looking like a second CEO.
      const hasReports = people.some(o => o.managerId === p.id);
      (hasReports ? roots : noLine).push(p);
      continue;
    }
    childrenOf.set(p.managerId, [...(childrenOf.get(p.managerId) ?? []), p]);
  }

  const drawn = new Set<string>();
  const build = (p: OrgChartPerson, seen: Set<string>): Node => {
    drawn.add(p.id);
    // A cycle would otherwise recurse until the stack gave out.
    const next = new Set(seen).add(p.id);
    const reports = (childrenOf.get(p.id) ?? [])
      .filter(c => !next.has(c.id))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)))
      .map(c => build(c, next));
    return { person: p, reports, total: 1 + reports.reduce((n, r) => n + r.total, 0) };
  };

  const tree = roots
    .sort((a, b) => fullName(a).localeCompare(fullName(b)))
    .map(r => build(r, new Set()));
  noLine.forEach(p => drawn.add(p.id));

  // Anyone the walk never reached. They HAVE a manager, so they are not "missing a line" — they
  // are in a loop, or hanging off one. Different problem, different message.
  const inLoop = people
    .filter(p => !drawn.has(p.id))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));

  return {
    roots: tree,
    noLine: noLine.sort((a, b) => fullName(a).localeCompare(fullName(b))),
    inLoop,
    byId,
  };
}

function PersonRow({
  node, depth, expandedAll, query,
}: { node: Node; depth: number; expandedAll: boolean; query: string }) {
  const [open, setOpen] = useState(true);
  const { person, reports } = node;
  const isOpen = expandedAll ? true : open;
  const q = query.trim().toLowerCase();
  const matches = !!q && `${fullName(person)} ${person.designation ?? ''} ${person.email}`.toLowerCase().includes(q);

  return (
    <div>
      <div
        className={`flex items-center gap-2.5 py-2 pr-2 rounded-lg ${matches ? 'bg-amber-50 ring-1 ring-amber-200' : 'hover:bg-gray-50'}`}
        style={{ paddingLeft: `${depth * 22 + 4}px` }}
      >
        {reports.length > 0 ? (
          <button onClick={() => setOpen(v => !v)} aria-expanded={isOpen}
            aria-label={isOpen ? `Collapse ${fullName(person)}'s reports` : `Expand ${fullName(person)}'s reports`}
            className="shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="shrink-0 w-[22px]" aria-hidden="true" />
        )}
        <Avatar user={person} size={30} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{fullName(person)}</p>
          <p className="text-xs text-gray-400 truncate">
            {person.designation ?? '—'}
            {person.departments?.length ? ` · ${person.departments.map(d => d.name).join(', ')}` : ''}
          </p>
        </div>
        {reports.length > 0 && (
          <span className="shrink-0 text-[11px] font-medium text-gray-400 tabular-nums">
            {reports.length} direct{node.total - 1 !== reports.length ? ` · ${node.total - 1} total` : ''}
          </span>
        )}
        {person.office && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
            {person.office.charAt(0) + person.office.slice(1).toLowerCase()}
          </span>
        )}
      </div>
      {isOpen && reports.map(r => (
        <PersonRow key={r.person.id} node={r} depth={depth + 1} expandedAll={expandedAll} query={query} />
      ))}
    </div>
  );
}

function PeopleNotice({
  tone, heading, detail, people,
}: { tone: 'amber' | 'red'; heading: string; detail: string; people: OrgChartPerson[] }) {
  const c = tone === 'red'
    ? { box: 'bg-red-50 border-red-200', head: 'text-red-900', body: 'text-red-800', chip: 'text-red-900' }
    : { box: 'bg-amber-50 border-amber-200', head: 'text-amber-900', body: 'text-amber-800', chip: 'text-amber-900' };
  return (
    <div className={`border rounded-xl p-4 ${c.box}`}>
      <p className={`text-sm font-semibold flex items-center gap-1.5 mb-1 ${c.head}`}>
        <TriangleAlert size={14} /> {heading}
      </p>
      <p className={`text-xs mb-2.5 ${c.body}`}>{detail}</p>
      <div className="flex flex-wrap gap-1.5">
        {people.map(p => (
          <span key={p.id} className="inline-flex items-center gap-1.5 bg-white/70 rounded-full pl-1 pr-2.5 py-0.5">
            <Avatar user={p} size={20} />
            <span className={`text-xs font-medium ${c.chip}`}>{fullName(p)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function OrgChartTab() {
  const [query, setQuery] = useState('');
  const [expandedAll, setExpandedAll] = useState(true);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['org-chart'],
    queryFn: () => api.company.orgChart(),
    staleTime: 60_000,
  });

  const { roots, noLine, inLoop } = useMemo(() => buildForest(data?.people ?? []), [data]);
  const placed = roots.reduce((n, r) => n + r.total, 0);
  const total = data?.people.length ?? 0;

  if (isLoading) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader size={18} className="animate-spin mr-2" /><span className="text-sm">Loading the chart…</span></div>;
  }
  if (isError) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">
        The chart could not be loaded. {error instanceof Error ? error.message : ''}
      </p>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-sm border border-gray-200 rounded-lg px-3 py-2 focus-within:border-brand-400">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find someone in the chart…"
            className="flex-1 text-sm focus:outline-none bg-transparent" />
        </div>
        <button onClick={() => setExpandedAll(v => !v)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">
          {expandedAll ? 'Allow collapsing' : 'Expand all'}
        </button>
        <span className="text-xs text-gray-400">
          {placed} of {total} charted{noLine.length ? ` · ${noLine.length} without a line` : ''}{inLoop.length ? ` · ${inLoop.length} in a loop` : ''}
        </span>
      </div>

      {roots.length === 0 && noLine.length === 0 && inLoop.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-xl py-14 text-center">
          <Network size={26} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-medium text-gray-600">Nobody to chart yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-2">
          {roots.map(r => <PersonRow key={r.person.id} node={r} depth={0} expandedAll={expandedAll} query={query} />)}
        </div>
      )}

      {noLine.length > 0 && (
        <PeopleNotice
          tone="amber"
          heading={`${noLine.length} ${noLine.length === 1 ? 'person has' : 'people have'} no reporting line`}
          detail="They appear nowhere in the chart above, and an appraisal cycle launched now would give them no reviewer."
          people={noLine}
        />
      )}

      {/* A cycle in the data removes people from the tree entirely. Saying so is the whole point —
          the first version of this page dropped them in silence. */}
      {inLoop.length > 0 && (
        <PeopleNotice
          tone="red"
          heading={`${inLoop.length} ${inLoop.length === 1 ? 'person is' : 'people are'} in a reporting loop`}
          detail="Two people report to each other, directly or through a chain, so neither they nor anybody beneath them can be drawn. Fix the lines in reporting-lines-2026-08.ts and re-run it."
          people={inLoop}
        />
      )}
    </div>
  );
}
