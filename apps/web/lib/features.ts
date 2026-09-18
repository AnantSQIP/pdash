/**
 * CLIENTS-FLOW: features that are switched off — commented out, not deleted.
 *
 * PATENTS_AND_CLIENT_CODES covers the patent portal, patent IDs (handles, real numbers, tagging,
 * lookup) and client IDs (client codes, the client picker, the client ledger). The owner asked for
 * these to be commented out of the existing system when projects became clients.
 *
 * Every switched-off place carries the marker "CLIENTS-FLOW: commented out". To restore: set this
 * to true, uncomment the marked lines (sidebar entries and the three page exports), and do the
 * same on the API (apps/api/src/common/features.ts).
 */
export const PATENTS_AND_CLIENT_CODES = false;
