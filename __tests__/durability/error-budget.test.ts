// __tests__/durability/error-budget.test.ts — E1-3, and the two things that make a control get muted.
//
// The analysis asks *"is anyone looking at it, and does anything alert?"* — and the answer to the second
// question has to survive contact with a real week. An alarm that fires on the handful of errors a small
// app throws from bots hitting dead URLs is an alarm somebody turns off in month two, after which
// nothing works and everything looks fine.
import { describe, it, expect } from 'vitest';
import {
  LOUD_SEVERITIES, SPIKE_FLOOR, describeBudget, errorBudget, type ErrorRow,
} from '@/lib/errors/budget';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-01T12:00:00Z');
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const err = (over: Partial<ErrorRow> = {}): ErrorRow => ({
  id: Math.random().toString(36).slice(2), created_at: ago(1), severity: 'error',
  resolved_at: null, route_path: '/admin/jobs', api_endpoint: null, error_message: 'boom', ...over,
});
const budget = (rows: ErrorRow[], windowDays = 7) => errorBudget(rows, { asOf: NOW, windowDays });

describe('the window', () => {
  it('counts this window and the one before it separately', () => {
    const b = budget([err({ created_at: ago(2) }), err({ created_at: ago(9) })]);
    expect(b.total).toBe(1);
    expect(b.previousTotal).toBe(1);
    expect(b.change).toBe(0);
  });

  it('ignores anything older than both windows', () => {
    const b = budget([err({ created_at: ago(40) })]);
    expect(b.total).toBe(0);
    expect(b.previousTotal).toBe(0);
  });

  it('counts unresolved separately from total', () => {
    const b = budget([err({}), err({ resolved_at: ago(0) })]);
    expect(b.total).toBe(2);
    expect(b.unresolved).toBe(1);
  });

  it('counts the loud ones', () => {
    const b = budget([err({ severity: 'critical' }), err({ severity: 'info' }), err({ severity: null })]);
    expect(b.loud).toBe(1);
    for (const s of LOUD_SEVERITIES) expect(budget([err({ severity: s })]).loud).toBe(1);
    // Case must not decide whether someone gets woken up.
    expect(budget([err({ severity: 'CRITICAL' })]).loud).toBe(1);
  });
});

describe('a spike is RELATIVE and has a FLOOR', () => {
  it('does not fire on a quiet week doubling', () => {
    // Going from one error to two is an infinite proportional increase and means nothing. Without the
    // floor, the quietest possible week produces the loudest possible alarm — and that is how a control
    // gets muted in month two, after which nothing works and everything looks fine.
    const b = budget([err({ created_at: ago(1) }), err({ created_at: ago(2) }), err({ created_at: ago(9) })]);
    expect(b.total).toBe(2);
    expect(b.previousTotal).toBe(1);
    expect(b.spiking).toBe(false);
  });

  it('fires when the count is both big enough and up sharply', () => {
    const rows = [
      ...Array.from({ length: 12 }, () => err({ created_at: ago(2) })),
      ...Array.from({ length: 3 }, () => err({ created_at: ago(9) })),
    ];
    const b = budget(rows);
    expect(b.total).toBe(12);
    expect(b.spiking).toBe(true);
  });

  it('does NOT fire on a steady week, however large', () => {
    // Forty a week, steady, is a known quantity. A threshold alarm would scream at it every single week
    // and teach everyone that the alarm means nothing.
    const rows = [
      ...Array.from({ length: 40 }, () => err({ created_at: ago(2) })),
      ...Array.from({ length: 40 }, () => err({ created_at: ago(9) })),
    ];
    expect(budget(rows).spiking).toBe(false);
  });

  it('needs at least the floor before it can spike at all', () => {
    const rows = Array.from({ length: SPIKE_FLOOR - 1 }, () => err({ created_at: ago(1) }));
    expect(budget(rows).spiking).toBe(false);
  });
});

describe('top routes', () => {
  it('groups by ROUTE, not by message', () => {
    // Ten different stack traces from one broken endpoint are ONE problem. Keying on the message shows
    // them as ten, which turns a single fix into a list nobody knows how to start.
    const rows = [
      err({ api_endpoint: '/api/admin/jobs', error_message: 'a' }),
      err({ api_endpoint: '/api/admin/jobs', error_message: 'b' }),
      err({ api_endpoint: '/api/admin/leads', error_message: 'c' }),
    ];
    expect(budget(rows).topRoutes).toEqual([
      { route: '/api/admin/jobs', count: 2 },
      { route: '/api/admin/leads', count: 1 },
    ]);
  });

  it('falls back to the page path, then to a marker rather than dropping the row', () => {
    const b = budget([err({ api_endpoint: null, route_path: null })]);
    expect(b.topRoutes[0].route).toBe('(unknown)');
    expect(b.total).toBe(1);
  });

  it('caps the list at five, so it stays a starting point', () => {
    const rows = Array.from({ length: 9 }, (_, i) => err({ api_endpoint: `/api/r${i}` }));
    expect(budget(rows).topRoutes).toHaveLength(5);
  });
});

describe('the sentence a human reads', () => {
  it('makes the quiet case genuinely reassuring rather than merely silent', () => {
    // "No news" and "nothing was checked" look identical unless one of them says so.
    expect(describeBudget(budget([]))).toBe('No errors recorded in the last 7 days.');
  });

  it('leads with the change, because the change is the signal', () => {
    const rows = [
      ...Array.from({ length: 12 }, () => err({ created_at: ago(2) })),
      ...Array.from({ length: 3 }, () => err({ created_at: ago(9) })),
    ];
    const note = describeBudget(budget(rows));
    expect(note).toMatch(/up 9 on the 7 before/);
    expect(note).toMatch(/worth looking at today/);
  });

  it('says "down" without a minus sign', () => {
    const rows = [
      err({ created_at: ago(2) }),
      ...Array.from({ length: 4 }, () => err({ created_at: ago(9) })),
    ];
    expect(describeBudget(budget(rows))).toMatch(/down 3 on/);
  });
});
