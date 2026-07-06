'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

// Catches render/runtime errors in the page tree so one exception no longer blanks the app.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="text-red-500" size={26} />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
      <p className="text-sm text-gray-500 mt-1 max-w-sm">
        An unexpected error occurred while rendering this page. You can try again, or reload if it persists.
      </p>
      <div className="flex items-center gap-2 mt-5">
        <button onClick={() => reset()} className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
          Try again
        </button>
        <button onClick={() => (window.location.href = '/home')} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          Go home
        </button>
      </div>
    </div>
  );
}
