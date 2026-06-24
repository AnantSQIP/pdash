'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FolderKanban, CheckSquare, FileText, User, X } from 'lucide-react';

interface SearchItem {
  type: 'project' | 'task' | 'page' | 'user';
  title: string;
  sub: string;
  href: string;
}

const ALL_ITEMS: SearchItem[] = [
  { type: 'project', title: 'Apollo Website Redesign',        sub: 'Active · 6 tasks',         href: '/projects/p1' },
  { type: 'project', title: 'Mobile App v2.0',                sub: 'Planning · 3 tasks',        href: '/projects/p2' },
  { type: 'task',    title: 'Define information architecture', sub: 'Apollo Website Redesign',   href: '/projects/p1' },
  { type: 'task',    title: 'Create wireframes for all pages', sub: 'Apollo Website Redesign',   href: '/projects/p1' },
  { type: 'task',    title: 'Design component library',        sub: 'Apollo Website Redesign',   href: '/projects/p1' },
  { type: 'task',    title: 'Implement responsive navbar',     sub: 'Apollo Website Redesign',   href: '/projects/p1' },
  { type: 'page',    title: 'People',                          sub: 'People management',         href: '/users' },
  { type: 'page',    title: 'Reports & Analytics',             sub: 'Dashboard',                 href: '/reports' },
  { type: 'page',    title: 'Calendar',                        sub: 'Schedule',                  href: '/calendar' },
  { type: 'user',    title: 'Alice Kim',                       sub: 'Product Manager',           href: '/users' },
  { type: 'user',    title: 'Bob Taylor',                      sub: 'Engineer',                  href: '/users' },
];

const TYPE_ORDER: SearchItem['type'][] = ['project', 'task', 'page', 'user'];

const TYPE_LABELS: Record<SearchItem['type'], string> = {
  project: 'Projects',
  task: 'Tasks',
  page: 'Pages',
  user: 'People',
};

const TYPE_ICONS: Record<SearchItem['type'], React.ElementType> = {
  project: FolderKanban,
  task: CheckSquare,
  page: FileText,
  user: User,
};

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredItems = query.trim()
    ? ALL_ITEMS.filter(item =>
        item.title.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10)
    : ALL_ITEMS.slice(0, 5);

  // Group by type in defined order
  const grouped = TYPE_ORDER.reduce<Record<string, SearchItem[]>>((acc, type) => {
    const items = filteredItems.filter(item => item.type === type);
    if (items.length > 0) acc[type] = items;
    return acc;
  }, {});

  // Flat list for keyboard nav
  const flatList = TYPE_ORDER.flatMap(type => grouped[type] ?? []);

  const navigate = useCallback((item: SearchItem) => {
    router.push(item.href);
    onClose();
  }, [router, onClose]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && flatList[selectedIndex]) {
        navigate(flatList[selectedIndex]);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [flatList, selectedIndex, navigate, onClose]);

  let flatIdx = -1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-0 z-[100] pointer-events-none">
        <div className="w-full max-w-2xl mx-auto mt-20 pointer-events-auto px-4">
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
            {/* Search input row */}
            <div className="flex items-center gap-3 px-4 border-b border-gray-200">
              <Search size={18} className="text-gray-400 shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search projects, tasks, people..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="flex-1 text-lg py-4 border-0 focus:outline-none focus:ring-0 bg-transparent placeholder-gray-300 text-gray-900"
              />
              <div className="flex items-center gap-2 shrink-0">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-100 rounded border border-gray-200">
                  ESC
                </kbd>
                <button
                  onClick={onClose}
                  className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="max-h-[380px] overflow-y-auto">
              {filteredItems.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <p className="text-sm">No results for &ldquo;{query}&rdquo;</p>
                </div>
              ) : (
                <div className="py-2">
                  {!query.trim() && (
                    <p className="px-4 py-1 text-[10px] uppercase tracking-widest font-semibold text-gray-400">
                      Recent
                    </p>
                  )}
                  {TYPE_ORDER.map(type => {
                    const items = grouped[type];
                    if (!items) return null;
                    return (
                      <div key={type}>
                        {query.trim() && (
                          <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest font-semibold text-gray-400">
                            {TYPE_LABELS[type]}
                          </p>
                        )}
                        {items.map(item => {
                          flatIdx += 1;
                          const currentIdx = flatIdx;
                          const Icon = TYPE_ICONS[item.type];
                          const isSelected = currentIdx === selectedIndex;
                          return (
                            <button
                              key={`${item.type}-${item.title}`}
                              onClick={() => navigate(item)}
                              onMouseEnter={() => setSelectedIndex(currentIdx)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                                isSelected ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-500'
                              }`}>
                                <Icon size={14} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                                <p className="text-xs text-gray-400 truncate">{item.sub}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-4 text-[11px] text-gray-400">
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">↵</kbd> open</span>
              <span><kbd className="font-mono">ESC</kbd> close</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
