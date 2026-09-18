'use client';

/**
 * A client's CID in the page header.
 *
 * Every client is given its CID automatically in the transaction that creates it, so there is no
 * pending state, no request and nothing to attach — this only shows the number (and, for the rare
 * CID that holds more than one client, how many). Changing it is the "Change CID" button beside
 * Edit, for those allowed to. A missing CID cannot happen for a live client; it renders as a dash.
 */
export function CidBadge({ cid, multiRound, roundsCount }: {
  cid: string | null;
  multiRound: boolean;
  roundsCount: number;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 font-mono ring-1 ring-gray-200"
      title="Client ID — issued automatically when the client was created"
    >
      <span className="font-sans font-medium text-gray-400">CID</span>
      {cid || '—'}
      {multiRound && <span className="font-sans font-medium text-gray-500">· {roundsCount} under this CID</span>}
    </span>
  );
}
