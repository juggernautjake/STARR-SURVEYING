// lib/payments/invoice-public.ts
//
// P4 of payment-infrastructure-2026-06-18.md — pure helpers used by
// the public invoice-lookup route. Lives in `lib/` so vitest can
// import them without dragging in the next-auth shell of the route
// file.

export interface LineItemPublic {
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

/** Pure helper — strip line items down to the columns the customer
 *  sees on `/pay/[invoice]`. Anything that smells like an internal
 *  note is dropped. */
export function sanitizeLineItems(raw: unknown): LineItemPublic[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object')
    .map((row) => ({
      description: typeof row.description === 'string' ? row.description : '',
      quantity: typeof row.quantity === 'number' ? row.quantity : 1,
      unit_price_cents: typeof row.unit_price_cents === 'number' ? row.unit_price_cents : 0,
      total_cents: typeof row.total_cents === 'number' ? row.total_cents : 0,
    }));
}

/** Pure helper — total paid against an invoice from its payments
 *  array (only `succeeded` rows count toward balance). */
export function sumSucceededPayments(
  payments: ReadonlyArray<{ amount_cents?: number; status?: string }>,
): number {
  return payments
    .filter((p) => p.status === 'succeeded')
    .reduce((acc, p) => acc + (typeof p.amount_cents === 'number' ? p.amount_cents : 0), 0);
}

export const PUBLIC_BLOCKED_STATUSES: ReadonlySet<string> = new Set(['draft', 'voided']);

/** P8 — public summary of a cleared payment, shown on the
 *  return-to-portal paid-card. We deliberately mask raw external
 *  ids (Stripe / Venmo tx ids) down to the last 4 chars so a screen
 *  grab of the URL bar doesn't leak the full token. */
export interface PublicPaymentSummary {
  amount_cents: number;
  method: string;
  method_label: string;
  cleared_at: string | null;
  external_id_tail: string | null;  // last-4 of external_id
  payer_email_mask: string | null;  // m***@example.com
}

const METHOD_LABELS: Record<string, string> = {
  stripe: 'Card or bank',
  venmo: 'Venmo',
  cashapp: 'Cash App',
  zelle: 'Zelle',
  ach: 'Bank ACH',
  cash: 'Cash in office',
  check: 'Check',
  other: 'Other',
};

/** Pure helper — mask a payer email so the customer can confirm
 *  "yes that's me" without exposing the full address publicly. */
export function maskPayerEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const at = trimmed.indexOf('@');
  if (at <= 0) return trimmed;  // not an email — return as-is
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(1, local.length - 1))}${domain}`;
}

/** Pure helper — last-4 of an external id so the customer can
 *  cross-reference their Venmo / bank statement without seeing the
 *  whole token (which a Stripe charge_id is treated as sensitive). */
export function lastFour(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(-4);
}

/** Pure helper — turn a raw payments row into the public summary
 *  shape. Drops rows that aren't `succeeded`. */
export function describePaymentForReceipt(row: {
  amount_cents?: number;
  method?: string;
  status?: string;
  cleared_at?: string | null;
  external_id?: string | null;
  payer_email?: string | null;
}): PublicPaymentSummary | null {
  if (row.status !== 'succeeded') return null;
  const method = typeof row.method === 'string' ? row.method : 'other';
  return {
    amount_cents: typeof row.amount_cents === 'number' ? row.amount_cents : 0,
    method,
    method_label: METHOD_LABELS[method] ?? method,
    cleared_at: row.cleared_at ?? null,
    external_id_tail: lastFour(row.external_id),
    payer_email_mask: maskPayerEmail(row.payer_email),
  };
}

/** P6 — methods that produce a `payment_attempts` row through the
 *  public `attempt` route. Deep-link platforms go to
 *  `pending_confirmation`; cash + check go to `pledged`. Stripe is
 *  intentionally absent — it has its own intent + webhook path. */
const ATTEMPT_METHOD_STATUS: ReadonlyMap<string, 'pending_confirmation' | 'pledged'> = new Map([
  ['venmo', 'pending_confirmation'],
  ['cashapp', 'pending_confirmation'],
  ['zelle', 'pending_confirmation'],
  ['cash', 'pledged'],
  ['check', 'pledged'],
]);

export function attemptStatusForMethod(method: string): 'pending_confirmation' | 'pledged' | null {
  return ATTEMPT_METHOD_STATUS.get(method) ?? null;
}

/** P6 — clean the "I sent it" message the customer typed. Trim,
 *  cap at 500 chars (the column is plain text, not JSONB, so this
 *  is the bound). Returns null when the trimmed result is empty. */
export function sanitizeAttemptMessage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(/\s+$/g, '').slice(0, 500);
  return trimmed.trim().length === 0 ? null : trimmed;
}
