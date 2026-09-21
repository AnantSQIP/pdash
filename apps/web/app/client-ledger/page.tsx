// CLIENTS-FLOW: commented out — the client ledger is keyed on client codes, which are switched off (lib/features.ts).
// The page is untouched in ./ClientLedgerPage.tsx. To restore it, delete the redirect below and
// uncomment this line:
// export { default } from './ClientLedgerPage';
import { redirect } from 'next/navigation';

export default function SwitchedOff() {
  redirect('/projects');
}
