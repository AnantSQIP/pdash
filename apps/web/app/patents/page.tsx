// CLIENTS-FLOW: commented out — the patent portal is switched off (lib/features.ts).
// The page is untouched in ./PatentPortalPage.tsx. To restore it, delete the redirect below and
// uncomment this line:
// export { default } from './PatentPortalPage';
import { redirect } from 'next/navigation';

export default function SwitchedOff() {
  redirect('/projects');
}
