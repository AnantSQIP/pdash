'use client';

import clsx from 'clsx';
import { userInitials, fullName, avatarColor } from '@/lib/avatar';

type AvatarUser =
  | { firstName?: string | null; lastName?: string | null; profilePhoto?: string | null; id?: string }
  | null
  | undefined;

/**
 * Single source of truth for user avatars across the app. Shows the user's profile
 * photo when set; otherwise a colored circle with their initials (no surname → first
 * two letters of the name; nothing → "?"). See lib/avatar.ts for the initials rules.
 */
export function Avatar({ user, size = 32, className }: { user: AvatarUser; size?: number; className?: string }) {
  const name = fullName(user);
  if (user?.profilePhoto) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.profilePhoto}
        alt={name}
        className={clsx('rounded-full object-cover shrink-0 bg-gray-100', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  const seed = name === 'Unknown' ? (user?.id ?? '') : name;
  return (
    <div
      className={clsx('rounded-full flex items-center justify-center text-white font-semibold shrink-0', avatarColor(seed), className)}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }}
      aria-label={name}
      title={name}
    >
      {userInitials(user)}
    </div>
  );
}
