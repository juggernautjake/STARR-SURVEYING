// Every state a time log can be in, counted and filtered — and the office-entered day that is
// approved from birth and would otherwise hide among the approvals.
//
// Owner, 2026-08-16: *"We need to see all of the submitted/pending hours, the rejected hours, the
// adjusted hours, the accepted hours and the hours that were added by the boss."*

import { describe, it, expect } from 'vitest';
import {
  TIME_LOG_STATUSES, statusOf, isOfficeEntered, countByStatus, filterLogs,
} from '@/lib/hours/status-view';

const log = (status: string | null, entered_by: string | null = null) => ({ status, entered_by });

describe('statusOf', () => {
  it('returns the five real statuses unchanged', () => {
    for (const s of TIME_LOG_STATUSES) expect(statusOf(log(s))).toBe(s);
  });

  it('treats NULL as pending, because that is the column DEFAULT', () => {
    // Not "unknown". A NULL row dropping out of every count and filter at once would read on screen
    // as hours that were never submitted.
    expect(statusOf(log(null))).toBe('pending');
    expect(statusOf({})).toBe('pending');
  });

  it('and anything unrecognised falls back to pending rather than vanishing', () => {
    expect(statusOf(log('half-approved'))).toBe('pending');
  });
});

describe('isOfficeEntered', () => {
  it('is exactly "entered_by is set"', () => {
    expect(isOfficeEntered(log('approved', 'boss@starr-surveying.com'))).toBe(true);
    expect(isOfficeEntered(log('approved', null))).toBe(false);
    // The insert writes NULL for a self-submitted entry; an empty string is not a person either.
    expect(isOfficeEntered(log('approved', ''))).toBe(false);
  });
});

describe('countByStatus', () => {
  const rows = [
    log('pending'), log('pending'),
    log('approved'), log('approved', 'boss@starr-surveying.com'),
    log('adjusted'), log('rejected'), log('disputed'),
    log(null),
  ];

  it('counts every state, including the ones with nothing in them', () => {
    const c = countByStatus(rows);
    expect(c.pending).toBe(3);   // two explicit + one NULL
    expect(c.approved).toBe(2);
    expect(c.adjusted).toBe(1);
    expect(c.rejected).toBe(1);
    expect(c.disputed).toBe(1);
    expect(c.total).toBe(8);
  });

  it('counts office-entered days ALONGSIDE their status, not instead of it', () => {
    const c = countByStatus(rows);
    // The office day is both approved and office — folding provenance in as a sixth status would
    // undercount the approvals.
    expect(c.office).toBe(1);
    expect(c.approved).toBe(2);
  });

  it('an empty period reports zeroes rather than nothing', () => {
    const c = countByStatus([]);
    expect(c.total).toBe(0);
    expect(c.rejected).toBe(0);
    // "No rejected hours this week" is an answer; a missing number is not.
    expect(Object.keys(c)).toContain('rejected');
  });
});

describe('filterLogs', () => {
  const rows = [
    log('pending'), log('approved'), log('approved', 'boss@starr-surveying.com'),
    log('rejected'), log('disputed'), log('adjusted'),
  ];

  it('defaults to everything', () => {
    expect(filterLogs(rows)).toHaveLength(6);
    expect(filterLogs(rows, { status: 'all' })).toHaveLength(6);
  });

  it('takes a single status', () => {
    expect(filterLogs(rows, { status: 'rejected' })).toHaveLength(1);
    expect(filterLogs(rows, { status: 'approved' })).toHaveLength(2);
  });

  it('takes a comma list — the review queue is pending AND disputed', () => {
    // A dispute that never reaches an approver is a dispute that never gets resolved.
    expect(filterLogs(rows, { status: 'pending,disputed' })).toHaveLength(2);
  });

  it('filters by who put the day on the record', () => {
    expect(filterLogs(rows, { source: 'office' })).toHaveLength(1);
    expect(filterLogs(rows, { source: 'employee' })).toHaveLength(5);
  });

  it('combines status and source', () => {
    // The case the strip exists for: of the two approved days, which did the employee not submit?
    expect(filterLogs(rows, { status: 'approved', source: 'office' })).toHaveLength(1);
    expect(filterLogs(rows, { status: 'approved', source: 'employee' })).toHaveLength(1);
  });

  it('never mutates or reorders what it was given', () => {
    const before = [...rows];
    filterLogs(rows, { status: 'approved' });
    expect(rows).toEqual(before);
  });

  it('a status nobody has returns empty rather than everything', () => {
    // The failure mode of a filter built on truthiness: an unmatched value falls through to "all",
    // and the screen quietly shows the opposite of what was asked for.
    expect(filterLogs(rows, { status: 'nonexistent' })).toHaveLength(0);
  });
});
