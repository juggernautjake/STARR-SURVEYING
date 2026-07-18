import { describe, it, expect } from 'vitest';
import {
  extractPrefix, lookupPrefix, isKnownPrefix, suggestNextName,
} from '../../mobile/lib/dataPointCodes';

// mobile/lib/dataPointCodes.ts — the 179-code point-name intelligence (Plan §5.3: recognise prefixes,
// color-code, suggest the next number, warn on duplicates) that feeds the Work Mode Points surface. Pure
// logic, shipped untested. These pin prefix extraction, lookup fallbacks, and the auto-numbering.

describe('extractPrefix', () => {
  it('pulls a known prefix off a point name, case-insensitively', () => {
    expect(extractPrefix('BM01')).toBe('BM');
    expect(extractPrefix('bm05')).toBe('BM');
    expect(extractPrefix('IR-5')).toBe('IR');   // stops at the hyphen
    expect(extractPrefix('PC 12')).toBe('PC');  // stops at whitespace
  });

  it('prefers the LONGEST known prefix (STP is not shortened to a bogus stem)', () => {
    expect(extractPrefix('STP01')).toBe('STP');
  });

  it('returns the literal leading letters for an uncodified prefix (UI shows it as unknown)', () => {
    expect(extractPrefix('FOO01')).toBe('FOO');
  });

  it('returns null when there is no leading letter run', () => {
    expect(extractPrefix(null)).toBeNull();
    expect(extractPrefix(undefined)).toBeNull();
    expect(extractPrefix('')).toBeNull();
    expect(extractPrefix('   ')).toBeNull();
    expect(extractPrefix('123')).toBeNull(); // starts with a digit
  });
});

describe('lookupPrefix', () => {
  it('resolves a known prefix to its card entry', () => {
    expect(lookupPrefix('BM')).toMatchObject({ prefix: 'BM', label: 'Benchmark' });
    expect(lookupPrefix('bm').label).toBe('Benchmark'); // case-insensitive
  });

  it('an unknown prefix falls back to the muted "needs codifying" entry, keeping the literal', () => {
    const r = lookupPrefix('FOO');
    expect(r.label).toBe('FOO');
    expect(r.color).toBe('#9CA3AF'); // the unknown/gray color, not a category color
  });

  it('a null/empty prefix resolves to the generic Unknown entry', () => {
    expect(lookupPrefix(null).prefix).toBe('UNKNOWN');
    expect(lookupPrefix('').label).toBe('Unknown');
  });
});

describe('isKnownPrefix', () => {
  it('is true for a codified prefix (any case), false otherwise', () => {
    expect(isKnownPrefix('BM')).toBe(true);
    expect(isKnownPrefix('ir')).toBe(true);
    expect(isKnownPrefix('FOO')).toBe(false);
    expect(isKnownPrefix(null)).toBe(false);
    expect(isKnownPrefix('')).toBe(false);
  });
});

describe('suggestNextName', () => {
  it('returns prefix + (highest existing number + 1)', () => {
    expect(suggestNextName('BM', ['BM01', 'BM02', 'BM05'])).toBe('BM06');
  });

  it('returns the bare prefix when no numbered points exist yet', () => {
    expect(suggestNextName('IR', [])).toBe('IR');
    expect(suggestNextName('FL', ['FL-NE', 'FL-CORNER-SW'])).toBe('FL'); // free-text suffixes don't count
  });

  it('widens the zero-pad to match the widest existing name (BM099, BM100 → BM101)', () => {
    expect(suggestNextName('BM', ['BM099', 'BM100'])).toBe('BM101');
  });

  it('defaults to 2-digit zero-pad (BM1 → BM02, not BM2)', () => {
    expect(suggestNextName('BM', ['BM1'])).toBe('BM02');
  });

  it('matches existing names case-insensitively', () => {
    expect(suggestNextName('bm', ['BM03'])).toBe('BM04');
  });
});
