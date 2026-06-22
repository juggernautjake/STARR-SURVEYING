// lib/payments/allocation-engine.ts
//
// Phase-2 Slice 8 of
// docs/planning/completed/CUSTOMER_INVOICING_PHASE2_2026-06-21.md.
//
// Pure splitter. Given the amount of a cleared payment + the active
// categories with their target percentages, return the ledger rows to
// INSERT into financial_allocations (seed 374, Slice 7).
//
// Guarantees:
//   - SUM(amount_cents) across the returned rows equals the input
//     amount EXACTLY (last active category absorbs rounding remainder
//     so the books always balance).
//   - Inactive categories never appear in the output.
//   - When target percentages don't sum to exactly 100, we still emit
//     rows and report the gap as `unallocated_cents` so the route
//     handler can warn dad. The engine NEVER makes up a value to fill
//     a gap — that's a config error he has to fix.
//   - Pure: no DB, no network. The caller does the INSERT.
//
// The Phase-2 Slice 9 wiring calls this from the office-closeout path
// (/api/admin/payment-attempts/[id]/clear) + the Stripe webhook
// success path so every cleared payment automatically writes its
// allocation ledger without any extra admin action.

/** Subset of the seed-374 categories row this helper reads. */
export interface AllocationCategoryInput {
  id: string;
  category_key: string;
  /** 0..100, NUMERIC(5,2). */
  target_percent: number;
  is_active: boolean;
  /** Sort order from the seed. Used to pick which category absorbs
   *  the rounding remainder (the highest-sorted ACTIVE row wins, so
   *  the "Owner's Draw" / "Healthcare" / "Charitable" buckets at the
   *  bottom of the list absorb pennies instead of "Equipment" at the
   *  top). */
  sort_order: number;
}

/** One row to INSERT into financial_allocations. */
export interface AllocationRow {
  category_id: string;
  category_key: string;
  amount_cents: number;
}

export interface AllocationResult {
  /** Rows for the ledger INSERT. */
  rows: AllocationRow[];
  /** Sum across `rows.amount_cents`. ALWAYS equals the input
   *  payment_amount_cents when `valid === true`. */
  allocated_cents: number;
  /** When `valid === false`, this is amount × (100 - sum_of_percents)
   *  / 100 — the slice the categories didn't claim. The route handler
   *  uses this to surface a friendly "your category percentages add
   *  up to X%, not 100%" warning to dad. */
  unallocated_cents: number;
  /** Sum of active categories' `target_percent`. Range 0..100 in the
   *  happy path; anything else is a config error. */
  total_percent: number;
  /** True iff `total_percent === 100` (within 0.01 tolerance) and the
   *  input was a valid positive integer cents amount. The route
   *  handler MUST refuse to write the ledger rows when this is false
   *  — the books wouldn't balance. */
  valid: boolean;
  /** Human-readable diagnostic for the dashboard / audit trail. */
  rationale: string;
}

/** Pure. Split a cleared payment by the active categories' target
 *  percentages. */
export function allocatePayment(
  payment_amount_cents: number,
  categories: readonly AllocationCategoryInput[],
): AllocationResult {
  // ── Sanitize the input ──────────────────────────────────────────
  if (!Number.isFinite(payment_amount_cents) || payment_amount_cents <= 0) {
    return {
      rows: [],
      allocated_cents: 0,
      unallocated_cents: 0,
      total_percent: 0,
      valid: false,
      rationale: 'invalid amount (must be a positive integer number of cents)',
    };
  }
  const amount = Math.floor(payment_amount_cents);

  const active = categories
    .filter((c) => c.is_active && c.target_percent > 0)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  if (active.length === 0) {
    return {
      rows: [],
      allocated_cents: 0,
      unallocated_cents: amount,
      total_percent: 0,
      valid: false,
      rationale: 'no active categories with non-zero target percentages',
    };
  }

  // ── Sum percentages + bail on config errors ─────────────────────
  const total_percent = round2(active.reduce((s, c) => s + Number(c.target_percent), 0));
  if (!isCloseTo(total_percent, 100, 0.01)) {
    // Compute what the engine WOULD allocate even when the percentages
    // don't add up — useful for the warning UI to show dad the diff
    // without committing to a write.
    const rowsPreview = floorAllocate(active, amount);
    const sum_preview = rowsPreview.reduce((s, r) => s + r.amount_cents, 0);
    return {
      rows: rowsPreview,
      allocated_cents: sum_preview,
      unallocated_cents: Math.max(0, amount - sum_preview),
      total_percent,
      valid: false,
      rationale: `category percentages total ${total_percent}% (need 100%); fix on /admin/invoicing/categories`,
    };
  }

  // ── Happy path: percentages sum to 100. Floor-allocate, then push
  //    the remainder onto the LAST active category by sort_order so
  //    the books balance exactly. ─────────────────────────────────
  const rows = floorAllocate(active, amount);
  const allocated_so_far = rows.reduce((s, r) => s + r.amount_cents, 0);
  const remainder = amount - allocated_so_far;
  if (remainder !== 0 && rows.length > 0) {
    const last = rows[rows.length - 1]!;
    rows[rows.length - 1] = {
      ...last,
      amount_cents: last.amount_cents + remainder,
    };
  }

  const total = rows.reduce((s, r) => s + r.amount_cents, 0);
  return {
    rows,
    allocated_cents: total,
    unallocated_cents: 0,
    total_percent,
    valid: true,
    rationale: `split ${amount}¢ across ${rows.length} categor${rows.length === 1 ? 'y' : 'ies'}`,
  };
}

// ── Internals ────────────────────────────────────────────────────

function floorAllocate(
  active: readonly AllocationCategoryInput[],
  amount: number,
): AllocationRow[] {
  return active.map((c) => ({
    category_id: c.id,
    category_key: c.category_key,
    amount_cents: Math.floor((amount * Number(c.target_percent)) / 100),
  }));
}

function isCloseTo(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
