'use client';

import { useEffect, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';

/**
 * A page that exists in only one workspace flow (docs/WORKSPACE_FLOWS.md) renders this in the
 * other: it sends the viewer to the flow's own equivalent instead of a screen that does not apply.
 *
 *   export default byFlow(PidLedgerPage, redirectTo('/cid-ledger'));
 *
 * `replace`, not `push`, so Back does not bounce straight into the redirect again.
 */
export function redirectTo(href: string): ComponentType<object> {
  function FlowRedirect() {
    const router = useRouter();
    useEffect(() => { router.replace(href); }, [router]);
    return null;
  }
  FlowRedirect.displayName = `redirectTo(${href})`;
  return FlowRedirect;
}
