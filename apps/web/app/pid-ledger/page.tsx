// The PID Ledger became the CID Ledger when PIDs were renamed CIDs (Client IDs). This path is kept
// so bookmarks and old notification links still land somewhere useful.
import { redirect } from 'next/navigation';

export default function PidLedgerMoved() {
  redirect('/cid-ledger');
}
