// lib/notifications/pay-raise.ts
//
// Slice 2h of hub-widget-excellence-03-notifications. Pure payload
// builder for the pay-rate-change notification sent to the employee.
// Only an actual increase reads as "You got a raise!"; a decrease or a
// first-time set reads as a neutral "pay rate updated"; a no-op (same
// rate) produces nothing. Dependency-free + unit-testable.

export interface PayRaiseInput {
  user_email?: string | null;
  new_rate?: number | string | null;
  previous_rate?: number | string | null;
  effective_date?: string | null;
}

export interface PayRaiseNotification {
  user_email: string;
  type: 'payment';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'pay_raise';
}

export function buildPayRaiseNotification(
  input: PayRaiseInput,
): PayRaiseNotification | null {
  const user_email = input.user_email?.trim();
  if (!user_email) return null;

  const next = toNumber(input.new_rate);
  if (next == null) return null;
  const prev = toNumber(input.previous_rate);
  const effective = isoDate(input.effective_date);
  const effSuffix = effective ? `, effective ${effective}` : '';
  const rate = `$${next.toFixed(2)}/hr`;

  let title: string;
  let body: string;
  let icon: string;

  if (prev != null && next > prev) {
    icon = '🎉';
    title = '🎉 You got a raise!';
    body = `Your pay rate is now ${rate} (up from $${prev.toFixed(2)})${effSuffix}.`;
  } else if (prev != null && next === prev) {
    // No change — nothing worth a bell.
    return null;
  } else if (prev != null && next < prev) {
    icon = '💵';
    title = '💵 Pay rate updated';
    body = `Your pay rate is now ${rate}${effSuffix}.`;
  } else {
    // No previous rate on file — a first-time set.
    icon = '💵';
    title = '💵 Pay rate set';
    body = `Your pay rate is ${rate}${effSuffix}.`;
  }

  return {
    user_email,
    type: 'payment',
    title,
    body,
    icon,
    link: '/admin/me?tab=pay',
    source_type: 'pay_raise',
  };
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoDate(value?: string | null): string {
  if (!value) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : '';
}
