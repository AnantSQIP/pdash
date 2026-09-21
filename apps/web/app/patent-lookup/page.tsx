// CLIENTS-FLOW: commented out — patent IDs are switched off (lib/features.ts).
// The page is untouched in ./PatentLookupPage.tsx. To restore it, delete the redirect below and
// uncomment this line:
// export { default } from './PatentLookupPage';
import { redirect } from 'next/navigation';

export default function SwitchedOff() {
  redirect('/projects');
}
