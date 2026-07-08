'use client';

import clsx from 'clsx';
import { Avatar } from '@/components/Avatar';
import { fullName } from '@/lib/avatar';

type StackUser =
  | { id?: string; firstName?: string | null; lastName?: string | null; profilePhoto?: string | null }
  | null
  | undefined;

/**
 * Overlapping avatar stack with a "+N" overflow chip. Shows up to `max` avatars
 * (default 4), then a grey "+N" bubble listing the remaining names on hover.
 */
export function AvatarStack({
  users,
  max = 4,
  size = 24,
  className,
  empty = '—',
}: {
  users: StackUser[];
  max?: number;
  size?: number;
  className?: string;
  empty?: React.ReactNode;
}) {
  const list = users.filter(Boolean) as NonNullable<StackUser>[];
  if (list.length === 0) return <span className="text-xs text-gray-300">{empty}</span>;
  const shown = list.slice(0, max);
  const overflow = list.slice(max);

  return (
    <div className={clsx('flex items-center', className)}>
      {shown.map((u, i) => (
        <div
          key={u.id ?? i}
          className="rounded-full ring-2 ring-white"
          style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.3) }}
        >
          <Avatar user={u} size={size} />
        </div>
      ))}
      {overflow.length > 0 && (
        <div
          className="rounded-full ring-2 ring-white bg-gray-200 text-gray-600 font-semibold flex items-center justify-center shrink-0"
          style={{
            width: size,
            height: size,
            marginLeft: -Math.round(size * 0.3),
            fontSize: Math.max(9, Math.round(size * 0.36)),
          }}
          title={overflow.map(fullName).join(', ')}
        >
          +{overflow.length}
        </div>
      )}
    </div>
  );
}
