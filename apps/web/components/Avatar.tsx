'use client';

import clsx from 'clsx';
import { userInitials, fullName, avatarColor } from '@/lib/avatar';
import { presenceMeta, usePresence } from '@/lib/presence-context';
import { formatDateIST, formatTimeIST, istDay, todayIST } from '@/lib/date';

type AvatarUser =
  | { firstName?: string | null; lastName?: string | null; profilePhoto?: string | null; id?: string }
  | null
  | undefined;

function inner(user: AvatarUser, size: number, extra?: string) {
  const name = fullName(user);
  if (user?.profilePhoto) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.profilePhoto}
        alt={name}
        className={clsx('rounded-full object-cover shrink-0 bg-gray-100', extra)}
        style={{ width: size, height: size }}
      />
    );
  }
  const seed = name === 'Unknown' ? (user?.id ?? '') : name;
  return (
    <div
      className={clsx('rounded-full flex items-center justify-center text-white font-semibold shrink-0', avatarColor(seed), extra)}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }}
      aria-label={name}
      title={name}
    >
      {userInitials(user)}
    </div>
  );
}

/** "3:42 pm" today; "17 Sept, 3:42 pm" otherwise — a bare time from yesterday reads as today. */
function whenIST(iso: string) {
  return istDay(iso) === todayIST() ? formatTimeIST(iso) : `${formatDateIST(iso)}, ${formatTimeIST(iso)}`;
}

/** Below this size a dot would be a smudge, not a signal. */
const MIN_DOT_SIZE = 20;

/**
 * Single source of truth for user avatars across the app. Shows the user's profile
 * photo when set; otherwise a colored circle with their initials (no surname → first
 * two letters of the name; nothing → "?"). See lib/avatar.ts for the initials rules.
 *
 * Every avatar carries the person's presence dot — green at their PC, yellow when away, and so
 * on — so anyone can see who is around from wherever that person appears, not only on the People
 * page (which is where the dot used to be, alone). `status` overrides it; `presence={false}`
 * turns it off.
 */
export function Avatar({ user, size = 32, className, status, presence = true }: {
  user: AvatarUser; size?: number; className?: string; status?: string | null; presence?: boolean;
}) {
  const { presenceOf } = usePresence();
  const entry = presence && user?.id ? presenceOf(user.id) : null;
  const shown = status !== undefined && status !== null ? status : (presence && size >= MIN_DOT_SIZE ? entry?.status : null);
  if (!shown) return inner(user, size, className);
  const meta = presenceMeta(shown);
  const dot = Math.max(8, Math.round(size * 0.32));
  const since = entry?.inactiveSince && (shown === 'AWAY' || shown === 'OFFLINE')
    ? ` · ${shown === 'AWAY' ? 'inactive since' : 'last seen'} ${whenIST(entry.inactiveSince)}` : '';
  return (
    <span className={clsx('relative inline-flex shrink-0', className)} title={`${fullName(user)} · ${meta.label}${since}`}>
      {inner(user, size)}
      <span className={clsx('absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white', meta.dot)} style={{ width: dot, height: dot }} />
    </span>
  );
}
