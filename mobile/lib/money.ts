/**
 * Money formatting + parsing.
 *
 * Cents-based amounts are the canonical storage form across the app
 * (receipts.total_cents, daily_time_logs.total_pay_cents, etc.) so we
 * never deal with floating-point rounding. These helpers convert to
 * and from the human-facing dollar string.
 *
 * Locale: USD only for v1. Starr Surveying invoices in USD; the
 * bookkeeper exports to QuickBooks (also USD). When the company
 * eventually does work in MX or CA, swap to Intl.NumberFormat with the
 * appropriate locale and currency code.
 */

/**
 * Cents → "$12.34". Returns "—" for null/undefined/non-finite values
 * so callers don't need to guard at every render site.
 */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${formatThousands(dollars)}.${pad2(remainder)}`;
}

/**
 * "12.34" / "$12.34" / "12" → 1234 cents. Returns null when the input
 * doesn't parse — caller decides whether that's an error or "leave
 * the field empty."
 *
 * Tolerates: leading "$", thousands separators (",") , trailing
 * whitespace. Rejects: negatives (use a separate field for refunds),
 * scientific notation, multiple decimals.
 */
export function parseCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  const trimmed = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (trimmed === '') return null;
  // Allow "12", "12.3", "12.34" — reject "12.345", "12.3.4", "1e2".
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = '0'] = trimmed.split('.');
  const wholeCents = parseInt(whole, 10) * 100;
  const fractionCents = parseInt(fraction.padEnd(2, '0'), 10);
  if (!Number.isFinite(wholeCents) || !Number.isFinite(fractionCents)) {
    return null;
  }
  return wholeCents + fractionCents;
}

function formatThousands(n: number): string {
  // Avoids Intl.NumberFormat overhead for the hot-path render loop;
  // for receipt totals we never see >$999,999.
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
