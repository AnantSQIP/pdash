'use client';

import clsx from 'clsx';
import { userInitials, fullName, avatarColor } from '@/lib/avatar';
import { presenceMeta } from '@/lib/presence-context';

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

/**
 * Single source of truth for user avatars across the app. Shows the user's profile
 * photo when set; otherwise a colored circle with their initials (no surname → first
 * two letters of the name; nothing → "?"). See lib/avatar.ts for the initials rules.
 *
 * Pass `status` (a presence value) to overlay a colored presence dot at the corner.
 */
export function Avatar({ user, size = 32, className, status }: { user: AvatarUser; size?: number; className?: string; status?: string | null }) {
  if (!status) return inner(user, size, className);
  const meta = presenceMeta(status);
  const dot = Math.max(8, Math.round(size * 0.32));
  return (
    <span className={clsx('relative inline-flex shrink-0', className)} title={`${fullName(user)} · ${meta.label}`}>
      {inner(user, size)}
      <span className={clsx('absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white', meta.dot)} style={{ width: dot, height: dot }} />
    </span>
  );
}
