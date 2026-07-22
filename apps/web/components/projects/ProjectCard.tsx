import Link from 'next/link';
import { CheckSquare, Users, Calendar, ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';
import { MockProject, PHASE_META, PRIORITY_META } from '@/lib/mock-data';
import { progressColor, progressTrack } from '@/lib/progress';

interface ProjectCardProps {
  project: MockProject;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const phase = PHASE_META[project.projectPhase];
  const priority = PRIORITY_META[project.priority];
  const barColor = progressColor(project.completionPercentage, project.priority);
  const trackColor = progressTrack(project.completionPercentage, project.priority);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col bg-white rounded-xl border border-gray-200 hover:border-brand-500 hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      {/* Top progress bar — width tracks completion %, color goes red → green by progress (+priority) */}
      <div className="h-1.5 w-full" style={{ backgroundColor: trackColor }}>
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${project.completionPercentage}%`, backgroundColor: barColor }}
          title={`${project.completionPercentage}% complete`}
        />
      </div>

      <div className="flex flex-col flex-1 p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', phase.bg, phase.text)}>
                {phase.label}
              </span>
              <span className={clsx('text-xs font-semibold', priority.color)}>
                {priority.label}
              </span>
            </div>
            {project.code && <span className="block text-[11px] font-mono text-gray-400 mb-0.5">{project.code}</span>}
            <h3 className="font-semibold text-gray-900 text-base leading-tight group-hover:text-brand-600 transition-colors line-clamp-1">
              {project.title}
            </h3>
          </div>
          <ArrowUpRight size={16} className="text-gray-300 group-hover:text-brand-500 shrink-0 mt-1 transition-colors" />
        </div>

        {/* Description */}
        <p className="text-sm text-gray-500 line-clamp-2 mb-4 flex-1">{project.description}</p>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>Progress</span>
            <span className="font-medium text-gray-700">{project.completionPercentage}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${project.completionPercentage}%`,
                backgroundColor: barColor,
              }}
            />
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between">
          {/* Members */}
          <div className="flex items-center -space-x-2">
            {project.members.slice(0, 4).map((m, i) => (
              <div
                key={i}
                className={clsx(
                  'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white',
                  m.color,
                )}
              >
                {m.initials}
              </div>
            ))}
            {project.memberCount > 4 && (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-600 border-2 border-white">
                +{project.memberCount - 4}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <CheckSquare size={13} />
              {project.taskCount}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={13} />
              {new Date(project.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
