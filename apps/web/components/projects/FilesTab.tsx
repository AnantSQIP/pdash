'use client';

// Project "Files" tab — every document that belongs to the project: direct
// uploads, task attachments, and files shared in discussions (comments), with
// upload, preview/download, filtering, and permission-gated delete.

import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  UploadCloud, Search, Download, Trash2, Loader, FolderOpen, ImageIcon, MessageSquare, CheckSquare,
} from 'lucide-react';
import { api, type ProjectDocumentItem } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/Avatar';
import { fullName } from '@/lib/avatar';
import { formatBytes, isImageMime, fileKind, MAX_FILE_BYTES } from '@/lib/files';
import { KIND_ICON, KIND_COLOR } from '@/components/files/Attachments';
import { formatDate } from '@/lib/date';

type Filter = 'All' | 'Images' | 'Documents';

const SOURCE_META: Record<ProjectDocumentItem['source'], { label: string; cls: string; Icon: typeof FolderOpen }> = {
  direct:     { label: 'Direct upload', cls: 'bg-brand-50 text-brand-700',   Icon: FolderOpen },
  task:       { label: 'Task',          cls: 'bg-amber-50 text-amber-700',   Icon: CheckSquare },
  discussion: { label: 'Discussion',    cls: 'bg-purple-50 text-purple-700', Icon: MessageSquare },
};

export default function FilesTab({ projectId }: { projectId: string }) {
  const { currentUser } = useOrg();
  const { can } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');

  const { data: docs = [], isLoading, isError } = useQuery<ProjectDocumentItem[]>({
    queryKey: ['project-documents', projectId],
    queryFn: () => api.documents.listForProject(projectId),
    staleTime: 15_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['project-documents', projectId] });
    qc.invalidateQueries({ queryKey: ['activity'] });
  };

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) { toast(`"${file.name}" is larger than 20 MB.`, 'error'); continue; }
        await api.documents.upload(file, { projectId });
      }
      toast(files.length === 1 ? 'File uploaded' : `${files.length} files uploaded`, 'success');
      invalidate();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error');
      invalidate();
    } finally { setUploading(false); }
  }

  async function remove(doc: ProjectDocumentItem) {
    if (!window.confirm(`Delete "${doc.name}"? It will disappear everywhere it is shown.`)) return;
    setDeletingId(doc.id);
    try { await api.documents.delete(doc.id); invalidate(); }
    catch (err) { toast(err instanceof Error ? err.message : 'Could not delete the file', 'error'); }
    finally { setDeletingId(null); }
  }

  const canDeleteAny = can('document.delete');
  const canUpload = can('document.create');

  const filtered = useMemo(() => docs.filter(d => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'Images') return isImageMime(d.mimeType);
    if (filter === 'Documents') return !isImageMime(d.mimeType);
    return true;
  }), [docs, filter, search]);

  const images = filtered.filter(d => isImageMime(d.mimeType));
  const files = filtered.filter(d => !isImageMime(d.mimeType));
  const totalBytes = docs.reduce((s, d) => s + (d.fileSize ?? 0), 0);
  const contributors = new Set(docs.map(d => d.uploadedBy)).size;

  return (
    <div className="flex flex-col min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 -mx-6 mb-4 px-6 py-3 bg-white border-b border-gray-200 sticky top-0 z-10 flex-wrap">
        {canUpload && (
          <>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={onPick} />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 shrink-0"
            >
              {uploading ? <Loader size={14} className="animate-spin" /> : <UploadCloud size={14} />}
              {uploading ? 'Uploading…' : 'Upload Files'}
            </button>
          </>
        )}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files…"
            className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 w-44"
          />
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {(['All', 'Images', 'Documents'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx('px-3 py-1 text-xs font-medium rounded-full transition-colors',
                filter === f ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {[
          { label: 'Total Files', value: docs.length, color: 'text-gray-700', bg: 'bg-gray-50' },
          { label: 'Storage Used', value: formatBytes(totalBytes), color: 'text-brand-700', bg: 'bg-brand-50' },
          { label: 'Contributors', value: contributors, color: 'text-purple-700', bg: 'bg-purple-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={clsx('rounded-xl border border-gray-200 p-4', bg)}>
            <p className={clsx('text-2xl font-bold', color)}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
          <Loader size={20} className="animate-spin mr-2" /><span className="text-sm">Loading files…</span>
        </div>
      )}
      {isError && (
        <div className="py-12 text-center text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
          Could not load files. Check API connection.
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200 text-gray-400">
          <FolderOpen size={36} className="mb-3 opacity-25" />
          <p className="text-sm font-medium">{docs.length === 0 ? 'No files yet' : 'No files match your filter'}</p>
          <p className="text-xs mt-1">
            {docs.length === 0
              ? 'Upload documents here, or attach files in tasks and discussions — they all appear in this tab.'
              : 'Try a different filter or search term.'}
          </p>
        </div>
      )}

      {/* Media grid */}
      {!isLoading && !isError && images.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
            <ImageIcon size={13} /> Media ({images.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {images.map(d => {
              const mayDelete = d.uploadedBy === currentUser?.id || canDeleteAny;
              return (
                <div key={d.id} className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <a href={d.fileUrl} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.fileUrl} alt={d.name} loading="lazy" className="h-32 w-full object-cover group-hover:brightness-95 transition" />
                  </a>
                  <div className="px-2.5 py-2">
                    <p className="text-xs font-medium text-gray-800 truncate" title={d.name}>{d.name}</p>
                    <p className="text-[10px] text-gray-400">{formatBytes(d.fileSize)} · {d.uploader ? fullName(d.uploader) : '—'}</p>
                  </div>
                  {mayDelete && (
                    <button
                      onClick={() => remove(d)}
                      disabled={deletingId === d.id}
                      title="Delete file"
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-white/90 text-gray-400 hover:text-red-500 shadow opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
                    >
                      {deletingId === d.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Files table */}
      {!isLoading && !isError && files.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Name', 'Size', 'Uploaded by', 'Source', 'Date', ''].map((h, i) => (
                    <th key={i} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {files.map(d => {
                  const kind = fileKind(d.mimeType, d.name);
                  const Icon = KIND_ICON[kind];
                  const src = SOURCE_META[d.source] ?? SOURCE_META.direct;
                  const mayDelete = d.uploadedBy === currentUser?.id || canDeleteAny;
                  return (
                    <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 max-w-xs">
                        <a href={d.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 group">
                          <Icon size={17} className={clsx('shrink-0', KIND_COLOR[kind])} />
                          <span className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-600">{d.name}</span>
                        </a>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatBytes(d.fileSize)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar user={d.uploader} size={24} className="shrink-0" />
                          <span className="text-xs text-gray-600 whitespace-nowrap">{d.uploader ? fullName(d.uploader) : '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', src.cls)}
                          title={d.source === 'task' && d.task ? `Task: ${d.task.title}` : undefined}>
                          <src.Icon size={11} />
                          {d.source === 'task' && d.task ? d.task.title.slice(0, 24) + (d.task.title.length > 24 ? '…' : '') : src.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(d.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <a href={d.fileUrl} target="_blank" rel="noreferrer" title="Download"
                            className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                            <Download size={13} />
                          </a>
                          {mayDelete && (
                            <button
                              onClick={() => remove(d)}
                              disabled={deletingId === d.id}
                              title="Delete"
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                            >
                              {deletingId === d.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
