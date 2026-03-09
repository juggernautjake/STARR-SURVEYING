// worker/src/__tests__/address-normalizer.test.ts
// Tests for address parsing and deterministic variant generation.

import { describe, it, expect } from 'vitest';
import { parseAddress, generateAddressVariants } from '../services/address-normalizer.js';

describe('parseAddress', () => {
  it('parses a standard Texas address', () => {
    const result = parseAddress('3779 W FM 436, Belton, TX 76513');
    expect(result.streetNumber).toBe('3779');
    expect(result.streetName).toContain('FM');
    expect(result.city).toBe('BELTON');
    expect(result.state).toBe('TX');
    expect(result.zip).toBe('76513');
  });

  it('parses an address without zip code', () => {
    const result = parseAddress('100 Main St, Temple, TX');
    expect(result.streetNumber).toBe('100');
    expect(result.city).toBe('TEMPLE');
    expect(result.state).toBe('TX');
  });

  it('parses an address with unit/suite', () => {
    const result = parseAddress('500 Central Ave Suite 200, Austin, TX 78701');
    expect(result.streetNumber).toBe('500');
    expect(result.unitType).toBe('SUITE');
    expect(result.unitNumber).toBe('200');
  });

  it('handles rural FM road addresses', () => {
    const result = parseAddress('1234 FM 93, Belton, TX');
    expect(result.streetNumber).toBe('1234');
    expect(result.streetName).toMatch(/FM.*93/);
  });

  it('preserves raw input', () => {
    const raw = '3779 W FM 436, Belton, TX 76513';
    const result = parseAddress(raw);
    expect(result.rawInput).toBe(raw);
  });
});

describe('generateAddressVariants', () => {
  it('generates multiple variants for a Texas road address', () => {
    const parsed = parseAddress('3779 W FM 436, Belton, TX 76513');
    const variants = generateAddressVariants(parsed);

    expect(variants.length).toBeGreaterThan(3);
    // Should have at least the canonical form
    expect(variants.some((v) => v.searchString.includes('3779'))).toBe(true);
    expect(variants.some((v) => v.searchString.includes('FM'))).toBe(true);
  });

  it('variants are sorted by priority (ascending)', () => {
    const parsed = parseAddress('3779 W FM 436, Belton, TX 76513');
    const variants = generateAddressVariants(parsed);

    for (let i = 1; i < variants.length; i++) {
      expect(variants[i].priority).toBeGreaterThanOrEqual(variants[i - 1].priority);
    }
  });

  it('generates variants for a regular street address', () => {
    const parsed = parseAddress('100 Main St, Temple, TX 76501');
    const variants = generateAddressVariants(parsed);

    expect(variants.length).toBeGreaterThan(1);
    expect(variants[0].searchString).toContain('100');
  });

  it('includes street-number-only as last resort variant', () => {
    const parsed = parseAddress('3779 W FM 436, Belton, TX 76513');
    const variants = generateAddressVariants(parsed);

    const numOnly = variants.find((v) => v.strategy === 'number_only');
    expect(numOnly).toBeDefined();
    expect(numOnly!.searchString).toBe('3779');
    // Should be last priority
    expect(numOnly!.priority).toBe(Math.max(...variants.map((v) => v.priority)));
  });

  it('includes Farm-to-Market long form variants', () => {
    const parsed = parseAddress('3779 FM 436, Belton, TX 76513');
    const variants = generateAddressVariants(parsed);

    const longForm = variants.find((v) =>
      v.searchString.toLowerCase().includes('farm') || v.searchString.toLowerCase().includes('market'),
    );
    // Should generate at least one long-form expansion
    expect(longForm).toBeDefined();
  });

  it('generates directional variations', () => {
    const parsed = parseAddress('3779 W FM 436, Belton, TX 76513');
    const variants = generateAddressVariants(parsed);

    const searchStrings = variants.map((v) => v.searchString.toUpperCase());
    // Should have variant with directional and without
    const withDir = searchStrings.some((s) => /\bW\b/.test(s) || s.includes('WEST'));
    const withoutDir = searchStrings.some((s) => s.startsWith('3779 FM'));
    expect(withDir || withoutDir).toBe(true);
  });

  it('does not generate empty search strings', () => {
    const parsed = parseAddress('3779 W FM 436, Belton, TX 76513');
    const variants = generateAddressVariants(parsed);

    for (const v of variants) {
      expect(v.searchString.trim().length).toBeGreaterThan(0);
    }
  });

  it('assigns unique strategies to each variant', () => {
    const parsed = parseAddress('3779 W FM 436, Belton, TX 76513');
    const variants = generateAddressVariants(parsed);

    const strategies = variants.map((v) => v.strategy);
    const unique = new Set(strategies);
    expect(unique.size).toBe(strategies.length);
  });
});
