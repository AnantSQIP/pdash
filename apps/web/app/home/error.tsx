'use client';

// Segment error boundary for the Home dashboard. A render-time throw in any one card is
// caught here and shown as a recoverable message with a Retry, instead of blanking the
// whole page. (React Query fetch errors are handled inside each card, not here.)
import { AlertTriangle, RotateCw } from 'lucide-react';

export default function HomeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="max-w-sm w-full bg-white border border-gray-200 rounded-xl p-6 text-center">
        <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle size={20} className="text-red-500" />
        </div>
        <h2 className="text-base font-semibold text-gray-900">Something went wrong loading your dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">This is usually temporary. Try again in a moment.</p>
        <button
          onClick={reset}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
        >
          <RotateCw size={15} /> Retry
        </button>
      </div>
    </div>
  );
}
