'use client';

import type { ComponentType } from 'react';
import { useOrg } from './org-context';
import type { WorkspaceFlow } from './api';

export type { WorkspaceFlow } from './api';

/**
 * Which workspace flow this firm runs — see docs/WORKSPACE_FLOWS.md.
 *
 * PROJECTS until the organisation says otherwise (an older API, or the org still loading): that is
 * what every firm ran before flows existed. Screens that exist in only one flow, or look different
 * in each, ask here — never the org payload directly — so they all agree.
 */
export function useWorkspaceFlow(): WorkspaceFlow {
  const { org } = useOrg();
  return org?.workspaceFlow === 'CLIENTS' ? 'CLIENTS' : 'PROJECTS';
}

export function useIsClientsFlow(): boolean {
  return useWorkspaceFlow() === 'CLIENTS';
}

/**
 * The flow, and whether it is actually known yet. A screen that differs per flow must not render
 * the PROJECTS version for the moment the organisation takes to load and then swap — that flashes
 * the wrong screen and fires the wrong screen's requests (and a redirect in the wrong one would
 * fire for real). Wait for `ready`.
 */
export function useWorkspaceFlowState(): { flow: WorkspaceFlow; ready: boolean } {
  const { org, loading } = useOrg();
  return { flow: org?.workspaceFlow === 'CLIENTS' ? 'CLIENTS' : 'PROJECTS', ready: !!org || !loading };
}

/**
 * One screen, two flows: render the PROJECTS or the CLIENTS implementation of a component.
 *
 *   export default byFlow(ProjectsPage, ClientsPage);
 *
 * Each side is a complete component of its own (usually `Thing.tsx` and `Thing.clients.tsx`), so a
 * change to one flow cannot leak into the other. The props are the same for both.
 */
export function byFlow<P extends object>(Projects: ComponentType<P>, Clients: ComponentType<P>): ComponentType<P> {
  function FlowSwitch(props: P) {
    const { flow, ready } = useWorkspaceFlowState();
    if (!ready) return null;
    return flow === 'CLIENTS' ? <Clients {...props} /> : <Projects {...props} />;
  }
  FlowSwitch.displayName = `byFlow(${Projects.displayName ?? Projects.name}, ${Clients.displayName ?? Clients.name})`;
  return FlowSwitch;
}
