// Whether an account HAS a password, and whether a proposed one is allowed.
//
// The bug behind this module: `password_hash` is `TEXT NOT NULL`, so an account created by signing
// in with Google is given `''` rather than null. Four of five active staff were in that state on
// 2026-08-16 and were being told "Invalid email or password" — a message about a wrong password,
// for an account that had never had one.

import { describe, it, expect } from 'vitest';
import {
  MIN_PASSWORD_LENGTH, hasPassword, requiresCurrentPassword, validateNewPassword,
} from '@/lib/auth/password';

describe('hasPassword', () => {
  it('an EMPTY STRING is no password — the state Google-created accounts are in', () => {
    // This is the whole bug in one assertion. `''` is falsy in JS, but the column being NOT NULL
    // means code that checks `password_hash != null` reads it as "has one".
    expect(hasPassword('')).toBe(false);
    expect(hasPassword('   ')).toBe(false);
  });

  it('null and undefined are no password either, rather than a crash', () => {
    expect(hasPassword(null)).toBe(false);
    expect(hasPassword(undefined)).toBe(false);
  });

  it('a real bcrypt hash is a password', () => {
    expect(hasPassword('$2b$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ')).toBe(true);
  });
});

describe('requiresCurrentPassword', () => {
  it('the FIRST password needs no current one — there is nothing to type', () => {
    expect(requiresCurrentPassword('')).toBe(false);
    expect(requiresCurrentPassword(null)).toBe(false);
  });

  it('every later change does, even though the session is just as valid', () => {
    // A signed-in tab on a shared machine should not convert into a permanent account takeover.
    expect(requiresCurrentPassword('$2b$12$something')).toBe(true);
  });
});

describe('validateNewPassword', () => {
  it('accepts a reasonable password', () => {
    expect(validateNewPassword('a-good-password')).toEqual({ ok: true });
  });

  it('refuses one shorter than the shared minimum', () => {
    const r = validateNewPassword('short');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('TOO_SHORT');
    // Exactly the minimum is allowed — an off-by-one here locks people out of their own choice.
    expect(validateNewPassword('x'.repeat(MIN_PASSWORD_LENGTH)).ok).toBe(true);
    expect(validateNewPassword('x'.repeat(MIN_PASSWORD_LENGTH - 1)).ok).toBe(false);
  });

  it('refuses empty and non-strings rather than hashing them', () => {
    for (const bad of ['', null, undefined, 12345678, {}]) {
      const r = validateNewPassword(bad as unknown);
      expect(r.ok, `${JSON.stringify(bad)} should be refused`).toBe(false);
    }
  });

  it('refuses past 72 BYTES, because bcrypt silently truncates there', () => {
    // Otherwise two different passwords both work and nobody knows why.
    expect(validateNewPassword('a'.repeat(72)).ok).toBe(true);
    expect(validateNewPassword('a'.repeat(73)).ok).toBe(false);
    // Counted in bytes, not characters: 24 four-byte emoji is 96 bytes.
    const emoji = '😀'.repeat(24);
    expect(emoji.length).toBeLessThan(73);
    expect(validateNewPassword(emoji).ok).toBe(false);
  });

  it('refuses a no-op change', () => {
    const r = validateNewPassword('same-password-here', 'same-password-here');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('SAME_AS_CURRENT');
  });

  it('and does not confuse a DIFFERENT current password for a match', () => {
    expect(validateNewPassword('new-password-here', 'old-password-here')).toEqual({ ok: true });
  });
});
