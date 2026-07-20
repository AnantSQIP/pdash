'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell, X } from 'lucide-react';
import { api, type NotificationItem } from '@/lib/api';
import { useOrg } from '@/lib/org-context';

type Popup = { id: string; title: string; message: string; link?: string | null };

/**
 * Shows a small pop-up in the bottom-left for ~5s whenever a NEW notification arrives.
 * It polls the notification list; the first load establishes a baseline (so existing
 * notifications don't pop), and only ids that appear afterwards are shown.
 */
export function NotificationToaster() {
  const { currentUser } = useOrg();
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null); // null until the baseline is set
  const [popups, setPopups] = useState<Popup[]>([]);

  const dismiss = useCallback((id: string) => setPopups(prev => prev.filter(p => p.id !== id)), []);

  const { data: notifs } = useQuery<NotificationItem[]>({
    queryKey: ['notif-toast'],
    queryFn: () => api.notifications.list(10),
    enabled: !!currentUser?.id,
    refetchInterval: 20_000,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!notifs) return;
    if (seen.current === null) {
      // Baseline: everything currently present is treated as already-seen.
      seen.current = new Set(notifs.map(n => n.id));
      return;
    }
    const fresh = notifs.filter(n => !seen.current!.has(n.id) && !n.isRead);
    notifs.forEach(n => seen.current!.add(n.id));
    if (fresh.length) {
      setPopups(prev => [...fresh.map(n => ({ id: n.id, title: n.title, message: n.message, link: n.link })), ...prev].slice(0, 3));
      // Each pop-up disappears on its own after ~5 seconds.
      fresh.forEach(n => setTimeout(() => dismiss(n.id), 5000));
    }
  }, [notifs, dismiss]);

  if (!popups.length) return null;
  return (
    <div className="fixed bottom-5 left-5 z-[100] flex flex-col-reverse gap-2 pointer-events-none">
      {popups.map(p => (
        <button
          key={p.id}
          onClick={() => { if (p.link) router.push(p.link); dismiss(p.id); }}
          className="notif-pop pointer-events-auto w-80 max-w-[calc(100vw-2.5rem)] flex items-start gap-3 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-left hover:border-brand-300 transition-colors"
        >
          <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Bell size={15} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-gray-900 truncate">{p.title}</span>
            <span className="block text-xs text-gray-500 line-clamp-2">{p.message}</span>
          </span>
          <span onClick={e => { e.stopPropagation(); dismiss(p.id); }} className="p-1 -mr-1 -mt-0.5 rounded text-gray-300 hover:text-gray-600 shrink-0"><X size={14} /></span>
        </button>
      ))}
      <style jsx>{`
        .notif-pop { animation: notif-in .22s ease-out; }
        @keyframes notif-in { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
