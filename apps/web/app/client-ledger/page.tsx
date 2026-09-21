'use client';

import { byFlow } from '@/lib/workspace-flow';
import { redirectTo } from '@/components/layout/FlowRedirect';
import ClientLedgerPage from './ClientLedgerPage';

// The client ledger exists in the PROJECTS flow only — patents and client codes are a PROJECTS-flow feature
// (lib/features.ts). The page itself is production's, unchanged, in ./ClientLedgerPage.tsx. A CLIENTS firm
// is sent to its clients.
export default byFlow(ClientLedgerPage, redirectTo('/projects'));
