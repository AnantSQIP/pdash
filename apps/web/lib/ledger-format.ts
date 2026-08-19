/**
 * Formatting for the client ledger.
 *
 * Kept out of the components because the same figure appears in the table, the detail panel and
 * the override form, and a number that reads "1,240h" in one place and "1240.0 hrs" in another
 * looks like two different numbers.
 */

/** Hours, to one decimal, thousands-separated. `12.5` → "12.5h", `1240` → "1,240h". */
export function formatHours(hours: number | null | undefined): string {
  if (hours == null) return '—';
  const rounded = Math.round(hours * 10) / 10;
  // Trailing ".0" is noise on a whole number of hours; keep it only when it carries a value.
  const text = Number.isInteger(rounded)
    ? rounded.toLocaleString('en-IN')
    : rounded.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${text}h`;
}

const SYMBOL: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

/**
 * Money, grouped the Indian way for rupees (₹47,50,000) and the western way otherwise — the
 * figures are read by people here, and 4750000 is unreadable in any grouping but the familiar one.
 */
export function formatMoney(amount: number | null | undefined, currency = 'INR'): string {
  if (amount == null) return '—';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  const text = amount.toLocaleString(locale, { maximumFractionDigits: 2 });
  return `${SYMBOL[currency] ?? `${currency} `}${text}`;
}
