import { Compass } from 'lucide-react';
import { StatusPage, PrimaryAction, SecondaryAction } from '@/components/ui/StatusPage';

// Without this, a mistyped URL fell through to Next's stock 404 — black text on white,
// no navigation, and nothing to say which application the person is even in.
export default function NotFound() {
  return (
    <StatusPage
      mark={<Compass size={22} />}
      code="404"
      title="There’s nothing at this address"
      message="The page may have been moved or removed, or the link that brought you here may be out of date."
      actions={
        <>
          <PrimaryAction href="/home">Back to home</PrimaryAction>
          <SecondaryAction href="/projects">Go to projects</SecondaryAction>
        </>
      }
    />
  );
}
