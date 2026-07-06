// Shared avatar helpers — used for member/assignee initials and colors.

const AVATAR_COLORS = [
  'bg-brand-600', 'bg-purple-500', 'bg-pink-500', 'bg-slate-600',
  'bg-green-500', 'bg-amber-500', 'bg-teal-500', 'bg-red-500',
  'bg-cyan-500', 'bg-indigo-500',
];

/** Stable colour from any seed string (id or name). */
export function avatarColor(seed: string | undefined | null): string {
  const s = seed ?? '';
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/**
 * Two-letter initials from a first/last name. Safe when lastName is empty:
 *  - "Mohit Kalra"  -> "MK"
 *  - "Arjun" (no last) -> "AR"
 *  - missing both   -> "?"
 */
export function initials(firstName?: string | null, lastName?: string | null): string {
  const f = (firstName ?? '').trim();
  const l = (lastName ?? '').trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f) {
    // No surname: if the first name itself is two words (e.g. "Ankit Kumar"),
    // use the initial of each; otherwise the first two letters.
    const parts = f.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return f.slice(0, 2).toUpperCase();
  }
  if (l) return l.slice(0, 2).toUpperCase();
  return '?';
}

/** Initials from a user-like object with firstName/lastName. */
export function userInitials(u?: { firstName?: string | null; lastName?: string | null } | null): string {
  return initials(u?.firstName, u?.lastName);
}

/** Full display name, collapsing empty last names. */
export function fullName(u?: { firstName?: string | null; lastName?: string | null } | null): string {
  if (!u) return 'Unknown';
  return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Unknown';
}
