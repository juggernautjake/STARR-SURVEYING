// __tests__/lib/decodeUnicode.test.ts
//
// `decodeUnicodeEscapes` turns the literal-escape-sequence text we
// sometimes see in DB content (e.g. `✅`) back into the real
// unicode codepoint the user actually wrote. The browser would
// otherwise render the four-char `✅` sequence verbatim.

import { describe, it, expect } from 'vitest';
import { decodeUnicodeEscapes } from '@/lib/decodeUnicode';

describe('decodeUnicodeEscapes', () => {
  it('decodes a 4-digit \\uXXXX escape', () => {
    expect(decodeUnicodeEscapes('\\u2705 Done')).toBe('✅ Done');
  });

  it('decodes a curly-braced \\u{XXXXX} escape (supplementary plane)', () => {
    // \u{1F512} is 🔒 — a 5-digit codepoint, needs the braced form.
    expect(decodeUnicodeEscapes('\\u{1F512} locked')).toBe('\u{1F512} locked');
  });

  it('decodes multiple escapes in one string', () => {
    expect(decodeUnicodeEscapes('\\u2705 \\u2716')).toBe('✅ ✖');
  });

  it('handles mixed text + escapes', () => {
    expect(decodeUnicodeEscapes('Status: \\u2705 (ok)')).toBe('Status: ✅ (ok)');
  });

  it('leaves plain text alone', () => {
    expect(decodeUnicodeEscapes('No escapes here.')).toBe('No escapes here.');
  });

  it('returns the empty string unchanged', () => {
    expect(decodeUnicodeEscapes('')).toBe('');
  });

  it('handles unusual hex case (both upper and lower)', () => {
    expect(decodeUnicodeEscapes('\\u00e9 vs \\u00E9')).toBe('é vs é');
  });

  it('does not decode 3-digit short forms (regex requires exactly 4)', () => {
    // The regex `[0-9a-fA-F]{4}` is intentionally strict — three-digit
    // escapes aren't real RFC sequences and shouldn't be silently
    // half-matched.
    expect(decodeUnicodeEscapes('\\u123 not real')).toBe('\\u123 not real');
  });
});
