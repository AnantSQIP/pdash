'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, Archive, FolderKanban, ListTodo, Loader, RotateCcw, Shield, Trash2,
} from 'lucide-react';
import { api, type DeletedProjectRow, type DeletedTaskRow } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { Modal } from '@/components/ui/Modal';
import { toastError, toastSuccess } from '@/components/ui/Toast';
import { formatDateTimeIST } from '@/lib/date';

/**
 * Admin → Data — the bin.
 *
 * This screen exists because of a specific sentence from the owner: "for doing these kind of
 * things i need to manually delete this from database or make changes in the codebase." Two
 * operations had no route through the product at all — undoing a delete, and actually finishing
 * one — so both were being done with hand-written SQL against production: no audit trail, no
 * confirmation, and no second chance if the WHERE clause was wrong.
 *
 * The page is deliberately plain and slightly cold. Nothing here is a routine action.
 *
 * THE CONFIRMATION IS PROPORTIONATE TO THE CONSEQUENCE. There is no undo and nothing inside the
 * app to restore from, so the dialog makes you type the title. Not a checkbox, not a second
 * "are you sure" — a checkbox is muscle memory within a week, whereas typing "Reverse
 * Engineering - Malikie" requires you to have READ which row you are on. The same rule is
 * enforced on the server, because a dialog protects nobody who can call the API directly.
 */
export default function AdminDataPage() {
  const { can, isSuperAdmin, loading } = usePermissions();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'projects' | 'tasks'>('projects');
  const [target, setTarget] = useState<
    | { kind: 'project'; row: DeletedProjectRow }
    | { kind: 'task'; row: DeletedTaskRow }
    | null
  >(null);

  const mayPurge = isSuperAdmin || can(['project.delete.permanent', 'task.delete.permanent']);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-deleted'],
    queryFn: () => api.adminData.deleted(),
    // Everything on this page is put here by deletions made on OTHER screens, so the global
    // stale window would show a bin that is missing whatever you just deleted.
    refetchOnMount: 'always',
    staleTime: 10_000,
    enabled: mayPurge,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-deleted'] });

  const restore = useMutation({
    mutationFn: (t: { kind: 'project' | 'task'; id: string }) =>
      t.kind === 'project' ? api.adminData.restoreProject(t.id) : api.adminData.restoreTask(t.id),
    onSuccess: (res, t) => {
      const extra = 'tasksRestored' in res && res.tasksRestored ? ` and ${res.tasksRestored} task${res.tasksRestored === 1 ? '' : 's'}` : '';
      toastSuccess(`Restored "${res.title}"${extra}.`);
      refresh();
      // The restored row reappears in the ordinary lists, which are cached elsewhere.
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => toastError(e),
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }
  if (!mayPurge) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <Shield size={40} className="text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Access restricted</p>
        <p className="text-sm text-gray-400 mt-1">
          Permanently deleting data is reserved for Super Admins.
        </p>
      </div>
    );
  }

  const projects = data?.projects ?? [];
  const tasks = data?.tasks ?? [];

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Archive size={20} className="text-brand-600" /> Deleted Data
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Everything that has been deleted but not yet destroyed. Restore it, or remove it from the system for good.
        </p>
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {([
            ['projects', FolderKanban, 'Projects', projects.length],
            ['tasks', ListTodo, 'Tasks', tasks.length],
          ] as const).map(([key, Icon, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors',
                tab === key
                  ? 'bg-brand-50 border-brand-200 text-brand-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              <Icon size={14} /> {label}
              <span className="text-xs tabular-nums text-gray-400">{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <p>
            A permanent delete removes the record and every child row — timesheets, comments,
            attachments, history — in one go. It cannot be undone from anywhere in this app, and
            only the audit log will remember it happened.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader className="animate-spin mr-2" size={18} />Loading deleted records…
          </div>
        ) : tab === 'projects' ? (
          <ProjectTable
            rows={projects}
            onRestore={(row) => restore.mutate({ kind: 'project', id: row.id })}
            onPurge={(row) => setTarget({ kind: 'project', row })}
            busy={restore.isPending}
          />
        ) : (
          <TaskTable
            rows={tasks}
            onRestore={(row) => restore.mutate({ kind: 'task', id: row.id })}
            onPurge={(row) => setTarget({ kind: 'task', row })}
            busy={restore.isPending}
          />
        )}
      </div>

      {target && (
        <PurgeDialog
          target={target}
          onClose={() => setTarget(null)}
          onDone={() => { setTarget(null); refresh(); }}
        />
      )}
    </div>
  );
}

/* ── tables ─────────────────────────────────────────────────────────────────── */

function Actions({ onRestore, onPurge, busy }: { onRestore: () => void; onPurge: () => void; busy: boolean }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        onClick={onRestore}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
      >
        <RotateCcw size={13} /> Restore
      </button>
      <button
        onClick={onPurge}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
      >
        <Trash2 size={13} /> Delete permanently
      </button>
    </div>
  );
}

function Empty({ what }: { what: string }) {
  return (
    <tr>
      <td colSpan={5} className="px-5 py-12 text-center text-sm text-gray-400">
        Nothing deleted — no {what} are waiting here.
      </td>
    </tr>
  );
}

function ProjectTable({ rows, onRestore, onPurge, busy }: {
  rows: DeletedProjectRow[];
  onRestore: (r: DeletedProjectRow) => void;
  onPurge: (r: DeletedProjectRow) => void;
  busy: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-left text-sm min-w-[760px]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-5 py-2.5">Project</th>
            <th className="px-3 py-2.5">PID</th>
            <th className="px-3 py-2.5">Deleted</th>
            <th className="px-3 py-2.5">Would destroy</th>
            <th className="px-5 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(p => (
            <tr key={p.id} className="hover:bg-gray-50/60">
              <td className="px-5 py-3">
                <div className="font-medium text-gray-800">{p.title}</div>
                <div className="text-xs text-gray-400">{p.projectType ?? '—'}{p.technologyDomain ? ` · ${p.technologyDomain}` : ''}</div>
              </td>
              <td className="px-3 py-3 font-mono text-xs text-gray-500">{p.code ?? '—'}</td>
              <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{formatDateTimeIST(p.deletedAt)}</td>
              <td className="px-3 py-3 text-xs text-gray-500 tabular-nums">
                {p.taskCount} tasks · {p.timesheetCount} time entries · {p.memberCount} members
              </td>
              <td className="px-5 py-3"><Actions onRestore={() => onRestore(p)} onPurge={() => onPurge(p)} busy={busy} /></td>
            </tr>
          ))}
          {rows.length === 0 && <Empty what="projects" />}
        </tbody>
      </table>
    </div>
  );
}

function TaskTable({ rows, onRestore, onPurge, busy }: {
  rows: DeletedTaskRow[];
  onRestore: (r: DeletedTaskRow) => void;
  onPurge: (r: DeletedTaskRow) => void;
  busy: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-left text-sm min-w-[760px]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-5 py-2.5">Task</th>
            <th className="px-3 py-2.5">Project</th>
            <th className="px-3 py-2.5">Deleted</th>
            <th className="px-3 py-2.5">Would destroy</th>
            <th className="px-5 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(t => (
            <tr key={t.id} className="hover:bg-gray-50/60">
              <td className="px-5 py-3">
                <div className="font-medium text-gray-800">{t.title}</div>
                <div className="text-xs text-gray-400">{t.priority}</div>
              </td>
              <td className="px-3 py-3 text-gray-500">
                {t.project ? (
                  <Link href={`/projects/${t.project.id}`} className="hover:text-brand-600">
                    {t.project.code ?? t.project.title}
                  </Link>
                ) : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{formatDateTimeIST(t.deletedAt)}</td>
              <td className="px-3 py-3 text-xs text-gray-500 tabular-nums">
                {t.subtaskCount} subtasks · {t.timesheetCount} time entries · {t.assigneeCount} assignees
              </td>
              <td className="px-5 py-3"><Actions onRestore={() => onRestore(t)} onPurge={() => onPurge(t)} busy={busy} /></td>
            </tr>
          ))}
          {rows.length === 0 && <Empty what="tasks" />}
        </tbody>
      </table>
    </div>
  );
}

/* ── the dialog that makes you type it ──────────────────────────────────────── */

/**
 * Typing the title back is the whole safety mechanism, so the dialog is built around it: the
 * title is shown selectable directly above the box, the button stays disabled until the two
 * match exactly, and the consequence is stated in plain numbers rather than in the word
 * "permanent".
 */
function PurgeDialog({ target, onClose, onDone }: {
  target: { kind: 'project'; row: DeletedProjectRow } | { kind: 'task'; row: DeletedTaskRow };
  onClose: () => void;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState('');
  const title = target.row.title;
  const matches = typed.trim() === title.trim();

  const purge = useMutation({
    mutationFn: () =>
      target.kind === 'project'
        ? api.projects.deletePermanent(target.row.id, typed.trim())
        : api.tasks.deletePermanent(target.row.id, typed.trim()),
    onSuccess: (res) => {
      const rows = Object.values(res.deleted ?? {}).reduce((n, v) => n + v, 0);
      toastSuccess(`"${res.title}" destroyed — ${rows} row${rows === 1 ? '' : 's'} removed.`, {
        description: res.tasksKept ? `${res.tasksKept} shared task(s) kept — they belong to another live project.` : undefined,
      });
      onDone();
    },
    onError: (e) => toastError(e),
  });

  const consequence = target.kind === 'project'
    ? `${target.row.taskCount} task(s), ${target.row.timesheetCount} time entr(ies) and every comment, attachment and piece of history attached to them`
    : `${target.row.subtaskCount} subtask(s), ${target.row.timesheetCount} time entr(ies) and every comment, attachment and piece of history on it`;

  return (
    <Modal
      title="Delete permanently"
      subtitle="This cannot be undone from anywhere in the app."
      size="md"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => purge.mutate()}
            disabled={!matches || purge.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600"
          >
            {purge.isPending ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete permanently
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          This destroys the {target.kind} together with {consequence}. Nothing in this app can
          bring it back — only the audit log will record that it happened.
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Type the {target.kind}&apos;s title to confirm
          </label>
          <p className="mb-2 select-all rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 break-words">
            {title}
          </p>
          <input
            autoFocus
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={`Type "${title}"`}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {typed.length > 0 && !matches && (
            <p className="mt-1.5 text-xs text-amber-600">That doesn&apos;t match yet.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
