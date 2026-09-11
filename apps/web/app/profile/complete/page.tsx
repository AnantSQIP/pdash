'use client';

// The voluntary home of the joining-details form. It used to be rendered by AppShell as a wall
// across the whole app on a new joiner's first sign-in; that gate was removed in the 2026-09
// review. Giving it a route rather than deleting it is the point — HR filling the record in is
// now the normal path, but a person must still be able to fill in or correct their own.

import { CompleteProfile } from '@/components/layout/CompleteProfile';

export default function CompleteProfilePage() {
  return <CompleteProfile />;
}
