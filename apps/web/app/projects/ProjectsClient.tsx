'use client';

import { useState, useRef, useEffect, useMemo, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Plus, LayoutGrid, List, Filter, Search, ScrollText, ChevronDown, FolderTree, Building2, Layers,
} from 'lucide-react';
import clsx from 'clsx';
import { ProjectCard, ProjectListRow } from '@/components/projects/ProjectCard';
import { NewClientModal } from '@/components/projects/NewClientModal';
import { ManageClientGroupsModal, useClientGroups } from '@/components/projects/ClientGroups';
import { TaskGroupBrowser } from '@/components/projects/TaskGroupBrowser';
import { PHASE_META, type Phase, type MockProject } from '@/lib/mock-data';
import { useTechnologyDomains, domainLabelOf } from '@/components/projects/TechnologyDomainPicker';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { api, type ApiProject } from '@/lib/api';

/**
 * Cards and rows both list CLIENTS. `groups` lists the WORK instead — every task group across
 * every client the reader may see — because "where is the FTO on the wafer bonding" is a
 * question about a piece of work by somebody who does not know whose matter it is.
 */
type ViewMode = 'grid' | 'list' | 'groups';

const PHASES: { value: Phase | 'ALL'; label: string }[] = [
  { value: 'ALL',       label: 'All' },
  { value: 'ACTIVE',    label: 'Active' },
  { value: 'ON_HOLD',   label: 'On Hold' },
  { value: 'COMPLETED', label: 'Completed' },
];

const PHASE_COLOR: Record<string, string> = {
  ACTIVE:    '#E8533A',
  ON_HOLD:   '#f97316',
  COMPLETED: '#16a34a',
  CLOSED:    '#64748b',
  ARCHIVED:  '#6b7280',
  CANCELLED: '#ef4444',
};

const AVATAR_COLORS = [
  'bg-brand-600', 'bg-purple-500', 'bg-pink-500',
  'bg-slate-600', 'bg-green-500', 'bg-amber-500', 'bg-blue-500',
];

/** "No group" is a real section, keyed so it can be collapsed and filtered like the others. */
const UNGROUPED = '__ungrouped__';
const COLLAPSE_KEY = 'pdash.clientGroupsCollapsed';

function toDisplay(p: ApiProject): MockProject {
  const members = (p.members ?? []).map((m, i) => ({
    initials: (`${m.user.firstName?.[0] ?? ''}${m.user.lastName?.[0] ?? ''}`.toUpperCase() || '?'),
    color: AVATAR_COLORS[i % AVATAR_COLORS.length],
  }));
  const groups = p.taskLists ?? [];
  const active = groups.filter(g => g.status !== 'COMPLETED');
  // A default "General" on a client that has real groups is scaffolding, not work — it is left
  // out of the card's PREVIEW, but still counted, because the client's own page lists it and two
  // screens disagreeing about how many groups a client has is worse than one extra chip.
  const meaningful = active.filter(g => !(g.isDefault && g.name === 'General' && active.length > 1));
  const deadlines = active.map(g => g.dueDate).filter((d): d is string => !!d).sort();
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    description: p.description ?? '',
    projectType: p.projectType ?? null,
    technologyDomain: p.technologyDomain ?? null,
    roundSeq: p.roundSeq ?? 1,
    projectPhase: p.projectPhase as Phase,
    priority: p.priority as any,
    completionPercentage: p.completionPercentage,
    taskCount: p._count?.projectTasks ?? 0,
    memberCount: p._count?.members ?? members.length,
    dueDate: p.dueDate ?? '',
    members,
    statusColor: PHASE_COLOR[p.projectPhase] ?? '#9aa0a6',
    createdAt: p.createdAt ?? '',
    clientGroupId: p.clientGroupId ?? null,
    clientGroupName: p.clientGroup?.name ?? null,
    taskGroupCount: groups.length,
    activeTaskGroups: meaningful.map(g => ({ id: g.id, name: g.name, groupType: g.groupType ?? null, dueDate: g.dueDate ?? null })),
    // What the client's own page counts, so the two never disagree.
    activeTaskGroupCount: active.length,
    taskGroupDomains: groups.map(g => g.technologyDomain).filter((d): d is string => !!d),
    openTaskCount: p.openTaskCount ?? 0,
    overdueTaskCount: p.overdueTaskCount ?? 0,
    nextDeadline: deadlines[0] ?? null,
  };
}

function StatPill({ label, value, color, dot }: { label: string; value: number; color: string; dot?: string }) {
  return (
    <div className="flex items-center gap-2">
      {dot && <span className={clsx('w-2 h-2 rounded-full', dot)} />}
      <span className={clsx('text-sm font-semibold', color)}>{value}</span>
      <span className="text-sm text-gray-400">{label}</span>
    </div>
  );
}

/**
 * CLIENTS-FLOW: the Clients page — what the Projects page became.
 *
 * Clients are listed under their CLIENT GROUPS, in the order the groups were arranged, with the
 * ungrouped ones last. Each group can be folded away; the fold is remembered per browser. Every
 * filter works across groups at once, and a group with nothing matching simply drops out rather
 * than showing an empty shelf in the middle of a search.
 */
export function ProjectsClient() {
  const { org, currentUser, loading: orgLoading } = useOrg();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const router = useRouter();

  const [view, setView] = useState<ViewMode>('grid');
  const [phase, setPhase] = useState<Phase | 'ALL'>('ALL');
  const [showNew, setShowNew] = useState<{ groupId: string } | null>(null);
  const [showGroups, setShowGroups] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('NAME');
  const [domain, setDomain] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // The fold survives a reload — somebody who parks "Archived work" out of the way wants it to stay there.
  useEffect(() => {
    try { const raw = localStorage.getItem(COLLAPSE_KEY); if (raw) setCollapsed(JSON.parse(raw)); } catch { /* unavailable */ }
  }, []);
  function toggleSection(key: string) {
    setCollapsed(c => {
      const next = { ...c, [key]: !c[key] };
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* unavailable */ }
      return next;
    });
  }

  const mayArrangeGroups = can('project.approve');

  const { data: domains = [] } = useTechnologyDomains();
  const { data: clientGroups = [] } = useClientGroups();

  const { data: rawProjects = [], isLoading: projectsLoading, isError } = useQuery({
    queryKey: ['projects', org?.id, sort, domain],
    queryFn: () => api.projects.list(org!.id, undefined, { sort, technologyDomain: domain || undefined }),
    enabled: !!org,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const isLoading = orgLoading || (!!org && projectsLoading);
  const clients = useMemo(() => rawProjects.map(toDisplay), [rawProjects]);
  const liveGroupIds = useMemo(() => new Set(clientGroups.map(g => g.id)), [clientGroups]);
  const sectionOf = (c: MockProject) => (c.clientGroupId && liveGroupIds.has(c.clientGroupId) ? c.clientGroupId : UNGROUPED);

  const filtered = clients.filter(c => {
    if (phase !== 'ALL' && c.projectPhase !== phase) return false;
    if (groupFilter && sectionOf(c) !== groupFilter) return false;
    if (search) {
      const hay = [
        c.title, c.code ?? '', c.clientGroupName ?? '',
        ...(c.activeTaskGroups ?? []).map(g => g.name),
        domainLabelOf(c.technologyDomain, domains) ?? '',
        ...(c.taskGroupDomains ?? []).map(d => domainLabelOf(d, domains) ?? ''),
      ].join(' ').toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  // Sections in the order the groups were arranged; "No group" last. With no filter on, empty
  // groups still show, so a group just made is somewhere to put a client rather than invisible.
  const filtering = !!(search || domain || phase !== 'ALL' || groupFilter);
  const sections = useMemo(() => {
    const by = new Map<string, MockProject[]>();
    for (const c of filtered) {
      const k = sectionOf(c);
      (by.get(k) ?? by.set(k, []).get(k)!).push(c);
    }
    const ordered = [...clientGroups].sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
    const out: { key: string; name: string; clients: MockProject[] }[] = [];
    for (const g of ordered) {
      const list = by.get(g.id) ?? [];
      if (list.length || (!filtering && !groupFilter)) out.push({ key: g.id, name: g.name, clients: list });
    }
    const loose = by.get(UNGROUPED) ?? [];
    if (loose.length) out.push({ key: UNGROUPED, name: clientGroups.length ? 'No group' : 'All clients', clients: loose });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, clientGroups, filtering, groupFilter]);

  const stats = {
    total: clients.length,
    active: clients.filter(p => p.projectPhase === 'ACTIVE').length,
    completed: clients.filter(p => p.projectPhase === 'COMPLETED').length,
    onHold: clients.filter(p => p.projectPhase === 'ON_HOLD').length,
    taskGroups: clients.reduce((n, c) => n + (c.activeTaskGroupCount ?? c.activeTaskGroups?.length ?? 0), 0),
  };

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['projects', org?.id] });
    qc.invalidateQueries({ queryKey: ['client-groups'] });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-center justify-between flex-wrap gap-3 px-4 sm:px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {stats.total} client{stats.total === 1 ? '' : 's'}
            {clientGroups.length > 0 && <> · {clientGroups.length} group{clientGroups.length === 1 ? '' : 's'}</>}
            {' '}· {stats.taskGroups} open task group{stats.taskGroups === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button onClick={() => setView('grid')} title="Cards"
              className={clsx('p-1.5 rounded-md transition-colors', view === 'grid' ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700')}>
              <LayoutGrid size={15} />
            </button>
            <button onClick={() => setView('list')} title="List"
              className={clsx('p-1.5 rounded-md transition-colors', view === 'list' ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700')}>
              <List size={15} />
            </button>
            <button onClick={() => setView('groups')} title="Task groups across every client"
              className={clsx('flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                view === 'groups' ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700')}>
              <Layers size={15} />
              <span className="hidden sm:inline">Task groups</span>
            </button>
          </div>
          {mayArrangeGroups && (
            <button onClick={() => setShowGroups(true)} title="Add, rename, order or archive client groups"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <FolderTree size={15} />
              <span className="hidden sm:inline">Client groups</span>
            </button>
          )}
          {can('user.manage_access') && (
            <button onClick={() => router.push('/cid-ledger')} title="Open the CID Ledger"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <ScrollText size={15} />
              <span className="hidden sm:inline">CID Ledger</span>
            </button>
          )}
          {can('project.create') && (
            <button onClick={() => setShowNew({ groupId: groupFilter && groupFilter !== UNGROUPED ? groupFilter : '' })}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
              <Plus size={15} />
              New client
            </button>
          )}
        </div>
      </header>

      {/* The task-group view brings its own filter bar and list: the questions a PIECE OF WORK
          can answer are not the ones a client can, and two toolbars fighting over one search
          box would have made both of them lie. */}
      {view === 'groups' ? <TaskGroupBrowser /> : (
      <>
      <div className="flex items-center gap-4 sm:gap-6 px-4 sm:px-6 py-3 bg-white border-b border-gray-100 shrink-0 overflow-x-auto">
        <StatPill label="Clients"   value={stats.total}     color="text-gray-700" />
        <StatPill label="Active"    value={stats.active}    color="text-brand-500"  dot="bg-brand-500" />
        <StatPill label="Completed" value={stats.completed} color="text-green-600"  dot="bg-green-500" />
        <StatPill label="On Hold"   value={stats.onHold}    color="text-orange-600" dot="bg-orange-400" />
      </div>

      {/* No `overflow-x-auto` here: it forces overflow-y too and clips the search dropdown. */}
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <ClientSearch value={search} onChange={setSearch} suggestions={clients} />

        {clientGroups.length > 0 && (
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} title="Show one client group"
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-brand-500">
            <option value="">All groups</option>
            {clientGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            <option value={UNGROUPED}>No group</option>
          </select>
        )}

        <select value={domain} onChange={e => setDomain(e.target.value)} title="Clients with work in this technology domain"
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-brand-500">
          <option value="">All domains</option>
          {domains.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>

        <select value={sort} onChange={e => setSort(e.target.value)} title="Order clients within each group"
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-brand-500">
          <option value="NAME">Name (A–Z)</option>
          <option value="NEWEST">Newest first</option>
          <option value="OLDEST">Oldest first</option>
          <option value="CID">CID</option>
          <option value="PROGRESS">Progress (highest)</option>
        </select>

        <div className="flex flex-wrap items-center gap-1">
          {PHASES.map(({ value: v, label }) => (
            <button key={v} onClick={() => setPhase(v)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                phase === v ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-200')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 h-56 animate-pulse" />
            ))}
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-gray-600 font-medium">Couldn&apos;t load your clients</p>
            <p className="text-sm text-gray-500 mt-1">Something went wrong. Please refresh and try again.</p>
          </div>
        )}
        {!isLoading && !isError && sections.length === 0 && (
          clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
                <Building2 size={24} className="text-brand-500" />
              </div>
              <p className="text-gray-700 font-medium">No clients yet</p>
              <p className="text-sm text-gray-500 mt-1 max-w-sm">A client holds its task groups, its team and its CID. Create the first one to get started.</p>
              {can('project.create') && (
                <button onClick={() => setShowNew({ groupId: '' })} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700">
                  <Plus size={15} /> New client
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <Filter size={24} className="text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">No clients match</p>
              <p className="text-sm text-gray-500 mt-1">Try a different group, status or search.</p>
            </div>
          )
        )}

        {!isLoading && !isError && sections.length > 0 && (
          <div className="space-y-6">
            {sections.map(sec => {
              const folded = !!collapsed[sec.key];
              const isGroup = sec.key !== UNGROUPED;
              return (
                <section key={sec.key} aria-label={sec.name}>
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => toggleSection(sec.key)} className="flex items-center gap-2 group" aria-expanded={!folded}>
                      <ChevronDown size={16} className={clsx('text-gray-400 transition-transform group-hover:text-gray-600', folded && '-rotate-90')} />
                      {isGroup ? <FolderTree size={15} className="text-brand-500" /> : <Building2 size={15} className="text-gray-400" />}
                      <h2 className="text-sm font-semibold text-gray-800">{sec.name}</h2>
                    </button>
                    <span className="text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5">{sec.clients.length}</span>
                    <div className="flex-1 h-px bg-gray-200 ml-1" />
                    {isGroup && can('project.create') && (
                      <button onClick={() => setShowNew({ groupId: sec.key })}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-brand-50">
                        <Plus size={12} /> Add client here
                      </button>
                    )}
                  </div>
                  {!folded && (
                    sec.clients.length === 0 ? (
                      <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl px-4 py-5 text-center">No clients in this group yet.</p>
                    ) : view === 'grid' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sec.clients.map(p => <ProjectCard key={p.id} project={p} />)}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {sec.clients.map(p => <ProjectListRow key={p.id} project={p} />)}
                      </div>
                    )
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      </>
      )}

      {showNew && (
        <NewClientModal
          onClose={() => setShowNew(null)}
          defaultClientGroupId={showNew.groupId}
          onSuccess={created => {
            invalidate();
            // Straight into the new client: the next thing anybody does is look at its work.
            if (created?.id) router.push(`/projects/${created.id}`);
          }}
          createdBy={currentUser?.email ?? 'system'}
        />
      )}
      {showGroups && <ManageClientGroupsModal onClose={() => setShowGroups(false)} />}
    </div>
  );
}

function ClientSearch({
  value, onChange, suggestions,
}: { value: string; onChange: (v: string) => void; suggestions: MockProject[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = value.trim()
    ? suggestions.filter(p => `${p.title} ${p.code ?? ''} ${p.clientGroupName ?? ''}`.toLowerCase().includes(value.toLowerCase())).slice(0, 6)
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => { setActiveIdx(0); }, [value]);

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && matches[activeIdx]) { router.push(`/projects/${matches[activeIdx].id}`); setOpen(false); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-60 shrink-0">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder="Search clients, CIDs, task groups…"
        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
      />
      {open && matches.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden py-1">
          {matches.map((p, i) => {
            const phase = PHASE_META[p.projectPhase];
            return (
              <button
                key={p.id}
                onMouseDown={() => { router.push(`/projects/${p.id}`); setOpen(false); }}
                onMouseEnter={() => setActiveIdx(i)}
                className={clsx('w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors', i === activeIdx ? 'bg-brand-50' : 'hover:bg-gray-50')}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PHASE_COLOR[p.projectPhase] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                  <p className="text-xs text-gray-400 truncate">{phase.label}{p.clientGroupName ? ` · ${p.clientGroupName}` : ''}{p.code ? ` · ${p.code}` : ''}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
