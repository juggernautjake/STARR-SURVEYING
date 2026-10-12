// lib/payouts/routing.ts — for each person, the one way they will actually be paid, decided once.
//
// Owner, 2026-10-11: "The org needs to be able to have full control over how payouts work. They can
// just provide a single way to payout, or multiple … make it easy to manage and smooth and make it so
// that it works every time!"
//
// "Works every time" is decided HERE, before any money moves. Every line resolves to a method the firm
// offers AND has what that method needs (a Venmo handle, bank details on file …). If the person's own
// choice cannot be used, the firm's default (for people who never chose) or fallback (for choices
// that cannot be honoured) is used instead — and the line says so. If nothing works, the line is held
// with a reason in plain words, and Commit pays everybody else. Nothing is ever sent to a guess.
//
// The batch builder and Commit both call `resolvePayout`, so the preview, the batch and the send can
// never disagree about how someone is paid.
//
// Pure. No I/O.

import { PAYOUT_METHODS, PAYOUT_METHOD_INFO, isPayoutMethod, type PayoutMethod } from './methods';
import { computePayoutFee, DEFAULT_FEE_SETTINGS, type FeeSettings, normalizeFeeSettings } from './fees';
import { railFor, venmoRecipient, type Rail, type RailConfig } from './rails';
import type { WorkerClassification } from './worker-classification';

export interface PayoutPolicy {
  /** The methods the firm offers. A single entry = everyone is paid that one way. */
  enabled: PayoutMethod[];
  /** Used for people who have not chosen. */
  defaultMethod: PayoutMethod | null;
  /** Used when someone's choice cannot be honoured. */
  fallbackMethod: PayoutMethod | null;
  fees: FeeSettings;
  rails: RailConfig;
}

export const ALL_OFFERABLE: readonly PayoutMethod[] = ['ach', 'venmo', 'cashapp', 'zelle', 'check', 'cash', 'account'];

export const DEFAULT_POLICY: PayoutPolicy = {
  enabled: [...ALL_OFFERABLE],
  defaultMethod: null,
  fallbackMethod: null,
  fees: DEFAULT_FEE_SETTINGS,
  rails: { paypal: false, ach: false, checks: false },
};

/** Build a policy from the stored settings row, ignoring anything malformed. */
export function normalizePolicy(row: {
  enabled_methods?: unknown; default_method?: unknown; fallback_method?: unknown;
  fees?: unknown; fee_scope?: unknown; fee_requires_consent?: unknown; fee_max_percent?: unknown;
} | null | undefined, rails: RailConfig): PayoutPolicy {
  if (!row) return { ...DEFAULT_POLICY, rails };
  const enabled = Array.isArray(row.enabled_methods)
    ? (row.enabled_methods as unknown[]).filter(isPayoutMethod)
    : [...ALL_OFFERABLE];
  const pick = (v: unknown) => (isPayoutMethod(v) && enabled.includes(v) ? v : null);
  return {
    enabled: enabled.length ? PAYOUT_METHODS.filter((m) => enabled.includes(m)) : [...ALL_OFFERABLE],
    defaultMethod: pick(row.default_method),
    fallbackMethod: pick(row.fallback_method),
    fees: normalizeFeeSettings(row),
    rails,
  };
}

/** What we know about one person, for deciding how to pay them. */
export interface PersonPayInfo {
  user_email: string;
  preferred: PayoutMethod | null;
  /** Their handle for venmo / cashapp / zelle. */
  handle: string | null;
  /** Encrypted bank details are on file (employee_payment_methods, kind 'ach'). */
  hasBank: boolean;
  classification: WorkerClassification;
  /** Methods whose CURRENT fee they have agreed to in writing. */
  consented: ReadonlySet<PayoutMethod>;
}

export interface ResolvedPayout {
  method: PayoutMethod | null;
  handle: string | null;
  /** Where the method came from. */
  source: 'preferred' | 'default' | 'fallback' | 'none';
  rail: Rail;
  /** Blocking: why this line cannot be paid. Empty = payable. */
  problems: string[];
  /** Non-blocking: what the approver should know (e.g. a fallback was used, a fee was waived). */
  notes: string[];
}

/** Can this method pay this person right now? Null = yes; otherwise the reason. */
export function methodBlocker(method: PayoutMethod, person: Pick<PersonPayInfo, 'handle' | 'hasBank'>, policy: PayoutPolicy): string | null {
  if (!policy.enabled.includes(method)) return `${PAYOUT_METHOD_INFO[method].label} is not offered by the firm`;
  const h = person.handle?.trim() ?? '';
  switch (method) {
    case 'venmo':
      if (!h) return 'no Venmo username, phone or email on file';
      if (policy.rails.paypal && !venmoRecipient(h)) return `"${h}" is not a Venmo username, phone number or email`;
      return null;
    case 'cashapp':
      return h ? null : 'no Cash App $cashtag on file';
    case 'zelle':
      return h ? null : 'no Zelle email or phone on file';
    case 'ach':
      return person.hasBank ? null : 'no bank account on file';
    default:
      return null;
  }
}

const label = (m: PayoutMethod) => PAYOUT_METHOD_INFO[m].label;

/** Decide how one person is paid, and the fee, for a line that would send `payableCents`. */
export function resolvePayout(person: PersonPayInfo, policy: PayoutPolicy, payableCents: number): ResolvedPayout & { feeCents: number; feeNote: string | null } {
  const notes: string[] = [];
  const candidates: Array<[PayoutMethod, ResolvedPayout['source']]> = [];
  if (person.preferred) candidates.push([person.preferred, 'preferred']);
  else if (policy.defaultMethod) candidates.push([policy.defaultMethod, 'default']);
  if (policy.fallbackMethod) candidates.push([policy.fallbackMethod, 'fallback']);

  let chosen: [PayoutMethod, ResolvedPayout['source']] | null = null;
  const reasons: string[] = [];
  for (const [m, src] of candidates) {
    const block = methodBlocker(m, person, policy);
    if (!block) { chosen = [m, src]; break; }
    reasons.push(`${label(m)}: ${block}`);
  }

  if (!chosen) {
    const problems = candidates.length === 0
      ? ['Has not chosen how to be paid, and the firm has no default method.']
      : [`Cannot be paid — ${reasons.join('; ')}.${policy.fallbackMethod ? '' : ' (No fallback method is set.)'}`];
    return { method: null, handle: null, source: 'none', rail: railFor(null, policy.rails), problems, notes, feeCents: 0, feeNote: null };
  }

  const [method, source] = chosen;
  if (source === 'fallback') notes.push(`Paid by ${label(method)} instead — ${reasons.join('; ')}.`);
  if (source === 'default') notes.push(`Has not chosen a method; paid by the firm's default, ${label(method)}.`);

  const free = policy.enabled.filter((m) => m !== method && m !== 'account' && !(policy.fees.fees[m]?.flat_cents || policy.fees.fees[m]?.percent_bps));
  const fee = computePayoutFee({
    method,
    payableCents,
    classification: person.classification,
    consented: person.consented.has(method),
    settings: policy.fees,
    freeAlternative: free.length ? free.slice(0, 2).map(label).join(' or ') : null,
  });
  if (fee.waived) notes.push(`${label(method)} fee not charged: ${fee.waived}`);

  const needsHandle = method === 'venmo' || method === 'cashapp' || method === 'zelle';
  return {
    method,
    handle: needsHandle ? person.handle?.trim() ?? null : null,
    source,
    rail: railFor(method, policy.rails),
    problems: [],
    notes,
    feeCents: fee.feeCents,
    feeNote: fee.note,
  };
}

/** One-line summary of a policy, for the top of the settings page and the Commit screen. */
export function describePolicy(policy: PayoutPolicy): string {
  if (policy.enabled.length === 1) return `Everyone is paid by ${label(policy.enabled[0])}.`;
  const list = policy.enabled.map(label).join(', ');
  const d = policy.defaultMethod ? ` People who have not chosen get ${label(policy.defaultMethod)}.` : ' People must choose before they can be paid.';
  const f = policy.fallbackMethod ? ` If a choice cannot be used, ${label(policy.fallbackMethod)}.` : ' If a choice cannot be used, that payment is held for attention.';
  return `People choose from: ${list}.${d}${f}`;
}
