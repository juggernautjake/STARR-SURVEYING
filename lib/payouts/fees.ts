// lib/payouts/fees.ts — the fee a firm may attach to cash and check payouts, and when it may not.
//
// Owner, 2026-10-11: *"We will make it so that digital payments can be incentivized. The org will have
// the option to attach a fee to cash and check payments that is automatically taken out."*
//
// ── HOW A FEE MOVES THROUGH THE LEDGER ──────────────────────────────────────────────────────────
//
// Exactly like an advance recovery (lib/payroll/disbursement.ts): the line still SETTLES its whole
// `total_cents` — the person is no longer owed for those hours — and the fee is withheld from what is
// SENT. Subtracting it from `total_cents` instead would leave them "owed" the fee for ever.
//
// Owner, 2026-10-11 (later): "The org needs to be able to have full control over how payouts work …
// they can put extra charges for using different types of payouts." So any payout method may carry a
// fee; which ones do is the firm's setting. Free methods are named next to every fee.
//
// ── WHY THE DEFAULTS ARE CAUTIOUS ───────────────────────────────────────────────────────────────
//
// Taking a fee out of a W-2 employee's WAGES is a deduction from wages. Texas Payday Law allows those
// only when ordered by a court, authorised by law, or authorised IN WRITING by the employee for a
// lawful purpose; and the FLSA requires minimum wage be paid "free and clear". So by default:
//   * fees apply to 1099 contractors only (`scope: 'contractors'`);
//   * a fee applies only after the person has agreed to its exact wording (`requiresConsent`);
//   * a fee is capped at a percent of the payment, and never exceeds the payment.
// The firm can widen the scope to everyone — consent is still required — after checking with its CPA.
// This module decides the fee; it does not give legal advice, and the settings page says so.
//
// Pure. No I/O.

import type { PayoutMethod } from './methods';
import type { WorkerClassification } from './worker-classification';

/** A fee for one method: a flat amount, a percentage, or both, with an optional ceiling. */
export interface MethodFee {
  flat_cents?: number;
  /** Basis points: 100 = 1%. */
  percent_bps?: number;
  /** The most this fee can ever be for one payment. */
  cap_cents?: number;
}

export type FeeScope = 'contractors' | 'everyone';

export interface FeeSettings {
  fees: Partial<Record<PayoutMethod, MethodFee>>;
  scope: FeeScope;
  requiresConsent: boolean;
  /** No fee may exceed this percent of the payment. */
  maxPercent: number;
}

/** The methods a fee may be attached to — any way of being paid out. (Holding pay in the person's own
 *  account is not a payout, so it cannot carry one.) The firm decides which carry a fee; the usual
 *  choice is cash and check, so the digital methods are the free, incentivised ones. */
export const FEEABLE_METHODS: readonly PayoutMethod[] = ['cash', 'check', 'venmo', 'cashapp', 'zelle', 'ach', 'other'];

export const DEFAULT_FEE_SETTINGS: FeeSettings = { fees: {}, scope: 'contractors', requiresConsent: true, maxPercent: 5 };

const cents = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** Read whatever is stored into a well-formed settings object; anything odd becomes "no fee". */
export function normalizeFeeSettings(row: {
  fees?: unknown; fee_scope?: unknown; fee_requires_consent?: unknown; fee_max_percent?: unknown;
} | null | undefined): FeeSettings {
  if (!row) return DEFAULT_FEE_SETTINGS;
  const fees: Partial<Record<PayoutMethod, MethodFee>> = {};
  const raw = row.fees && typeof row.fees === 'object' ? row.fees as Record<string, unknown> : {};
  for (const m of FEEABLE_METHODS) {
    const f = raw[m] as Record<string, unknown> | undefined;
    if (!f || typeof f !== 'object') continue;
    const fee: MethodFee = { flat_cents: cents(f.flat_cents), percent_bps: cents(f.percent_bps), cap_cents: cents(f.cap_cents) };
    if (fee.flat_cents || fee.percent_bps) fees[m] = fee;
  }
  const maxPercent = Number(row.fee_max_percent);
  return {
    fees,
    scope: row.fee_scope === 'everyone' ? 'everyone' : 'contractors',
    requiresConsent: row.fee_requires_consent !== false,
    maxPercent: Number.isFinite(maxPercent) && maxPercent >= 0 ? Math.min(25, maxPercent) : 5,
  };
}

export interface FeeInput {
  method: PayoutMethod | null;
  /** What would be sent before the fee — the line's total less any advance recovery. */
  payableCents: number;
  classification: WorkerClassification;
  /** Has this person agreed, in writing, to this method's current fee? */
  consented: boolean;
  settings: FeeSettings;
  /** e.g. "direct deposit or Venmo" — named in the note so the fee doubles as the incentive. */
  freeAlternative?: string | null;
}

export interface FeeResult {
  feeCents: number;
  /** Shown on the line and the stub: "Check fee $2.00 — choose Venmo or direct deposit to avoid it." */
  note: string | null;
  /** Why a configured fee was NOT applied, for the approver. Null when no fee was configured. */
  waived: string | null;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const LABEL: Partial<Record<PayoutMethod, string>> = { cash: 'Cash', check: 'Check', venmo: 'Venmo', cashapp: 'Cash App', zelle: 'Zelle', ach: 'Direct deposit', other: 'Other' };

/** The raw fee a rule produces for an amount, before any eligibility or cap — for previews. */
export function ruleAmount(rule: MethodFee | undefined, payableCents: number, maxPercent: number): number {
  if (!rule || payableCents <= 0) return 0;
  let fee = cents(rule.flat_cents) + Math.round((payableCents * cents(rule.percent_bps)) / 10000);
  if (rule.cap_cents) fee = Math.min(fee, cents(rule.cap_cents));
  fee = Math.min(fee, Math.floor((payableCents * maxPercent) / 100));
  return Math.max(0, Math.min(fee, payableCents));
}

/** Describe a fee rule in words, for the settings page and the consent the worker signs. */
export function describeRule(method: PayoutMethod, rule: MethodFee | undefined): string | null {
  if (!rule || (!rule.flat_cents && !rule.percent_bps)) return null;
  const parts: string[] = [];
  if (rule.flat_cents) parts.push(money(rule.flat_cents));
  if (rule.percent_bps) parts.push(`${(rule.percent_bps / 100).toFixed(rule.percent_bps % 100 ? 2 : 0)}%`);
  const cap = rule.cap_cents ? ` (at most ${money(rule.cap_cents)})` : '';
  return `${LABEL[method] ?? method} payments carry a fee of ${parts.join(' + ')} per payment${cap}, taken out of the amount paid.`;
}

/** The exact wording a worker agrees to before a fee can be taken from their pay. */
export function consentTerms(method: PayoutMethod, rule: MethodFee | undefined, maxPercent: number): string | null {
  const d = describeRule(method, rule);
  if (!d) return null;
  return `${d} The fee is never more than ${maxPercent}% of a payment. I choose to be paid by ${LABEL[method] ?? method} `
    + 'and authorise this fee to be deducted from each payment made that way. I understand I can switch to another offered '
    + 'method at any time, and withdraw this authorisation by doing so.';
}

/** The fee for one payout line. */
export function computePayoutFee(input: FeeInput): FeeResult {
  const none: FeeResult = { feeCents: 0, note: null, waived: null };
  const { method, settings } = input;
  if (!method || !FEEABLE_METHODS.includes(method)) return none;
  const rule = settings.fees[method];
  const raw = ruleAmount(rule, Math.max(0, Math.round(input.payableCents)), settings.maxPercent);
  if (raw <= 0) return none;

  if (settings.scope === 'contractors' && input.classification !== 'contractor_1099') {
    return { feeCents: 0, note: null, waived: 'Fees apply to 1099 contractors only — this person is not marked as one.' };
  }
  if (settings.requiresConsent && !input.consented) {
    return { feeCents: 0, note: null, waived: 'No signed consent to the fee on file.' };
  }
  return {
    feeCents: raw,
    note: `${LABEL[method] ?? method} fee ${money(raw)}${input.freeAlternative ? ` — ${input.freeAlternative} is free` : ''}.`,
    waived: null,
  };
}
