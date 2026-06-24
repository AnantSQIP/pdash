'use client';

import { useState } from 'react';
import {
  X, Flag, Calendar, Pencil, Maximize2, CheckSquare, MessageCircle,
  Clock, Plus, RefreshCw, User, FileText,
} from 'lucide-react';
import clsx from 'clsx';

type TaskItem = {
  id: string;
  title: string;
  status: string;
  statusColor: string;
  priority: string;
  assignee: string;
  assigneeColor: string;
  dueDate: string;
  description?: string;
};

type ChecklistItem = { id: string; text: string; done: boolean };
type Subtask = { id: string; title: string; done: boolean; assignee: string };
type Comment = { id: string; author: string; initials: string; color: string; time: string; text: string };

type PanelTab = 'details' | 'subtasks' | 'comments' | 'activity';

const PRIORITY_FLAG_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-blue-500',
  LOW: 'text-gray-400',
};

const ACTIVITY_ICON_MAP: Record<string, React.ReactNode> = {
  plus: <Plus size={14} />,
  user: <User size={14} />,
  refresh: <RefreshCw size={14} />,
  flag: <Flag size={14} />,
  comment: <MessageCircle size={14} />,
};

const ACTIVITY_ITEMS = [
  { icon: 'plus', color: 'bg-green-100 text-green-600', text: 'Task created by Anant Gupta', time: '3 days ago' },
  { icon: 'user', color: 'bg-blue-100 text-blue-600', text: 'Alice Kim was assigned', time: '3 days ago' },
  { icon: 'refresh', color: 'bg-orange-100 text-orange-600', text: 'Status changed: Open → In Progress', time: '2 days ago' },
  { icon: 'flag', color: 'bg-red-100 text-red-600', text: 'Priority changed: MEDIUM → HIGH', time: '1 day ago' },
  { icon: 'comment', color: 'bg-purple-100 text-purple-600', text: 'Bob Taylor left a comment', time: '1 day ago' },
];

export function TaskDetailPanel({ task, onClose }: { task: TaskItem | null; onClose: () => void }) {
  // Header state
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task?.title ?? '');

  // Panel tab
  const [panelTab, setPanelTab] = useState<PanelTab>('details');

  // Details tab state
  const [desc, setDesc] = useState(task?.description ?? '');
  const [editDesc, setEditDesc] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { id: 'c1', text: 'Review design specs', done: true },
    { id: 'c2', text: 'Write unit tests', done: false },
    { id: 'c3', text: 'Update documentation', done: false },
  ]);
  const [newItem, setNewItem] = useState('');
  const [tags, setTags] = useState(['frontend', 'design']);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // Subtasks tab state
  const [subtasks, setSubtasks] = useState<Subtask[]>([
    { id: 's1', title: 'Create low-fi wireframe', done: true, assignee: 'CP' },
    { id: 's2', title: 'Review with stakeholders', done: false, assignee: 'AK' },
    { id: 's3', title: 'Finalize high-fi mockup', done: false, assignee: 'CP' },
  ]);
  const [newSub, setNewSub] = useState('');

  // Comments tab state
  const [comments, setComments] = useState<Comment[]>([
    { id: 'cm1', author: 'Alice Kim', initials: 'AK', color: 'bg-purple-500', time: '2h ago', text: 'Can we prioritize this before the milestone deadline?' },
    { id: 'cm2', author: 'Bob Taylor', initials: 'BT', color: 'bg-blue-500', time: '1d ago', text: 'Already on it — targeting Thursday delivery.' },
  ]);
  const [newComment, setNewComment] = useState('');

  // Footer state
  const [isComplete, setIsComplete] = useState(task?.status === 'Closed');

  if (!task) return null;

  const formattedDue = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  const flagColor = PRIORITY_FLAG_COLOR[task.priority] ?? 'text-gray-400';
  const priorityLabel = task.priority.charAt(0) + task.priority.slice(1).toLowerCase();

  // Checklist helpers
  const doneCount = checklistItems.filter((i) => i.done).length;
  const totalCount = checklistItems.length;
  const donePercent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  function toggleChecklist(id: string) {
    setChecklistItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }
  function removeChecklist(id: string) {
    setChecklistItems((prev) => prev.filter((i) => i.id !== id));
  }
  function addChecklistItem() {
    const text = newItem.trim();
    if (!text) return;
    setChecklistItems((prev) => [...prev, { id: `c${Date.now()}`, text, done: false }]);
    setNewItem('');
  }

  // Tag helpers
  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }
  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput('');
    setShowTagInput(false);
  }

  // Subtask helpers
  const subDone = subtasks.filter((s) => s.done).length;
  const subTotal = subtasks.length;
  const subPercent = subTotal > 0 ? (subDone / subTotal) * 100 : 0;

  function toggleSubtask(id: string) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }
  function addSubtask() {
    const t = newSub.trim();
    if (!t) return;
    setSubtasks((prev) => [...prev, { id: `s${Date.now()}`, title: t, done: false, assignee: 'SA' }]);
    setNewSub('');
  }

  // Comment helpers
  function postComment() {
    const text = newComment.trim();
    if (!text) return;
    setComments((prev) => [
      ...prev,
      { id: `cm${Date.now()}`, author: 'Anant Gupta', initials: 'AN', color: 'bg-brand-600', time: 'just now', text },
    ]);
    setNewComment('');
  }

  const TABS: { key: PanelTab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'subtasks', label: 'Subtasks' },
    { key: 'comments', label: 'Comments' },
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col">

        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-gray-200 px-6 py-4">
          {/* Row 1: status badge + actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: task.statusColor }}
              />
              <span className="text-sm text-gray-600">{task.status}</span>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors">
                <Pencil size={15} />
              </button>
              <button className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors">
                <Maximize2 size={15} />
              </button>
              <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Row 2: editable title */}
          <div className="mt-2">
            {editingTitle ? (
              <input
                autoFocus
                className="w-full text-xl font-bold text-gray-900 border border-blue-300 rounded-md px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingTitle(false); }}
              />
            ) : (
              <h2
                className="text-xl font-bold text-gray-900 cursor-pointer hover:bg-gray-50 rounded-md px-2 py-0.5 -mx-2"
                onClick={() => setEditingTitle(true)}
              >
                {title}
              </h2>
            )}
          </div>

          {/* Row 3: priority + assignee + due date */}
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            {/* Priority badge */}
            <div className={clsx('flex items-center gap-1 text-sm font-medium', flagColor)}>
              <Flag size={13} />
              {priorityLabel}
            </div>
            {/* Assignee */}
            <div className="flex items-center gap-1.5">
              <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0', task.assigneeColor)}>
                {task.assignee.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-sm text-gray-600">{task.assignee}</span>
            </div>
            {/* Due date */}
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <Calendar size={13} />
              {formattedDue}
            </div>
          </div>
        </div>

        {/* ── BODY ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Tab bar */}
          <div className="sticky top-0 bg-white border-b flex gap-0 px-6 z-10">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPanelTab(key)}
                className={clsx(
                  'px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors',
                  panelTab === key
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── DETAILS TAB ─────────────────────────────────────── */}
          {panelTab === 'details' && (
            <div className="px-6 py-5 space-y-5">

              {/* 1. Description */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Description</p>
                {editDesc ? (
                  <textarea
                    autoFocus
                    rows={4}
                    className="w-full text-sm border border-brand-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 resize-none"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    onBlur={() => setEditDesc(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditDesc(false); } }}
                  />
                ) : (
                  <div
                    className="min-h-[60px] text-sm rounded-lg p-3 cursor-pointer hover:bg-gray-50 border border-dashed border-transparent hover:border-gray-200 transition-colors"
                    onClick={() => setEditDesc(true)}
                  >
                    {desc ? (
                      <span className="text-gray-700 whitespace-pre-wrap">{desc}</span>
                    ) : (
                      <span className="italic text-gray-400">Click to add description...</span>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Details grid */}
              <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4 border border-gray-100 text-sm">
                {[
                  { label: 'Status', value: task.status },
                  { label: 'Priority', value: priorityLabel },
                  { label: 'Assignee', value: task.assignee },
                  { label: 'Due Date', value: formattedDue },
                  { label: 'Start Date', value: 'Not set' },
                  { label: 'Est. Hours', value: 'Not set' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
                    <p className="text-gray-700 font-medium">{value}</p>
                  </div>
                ))}
              </div>

              {/* 3. Checklist */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Checklist</p>
                  <span className="text-xs text-gray-400">{doneCount} / {totalCount}</span>
                  <div className="w-20 h-1 bg-gray-200 rounded overflow-hidden ml-1">
                    <div
                      className="h-full bg-brand-600 rounded transition-all"
                      style={{ width: `${donePercent}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-0.5">
                  {checklistItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 py-1.5 group">
                      <button
                        onClick={() => toggleChecklist(item.id)}
                        className={clsx(
                          'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                          item.done ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-gray-400',
                        )}
                      >
                        {item.done && (
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      <span className={clsx('text-sm flex-1', item.done ? 'line-through text-gray-400' : 'text-gray-700')}>
                        {item.text}
                      </span>
                      <button
                        onClick={() => removeChecklist(item.id)}
                        className="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <input
                  className="mt-1 w-full text-sm border-0 border-b border-dashed border-gray-200 py-1.5 px-1 focus:outline-none focus:border-gray-400 placeholder:text-gray-300"
                  placeholder="Add item..."
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addChecklistItem(); }}
                />
              </div>

              {/* 4. Tags */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tags</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="bg-brand-50 text-brand-700 text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1"
                    >
                      {t}
                      <button onClick={() => removeTag(t)} className="hover:text-brand-900 transition-colors">
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  {showTagInput ? (
                    <input
                      autoFocus
                      className="text-xs border border-brand-200 rounded-full px-2.5 py-0.5 w-24 focus:outline-none focus:ring-1 focus:ring-brand-300"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onBlur={() => { setShowTagInput(false); setTagInput(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
                    />
                  ) : (
                    <button
                      onClick={() => setShowTagInput(true)}
                      className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 rounded-full px-2.5 py-0.5 transition-colors"
                    >
                      + Tag
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── SUBTASKS TAB ────────────────────────────────────── */}
          {panelTab === 'subtasks' && (
            <div className="px-6 py-4">
              {/* Progress */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-gray-500">{subDone} / {subTotal} completed</span>
                <div className="flex-1 h-1 bg-gray-200 rounded overflow-hidden">
                  <div
                    className="h-full bg-brand-600 rounded transition-all"
                    style={{ width: `${subPercent}%` }}
                  />
                </div>
              </div>

              {/* Subtask rows */}
              <div>
                {subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-2.5 border-b last:border-0 group">
                    <button
                      onClick={() => toggleSubtask(s.id)}
                      className={clsx(
                        'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                        s.done ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-gray-400',
                      )}
                    >
                      {s.done && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <span className={clsx('text-sm flex-1', s.done ? 'line-through text-gray-400' : 'text-gray-700')}>
                      {s.title}
                    </span>
                    <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 rounded-full py-0.5">
                      {s.assignee}
                    </span>
                  </div>
                ))}
              </div>

              {/* Add subtask */}
              <input
                className="mt-3 w-full text-sm border border-dashed border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 placeholder:text-gray-300"
                placeholder="Add a subtask..."
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); }}
              />
            </div>
          )}

          {/* ── COMMENTS TAB ────────────────────────────────────── */}
          {panelTab === 'comments' && (
            <div className="px-6 py-4">
              {/* Comments list */}
              <div className="space-y-4 mb-4">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0', c.color)}>
                      {c.initials}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-gray-800">{c.author}</span>
                        <span className="text-xs text-gray-400">{c.time}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Compose */}
              <div className="border-t pt-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white bg-orange-500 shrink-0">
                    SA
                  </div>
                  <div className="flex-1">
                    <textarea
                      rows={2}
                      className="w-full text-sm border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 resize-none"
                      placeholder="Write a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        disabled={!newComment.trim()}
                        onClick={postComment}
                        className="px-4 py-1.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Post
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ACTIVITY TAB ────────────────────────────────────── */}
          {panelTab === 'activity' && (
            <div className="px-6 py-4">
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
                <div className="space-y-0">
                  {ACTIVITY_ITEMS.map((item, idx) => (
                    <div key={idx} className="flex gap-3 pl-2 pb-4 relative">
                      <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10', item.color)}>
                        {ACTIVITY_ICON_MAP[item.icon]}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="text-sm text-gray-700">{item.text}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{item.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-gray-100 px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setIsComplete((prev) => !prev)}
            className={clsx(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              isComplete
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'border border-green-400 text-green-600 hover:bg-green-50',
            )}
          >
            {isComplete ? 'Completed ✓' : 'Mark Complete'}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => alert('Task duplicated!')}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Duplicate
          </button>
          <button
            onClick={() => { if (window.confirm('Delete this task?')) alert('Task deleted!'); }}
            className="text-xs text-red-400 hover:text-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </>
  );
}
