// __tests__/integrations/google-hash.test.ts — Enhanced Conversions hashing (G2-2).
//
// These tests exist because a WRONG HASH FAILS SILENTLY. Google accepts the upload, reports success,
// matches nothing, and the account shows a healthy-looking zero — no error, nothing wrong in our logs.
// There is no way to detect it after the fact, so it has to be right before the first upload.
//
// The golden hash below is checked against an independently computed SHA-256 rather than against
// whatever our own function happens to produce, so this suite cannot agree with a bug in itself.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  hashEmail, hashIdentifiers, hashPhone, normalizeEmail, normalizePhone,
} from '@/lib/integrations/google/hash';

const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Jane.Doe@Example.COM  ')).toBe('jane.doe@example.com');
  });

  it('strips dots and +tags for Gmail — the same mailbox must produce the same hash', () => {
    // `J.Smith+quotes@gmail.com` and `jsmith@gmail.com` are one inbox. Missing this loses the match for
    // exactly the customers organised enough to use address tagging.
    expect(normalizeEmail('J.Smith+quotes@gmail.com')).toBe('jsmith@gmail.com');
    expect(normalizeEmail('j.s.m.i.t.h@googlemail.com')).toBe('jsmith@googlemail.com');
    expect(hashEmail('J.Smith+quotes@gmail.com')).toBe(hashEmail('jsmith@gmail.com'));
  });

  it('does NOT strip dots for other domains — they are different people there', () => {
    // The mirror-image error, and the more dangerous one: hashing two different humans identically asks
    // Google to attribute a conversion to the wrong person.
    expect(normalizeEmail('j.smith@company.com')).toBe('j.smith@company.com');
    expect(hashEmail('j.smith@company.com')).not.toBe(hashEmail('jsmith@company.com'));
  });

  it('keeps a +tag on a non-Gmail domain, because there it may route differently', () => {
    expect(normalizeEmail('billing+starr@company.com')).toBe('billing+starr@company.com');
  });

  it('returns null for anything that is not an address, rather than hashing rubbish', () => {
    for (const bad of ['', '   ', 'not-an-email', '@nodomain.com', 'no@domain', '+@gmail.com', null, undefined]) {
      expect(normalizeEmail(bad as string | null), String(bad)).toBeNull();
    }
  });

  it('handles a + in the domain-less tail without losing the domain', () => {
    expect(normalizeEmail('a+b@c.com')).toBe('a+b@c.com');
  });
});

describe('normalizePhone', () => {
  it('turns a US 10-digit number into E.164', () => {
    expect(normalizePhone('(254) 315-1123')).toBe('+12543151123');
    expect(normalizePhone('254.315.1123')).toBe('+12543151123');
    expect(normalizePhone('2543151123')).toBe('+12543151123');
  });

  it('accepts a leading 1', () => {
    expect(normalizePhone('1-254-315-1123')).toBe('+12543151123');
  });

  it('trusts an explicit international number', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('returns null rather than guessing at anything else', () => {
    // Extensions, partial numbers, and free text all reach this function from a real database. An
    // unmatched conversion costs nothing; a WRONG match teaches the bidding model about a customer who
    // does not exist.
    for (const bad of ['', '  ', '555-1234', 'call the office', '254-315-1123 ext 2', '+123', null, undefined]) {
      expect(normalizePhone(bad as string | null), String(bad)).toBeNull();
    }
  });

  it('rejects an international number that is too long for E.164', () => {
    expect(normalizePhone(`+${'9'.repeat(16)}`)).toBeNull();
  });
});

describe('hashing', () => {
  it('is SHA-256 hex lowercase of the NORMALIZED value', () => {
    // Computed independently, so this cannot agree with a bug in our own implementation.
    expect(hashEmail('  Jane.Doe@Example.COM ')).toBe(sha('jane.doe@example.com'));
    expect(hashPhone('(254) 315-1123')).toBe(sha('+12543151123'));
    expect(hashEmail('x@example.com')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never hashes the raw input', () => {
    expect(hashEmail('  Jane.Doe@Example.COM ')).not.toBe(sha('  Jane.Doe@Example.COM '));
  });

  it('returns null instead of a hash of the empty string', () => {
    // `sha256('')` is a real, valid-looking 64-character hash that matches nobody — the kind of value
    // that would sail through a "is it a hash?" check for months.
    expect(hashEmail('')).toBeNull();
    expect(hashPhone('')).toBeNull();
    expect(hashEmail('')).not.toBe(sha(''));
  });
});

describe('hashIdentifiers', () => {
  it('reports usable when either identifier survives normalization', () => {
    expect(hashIdentifiers({ email: 'a@b.com' }).usable).toBe(true);
    expect(hashIdentifiers({ phone: '2543151123' }).usable).toBe(true);
    expect(hashIdentifiers({ email: 'a@b.com', phone: '2543151123' })).toMatchObject({ usable: true });
  });

  it('reports NOT usable when neither does — the `skipped` case, not a retry', () => {
    // A phone lead taken by hand with a mistyped number can never be uploaded. Recording that as
    // permanent rather than pending is what stops the queue retrying it forever.
    expect(hashIdentifiers({}).usable).toBe(false);
    expect(hashIdentifiers({ email: 'nope', phone: 'call me' }).usable).toBe(false);
  });
});
