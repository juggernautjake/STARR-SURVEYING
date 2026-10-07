// lib/receipts/spending.ts — where the money went, by kind of thing bought, over any period.
//
// Owner, 2026-10-07: "The system also needs to be able to split off all of the receipt items into
// categories. we might have supplies and food and who knows what all on the same receipt. we need to
// be able to do daily, weekly, monthly, quarterly, bi-yearly, and yearly analysis of and filtering
// by type of item that was purchased. That way we can determine what all money is going to
// different kinds of things."
//
// Pure: receipts and their line items in, buckets out. The rules that make the numbers trustworthy:
//
//   * Each line item counts toward ITS OWN category (receipt_line_items.category), so a gas-station
//     run of fuel, water and zip ties lands in fuel, meals and supplies.
//   * Tax, tip and fees are spread over a receipt's items in proportion to their amounts, so the
//     categories of a receipt add up to exactly what was paid — the report reconciles to the money.
//   * A receipt with no item lines counts in full toward the receipt's own category.
//   * Rejected receipts, and receipts that are the second slip of a purchase already counted
//     (superseded_by_receipt_id), are left out — the same purchase is never counted twice.
//   * Periods are cut on Central time, because a 9 PM Monday receipt was bought on Monday.

export type Period = 'day' | 'week' | 'month' | 'quarter' | 'half' | 'year';

export const PERIODS: Array<{ id: Period; label: string }> = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'quarter', label: 'Quarterly' },
  { id: 'half', label: 'Half-yearly' },
  { id: 'year', label: 'Yearly' },
];

export const CATEGORY_LABEL: Record<string, string> = {
  fuel: 'Fuel', meals: 'Meals & drinks', supplies: 'Supplies', equipment: 'Equipment', tolls: 'Tolls',
  parking: 'Parking', lodging: 'Lodging', professional_services: 'Professional services',
  office_supplies: 'Office supplies', client_entertainment: 'Client entertainment', other: 'Other',
  uncategorized: 'Not categorised',
};

export interface SpendReceipt {
  id: string;
  transaction_at: string | null;
  total_cents: number | null;
  category: string | null;
  status: string | null;
  superseded_by_receipt_id?: string | null;
  vendor_name?: string | null;
}

export interface SpendItem {
  receipt_id: string;
  description: string | null;
  amount_cents: number | null;
  category: string | null;
}

export interface SpendBucket {
  key: string;
  label: string;
  total: number;
  byCategory: Record<string, number>;
  receipts: number;
}

export interface SpendReport {
  period: Period;
  buckets: SpendBucket[];
  /** Totals over the whole range, largest first. */
  categories: Array<{ category: string; label: string; total: number; share: number }>;
  total: number;
  receiptCount: number;
  /** What was bought most, by money, within the filtered category (or overall). */
  topItems: Array<{ description: string; category: string; total: number; count: number }>;
  /** Receipts left out, and why — so the report never quietly ignores money. */
  excluded: { rejected: number; secondSlip: number; undated: number };
}

const TZ = 'America/Chicago';

/** The Central-time calendar date of an instant: [year, month 1-12, day]. */
export function centralDate(iso: string): [number, number, number] {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const [y, m, d] = parts.split('-').map(Number);
  return [y, m, d];
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The bucket a date falls in, with a label a person reads. Weeks start on Monday. Pure. */
export function bucketOf(iso: string, period: Period): { key: string; label: string } {
  const [y, m, d] = centralDate(iso);
  switch (period) {
    case 'day':
      return { key: `${y}-${pad(m)}-${pad(d)}`, label: `${MONTHS[m - 1]} ${d}, ${y}` };
    case 'week': {
      const dt = new Date(Date.UTC(y, m - 1, d));
      const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
      dt.setUTCDate(dt.getUTCDate() - dow);
      const [wy, wm, wd] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
      return { key: `${wy}-${pad(wm)}-${pad(wd)}`, label: `Week of ${MONTHS[wm - 1]} ${wd}, ${wy}` };
    }
    case 'month':
      return { key: `${y}-${pad(m)}`, label: `${MONTHS[m - 1]} ${y}` };
    case 'quarter': {
      const q = Math.ceil(m / 3);
      return { key: `${y}-Q${q}`, label: `Q${q} ${y}` };
    }
    case 'half': {
      const h = m <= 6 ? 1 : 2;
      return { key: `${y}-H${h}`, label: `${h === 1 ? 'Jan–Jun' : 'Jul–Dec'} ${y}` };
    }
    default:
      return { key: `${y}`, label: `${y}` };
  }
}

/** Split a receipt's total over its items' categories, tax and tip included. Pure. Cents stay whole:
 *  the rounding remainder goes to the largest share, so the parts always sum to the total exactly. */
export function allocate(totalCents: number, items: SpendItem[], fallbackCategory: string | null): Record<string, number> {
  const priced = items.filter((i) => typeof i.amount_cents === 'number' && (i.amount_cents as number) > 0);
  const base = priced.reduce((s, i) => s + (i.amount_cents as number), 0);
  if (!priced.length || base <= 0) return { [fallbackCategory || 'uncategorized']: totalCents };
  const byCat: Record<string, number> = {};
  for (const i of priced) {
    const c = i.category || fallbackCategory || 'uncategorized';
    byCat[c] = (byCat[c] ?? 0) + (i.amount_cents as number);
  }
  const out: Record<string, number> = {};
  let assigned = 0;
  for (const [c, amt] of Object.entries(byCat)) {
    out[c] = Math.floor((amt / base) * totalCents);
    assigned += out[c];
  }
  const largest = Object.keys(out).sort((a, b) => byCat[b] - byCat[a])[0];
  out[largest] += totalCents - assigned;
  return out;
}

export function buildSpendReport(
  receipts: SpendReceipt[],
  items: SpendItem[],
  opts: { period: Period; category?: string | null },
): SpendReport {
  const itemsBy = new Map<string, SpendItem[]>();
  for (const i of items) itemsBy.set(i.receipt_id, [...(itemsBy.get(i.receipt_id) ?? []), i]);
  const buckets = new Map<string, SpendBucket>();
  const catTotals: Record<string, number> = {};
  const top = new Map<string, { description: string; category: string; total: number; count: number }>();
  const excluded = { rejected: 0, secondSlip: 0, undated: 0 };
  let total = 0;
  let receiptCount = 0;

  for (const r of receipts) {
    if (r.status === 'rejected') { excluded.rejected += 1; continue; }
    if (r.superseded_by_receipt_id) { excluded.secondSlip += 1; continue; }
    if (!r.transaction_at || !r.total_cents) { excluded.undated += r.transaction_at ? 0 : 1; continue; }
    const lines = itemsBy.get(r.id) ?? [];
    const split = allocate(r.total_cents, lines, r.category);
    const wanted = opts.category ? { [opts.category]: split[opts.category] ?? 0 } : split;
    const sum = Object.values(wanted).reduce((s, v) => s + v, 0);
    if (opts.category && sum === 0) continue;
    const { key, label } = bucketOf(r.transaction_at, opts.period);
    const b = buckets.get(key) ?? { key, label, total: 0, byCategory: {}, receipts: 0 };
    for (const [c, v] of Object.entries(wanted)) {
      b.byCategory[c] = (b.byCategory[c] ?? 0) + v;
      catTotals[c] = (catTotals[c] ?? 0) + v;
    }
    b.total += sum;
    b.receipts += 1;
    buckets.set(key, b);
    total += sum;
    receiptCount += 1;
    for (const l of lines) {
      const c = l.category || r.category || 'uncategorized';
      if (opts.category && c !== opts.category) continue;
      if (!l.description || !l.amount_cents) continue;
      const k = `${c}|${l.description.toLowerCase().replace(/\s+/g, ' ').trim()}`;
      const t = top.get(k) ?? { description: l.description, category: c, total: 0, count: 0 };
      t.total += l.amount_cents;
      t.count += 1;
      top.set(k, t);
    }
  }

  return {
    period: opts.period,
    buckets: [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)),
    categories: Object.entries(catTotals)
      .map(([category, t]) => ({ category, label: CATEGORY_LABEL[category] ?? category, total: t, share: total ? t / total : 0 }))
      .sort((a, b) => b.total - a.total),
    total,
    receiptCount,
    topItems: [...top.values()].sort((a, b) => b.total - a.total).slice(0, 15),
    excluded,
  };
}
