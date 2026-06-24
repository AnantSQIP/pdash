'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Plus, Clock, DollarSign, Users, Edit2, Trash2 } from 'lucide-react';

type TimeEntry = {
  id: string;
  taskTitle: string;
  member: string;
  memberInitials: string;
  memberColor: string;
  date: string;
  hours: number;
  minutes: number;
  billable: boolean;
  notes: string;
};

const TIME_ENTRIES: TimeEntry[] = [
  { id: 'te1', taskTitle: 'Create wireframes',           member: 'Carol Patel', memberInitials: 'CP', memberColor: 'bg-pink-500',   date: '2026-06-24', hours: 3, minutes: 30, billable: true,  notes: 'Initial wireframe pass for all main pages' },
  { id: 'te2', taskTitle: 'Performance benchmark',       member: 'Bob Taylor',  memberInitials: 'BT', memberColor: 'bg-blue-500',   date: '2026-06-24', hours: 2, minutes: 0,  billable: true,  notes: 'Lighthouse audits on 3 page types' },
  { id: 'te3', taskTitle: 'Design component library',    member: 'Carol Patel', memberInitials: 'CP', memberColor: 'bg-pink-500',   date: '2026-06-23', hours: 4, minutes: 15, billable: true,  notes: 'Button, input, and card components' },
  { id: 'te4', taskTitle: 'Implement responsive navbar', member: 'Bob Taylor',  memberInitials: 'BT', memberColor: 'bg-blue-500',   date: '2026-06-23', hours: 1, minutes: 45, billable: false, notes: 'Setup' },
  { id: 'te5', taskTitle: 'SEO audit',                   member: 'Alice Kim',   memberInitials: 'AK', memberColor: 'bg-purple-500', date: '2026-06-22', hours: 2, minutes: 30, billable: true,  notes: 'Keyword research and meta tag review' },
  { id: 'te6', taskTitle: 'Define information arch',     member: 'Anant Gupta', memberInitials: 'AN', memberColor: 'bg-brand-600', date: '2026-06-21', hours: 5, minutes: 0,  billable: true,  notes: 'Stakeholder interviews and sitemap draft' },
];

const DATE_FILTER_OPTIONS = ['This Week', 'Last Week', 'This Month', 'All Time'] as const;
type DateFilterOption = typeof DATE_FILTER_OPTIONS[number];

const BILLABLE_FILTER_OPTIONS = ['All', 'Billable', 'Non-billable'] as const;
type BillableFilterOption = typeof BILLABLE_FILTER_OPTIONS[number];

function fmt(h: number, m: number): string {
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function totalMinutes(entries: TimeEntry[]): number {
  return entries.reduce((acc, e) => acc + e.hours * 60 + e.minutes, 0);
}

function minutesToDisplay(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return fmt(h, m);
}

function MemberAvatar({ initials, color }: { initials: string; color: string }) {
  return (
    <div
      className={clsx(
        'w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0',
        color
      )}
    >
      {initials}
    </div>
  );
}

export default function TimesheetsTab({ projectId: _projectId }: { projectId: string }) {
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('This Week');
  const [billableFilter, setBillableFilter] = useState<BillableFilterOption>('All');

  // Apply billable filter to entries
  const filteredEntries = TIME_ENTRIES.filter((e) => {
    if (billableFilter === 'Billable') return e.billable;
    if (billableFilter === 'Non-billable') return !e.billable;
    return true;
  });

  // Summary totals (always from full data, irrespective of filter for accuracy)
  const totalMins    = totalMinutes(TIME_ENTRIES);
  const billableMins = totalMinutes(TIME_ENTRIES.filter((e) => e.billable));
  const uniqueMembers = Array.from(new Set(TIME_ENTRIES.map((e) => e.member)));

  // Per-member summaries
  const memberSummaries = uniqueMembers.map((member) => {
    const entries = TIME_ENTRIES.filter((e) => e.member === member);
    const billableEntries = entries.filter((e) => e.billable);
    const latestDate = entries.reduce((latest, e) => (e.date > latest ? e.date : latest), '');
    const first = entries[0];
    return {
      member,
      initials: first.memberInitials,
      color: first.memberColor,
      totalMins: totalMinutes(entries),
      billableMins: totalMinutes(billableEntries),
      latestDate,
    };
  });

  return (
    <div className="flex flex-col min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 -mx-6 mb-4 px-6 py-3 bg-white border-b border-gray-200 sticky top-0 z-10 flex-wrap">
        <button
          onClick={() => alert('Time log form coming soon')}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Log Time
        </button>

        {/* Date range filter */}
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilterOption)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {DATE_FILTER_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>

        {/* Billable filter pills */}
        <div className="flex items-center gap-1.5">
          {BILLABLE_FILTER_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setBillableFilter(f)}
              className={clsx(
                'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                billableFilter === f
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Total hours */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
            <Clock className="w-4.5 h-4.5 text-brand-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Total Hours</p>
            <p className="text-xl font-bold text-gray-900">{minutesToDisplay(totalMins)}</p>
          </div>
        </div>

        {/* Billable hours */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
            <DollarSign className="w-4.5 h-4.5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Billable Hours</p>
            <p className="text-xl font-bold text-gray-900">{minutesToDisplay(billableMins)}</p>
          </div>
        </div>

        {/* Members */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <Users className="w-4.5 h-4.5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Members</p>
            <p className="text-xl font-bold text-gray-900">{uniqueMembers.length}</p>
          </div>
        </div>
      </div>

      {/* Per-member summary table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Member</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Hours</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Billable</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Entry</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {memberSummaries.map((ms) => (
              <tr key={ms.member} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <MemberAvatar initials={ms.initials} color={ms.color} />
                    <span className="text-sm font-medium text-gray-900">{ms.member}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 font-medium">{minutesToDisplay(ms.totalMins)}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{minutesToDisplay(ms.billableMins)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{ms.latestDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Time entries table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Member</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Billable</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredEntries.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                {/* Task */}
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-gray-900">{entry.taskTitle}</span>
                </td>

                {/* Member */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <MemberAvatar initials={entry.memberInitials} color={entry.memberColor} />
                    <span className="text-sm text-gray-700">{entry.member}</span>
                  </div>
                </td>

                {/* Date */}
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{entry.date}</td>

                {/* Duration */}
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">{fmt(entry.hours, entry.minutes)}</span>
                </td>

                {/* Billable */}
                <td className="px-4 py-3">
                  <span
                    className={clsx(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      entry.billable
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    )}
                  >
                    {entry.billable ? 'Yes' : 'No'}
                  </span>
                </td>

                {/* Notes */}
                <td className="px-4 py-3 max-w-xs">
                  <span className="text-xs text-gray-500 truncate block" title={entry.notes}>{entry.notes}</span>
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => alert('Edit time entry coming soon')}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => alert('Delete time entry coming soon')}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {/* Log Time row */}
            <tr
              className="hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => alert('Time log form coming soon')}
            >
              <td colSpan={7} className="px-4 py-3">
                <span className="text-sm text-gray-400 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Log time…
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
