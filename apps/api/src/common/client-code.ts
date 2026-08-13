/**
 * Client codes — the "MLK" in Pat_MLK_001.
 *
 * A code is TYPED by a Super Admin, not generated: it appears in patent IDs that get shared
 * outside the firm, so a human has to be able to read "MLK" and think "Milkbasket". What this
 * module does is SUGGEST a good default from the client's name, so the convention holds without
 * anyone having to remember it, and validate whatever is finally typed.
 *
 * Nothing here decides anything on its own. `suggestClientCode` is a proposal the caller is free
 * to ignore; `validateClientCode` is the rule that actually binds.
 */

/**
 * Codes are 2–5 characters of A–Z and digits, and must contain at least one letter.
 * Digits are allowed anywhere because "3M" and "7E" are real client codes; the letter
 * requirement is what stops a meaningless "123" reaching a patent handle.
 */
export const CLIENT_CODE_MIN = 2;
export const CLIENT_CODE_MAX = 5;
const CODE_RE = /^[A-Z0-9]{2,5}$/;
const HAS_LETTER = /[A-Z]/;

/**
 * Words that carry no identity, so they are dropped before taking initials. "Tata Consultancy
 * Services" should suggest TCS, not TCSL from "…Services Limited". Kept deliberately short:
 * every entry here is a word that can never be the distinguishing part of a client's name.
 */
const STOP_WORDS = new Set([
  'the', 'and', 'of', 'for', 'a', 'an',
  'inc', 'incorporated', 'ltd', 'limited', 'llc', 'llp', 'plc', 'corp', 'corporation',
  'company', 'co', 'gmbh', 'ag', 'sa', 'nv', 'bv', 'pvt', 'private', 'pte',
  'group', 'holdings', 'holding', 'international', 'global',
]);

/**
 * Reserved because they collide with things the system already means. A client coded "NEW"
 * would produce Pat_NEW_001, which reads like a placeholder rather than a client.
 */
const RESERVED = new Set(['NEW', 'ALL', 'NONE', 'NULL', 'TEST', 'TEMP', 'PAT', 'SQ', 'TBD', 'NA']);

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/** Strip accents and anything that is not a letter, digit or space. "Nestlé" → "NESTLE". */
function normalize(raw: string): string {
  return (raw || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // é → e
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A single word → its first letter plus the consonants that follow, e.g. Milkbasket → MLK,
 * Google → GGL, Amazon → AMZ. The first letter is always kept even when it is a vowel, because
 * that is the letter people recognise the name by. Consecutive repeats collapse (Apple → APL,
 * not APP) since a doubled letter carries no extra information.
 */
function fromSingleWord(word: string, want = 3): string {
  if (!word) return '';
  let out = word[0];
  for (let i = 1; i < word.length && out.length < want; i++) {
    const ch = word[i];
    if (VOWELS.has(ch)) continue;
    if (ch === word[i - 1]) continue; // a doubled letter carries no extra information
    out += ch;
  }
  // Too few consonants to work with ("AIA", "IEEE") — fall back to plain letters so the
  // suggestion is still recognisable rather than a single character.
  if (out.length < CLIENT_CODE_MIN) out = word.slice(0, want);
  return out;
}

/**
 * Suggest a client code from a name. Returns '' when nothing sensible can be derived — the
 * caller should then leave the field empty rather than offer a meaningless default.
 *
 * `taken` are codes already in use; a collision gets a numeric suffix (MLK → MLK2) rather than
 * silently proposing a duplicate the save would reject.
 */
export function suggestClientCode(name: string, taken: Iterable<string> = []): string {
  const cleaned = normalize(name);
  if (!cleaned) return '';

  const words = cleaned.split(' ').filter(Boolean);
  const significant = words.filter(w => !STOP_WORDS.has(w.toLowerCase()));
  // If stop-words were the whole name ("The Company"), fall back to the raw words.
  const parts = significant.length ? significant : words;

  let base: string;
  if (parts.length >= 2) {
    // Multi-word → initials. "Tata Consultancy Services" → TCS.
    // "Hewlett Packard" → HP, "Johnson & Johnson" → JJ, "Coca Cola" → CC. Two letters is
    // thin but it is the convention people actually use, and it stays overridable.
    base = parts.map(w => w[0]).join('').slice(0, CLIENT_CODE_MAX);
  } else {
    base = fromSingleWord(parts[0], 3);
  }

  base = base.replace(/[^A-Z0-9]/g, '');
  // Digits are fine; a code with NO letter is not ("123" tells nobody anything).
  if (!HAS_LETTER.test(base)) return '';
  if (base.length < CLIENT_CODE_MIN) return '';
  base = base.slice(0, CLIENT_CODE_MAX);

  // Avoid proposing something the system reserves, or a code already in use.
  const used = new Set([...taken].map(c => c.toUpperCase()));
  const blocked = (c: string) => used.has(c) || RESERVED.has(c);
  if (!blocked(base)) return base;

  const stem = base.slice(0, CLIENT_CODE_MAX - 1);
  for (let n = 2; n <= 9; n++) {
    const candidate = `${stem}${n}`;
    if (!blocked(candidate)) return candidate;
  }
  return ''; // nine collisions on one stem — let the human choose
}

export type CodeProblem = 'empty' | 'too_short' | 'too_long' | 'charset' | 'reserved' | 'taken';

/**
 * Validate a code the user actually typed. Returns null when it is fine, otherwise the reason —
 * the caller turns that into a message, so the rule lives in one place and the wording in another.
 */
export function validateClientCode(raw: string, taken: Iterable<string> = []): CodeProblem | null {
  const code = (raw || '').trim().toUpperCase();
  if (!code) return 'empty';
  if (code.length < CLIENT_CODE_MIN) return 'too_short';
  if (code.length > CLIENT_CODE_MAX) return 'too_long';
  if (!CODE_RE.test(code) || !HAS_LETTER.test(code)) return 'charset';
  if (RESERVED.has(code)) return 'reserved';
  if ([...taken].map(c => c.toUpperCase()).includes(code)) return 'taken';
  return null;
}

/**
 * Does this name look like one we already have a client for? Compares on the normalised,
 * space-stripped form, so "Milk Basket" matches "Milkbasket" and a second client code is not
 * quietly created for the same company — the failure mode that splits a patent portfolio in two.
 */
export function findSimilarClients<T extends { name?: string | null; code: string }>(
  name: string,
  clients: readonly T[],
): T[] {
  const key = normalize(name).replace(/\s/g, '');
  if (key.length < 3) return [];
  return clients.filter(c => {
    const other = normalize(c.name ?? '').replace(/\s/g, '');
    if (!other) return false;
    return other === key || other.includes(key) || key.includes(other);
  });
}
