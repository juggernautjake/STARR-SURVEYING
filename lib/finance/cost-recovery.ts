// lib/finance/cost-recovery.ts — FINANCE_TAX_AND_INTAKE Slice F2.
//
// The pass-through case: we pay a sanitarian, and we bill the customer for it.
//
// ── WHY THIS NEEDS A MODEL AT ALL ───────────────────────────────────────────────────────────────
// The money moves twice and, when it works, nets to zero. Unless the two legs are *linked*, the
// books show an expense on one day and an unrelated revenue on another — which overstates both
// sides, misstates the profit on the job, and leaves nobody able to answer "did we actually get that
// $450 back?" without reading two documents side by side.
//
// ── THE RULE THIS FILE EXISTS TO ENFORCE: A PARTIAL RECOVERY IS NOT NO-NET-GAIN ─────────────────
// The tempting simplification is a boolean — `is_pass_through` — and it is wrong in the exact case
// that costs money. Pay a sanitarian $450, bill the customer $400, and the boolean says "pass-
// through, nets to zero" while the job quietly lost $50. Over a year of small shortfalls that is a
// real number nobody ever sees, because every individual row looked like a wash.
//
// So recovery is an ARITHMETIC result, never a flag: the recovered amount is summed from actual
// linked recoveries and compared with what was actually paid, and the difference is reported with a
// sign. `NO_NET_GAIN` is returned only when the difference is exactly zero.
//
// Over-recovery is called what it is, too. Billing $500 for a $450 cost is not a pass-through — it
// is $50 of margin, and filing it as a wash understates income.

export type RecoveryState =
  /** Nothing has been billed against this cost yet. */
  | 'NOT_RECOVERED'
  /** Billed exactly what was paid. The only true no-net-gain case. */
  | 'NO_NET_GAIN'
  /** Billed less than was paid — the job absorbed the difference. */
  | 'UNDER_RECOVERED'
  /** Billed more than was paid — the difference is margin, not a wash. */
  | 'OVER_RECOVERED'
  /** Deliberately not billed on: we absorbed it. A decision, not an omission. */
  | 'NOT_RECOVERABLE';

/** One billed-on amount, linked to the invoice that carried it. */
export interface RecoveryLink {
  /** The invoice that billed it. */
  invoiceId: string;
  /** Human-facing invoice number, for the summary line. */
  invoiceNumber?: string | null;
  /** Amount billed to recover this cost, in cents. Recorded per link because one expense can be
   *  split across invoices — a shared plat fee across two lots is the ordinary case. */
  amountCents: number;
  /** Set when the invoice has been voided. Kept rather than deleted: a voided recovery is evidence
   *  that someone tried, and dropping it silently re-opens the cost with no trace. */
  voided?: boolean;
}

export interface CostRecovery {
  /** What we actually paid, in cents. */
  costCents: number;
  links: readonly RecoveryLink[];
  /** Set when the cost was deliberately absorbed. */
  markedNotRecoverable?: boolean;
}

export interface RecoveryResult {
  state: RecoveryState;
  /** Sum of live (non-voided) links, in cents. */
  recoveredCents: number;
  /** `recoveredCents - costCents`. Negative = we absorbed it; positive = margin. Always reported,
   *  because the sign is the whole point. */
  deltaCents: number;
  /** True ONLY when the delta is exactly zero and something was actually billed. This is the flag
   *  everything else is tempted to be. */
  isNoNetGain: boolean;
  /** True when a person should look at this row. */
  needsAttention: boolean;
  /** One line a bookkeeper can act on. */
  summary: string;
}

const dollars = (cents: number) => `$${(Math.abs(cents) / 100).toFixed(2)}`;

/**
 * Work out whether a pass-through cost was actually recovered, and by how much.
 *
 * Pure arithmetic over the linked recoveries. Voided links are excluded from the total but are not
 * erased — an invoice that was raised and voided is a fact about what happened.
 */
export function computeRecovery(input: CostRecovery): RecoveryResult {
  const cost = Math.round(input.costCents);
  const live = input.links.filter((l) => !l.voided);
  const recovered = live.reduce((sum, l) => sum + Math.round(l.amountCents), 0);
  const delta = recovered - cost;

  const invoiceRef = live.length === 1
    ? (live[0].invoiceNumber ? ` on ${live[0].invoiceNumber}` : '')
    : live.length > 1
      ? ` across ${live.length} invoices`
      : '';

  // Checked before the arithmetic: absorbing a cost is a decision, and it stays true whether or not
  // something was later billed by mistake — in which case the mismatch is exactly what to surface.
  if (input.markedNotRecoverable) {
    return {
      state: 'NOT_RECOVERABLE',
      recoveredCents: recovered,
      deltaCents: delta,
      isNoNetGain: false,
      // A cost marked "we ate it" that nevertheless has live recoveries against it is a
      // contradiction someone needs to resolve.
      needsAttention: recovered !== 0,
      summary: recovered === 0
        ? `Absorbed — ${dollars(cost)} not billed on to the customer.`
        : `Marked as absorbed, but ${dollars(recovered)} was billed${invoiceRef}. Resolve which is right.`,
    };
  }

  if (live.length === 0) {
    return {
      state: 'NOT_RECOVERED',
      recoveredCents: 0,
      deltaCents: -cost,
      isNoNetGain: false,
      // The working queue: a cost we meant to bill on and have not.
      needsAttention: true,
      summary: `${dollars(cost)} paid out and not yet billed to the customer.`,
    };
  }

  if (delta === 0) {
    return {
      state: 'NO_NET_GAIN',
      recoveredCents: recovered,
      deltaCents: 0,
      isNoNetGain: true,
      needsAttention: false,
      summary: `Pass-through — ${dollars(cost)} paid, ${dollars(recovered)} recovered${invoiceRef}. No net gain.`,
    };
  }

  if (delta < 0) {
    return {
      state: 'UNDER_RECOVERED',
      recoveredCents: recovered,
      deltaCents: delta,
      // Explicitly NOT a no-net-gain event. This is the case the boolean gets wrong.
      isNoNetGain: false,
      needsAttention: true,
      summary: `Under-recovered — ${dollars(cost)} paid, ${dollars(recovered)} billed${invoiceRef}. The job absorbed ${dollars(delta)}.`,
    };
  }

  return {
    state: 'OVER_RECOVERED',
    recoveredCents: recovered,
    deltaCents: delta,
    // Billing more than the cost is margin. Filing it as a wash understates income.
    isNoNetGain: false,
    needsAttention: false,
    summary: `${dollars(cost)} paid, ${dollars(recovered)} billed${invoiceRef} — ${dollars(delta)} of margin, not a pass-through.`,
  };
}

/**
 * Roll several pass-through costs up for a job or a period.
 *
 * Reports the shortfall separately from the net, because they answer different questions: the net
 * says what the pass-throughs did to the books overall, and the shortfall says how much was paid out
 * and never billed — which a positive net from other jobs would otherwise hide.
 */
export function summarizeRecoveries(items: readonly CostRecovery[]): {
  count: number;
  costCents: number;
  recoveredCents: number;
  netCents: number;
  /** Total of the negative deltas only, as a positive number. Never netted against margin. */
  shortfallCents: number;
  needingAttention: number;
} {
  let costCents = 0, recoveredCents = 0, shortfallCents = 0, needingAttention = 0;
  for (const item of items) {
    const r = computeRecovery(item);
    costCents += Math.round(item.costCents);
    recoveredCents += r.recoveredCents;
    if (r.deltaCents < 0 && r.state !== 'NOT_RECOVERABLE') shortfallCents += -r.deltaCents;
    if (r.needsAttention) needingAttention += 1;
  }
  return {
    count: items.length,
    costCents,
    recoveredCents,
    netCents: recoveredCents - costCents,
    shortfallCents,
    needingAttention,
  };
}
