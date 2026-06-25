'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Plus, MoreHorizontal, Flag, GripVertical } from 'lucide-react';
import type { ApiTask, WorkflowStatus } from '@/lib/api';
import { userInitials, avatarColor } from '@/lib/avatar';

interface KanbanBoardProps {
  tasks: ApiTask[];
  statuses: WorkflowStatus[];
  onTaskClick?: (task: ApiTask) => void;
  onAddTask?: (statusName?: string) => void;
  onMove?: (taskId: string, statusId: string) => void;
}

// Fallback columns if the workflow statuses haven't loaded yet.
const FALLBACK = [
  { id: 'open',        name: 'Open',        colorHex: '#64748b', type: 'OPEN',   sequence: 1 },
  { id: 'in_progress', name: 'In Progress', colorHex: '#E8533A', type: 'OPEN',   sequence: 2 },
  { id: 'in_review',   name: 'In Review',   colorHex: '#7c3aed', type: 'OPEN',   sequence: 3 },
  { id: 'closed',      name: 'Closed',      colorHex: '#16a34a', type: 'CLOSED', sequence: 4 },
];

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-500',
  HIGH:     'text-orange-500',
  MEDIUM:   'text-amber-600',
  LOW:      'text-gray-400',
};

export function KanbanBoard({ tasks, statuses, onTaskClick, onAddTask, onMove }: KanbanBoardProps) {
  const columns = (statuses && statuses.length ? [...statuses].sort((a, b) => a.sequence - b.sequence) : FALLBACK);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  function handleDrop(statusId: string) {
    if (dragTaskId) {
      const task = tasks.find(t => t.id === dragTaskId);
      // Only fire if the status actually changed
      if (task && task.currentStatus?.id !== statusId) onMove?.(dragTaskId, statusId);
    }
    setDragTaskId(null);
    setOverCol(null);
  }

  return (
    <div className="flex gap-4 h-full overflow-x-auto py-1 px-1">
      {columns.map(col => {
        const colTasks = tasks.filter(t => (t.currentStatus?.id ?? '') === col.id || t.currentStatus?.name === col.name);
        const isClosed = col.type === 'CLOSED';

        return (
          <div
            key={col.id}
            onDragOver={e => { e.preventDefault(); setOverCol(col.id); }}
            onDragLeave={() => setOverCol(c => (c === col.id ? null : c))}
            onDrop={() => handleDrop(col.id)}
            className={clsx(
              'flex flex-col w-72 shrink-0 bg-gray-50 rounded-xl border overflow-hidden transition-colors',
              overCol === col.id ? 'border-brand-400 bg-brand-50/40' : 'border-gray-200',
            )}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.colorHex }} />
                <span className="text-sm font-semibold text-gray-800">{col.name}</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                  {colTasks.length}
                </span>
              </div>
              <button className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors">
                <MoreHorizontal size={14} />
              </button>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 p-3 flex-1 overflow-y-auto min-h-[120px]">
              {colTasks.map(task => {
                const assignee = task.assignees?.[0]?.user;
                const pr = task.priority ?? 'LOW';
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDragTaskId(task.id)}
                    onDragEnd={() => { setDragTaskId(null); setOverCol(null); }}
                    onClick={() => onTaskClick?.(task)}
                    className={clsx(
                      'bg-white rounded-lg border border-gray-200 p-3.5 pl-6 cursor-pointer group relative hover:shadow-md hover:border-gray-300 transition-all',
                      isClosed && 'opacity-70',
                      dragTaskId === task.id && 'opacity-40',
                    )}
                  >
                    <div className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 cursor-grab transition-opacity">
                      <GripVertical size={12} className="text-gray-400" />
                    </div>

                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={clsx('flex items-center gap-1 text-xs font-medium', PRIORITY_COLOR[pr] ?? 'text-gray-400')}>
                        <Flag size={10} />
                        {pr.charAt(0) + pr.slice(1).toLowerCase()}
                      </span>
                    </div>

                    <p className={clsx('text-sm text-gray-800 leading-snug mb-3', isClosed && 'line-through text-gray-400')}>
                      {task.title}
                    </p>

                    <div className="flex items-center justify-between">
                      {assignee ? (
                        <div
                          title={`${assignee.firstName} ${assignee.lastName ?? ''}`.trim()}
                          className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white', avatarColor(assignee.id))}
                        >
                          {userInitials(assignee)}
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-dashed border-gray-200" title="Unassigned" />
                      )}
                      {task.dueDate && (
                        <span className="text-xs text-gray-400">
                          {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                onClick={() => onAddTask?.(col.name)}
                className="flex items-center gap-2 px-2 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors w-full"
              >
                <Plus size={14} />
                Add task
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
