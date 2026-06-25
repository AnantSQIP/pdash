'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Plus, LayoutGrid, List, Filter, Search } from 'lucide-react';
import clsx from 'clsx';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { NewProjectModal } from '@/components/projects/NewProjectModal';
import { PHASE_META, PRIORITY_META, type Phase, type MockProject } from '@/lib/mock-data';
import { useOrg } from '@/lib/org-context';
import { api, type ApiProject } from '@/lib/api';

type ViewMode = 'grid' | 'list';

const PHASES: { value: Phase | 'ALL'; label: string }[] = [
  { value: 'ALL',       label: 'All Projects' },
  { value: 'ACTIVE',    label: 'Active' },
  { value: 'PLANNING',  label: 'Planning' },
  { value: 'ON_HOLD',   label: 'On Hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'IDEA',      label: 'Idea' },
];

const PHASE_COLOR: Record<string, string> = {
  ACTIVE:    '#E8533A',
  PLANNING:  '#3b82f6',
  ON_HOLD:   '#f97316',
  COMPLETED: '#16a34a',
  IDEA:      '#9aa0a6',
  ARCHIVED:  '#6b7280',
  CANCELLED: '#ef4444',
};

const AVATAR_COLORS = [
  'bg-brand-600', 'bg-purple-500', 'bg-pink-500',
  'bg-slate-600', 'bg-green-500', 'bg-amber-500', 'bg-blue-500',
];

function toDisplay(p: ApiProject): MockProject {
  const members = (p.members ?? []).map((m, i) => ({
    initials: `${m.user.firstName[0]}${m.user.lastName[0]}`.toUpperCase(),
    color: AVATAR_COLORS[i % AVATAR_COLORS.length],
  }));
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? '',
    projectPhase: p.projectPhase as Phase,
    priority: p.priority as any,
    completionPercentage: p.completionPercentage,
    taskCount: p._count?.projectTasks ?? 0,
    memberCount: p._count?.members ?? members.length,
    dueDate: p.dueDate ?? '',
    members,
    statusColor: PHASE_COLOR[p.projectPhase] ?? '#9aa0a6',
    createdAt: p.createdAt,
  };
}

function StatPill({
  label, value, color, dot,
}: { label: string; value: number; color: string; dot?: string }) {
  return (
    <div className="flex items-center gap-2">
      {dot && <span className={clsx('w-2 h-2 rounded-full', dot)} />}
      <span className={clsx('text-sm font-semibold', color)}>{value}</span>
      <span className="text-sm text-gray-400">{label}</span>
    </div>
  );
}

export function ProjectsClient() {
  const { org, currentUser, loading: orgLoading } = useOrg();
  const qc = useQueryClient();

  const [view, setView] = useState<ViewMode>('grid');
  const [phase, setPhase] = useState<Phase | 'ALL'>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');

  const { data: rawProjects = [], isLoading: projectsLoading, isError } = useQuery({
    queryKey: ['projects', org?.id],
    queryFn: () => api.projects.list(org!.id),
    enabled: !!org,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const isLoading = orgLoading || (!!org && projectsLoading);

  const projects = rawProjects.map(toDisplay);

  const filtered = projects.filter(p => {
    if (phase !== 'ALL' && p.projectPhase !== phase) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: projects.length,
    active: projects.filter(p => p.projectPhase === 'ACTIVE').length,
    completed: projects.filter(p => p.projectPhase === 'COMPLETED').length,
    onHold: projects.filter(p => p.projectPhase === 'ON_HOLD').length,
  };

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['projects', org?.id] });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-0.5">{stats.total} projects · {stats.active} active</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('grid')}
              className={clsx('p-1.5 rounded-md transition-colors', view === 'grid' ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700')}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setView('list')}
              className={clsx('p-1.5 rounded-md transition-colors', view === 'list' ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700')}
            >
              <List size={15} />
            </button>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Filter size={14} />
            Filter
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Plus size={15} />
            New Project
          </button>
        </div>
      </header>

      {/* Stats bar */}
      <div className="flex items-center gap-6 px-6 py-3 bg-white border-b border-gray-100 shrink-0">
        <StatPill label="Total"     value={stats.total}     color="text-gray-700" />
        <StatPill label="Active"    value={stats.active}    color="text-brand-500"  dot="bg-brand-500" />
        <StatPill label="Completed" value={stats.completed} color="text-green-600"  dot="bg-green-500" />
        <StatPill label="On Hold"   value={stats.onHold}    color="text-orange-600" dot="bg-orange-400" />
      </div>

      {/* Filters + search row */}
      <div className="flex items-center gap-3 px-6 py-3 bg-gray-50 border-b border-gray-200 shrink-0 overflow-x-auto">
        <ProjectSearch value={search} onChange={setSearch} suggestions={projects} />
        <div className="flex items-center gap-1">
          {PHASES.map(({ value: v, label }) => (
            <button
              key={v}
              onClick={() => setPhase(v)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                phase === v ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Projects grid/list */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 h-52 animate-pulse" />
            ))}
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-gray-500 font-medium">Could not load projects</p>
            <p className="text-sm text-gray-400 mt-1">Make sure the API server is running on port 4000</p>
          </div>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <Filter size={24} className="text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">No projects match your filter</p>
            <p className="text-sm text-gray-400 mt-1">Try a different phase or search term</p>
          </div>
        )}
        {!isLoading && !isError && filtered.length > 0 && (
          view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(p => <ProjectCard key={p.id} project={p} />)}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map(p => <ProjectRow key={p.id} project={p} />)}
            </div>
          )
        )}
      </div>

      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onSuccess={invalidate}
          createdBy={currentUser?.email ?? 'system'}
        />
      )}
    </div>
  );
}

function ProjectSearch({
  value, onChange, suggestions,
}: { value: string; onChange: (v: string) => void; suggestions: MockProject[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = value.trim()
    ? suggestions.filter(p => p.title.toLowerCase().includes(value.toLowerCase())).slice(0, 6)
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
    <div ref={containerRef} className="relative w-56 shrink-0">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder="Search projects..."
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
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  i === activeIdx ? 'bg-brand-50' : 'hover:bg-gray-50',
                )}
              >
                <span className={clsx('w-2 h-2 rounded-full shrink-0', phase.bg.replace('bg-', 'bg-'))} style={{ backgroundColor: PHASE_COLOR[p.projectPhase] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                  <p className="text-xs text-gray-400">{phase.label}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectRow({ project }: { project: MockProject }) {
  const phase = PHASE_META[project.projectPhase];
  const priority = PRIORITY_META[project.priority];
  return (
    <a href={`/projects/${project.id}`} className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 hover:border-brand-500 px-5 py-4 transition-all group">
      <div className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: project.statusColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', phase.bg, phase.text)}>{phase.label}</span>
          <span className={clsx('text-xs font-semibold', priority.color)}>{priority.label}</span>
        </div>
        <p className="font-medium text-gray-900 truncate mt-0.5 group-hover:text-brand-600 transition-colors">{project.title}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-gray-700">{project.completionPercentage}%</p>
        <p className="text-xs text-gray-400">{project.taskCount} tasks</p>
      </div>
      <div className="flex items-center -space-x-1.5 shrink-0">
        {project.members.slice(0, 3).map((m, i) => (
          <div key={i} className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white', m.color)}>
            {m.initials}
          </div>
        ))}
      </div>
    </a>
  );
}
