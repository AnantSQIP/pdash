/**
 * Only what matching needs, rather than the full PatentOption — so the rules can be exercised
 * on their own, without dragging the API client in behind them.
 */
export type SearchablePatent = { handle: string; formerHandles?: string[] };

/**
 * Match a patent by its current ID **or** by any ID it used to have.
 *
 * A client-code rename re-mints every handle, so the ID somebody is searching for is often the
 * one written on the report we sent — not the one in the database today. Matching only the live
 * handle sends them away empty-handed with no hint that the patent exists at all.
 *
 * Shared by both pickers so the two search boxes cannot drift apart.
 */
export function patentMatches(patent: SearchablePatent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (patent.handle.toLowerCase().includes(q)) return true;
  return (patent.formerHandles ?? []).some(h => h.toLowerCase().includes(q));
}

/** The former ID that matched, when the live handle did not — worth showing so the result
 *  does not look like an unrelated patent appearing for no reason. */
export function matchedFormerHandle(patent: SearchablePatent, query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q || patent.handle.toLowerCase().includes(q)) return null;
  return (patent.formerHandles ?? []).find(h => h.toLowerCase().includes(q)) ?? null;
}
