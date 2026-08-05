'use client';

import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, type ApiTask, type ApiProject, type PidRound, type WorkflowStatus } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { TaskListView, OverviewView } from './views';
import { KanbanBoard } from './KanbanBoard';
import GanttView from './GanttView';
import DiscussionsTab from './DiscussionsTab';
import IssuesTab from './IssuesTab';
import ActivityTab from './ActivityTab';
import TimesheetsTab from './TimesheetsTab';
import FilesTab from './FilesTab';
import { ProjectCapacityTab } from './ProjectCapacityTab';

export type ProjectTab =
  | 'Overview' | 'Task List' | 'Board' | 'Gantt' | 'Capacity'
  | 'Files' | 'Discussions' | 'Issues' | 'Activity' | 'Timesheets';

/**
 * One project's worth of a tab, inside its card on a multi-project PID page.
 *
 * Each card fetches its OWN tasks rather than sharing one list, because these are genuinely
 * separate pieces of work: round 2's board must not show round 1's finished tasks. The cost is
 * one query per open card, which is why cards start collapsed once a round is finished.
 *
 * Every tab component here already takes a projectId, so nothing below needed changing to become
 * round-aware — that is precisely why a round is modelled as a project.
 */
export function RoundTabContent({ round, tab, statuses, onTaskClick, onAddTask }: {
  round: PidRound;
  tab: ProjectTab;
  statuses: WorkflowStatus[];
  onTaskClick: (task: ApiTask, projectId: string) => void;
  onAddTask: (projectId: string, statusId?: string) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const needsTasks = tab === 'Task List' || tab === 'Overview' || tab === 'Board' || tab === 'Gantt';

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', round.id],
    queryFn: () => api.tasks.list(round.id),
    enabled: needsTasks,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  /** Same optimistic move as the single-project page, scoped to this round's task list. */
  async function handleMove(taskId: string, statusId: string) {
    const status = statuses.find(s => s.id === statusId);
    const key = ['tasks', round.id] as const;
    const snapshot = qc.getQueryData<ApiTask[]>(key);
    qc.setQueryData<ApiTask[]>(key, old =>
      (old ?? []).map(t => t.id === taskId
        ? { ...t, currentStatus: status ?? t.currentStatus, currentWorkflowStatusId: statusId }
        : t));
    try {
      await api.tasks.setStatus(taskId, statusId);
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['project-rounds'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    } catch (e) {
      if (snapshot) qc.setQueryData(key, snapshot); // the move was rejected — put it back
      toast(e instanceof Error ? e.message : 'Could not move the task', 'error');
    }
  }

  // A round is a project, so anything already keyed on projectId just works.
  const asProject = round as unknown as ApiProject;

  switch (tab) {
    case 'Task List':
      return (
        <TaskListView
          tasks={tasks}
          loading={isLoading}
          statuses={statuses}
          canAddTask
          onTaskClick={t => onTaskClick(t, round.id)}
          onAddTask={() => onAddTask(round.id)}
          onStatusChange={handleMove}
        />
      );
    case 'Board':
      return (
        <div className="p-3">
          <KanbanBoard
            tasks={tasks}
            statuses={statuses}
            onTaskClick={t => onTaskClick(t, round.id)}
            onAddTask={statusId => onAddTask(round.id, statusId)}
            onMove={handleMove}
          />
        </div>
      );
    case 'Overview':   return <div className="p-4"><OverviewView project={asProject} tasks={tasks} /></div>;
    case 'Gantt':      return <GanttView tasks={tasks} project={asProject} />;
    case 'Capacity':   return <div className="p-4"><ProjectCapacityTab projectId={round.id} /></div>;
    case 'Files':      return <div className="p-4"><FilesTab projectId={round.id} /></div>;
    case 'Issues':     return <div className="p-4"><IssuesTab projectId={round.id} /></div>;
    case 'Activity':   return <div className="p-4"><ActivityTab projectId={round.id} /></div>;
    case 'Timesheets': return <div className="p-4"><TimesheetsTab projectId={round.id} /></div>;
    case 'Discussions':return <div className="p-4"><DiscussionsTab projectId={round.id} /></div>;
    default:           return null;
  }
}
