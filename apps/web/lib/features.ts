import { useWorkspaceFlow, type WorkspaceFlow } from './workspace-flow';

/**
 * Features that exist in one workspace flow only (docs/WORKSPACE_FLOWS.md).
 *
 * PATENTS AND CLIENT CODES — the patent portal, patent IDs (handles, real numbers, tagging, lookup)
 * and client IDs (client codes, the client picker, the client ledger). ON in the PROJECTS flow,
 * exactly as production runs them; OFF in CLIENTS, where the owner asked for them to be switched
 * off when projects became clients. The API asks the same question (apps/api/src/common/features.ts)
 * and its routes answer 404 in CLIENTS.
 */
export function patentsAndClientCodes(flow: WorkspaceFlow): boolean {
  return flow === 'PROJECTS';
}

/** patentsAndClientCodes for the firm the viewer belongs to. */
export function usePatentsAndClientCodes(): boolean {
  return patentsAndClientCodes(useWorkspaceFlow());
}

/**
 * For code that is only ever reached in the CLIENTS flow (its `.clients.tsx` screens), where the
 * answer is fixed: false. Kept as a named constant so the places that used to switch on it still
 * say what they are switching on.
 */
export const CLIENTS_PATENTS_AND_CLIENT_CODES = patentsAndClientCodes('CLIENTS');
