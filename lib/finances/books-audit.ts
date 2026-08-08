// lib/finances/books-audit.ts
//
// Owner ask, 2026-08-08: *"run an AI audit of all receipts and expenditures and invoices for a given
// period to make sure they are all correct and make sense."*
//
// ── THIS FILE IS THE HALF THAT DOES NOT USE AI, AND THAT IS THE POINT ──────────────────────────
//
// `lib/ai/proactive.ts` states the house rule: rules, not model calls, because asking a model to
// notice a fact "introduces the chance of a hallucinated alert — which is the one kind of
// notification that destroys trust in all the others".
//
// An audit is the worst possible place to break that rule. A hallucinated discrepancy costs somebody
// an afternoon hunting for money that was never missing, and after that happens once nobody runs the
// audit again. So every finding here is computed in TypeScript from the rows themselves, and the
// model never receives enough raw data to invent a number — only these findings and some totals.
//
// Everything is pure and takes rows rather than querying, so the thresholds are testable with frozen
// inputs instead of against a live ledger.

import { findDuplicateExpenses, type ReceiptForDuplicateCheck } from './duplicate-expenses';
import { looksLikeAdVendor } from './ad-spend-reconcile';

export type AuditSeverity = 'high' | 'medium' | 'low';

export interface AuditFinding {
  severity: AuditSeverity;
  /** Machine-stable grouping, e.g. 'receipt.uncategorised'. */
  category: string;
  title: string;
  detail: string;
  /** The rows involved, so the reader can go and look rather than take this on faith. */
  ids: string[];
  /** What is at stake, where that is meaningful. */
  amount_cents?: number;
}

export interface AuditReceipt {
  id: string;
  vendor_name: string | null;
  category: string | null;
  tax_deductible_flag: string | null;
  total_cents: number | null;
  status: string | null;
  transaction_at: string | null;
  created_at: string | null;
}

export interface AuditInvoice {
  id: string;
  invoice_number: string | null;
  status: string | null;
  customer_name: string | null;
  total_cents: number | null;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
}

export interface AuditPayment {
  invoice_id: string | null;
  amount_cents: number | null;
  status: string | null;
}

export interface AuditInput {
  from: string;
  to: string;
  receipts: ReadonlyArray<AuditReceipt>;
  invoices: ReadonlyArray<AuditInvoice>;
  payments: ReadonlyArray<AuditPayment>;
  adSpendCents: number;
  /** For the "filed long after the fact" check. Injected so tests are not clock-dependent. */
  now?: number;
}

export interface AuditTotals {
  receipt_count: number;
  receipt_cents: number;
  invoice_count: number;
  invoiced_cents: number;
  paid_cents: number;
  ad_spend_cents: number;
}

export interface BooksAudit {
  period: { from: string; to: string };
  totals: AuditTotals;
  findings: AuditFinding[];
  /** Sum of `amount_cents` across findings — the money this audit has questions about. */
  questioned_cents: number;
}

const DAY_MS = 86_400_000;
/** Filed more than this long after the transaction is how a receipt lands in the wrong period. */
const LATE_FILING_DAYS = 45;
/** An outlier is relative to its own category. A big survey is normal; fuel at 20× is not. */
const OUTLIER_MULTIPLE = 5;

function cents(v: number | null | undefined): number {
  return Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function money(c: number): string {
  return `$${(Math.max(0, c) / 100).toFixed(2)}`;
}

export function auditBooks(input: AuditInput): BooksAudit {
  const now = input.now ?? Date.now();
  const findings: AuditFinding[] = [];
  const { receipts, invoices, payments } = input;

  // ── Receipts ─────────────────────────────────────────────────────────────────────────────────

  // Duplicates come from the SAME detector the finance page and the nightly alert use. Three
  // definitions of "counted twice" is how three screens come to disagree about one situation.
  const dupes = findDuplicateExpenses(
    receipts
      .filter((r) => r.transaction_at)
      .map<ReceiptForDuplicateCheck>((r) => ({
        id: r.id,
        vendor_name: r.vendor_name,
        total_cents: cents(r.total_cents),
        transaction_at: r.transaction_at as string,
      })),
    { adSpendCents: input.adSpendCents, isAdVendor: looksLikeAdVendor },
  );
  for (const d of dupes) {
    findings.push({
      severity: d.confidence === 'high' ? 'high' : 'low',
      category: `duplicate.${d.kind}`,
      title: `Possible double-count — ${money(d.total_cents)}`,
      detail: d.explanation,
      ids: d.receipt_ids,
      amount_cents: d.total_cents,
    });
  }

  const noVendor = receipts.filter((r) => !r.vendor_name || !r.vendor_name.trim());
  if (noVendor.length) {
    findings.push({
      severity: 'medium',
      category: 'receipt.no-vendor',
      title: `${noVendor.length} receipt(s) with no vendor`,
      // Unauditable by construction: with no vendor there is nothing to match a statement line
      // against, and no duplicate check can ever see it.
      detail:
        'A receipt with no vendor cannot be matched against a bank statement, and the duplicate ' +
        'check skips it because matching on amount alone would invent a match out of a blank field.',
      ids: noVendor.map((r) => r.id),
      amount_cents: noVendor.reduce((s, r) => s + cents(r.total_cents), 0),
    });
  }

  const uncategorised = receipts.filter((r) => !r.category || !r.category.trim());
  if (uncategorised.length) {
    findings.push({
      severity: 'medium',
      category: 'receipt.uncategorised',
      title: `${uncategorised.length} receipt(s) with no category`,
      detail: 'Without a category these cannot be mapped to a Schedule C line at tax time.',
      ids: uncategorised.map((r) => r.id),
      amount_cents: uncategorised.reduce((s, r) => s + cents(r.total_cents), 0),
    });
  }

  const stillInReview = receipts.filter((r) => r.tax_deductible_flag === 'review');
  if (stillInReview.length) {
    findings.push({
      severity: 'medium',
      category: 'receipt.unreviewed-deductibility',
      title: `${stillInReview.length} receipt(s) still marked "review"`,
      // The tax summary counts 'review' rows as 0% deductible, deliberately conservatively. Left
      // unreviewed, that is a deduction silently forfeited.
      detail:
        'The tax summary treats "review" as 0% deductible, so leaving these unclassified quietly ' +
        'forfeits the deduction rather than claiming it wrongly.',
      ids: stillInReview.map((r) => r.id),
      amount_cents: stillInReview.reduce((s, r) => s + cents(r.total_cents), 0),
    });
  }

  const nonPositive = receipts.filter((r) => cents(r.total_cents) <= 0);
  if (nonPositive.length) {
    findings.push({
      severity: 'high',
      category: 'receipt.non-positive-total',
      title: `${nonPositive.length} receipt(s) with a zero or negative total`,
      detail: 'Either the amount was never entered, or a refund was filed as a receipt.',
      ids: nonPositive.map((r) => r.id),
    });
  }

  // Outliers per category. Needs a few rows to have a meaningful median — with two receipts the
  // larger is always "5× the median" and the check would fire on every new category.
  const byCategory = new Map<string, AuditReceipt[]>();
  for (const r of receipts) {
    const k = (r.category ?? '').trim();
    if (!k) continue;
    const list = byCategory.get(k);
    if (list) list.push(r);
    else byCategory.set(k, [r]);
  }
  for (const [cat, rows] of byCategory) {
    if (rows.length < 5) continue;
    const med = median(rows.map((r) => cents(r.total_cents)).filter((n) => n > 0));
    if (med <= 0) continue;
    const outliers = rows.filter((r) => cents(r.total_cents) > med * OUTLIER_MULTIPLE);
    if (!outliers.length) continue;
    findings.push({
      severity: 'low',
      category: 'receipt.amount-outlier',
      title: `${outliers.length} unusually large ${cat} receipt(s)`,
      detail:
        `More than ${OUTLIER_MULTIPLE}× the ${money(med)} median for "${cat}" in this period. ` +
        'Often legitimate — worth confirming the decimal point landed where it should.',
      ids: outliers.map((r) => r.id),
      amount_cents: outliers.reduce((s, r) => s + cents(r.total_cents), 0),
    });
  }

  const lateFiled = receipts.filter((r) => {
    if (!r.transaction_at || !r.created_at) return false;
    const t = Date.parse(r.transaction_at);
    const c = Date.parse(r.created_at);
    if (Number.isNaN(t) || Number.isNaN(c)) return false;
    return c - t > LATE_FILING_DAYS * DAY_MS;
  });
  if (lateFiled.length) {
    findings.push({
      severity: 'low',
      category: 'receipt.filed-late',
      title: `${lateFiled.length} receipt(s) filed over ${LATE_FILING_DAYS} days after the purchase`,
      detail:
        'A receipt entered long after the fact can land in the wrong reporting period, and is the ' +
        'hardest kind to verify because nobody remembers the purchase.',
      ids: lateFiled.map((r) => r.id),
      amount_cents: lateFiled.reduce((s, r) => s + cents(r.total_cents), 0),
    });
  }

  // ── Invoices ─────────────────────────────────────────────────────────────────────────────────

  const paidByInvoice = new Map<string, number>();
  for (const p of payments) {
    if (!p.invoice_id || p.status !== 'succeeded') continue;
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + cents(p.amount_cents));
  }

  const paidWithoutPayment = invoices.filter(
    (i) => (i.status === 'paid' || i.paid_at) && !paidByInvoice.has(i.id),
  );
  if (paidWithoutPayment.length) {
    findings.push({
      severity: 'high',
      category: 'invoice.paid-without-payment',
      title: `${paidWithoutPayment.length} invoice(s) marked paid with no payment recorded`,
      // The shape that makes revenue look real when no money arrived, and it survives because the
      // invoice list and the bank both look fine on their own.
      detail:
        'These are marked paid but have no succeeded payment against them. Either the money arrived ' +
        'outside the system (cash or cheque, needing a manual record) or the invoice was closed in error.',
      ids: paidWithoutPayment.map((i) => i.id),
      amount_cents: paidWithoutPayment.reduce((s, i) => s + cents(i.total_cents), 0),
    });
  }

  const overdue = invoices.filter((i) => {
    if (i.status === 'paid' || i.paid_at) return false;
    if (!i.due_at) return false;
    const due = Date.parse(i.due_at);
    return !Number.isNaN(due) && due < now;
  });
  if (overdue.length) {
    findings.push({
      severity: 'medium',
      category: 'invoice.overdue',
      title: `${overdue.length} unpaid invoice(s) past due`,
      detail: 'Issued, past the due date, and no payment recorded.',
      ids: overdue.map((i) => i.id),
      amount_cents: overdue.reduce((s, i) => s + cents(i.total_cents), 0),
    });
  }

  const zeroInvoices = invoices.filter((i) => cents(i.total_cents) <= 0);
  if (zeroInvoices.length) {
    findings.push({
      severity: 'medium',
      category: 'invoice.zero-total',
      title: `${zeroInvoices.length} invoice(s) with a zero total`,
      detail: 'An invoice for nothing is usually a draft that escaped, or a line item never added.',
      ids: zeroInvoices.map((i) => i.id),
    });
  }

  const inverted = invoices.filter((i) => {
    if (!i.issued_at || !i.paid_at) return false;
    const iss = Date.parse(i.issued_at);
    const paid = Date.parse(i.paid_at);
    return !Number.isNaN(iss) && !Number.isNaN(paid) && paid < iss;
  });
  if (inverted.length) {
    findings.push({
      severity: 'high',
      category: 'invoice.paid-before-issued',
      title: `${inverted.length} invoice(s) paid before they were issued`,
      detail: 'The timestamps are inverted, so at least one of them is wrong.',
      ids: inverted.map((i) => i.id),
      amount_cents: inverted.reduce((s, i) => s + cents(i.total_cents), 0),
    });
  }

  const overpaid = invoices.filter((i) => {
    const p = paidByInvoice.get(i.id) ?? 0;
    return p > cents(i.total_cents) && cents(i.total_cents) > 0;
  });
  if (overpaid.length) {
    findings.push({
      severity: 'medium',
      category: 'invoice.overpaid',
      title: `${overpaid.length} invoice(s) paid more than their total`,
      detail: 'A duplicate customer payment, or a total edited downward after payment.',
      ids: overpaid.map((i) => i.id),
      amount_cents: overpaid.reduce(
        (s, i) => s + ((paidByInvoice.get(i.id) ?? 0) - cents(i.total_cents)), 0,
      ),
    });
  }

  const totals: AuditTotals = {
    receipt_count: receipts.length,
    receipt_cents: receipts.reduce((s, r) => s + Math.max(0, cents(r.total_cents)), 0),
    invoice_count: invoices.length,
    invoiced_cents: invoices.reduce((s, i) => s + Math.max(0, cents(i.total_cents)), 0),
    paid_cents: [...paidByInvoice.values()].reduce((s, v) => s + v, 0),
    ad_spend_cents: input.adSpendCents,
  };

  const rank: Record<AuditSeverity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || (b.amount_cents ?? 0) - (a.amount_cents ?? 0),
  );

  return {
    period: { from: input.from, to: input.to },
    totals,
    findings,
    questioned_cents: findings.reduce((s, f) => s + (f.amount_cents ?? 0), 0),
  };
}
