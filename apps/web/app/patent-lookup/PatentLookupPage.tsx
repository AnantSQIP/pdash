'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, Copy, Info, Loader, Search, ShieldAlert } from 'lucide-react';
import { api, type PatentNumberForMember, type PatentResolved } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useToast } from '@/components/ui/Toast';

/**
 * Patent lookup — the handle ↔ number directory, open to the whole organisation.
 *
 * ONE BOX, BOTH DIRECTIONS. People arrive holding one half of the pair and wanting the other:
 * an analyst reads `Pat_ABC_001` in a task and needs the patent; or holds US 10,123,456 and needs
 * the ID to quote on a timesheet. Making them choose a direction first is a question they should
 * not have to answer — the input tells us which it is.
 *
 * WHAT THIS SCREEN DELIBERATELY CANNOT DO: list. There is no browse, no "show all", no export.
 * You resolve what you already hold half of. That is the difference between a directory people
 * can use and a portfolio somebody can copy.
 */

const looksLikeHandle = (q: string) => /^pat[_-]/i.test(q.trim());

export default function PatentLookupPage() {
  const { can, loading } = usePermissions();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [handleHit, setHandleHit] = useState<PatentResolved | null>(null);
  const [numberHits, setNumberHits] = useState<PatentNumberForMember[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState('');

  const search = useMutation({
    mutationFn: async () => {
      const q = query.trim();
      if (!q) return;
      setHandleHit(null); setNumberHits(null); setTruncated(false); setError('');

      // A handle is unambiguous, so try it first and fall through to the number search only when
      // it finds nothing. Searching both every time would double the audit noise and the budget.
      if (looksLikeHandle(q)) {
        setHandleHit(await api.patentNumbers.byHandle(q));
        return;
      }
      const res = await api.patentNumbers.findByNumber(q);
      setNumberHits(res.results);
      setTruncated(!!res.truncated);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Lookup failed.'),
  });

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast('Copied.', 'success'),
      () => toast('Could not copy.', 'error'),
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400"><Loader className="animate-spin mr-2" size={18} />Loading…</div>;
  }
  if (!can('patent.view')) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center">
        <ShieldAlert className="mx-auto text-gray-300 mb-3" size={28} />
        <p className="text-sm text-gray-500">Your role does not include access to patent records.</p>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => { e.preventDefault(); search.mutate(); };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl font-bold text-gray-900">Patent lookup</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Find the patent behind an ID, or the ID to quote for a patent.
        </p>
      </header>

      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Pat_ABC_001  ·  or  ·  US 10,123,456"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={search.isPending || query.trim().length < 3}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {search.isPending ? <Loader size={14} className="animate-spin" /> : <Search size={14} />} Look up
        </button>
      </form>

      <p className="text-[11px] text-gray-400">
        Spacing and punctuation do not matter — <span className="font-mono">US10123456</span>,{' '}
        <span className="font-mono">US 10,123,456</span> and <span className="font-mono">us-10123456</span> all match.
      </p>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3.5 py-3">
          <AlertTriangle size={15} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* ── Handle → number ── */}
      {handleHit && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {!handleHit.current && (
            // A rename does not break old references, but silently swapping in the new ID would
            // hide the fact that the one they quoted has changed — which is half the answer.
            <p className="px-4 py-2.5 text-xs text-amber-800 bg-amber-50 border-b border-amber-200">
              <b>That ID has been retired.</b> “{handleHit.searchedFor}” is now{' '}
              <span className="font-mono">{handleHit.handle}</span>. Quote the current one from here on.
            </p>
          )}
          <div className="px-4 py-4 flex items-center gap-3 flex-wrap">
            <span className="font-mono text-sm px-2.5 py-1 rounded bg-gray-50 border border-gray-200">{handleHit.handle}</span>
            <ArrowRight size={16} className="text-gray-300" />
            <span className="font-mono text-base font-semibold text-gray-900">{handleHit.realNumber}</span>
            <button
              onClick={() => copy(handleHit.realNumber)} title="Copy the patent number"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
            >
              <Copy size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── Number → handle ── */}
      {numberHits && (
        numberHits.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-500">Nothing matches “{query.trim()}”.</p>
            <p className="text-xs text-gray-400 mt-1">
              Check the number, or ask a Super Admin whether the patent is registered here yet.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 text-xs text-gray-500">
              {numberHits.length} {numberHits.length === 1 ? 'match' : 'matches'}
              {truncated && ' — showing the first few, narrow your search for the rest'}
            </div>
            <ul className="divide-y divide-gray-50">
              {numberHits.map(p => (
                <li key={p.id} className="px-4 py-3 flex items-center gap-3 flex-wrap hover:bg-gray-50">
                  <span className="font-mono text-sm font-semibold text-gray-900">{p.handle}</span>
                  <button
                    onClick={() => copy(p.handle)} title="Copy the patent ID"
                    className="p-1 text-gray-300 hover:text-gray-700 hover:bg-gray-100 rounded"
                  >
                    <Copy size={12} />
                  </button>
                  <ArrowRight size={14} className="text-gray-300" />
                  <span className="font-mono text-sm text-gray-600">{p.realNumber}</span>
                  {p.formerHandles.length > 0 && (
                    <span className="text-[11px] text-gray-400">
                      was {p.formerHandles.join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {/* Said once, at the bottom, where it explains the shape of the screen rather than
          interrupting the thing people came to do. */}
      <div className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-3">
        <Info size={14} className="text-gray-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-gray-600 leading-relaxed">
          <b>Which client a patent belongs to is not shown here</b>, and is not available to look up —
          that stays with Super Admins. A patent number itself is public information; the client
          behind it is not. Lookups are recorded, and there is an hourly limit, so the directory
          cannot be copied wholesale.
        </p>
      </div>
    </div>
  );
}
