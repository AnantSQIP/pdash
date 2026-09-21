'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Search, X, Layers, AlertTriangle, UserCheck, Building2, CalendarDays, Lock,
  ArrowUpRight, ListChecks, CheckCircle2, Filter as FilterIcon, Loader,
} from 'lucide-react';
import { api, type ProjectTypeDef, type TaskGroupHit } from '@/lib/api';
import { domainLabelOf, useTechnologyDomains } from './TechnologyDomainPicker';
import { projectTypeLabel, cidLabel } from '@/lib/mock-data';
import { formatDate, isPastDue } from '@/lib/date';

type Status = 'ACTIVE' | 'COMPLETED' | 'ALL';

/** One page at a time, grown by "Show more" up to the server's own ceiling. */
const PAGE = 50;
const MAX = 200;

/**
 * CLIENTS-FLOW: THE WORK, LISTED ACROSS CLIENTS — the Clients module's third view.
 *
 * The client cards answer "who are we acting for". This answers the question people actually
 * arrive with — "where is the FTO on the wafer bonding" — when nobody remembers, or was ever
 * told, whose matter it sits under. Every row names its client, and opening one lands on that
 * client with the group already in front of you.
 *
 * It reads GET /task-groups, which is scoped on the server with the clients list's own rule: a
 * lead sees the firm's work, everyone else sees the matters they are staffed on. Nothing is
 * filtered for visibility HERE, because a list that decides in the browser what a person may see
 * is a list that has already sent it to them.
 */
export function TaskGroupBrowser() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('ACTIVE');
  const [groupType, setGroupType] = useState('');
  const [technologyDomain, setTechnologyDomain] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [mine, setMine] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  // Typing is a stream of half-written words; the server is asked once the person pauses.
  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  // Any change of question starts the list again from the top.
  useEffect(() => { setLimit(PAGE); }, [search, status, groupType, technologyDomain, overdue, mine]);

  const { data: domains = [] } = useTechnologyDomains();
  const { data: types = [] } = useQuery<ProjectTypeDef[]>({
    queryKey: ['project-types'], queryFn: () => api.projects.types(), staleTime: 5 * 60_000,
  });

  const query = { search: search || undefined, status, groupType: groupType || undefined, technologyDomain: technologyDomain || undefined, overdue, mine, limit };
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['task-group-search', query],
    queryFn: () => api.taskGroups.search(query),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const filtersOn = !!(search || groupType || technologyDomain || overdue || mine || status !== 'ACTIVE');
  function clearAll() {
    setText(''); setSearch(''); setStatus('ACTIVE'); setGroupType(''); setTechnologyDomain(''); setOverdue(false); setMine(false);
  }

  const shownTypes = useMemo(() => types.filter(t => !t.comingSoon), [types]);

  return (
    <>
      {/* The same filter bar the client views use, asking the questions a GROUP can answer. */}
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <div className="relative w-64 shrink-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            aria-label="Search task groups across every client"
            placeholder="Search task groups, types, domains, tasks…"
            className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
          />
          {text && (
            <button onClick={() => setText('')} title="Clear the search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-700 rounded">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          {(['ACTIVE', 'COMPLETED', 'ALL'] as Status[]).map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={clsx('px-2.5 py-1 text-sm font-medium rounded-md transition-colors',
                status === s ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>
              {s === 'ACTIVE' ? 'Active' : s === 'COMPLETED' ? 'Completed' : 'All'}
            </button>
          ))}
        </div>

        <select value={groupType} onChange={e => setGroupType(e.target.value)} title="Task groups of one kind of work"
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-brand-500">
          <option value="">All types of work</option>
          {shownTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <select value={technologyDomain} onChange={e => setTechnologyDomain(e.target.value)} title="Task groups in one technology domain"
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-brand-500">
          <option value="">All domains</option>
          {domains.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>

        <button onClick={() => setOverdue(v => !v)} aria-pressed={overdue} title="Running past its deadline, with work still open"
          className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors',
            overdue ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-200 hover:bg-red-50')}>
          <AlertTriangle size={14} /> Overdue
        </button>
        <button onClick={() => setMine(v => !v)} aria-pressed={mine} title="Task groups I am staffed on"
          className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors',
            mine ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
          <UserCheck size={14} /> Assigned to me
        </button>
        {filtersOn && (
          <button onClick={clearAll} className="inline-flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-200">
            <X size={13} /> Clear
          </button>
        )}
        <span className="ml-auto inline-flex items-center gap-2 text-xs text-gray-500 tabular-nums">
          {isFetching && <Loader size={12} className="animate-spin text-gray-400" />}
          {data ? `${data.total} task group${data.total === 1 ? '' : 's'}${data.total > items.length ? ` · showing ${items.length}` : ''}` : ''}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 h-20 animate-pulse" />)}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-gray-600 font-medium">Couldn&apos;t load the task groups</p>
            <p className="text-sm text-gray-500 mt-1">Something went wrong. Please refresh and try again.</p>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              {filtersOn ? <FilterIcon size={24} className="text-gray-400" /> : <Layers size={24} className="text-gray-400" />}
            </div>
            <p className="text-gray-700 font-medium">
              {search ? `No task group matches “${search}”` : filtersOn ? 'No task group matches these filters' : 'No task groups yet'}
            </p>
            {/* An empty list that will not say what it did is the least useful screen there is. */}
            <p className="text-sm text-gray-500 mt-1.5 max-w-md">
              {data?.inScope
                ? <>Searched the name, description, type of work, technology domain, client and task titles of the {data.inScope} task group{data.inScope === 1 ? '' : 's'} on clients you can see.</>
                : <>You are not on any client with task groups yet. Someone who runs a client can add you to it.</>}
            </p>
            {filtersOn && (
              <button onClick={clearAll} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50">
                <X size={14} /> Clear search and filters
              </button>
            )}
          </div>
        )}

        {items.length > 0 && (
          <div className="flex flex-col gap-2">
            {items.map(g => <TaskGroupRow key={g.id} group={g} domains={domains} onOpen={() => router.push(`/projects/${g.project?.id}?group=${g.id}`)} />)}
            {data && data.total > items.length && (
              <div className="pt-2 text-center">
                {limit < MAX ? (
                  <button onClick={() => setLimit(l => Math.min(l + PAGE, MAX))}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50">
                    Show more · {data.total - items.length} left
                  </button>
                ) : (
                  <p className="text-xs text-gray-400">
                    Showing the first {MAX} of {data.total}. Narrow it with a search or a filter to see the rest.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** What a hit on each field is CALLED, so a row can say why it is on screen. */
const MATCH_LABEL: Record<string, string> = {
  name: 'its name',
  description: 'its description',
  type: 'its type of work',
  domain: 'its technology domain',
  client: 'its client',
};

/**
 * One task group, as a line: the work first, then whose it is.
 *
 * The client is named on every row — the whole point of this view is that you did not know it —
 * and the tasks a search matched are named too, because a group called "Round 2" turning up for
 * "claim chart" is otherwise inexplicable.
 */
function TaskGroupRow({
  group: g, domains, onOpen,
}: { group: TaskGroupHit; domains: { value: string; label: string }[]; onOpen: () => void }) {
  const completed = g.status === 'COMPLETED';
  const open = g.openTaskCount ?? 0;
  const late = !completed && open > 0 && !!g.dueDate && isPastDue(g.dueDate);
  const done = (g.taskCount ?? 0) - open;
  const pct = g.taskCount ? Math.round((done / g.taskCount) * 100) : 0;
  const reasons = g.matchedOn.filter(k => k !== 'task').map(k => MATCH_LABEL[k]).filter(Boolean);
  if (g.matchedTasks.length) reasons.push(`${g.matchedTasks.length} task${g.matchedTasks.length === 1 ? '' : 's'} in it`);

  return (
    <button
      onClick={onOpen}
      className={clsx('group w-full text-left flex items-start gap-4 bg-white rounded-xl border px-5 py-3.5 transition-all hover:border-brand-500 hover:shadow-sm',
        completed ? 'border-green-200' : late ? 'border-red-200' : 'border-gray-200')}
    >
      <span className={clsx('mt-0.5 shrink-0', completed ? 'text-green-600' : late ? 'text-red-500' : 'text-brand-500')}>
        {completed ? <CheckCircle2 size={16} /> : <Layers size={16} />}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx('font-semibold truncate', completed ? 'text-gray-600' : 'text-gray-900', 'group-hover:text-brand-600 transition-colors')}>
            {g.name}
          </span>
          {g.groupType && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">
              {projectTypeLabel(g.groupType)}
            </span>
          )}
          {g.technologyDomain && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100 shrink-0">
              {domainLabelOf(g.technologyDomain, domains)}
            </span>
          )}
          {completed && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">Completed</span>}
          {late && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">Overdue</span>}
        </div>

        {/* Whose work this is — the thing the reader came here not knowing. */}
        <div className="flex items-center gap-1.5 mt-1 min-w-0">
          <Building2 size={12} className="text-gray-400 shrink-0" />
          <span className="text-sm text-gray-700 truncate">{g.project?.title ?? 'Unknown client'}</span>
          {g.project?.code && (
            <span className="text-xs font-mono font-bold text-brand-700 shrink-0" title="Client ID">
              {cidLabel(g.project.code, g.project.roundSeq)}
            </span>
          )}
          {g.project?.clientGroup && <span className="text-xs text-gray-400 truncate shrink-0">· {g.project.clientGroup.name}</span>}
        </div>

        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-1.5 text-xs text-gray-500">
          {(g.startDate || g.dueDate) && (
            <span className={clsx('inline-flex items-center gap-1', late && 'text-red-600 font-medium')}>
              <CalendarDays size={12} />
              {g.startDate ? formatDate(g.startDate) : '…'} → {g.dueDate ? formatDate(g.dueDate) : 'no deadline'}
            </span>
          )}
          {/* Present only for a reader allowed to see it — the server strips it for everyone else. */}
          {g.clientDueDate && (
            <span className="inline-flex items-center gap-1 text-amber-700" title="The date promised to the client">
              <Lock size={11} /> Client {formatDate(g.clientDueDate)}
            </span>
          )}
          <span className="inline-flex items-center gap-2" title={`${done} of ${g.taskCount} tasks closed`}>
            <span className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <span className={clsx('block h-full rounded-full', completed ? 'bg-green-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
            </span>
            <span className="tabular-nums">{done}/{g.taskCount} done</span>
          </span>
        </div>

        {reasons.length > 0 && (
          <p className="mt-2 inline-flex flex-wrap items-center gap-1 px-2 py-1 rounded-lg bg-brand-50 border border-brand-100 text-[11px] text-brand-800">
            <Search size={11} className="shrink-0" />
            <span>Matched {reasons.join(' and ')}</span>
            {g.matchedTasks.length > 0 && (
              <span className="text-brand-700/80">— {g.matchedTasks.map(t => `“${t.title}”`).join(', ')}</span>
            )}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right flex items-start gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-700 inline-flex items-center gap-1 justify-end">
            {g.overdueTaskCount > 0 ? <AlertTriangle size={13} className="text-red-500" /> : <ListChecks size={13} className="text-gray-400" />}
            {open}
          </p>
          <p className={clsx('text-xs', g.overdueTaskCount ? 'text-red-600 font-medium' : 'text-gray-400')}>
            open{g.overdueTaskCount ? ` · ${g.overdueTaskCount} late` : ''}
          </p>
        </div>
        <ArrowUpRight size={16} className="text-gray-300 group-hover:text-brand-500 mt-0.5 transition-colors" />
      </div>
    </button>
  );
}
