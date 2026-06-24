'use client';

import clsx from 'clsx';
import { Plus, MoreHorizontal, Flag, GripVertical } from 'lucide-react';

type KanbanTask = {
  id: string;
  title: string;
  status: string;
  statusColor: string;
  priority: string;
  assignee: string;
  assigneeColor: string;
  dueDate: string;
};

interface KanbanBoardProps {
  onTaskClick?: (task: KanbanTask) => void;
  onAddTask?: (columnStatus: string) => void;
}

const COLUMNS = [
  { id: 'open',        label: 'Open',        color: '#64748b', status: 'Open'        },
  { id: 'in_progress', label: 'In Progress', color: '#3d8de2', status: 'In Progress' },
  { id: 'in_review',   label: 'In Review',   color: '#7c3aed', status: 'In Review'   },
  { id: 'closed',      label: 'Closed',      color: '#16a34a', status: 'Closed'      },
];

const MOCK_TASKS: KanbanTask[] = [
  { id: 't3', title: 'Design component library',      status: 'Open',        statusColor: '#64748b', priority: 'MEDIUM', assignee: 'CP', assigneeColor: 'bg-pink-500',   dueDate: 'Jul 22' },
  { id: 't4', title: 'Implement responsive navbar',   status: 'Open',        statusColor: '#64748b', priority: 'MEDIUM', assignee: 'BT', assigneeColor: 'bg-blue-500',   dueDate: 'Jul 28' },
  { id: 't5', title: 'SEO audit and meta tag updates',status: 'Open',        statusColor: '#64748b', priority: 'LOW',    assignee: 'AK', assigneeColor: 'bg-green-500',  dueDate: 'Aug 5'  },
  { id: 't2', title: 'Create wireframes for all pages',status: 'In Progress',statusColor: '#3d8de2', priority: 'HIGH',   assignee: 'MK', assigneeColor: 'bg-purple-500', dueDate: 'Jul 15' },
  { id: 't6', title: 'Performance benchmark baseline',status: 'In Review',   statusColor: '#7c3aed', priority: 'HIGH',   assignee: 'BT', assigneeColor: 'bg-blue-500',   dueDate: 'Jul 10' },
  { id: 't1', title: 'Define information architecture',status: 'Closed',     statusColor: '#16a34a', priority: 'HIGH',   assignee: 'AN', assigneeColor: 'bg-brand-600', dueDate: 'Jul 1'  },
];

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-500',
  HIGH:     'text-orange-500',
  MEDIUM:   'text-blue-500',
  LOW:      'text-gray-400',
};

export function KanbanBoard({ onTaskClick, onAddTask }: KanbanBoardProps = {}) {
  return (
    <div className="flex gap-4 h-full overflow-x-auto py-1 px-1">
      {COLUMNS.map(col => {
        const tasks = MOCK_TASKS.filter(t => t.status === col.status);
        const isClosed = col.status === 'Closed';

        return (
          <div key={col.id} className="flex flex-col w-72 shrink-0 bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            {/* Column header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                <span className="text-sm font-semibold text-gray-800">{col.label}</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                  {tasks.length}
                </span>
              </div>
              <button className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors">
                <MoreHorizontal size={14} />
              </button>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 p-3 flex-1 overflow-y-auto">
              {tasks.map(task => (
                <div
                  key={task.id}
                  onClick={() => onTaskClick?.(task)}
                  className={clsx(
                    'bg-white rounded-lg border border-gray-200 p-3.5 pl-6 cursor-pointer group relative hover:shadow-md hover:border-gray-300 transition-all',
                    isClosed && 'opacity-70',
                  )}
                >
                  {/* Drag handle */}
                  <div className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-30 cursor-grab transition-opacity">
                    <GripVertical size={12} className="text-gray-400" />
                  </div>

                  {/* Priority flag */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={clsx('flex items-center gap-1 text-xs font-medium', PRIORITY_COLOR[task.priority] ?? 'text-gray-400')}>
                      <Flag size={10} />
                      {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                    </span>
                    <button
                      onClick={e => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600 transition-opacity"
                    >
                      <MoreHorizontal size={13} />
                    </button>
                  </div>

                  {/* Title */}
                  <p className={clsx('text-sm text-gray-800 leading-snug mb-3', isClosed && 'line-through text-gray-400')}>
                    {task.title}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white', task.assigneeColor)}>
                      {task.assignee}
                    </div>
                    {task.dueDate && (
                      <span className="text-xs text-gray-400">{task.dueDate}</span>
                    )}
                  </div>
                </div>
              ))}

              {/* Add task */}
              <button
                onClick={() => onAddTask?.(col.status)}
                className="flex items-center gap-2 px-2 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors w-full"
              >
                <Plus size={14} />
                Add task
              </button>
            </div>
          </div>
        );
      })}

      {/* Add column */}
      <div className="w-72 shrink-0">
        <button className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border-2 border-dashed border-gray-300 transition-colors w-full">
          <Plus size={15} />
          Add column
        </button>
      </div>
    </div>
  );
}
