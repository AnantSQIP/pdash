/**
 * Tests for looking a patent up by an ID it no longer has.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/patent-search.spec.ts
 *
 * Plain assertions, no framework — same as tools/client-code.spec.ts. These rules decide whether
 * an ID a client quotes from an old email finds anything, so they are worth pinning down.
 */
import { patentMatches, matchedFormerHandle, type SearchablePatent } from '../apps/web/lib/patent-search';
import { formatHours, formatMoney } from '../apps/web/lib/ledger-format';

let pass = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; return; }
  failures.push(`${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

const renamed: SearchablePatent = { handle: 'Pat_MLKB_007', formerHandles: ['Pat_MLK_7', 'Pat_ML2_007'] };
const fresh: SearchablePatent = { handle: 'Pat_WLN_001' };
const noHistory: SearchablePatent = { handle: 'Pat_ADC_002', formerHandles: [] };

// ── Matching on the live handle ──────────────────────────────────────────────
eq(patentMatches(renamed, 'MLKB'), true, 'matches its current handle');
eq(patentMatches(renamed, 'pat_mlkb_007'), true, 'matching is case-insensitive');
eq(patentMatches(renamed, '007'), true, 'matches a fragment of the current handle');
eq(patentMatches(fresh, 'WLN'), true, 'a patent with no history still matches normally');
eq(patentMatches(noHistory, 'ADC'), true, 'an empty history is not treated as missing');

// ── Matching on a retired handle: the whole point ────────────────────────────
eq(patentMatches(renamed, 'Pat_MLK_7'), true, 'finds a patent by the ID it was shared under');
eq(patentMatches(renamed, 'ML2'), true, 'finds it by any earlier ID, not just the most recent');
eq(patentMatches(fresh, 'MLK'), false, 'does not match an unrelated patent');
eq(patentMatches(noHistory, 'MLK'), false, 'an empty history matches nothing extra');

// ── Empty and whitespace queries list everything rather than nothing ─────────
eq(patentMatches(renamed, ''), true, 'an empty query matches everything');
eq(patentMatches(renamed, '   '), true, 'a whitespace query matches everything');
eq(patentMatches(fresh, '  WLN '), true, 'surrounding whitespace is ignored');

// ── Explaining WHY a result appeared ─────────────────────────────────────────
eq(matchedFormerHandle(renamed, 'Pat_MLK_7'), 'Pat_MLK_7', 'reports which retired ID matched');
eq(matchedFormerHandle(renamed, 'ml2'), 'Pat_ML2_007', 'reports it case-insensitively');
eq(matchedFormerHandle(renamed, 'MLKB'), null, 'says nothing when the live handle matched');
eq(matchedFormerHandle(renamed, ''), null, 'says nothing for an empty query');
eq(matchedFormerHandle(fresh, 'WLN'), null, 'says nothing when there is no history');
eq(matchedFormerHandle(renamed, 'zzz'), null, 'says nothing when nothing matched');

// A live handle that also appears in the history must NOT be reported as a former match —
// the rename path keeps the two disjoint, and this is what would break if it stopped.
const selfReferencing: SearchablePatent = { handle: 'Pat_AAA_1', formerHandles: ['Pat_AAA_1'] };
eq(matchedFormerHandle(selfReferencing, 'Pat_AAA_1'), null, 'a live handle is never reported as former');

// ── Ledger formatting ────────────────────────────────────────────────────────
// Same number must read the same way in the table, the panel and the override form.
eq(formatHours(0), '0h', 'zero hours');
eq(formatHours(12.5), '12.5h', 'a half hour keeps its decimal');
eq(formatHours(1240), '1,240h', 'thousands are grouped');
eq(formatHours(1240.04), '1,240h', 'a whole number drops the trailing .0');
eq(formatHours(null), '—', 'no hours reads as a dash, not as zero');
eq(formatMoney(null), '—', 'no amount reads as a dash, not as zero');
eq(formatMoney(0), '₹0', 'zero rupees is a real figure, not absence');
eq(formatMoney(4750000, 'INR'), '₹47,50,000', 'rupees group the Indian way');
eq(formatMoney(4750000, 'USD'), '$4,750,000', 'dollars group the western way');
eq(formatMoney(1234.5, 'EUR'), '€1,234.5', 'a currency with a symbol uses it');

if (failures.length) {
  console.error(`\n${failures.length} FAILED:\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  console.error(`${pass} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
console.log('Retired patent IDs still resolve, and ledger figures read the same everywhere.');
