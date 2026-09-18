import Link from 'next/link';
import { Users, Calendar, ArrowUpRight, Layers, AlertTriangle, ListChecks } from 'lucide-react';
import clsx from 'clsx';
import { MockProject, PHASE_META, PRIORITY_META, projectTypeLabel, pidLabel } from '@/lib/mock-data';
import { domainLabelOf } from './TechnologyDomainPicker';
import { progressColor, progressTrack } from '@/lib/progress';
import { formatDate, isPastDue } from '@/lib/date';

interface ProjectCardProps {
  project: MockProject;
}

/**
 * CLIENTS-FLOW: a CLIENT's card (the row is still a project underneath).
 *
 * Ordered NAME → PID → status, then the thing a client card has that a project card never did:
 * the work inside it. Its open task groups are named — "FTO – Widget X", "Invalidity – US123" —
 * because "3 task groups" says nothing about which client this is; and the open-task count carries
 * its overdue share in red, because that is what somebody scanning a wall of clients is looking for.
 */
export function ProjectCard({ project }: ProjectCardProps) {
  const phase = PHASE_META[project.projectPhase];
  const priority = PRIORITY_META[project.priority];
  const barColor = progressColor(project.completionPercentage, project.priority);
  const trackColor = progressTrack(project.completionPercentage, project.priority);
  const groups = project.activeTaskGroups ?? [];
  const shown = groups.slice(0, 3);
  const open = project.openTaskCount ?? 0;
  const overdue = project.overdueTaskCount ?? 0;
  const nextLate = !!project.nextDeadline && isPastDue(project.nextDeadline);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col bg-white rounded-xl border border-gray-200 hover:border-brand-500 hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: trackColor }}>
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${project.completionPercentage}%`, backgroundColor: barColor }}
          title={`${project.completionPercentage}% complete`}
        />
      </div>

      <div className="flex flex-col flex-1 p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 title={project.title} className="font-semibold text-gray-900 text-[17px] leading-snug group-hover:text-brand-600 transition-colors line-clamp-2">
              {project.title}
            </h3>
            {project.code
              ? <span className="block mt-1.5 text-sm font-mono font-bold text-brand-700 tracking-tight">{pidLabel(project.code, project.roundSeq)}</span>
              : <span className="block mt-1.5 text-sm font-mono font-bold text-amber-500">PID pending</span>}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold', phase.bg, phase.text)}>
                {phase.label}
              </span>
              {/* A client created before task groups carried the type still shows it. */}
              {project.projectType && (
                <span title={`Type: ${projectTypeLabel(project.projectType)}`}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {projectTypeLabel(project.projectType)}
                </span>
              )}
              {project.technologyDomain && (
                <span title={`Technology domain: ${domainLabelOf(project.technologyDomain)}`}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-50 text-teal-700 border border-teal-100">
                  {domainLabelOf(project.technologyDomain)}
                </span>
              )}
              <span className={clsx('text-[11px] font-semibold ml-0.5', priority.color)}>
                {priority.label}
              </span>
            </div>
          </div>
          <ArrowUpRight size={16} className="text-gray-300 group-hover:text-brand-500 shrink-0 mt-1 transition-colors" />
        </div>

        {/* The work inside the client. */}
        <div className="mb-4 flex-1">
          {shown.length > 0 ? (
            <ul className="space-y-1">
              {shown.map(g => (
                <li key={g.id} className="flex items-center gap-1.5 text-xs min-w-0">
                  <Layers size={12} className="text-brand-400 shrink-0" />
                  <span className="truncate text-gray-700">{g.name}</span>
                  {g.groupType && (
                    <span className="shrink-0 text-[10px] font-medium px-1.5 py-px rounded bg-indigo-50 text-indigo-600">{projectTypeLabel(g.groupType)}</span>
                  )}
                  {g.dueDate && (
                    <span className={clsx('ml-auto shrink-0 text-[10px] tabular-nums', isPastDue(g.dueDate) ? 'text-red-600 font-semibold' : 'text-gray-400')}>
                      {formatDate(g.dueDate)}
                    </span>
                  )}
                </li>
              ))}
              {groups.length > shown.length && (
                <li className="text-[11px] text-gray-400 pl-[18px]">+{groups.length - shown.length} more task group{groups.length - shown.length === 1 ? '' : 's'}</li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">
              {(project.taskGroupCount ?? 0) > 0 ? 'Every task group is complete.' : project.description || 'No task groups yet.'}
            </p>
          )}
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>Progress</span>
            <span className="font-medium text-gray-700">{project.completionPercentage}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${project.completionPercentage}%`, backgroundColor: barColor }} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center -space-x-2" title={`${project.memberCount} on this client`}>
            {project.members.slice(0, 4).map((m, i) => (
              <div key={i} className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white', m.color)}>
                {m.initials}
              </div>
            ))}
            {project.memberCount > 4 && (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-600 border-2 border-white">
                +{project.memberCount - 4}
              </div>
            )}
            {project.memberCount === 0 && <Users size={14} className="text-gray-300" />}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1" title={`${open} open task${open === 1 ? '' : 's'}${overdue ? `, ${overdue} overdue` : ''}`}>
              {overdue > 0 ? <AlertTriangle size={13} className="text-red-500" /> : <ListChecks size={13} />}
              {open}
              {overdue > 0 && <span className="text-red-600 font-semibold">· {overdue} late</span>}
            </span>
            {project.nextDeadline && (
              <span className={clsx('flex items-center gap-1', nextLate && 'text-red-600 font-medium')} title="Next task-group deadline">
                <Calendar size={13} />
                {formatDate(project.nextDeadline)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/** The same client as one line — the list view. */
export function ProjectListRow({ project }: ProjectCardProps) {
  const phase = PHASE_META[project.projectPhase];
  const priority = PRIORITY_META[project.priority];
  const groups = project.activeTaskGroups ?? [];
  const overdue = project.overdueTaskCount ?? 0;
  return (
    <Link href={`/projects/${project.id}`} className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 hover:border-brand-500 px-5 py-3.5 transition-all group">
      <div className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: project.statusColor }} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate group-hover:text-brand-600 transition-colors">{project.title}</p>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {project.code
            ? <span className="text-xs font-mono font-bold text-brand-700">{pidLabel(project.code, project.roundSeq)}</span>
            : <span className="text-xs font-mono font-bold text-amber-500">PID pending</span>}
          <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full', phase.bg, phase.text)}>{phase.label}</span>
          <span className={clsx('text-[11px] font-semibold', priority.color)}>{priority.label}</span>
          {groups.length > 0 && (
            <span className="text-[11px] text-gray-500 truncate">
              <Layers size={11} className="inline -mt-0.5 mr-1 text-brand-400" />
              {groups.slice(0, 2).map(g => g.name).join(' · ')}{groups.length > 2 ? ` +${groups.length - 2}` : ''}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-gray-700">{project.completionPercentage}%</p>
        <p className={clsx('text-xs', overdue ? 'text-red-600 font-medium' : 'text-gray-400')}>
          {project.openTaskCount ?? 0} open{overdue ? ` · ${overdue} late` : ''}
        </p>
      </div>
      <div className="hidden sm:flex items-center -space-x-1.5 shrink-0">
        {project.members.slice(0, 3).map((m, i) => (
          <div key={i} className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white', m.color)}>
            {m.initials}
          </div>
        ))}
      </div>
    </Link>
  );
}
