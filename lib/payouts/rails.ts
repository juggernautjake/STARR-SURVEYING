// lib/payouts/rails.ts — how each payout method actually leaves the firm when a payout is committed.
//
// Owner, 2026-10-11: "the system uses whatever preferred payment method is available to do the
// payout … automatically pay out everyone according to their preferred payment methods."
//
// "Automatically" means different things per method, and saying which is the whole point of this
// file (lib/payouts/methods.ts: recording is not sending). Venmo goes through the PayPal Payouts API
// once it is configured. Bank transfers go in ONE NACHA file the bank runs. Checks are numbered and
// printed in one PDF. Cash App and Zelle have no public API for sending money, and cash is cash — those
// are queued for a person to do, with everything they need on one screen.
//
// Pure. No I/O.

import type { PayoutMethod } from './methods';

export type RailKind = 'api' | 'file' | 'print' | 'manual' | 'ledger';

export interface RailConfig {
  /** PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET present. */
  paypal: boolean;
  /** NACHA originator fields filled in on the payout settings page. */
  ach: boolean;
  /** Bank details for printing checks filled in. */
  checks: boolean;
}

export interface Rail {
  kind: RailKind;
  /** Does Commit complete the send with nobody doing anything else? */
  automatic: boolean;
  /** One line for the Commit preview: what will happen to these payments. */
  summary: string;
  /** What is missing for the better rail, when this one is a fallback. */
  setup: string | null;
}

export function railFor(method: PayoutMethod | null, cfg: RailConfig): Rail {
  switch (method) {
    case 'account':
      return { kind: 'ledger', automatic: true, summary: 'Credited to their pay account straight away.', setup: null };
    case 'venmo':
      return cfg.paypal
        ? { kind: 'api', automatic: true, summary: 'Sent to Venmo automatically through PayPal Payouts.', setup: null }
        : { kind: 'manual', automatic: false, summary: 'Tap-to-pay Venmo links for you to send.', setup: 'Connect a PayPal Business account (Payout settings) to send Venmo automatically.' };
    case 'ach':
      return cfg.ach
        ? { kind: 'file', automatic: false, summary: 'One bank file (NACHA) to upload to PNC — the bank pays everyone in it.', setup: null }
        : { kind: 'file', automatic: false, summary: 'Bank list (CSV) to key into PNC.', setup: 'Fill in the ACH section of Payout settings to produce a real NACHA file.' };
    case 'check':
      return cfg.checks
        ? { kind: 'print', automatic: false, summary: 'Checks numbered and laid out in one PDF to print and sign.', setup: null }
        : { kind: 'print', automatic: false, summary: 'Checks to write by hand.', setup: 'Fill in the Checks section of Payout settings to print them.' };
    case 'cashapp':
      return { kind: 'manual', automatic: false, summary: 'Cash App links to tap — Cash App has no API for sending payouts.', setup: null };
    case 'zelle':
      return { kind: 'manual', automatic: false, summary: 'Zelle from the bank app — Zelle has no API for businesses to send.', setup: null };
    case 'cash':
      return { kind: 'manual', automatic: false, summary: 'Cash to hand out — a printable sheet with a signature line for each.', setup: null };
    case 'other':
      return { kind: 'manual', automatic: false, summary: 'Paid another way — record how.', setup: null };
    default:
      return { kind: 'manual', automatic: false, summary: 'No payment method chosen — pick one before committing.', setup: 'Ask the person to choose how they get paid.' };
  }
}

/** The order the Commit preview and the dispatch page list methods in: automatic first. */
export const RAIL_ORDER: readonly (PayoutMethod | 'unassigned')[] = ['account', 'venmo', 'ach', 'check', 'cashapp', 'zelle', 'cash', 'other', 'unassigned'];

/** The PayPal Payouts recipient for a Venmo handle as people actually type it. */
export function venmoRecipient(handle: string): { recipient_type: 'PHONE' | 'EMAIL' | 'USER_HANDLE'; receiver: string } | null {
  const h = handle.trim();
  if (!h) return null;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(h)) return { recipient_type: 'EMAIL', receiver: h.toLowerCase() };
  const digits = h.replace(/[^\d]/g, '');
  if (/^[+\d()\-.\s]+$/.test(h) && (digits.length === 10 || (digits.length === 11 && digits.startsWith('1')))) {
    return { recipient_type: 'PHONE', receiver: digits.slice(-10) };
  }
  const user = h.replace(/^@/, '');
  return /^[A-Za-z0-9_-]{2,40}$/.test(user) ? { recipient_type: 'USER_HANDLE', receiver: user } : null;
}
