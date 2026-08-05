// __tests__/voice/studio-badges.test.ts
//
// Owner report (2026-08-05): the Inquiries tab showed a "1" badge, but opening it revealed nothing.
// The cause was the badge counting `unreadCount` — every unread notification of every kind — so a
// system message or a since-archived inquiry lit a badge with nothing in the Open queue behind it.
//
// The rule these tests lock in: every nav badge is counted from the SAME table its destination page
// lists, filtered to the rows that actually render there. A badge cannot say "1" unless there is one
// real row waiting when you arrive.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Records every .eq(col, val) per table so we can prove WHICH rows each badge counts, and returns a
// per-table count. The builder is both chainable (.select/.eq return it) and awaitable (.then).
const counts: Record<string, number> = {};
const eqCalls: Array<{ table: string; col: string; val: unknown }> = [];
let throwOnFrom: string | null = null;

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (throwOnFrom === table) throw new Error('boom');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          eqCalls.push({ table, col, val });
          return builder;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: (v: { count: number | null; error: null }) => any) =>
          resolve({ count: counts[table] ?? 0, error: null }),
      };
      return builder;
    },
  },
}));

const { studioBadges } = await import('@/lib/voice/notifications');

beforeEach(() => {
  for (const k of Object.keys(counts)) delete counts[k];
  eqCalls.length = 0;
  throwOnFrom = null;
});

describe('studioBadges — counts come from the destination tables, not the notification feed', () => {
  it('never reads va_notifications (the source of the phantom badge)', async () => {
    await studioBadges();
    expect(eqCalls.some((c) => c.table === 'va_notifications')).toBe(false);
  });

  it('counts inquiries as va_inquiries with status "new"', async () => {
    counts.va_inquiries = 2;
    const badges = await studioBadges();
    expect(badges.inquiries).toBe(2);
    expect(eqCalls).toContainEqual({ table: 'va_inquiries', col: 'status', val: 'new' });
  });

  it('counts money as client-declared payments still pending confirmation', async () => {
    counts.va_payments = 1;
    const badges = await studioBadges();
    expect(badges.money).toBe(1);
    expect(eqCalls).toContainEqual({ table: 'va_payments', col: 'status', val: 'pending' });
    expect(eqCalls).toContainEqual({ table: 'va_payments', col: 'declared_by_client', val: true });
  });

  it('counts contracts awaiting Andrew\'s countersignature (status "signed")', async () => {
    counts.va_contracts = 3;
    const badges = await studioBadges();
    expect(badges.contracts).toBe(3);
    expect(eqCalls).toContainEqual({ table: 'va_contracts', col: 'status', val: 'signed' });
  });

  it('shows zero — no badge — when nothing is waiting', async () => {
    const badges = await studioBadges();
    expect(badges).toEqual({ inquiries: 0, money: 0, contracts: 0 });
  });

  it('never throws, and reports the failed count as 0 rather than guessing', async () => {
    counts.va_inquiries = 5;
    counts.va_contracts = 4;
    throwOnFrom = 'va_payments'; // building this query throws
    const badges = await studioBadges();
    // The one that failed is absent; the others are unaffected — a broken count can never inflate a
    // badge into claiming work that isn't there.
    expect(badges).toEqual({ inquiries: 5, money: 0, contracts: 4 });
  });
});
