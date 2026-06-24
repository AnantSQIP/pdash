'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Plus, Bug, AlertCircle, HelpCircle, Zap } from 'lucide-react';

type Issue = {
  id: string;
  title: string;
  type: 'BUG' | 'ENHANCEMENT' | 'QUESTION';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'CLOSED' | 'WONT_FIX';
  assignee: string;
  assigneeColor: string;
  reportedBy: string;
  dueDate: string;
  createdAt: string;
};

const MOCK_ISSUES: Issue[] = [
  { id: 'i1', title: 'Login button unresponsive on mobile Safari', type: 'BUG',         severity: 'CRITICAL', status: 'IN_PROGRESS', assignee: 'BT', assigneeColor: 'bg-blue-500',   reportedBy: 'SA', dueDate: '2026-06-28', createdAt: '2026-06-20' },
  { id: 'i2', title: 'Dark mode toggle not persisting on refresh',  type: 'BUG',         severity: 'HIGH',     status: 'OPEN',        assignee: 'DV', assigneeColor: 'bg-red-500',    reportedBy: 'AK', dueDate: '2026-07-05', createdAt: '2026-06-21' },
  { id: 'i3', title: 'Add keyboard shortcuts for power users',       type: 'ENHANCEMENT', severity: 'MEDIUM',   status: 'OPEN',        assignee: 'CP', assigneeColor: 'bg-pink-500',   reportedBy: 'BT', dueDate: '2026-07-15', createdAt: '2026-06-22' },
  { id: 'i4', title: 'Footer links broken in IE11',                  type: 'BUG',         severity: 'LOW',      status: 'WONT_FIX',    assignee: '',   assigneeColor: '',              reportedBy: 'SA', dueDate: '',           createdAt: '2026-06-19' },
  { id: 'i5', title: 'Hero image loading too slowly on 3G',          type: 'BUG',         severity: 'HIGH',     status: 'FIXED',       assignee: 'BT', assigneeColor: 'bg-blue-500',   reportedBy: 'DV', dueDate: '2026-06-25', createdAt: '2026-06-18' },
  { id: 'i6', title: 'Can we add CSV export to the reports page?',  type: 'QUESTION',    severity: 'LOW',      status: 'OPEN',        assignee: 'AK', assigneeColor: 'bg-purple-500', reportedBy: 'SA', dueDate: '2026-07-10', createdAt: '2026-06-23' },
];

const STATUS_FILTERS = ['All', 'Open', 'In Progress', 'Fixed', 'Closed'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const TYPE_OPTIONS = ['All Types', 'Bug', 'Enhancement', 'Question'] as const;
type TypeOption = typeof TYPE_OPTIONS[number];

const TYPE_BADGE: Record<Issue['type'], string> = {
  BUG:         'bg-red-100 text-red-700',
  ENHANCEMENT: 'bg-blue-100 text-blue-700',
  QUESTION:    'bg-yellow-100 text-yellow-700',
};

const SEVERITY_BADGE: Record<Issue['severity'], string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH:     'bg-orange-100 text-orange-700',
  MEDIUM:   'bg-yellow-100 text-yellow-700',
  LOW:      'bg-gray-100 text-gray-600',
};

const STATUS_BADGE: Record<Issue['status'], string> = {
  OPEN:        'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-orange-100 text-orange-700',
  FIXED:       'bg-green-100 text-green-700',
  CLOSED:      'bg-gray-100 text-gray-500',
  WONT_FIX:    'bg-gray-100 text-gray-400',
};

function statusMatchesFilter(status: Issue['status'], filter: StatusFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Open') return status === 'OPEN';
  if (filter === 'In Progress') return status === 'IN_PROGRESS';
  if (filter === 'Fixed') return status === 'FIXED';
  if (filter === 'Closed') return status === 'CLOSED';
  return true;
}

function typeMatchesFilter(type: Issue['type'], filter: TypeOption): boolean {
  if (filter === 'All Types') return true;
  if (filter === 'Bug') return type === 'BUG';
  if (filter === 'Enhancement') return type === 'ENHANCEMENT';
  if (filter === 'Question') return type === 'QUESTION';
  return true;
}

function TypeIcon({ type }: { type: Issue['type'] }) {
  if (type === 'BUG') return <Bug className="w-3 h-3" />;
  if (type === 'ENHANCEMENT') return <Zap className="w-3 h-3" />;
  return <HelpCircle className="w-3 h-3" />;
}

export default function IssuesTab({ projectId: _projectId }: { projectId: string }) {
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('All');
  const [filterType, setFilterType] = useState<TypeOption>('All Types');

  const filtered = MOCK_ISSUES.filter(
    (issue) =>
      statusMatchesFilter(issue.status, filterStatus) &&
      typeMatchesFilter(issue.type, filterType)
  );

  const totalBugs       = MOCK_ISSUES.filter((i) => i.type === 'BUG').length;
  const openCount       = MOCK_ISSUES.filter((i) => i.status === 'OPEN').length;
  const inProgressCount = MOCK_ISSUES.filter((i) => i.status === 'IN_PROGRESS').length;
  const fixedCount      = MOCK_ISSUES.filter((i) => i.status === 'FIXED').length;

  return (
    <div className="flex flex-col min-h-0">
      {/* Top bar */}
      <div className="bg-white -mx-6 px-6 py-3 border-b border-gray-200 sticky top-0 z-10 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => alert('Report issue coming soon')}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Report Issue
        </button>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={clsx(
                'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                filterStatus === f
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Type filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as TypeOption)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 py-3 border-b border-gray-100 -mx-6 px-6">
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <Bug className="w-4 h-4 text-red-500" />
          <span className="font-semibold text-gray-900">{totalBugs}</span>
          <span>bugs</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <AlertCircle className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-gray-900">{openCount}</span>
          <span>open</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
          <span className="font-semibold text-gray-900">{inProgressCount}</span>
          <span>in progress</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <span className="font-semibold text-gray-900">{fixedCount}</span>
          <span>fixed</span>
        </div>
      </div>

      {/* Issues table */}
      <div className="bg-white rounded-xl border border-gray-200 mt-4 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">#</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Severity</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assignee</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reported</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                  No issues match the selected filters.
                </td>
              </tr>
            ) : (
              filtered.map((issue, idx) => (
                <tr
                  key={issue.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => alert('Issue detail coming soon')}
                >
                  {/* ID */}
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-gray-400">
                      #I-{String(idx + 1).padStart(3, '0')}
                    </span>
                  </td>

                  {/* Title */}
                  <td className="px-4 py-3 max-w-xs">
                    <span className="text-sm font-medium text-gray-900 line-clamp-2">{issue.title}</span>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                        TYPE_BADGE[issue.type]
                      )}
                    >
                      <TypeIcon type={issue.type} />
                      {issue.type === 'BUG' ? 'Bug' : issue.type === 'ENHANCEMENT' ? 'Enhancement' : 'Question'}
                    </span>
                  </td>

                  {/* Severity */}
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                        SEVERITY_BADGE[issue.severity]
                      )}
                    >
                      {issue.severity.charAt(0) + issue.severity.slice(1).toLowerCase()}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        STATUS_BADGE[issue.status],
                        issue.status === 'WONT_FIX' && 'line-through'
                      )}
                    >
                      {issue.status === 'IN_PROGRESS'
                        ? 'In Progress'
                        : issue.status === 'WONT_FIX'
                        ? "Won't Fix"
                        : issue.status.charAt(0) + issue.status.slice(1).toLowerCase()}
                    </span>
                  </td>

                  {/* Assignee */}
                  <td className="px-4 py-3">
                    {issue.assignee ? (
                      <div
                        className={clsx(
                          'w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold',
                          issue.assigneeColor
                        )}
                        title={issue.assignee}
                      >
                        {issue.assignee}
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center bg-gray-200 text-gray-400 text-xs font-semibold">
                        ?
                      </div>
                    )}
                  </td>

                  {/* Due date */}
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">{issue.dueDate || '—'}</span>
                  </td>

                  {/* Reporter */}
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-400">{issue.reportedBy}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
