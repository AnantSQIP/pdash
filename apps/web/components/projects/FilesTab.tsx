'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Upload, Search, Grid, List, Download, Trash2, FileText, File } from 'lucide-react';
import { Avatar } from '@/components/Avatar';

type MockFile = {
  id: string;
  name: string;
  size: string;
  type: 'pdf' | 'fig' | 'sketch' | 'docx';
  uploadedBy: string;
  uploadedAt: string;
  version: number;
};

const MOCK_FILES: MockFile[] = [
  { id: 'f1', name: 'Design Brief.pdf',          size: '2.4 MB',  type: 'pdf',    uploadedBy: 'SA', uploadedAt: '2026-06-10', version: 1 },
  { id: 'f2', name: 'Wireframes_v2.fig',          size: '8.1 MB',  type: 'fig',    uploadedBy: 'CP', uploadedAt: '2026-06-18', version: 2 },
  { id: 'f3', name: 'Component_Library.sketch',   size: '12.3 MB', type: 'sketch', uploadedBy: 'CP', uploadedAt: '2026-06-22', version: 1 },
  { id: 'f4', name: 'Technical_Spec.docx',        size: '340 KB',  type: 'docx',   uploadedBy: 'BT', uploadedAt: '2026-06-25', version: 3 },
  { id: 'f5', name: 'Brand_Guidelines.pdf',       size: '5.7 MB',  type: 'pdf',    uploadedBy: 'SA', uploadedAt: '2026-06-28', version: 1 },
];

const TYPE_CONFIG: Record<MockFile['type'], { label: string; bgColor: string; textColor: string; dotColor: string }> = {
  pdf:    { label: 'PDF',    bgColor: 'bg-red-50',    textColor: 'text-red-600',    dotColor: 'bg-red-500' },
  fig:    { label: 'FIG',    bgColor: 'bg-purple-50', textColor: 'text-purple-600', dotColor: 'bg-purple-500' },
  sketch: { label: 'SKETCH', bgColor: 'bg-orange-50', textColor: 'text-orange-600', dotColor: 'bg-orange-500' },
  docx:   { label: 'DOCX',   bgColor: 'bg-blue-50',   textColor: 'text-blue-600',   dotColor: 'bg-blue-500' },
};

function FileTypeIcon({ type, large }: { type: MockFile['type']; large?: boolean }) {
  const cfg = TYPE_CONFIG[type];
  return (
    <div
      className={clsx(
        'rounded-xl flex items-center justify-center shrink-0',
        cfg.bgColor,
        large ? 'w-14 h-14' : 'w-9 h-9'
      )}
    >
      <span className={clsx('font-bold', cfg.textColor, large ? 'text-sm' : 'text-xs')}>
        {cfg.label}
      </span>
    </div>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <File className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-800 mb-1">No files uploaded yet</h3>
      <p className="text-sm text-gray-500 mb-5">Attach documents, designs, or specs to keep your project organized.</p>
      <button
        onClick={onUpload}
        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
      >
        <Upload className="w-4 h-4" />
        Upload your first file
      </button>
    </div>
  );
}

function GridCard({ file }: { file: MockFile }) {
  return (
    <div className="group relative bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-gray-300 transition-all flex flex-col gap-3">
      {/* Hover actions */}
      <div className="absolute top-3 right-3 hidden group-hover:flex items-center gap-1.5">
        <button
          className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-700 shadow-sm transition-colors"
          title="Download"
          onClick={() => alert('Download coming soon')}
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-red-50 text-gray-500 hover:text-red-600 shadow-sm transition-colors"
          title="Delete"
          onClick={() => alert('Delete coming soon')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Icon */}
      <FileTypeIcon type={file.type} large />

      {/* Name + size */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate" title={file.name}>{file.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{file.size}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Avatar user={{ firstName: file.uploadedBy }} size={24} />
          <span className="text-xs text-gray-500">{file.uploadedAt}</span>
        </div>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          v{file.version}
        </span>
      </div>
    </div>
  );
}

function ListRow({ file }: { file: MockFile }) {
  return (
    <tr className="group hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <FileTypeIcon type={file.type} />
          <span className="text-sm font-medium text-gray-900 truncate max-w-xs" title={file.name}>{file.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{file.size}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          v{file.version}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Avatar user={{ firstName: file.uploadedBy }} size={24} />
          <span className="text-sm text-gray-600">{file.uploadedBy}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{file.uploadedAt}</td>
      <td className="px-4 py-3">
        <div className="hidden group-hover:flex items-center gap-1.5">
          <button
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="Download"
            onClick={() => alert('Download coming soon')}
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete"
            onClick={() => alert('Delete coming soon')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function FilesTab() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');

  const filtered = MOCK_FILES.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleUpload() {
    alert('File upload coming soon');
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
        <button
          onClick={handleUpload}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0"
        >
          <Upload className="w-4 h-4" />
          Upload File
        </button>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        {/* View toggle */}
        <div className="ml-auto flex items-center rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={clsx(
              'p-2 transition-colors',
              viewMode === 'grid' ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            )}
            title="Grid view"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={clsx(
              'p-2 transition-colors border-l border-gray-200',
              viewMode === 'list' ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            )}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        {filtered.length === 0 ? (
          <EmptyState onUpload={handleUpload} />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((file) => (
              <GridCard key={file.id} file={file} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Size</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Version</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploaded By</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((file) => (
                  <ListRow key={file.id} file={file} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="shrink-0 border-t border-gray-200 px-5 py-2 bg-gray-50 flex items-center gap-2">
        <FileText className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs text-gray-500">{filtered.length} file{filtered.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
