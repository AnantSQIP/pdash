'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, X, FolderKanban, ListTodo, MessagesSquare, User, Loader } from 'lucide-react';
import { api, type SearchResults } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { fullName } from '@/lib/avatar';

export const OPEN_SEARCH_EVENT = 'squark:open-search';

const PHASE_TINT: Record<string, string> = {
  ACTIVE: 'text-green-600', PLANNING: 'text-blue-600', ON_HOLD: 'text-amber-600',
  COMPLETED: 'text-gray-500', CLOSED: 'text-gray-400', CANCELLED: 'text-red-500',
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');

  // Open on Cmd/Ctrl+K, or when the sidebar Search button dispatches the event.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); }
      if (e.key === 'Escape') setOpen(false);
    }
    function onOpen() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_SEARCH_EVENT, onOpen); };
  }, []);

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 200); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (!open) { setQ(''); setDebounced(''); } }, [open]);

  const { data, isFetching } = useQuery<SearchResults>({
    queryKey: ['search', debounced],
    queryFn: () => api.search(debounced),
    enabled: open && debounced.length >= 2,
    staleTime: 10_000,
  });

  const total = useMemo(
    () => data ? data.people.length + data.projects.length + data.tasks.length + data.channels.length + data.messages.length : 0,
    [data],
  );

  function go(href: string) { setOpen(false); router.push(href); }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[10vh] px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Search size={17} className="text-gray-400 shrink-0" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search people, projects, tasks, discussions…"
            className="flex-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none" />
          {isFetching && <Loader size={15} className="animate-spin text-gray-300" />}
          <button onClick={() => setOpen(false)} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {debounced.length < 2 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Type at least 2 characters to search.</p>
          ) : total === 0 && !isFetching ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No results for “{debounced}”.</p>
          ) : (
            <>
              {data && data.people.length > 0 && (
                <Group label="People">
                  {data.people.map(p => (
                    <Row key={p.id} onClick={() => go(`/admin/users/${p.id}`)}>
                      <Avatar user={p} size={26} />
                      <span className="text-sm text-gray-800">{fullName(p)}</span>
                      <span className="text-xs text-gray-400 ml-auto truncate">{p.designation ?? p.email}</span>
                    </Row>
                  ))}
                </Group>
              )}
              {data && data.projects.length > 0 && (
                <Group label="Projects">
                  {data.projects.map(p => (
                    <Row key={p.id} onClick={() => go(`/projects/${p.id}`)}>
                      <FolderKanban size={16} className="text-brand-500 shrink-0" />
                      <span className="text-sm text-gray-800 truncate">{p.title}</span>
                      <span className={`text-[11px] ml-auto ${PHASE_TINT[p.projectPhase] ?? 'text-gray-400'}`}>{p.projectPhase}</span>
                    </Row>
                  ))}
                </Group>
              )}
              {data && data.tasks.length > 0 && (
                <Group label="Tasks">
                  {data.tasks.map(t => (
                    <Row key={t.id} onClick={() => go(t.projectId ? `/projects/${t.projectId}` : '/tasks')}>
                      <ListTodo size={16} className="text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-800 truncate">{t.title}</span>
                      {t.status && <span className="text-[11px] text-gray-400 ml-auto">{t.status}</span>}
                    </Row>
                  ))}
                </Group>
              )}
              {data && data.channels.length > 0 && (
                <Group label="Discussions">
                  {data.channels.map(c => (
                    <Row key={c.id} onClick={() => go(`/discuss?channel=${c.id}`)}>
                      <MessagesSquare size={16} className="text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-800 truncate">{c.name}</span>
                    </Row>
                  ))}
                </Group>
              )}
              {data && data.messages.length > 0 && (
                <Group label="Messages">
                  {data.messages.map(m => (
                    <Row key={m.id} onClick={() => go(`/discuss?channel=${m.channelId}&message=${m.id}`)}>
                      <MessagesSquare size={16} className="text-gray-300 shrink-0 mt-0.5 self-start" />
                      <span className="min-w-0">
                        <span className="text-sm text-gray-700 line-clamp-1">{m.content}</span>
                        <span className="text-[11px] text-gray-400">{m.author} · {m.channelName}</span>
                      </span>
                    </Row>
                  ))}
                </Group>
              )}
            </>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400 flex items-center gap-2">
          <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono">Esc</kbd> to close
          <span className="ml-auto"><kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono">⌘K</kbd> to open</span>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      {children}
    </div>
  );
}
function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-gray-50 transition-colors">
      {children}
    </button>
  );
}
