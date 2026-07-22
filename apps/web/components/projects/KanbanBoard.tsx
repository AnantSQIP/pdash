'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Plus, Flag, GripVertical } from 'lucide-react';
import type { ApiTask, WorkflowStatus } from '@/lib/api';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { taskAssigneeUsers } from '@/lib/tasks';
import { formatDate } from '@/lib/date';

interface KanbanBoardProps {
  tasks: ApiTask[];
  statuses: WorkflowStatus[];
  onTaskClick?: (task: ApiTask) => void;
  onAddTask?: (statusId?: string) => void;
  onMove?: (taskId: string, statusId: string) => void;
}

// Fallback columns if the workflow statuses haven't loaded yet. These carry no real
// status ids, so drag-to-move is disabled until the live statuses arrive.
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
  const ready = !!(statuses && statuses.length); // real, movable statuses loaded?
  const columns = ready ? [...statuses].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)) : FALLBACK;
  // The column a task belongs to (matched by status id or name), or undefined if it has no
  // status or its status matches no loaded column.
  const colOf = (t: ApiTask) => columns.find(c => (t.currentStatus?.id ?? '') === c.id || t.currentStatus?.name === c.name);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  function handleDrop(statusId: string) {
    if (ready && dragTaskId) {
      const task = tasks.find(t => t.id === dragTaskId);
      // Only fire if the status actually changed
      if (task && task.currentStatus?.id !== statusId) onMove?.(dragTaskId, statusId);
    }
    setDragTaskId(null);
    setOverCol(null);
  }

  return (
    <div className="flex gap-3 lg:gap-4 h-full overflow-x-auto py-1 px-0.5 lg:px-1">
      {columns.map((col, idx) => {
        // Every task must land in exactly one column. A task whose status matches a loaded
        // column goes there; a task with NO status, or a status that matches no column
        // (statuses still loading, or a renamed/foreign workflow) falls to the first column
        // instead of silently disappearing.
        const colTasks = tasks.filter(t => {
          const home = t.currentStatus ? colOf(t) : undefined;
          return home ? home.id === col.id : idx === 0;
        });
        const isClosedCol = col.type === 'CLOSED';

        return (
          <div
            key={col.id}
            onDragOver={e => { if (ready) { e.preventDefault(); setOverCol(col.id); } }}
            onDragLeave={() => setOverCol(c => (c === col.id ? null : c))}
            onDrop={() => handleDrop(col.id)}
            className={clsx(
              // Mobile: fixed, swipeable columns. Desktop (lg+): flex to fill the width — no horizontal scroll.
              'flex flex-col shrink-0 w-[85vw] max-w-[20rem] lg:w-auto lg:max-w-none lg:flex-1 lg:min-w-0 bg-gray-50 rounded-xl border overflow-hidden transition-colors',
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
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 p-3 flex-1 overflow-y-auto min-h-[120px]">
              {colTasks.map(task => {
                const pr = task.priority ?? 'LOW';
                return (
                  <div
                    key={task.id}
                    draggable={ready}
                    onDragStart={() => ready && setDragTaskId(task.id)}
                    onDragEnd={() => { setDragTaskId(null); setOverCol(null); }}
                    onClick={() => onTaskClick?.(task)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTaskClick?.(task); } }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open task: ${task.title}`}
                    className={clsx(
                      'bg-white rounded-lg border border-gray-200 p-3.5 pl-6 cursor-pointer group relative hover:shadow-md hover:border-gray-300 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/40',
                      isClosedCol && 'opacity-70',
                      dragTaskId === task.id && 'opacity-40',
                    )}
                  >
                    {ready && (
                      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 cursor-grab transition-opacity">
                        <GripVertical size={12} className="text-gray-400" />
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={clsx('flex items-center gap-1 text-xs font-medium', PRIORITY_COLOR[pr] ?? 'text-gray-400')}>
                        <Flag size={10} />
                        {pr.charAt(0) + pr.slice(1).toLowerCase()}
                      </span>
                    </div>

                    <p className={clsx('text-sm text-gray-800 leading-snug mb-3', isClosedCol && 'line-through text-gray-400')}>
                      {task.title}
                    </p>

                    {/* Progress */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${task.completionPercentage}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{task.completionPercentage}%</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <AvatarStack
                        users={taskAssigneeUsers(task)}
                        size={24}
                        max={3}
                        empty={<div className="w-6 h-6 rounded-full border-2 border-dashed border-gray-200" title="Unassigned" />}
                      />
                      {task.dueDate && (
                        <span className="text-xs text-gray-400">{formatDate(task.dueDate)}</span>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                onClick={() => onAddTask?.(ready ? col.id : undefined)}
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
