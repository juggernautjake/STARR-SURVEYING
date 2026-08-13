// __tests__/hours/late-entry.test.ts
//
// Locking a pay period stops employees editing it; admins are deliberately exempt, and since
// 2026-08-12 they can also create entries on somebody's behalf. So a day can be added to a week that
// was closed off last Friday, and it looks identical to one submitted on time — on a week that has
// usually already been paid.
import { describe, it, expect } from 'vitest';
import { detectLateEntry, countLateEntries, type PeriodLock } from '@/lib/hours/late-entry';

const LOCK: PeriodLock = {
  period_start: '2026-08-10', period_end: '2026-08-16', locked_at: '2026-08-17T09:00:00Z',
};

describe('an entry that arrived after its week was closed', () => {
  it('is flagged, and the note says what happens to the money', () => {
    const r = detectLateEntry({ log_date: '2026-08-12', created_at: '2026-08-18T14:00:00Z' }, [LOCK]);
    expect(r.isLate).toBe(true);
    expect(r.lock).toBe(LOCK);
    // "Added late" alone leaves somebody wondering whether they need to do anything.
    expect(r.note).toMatch(/paid in the next payout/i);
    expect(r.note).toContain('2026-08-10');
  });

  it('counts them across a list', () => {
    const entries = [
      { log_date: '2026-08-12', created_at: '2026-08-18T14:00:00Z' },
      { log_date: '2026-08-13', created_at: '2026-08-13T17:00:00Z' },
      { log_date: '2026-08-14', created_at: '2026-08-20T08:00:00Z' },
    ];
    expect(countLateEntries(entries, [LOCK])).toBe(2);
  });
});

describe('what is NOT late', () => {
  it('an entry submitted before the lock — which is most of a closed week', () => {
    // The comparison has to be `created_at` vs `locked_at`. Comparing dates alone would mark every
    // entry in a locked week as late, including all the ones the lock was closed over.
    const r = detectLateEntry({ log_date: '2026-08-12', created_at: '2026-08-12T17:30:00Z' }, [LOCK]);
    expect(r.isLate).toBe(false);
    expect(r.note).toBeNull();
  });

  it('an entry in a week that was never locked', () => {
    expect(detectLateEntry({ log_date: '2026-08-20', created_at: '2026-08-25T09:00:00Z' }, [LOCK]).isLate).toBe(false);
  });

  it('an entry created in the same second the lock landed', () => {
    // Strictly after. A tie is not evidence of lateness and would be an unfair mark on a race.
    expect(detectLateEntry({ log_date: '2026-08-12', created_at: LOCK.locked_at }, [LOCK]).isLate).toBe(false);
  });

  it('an entry on the boundary days of the locked period is still IN the period', () => {
    for (const d of ['2026-08-10', '2026-08-16']) {
      expect(detectLateEntry({ log_date: d, created_at: '2026-08-18T09:00:00Z' }, [LOCK]).isLate, d).toBe(true);
    }
    // A day outside the range is not this lock's business at all.
    expect(detectLateEntry({ log_date: '2026-08-17', created_at: '2026-08-18T09:00:00Z' }, [LOCK]).isLate).toBe(false);
  });
});

describe('when it cannot tell, it says nothing', () => {
  // Marking an entry "added after the week was closed" is an accusation about somebody's
  // timekeeping. Guessing at one from missing data is worse than silence.
  it('no created_at', () => {
    expect(detectLateEntry({ log_date: '2026-08-12' }, [LOCK]).isLate).toBe(false);
  });

  it('an unparseable timestamp', () => {
    expect(detectLateEntry({ log_date: '2026-08-12', created_at: 'last Tuesday' }, [LOCK]).isLate).toBe(false);
  });

  it('a lock with no locked_at', () => {
    const noStamp: PeriodLock = { period_start: '2026-08-10', period_end: '2026-08-16', locked_at: null };
    expect(detectLateEntry({ log_date: '2026-08-12', created_at: '2026-08-18T09:00:00Z' }, [noStamp]).isLate).toBe(false);
  });

  it('a missing or malformed log_date', () => {
    expect(detectLateEntry({ created_at: '2026-08-18T09:00:00Z' }, [LOCK]).isLate).toBe(false);
    expect(detectLateEntry({ log_date: 'yesterday', created_at: '2026-08-18T09:00:00Z' }, [LOCK]).isLate).toBe(false);
  });

  it('no locks at all', () => {
    expect(detectLateEntry({ log_date: '2026-08-12', created_at: '2026-08-18T09:00:00Z' }, []).isLate).toBe(false);
  });
});

describe('overlapping locks', () => {
  it('reports it late if ANY covering lock closed before it arrived', () => {
    // A week can be locked, unlocked and re-locked, or covered by both a weekly and a monthly close.
    // Arriving after any of them is the fact that matters.
    const later: PeriodLock = { period_start: '2026-08-01', period_end: '2026-08-31', locked_at: '2026-09-01T09:00:00Z' };
    const r = detectLateEntry({ log_date: '2026-08-12', created_at: '2026-08-18T09:00:00Z' }, [later, LOCK]);
    expect(r.isLate).toBe(true);
    // The one it actually arrived after, not merely the first in the list.
    expect(r.lock).toBe(LOCK);
  });
});
