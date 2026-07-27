/**
 * Seniority ladder for the delivery org (low → high).
 *
 * Used to gate the "Project Manager" picker on project creation: a requester may only nominate
 * a manager of EQUAL-OR-HIGHER seniority than themselves. Designations are free-text, so each
 * title is matched case-insensitively (longest keyword wins) against the ladder below; an
 * unrecognised title falls back to DEFAULT_RANK.
 *
 * ⚙️  EDIT THIS ORDER to change who is eligible — this is the single source of truth.
 */
const RANKS: Array<{ rank: number; keys: string[] }> = [
  { rank: 2, keys: ['product development & research associate', 'research associate', 'associate'] },
  { rank: 3, keys: ['senior research associate'] },
  { rank: 4, keys: ['senior associate consultant', 'associate consultant', 'consultant', 'hr specialist', 'senior bd executive', 'bd executive', 'specialist', 'executive'] },
  { rank: 5, keys: ['senior consultant'] },
  { rank: 6, keys: ['manager'] },
  { rank: 7, keys: ['avp', 'assistant vice president'] },
  { rank: 8, keys: ['vice president', 'vp'] },
];

/** Titles below everything else, matched first. */
const INTERN_RANK = 1;
export const DEFAULT_RANK = 4;

/**
 * Map a free-text designation to a seniority rank (higher = more senior). Case-insensitive;
 * the longest matching keyword wins so "senior research associate" outranks "research
 * associate" and "avp" is distinguished from "vp".
 */
export function designationRank(designation?: string | null): number {
  if (!designation) return DEFAULT_RANK;
  const d = designation.trim().toLowerCase();
  if (!d) return DEFAULT_RANK;
  if (d.includes('intern')) return INTERN_RANK; // any "Intern — …" title is most junior
  let best: { rank: number; len: number } | null = null;
  for (const { rank, keys } of RANKS) {
    for (const k of keys) {
      if (d.includes(k) && (!best || k.length > best.len)) best = { rank, len: k.length };
    }
  }
  return best?.rank ?? DEFAULT_RANK;
}
