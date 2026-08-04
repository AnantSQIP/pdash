import type { ReportProject } from '@/lib/api';
import type { ExportData } from '@/components/ExportMenu';
import { projectTypeLabel } from '@/lib/mock-data';

/**
 * Report exports.
 *
 * The old export was seven columns — title, phase, priority, completion, tasks, members, due date —
 * which is a summary, not a report: no PID, no type, no client, no delivery date, no hours, and no
 * sign of who actually did the work. These build the whole picture instead.
 *
 *  • `projectsExport`   — the wide flat table (ExportMenu drives CSV *and* PDF from it).
 *  • `fullReportCsv`    — a sectioned CSV: every project, then every task with its staffing.
 *  • `singleProjectCsv` — the same detail for one project, for when someone asks about one matter.
 */

const cell = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
};
const row = (cells: unknown[]) => cells.map(cell).join(',');
const d = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '');
const dt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) : '';
/** Actual minus working: the number that says whether the estimate held. */
const variance = (p: ReportProject) =>
  p.actualHours != null && p.workingHours != null ? Math.round((p.actualHours - p.workingHours) * 10) / 10 : '';

export const PROJECT_COLUMNS = [
  'PID', 'Project', 'Project Type', 'Phase', 'Status', 'Priority', 'Client', 'Billable',
  'Progress %', 'Tasks', 'Tasks Closed', 'Tasks Open', 'Members',
  'Start', 'Deadline', 'Client Deadline', 'Client Delivered', 'Completed At', 'Closed At',
  'Working Hours', 'Actual Hours', 'Hours Variance', 'Logged Hours', 'Estimated Hours',
  'Project Managers', 'Team', 'Patents', 'Created By', 'Created At', 'Description',
];

export const projectRow = (p: ReportProject) => [
  p.pid ?? 'PID pending', p.title, p.type ? projectTypeLabel(p.type) : '', p.phase, p.status ?? '',
  p.priority, p.client ?? '', p.billable ? 'Yes' : 'No',
  p.progress, p.taskCount, p.tasksClosed, p.tasksOpen, p.memberCount,
  d(p.startDate), d(p.dueDate), d(p.clientDueDate), dt(p.clientDeliveryDate), dt(p.completedAt), dt(p.closedAt),
  p.workingHours ?? '', p.actualHours ?? '', variance(p), p.loggedHours, p.estimatedHours,
  p.managers.map(m => m.name).join('; '),
  p.members.map(m => `${m.name} (${m.role}${m.designation ? `, ${m.designation}` : ''})`).join('; '),
  p.patents.join('; '),
  p.createdBy ?? '', d(p.createdAt), p.description ?? '',
];

export const TASK_COLUMNS = [
  'PID', 'Project', 'Project Type', 'Task', 'Task Status', 'Closed', 'Priority', 'Task Deadline',
  'Task Estimated Hours', 'Task Actual Hours', 'Assignee', 'Assignee Role',
  'Assignee Estimated Hours', 'Assignee Deadline',
];

/** One row per ASSIGNEE (not per task), so staffing and per-person hours are filterable. */
export const taskRows = (p: ReportProject) =>
  p.tasks.flatMap(t => {
    const base = [
      p.pid ?? 'PID pending', p.title, p.type ? projectTypeLabel(p.type) : '',
      t.title, t.status ?? '', t.isClosed ? 'Yes' : 'No', t.priority, d(t.dueDate),
      t.estimatedHours ?? '', t.actualHours ?? '',
    ];
    if (t.assignees.length === 0) return [[...base, '(unassigned)', '', '', '']];
    return t.assignees.map(a => [...base, a.name, a.role, a.estimatedHours ?? '', d(a.dueDate)]);
  });

/** The wide flat table behind the Export ▾ menu (CSV + PDF). */
export function projectsExport(projects: ReportProject[], subtitle?: string): ExportData {
  return {
    filename: 'projects-report',
    title: 'Projects Report',
    subtitle: subtitle ?? `${projects.length} project${projects.length === 1 ? '' : 's'}`,
    columns: PROJECT_COLUMNS,
    rows: projects.map(projectRow),
    meta: [
      { label: 'Projects', value: String(projects.length) },
      { label: 'Active', value: String(projects.filter(p => p.phase === 'ACTIVE').length) },
      { label: 'Completed', value: String(projects.filter(p => p.phase === 'COMPLETED').length) },
      { label: 'Logged hours', value: String(Math.round(projects.reduce((n, p) => n + p.loggedHours, 0) * 10) / 10) },
    ],
  };
}

function download(lines: string[], filename: string) {
  // BOM so Excel opens UTF-8 cleanly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Every project, then every task with its staffing — two sections in one readable file. */
export function fullReportCsv(projects: ReportProject[]) {
  const lines: string[] = [];
  lines.push(row([`Projects report — ${new Date().toISOString().slice(0, 10)}`]));
  lines.push(row([`${projects.length} project${projects.length === 1 ? '' : 's'}`]));
  lines.push('');
  lines.push(row(['PROJECTS']));
  lines.push(row(PROJECT_COLUMNS));
  projects.forEach(p => lines.push(row(projectRow(p))));
  lines.push('');
  lines.push(row(['TASKS & STAFFING']));
  lines.push(row(TASK_COLUMNS));
  const tasks = projects.flatMap(taskRows);
  if (tasks.length === 0) lines.push(row(['No tasks on these projects.']));
  else tasks.forEach(r => lines.push(row(r)));
  download(lines, `projects-report-${new Date().toISOString().slice(0, 10)}.csv`);
}

/** Everything about ONE project — what someone asking "send me this matter" actually wants. */
export function singleProjectCsv(p: ReportProject) {
  const lines: string[] = [];
  const label = p.pid ?? p.title;
  lines.push(row([`Project report — ${label}`]));
  lines.push('');
  lines.push(row(['PROJECT']));
  // Vertical (field/value) rather than a one-row table: a single project reads far better this way.
  PROJECT_COLUMNS.forEach((col, i) => lines.push(row([col, projectRow(p)[i]])));
  lines.push('');
  lines.push(row(['TASKS & STAFFING']));
  lines.push(row(TASK_COLUMNS));
  const rows = taskRows(p);
  if (rows.length === 0) lines.push(row(['No tasks on this project.']));
  else rows.forEach(r => lines.push(row(r)));
  download(lines, `project-${(p.pid ?? p.title).replace(/[^\w-]+/g, '_')}.csv`);
}
