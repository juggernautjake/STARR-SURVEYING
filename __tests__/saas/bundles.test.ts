// __tests__/saas/bundles.test.ts
//
// Locks the bundle catalog + the bundle-resolution logic that backs
// route gating + customer-portal upgrade prompts.
//
// Spec: docs/planning/in-progress/SUBSCRIPTION_BILLING_SYSTEM.md §3.1 +
//       docs/planning/in-progress/CUSTOMER_PORTAL.md §3.6.

import { describe, expect, it } from 'vitest';

import {
  BUNDLES,
  BUNDLE_ORDER,
  annualPriceCents,
  expandBundles,
  formatBundlePrice,
  hasBundle,
  type BundleId,
} from '@/lib/saas/bundles';

describe('bundles — catalog shape', () => {
  it('every BUNDLE_ORDER entry has a BUNDLES record', () => {
    for (const id of BUNDLE_ORDER) {
      expect(BUNDLES[id]).toBeDefined();
      expect(BUNDLES[id].id).toBe(id);
    }
  });

  it('every BUNDLES key matches its id field', () => {
    for (const id of Object.keys(BUNDLES) as BundleId[]) {
      expect(BUNDLES[id].id).toBe(id);
    }
  });

  it('Firm Suite implies every other standalone bundle', () => {
    const implied = new Set(BUNDLES.firm_suite.implies);
    expect(implied.has('recon')).toBe(true);
    expect(implied.has('draft')).toBe(true);
    expect(implied.has('office')).toBe(true);
    expect(implied.has('field')).toBe(true);
    expect(implied.has('academy')).toBe(true);
  });

  it('Office implies Field (per §3.1 — Office plan includes Field-tier mobile capabilities)', () => {
    expect(BUNDLES.office.implies).toContain('field');
  });

  it('prices are positive integer cents', () => {
    for (const id of BUNDLE_ORDER) {
      expect(BUNDLES[id].monthlyBaseCents).toBeGreaterThan(0);
      expect(Number.isInteger(BUNDLES[id].monthlyBaseCents)).toBe(true);
    }
  });
});

describe('bundles — expansion + access', () => {
  it('expandBundles unfolds Firm Suite into every bundle', () => {
    const expanded = expandBundles(['firm_suite']);
    expect(new Set(expanded)).toEqual(
      new Set(['firm_suite', 'recon', 'draft', 'office', 'field', 'academy']),
    );
  });

  it('expandBundles is idempotent on already-expanded sets', () => {
    const expanded = expandBundles(['recon', 'draft']);
    const reExpanded = expandBundles(expanded);
    expect(new Set(reExpanded)).toEqual(new Set(expanded));
  });

  it('Office grants Field implicitly', () => {
    const expanded = expandBundles(['office']);
    expect(expanded).toContain('field');
    expect(expanded).toContain('office');
  });

  it('hasBundle returns true for the explicit bundle', () => {
    expect(hasBundle(['draft'], 'draft')).toBe(true);
  });

  it('hasBundle returns true via implication (Firm Suite covers everything)', () => {
    expect(hasBundle(['firm_suite'], 'draft')).toBe(true);
    expect(hasBundle(['firm_suite'], 'recon')).toBe(true);
    expect(hasBundle(['firm_suite'], 'academy')).toBe(true);
  });

  it('hasBundle returns false when access is missing', () => {
    expect(hasBundle(['recon'], 'draft')).toBe(false);
    expect(hasBundle([], 'recon')).toBe(false);
  });

  it('hasBundle returns true when no bundle is required', () => {
    expect(hasBundle([], null)).toBe(true);
    expect(hasBundle([], undefined)).toBe(true);
  });
});

describe('bundles — pricing helpers', () => {
  it('formatBundlePrice renders cents → "$XX.YY"', () => {
    expect(formatBundlePrice(9900)).toBe('$99.00');
    expect(formatBundlePrice(0)).toBe('$0.00');
    expect(formatBundlePrice(49900)).toBe('$499.00');
  });

  it('annualPriceCents applies a 20% discount on 12× monthly', () => {
    // 99 × 12 = 1188 → × 0.8 = 950.40 → rounded to 95040 cents → wait
    // 9900 * 12 = 118_800 → * 0.8 = 95_040.
    expect(annualPriceCents(9900)).toBe(95040);
    expect(annualPriceCents(49900)).toBe(479040);
  });
});
