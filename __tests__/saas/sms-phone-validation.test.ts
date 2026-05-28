// __tests__/saas/sms-phone-validation.test.ts
//
// `isValidPhoneNumber` is the cheap pre-dispatch sanity check before
// the SMS adapter calls Twilio. Real validation lives in Twilio
// Verify at enrollment time — this guards against obvious garbage
// (missing leading +, wrong length, non-digit characters) without
// the round-trip cost. Pinning the regex behaviour.

import { describe, it, expect } from 'vitest';
import { isValidPhoneNumber } from '@/lib/saas/notifications/sms';

describe('isValidPhoneNumber — E.164 sanity check', () => {
  it('accepts a 10-digit US number with +1', () => {
    expect(isValidPhoneNumber('+12545551234')).toBe(true);
  });

  it('accepts a 15-digit international number (max allowed)', () => {
    expect(isValidPhoneNumber('+123456789012345')).toBe(true);
  });

  it('accepts the minimum 10-digit-after-plus number', () => {
    expect(isValidPhoneNumber('+1234567890')).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(isValidPhoneNumber('  +12545551234  ')).toBe(true);
  });

  it('rejects a number missing the leading +', () => {
    expect(isValidPhoneNumber('12545551234')).toBe(false);
  });

  it('rejects a 9-digit number (too short)', () => {
    expect(isValidPhoneNumber('+123456789')).toBe(false);
  });

  it('rejects a 16-digit number (too long)', () => {
    expect(isValidPhoneNumber('+1234567890123456')).toBe(false);
  });

  it('rejects formatted numbers (spaces, dashes, parens)', () => {
    expect(isValidPhoneNumber('+1 (254) 555-1234')).toBe(false);
    expect(isValidPhoneNumber('+1-254-555-1234')).toBe(false);
  });

  it('rejects a number with letters', () => {
    expect(isValidPhoneNumber('+1ABC5551234')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidPhoneNumber('')).toBe(false);
  });

  it('rejects a string with just a + sign', () => {
    expect(isValidPhoneNumber('+')).toBe(false);
  });
});
