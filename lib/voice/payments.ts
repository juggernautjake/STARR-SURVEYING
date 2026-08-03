// lib/voice/payments.ts — how Andrew gets paid.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//  ANDREW'S STRIPE KEYS ARE NOT STARR'S STRIPE KEYS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// This repo already has `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` configured, and
// they belong to Starr Surveying. Reading them here would route a client's payment for Andrew's voice
// work into a surveying company's bank account. It would work — silently, correctly, in production —
// which is exactly what makes it dangerous.
//
// So the keys are read from `VOICE_`-prefixed variables ONLY, with no fallback to the unprefixed ones.
// If Andrew has not connected his own Stripe account, card payment is simply off and the invoice page
// shows the transfer methods instead. An absent key must never degrade into somebody else's key.
//
// This also survives the move: when the site is lifted into Andrew's own repo, the prefixed names come
// with it and nothing has to be found and renamed.
//
// ── WHY OFFLINE METHODS COME FIRST ──────────────────────────────────────────────────────────────
//
// A voice actor's first year of invoices is settled by bank transfer, Zelle and Venmo. Stripe takes
// 2.9% + 30¢ and needs an onboarding session with a bank account and a tax ID. Both are worth having,
// but an invoice that cannot be paid today because the card processor is not connected yet is a bug in
// the business, not just the software. Every method here works with nothing configured.

/** A way to be paid, as stored on `va_settings.payment_methods`. */
export interface PaymentMethod {
  /** Matches the `method` CHECK on va_payments. */
  id: 'venmo' | 'cashapp' | 'zelle' | 'paypal' | 'check' | 'cash' | 'other';
  label: string;
  /** The handle a client sends money to: `@andrew-ash`, an email, `$andrewash`. */
  handle: string;
  /** Optional extra sentence, e.g. "please include the invoice number". */
  instructions?: string;
  enabled: boolean;
}

/** Started empty on purpose — a portal that advertises a Venmo handle Andrew does not have is worse
 *  than one that advertises nothing. He fills these in under Studio → Settings. */
export const DEFAULT_PAYMENT_METHODS: readonly PaymentMethod[] = [
  { id: 'zelle', label: 'Zelle', handle: '', enabled: false },
  { id: 'venmo', label: 'Venmo', handle: '', enabled: false },
  { id: 'paypal', label: 'PayPal', handle: '', enabled: false },
  { id: 'check', label: 'Check by mail', handle: '', enabled: false },
];

const METHOD_IDS: readonly PaymentMethod['id'][] = ['venmo', 'cashapp', 'zelle', 'paypal', 'check', 'cash', 'other'];

/** Coerce whatever is in the JSONB column into methods we can render. Anything unrecognised is
 *  dropped rather than repaired: a half-parsed payment handle is a wrong payment handle. */
export function normalizePaymentMethods(raw: unknown): PaymentMethod[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentMethod[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const id = String(e.id ?? '') as PaymentMethod['id'];
    if (!METHOD_IDS.includes(id)) continue;
    const handle = typeof e.handle === 'string' ? e.handle.trim().slice(0, 160) : '';
    out.push({
      id,
      label: typeof e.label === 'string' && e.label.trim() ? e.label.trim().slice(0, 60) : id,
      handle,
      instructions:
        typeof e.instructions === 'string' && e.instructions.trim()
          ? e.instructions.trim().slice(0, 400)
          : undefined,
      enabled: e.enabled === true,
    });
  }
  return out;
}

/** Only methods a client can actually act on. An enabled method with no handle is a dead end — it
 *  tells someone to send money and does not say where — so it is filtered out here rather than
 *  rendered as an empty row. `check` is the exception: the address lives in `instructions`. */
export function payableMethods(methods: PaymentMethod[]): PaymentMethod[] {
  return methods.filter((m) => m.enabled && (m.handle.length > 0 || (m.id === 'check' && !!m.instructions)));
}

// ── Stripe configuration ───────────────────────────────────────────────────────────────────────

/** Andrew's publishable key, or null. Placeholder values from `.env.example` are rejected so a
 *  copied-but-unfilled env does not boot Stripe with junk and fail at confirm time. */
export function voiceStripePublishableKey(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.NEXT_PUBLIC_VOICE_STRIPE_PUBLISHABLE_KEY ?? '').trim();
  if (!raw || raw.startsWith('REPLACE') || raw.endsWith('...')) return null;
  return raw.startsWith('pk_') ? raw : null;
}

/** Andrew's secret key, or null. Server-only. */
export function voiceStripeSecretKey(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.VOICE_STRIPE_SECRET_KEY ?? '').trim();
  if (!raw || raw.startsWith('REPLACE') || raw.endsWith('...')) return null;
  return raw.startsWith('sk_') || raw.startsWith('rk_') ? raw : null;
}

/** Card payment needs BOTH halves plus a deliberate switch. The switch exists because having keys is
 *  not the same as being ready to take money: a test key works end to end and settles nothing. */
export function cardPaymentEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VOICE_PAYMENTS_LIVE === 'true' && voiceStripePublishableKey(env) !== null && voiceStripeSecretKey(env) !== null;
}

/** What the browser is allowed to know: the publishable key only, and only when live. */
export function clientStripeConfig(env: Record<string, string | undefined> = process.env): { publishableKey: string } | null {
  if (!cardPaymentEnabled(env)) return null;
  const key = voiceStripePublishableKey(env);
  return key ? { publishableKey: key } : null;
}

// ── Deep links ─────────────────────────────────────────────────────────────────────────────────

/** Open the client's payment app with the amount and a note already filled in. Returns null when the
 *  method has no app to open (check, cash, bank transfer). */
export function buildPaymentDeepLink(method: PaymentMethod, invoiceNumber: string, amountCents: number): string | null {
  const dollars = (Math.max(0, amountCents) / 100).toFixed(2);
  const note = encodeURIComponent(`Invoice ${invoiceNumber}`);
  const handle = method.handle.replace(/^[@$]/, '');
  if (!handle) return null;
  switch (method.id) {
    case 'venmo':
      return `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(handle)}&amount=${dollars}&note=${note}`;
    case 'cashapp':
      return `https://cash.app/$${encodeURIComponent(handle)}/${dollars}`;
    case 'paypal':
      return `https://paypal.me/${encodeURIComponent(handle)}/${dollars}`;
    default:
      // Zelle has no web deep link — it happens inside the client's own banking app, so the handle is
      // all we can usefully give them.
      return null;
  }
}

// ── Response interpretation ────────────────────────────────────────────────────────────────────

export interface IntentOutcome {
  clientSecret: string | null;
  message: string | null;
  /** true → show the offline methods instead; card is not going to work right now. */
  fallback: boolean;
}

/** Turn the intent route's status + body into something to render. Kept pure and separate from the
 *  component so the failure wording is testable — it is the part a client actually reads. */
export function interpretIntentResponse(
  status: number,
  body: { clientSecret?: unknown; error?: unknown },
): IntentOutcome {
  if (status === 200 && typeof body.clientSecret === 'string' && body.clientSecret.length > 0) {
    return { clientSecret: body.clientSecret, message: null, fallback: false };
  }
  const err = typeof body.error === 'string' && body.error ? body.error : null;
  if (status === 503) {
    return { clientSecret: null, message: err ?? 'Card payment is not switched on yet.', fallback: true };
  }
  if (status === 409) {
    return { clientSecret: null, message: err ?? 'This invoice has already been paid.', fallback: false };
  }
  return {
    clientSecret: null,
    message: err ?? 'Something went wrong starting the card payment.',
    fallback: status >= 500,
  };
}

/** Given the money that has cleared, what the invoice's status becomes. Payment is the only thing
 *  allowed to move an invoice to `paid`, and it does so by arithmetic rather than by a caller
 *  asserting it. */
export function statusAfterPayment(args: {
  totalCents: number;
  alreadyPaidCents: number;
  newPaymentCents: number;
}): 'paid' | 'partial' | 'sent' {
  const paid = Math.max(0, args.alreadyPaidCents) + Math.max(0, args.newPaymentCents);
  if (paid >= Math.max(0, args.totalCents)) return 'paid';
  if (paid > 0) return 'partial';
  return 'sent';
}
