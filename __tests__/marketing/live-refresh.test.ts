// __tests__/marketing/live-refresh.test.ts — A4. What "in real time" is allowed to claim.
//
// Every assertion here is about a failure that produces a PLAUSIBLE PAGE rather than an error: a
// timestamp that is missing exactly when it matters most, a closed month polled forever, a broken
// import retried every tick, and a "today" that rolled over at 6pm because someone used UTC.

import { describe, it, expect } from 'vitest';
import {
  IMPORT_INTERVAL_MS, STALE_AFTER_MS, describeFreshness, isLiveRange, shouldImport,
} from '@/lib/marketing/live-refresh';

const at = (iso: string) => new Date(iso);

describe('describeFreshness — it never says nothing', () => {
  it('says so when nothing has ever been imported', () => {
    // The case that matters most. A component that renders an empty stamp when it has no timestamp
    // looks MOST confident precisely where it knows least — the page shows numbers with no caveat
    // attached, and they are zeroes from an import that never ran.
    const f = describeFreshness(null, at('2026-08-12T12:00:00Z'));
    expect(f.label).toBe('never imported from Google');
    expect(f.stale).toBe(true);
    expect(f.ageMs).toBeNull();
  });

  it('says so when the timestamp cannot be read', () => {
    // "Invalid Date" and an empty string both read as "no information" to whoever is looking.
    const f = describeFreshness('not a timestamp', at('2026-08-12T12:00:00Z'));
    expect(f.label).toContain('unknown');
    expect(f.stale).toBe(true);
  });
});

describe('describeFreshness — the age', () => {
  const now = at('2026-08-12T12:00:00Z');

  it('reads in the unit a person would use', () => {
    expect(describeFreshness('2026-08-12T11:59:40Z', now).label).toBe('updated just now');
    expect(describeFreshness('2026-08-12T11:45:00Z', now).label).toBe('updated 15 min ago');
    expect(describeFreshness('2026-08-12T09:00:00Z', now).label).toBe('updated 3 hours ago');
    expect(describeFreshness('2026-08-09T12:00:00Z', now).label).toBe('last updated 3 days ago');
  });

  it('gets the singular right', () => {
    // Cosmetic, and it is the sort of thing that makes a page read as unmaintained.
    expect(describeFreshness('2026-08-12T11:00:00Z', now).label).toBe('updated 1 hour ago');
    expect(describeFreshness('2026-08-11T12:00:00Z', now).label).toBe('last updated 1 day ago');
  });

  it('does not report a negative age when a clock is ahead', () => {
    // Server and browser clocks disagree, and "updated -3 min ago" is the kind of detail that makes
    // someone stop trusting every other number on the page.
    const f = describeFreshness('2026-08-12T12:05:00Z', now);
    expect(f.ageMs).toBe(0);
    expect(f.label).toBe('updated just now');
  });

  it('marks stale only past the threshold, not at every cron gap', () => {
    // The nightly import is the normal source, so a few hours old is HEALTHY. Flagging that would
    // train everyone to ignore the flag, and then the real failure goes unnoticed too.
    const justInside = new Date(now.getTime() - STALE_AFTER_MS + 60_000).toISOString();
    const justOutside = new Date(now.getTime() - STALE_AFTER_MS - 60_000).toISOString();
    expect(describeFreshness(justInside, now).stale).toBe(false);
    expect(describeFreshness(justOutside, now).stale).toBe(true);
  });
});

describe('isLiveRange — a closed month is final, not live', () => {
  it('is true for a range reaching today', () => {
    expect(isLiveRange({ to: '2026-08-31' }, at('2026-08-12T12:00:00'))).toBe(true);
    expect(isLiveRange({ to: '2026-08-12' }, at('2026-08-12T12:00:00'))).toBe(true);
  });

  it('is false for a range that has closed', () => {
    // Polling this returns byte-identical data forever.
    expect(isLiveRange({ to: '2025-07-31' }, at('2026-08-12T12:00:00'))).toBe(false);
  });

  it('uses the LOCAL day, not UTC', () => {
    // 8pm on the 12th in a US timezone is still the 12th to the person reading the page, but
    // `toISOString()` has already rolled over to the 13th — so a range ending today would be
    // declared closed for the last few hours of every day, and the page would quietly stop updating
    // exactly during the evening.
    const evening = new Date(2026, 7, 12, 20, 0, 0); // local 12 Aug, 20:00
    expect(isLiveRange({ to: '2026-08-12' }, evening)).toBe(true);
  });
});

describe('shouldImport — three separate reasons not to', () => {
  const range = { to: '2026-08-31' };
  const now = at('2026-08-12T12:00:00');

  it('does not poll a backgrounded tab', () => {
    // A tab left open over a weekend would otherwise spend quota nobody is reading.
    expect(shouldImport({ visible: false, range, lastAttemptAt: null, now })).toBe(false);
  });

  it('does not poll a closed range', () => {
    expect(shouldImport({ visible: true, range: { to: '2025-07-31' }, lastAttemptAt: null, now })).toBe(false);
  });

  it('imports immediately when it has not tried yet', () => {
    expect(shouldImport({ visible: true, range, lastAttemptAt: null, now })).toBe(true);
  });

  it('waits out the interval', () => {
    const justBefore = now.getTime() - IMPORT_INTERVAL_MS + 1000;
    const justAfter = now.getTime() - IMPORT_INTERVAL_MS - 1000;
    expect(shouldImport({ visible: true, range, lastAttemptAt: justBefore, now })).toBe(false);
    expect(shouldImport({ visible: true, range, lastAttemptAt: justAfter, now })).toBe(true);
  });

  it('keys the interval on the ATTEMPT, so a broken import does not hammer Google', () => {
    // If the gate were "time since the last SUCCESSFUL import", a connection that is refusing every
    // request would satisfy it on every single tick — turning one outage into a request loop
    // against Google, from every open tab at once.
    const failedJustNow = now.getTime() - 5_000;
    expect(shouldImport({ visible: true, range, lastAttemptAt: failedJustNow, now })).toBe(false);
  });
});
