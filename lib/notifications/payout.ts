// lib/notifications/payout.ts
//
// notifications-completeness-pass Slice 2 — pure builders for the two
// payout-related notifications.
//
// - `buildPayoutNotification` fires when an admin records a direct
//   payout (cash / Zelle / check) via POST /api/admin/payouts.
// - `buildPayStubNotification` fires when a payroll run transitions to
//   `completed` via PUT /api/admin/payroll/runs and the employee's
//   stub gets credited to their balance.
//
// Both link to /admin/me?tab=pay (the employee's pay tab in the hub).
// Dependency-free → unit-tested in node.

export interface PayoutNotificationInput {
  user_email: string;
  amount_cents: number;
  method: string;
  paid_at: string | null;
}

export interface PayStubNotificationInput {
  user_email: string;
  net_pay: number;
  pay_period_start: string;
  pay_period_end: string;
}

export interface NotifyPayload {
  user_email: string;
  type: 'payment';
  /** `source_type` distinguishes the two events the builder produces. */
  source_type: 'payout' | 'pay_stub';
  title: string;
  body: string;
  icon: string;
  link: string;
}

const PAY_LINK = '/admin/me?tab=pay';

/** Pretty-format `amount_cents` as a USD string (`$1,234.56`). */
export function formatUsdCents(cents: number): string {
  const dollars = Math.round(cents) / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(dollars);
}

/** Pretty-format `dollars` as a USD string (`$1,234.56`). Used for
 *  pay-stub `net_pay` which already arrives as dollars. */
export function formatUsd(dollars: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(dollars);
}

/** Friendly method label — `direct_deposit` → "direct deposit", `cash` →
 *  "cash", any unrecognized value passes through with underscores → spaces. */
export function payoutMethodLabel(method: string): string {
  return method.trim().replace(/_/g, ' ');
}

/** Compose the "Payout posted" notification fired from
 *  /api/admin/payouts POST. Returns null when the input is unusable
 *  (missing email, non-positive amount) so the caller can drop the
 *  call without leaking a malformed row. */
export function buildPayoutNotification(input: PayoutNotificationInput): NotifyPayload | null {
  const email = input.user_email?.trim().toLowerCase();
  if (!email) return null;
  if (!Number.isFinite(input.amount_cents) || input.amount_cents <= 0) return null;

  const amount = formatUsdCents(input.amount_cents);
  const method = payoutMethodLabel(input.method);
  const date = input.paid_at ? input.paid_at.slice(0, 10) : null;

  return {
    user_email: email,
    type: 'payment',
    source_type: 'payout',
    title: `💸 Payout posted — ${amount}`,
    body: date
      ? `${amount} sent via ${method} on ${date}.`
      : `${amount} sent via ${method}.`,
    icon: '💸',
    link: PAY_LINK,
  };
}

/** Compose the "Pay stub ready" notification fired when a payroll run
 *  transitions to `completed` and the employee's stub gets credited to
 *  their balance. Returns null when the input is unusable. */
export function buildPayStubNotification(input: PayStubNotificationInput): NotifyPayload | null {
  const email = input.user_email?.trim().toLowerCase();
  if (!email) return null;
  if (!Number.isFinite(input.net_pay) || input.net_pay <= 0) return null;

  const amount = formatUsd(input.net_pay);
  const start = input.pay_period_start.slice(0, 10);
  const end = input.pay_period_end.slice(0, 10);

  return {
    user_email: email,
    type: 'payment',
    source_type: 'pay_stub',
    title: `💵 Pay stub ready — ${amount}`,
    body: `Your pay for ${start} – ${end} has been credited to your balance.`,
    icon: '💵',
    link: PAY_LINK,
  };
}
