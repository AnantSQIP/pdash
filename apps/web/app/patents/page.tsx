'use client';

import { byFlow } from '@/lib/workspace-flow';
import { redirectTo } from '@/components/layout/FlowRedirect';
import PatentPortalPage from './PatentPortalPage';

// The patent portal exists in the PROJECTS flow only — patents and client codes are a PROJECTS-flow feature
// (lib/features.ts). The page itself is production's, unchanged, in ./PatentPortalPage.tsx. A CLIENTS firm
// is sent to its clients.
export default byFlow(PatentPortalPage, redirectTo('/projects'));
