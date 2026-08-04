'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            // Re-check stale data when the user comes back to the tab, and when the network
            // reconnects. This is the safety net for anything a mutation elsewhere changed
            // (another person approving a request, a background job writing attendance…) —
            // without it a tab could sit on stale data until a manual refresh.
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
