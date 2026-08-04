import type { DigestDetail, DigestProject, DigestTask } from '@/lib/api';

/**
 * The digest export used to be two columns — a metric name and a number — which told you a
 * project was completed but not which one, by whom, when it reached the client, or what it cost.
 *
 * This writes the whole report instead: one CSV with a section per part of the screen, each with
 * its own header row, so it opens in Excel as a readable document rather than a summary. Every
 * row carries the identifiers (PID, project, person) needed to join it against anything else.
 */

const cell = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
};
const row = (cells: unknown[]) => cells.map(cell).join(',');
const d = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '');
const dt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) : '';

const PROJECT_COLUMNS = [
  'PID', 'Project', 'Type', 'Phase', 'Priority', 'Client', 'Progress %', 'Tasks',
  'Start', 'Deadline', 'Client Deadline', 'Client Delivered', 'Completed At',
  'Working Hours', 'Actual Hours', 'Hours Variance', 'Project Managers', 'Members',
];
const projectRow = (p: DigestProject) => [
  p.pid ?? 'PID pending', p.title, p.type ?? '', p.phase, p.priority, p.client ?? '',
  p.progress, p.taskCount,
  d(p.startDate), d(p.dueDate), d(p.clientDueDate), dt(p.clientDeliveryDate), dt(p.completedAt),
  p.workingHours ?? '', p.actualHours ?? '',
  p.actualHours != null && p.workingHours != null
    ? Math.round((p.actualHours - p.workingHours) * 10) / 10 : '',
  p.managers.map(m => m.name).join('; '),
  p.members.map(m => `${m.name} (${m.role})`).join('; '),
];

const TASK_COLUMNS = [
  'PID', 'Project', 'Project Type', 'Project Progress %', 'Task', 'Status', 'Priority',
  'Deadline', 'Days Overdue', 'Estimated Hours', 'Actual Hours', 'Assignees',
];
const taskRow = (t: DigestTask) => [
  t.project?.pid ?? '', t.project?.title ?? '', t.project?.type ?? '', t.project?.progress ?? '',
  t.title, t.status ?? '', t.priority, d(t.dueDate), t.daysOverdue || '',
  t.estimatedHours ?? '', t.actualHours ?? '',
  t.assignees.map(a => {
    const bits = [a.role, a.estimatedHours != null ? `${a.estimatedHours}h` : null, a.dueDate ? d(a.dueDate) : null]
      .filter(Boolean).join(', ');
    return `${a.name} (${bits})`;
  }).join('; '),
];

/** Build the sectioned CSV and hand it to the browser. */
export function digestCsv(report: DigestDetail): void {
  const lines: string[] = [];
  const section = (title: string, columns: string[], rows: unknown[][], emptyNote: string) => {
    lines.push(row([title]));
    if (rows.length === 0) {
      lines.push(row([emptyNote]));
    } else {
      lines.push(row(columns));
      rows.forEach(r => lines.push(row(r)));
    }
    lines.push(''); // blank line between sections keeps Excel readable
  };

  lines.push(row([`Daily digest — ${report.date}`]));
  lines.push('');

  section('SUMMARY', ['Metric', 'Value'], [
    ['Projects created', report.projectsCreated.length],
    ['Projects completed', report.projectsCompleted.length],
    ['Tasks completed', report.tasksCompleted.length],
    ['Deadlines met', report.deadlinesMet.length],
    ['Overdue tasks', report.overdue.length],
    ['Due in the next 5 working days', report.upcomingTotal],
    ['Hours logged', report.totals.hoursLogged],
    ['Billable hours', report.totals.billableHours],
    ['People who logged time', report.totals.peopleWhoLogged],
    ['Active projects', report.totals.activeProjects],
  ], '');

  section('PROJECTS CREATED', PROJECT_COLUMNS, report.projectsCreated.map(projectRow), 'No projects were created.');
  section('PROJECTS COMPLETED', PROJECT_COLUMNS, report.projectsCompleted.map(projectRow), 'No projects were completed.');
  section('TASKS COMPLETED', TASK_COLUMNS, report.tasksCompleted.map(taskRow), 'No tasks were closed.');
  section('DEADLINES MET', TASK_COLUMNS, report.deadlinesMet.map(taskRow), 'Nothing was due.');
  section('OVERDUE TASKS', TASK_COLUMNS, report.overdue.map(taskRow), 'Nothing overdue.');

  // The lookahead is flattened with its date first, so it sorts and filters naturally.
  const upcomingProjects = report.upcoming.flatMap(day => day.projects.map(p => [day.date, ...projectRow(p)]));
  const upcomingTasks = report.upcoming.flatMap(day => day.tasks.map(t => [day.date, ...taskRow(t)]));
  section('DUE IN THE NEXT 5 WORKING DAYS — PROJECTS', ['Due On', ...PROJECT_COLUMNS], upcomingProjects, 'No project deadlines.');
  section('DUE IN THE NEXT 5 WORKING DAYS — TASKS', ['Due On', ...TASK_COLUMNS], upcomingTasks, 'No task deadlines.');

  section('HOURS LOGGED — PER PERSON', ['Person', 'Designation', 'Hours', 'Billable Hours', 'Entries'],
    report.hoursByPerson.map(p => [p.name, p.designation ?? '', p.hours, p.billableHours, p.entries.length]),
    'Nobody logged time.');

  // Every individual entry, so the per-person totals can be audited rather than trusted.
  section('HOURS LOGGED — EVERY ENTRY', ['Person', 'PID', 'Project', 'Task', 'Hours', 'Billable', 'Notes'],
    report.hoursByPerson.flatMap(p => p.entries.map(e => [
      p.name, e.project?.pid ?? '', e.project?.title ?? '', e.task?.title ?? '',
      e.hours, e.billable ? 'Yes' : 'No', e.notes ?? '',
    ])),
    'No time entries.');

  // BOM so Excel opens UTF-8 (and the ₹/– characters) cleanly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `daily-digest-${report.date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
