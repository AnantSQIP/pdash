/**
 * Tests for client-code suggestion and validation.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/client-code.spec.ts
 *
 * Plain assertions, no framework — this repo has none, and a client code appears in patent IDs
 * that leave the building, so the rules are worth pinning down before they reach a person.
 */
import {
  suggestClientCode, validateClientCode, findSimilarClients,
  CLIENT_CODE_MIN, CLIENT_CODE_MAX,
} from '../apps/api/src/common/client-code';

let pass = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; return; }
  failures.push(`${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

// ── base cases: ordinary company names ────────────────────────────────────────
eq(suggestClientCode('Milkbasket'), 'MLK', 'single word → first letter + consonants');
eq(suggestClientCode('Google'), 'GGL', 'Google → GGL');
eq(suggestClientCode('Amazon'), 'AMZ', 'Amazon → AMZ');
eq(suggestClientCode('Tesla'), 'TSL', 'Tesla → TSL');
eq(suggestClientCode('Apple'), 'APL', 'doubled letters collapse (not APP)');
eq(suggestClientCode('Tata Consultancy Services'), 'TCS', 'multi-word → initials');
eq(suggestClientCode('Hewlett Packard'), 'HP', 'two words → two initials');

// ── company suffixes are noise ────────────────────────────────────────────────
eq(suggestClientCode('Tata Consultancy Services Limited'), 'TCS', 'drops Limited');
eq(suggestClientCode('Infosys Technologies Pvt Ltd'), 'IT', 'drops Pvt and Ltd');
eq(suggestClientCode('The Coca Cola Company'), 'CC', 'drops The and Company');

// ── edge: punctuation, accents, digits ────────────────────────────────────────
eq(suggestClientCode('Johnson & Johnson'), 'JJ', 'ampersand is not a word');
eq(suggestClientCode('Nestlé'), 'NST', 'accents folded');
eq(suggestClientCode('AT&T'), 'AT', 'AT&T → AT');
eq(suggestClientCode('Coca-Cola'), 'CC', 'hyphen splits words');
eq(suggestClientCode('3M'), '3M', 'digits allowed — 3M is a real client code');
eq(suggestClientCode('7-Eleven'), '7E', 'digit + word initial');

// ── edge: vowel-heavy and very short names ────────────────────────────────────
eq(suggestClientCode('AIA'), 'AIA', 'no consonants to take → plain letters');
eq(suggestClientCode('IEEE'), 'IEE', 'all vowels → first three letters');
eq(suggestClientCode('Ai'), 'AI', 'two letters is a legal code');
eq(suggestClientCode('A'), '', 'one letter cannot make a code');
eq(suggestClientCode('IBM'), 'IBM', 'existing acronym survives intact');

// ── edge: nothing usable ──────────────────────────────────────────────────────
eq(suggestClientCode(''), '', 'empty name');
eq(suggestClientCode('   '), '', 'whitespace only');
eq(suggestClientCode('!!!'), '', 'punctuation only');
eq(suggestClientCode('株式会社'), '', 'non-Latin script yields nothing, not garbage');
eq(suggestClientCode('123'), '', 'digits only cannot start a code');

// ── edge: long names stay within the limit ────────────────────────────────────
const long = suggestClientCode('International Business Machines Corporation Holdings Group');
eq(long.length <= CLIENT_CODE_MAX, true, `long name within ${CLIENT_CODE_MAX} chars (got ${long})`);
eq(suggestClientCode('Supercalifragilisticexpialidocious').length <= CLIENT_CODE_MAX, true, 'long single word bounded');

// ── collisions ────────────────────────────────────────────────────────────────
eq(suggestClientCode('Milkbasket', ['MLK']), 'MLK2', 'collision → numeric suffix');
eq(suggestClientCode('Milkbasket', ['MLK', 'MLK2']), 'MLK3', 'walks past taken suffixes');
eq(suggestClientCode('Milkbasket', ['mlk']), 'MLK2', 'collision check is case-insensitive');
eq(suggestClientCode('Testing'), 'TST', 'TST is fine; TEST is reserved but not derived here');
eq(suggestClientCode('New'), 'NW', 'only the exact word NEW is reserved, NW is fine');

// suffix must not push past the maximum
const big = suggestClientCode('International Business Machines Corp', ['IBMC']);
eq(big.length <= CLIENT_CODE_MAX, true, `suffixed code stays within limit (got ${big})`);

// ── validation ────────────────────────────────────────────────────────────────
eq(validateClientCode('MLK'), null, 'valid code');
eq(validateClientCode('mlk'), null, 'lower case accepted (upper-cased)');
eq(validateClientCode('AB'), null, `minimum length ${CLIENT_CODE_MIN}`);
eq(validateClientCode('ABCDE'), null, `maximum length ${CLIENT_CODE_MAX}`);
eq(validateClientCode(''), 'empty', 'empty rejected');
eq(validateClientCode('A'), 'too_short', 'one character rejected');
eq(validateClientCode('ABCDEF'), 'too_long', 'six characters rejected');
eq(validateClientCode('ML-K'), 'charset', 'punctuation rejected');
eq(validateClientCode('ML K'), 'charset', 'spaces rejected');
eq(validateClientCode('1MLK'), null, 'leading digit allowed when a letter is present');
eq(validateClientCode('123'), 'charset', 'no letter at all is rejected');
eq(validateClientCode('M2K'), null, 'digits allowed after the first character');
eq(validateClientCode('TEST'), 'reserved', 'reserved word rejected');
eq(validateClientCode('MLK', ['MLK']), 'taken', 'existing code rejected');
eq(validateClientCode('mlk', ['MLK']), 'taken', 'taken check is case-insensitive');

// ── similar-name detection (the split-portfolio failure) ──────────────────────
const CLIENTS = [
  { name: 'Milkbasket', code: 'MLK' },
  { name: 'Tesla Motors', code: 'TSL' },
  { name: null, code: 'XYZ' },
];
eq(findSimilarClients('Milk Basket', CLIENTS).map(c => c.code), ['MLK'], 'spacing difference matched');
eq(findSimilarClients('milkbasket', CLIENTS).map(c => c.code), ['MLK'], 'case difference matched');
eq(findSimilarClients('Tesla', CLIENTS).map(c => c.code), ['TSL'], 'prefix of existing name matched');
eq(findSimilarClients('Rivian', CLIENTS).map(c => c.code), [], 'unrelated name not matched');
eq(findSimilarClients('', CLIENTS).map(c => c.code), [], 'empty name matches nothing');
eq(findSimilarClients('AB', CLIENTS).map(c => c.code), [], 'too short to compare safely');

// ── every suggestion must itself be valid ─────────────────────────────────────
for (const n of ['Milkbasket', 'Google', 'Tata Consultancy Services', 'Nestlé', '3M', 'AIA', 'Johnson & Johnson']) {
  const s = suggestClientCode(n);
  if (s) eq(validateClientCode(s), null, `suggestion for "${n}" ("${s}") passes validation`);
}

// ── report ────────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
}
console.log('All client-code rules hold.\n');
