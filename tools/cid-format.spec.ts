/**
 * The CID's format, prefix rule and vocabulary — and that the migration agrees with the code.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/cid-format.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * WHY THE MIGRATION IS READ HERE
 *
 * The status and event vocabularies are held by the database as CHECK constraints: a type the code
 * writes and the CHECK does not list is a transaction that fails in production. So the lists are
 * compared, not trusted.
 *
 * Since workspace flows (docs/WORKSPACE_FLOWS.md) the migration is flow-neutral: the registry CHECK
 * is the UNION of both flows' states (PROJECTS still holds RESERVED / RELEASED / EXPIRED PIDs), there
 * is no SQL backfill (giving existing projects a CID is the PROJECTS → CLIENTS conversion's job, and
 * the conversion's own suite pins its prefix rule), and "a live client has a CID" is kept by the
 * CLIENTS code, not by a table constraint — PROJECTS allows a project whose PID is still pending.
 */
process.env.TZ = 'Asia/Kolkata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CID_EVENT_LABELS, CID_EVENT_TYPES, CID_PATTERN, CID_PREFIX_FALLBACK, CID_PREFIX_MAX,
  CID_REGISTRY_STATUSES, CID_RETIRED_STATUSES, cidPrefix, formatCid, isRetiredCid, parseCid,
} from '../apps/api/src/common/cid/cid';
import { financialYear } from '../apps/api/src/common/financial-year';

let passed = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
}

// ── the prefix ──────────────────────────────────────────────────────────────
check('an ordinary code is used as it is', cidPrefix('SQ'), 'SQ');
check('lower case is upper-cased', cidPrefix('sq'), 'SQ');
check("the seed's 'pdash-demo' becomes a prefix the parser accepts", cidPrefix('pdash-demo'), 'PDASHDEMO');
check('anything that is not a letter or digit goes', cidPrefix(' Sq.IP / Legal '), 'SQIPLEGAL');
check(`a long code is cut to ${CID_PREFIX_MAX}`, cidPrefix('a'.repeat(40)).length, CID_PREFIX_MAX);
check('an empty code falls back', cidPrefix(''), CID_PREFIX_FALLBACK);
check('a code of nothing but punctuation falls back', cidPrefix('--__..'), CID_PREFIX_FALLBACK);
check('no code at all falls back', cidPrefix(null), CID_PREFIX_FALLBACK);

// Every prefix the rule can produce makes CIDs that the pattern and the parser accept.
for (const code of ['pdash-demo', 'SQ', 'x', '---', 'Squark IP (Gurgaon)', 'a'.repeat(40)]) {
  const prefix = cidPrefix(code);
  const cid = formatCid(prefix, '26_27', 7);
  check(`a CID minted for "${code}" matches the CID pattern`, CID_PATTERN.test(cid), true);
  const parsed = parseCid(cid, prefix);
  check(`…and parses back to itself`, 'error' in parsed ? parsed.error : parsed.cid, cid);
}

// ── format and parse ────────────────────────────────────────────────────────
check('serials are padded to three', formatCid('SQ', '26_27', 1), 'SQ_26_27_001');
check('and grow past 999', formatCid('SQ', '26_27', 1234), 'SQ_26_27_1234');
check('a sloppy CID is canonicalised', (p => ('error' in p ? p.error : p.cid))(parseCid(' sq_26_27_1 ', 'SQ')), 'SQ_26_27_001');
check('another prefix is refused', 'error' in parseCid('AB_26_27_001', 'SQ'), true);
check('non-consecutive years are refused', 'error' in parseCid('SQ_26_28_001', 'SQ'), true);
check('serial 0 is refused', 'error' in parseCid('SQ_26_27_000', 'SQ'), true);
check('the refusal says CID, never PID', /\bPID\b/.test(JSON.stringify(['x', 'AB_26_27_001', 'SQ_26_28_001', 'SQ_26_27_000']
  .map(r => parseCid(r, 'SQ')))), false);
check('the financial year label is Indian (April start)', [
  financialYear(new Date('2026-03-31T12:00:00+05:30')).label,
  financialYear(new Date('2026-04-01T00:30:00+05:30')).label,
], ['25_26', '26_27']);

// ── vocabularies ────────────────────────────────────────────────────────────
check('retired statuses are PURGED, MERGED, DISCONTINUED', [...CID_RETIRED_STATUSES].sort(), ['DISCONTINUED', 'MERGED', 'PURGED']);
check('ATTACHED and DELETED are not retired', [isRetiredCid('ATTACHED'), isRetiredCid('DELETED')], [false, false]);
check('every event type has a label', CID_EVENT_TYPES.filter(t => !CID_EVENT_LABELS[t]), []);

// ── the migration agrees ────────────────────────────────────────────────────
const MIGRATION = join(__dirname, '..', 'packages', 'db', 'prisma', 'migrations',
  '20261020120000_cid_auto_mint_and_ledger', 'migration.sql');
const sql = readFileSync(MIGRATION, 'utf8');
const listIn = (constraint: string) => {
  const m = new RegExp(`"${constraint}"\\s*CHECK\\s*\\(\\s*"(?:status|type)"\\s+IN\\s*\\(([^)]*)\\)`, 'i').exec(sql);
  return m ? [...m[1].matchAll(/'([A-Z_]+)'/g)].map(x => x[1]).sort() : null;
};
// PROJECTS' own registry states: a 5-minute hold, and the two it could end in before the ledger.
const PID_ONLY_STATUSES = ['RESERVED', 'RELEASED', 'EXPIRED'];
check('the registry CHECK lists exactly the statuses both flows use',
  listIn('pid_reservation_status_check'), [...new Set([...CID_REGISTRY_STATUSES, ...PID_ONLY_STATUSES])].sort());
check('the ledger CHECK lists exactly the event types the code writes',
  listIn('cid_event_type_check'), [...CID_EVENT_TYPES].sort());
check('no SQL backfill: the migration mints nothing (the conversion does, per organisation)',
  /lpad\(|regexp_replace\(/.test(sql), false);
check('a project without a number is NOT refused by the database (PROJECTS allows a pending PID)',
  /"deletedAt" IS NOT NULL OR "code" IS NOT NULL/.test(sql), false);
check('the ledger refuses edits', /BEFORE UPDATE ON "cid_event"/.test(sql), true);

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ cid format: ${passed}/${passed} passed`);
