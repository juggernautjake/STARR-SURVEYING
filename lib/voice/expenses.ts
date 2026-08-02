// lib/voice/expenses.ts — the money going out, and what it means at tax time.
//
// Pure functions only. The value of this file is that "what can I deduct" is answered by code with
// tests on it rather than by Andrew's memory in April.
//
// ── THIS IS BOOKKEEPING, NOT TAX ADVICE ─────────────────────────────────────────────────────────
//
// `deductibleCents` computes what a category and a business-use percentage IMPLY, using the ordinary
// rules for a US sole proprietor filing Schedule C. It does not know about §179 elections, state
// rules, or Andrew's other income. Every surface that shows these numbers says so — a bookkeeping
// tool that presents an estimate as a filing is worse than one that presents nothing, because the
// second one sends you to an accountant.

export const EXPENSE_CATEGORIES = [
  'equipment',
  'software',
  'studio',
  'training',
  'marketing',
  'travel',
  'supplies',
  'fees',
  'professional',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface ExpenseCategoryMeta {
  id: ExpenseCategory;
  label: string;
  /** What belongs here, in Andrew's vocabulary rather than the IRS's. */
  hint: string;
  /** The Schedule C line this usually rolls up to. Documentation for the year-end export. */
  scheduleC: string;
  /** Purchases in this category are typically capital (depreciated) above the threshold. */
  usuallyCapital: boolean;
  icon: string;
}

export const EXPENSE_CATEGORY_META: readonly ExpenseCategoryMeta[] = [
  { id: 'equipment', label: 'Equipment', hint: 'Microphones, interfaces, headphones, acoustic panels, a booth.', scheduleC: 'Part V / depreciation', usuallyCapital: true, icon: 'Mic' },
  { id: 'software', label: 'Software', hint: 'DAW licences, plugins, storage and editing subscriptions.', scheduleC: 'Line 18 — office expense', usuallyCapital: false, icon: 'AppWindow' },
  { id: 'studio', label: 'Studio & space', hint: 'Room treatment, studio rental, the home-office share.', scheduleC: 'Line 20b / Form 8829', usuallyCapital: false, icon: 'DoorClosed' },
  { id: 'training', label: 'Training & demos', hint: 'Coaching, workshops, demo production, classes.', scheduleC: 'Line 27a — other expenses', usuallyCapital: false, icon: 'GraduationCap' },
  { id: 'marketing', label: 'Marketing', hint: 'This website, casting-site memberships, ads, headshots.', scheduleC: 'Line 8 — advertising', usuallyCapital: false, icon: 'Megaphone' },
  { id: 'travel', label: 'Travel & mileage', hint: 'Driving to a session, lodging, tolls, parking.', scheduleC: 'Line 24a / Line 9', usuallyCapital: false, icon: 'Car' },
  { id: 'supplies', label: 'Supplies', hint: 'Cables, stands, pop filters, batteries, consumables.', scheduleC: 'Line 22 — supplies', usuallyCapital: false, icon: 'Package' },
  { id: 'fees', label: 'Fees', hint: 'Stripe and PayPal fees, bank charges, licensing.', scheduleC: 'Line 10 / Line 27a', usuallyCapital: false, icon: 'Receipt' },
  { id: 'professional', label: 'Professional services', hint: 'Accountant, attorney, business insurance.', scheduleC: 'Line 17 / Line 15', usuallyCapital: false, icon: 'Scale' },
  { id: 'other', label: 'Other', hint: 'Anything that does not fit — categorise it later.', scheduleC: 'Line 27a — other expenses', usuallyCapital: false, icon: 'CircleEllipsis' },
];

export function categoryMeta(id: string): ExpenseCategoryMeta {
  return EXPENSE_CATEGORY_META.find((c) => c.id === id) ?? EXPENSE_CATEGORY_META[EXPENSE_CATEGORY_META.length - 1];
}

export interface ExpenseLike {
  amountCents: number;
  businessPct: number;
  isCapital?: boolean;
  category?: string;
  spentOn?: string;
}

/**
 * The business share of an expense, in cents.
 *
 * Integer maths on an integer percentage. A $1,499.99 laptop at 60% business use is 89999 cents ×
 * 60 ÷ 100 = 53999.4 → 53999, and it gets there without ever holding 0.6 as a float.
 */
export function businessShareCents(expense: ExpenseLike): number {
  const amount = Math.max(0, Math.round(expense.amountCents || 0));
  const pct = Math.max(0, Math.min(100, Math.round(expense.businessPct ?? 100)));
  return Math.round((amount * pct) / 100);
}

/**
 * What is deductible THIS year.
 *
 * Capital purchases return 0 here and carry a note, because their deduction is a depreciation
 * schedule this tool does not model. Returning the full amount for a $900 microphone would overstate
 * the year's deduction by the entire purchase — the exact error that produces an amended return.
 */
export function currentYearDeductionCents(expense: ExpenseLike): { cents: number; note: string | null } {
  const share = businessShareCents(expense);
  if (expense.isCapital) {
    return {
      cents: 0,
      note: 'Capital purchase — deducted over time (or via a §179 election). Ask your accountant; this tool does not compute depreciation.',
    };
  }
  return { cents: share, note: null };
}

export interface ExpenseSummary {
  totalCents: number;
  businessCents: number;
  deductibleNowCents: number;
  capitalCents: number;
  byCategory: { category: ExpenseCategory; label: string; totalCents: number; businessCents: number; count: number }[];
  count: number;
}

/** Rolls a list of expenses up for the finance dashboard and the year-end export. */
export function summarizeExpenses(expenses: ExpenseLike[]): ExpenseSummary {
  const buckets = new Map<string, { totalCents: number; businessCents: number; count: number }>();
  let totalCents = 0;
  let businessCents = 0;
  let deductibleNowCents = 0;
  let capitalCents = 0;

  for (const e of expenses) {
    const amount = Math.max(0, Math.round(e.amountCents || 0));
    const share = businessShareCents(e);
    totalCents += amount;
    businessCents += share;
    if (e.isCapital) capitalCents += share;
    else deductibleNowCents += share;

    const key = (EXPENSE_CATEGORIES as readonly string[]).includes(e.category ?? '')
      ? (e.category as ExpenseCategory)
      : 'other';
    const b = buckets.get(key) ?? { totalCents: 0, businessCents: 0, count: 0 };
    b.totalCents += amount;
    b.businessCents += share;
    b.count += 1;
    buckets.set(key, b);
  }

  const byCategory = EXPENSE_CATEGORIES.map((id) => {
    const b = buckets.get(id);
    return {
      category: id,
      label: categoryMeta(id).label,
      totalCents: b?.totalCents ?? 0,
      businessCents: b?.businessCents ?? 0,
      count: b?.count ?? 0,
    };
  })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.businessCents - a.businessCents);

  return { totalCents, businessCents, deductibleNowCents, capitalCents, byCategory, count: expenses.length };
}

// ── Profit & loss ────────────────────────────────────────────────────────────────────────────────

export interface ProfitAndLoss {
  incomeCents: number;
  /** Money invoiced but not yet received. Shown separately because it is not spendable. */
  outstandingCents: number;
  expenseCents: number;
  netCents: number;
  /** A rough self-employment + income tax set-aside. See the caveat below. */
  estimatedTaxSetAsideCents: number;
  setAsideRatePct: number;
}

/**
 * The number Andrew actually wants on the dashboard: what he made, what he spent, what is left.
 *
 * `incomeCents` is CASH RECEIVED, not invoiced — a freelancer who counts unpaid invoices as income
 * spends money that has not arrived. Invoiced-but-unpaid is reported alongside it, labelled, so the
 * distinction is visible rather than assumed.
 *
 * The tax set-aside defaults to 30%: roughly 15.3% self-employment tax on net earnings plus a low
 * federal bracket, which is the standard rule-of-thumb for a first-year sole proprietor and is
 * deliberately a little high — under-saving for a first self-employment tax bill is the classic
 * first-year mistake. It is a savings prompt, not a calculation of what is owed, and every surface
 * that renders it says so.
 */
export function computeProfitAndLoss(input: {
  paymentsReceivedCents: number;
  invoicedOutstandingCents: number;
  expenses: ExpenseLike[];
  setAsideRatePct?: number;
}): ProfitAndLoss {
  const incomeCents = Math.max(0, Math.round(input.paymentsReceivedCents || 0));
  const outstandingCents = Math.max(0, Math.round(input.invoicedOutstandingCents || 0));
  const { businessCents } = summarizeExpenses(input.expenses);
  const netCents = incomeCents - businessCents;
  const rate = Math.max(0, Math.min(60, Math.round(input.setAsideRatePct ?? 30)));
  return {
    incomeCents,
    outstandingCents,
    expenseCents: businessCents,
    netCents,
    // No set-aside on a loss. Taxing a negative number produces a negative "you should save"
    // figure, which renders as a nonsense instruction to withdraw money.
    estimatedTaxSetAsideCents: netCents > 0 ? Math.round((netCents * rate) / 100) : 0,
    setAsideRatePct: rate,
  };
}

// ── Mileage ──────────────────────────────────────────────────────────────────────────────────────

/** IRS standard mileage rates, in cents per mile, by tax year.
 *
 *  A map rather than a constant because the rate changes annually and an expense recorded in 2025
 *  must keep using the 2025 rate forever — recomputing history at the current rate silently rewrites
 *  a filed return's numbers. Unknown years fall back to the latest known rate and the UI flags it. */
export const MILEAGE_RATE_CENTS_PER_MILE: Record<number, number> = {
  2023: 65.5,
  2024: 67,
  2025: 70,
  2026: 72,
} as unknown as Record<number, number>;

export function mileageRateFor(year: number): { centsPerMile: number; isEstimate: boolean } {
  const known = MILEAGE_RATE_CENTS_PER_MILE[year];
  if (known !== undefined) return { centsPerMile: known, isEstimate: false };
  const years = Object.keys(MILEAGE_RATE_CENTS_PER_MILE).map(Number).sort((a, b) => b - a);
  return { centsPerMile: MILEAGE_RATE_CENTS_PER_MILE[years[0]], isEstimate: true };
}

/** Miles → deductible cents at the standard rate for that year. */
export function mileageDeductionCents(miles: number, year: number): number {
  const { centsPerMile } = mileageRateFor(year);
  const m = Math.max(0, Number(miles) || 0);
  return Math.round(m * centsPerMile);
}
