// __tests__/notifications/pay-raise.test.ts
//
// Slice 2h of hub-widget-excellence-03-notifications. Locks the pure
// pay-rate-change notification builder.

import { describe, it, expect } from 'vitest';
import { buildPayRaiseNotification } from '@/lib/notifications/pay-raise';

describe('buildPayRaiseNotification', () => {
  it('celebrates an actual increase as a raise', () => {
    const n = buildPayRaiseNotification({
      user_email: 'a@x.com',
      new_rate: 32,
      previous_rate: 28,
      effective_date: '2026-06-01',
    })!;
    expect(n).toMatchObject({
      user_email: 'a@x.com',
      type: 'payment',
      icon: '🎉',
      link: '/admin/my-pay',
      source_type: 'pay_raise',
    });
    expect(n.title).toBe('🎉 You got a raise!');
    expect(n.body).toBe('Your pay rate is now $32.00/hr (up from $28.00), effective 2026-06-01.');
  });

  it('reads a decrease as a neutral update (not a raise)', () => {
    const n = buildPayRaiseNotification({ user_email: 'a@x.com', new_rate: 25, previous_rate: 28 })!;
    expect(n.icon).toBe('💵');
    expect(n.title).toBe('💵 Pay rate updated');
    expect(n.body).toBe('Your pay rate is now $25.00/hr.');
  });

  it('reads a first-time set (no previous rate) as a neutral set', () => {
    const n = buildPayRaiseNotification({ user_email: 'a@x.com', new_rate: 30, previous_rate: 0 })!;
    // previous 0 counts as a real previous rate → 30 > 0 → raise.
    expect(n.title).toBe('🎉 You got a raise!');

    const noPrev = buildPayRaiseNotification({ user_email: 'a@x.com', new_rate: 30, previous_rate: null })!;
    expect(noPrev.title).toBe('💵 Pay rate set');
    expect(noPrev.body).toBe('Your pay rate is $30.00/hr.');
  });

  it('produces nothing for a no-op (same rate)', () => {
    expect(buildPayRaiseNotification({ user_email: 'a@x.com', new_rate: 28, previous_rate: 28 })).toBeNull();
  });

  it('coerces string rates + returns null without user or new rate', () => {
    expect(buildPayRaiseNotification({ user_email: 'a@x.com', new_rate: '31.5', previous_rate: '30' })!.body)
      .toContain('$31.50/hr');
    expect(buildPayRaiseNotification({ user_email: null, new_rate: 30 })).toBeNull();
    expect(buildPayRaiseNotification({ user_email: 'a@x.com', new_rate: null })).toBeNull();
  });
});
