// lib/voice/money.ts — invoice arithmetic, in cents, with no floats anywhere.
//
// Everything here is pure so the totals can be locked by tests. The rule the rest of the platform
// relies on: an invoice's stored totals are always derivable from its line items, and this file is
// the only thing allowed to derive them. A route that computes a subtotal inline is a route that will
// eventually disagree with the PDF.
//
// ── WHY QUANTITY IS IN THOUSANDTHS ──────────────────────────────────────────────────────────────
//
// Voice work is billed in units that are not whole: 1.5 hours of studio time, 0.75 of a session,
// 2.5 hours of coaching. Storing quantity as a float and multiplying by a cents integer reintroduces
// exactly the rounding error the cents integer was chosen to avoid — 0.1 + 0.2 does not stop being
// 0.30000000000000004 because the other operand is an integer. So quantity is an integer of
// thousandths (1.5 → 1500) and the multiply is integer maths with a single divide at the end.

export interface LineItem {
  description: string;
  /** Thousandths of a unit. 1 unit = 1000. */
  quantity: number;
  /** Price of one unit, in cents. */
  unitCents: number;
  /** Cached line total. Always recomputed on save — never trusted from the client. */
  amountCents?: number;
}

export interface InvoiceTotals {
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
}

/** Line total, rounded half-up to the nearest cent.
 *
 *  `Math.round` is half-up for positive values, which is the convention every invoicing system and
 *  every accountant expects. Banker's rounding would be defensible and would surprise everyone. */
export function lineAmountCents(item: Pick<LineItem, 'quantity' | 'unitCents'>): number {
  const q = Number.isFinite(item.quantity) ? item.quantity : 0;
  const u = Number.isFinite(item.unitCents) ? item.unitCents : 0;
  return Math.round((q * u) / 1000);
}

export function normalizeLineItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => {
      const item: LineItem = {
        description: String(r.description ?? '').slice(0, 500),
        quantity: Math.max(0, Math.round(Number(r.quantity ?? 1000)) || 0),
        unitCents: Math.round(Number(r.unitCents ?? r.unit_cents ?? 0)) || 0,
      };
      item.amountCents = lineAmountCents(item);
      return item;
    })
    .filter((i) => i.description.trim() !== '' || i.amountCents !== 0);
}

/**
 * Recomputes every total from the line items.
 *
 * Discount is applied BEFORE tax, because tax on money that was never charged is money paid to a
 * state on the client's behalf out of Andrew's pocket. `taxRateBasisPoints` is basis points (825 =
 * 8.25%) so a rate is exact rather than a float that has to be trusted.
 */
export function computeInvoiceTotals(
  items: LineItem[],
  opts: { taxRateBasisPoints?: number; discountCents?: number } = {},
): InvoiceTotals {
  const subtotalCents = items.reduce((sum, i) => sum + lineAmountCents(i), 0);
  const discountCents = Math.max(0, Math.min(subtotalCents, Math.round(opts.discountCents ?? 0)));
  const taxable = subtotalCents - discountCents;
  const bp = Math.max(0, Math.round(opts.taxRateBasisPoints ?? 0));
  const taxCents = Math.round((taxable * bp) / 10000);
  return {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents: taxable + taxCents,
  };
}

export function balanceCents(totalCents: number, paidCents: number): number {
  return Math.max(0, Math.round(totalCents) - Math.round(paidCents));
}

export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';

/**
 * The status an invoice should hold, given its money and its calendar.
 *
 * Derived rather than stored-and-mutated so that "overdue" is true the morning it becomes true,
 * without a nightly job. The two states this function will NOT overwrite are `draft` (nobody has
 * been asked to pay yet, so it cannot be overdue) and `void` (a decision, not a computation).
 */
export function deriveInvoiceStatus(invoice: {
  status: InvoiceStatus;
  totalCents: number;
  paidCents: number;
  dueDate?: string | null;
}, today: Date): InvoiceStatus {
  if (invoice.status === 'draft' || invoice.status === 'void') return invoice.status;

  const balance = balanceCents(invoice.totalCents, invoice.paidCents);
  if (balance === 0 && invoice.totalCents > 0) return 'paid';
  // A zero-total invoice that has been sent is a receipt, not a debt.
  if (invoice.totalCents === 0) return 'paid';

  if (invoice.dueDate) {
    // Compared as calendar dates, not instants: an invoice due "today" is not overdue at 00:01 in a
    // timezone the client does not live in.
    const due = new Date(`${invoice.dueDate}T23:59:59`);
    if (!Number.isNaN(due.getTime()) && today.getTime() > due.getTime()) return 'overdue';
  }

  if (invoice.paidCents > 0) return 'partial';
  return 'sent';
}

/** Days until due — negative when overdue. Null when there is no due date. */
export function daysUntilDue(dueDate: string | null | undefined, today: Date): number | null {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - start.getTime()) / 86400000);
}

/** Due date = issue date + terms, as a YYYY-MM-DD string. */
export function dueDateFrom(issueDate: string, termsDays: number): string {
  const d = new Date(`${issueDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return issueDate;
  d.setDate(d.getDate() + Math.max(0, Math.round(termsDays)));
  return d.toISOString().slice(0, 10);
}

// ── Formatting ───────────────────────────────────────────────────────────────────────────────────

/** Cents → "$1,250.00". The only place cents become a decimal string. */
export function formatCents(cents: number | null | undefined, currency = 'USD'): string {
  const value = Number.isFinite(cents as number) ? (cents as number) / 100 : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(value);
}

/** "$1,250" when whole, "$1,250.50" when not — for marketing surfaces where trailing zeros are noise. */
export function formatCentsCompact(cents: number | null | undefined, currency = 'USD'): string {
  const c = Number.isFinite(cents as number) ? (cents as number) : 0;
  const whole = c % 100 === 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(c / 100);
}

/** Thousandths → "1.5" / "2" — the quantity as a human reads it. */
export function formatQuantity(thousandths: number): string {
  const v = (Number.isFinite(thousandths) ? thousandths : 0) / 1000;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '');
}

/** "1.5" → 1500. Tolerates blanks and junk by falling back to one unit. */
export function parseQuantity(input: string | number): number {
  const n = typeof input === 'number' ? input : parseFloat(String(input).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return 1000;
  return Math.round(n * 1000);
}

/** "$1,250.00" / "1250" / "1,250.5" → 125000 cents. */
export function parseCents(input: string | number): number {
  if (typeof input === 'number') return Math.round(input * 100);
  const cleaned = String(input).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

// ── Numbering ────────────────────────────────────────────────────────────────────────────────────

/**
 * Next document number in a `PREFIX-YYYY-NNN` series.
 *
 * Sequence resets per year, which is what a sole proprietor's bookkeeping expects, and the parse is
 * defensive: any existing number that does not match the pattern is ignored rather than crashing the
 * next invoice. Numbers are derived from the highest EXISTING number rather than from a count, so
 * deleting a draft cannot cause the next invoice to reuse a number that a client already has.
 */
export function nextDocumentNumber(prefix: string, existing: string[], year: number): string {
  const safePrefix = (prefix || 'INV').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'INV';
  const pattern = new RegExp(`^${safePrefix}-${year}-(\\d+)$`);
  let highest = 0;
  for (const n of existing) {
    const m = pattern.exec(String(n ?? '').trim());
    if (m) {
      const seq = parseInt(m[1], 10);
      if (Number.isFinite(seq) && seq > highest) highest = seq;
    }
  }
  return `${safePrefix}-${year}-${String(highest + 1).padStart(3, '0')}`;
}
