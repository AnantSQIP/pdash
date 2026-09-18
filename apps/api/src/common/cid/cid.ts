/**
 * The CID (Client ID) — the number a client is filed, billed and quoted under, e.g. SQ_26_27_001.
 * It was called the PID until the clients flow; the database still stores it in `project.code` and
 * registers it in `pid_reservation`, but everything a person reads says CID.
 *
 * This file is the pure half: the format, the prefix rule, the parser and the vocabulary of the
 * ledger. No Nest, no Prisma, so it can be tested on its own (tools/cid-format.spec.ts) and mirrored
 * exactly by the SQL backfill in 20261020120000_cid_auto_mint_and_ledger.
 */
import { formatCid } from '../financial-year';

export { formatCid };

/** Longest prefix a CID may carry. Keeps a CID well inside every 40-character field that holds one. */
export const CID_PREFIX_MAX = 16;

/** Used when an organisation code has nothing usable in it. */
export const CID_PREFIX_FALLBACK = 'SQ';

/**
 * The prefix a CID is minted under, derived from the organisation code.
 *
 * Organisation codes were never validated for this: the seed's is `pdash-demo`, and a hyphen in the
 * prefix produced numbers the parser then rejected, so they could be minted but never typed back in.
 * The rule — letters and digits only, upper-cased, at most 16 characters, 'SQ' when nothing is left —
 * is the same one the SQL backfill applies, so the two can never mint from different prefixes.
 */
export function cidPrefix(orgCode: string | null | undefined): string {
  const clean = (orgCode ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, CID_PREFIX_MAX);
  return clean || CID_PREFIX_FALLBACK;
}

/** Any well-formed CID, whatever its prefix: PREFIX_YY_YY_serial. */
export const CID_PATTERN = /^[A-Z0-9]+_\d{2}_\d{2}_\d{1,6}$/i;

export type ParsedCid = { cid: string; fyLabel: string; serial: number };

/**
 * Parse and canonicalise a CID for an organisation's prefix: "sq_26_27_1" → SQ_26_27_001. Returns
 * a reason instead of throwing, so callers can word the refusal for their own context.
 */
export function parseCid(raw: string, prefix: string): ParsedCid | { error: string } {
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^${esc}_(\\d{2})_(\\d{2})_(\\d{1,6})$`).exec((raw ?? '').trim().toUpperCase());
  if (!m) return { error: `"${raw}" is not a valid CID (expected ${prefix}_YY_YY_NNN).` };
  const fyStart = parseInt(m[1], 10), fyEnd = parseInt(m[2], 10), serial = parseInt(m[3], 10);
  if (fyEnd !== (fyStart + 1) % 100) {
    return { error: `"${raw}" has an invalid financial year — the two years must be consecutive (e.g. ${prefix}_26_27_001).` };
  }
  if (serial < 1) return { error: 'A CID serial must be 1 or greater.' };
  const fyLabel = `${m[1]}_${m[2]}`;
  return { cid: formatCid(prefix, fyLabel, serial), fyLabel, serial };
}

/**
 * Registry statuses (pid_reservation.status). A CHECK constraint in the migration holds the same list.
 *
 *   ATTACHED     — at least one live client carries it
 *   DELETED      — only soft-deleted clients carry it; still reserved to them
 *   PURGED       — every client that carried it was permanently deleted; retired forever
 *   MERGED       — its client moved under another CID (`mergedIntoCid`); retired forever
 *   DISCONTINUED — vacated by a reassign/split, or retired before the ledger; retired forever
 */
export const CID_REGISTRY_STATUSES = ['ATTACHED', 'DELETED', 'PURGED', 'MERGED', 'DISCONTINUED'] as const;
export type CidRegistryStatus = (typeof CID_REGISTRY_STATUSES)[number];

/** The statuses a number never leaves: nothing may be filed under it again. */
export const CID_RETIRED_STATUSES: readonly CidRegistryStatus[] = ['PURGED', 'MERGED', 'DISCONTINUED'];
export const isRetiredCid = (status: string | null | undefined) =>
  !!status && (CID_RETIRED_STATUSES as readonly string[]).includes(status);

/** Ledger event types (cid_event.type). A CHECK constraint in the migration holds the same list. */
export const CID_EVENT_TYPES = [
  'MINTED',               // a new client was created and given the next number
  'BACKFILLED',           // an existing client was given a number by the migration
  'IMPORTED',             // a number that existed before the ledger did
  'ROUND_ADDED',          // another client was started under an existing CID
  'RENAMED',              // the client's title changed
  'CLIENT_GROUP_CHANGED', // filed under a different client group (or taken out of one)
  'MANAGER_CHANGED',      // the client's manager changed
  'PHASE_CHANGED',        // Active ↔ On hold (and the approval flow's phase moves)
  'DELETED',              // soft-deleted — sits in Admin → Data, restorable
  'RESTORED',             // brought back from Admin → Data
  'COMPLETED',            // marked complete
  'REOPENED',             // reopened after completion
  'REINITIALIZED',        // put back to work for a returning client
  'REASSIGNED',           // Change CID: moved to a fresh number
  'SPLIT',                // Change CID: left a shared number for a fresh one
  'MERGED',               // Change CID: moved under another client's number
  'PURGED',               // permanently deleted — the tombstone
] as const;
export type CidEventType = (typeof CID_EVENT_TYPES)[number];

/** Human labels, for messages and the CSV. The screen keeps its own copy for styling. */
export const CID_EVENT_LABELS: Record<CidEventType, string> = {
  MINTED: 'CID issued',
  BACKFILLED: 'CID issued (backfill)',
  IMPORTED: 'Existing CID recorded',
  ROUND_ADDED: 'Client added under this CID',
  RENAMED: 'Renamed',
  CLIENT_GROUP_CHANGED: 'Client group changed',
  MANAGER_CHANGED: 'Manager changed',
  PHASE_CHANGED: 'Phase changed',
  DELETED: 'Deleted',
  RESTORED: 'Restored',
  COMPLETED: 'Completed',
  REOPENED: 'Reopened',
  REINITIALIZED: 'Re-initialized',
  REASSIGNED: 'CID reassigned',
  SPLIT: 'CID split',
  MERGED: 'Merged',
  PURGED: 'Permanently deleted',
};
