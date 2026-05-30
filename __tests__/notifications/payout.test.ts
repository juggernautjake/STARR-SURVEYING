// __tests__/notifications/payout.test.ts
//
// notifications-completeness-pass Slice 2 — locks the two pure payout
// notification builders.

import { describe, it, expect } from 'vitest';
import {
  buildPayoutNotification,
  buildPayStubNotification,
  formatUsdCents,
  formatUsd,
  payoutMethodLabel,
} from '@/lib/notifications/payout';

describe('formatUsdCents / formatUsd', () => {
  it('formats cents into USD', () => {
    expect(formatUsdCents(123456)).toBe('$1,234.56');
    expect(formatUsdCents(50)).toBe('$0.50');
  });
  it('formats dollars into USD', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(0)).toBe('$0.00');
  });
});

describe('payoutMethodLabel', () => {
  it('replaces underscores with spaces', () => {
    expect(payoutMethodLabel('direct_deposit')).toBe('direct deposit');
    expect(payoutMethodLabel('cash')).toBe('cash');
  });
});

describe('buildPayoutNotification', () => {
  it('composes a friendly title + body with amount, method, and date', () => {
    const out = buildPayoutNotification({
      user_email: 'crew@x.com',
      amount_cents: 12345,
      method: 'zelle',
      paid_at: '2026-05-30T10:00:00Z',
    });
    expect(out).toEqual({
      user_email: 'crew@x.com',
      type: 'payment',
      source_type: 'payout',
      title: '💸 Payout posted — $123.45',
      body: '$123.45 sent via zelle on 2026-05-30.',
      icon: '💸',
      link: '/admin/me?tab=pay',
    });
  });

  it('omits the date suffix when paid_at is null', () => {
    const out = buildPayoutNotification({
      user_email: 'crew@x.com',
      amount_cents: 5000,
      method: 'cash',
      paid_at: null,
    });
    expect(out?.body).toBe('$50.00 sent via cash.');
  });

  it('lowercases + trims the email', () => {
    expect(buildPayoutNotification({
      user_email: ' Crew@X.COM ', amount_cents: 100, method: 'cash', paid_at: null,
    })?.user_email).toBe('crew@x.com');
  });

  it('returns null on missing email or non-positive amount', () => {
    expect(buildPayoutNotification({ user_email: '', amount_cents: 100, method: 'cash', paid_at: null })).toBeNull();
    expect(buildPayoutNotification({ user_email: 'a@b.com', amount_cents: 0, method: 'cash', paid_at: null })).toBeNull();
    expect(buildPayoutNotification({ user_email: 'a@b.com', amount_cents: -1, method: 'cash', paid_at: null })).toBeNull();
  });
});

describe('buildPayStubNotification', () => {
  it('composes the title + body with the net pay + period bounds', () => {
    const out = buildPayStubNotification({
      user_email: 'crew@x.com',
      net_pay: 1234.5,
      pay_period_start: '2026-05-16',
      pay_period_end: '2026-05-30',
    });
    expect(out).toEqual({
      user_email: 'crew@x.com',
      type: 'payment',
      source_type: 'pay_stub',
      title: '💵 Pay stub ready — $1,234.50',
      body: 'Your pay for 2026-05-16 – 2026-05-30 has been credited to your balance.',
      icon: '💵',
      link: '/admin/me?tab=pay',
    });
  });

  it('returns null on missing email or non-positive net pay', () => {
    expect(buildPayStubNotification({
      user_email: '', net_pay: 100, pay_period_start: '2026-05-16', pay_period_end: '2026-05-30',
    })).toBeNull();
    expect(buildPayStubNotification({
      user_email: 'a@b.com', net_pay: 0, pay_period_start: '2026-05-16', pay_period_end: '2026-05-30',
    })).toBeNull();
  });
});
