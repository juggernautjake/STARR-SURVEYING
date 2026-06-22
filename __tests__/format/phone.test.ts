import { describe, it, expect } from 'vitest';
import { formatPhone, phoneHref } from '@/lib/format/phone';

describe('formatPhone', () => {
  it('formats a raw 10-digit US number', () => {
    expect(formatPhone('2544323838')).toBe('(254) 432-3838');
    expect(formatPhone('8178458228')).toBe('(817) 845-8228');
  });

  it('formats a US 11-digit number with leading 1 to +1 (...)', () => {
    expect(formatPhone('12544323838')).toBe('+1 (254) 432-3838');
  });

  it('strips and reformats a pre-punctuated number', () => {
    expect(formatPhone('254.432.3838')).toBe('(254) 432-3838');
    expect(formatPhone('254-432-3838')).toBe('(254) 432-3838');
    expect(formatPhone('(254) 432-3838')).toBe('(254) 432-3838');
  });

  it('leaves explicit international (+ prefix) numbers as-is', () => {
    expect(formatPhone('+44 20 7946 0991')).toBe('+44 20 7946 0991');
  });

  it('still recognizes +1 USA numbers and punctuates them', () => {
    expect(formatPhone('+12544323838')).toBe('+1 (254) 432-3838');
  });

  it('passes through partial / unrecognized shapes unchanged', () => {
    expect(formatPhone('254432')).toBe('254432');
    expect(formatPhone('ext. 2010')).toBe('ext. 2010');
  });

  it('returns "" for null / undefined / blank', () => {
    expect(formatPhone(null)).toBe('');
    expect(formatPhone(undefined)).toBe('');
    expect(formatPhone('   ')).toBe('');
  });
});

describe('phoneHref', () => {
  it('drops punctuation and prefixes with tel:', () => {
    expect(phoneHref('(254) 432-3838')).toBe('tel:2544323838');
    expect(phoneHref('254-432-3838')).toBe('tel:2544323838');
  });

  it('keeps the leading + for international numbers', () => {
    expect(phoneHref('+44 20 7946 0991')).toBe('tel:+442079460991');
  });

  it('returns null when there are no digits', () => {
    expect(phoneHref(null)).toBeNull();
    expect(phoneHref('')).toBeNull();
    expect(phoneHref('—')).toBeNull();
  });
});
