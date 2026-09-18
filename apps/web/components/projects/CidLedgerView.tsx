'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import clsx from 'clsx';
import { Loader, Download, ChevronRight, ChevronDown, Search, RotateCcw, ExternalLink, History, ArrowRight } from 'lucide-react';
import {
  api, type CidLedgerEntry, type CidLedgerEvent, type CidLedgerStatus, type CidEventType,
} from '@/lib/api';
import { formatDate, formatDateIST, formatDateTimeIST, todayIST } from '@/lib/date';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { projectTypeLabel } from '@/lib/mock-data';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

/**
 * The status a CID row shows. Derived server-side from the CID registry and the clients under it:
 * a number whose client was deleted, merged away or permanently deleted stays in the ledger — it
 * is never issued again, so the ledger is the one place that can say what it was.
 */
export const STATUS_META: Record<CidLedgerStatus, { label: string; cls: string; hint: string }> = {
  ACTIVE:    { label: 'Active',    cls: 'bg-brand-100 text-brand-700',   hint: 'A live client carries this CID' },
  ON_HOLD:   { label: 'On hold',   cls: 'bg-amber-100 text-amber-700',   hint: 'Its client is on hold' },
  COMPLETED: { label: 'Completed', cls: 'bg-green-100 text-green-700',   hint: 'Its client is complete' },
  DELETED:   { label: 'Deleted',   cls: 'bg-orange-100 text-orange-700', hint: 'Its client is in Admin → Data; the number stays reserved to it' },
  MERGED:    { label: 'Merged',    cls: 'bg-purple-100 text-purple-700', hint: 'Its client moved under another CID; this number is retired' },
  PURGED:    { label: 'Purged',    cls: 'bg-red-100 text-red-700',       hint: 'Its client was permanently deleted; this number is retired' },
  RETIRED:   { label: 'Retired',   cls: 'bg-gray-200 text-gray-600',     hint: 'Its client moved to a new CID; this number is retired' },
};

type FilterKey = 'ALL' | CidLedgerStatus;
const FILTERS: FilterKey[] = ['ALL', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'DELETED', 'MERGED', 'PURGED', 'RETIRED'];

/** Colour of each event kind on the timeline. */
const EVENT_TONE: Record<CidEventType, string> = {
  MINTED: 'bg-brand-500', BACKFILLED: 'bg-brand-400', IMPORTED: 'bg-brand-300', ROUND_ADDED: 'bg-brand-400',
  RENAMED: 'bg-sky-500', CLIENT_GROUP_CHANGED: 'bg-sky-400', MANAGER_CHANGED: 'bg-sky-400', PHASE_CHANGED: 'bg-sky-300',
  DELETED: 'bg-orange-500', RESTORED: 'bg-green-500', COMPLETED: 'bg-green-600', REOPENED: 'bg-green-400',
  REINITIALIZED: 'bg-green-400', REASSIGNED: 'bg-purple-500', SPLIT: 'bg-purple-500', MERGED: 'bg-purple-600',
  PURGED: 'bg-red-600',
};

const statusLabel = (s: CidLedgerStatus) => STATUS_META[s]?.label ?? s;
const displayStatus = (r: CidLedgerEntry) =>
  r.status === 'MERGED' && r.mergedIntoCid ? `Merged → ${r.mergedIntoCid}` : statusLabel(r.status);

const names = (v: unknown): string => {
  if (!Array.isArray(v)) return '';
  return v.map(x => (typeof x === 'string' ? x : (x as { name?: string })?.name ?? '')).filter(Boolean).join(', ');
};
const phaseWord = (p: unknown) => typeof p === 'string'
  ? p.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) : '';

/** One line saying what an event changed, from → to. */
export function describeEvent(e: CidLedgerEvent): string {
  const m = (e.metadata ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case 'MINTED':
      return e.fromCid
        ? `Issued ${e.toCid ?? e.cid} to “${e.clientTitle ?? ''}” (its old CID ${e.fromCid} had been retired)`
        : `Issued ${e.toCid ?? e.cid} to new client “${e.clientTitle ?? ''}”`;
    case 'BACKFILLED': return `Issued ${e.cid} to existing client “${e.clientTitle ?? ''}” when CIDs became automatic`;
    case 'IMPORTED': return `${e.cid} existed before the ledger (client “${e.clientTitle ?? '—'}”)`;
    case 'ROUND_ADDED': return `Client “${e.clientTitle ?? ''}” added under ${e.cid}`;
    case 'RENAMED': return `Renamed “${e.fromTitle ?? ''}” → “${e.toTitle ?? ''}”`;
    case 'CLIENT_GROUP_CHANGED':
      return `Client group ${m.fromGroup ? `“${m.fromGroup}”` : 'none'} → ${m.toGroup ? `“${m.toGroup}”` : 'none'}${m.reason ? ` (${m.reason})` : ''}`;
    case 'MANAGER_CHANGED': return `Manager ${names(m.from) || 'none'} → ${names(m.to) || 'none'}`;
    case 'PHASE_CHANGED': return `Phase ${phaseWord(m.from)} → ${phaseWord(m.to)}`;
    case 'DELETED': return `“${e.clientTitle ?? ''}” deleted (was ${phaseWord(m.phaseBefore) || 'active'}); the CID stays reserved`;
    case 'RESTORED':
      return e.fromCid && e.fromCid !== e.toCid
        ? `“${e.clientTitle ?? ''}” restored under ${e.toCid} (its old CID ${e.fromCid} had been retired)`
        : `“${e.clientTitle ?? ''}” restored (${phaseWord(m.phaseRestored) || 'Active'})`;
    case 'COMPLETED': return `“${e.clientTitle ?? ''}” marked complete`;
    case 'REOPENED': return `“${e.clientTitle ?? ''}” reopened`;
    case 'REINITIALIZED': return `“${e.clientTitle ?? ''}” re-initialized for a returning engagement`;
    case 'REASSIGNED': return `“${e.clientTitle ?? ''}” moved ${e.fromCid} → ${e.toCid} (new CID)`;
    case 'SPLIT': return `“${e.clientTitle ?? ''}” split off ${e.fromCid} onto ${e.toCid}`;
    case 'MERGED': return `“${e.clientTitle ?? ''}” merged ${e.fromCid} → ${e.toCid}`;
    case 'PURGED': return `“${e.clientTitle ?? ''}” permanently deleted — ${m.loggedHours ?? 0}h logged; the CID is retired`;
    default: return e.label;
  }
}

/** Quote a CSV cell (wrap in quotes, escape embedded quotes) so commas/newlines are safe. */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}
function download(name: string, rows: unknown[][]) {
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM → Excel opens UTF-8 cleanly
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** The columns of the CIDs CSV. Exported so a test can pin them. */
export const CID_CSV_HEADER = [
  'CID', 'Status', 'Merged into', 'Client', 'Past names', 'Client group', 'Manager',
  'Created by', 'Created', 'Clients under CID', 'Live clients', 'Task groups',
  'Allotted hours', 'Logged hours', 'Events', 'Last change',
];
/** The columns of the events CSV. */
export const CID_EVENTS_CSV_HEADER = [
  'CID', 'When', 'Event', 'Client', 'From CID', 'To CID', 'From name', 'To name', 'By', 'What changed', 'Details',
];

/** One row per CID — the register itself. */
function exportCids(rows: CidLedgerEntry[]) {
  download(`cid-ledger-${todayIST()}.csv`, [
    CID_CSV_HEADER,
    ...rows.map(r => [
      r.cid, displayStatus(r), r.mergedIntoCid ?? '', r.clientName ?? '', r.pastNames.join('; '),
      r.clientGroup ?? '', r.managers.join('; '),
      r.createdBy ?? '', formatDateTimeIST(r.createdAt), r.roundCount, r.liveRoundCount, r.taskGroupCount,
      r.totalAllottedHours, r.totalLoggedHours, r.events.length, formatDateTimeIST(r.lastEventAt),
    ]),
  ]);
}

/** One row per event — the full history, every CID, oldest first. A move appears once. */
function exportEvents(rows: CidLedgerEntry[]) {
  const seen = new Set<string>();
  const events = rows.flatMap(r => r.events).filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  download(`cid-ledger-events-${todayIST()}.csv`, [
    CID_EVENTS_CSV_HEADER,
    ...events.map(e => [
      e.cid, formatDateTimeIST(e.at), e.label, e.clientTitle ?? '', e.fromCid ?? '', e.toCid ?? '',
      e.fromTitle ?? '', e.toTitle ?? '', e.actorName, describeEvent(e), e.metadata ? JSON.stringify(e.metadata) : '',
    ]),
  ]);
}

/**
 * The CID ledger — every CID the organisation has ever issued, one row each, with the client(s)
 * under it, the hours, and the full stored timeline of what happened (who, when, what changed).
 * Deleted, merged, retired and permanently deleted clients stay visible. Data is gated server-side
 * on user.manage_access.
 */
export function CidLedgerView() {
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [reinitId, setReinitId] = useState('');
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { toast } = useToast();
  const canReinit = can('project.update');

  async function reinitialize(projectId: string, title: string, cid: string) {
    if (!await confirmDialog(`Re-initialize "${title}"?\n\nIt goes back to Active with the SAME CID (${cid}) and all its existing data.`)) return;
    setReinitId(projectId);
    try {
      await api.projects.reinitialize(projectId);
      qc.invalidateQueries({ queryKey: ['cid-ledger'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast(`"${title}" is active again — same CID.`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not re-initialize the client.', 'error');
    } finally { setReinitId(''); }
  }

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['cid-ledger'],
    // Every row here changes because of something done on another screen.
    refetchOnMount: 'always',
    queryFn: () => api.projects.cidLedger(),
    staleTime: 15_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter !== 'ALL' && r.status !== filter) return false;
      if (q) {
        // CID, the client's name, every name it has had, the CID it merged into, and the domains.
        const domains = r.rounds.map(rd => rd.domainLabel ?? rd.domain ?? '').join(' ');
        const hay = [r.cid, r.clientName ?? '', ...r.pastNames, r.mergedIntoCid ?? '', r.clientGroup ?? '', domains]
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map(f => [f, 0])) as Record<FilterKey, number>;
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    c.ALL = rows.length;
    return c;
  }, [rows]);

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <p className="text-sm text-gray-500">
          {counts.ACTIVE} active · {counts.COMPLETED} completed · {counts.DELETED} deleted · {counts.MERGED + counts.RETIRED + counts.PURGED} retired · {counts.ALL} issued
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search CID, client or past name…"
              aria-label="Search the CID ledger"
              className="w-56 pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400"
            />
          </div>
          <button
            onClick={() => exportCids(filtered)}
            disabled={filtered.length === 0}
            title="One row per CID in the current view (opens in Excel)"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Download size={14} /> CIDs CSV
          </button>
          <button
            onClick={() => exportEvents(filtered)}
            disabled={filtered.length === 0}
            title="Every event on the CIDs in the current view, oldest first"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <History size={14} /> Events CSV
          </button>
        </div>
      </div>

      <div className="pt-4 shrink-0 flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            title={f === 'ALL' ? 'Every CID ever issued' : STATUS_META[f].hint}
            className={clsx('px-3 py-1 text-xs font-medium rounded-full transition-colors',
              filter === f ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {f === 'ALL' ? 'All' : STATUS_META[f].label}{counts[f] > 0 ? ` (${counts[f]})` : ''}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-gray-400">Click a row for its clients and full history</span>
      </div>

      <div className="py-4 overflow-auto">
        {isLoading && <p className="text-sm text-gray-400 flex items-center gap-2 py-8 justify-center"><Loader size={14} className="animate-spin" /> Loading…</p>}
        {!isLoading && isError && (
          <div className="text-sm text-gray-500 text-center py-8">
            <p className="text-red-500">Couldn’t load the CID ledger.</p>
            <button onClick={() => refetch()} className="mt-2 text-brand-600 hover:underline">Retry</button>
          </div>
        )}
        {!isLoading && !isError && (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['', 'CID', 'Status', 'Client', 'Group', 'Manager', 'Clients', 'Task groups', 'Logged / allotted', 'Created'].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-gray-400">
                    {search.trim() ? `No CIDs match “${search.trim()}”.` : 'No CIDs in this view yet.'}
                  </td></tr>
                )}
                {filtered.map(r => {
                  const meta = STATUS_META[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-500', hint: '' };
                  const open = openId === r.id;
                  const head = [...r.rounds].reverse().find(rd => !rd.deleted) ?? null;
                  return (
                    <Fragment key={r.id}>
                      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpenId(open ? null : r.id)}>
                        <td className="px-3 py-2.5 text-gray-400">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td className="px-3 py-2.5 text-xs font-mono font-medium text-gray-800 whitespace-nowrap">{r.cid}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span title={meta.hint} className={clsx('inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium', meta.cls)}>{meta.label}</span>
                          {r.status === 'MERGED' && r.mergedIntoCid && (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] font-mono text-purple-700">
                              <ArrowRight size={11} /> {r.mergedIntoCid}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-gray-700 max-w-[220px]">
                          <span className={clsx('block truncate', r.status !== 'ACTIVE' && r.status !== 'ON_HOLD' && r.status !== 'COMPLETED' && 'text-gray-500')}
                            title={r.pastNames.length ? `Also recorded under this CID: ${r.pastNames.join(', ')}` : (r.clientName ?? '')}>
                            {r.clientName ?? '—'}
                          </span>
                          {r.pastNames.length > 0 && <span className="block text-[10px] text-gray-400 truncate">also {r.pastNames.join(', ')}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{r.clientGroup ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{r.managers.length ? r.managers.join(', ') : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap tabular-nums">
                          {r.roundCount > 1 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100 font-semibold">{r.roundCount}</span>
                          ) : <span className="text-gray-500">{r.roundCount}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 tabular-nums">{r.taskGroupCount}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap tabular-nums">
                          {r.totalLoggedHours}h <span className="text-gray-400">/ {r.totalAllottedHours ? `${r.totalAllottedHours}h` : '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                          {formatDateTimeIST(r.createdAt)}
                          <span className="block text-[10px] text-gray-400">{r.createdBy ?? '—'}</span>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-gray-50/60">
                          <td />
                          <td colSpan={9} className="px-3 py-3">
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                              <div className="space-y-3 min-w-0">
                                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                  {r.roundCount === 1 ? 'Client' : `Clients under ${r.cid}`}
                                </h4>
                                {r.rounds.length === 0 && <p className="text-xs text-gray-400">No client carries this CID any more.</p>}
                                {r.rounds.map(rd => (
                                  <div key={rd.id} className={clsx('rounded-lg border p-3 text-xs', rd.purged ? 'border-red-100 bg-red-50/40' : rd.deleted ? 'border-orange-100 bg-orange-50/40' : 'border-gray-200 bg-white')}>
                                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        {r.roundCount > 1 && rd.round != null && (
                                          <span className="text-[10px] font-bold text-white bg-brand-500 rounded px-1.5 py-0.5 shrink-0">{rd.round}</span>
                                        )}
                                        {rd.deleted ? (
                                          <span className="text-sm font-semibold text-gray-700 truncate">{rd.title}</span>
                                        ) : (
                                          <Link href={`/projects/${rd.id}`} onClick={e => e.stopPropagation()}
                                            className="text-sm font-semibold text-gray-900 hover:text-brand-600 hover:underline inline-flex items-center gap-1 truncate">
                                            {rd.title}<ExternalLink size={11} className="text-gray-300 shrink-0" />
                                          </Link>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {rd.purged && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Permanently deleted{rd.purgedAt ? ` ${formatDate(rd.purgedAt)}` : ''}</span>}
                                        {rd.deleted && !rd.purged && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Deleted{rd.deletedAt ? ` ${formatDate(rd.deletedAt)}` : ''}</span>}
                                        {!rd.deleted && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{phaseWord(rd.phase)}</span>}
                                        {rd.type && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{projectTypeLabel(rd.type)}</span>}
                                        {rd.domainLabel && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">{rd.domainLabel}</span>}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
                                      <div><span className="text-gray-400">Group</span><p className="text-gray-800">{rd.clientGroup ?? '—'}</p></div>
                                      <div><span className="text-gray-400">Manager</span><p className="text-gray-800">{rd.managers.length ? rd.managers.join(', ') : '—'}</p></div>
                                      <div><span className="text-gray-400">Task groups</span><p className="text-gray-800">{rd.taskGroupCount}</p></div>
                                      <div>
                                        <span className="text-gray-400">Logged / allotted</span>
                                        <p className="text-gray-800">{rd.loggedHours}h / {rd.allottedHours ? `${rd.allottedHours}h` : <span className="text-gray-400 text-[11px]">no estimates</span>}</p>
                                      </div>
                                      <div><span className="text-gray-400">Start</span><p className="text-gray-800">{rd.startDate ? formatDate(rd.startDate) : '—'}</p></div>
                                      <div><span className="text-gray-400">Deadline</span><p className="text-gray-800">{rd.dueDate ? formatDate(rd.dueDate) : '—'}</p></div>
                                      <div><span className="text-gray-400">Delivered</span><p className="text-gray-800">{rd.clientDeliveryDate ? formatDateIST(rd.clientDeliveryDate) : '—'}</p></div>
                                      <div><span className="text-gray-400">Created</span><p className="text-gray-800">{rd.createdAt ? formatDate(rd.createdAt) : '—'}{rd.createdBy ? ` · ${rd.createdBy}` : ''}</p></div>
                                    </div>
                                  </div>
                                ))}
                                <div className="flex items-center gap-2 flex-wrap pt-1">
                                  {head && (
                                    <Link href={`/projects/${head.id}`} onClick={e => e.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-xs font-medium">
                                      <ExternalLink size={13} /> Open client
                                    </Link>
                                  )}
                                  {canReinit && r.status === 'COMPLETED' && head && (
                                    <button
                                      onClick={e => { e.stopPropagation(); reinitialize(head.id, head.title, r.cid); }}
                                      disabled={reinitId === head.id}
                                      title={`Reopen this client under ${r.cid} — nothing is re-entered`}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-xs font-medium disabled:opacity-50">
                                      {reinitId === head.id ? <Loader size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                                      Re-initialize
                                    </button>
                                  )}
                                  {r.status === 'DELETED' && (
                                    <span className="text-[11px] text-gray-500">Restore the client from Admin → Data to bring it back under {r.cid}.</span>
                                  )}
                                </div>
                              </div>

                              <div className="min-w-0">
                                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">History</h4>
                                <ol className="relative border-l border-gray-200 ml-1.5 space-y-2.5">
                                  {[...r.events].reverse().map(e => (
                                    <li key={e.id} className="pl-3.5 relative">
                                      <span className={clsx('absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white', EVENT_TONE[e.type] ?? 'bg-gray-400')} />
                                      <p className="text-xs text-gray-800">
                                        <span className="font-semibold">{e.label}</span>
                                        {e.cid !== r.cid && <span className="font-mono text-[10px] text-gray-400"> · {e.cid}</span>}
                                      </p>
                                      <p className="text-xs text-gray-600">{describeEvent(e)}</p>
                                      <p className="text-[10px] text-gray-400">{formatDateTimeIST(e.at)} · {e.actorName}</p>
                                    </li>
                                  ))}
                                  {r.events.length === 0 && <li className="pl-3.5 text-xs text-gray-400">No recorded events.</li>}
                                </ol>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
