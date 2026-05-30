// __tests__/jobs/scope.test.ts
//
// drawings-collaboration Slice 0 — locks the pure resolveJobScope
// helper that every job-scoped notification fan-out routes through.

import { describe, it, expect } from 'vitest';
import { resolveJobScope } from '@/lib/jobs/scope';

describe('resolveJobScope', () => {
  it('returns distinct, lowercased emails in first-seen order', () => {
    expect(resolveJobScope([
      { user_email: 'Lead@x.com' },
      { user_email: 'drawer@x.com' },
      { user_email: 'lead@x.com' },
    ])).toEqual(['lead@x.com', 'drawer@x.com']);
  });

  it('drops blank / null emails', () => {
    expect(resolveJobScope([
      { user_email: null },
      { user_email: '' },
      { user_email: '   ' },
      { user_email: 'a@x.com' },
    ])).toEqual(['a@x.com']);
  });

  it('excludes the actor email (case-insensitive + trimmed)', () => {
    const out = resolveJobScope(
      [{ user_email: 'a@x.com' }, { user_email: 'b@x.com' }, { user_email: 'c@x.com' }],
      ' B@X.COM ',
    );
    expect(out).toEqual(['a@x.com', 'c@x.com']);
  });

  it('returns [] for an empty team', () => {
    expect(resolveJobScope([])).toEqual([]);
  });

  it('returns [] when only the actor is on the team', () => {
    expect(resolveJobScope([{ user_email: 'admin@x.com' }], 'admin@x.com')).toEqual([]);
  });
});
