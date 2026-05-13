// __tests__/saas/reserved-slugs.test.ts
//
// Locks the slug validation rules. Phase D-1a precheck + the
// signup-complete API both rely on validateSlug() returning the right
// reason codes so the wizard can show targeted error copy.
//
// Spec: docs/planning/in-progress/MARKETING_SIGNUP_FLOW.md §4 + §5.

import { describe, expect, it } from 'vitest';

import {
  RESERVED_SLUGS,
  isReservedSlug,
  validateSlug,
} from '@/lib/saas/reserved-slugs';

describe('validateSlug', () => {
  it('accepts a normal slug', () => {
    expect(validateSlug('acme-surveying')).toEqual({ ok: true });
    expect(validateSlug('brown')).toEqual({ ok: true });
    expect(validateSlug('crews-eng-llc')).toEqual({ ok: true });
  });

  it('rejects too-short slugs', () => {
    expect(validateSlug('a')).toEqual({ ok: false, reason: 'too_short' });
    expect(validateSlug('ab')).toEqual({ ok: false, reason: 'too_short' });
    expect(validateSlug('')).toEqual({ ok: false, reason: 'too_short' });
  });

  it('rejects too-long slugs (>40 chars)', () => {
    const long = 'a'.repeat(41);
    expect(validateSlug(long)).toEqual({ ok: false, reason: 'too_long' });
  });

  it('rejects uppercase or non-[a-z0-9-] characters', () => {
    expect(validateSlug('Acme-Surveying')).toEqual({ ok: false, reason: 'invalid_chars' });
    expect(validateSlug('acme_surveying')).toEqual({ ok: false, reason: 'invalid_chars' });
    expect(validateSlug('acme surveying')).toEqual({ ok: false, reason: 'invalid_chars' });
    expect(validateSlug('acme.surveying')).toEqual({ ok: false, reason: 'invalid_chars' });
  });

  it('rejects slugs starting or ending with hyphen', () => {
    expect(validateSlug('-acme')).toEqual({ ok: false, reason: 'leading_hyphen' });
    expect(validateSlug('acme-')).toEqual({ ok: false, reason: 'trailing_hyphen' });
  });

  it('rejects reserved slugs', () => {
    expect(validateSlug('admin')).toEqual({ ok: false, reason: 'reserved' });
    expect(validateSlug('platform')).toEqual({ ok: false, reason: 'reserved' });
    expect(validateSlug('starr')).toEqual({ ok: false, reason: 'reserved' });
    expect(validateSlug('billing')).toEqual({ ok: false, reason: 'reserved' });
  });
});

describe('isReservedSlug', () => {
  it('returns true for known reserved slugs', () => {
    expect(isReservedSlug('www')).toBe(true);
    expect(isReservedSlug('api')).toBe(true);
    expect(isReservedSlug('starr')).toBe(true);
  });

  it('returns false for non-reserved slugs', () => {
    expect(isReservedSlug('acme-surveying')).toBe(false);
    expect(isReservedSlug('brown')).toBe(false);
  });
});

describe('RESERVED_SLUGS — completeness sanity checks', () => {
  it('contains the platform-critical subdomains', () => {
    for (const expected of ['www', 'api', 'app', 'platform', 'admin', 'auth', 'login']) {
      expect(RESERVED_SLUGS.has(expected)).toBe(true);
    }
  });

  it('contains the brand-protective slugs', () => {
    expect(RESERVED_SLUGS.has('starr')).toBe(true);
    expect(RESERVED_SLUGS.has('starrsoftware')).toBe(true);
    expect(RESERVED_SLUGS.has('starrsurveying')).toBe(true);
  });

  it('contains generic phishing-prone slugs', () => {
    for (const expected of ['account', 'billing', 'secure', 'password', 'reset']) {
      expect(RESERVED_SLUGS.has(expected)).toBe(true);
    }
  });
});
