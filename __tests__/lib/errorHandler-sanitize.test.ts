// __tests__/lib/errorHandler-sanitize.test.ts
//
// Coverage for `sanitizeBody` — runs before error reports get POSTed
// to `/api/admin/errors`. If the redactor misses a key, a user-typed
// password or auth token can land in the error log. Verifying the
// allowlist behaviour pin prevents accidental leakage.

import { describe, it, expect } from 'vitest';
import { sanitizeBody } from '@/lib/errorHandler';

describe('sanitizeBody — non-object inputs', () => {
  it('returns undefined for null', () => {
    expect(sanitizeBody(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(sanitizeBody(undefined)).toBeUndefined();
  });

  it('returns undefined for primitives', () => {
    expect(sanitizeBody('a string')).toBeUndefined();
    expect(sanitizeBody(42)).toBeUndefined();
    expect(sanitizeBody(true)).toBeUndefined();
  });
});

describe('sanitizeBody — redaction of sensitive keys', () => {
  it('redacts password / token / secret / api_key / authorization / cookie / credit_card / ssn', () => {
    const out = sanitizeBody({
      password:       'hunter2',
      token:          'abc',
      secret:         'shh',
      api_key:        'sk_test_123',
      authorization:  'Bearer xyz',
      cookie:         'session=abc',
      credit_card:    '4242424242424242',
      ssn:            '123-45-6789',
      name:           'Hank',
    });
    expect(out?.password).toBe('[REDACTED]');
    expect(out?.token).toBe('[REDACTED]');
    expect(out?.secret).toBe('[REDACTED]');
    expect(out?.api_key).toBe('[REDACTED]');
    expect(out?.authorization).toBe('[REDACTED]');
    expect(out?.cookie).toBe('[REDACTED]');
    expect(out?.credit_card).toBe('[REDACTED]');
    expect(out?.ssn).toBe('[REDACTED]');
    // Non-sensitive keys pass through.
    expect(out?.name).toBe('Hank');
  });

  it('is case-insensitive on the key name', () => {
    const out = sanitizeBody({ Password: 'hi', TOKEN: 'x' });
    expect(out?.Password).toBe('[REDACTED]');
    expect(out?.TOKEN).toBe('[REDACTED]');
  });

  it('recurses into nested objects', () => {
    const out = sanitizeBody({
      user: { name: 'Hank', password: 'leak' },
      meta: { authorization: 'Bearer abc', count: 3 },
    });
    expect((out?.user as Record<string, unknown>).password).toBe('[REDACTED]');
    expect((out?.user as Record<string, unknown>).name).toBe('Hank');
    expect((out?.meta as Record<string, unknown>).authorization).toBe('[REDACTED]');
    expect((out?.meta as Record<string, unknown>).count).toBe(3);
  });

  it('does NOT redact lookalike keys (substrings)', () => {
    // "old_password" is NOT in the allowlist; this is the conservative
    // behaviour. A future audit may want to add fuzzy matching, but
    // the current contract is exact lowercase set membership.
    const out = sanitizeBody({ old_password: 'still here', user_token_id: 'unredacted' });
    expect(out?.old_password).toBe('still here');
    expect(out?.user_token_id).toBe('unredacted');
  });

  it('preserves non-sensitive primitives verbatim (strings, numbers, booleans)', () => {
    const out = sanitizeBody({ name: 'Hank', age: 32, isAdmin: true });
    expect(out?.name).toBe('Hank');
    expect(out?.age).toBe(32);
    expect(out?.isAdmin).toBe(true);
  });

  it('flattens arrays into index-keyed objects (typeof [] === "object" quirk)', () => {
    // `sanitizeBody` is designed for plain-object payloads. When it
    // sees an array it recurses (typeof [] === 'object', non-null) and
    // the resulting `Object.entries(...)` produces index-keyed keys.
    // This is a quirk to be aware of — the sanitized output is used
    // for error-report logging only (not for re-serialising), so the
    // shape change doesn't matter in practice.
    const out = sanitizeBody({ tags: ['a', 'b'] });
    expect(out?.tags).toEqual({ 0: 'a', 1: 'b' });
  });
});
