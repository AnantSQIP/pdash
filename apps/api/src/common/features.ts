/**
 * CLIENTS-FLOW: features that are switched off — commented out, not deleted.
 *
 * PATENTS_AND_CLIENT_CODES covers three things the owner asked to have commented out of the
 * existing system when projects became clients:
 *
 *   • the patent portal (/patents, and the client ledger that lives in the same API module),
 *   • patent IDs — patent handles, real numbers, tagging and lookup,
 *   • client IDs — the client codes and the client picker that named a project's client.
 *
 * Nothing is deleted. The code stays compiled and type-checked; every place that was switched off
 * carries the marker "CLIENTS-FLOW: commented out". To bring the features back: set this to true,
 * uncomment the marked lines (the module registration in app.module.ts and two routes in
 * projects.controller.ts), and do the same on the web side (apps/web/lib/features.ts).
 */
export const PATENTS_AND_CLIENT_CODES = false;
