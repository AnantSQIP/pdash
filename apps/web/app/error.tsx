'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { StatusPage, PrimaryAction, SecondaryAction } from '@/components/ui/StatusPage';

// Catches render/runtime errors in the page tree so one exception no longer blanks the app.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      tone="danger"
      mark={<AlertTriangle size={22} />}
      title="This page didn’t load"
      message={
        <>
          Something went wrong while putting the page together. Nothing you were working on has been
          lost — trying again usually clears it.
        </>
      }
      reference={error.digest}
      actions={
        <>
          <PrimaryAction onClick={() => reset()}>Try again</PrimaryAction>
          <SecondaryAction href="/home">Back to home</SecondaryAction>
        </>
      }
    />
  );
}
