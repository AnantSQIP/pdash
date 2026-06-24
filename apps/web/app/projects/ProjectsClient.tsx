'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, LayoutGrid, List, Filter, Search } from 'lucide-react';
import clsx from 'clsx';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { NewProjectModal } from '@/components/projects/NewProjectModal';
import { MOCK_PROJECTS, Phase, PHASE_META, PRIORITY_META } from '@/lib/mock-data';

type ViewMode = 'grid' | 'list';

const PHASES: { value: Phase | 'ALL'; label: string }[] = [
  { value: 'ALL',       label: 'All Projects' },
  { value: 'ACTIVE',    label: 'Active' },
  { value: 'PLANNING',  label: 'Planning' },
  { value: 'ON_HOLD',   label: 'On Hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'IDEA',      label: 'Idea' },
];

export function ProjectsClient() {
  const [view, setView] = useState<ViewMode>('grid');
  const [phase, setPhase] = useState<Phase | 'ALL'>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = MOCK_PROJECTS.filter(p => {
    if (phase !== 'ALL' && p.projectPhase !== phase) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: MOCK_PROJECTS.length,
    active: MOCK_PROJECTS.filter(p => p.projectPhase === 'ACTIVE').length,
    completed: MOCK_PROJECTS.filter(p => p.projectPhase === 'COMPLETED').length,
    onHold: MOCK_PROJECTS.filter(p => p.projectPhase === 'ON_HOLD').length,
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-0.5">{stats.total} projects · {stats.active} active</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
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
        <StatPill label="Total" value={stats.total} color="text-gray-700" />
        <StatPill label="Active" value={stats.active} color="text-blue-600" dot="bg-blue-500" />
        <StatPill label="Completed" value={stats.completed} color="text-green-600" dot="bg-green-500" />
        <StatPill label="On Hold" value={stats.onHold} color="text-orange-600" dot="bg-orange-400" />
      </div>

      {/* Filters + search row */}
      <div className="flex items-center gap-3 px-6 py-3 bg-gray-50 border-b border-gray-200 shrink-0 overflow-x-auto">
        <ProjectSearch value={search} onChange={setSearch} />
        <div className="flex items-center gap-1">
          {PHASES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPhase(value)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                phase === value
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-600 hover:bg-gray-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Projects grid/list */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <Filter size={24} className="text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">No projects match your filter</p>
            <p className="text-sm text-gray-400 mt-1">Try a different phase or search term</p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => <ProjectCard key={p.id} project={p} />)}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(p => <ProjectRow key={p.id} project={p} />)}
          </div>
        )}
      </div>

      {showModal && <NewProjectModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

function ProjectSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = value.trim()
    ? MOCK_PROJECTS.filter(p => p.title.toLowerCase().includes(value.toLowerCase())).slice(0, 6)
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => { setActiveIdx(0); }, [value]);

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && suggestions[activeIdx]) {
      router.push(`/projects/${suggestions[activeIdx].id}`);
      setOpen(false);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
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
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden py-1">
          {suggestions.map((p, i) => {
            const phase = PHASE_META[p.projectPhase];
            return (
              <button
                key={p.id}
                onMouseDown={() => {
                  router.push(`/projects/${p.id}`);
                  setOpen(false);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  i === activeIdx ? 'bg-brand-50' : 'hover:bg-gray-50',
                )}
              >
                <div className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: p.statusColor }} />
                <p className="flex-1 text-sm font-medium text-gray-900 truncate">{p.title}</p>
                <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0', phase.bg, phase.text)}>
                  {phase.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, color, dot }: {
  label: string; value: number; color: string; dot?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      {dot && <span className={clsx('w-2 h-2 rounded-full', dot)} />}
      <span className="text-gray-500">{label}:</span>
      <span className={clsx('font-semibold', color)}>{value}</span>
    </div>
  );
}

function ProjectRow({ project }: { project: typeof MOCK_PROJECTS[0] }) {
  const phase = PHASE_META[project.projectPhase];
  const priority = PRIORITY_META[project.priority];

  return (
    <a
      href={`/projects/${project.id}`}
      className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 hover:border-brand-500 hover:shadow-sm transition-all px-5 py-4"
    >
      <div className="w-1.5 h-10 rounded-full shrink-0" style={{ backgroundColor: project.statusColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', phase.bg, phase.text)}>
            {phase.label}
          </span>
          <h3 className="font-medium text-gray-900 text-sm truncate">{project.title}</h3>
        </div>
        <p className="text-xs text-gray-500 truncate">{project.description}</p>
      </div>

      {/* Progress */}
      <div className="hidden md:flex items-center gap-2 w-32 shrink-0">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${project.completionPercentage}%`, backgroundColor: project.statusColor }}
          />
        </div>
        <span className="text-xs text-gray-500 w-8 text-right">{project.completionPercentage}%</span>
      </div>

      {/* Members */}
      <div className="hidden sm:flex items-center -space-x-2 shrink-0">
        {project.members.slice(0, 3).map((m, i) => (
          <div key={i} className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white', m.color)}>
            {m.initials}
          </div>
        ))}
      </div>

      {/* Due date */}
      <span className="hidden lg:block text-xs text-gray-500 w-20 shrink-0 text-right">
        {new Date(project.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </span>
    </a>
  );
}
