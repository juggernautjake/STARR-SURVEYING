// lib/payments/readiness.ts — "what is still missing before real money can move?"
//
// M-slice of docs/planning/in-progress/MONEY_RAILS_AND_CARDS_2026-08-17.md.
//
// ── WHY THIS IS A CHECK AND NOT A CHECKLIST IN A DOC ────────────────────────────────────────────
//
// The plan doc asks the owner to verify five things by hand across three dashboards: are the Stripe
// keys live or test, is the publishable key set, does the webhook endpoint still exist, are the
// Venmo/CashApp/Zelle handles real, is there a company card on file. Then, and only then, to set
// `PAYMENTS_LIVE=true`.
//
// Four of those five are answerable from the server in a millisecond, and the fifth is answerable
// from the database. A checklist a person walks manually is a checklist that gets walked once, on
// the day it is written, and never again — while `PAYMENTS_LIVE` stays on forever afterwards.
//
// ── THE FAILURE THIS EXISTS TO CATCH ────────────────────────────────────────────────────────────
//
// **A test key takes payments that never arrive.** `sk_test_` and `sk_live_` differ by four
// characters, Stripe issues both from the same screen, and a card charged against a test key returns
// a perfectly successful response. The customer sees a receipt. The money does not exist. Nothing
// downstream — not the invoice status, not the bank reconciliation, not the books — can tell the
// difference until somebody notices the deposit never landed.
//
// The MIXED case is worse and easier to reach: a live secret with a test publishable key, or the
// reverse. That happens the moment somebody copies one key from the dashboard with "View test data"
// toggled the wrong way, and it produces errors that read like a broken integration rather than a
// wrong key.
//
// ── IT NEVER RETURNS A KEY ──────────────────────────────────────────────────────────────────────
//
// Only the classification — live / test / malformed / missing. The values are secrets, this feeds a
// screen, and a readiness page that prints the thing it is checking is a worse problem than the one
// it solves.
//
// Pure module: env and counts in, verdicts out. No I/O. Tested in `__tests__/payments/readiness.test.ts`.

import { STARR_CASHAPP_HANDLE, STARR_VENMO_HANDLE, STARR_ZELLE_EMAIL } from './live';

export type KeyMode = 'live' | 'test' | 'malformed' | 'missing';

export type CheckStatus =
  /** Ready. */
  | 'ok'
  /** Works, but somebody should look — not a reason to stop. */
  | 'warn'
  /** Real money would not move, or would move wrongly. */
  | 'blocker';

export interface ReadinessCheck {
  id: string;
  label: string;
  status: CheckStatus;
  /** One sentence, written for the person who has to act on it. */
  detail: string;
}

/**
 * Which mode a Stripe key is in, from its prefix alone.
 *
 * `expect` is the prefix family: `sk` for secret, `pk` for publishable, `whsec` for a webhook
 * signing secret. A secret key sitting in the publishable variable is a real mistake — and a
 * dangerous one, because it publishes a secret to every visitor — so the family is checked, not just
 * the mode.
 */
export function classifyStripeKey(raw: string | undefined | null, expect: 'sk' | 'pk' | 'whsec'): KeyMode {
  const key = (raw ?? '').trim();
  if (!key) return 'missing';
  if (expect === 'whsec') return key.startsWith('whsec_') ? 'live' : 'malformed';
  if (key.startsWith(`${expect}_live_`)) return 'live';
  if (key.startsWith(`${expect}_test_`)) return 'test';
  return 'malformed';
}

export interface ReadinessInput {
  env?: NodeJS.ProcessEnv;
  /** How many non-retired `COMPANY` cards are registered. */
  companyCards?: number;
}

/**
 * Every check, worst first.
 *
 * Ordered by status rather than by topic: somebody opening this wants the thing stopping them, not a
 * tour of what is fine.
 */
export function paymentsReadiness(input: ReadinessInput = {}): ReadinessCheck[] {
  const env = input.env ?? process.env;
  const checks: ReadinessCheck[] = [];

  const secret = classifyStripeKey(env.STRIPE_SECRET_KEY, 'sk');
  const publishable = classifyStripeKey(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, 'pk');
  const webhook = classifyStripeKey(env.STRIPE_WEBHOOK_SECRET, 'whsec');

  const describeKey = (id: string, label: string, mode: KeyMode, what: string): ReadinessCheck => {
    if (mode === 'live') return { id, label, status: 'ok', detail: `${what} is set and is a live key.` };
    if (mode === 'test') {
      return {
        id, label, status: 'blocker',
        detail: `${what} is a TEST key. Payments would appear to succeed and no money would arrive.`,
      };
    }
    if (mode === 'malformed') {
      return { id, label, status: 'blocker', detail: `${what} does not look like a Stripe key of the right kind — check it was copied from the right field.` };
    }
    return { id, label, status: 'blocker', detail: `${what} is not set.` };
  };

  checks.push(describeKey('stripe_secret', 'Stripe secret key', secret, 'STRIPE_SECRET_KEY'));
  checks.push(describeKey('stripe_publishable', 'Stripe publishable key', publishable, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'));

  // The mixed case gets its own line. Reporting only "both are set" would hide it, and the errors it
  // produces read like a broken integration rather than a mismatched pair.
  if ((secret === 'live' && publishable === 'test') || (secret === 'test' && publishable === 'live')) {
    checks.push({
      id: 'stripe_mode_mismatch',
      label: 'Stripe keys disagree',
      status: 'blocker',
      detail: `The secret key is ${secret} and the publishable key is ${publishable}. They must be the same mode — this happens when one is copied with "View test data" toggled the other way.`,
    });
  }

  checks.push(
    webhook === 'live'
      ? { id: 'stripe_webhook', label: 'Stripe webhook secret', status: 'ok', detail: 'STRIPE_WEBHOOK_SECRET is set. Confirm the endpoint is still enabled in Stripe — a secret from a deleted endpoint verifies nothing.' }
      : {
        id: 'stripe_webhook', label: 'Stripe webhook secret', status: 'blocker',
        detail: webhook === 'missing'
          ? 'STRIPE_WEBHOOK_SECRET is not set, so Stripe callbacks cannot be verified and payments would never be marked paid.'
          : 'STRIPE_WEBHOOK_SECRET does not start with whsec_ — that is not a webhook signing secret.',
      },
  );

  // The handles are hard-coded. This cannot tell whether they are the firm's real accounts — only a
  // person opening the app can — so it is a warn that says exactly what to go and check. A customer
  // paying the wrong handle gets no error and the invoice simply stays unpaid.
  const handles = [
    ['Venmo', STARR_VENMO_HANDLE],
    ['CashApp', STARR_CASHAPP_HANDLE],
    ['Zelle', STARR_ZELLE_EMAIL],
  ] as const;
  const blank = handles.filter(([, v]) => !v || !v.trim()).map(([n]) => n);
  checks.push(blank.length
    ? { id: 'handles', label: 'Venmo / CashApp / Zelle handles', status: 'blocker', detail: `No handle configured for: ${blank.join(', ')}. A customer choosing that method would have nowhere to send the money.` }
    : {
      id: 'handles', label: 'Venmo / CashApp / Zelle handles', status: 'warn',
      detail: `Set to ${STARR_VENMO_HANDLE} · ${STARR_CASHAPP_HANDLE} · ${STARR_ZELLE_EMAIL}. Open each app and confirm they are the firm's — a customer paying the wrong handle gets no error, and the invoice just stays unpaid.`,
    });

  const cards = input.companyCards ?? 0;
  checks.push(cards > 0
    ? { id: 'cards', label: 'Company cards on file', status: 'ok', detail: `${cards} company card${cards === 1 ? '' : 's'} registered, so receipts can be matched against them.` }
    : { id: 'cards', label: 'Company cards on file', status: 'warn', detail: 'No company card is registered, so every card receipt will be flagged as an unknown card.' });

  const live = env.PAYMENTS_LIVE === 'true';
  const blockers = checks.filter((c) => c.status === 'blocker').length;
  checks.push({
    id: 'payments_live',
    label: 'PAYMENTS_LIVE',
    // Live WITH blockers is the worst state on the page and is called out as one, because it is the
    // only combination where a customer can be charged while something is known to be wrong.
    status: live ? (blockers ? 'blocker' : 'ok') : 'warn',
    detail: live
      ? (blockers
        ? `Payments are LIVE while ${blockers} blocker${blockers === 1 ? '' : 's'} above ${blockers === 1 ? 'is' : 'are'} unresolved. Customers can be charged right now.`
        : 'Payments are live and everything above checks out.')
      : 'Payments are off — the portal is visible but nothing can be charged. Set PAYMENTS_LIVE=true once the blockers above are clear.',
  });

  const rank: Record<CheckStatus, number> = { blocker: 0, warn: 1, ok: 2 };
  return checks.sort((a, b) => rank[a.status] - rank[b.status]);
}

/** One line for the top of the screen. */
export function readinessSummary(checks: readonly ReadinessCheck[]): { status: CheckStatus; text: string } {
  const blockers = checks.filter((c) => c.status === 'blocker').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  if (blockers) {
    return { status: 'blocker', text: `${blockers} thing${blockers === 1 ? '' : 's'} would stop real money moving correctly.` };
  }
  if (warns) return { status: 'warn', text: `Ready, with ${warns} thing${warns === 1 ? '' : 's'} worth confirming by hand.` };
  return { status: 'ok', text: 'Everything checks out.' };
}
