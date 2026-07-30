// __tests__/payments/sales-tax.test.ts — Texas sales tax on surveying work.
//
// The rules under test are 34 TAC §3.276's, not ours, so these tests are written as claims about the RULE:
// each one names the provision it pins. If Texas changes the rule, these fail and say where to look.
import { describe, it, expect } from 'vitest';
import {
  SERVICE_CATEGORIES, EXEMPTION_KINDS, TX_STATE_RATE_BPS, TX_MAX_COMBINED_RATE_BPS,
  computeSalesTax, describeSalesTax, formatRate, isExemptionKind, isServiceCategory,
  lineTaxability, serviceCategory, serviceCategoryLabel, validateRateBps,
} from '@/lib/payments/sales-tax';

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const line = (total_cents: number, o: Record<string, unknown> = {}) => ({ total_cents, ...o });

describe('§3.276 taxability — which surveys Texas taxes', () => {
  it('taxes the boundary-determining surveys the rule enumerates', () => {
    for (const id of ['boundary', 'easement', 'land_title', 'title', 'right_of_way', 'subdivision_plat']) {
      expect(serviceCategory(id).taxable, `${id} should be taxable`).toBe(true);
    }
  });

  it('does NOT tax the surveys the rule lists as nontaxable when performed independently', () => {
    for (const id of ['construction', 'design', 'geodetic', 'hydrographic', 'topographic', 'seismic', 'tree']) {
      expect(serviceCategory(id).taxable, `${id} should not be taxable`).toBe(false);
    }
  });

  it('splits staking from construction surveying — the distinction that is easiest to get wrong', () => {
    // Staking that establishes where a structure sits RELATIVE TO THE BOUNDARIES is a boundary
    // determination and is taxable; a construction survey that does not do that is not. Same crew, same
    // day, different answers — so if these two ever agree, someone has collapsed them.
    expect(serviceCategory('structure_staking').taxable).toBe(true);
    expect(serviceCategory('construction').taxable).toBe(false);
  });

  it('every reviewed category states a taxability, and only `other` is unreviewed', () => {
    const unreviewed = SERVICE_CATEGORIES.filter((c) => !c.reviewed).map((c) => c.id);
    expect(unreviewed).toEqual(['other']);
  });
});

describe('rule 1 — presume taxable, and say that you presumed', () => {
  it('taxes an uncategorised line and reports the basis as presumed', () => {
    expect(lineTaxability(line(1000))).toEqual({ taxable: true, basis: 'presumed', category: 'other' });
  });

  it('taxes a line whose category is not recognised at all', () => {
    // A typo or a stale category from an older invoice must not silently become non-taxable.
    expect(lineTaxability(line(1000, { category: 'bogus-category' })).taxable).toBe(true);
    expect(lineTaxability(line(1000, { category: 'bogus-category' })).basis).toBe('presumed');
  });

  it('warns when any priced line was presumed rather than categorised', () => {
    const r = computeSalesTax({ lines: [line(50_000)], rateBps: 825 });
    expect(r.warnings.join(' ')).toMatch(/presumed taxable/i);
  });

  it('does not warn about a zero-priced uncategorised line — nothing is at stake', () => {
    const r = computeSalesTax({ lines: [line(0)], rateBps: 825 });
    expect(r.warnings).toEqual([]);
  });
});

describe('override precedence', () => {
  it('lets an explicit override beat the category, and records it as an override', () => {
    expect(lineTaxability(line(100, { category: 'topographic', taxable: true })))
      .toEqual({ taxable: true, basis: 'override', category: 'topographic' });
    expect(lineTaxability(line(100, { category: 'boundary', taxable: false })))
      .toEqual({ taxable: false, basis: 'override', category: 'boundary' });
  });

  it('treats a non-boolean `taxable` as absent rather than truthy', () => {
    // `taxable: 'yes'` from a hand-rolled API call must not read as an override.
    expect(lineTaxability(line(100, { category: 'topographic', taxable: 'yes' })).basis).toBe('category');
  });
});

describe('rule 2 — an exemption without its certificate is not an exemption', () => {
  const lines = [line(100_000, { category: 'boundary' })];

  it('honours a certificate-backed new-residential-construction exclusion', () => {
    const r = computeSalesTax({
      lines, rateBps: 825,
      exemption: { kind: 'new_residential_construction', certificateOnFile: true },
    });
    expect(r.exemption.honoured).toBe(true);
    expect(r.tax_cents).toBe(0);
    expect(r.taxable_subtotal_cents).toBe(0);
  });

  it('TAXES the same sale when the certification is missing, and says why', () => {
    const r = computeSalesTax({
      lines, rateBps: 825,
      exemption: { kind: 'new_residential_construction', certificateOnFile: false },
    });
    expect(r.exemption.honoured).toBe(false);
    expect(r.tax_cents).toBe(8_250);
    expect(r.warnings.join(' ')).toMatch(/no written certification from the contractor is on file/i);
  });

  it('applies the same rule to the landman exclusion and to resale', () => {
    for (const kind of ['landman', 'resale', 'exempt_organization'] as const) {
      const withDoc = computeSalesTax({ lines, rateBps: 825, exemption: { kind, certificateOnFile: true } });
      const without = computeSalesTax({ lines, rateBps: 825, exemption: { kind, certificateOnFile: false } });
      expect(withDoc.tax_cents, `${kind} with certificate`).toBe(0);
      expect(without.tax_cents, `${kind} without certificate`).toBe(8_250);
    }
  });

  it('keeps the per-line taxability recorded even when an exemption zeroes the tax', () => {
    // Removing the exemption later must not lose which lines were taxable — otherwise un-exempting an
    // invoice would silently produce $0 tax on taxable work.
    const r = computeSalesTax({
      lines: [line(100_000, { category: 'boundary' }), line(50_000, { category: 'topographic' })],
      rateBps: 825,
      exemption: { kind: 'resale', certificateOnFile: true },
    });
    expect(r.tax_cents).toBe(0);
    expect(r.lines.map((l) => l.taxable)).toEqual([true, false]);
  });

  it('defaults to no exemption when none is supplied', () => {
    const r = computeSalesTax({ lines, rateBps: 825 });
    expect(r.exemption).toEqual({ kind: 'none', certificateOnFile: false, honoured: false });
  });

  it('never reports `none` as an honoured exemption', () => {
    const r = computeSalesTax({ lines, rateBps: 825, exemption: { kind: 'none', certificateOnFile: true } });
    expect(r.exemption.honoured).toBe(false);
    expect(r.tax_cents).toBe(8_250);
  });
});

describe('rule 3 — no invented rates', () => {
  it('accepts the state rate alone and the legal maximum', () => {
    expect(validateRateBps(TX_STATE_RATE_BPS)).toEqual({ ok: true, bps: 625 });
    expect(validateRateBps(TX_MAX_COMBINED_RATE_BPS)).toEqual({ ok: true, bps: 825 });
  });

  it('REJECTS rather than clamps an above-cap rate', () => {
    // Clamping would put a plausible wrong number on a customer's invoice — the exact failure this
    // module exists to prevent.
    const r = validateRateBps(900);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem).toBe('above-legal-cap');
      expect(r.message).toMatch(/8\.25%/);
    }
  });

  it('rejects a rate below the state rate', () => {
    const r = validateRateBps(500);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toBe('below-state-rate');
  });

  it('rejects fractional and non-numeric rates', () => {
    for (const bad of [8.25, '8.25%', NaN, null, undefined, {}]) {
      const r = validateRateBps(bad);
      expect(r.ok, `${String(bad)} should be rejected`).toBe(false);
      if (!r.ok) expect(r.problem).toBe('not-an-integer');
    }
  });

  it('formats a rate the way a customer reads it', () => {
    expect(formatRate(825)).toBe('8.25%');
    expect(formatRate(625)).toBe('6.25%');
    expect(formatRate(700)).toBe('7%');
  });
});

describe('the arithmetic', () => {
  it('taxes only the taxable lines on a mixed invoice', () => {
    const r = computeSalesTax({
      lines: [
        line(120_000, { category: 'boundary' }),    // taxable
        line(30_000, { category: 'topographic' }),  // not
      ],
      rateBps: 825,
    });
    expect(r.taxable_subtotal_cents).toBe(120_000);
    expect(r.exempt_subtotal_cents).toBe(30_000);
    expect(r.tax_cents).toBe(9_900); // 120000 * 0.0825
  });

  it('rounds ONCE on the aggregate, not per line', () => {
    // Three lines at 333 cents: aggregate 999 * 0.0825 = 82.4175 → 82. Per-line would be
    // round(27.47) * 3 = 27 * 3 = 81. The invoice must agree with the recomputation a bookkeeper does.
    const r = computeSalesTax({
      lines: [line(333, { category: 'boundary' }), line(333, { category: 'boundary' }), line(333, { category: 'boundary' })],
      rateBps: 825,
    });
    expect(r.taxable_subtotal_cents).toBe(999);
    expect(r.tax_cents).toBe(82);
  });

  it('rounds half-up, the way a paper invoice is footed', () => {
    // 1000 * 0.0625 = 62.5 → 63.
    expect(computeSalesTax({ lines: [line(1000, { category: 'boundary' })], rateBps: 625 }).tax_cents).toBe(63);
  });

  it('is zero when nothing on the invoice is taxable', () => {
    const r = computeSalesTax({ lines: [line(80_000, { category: 'topographic' })], rateBps: 825 });
    expect(r.tax_cents).toBe(0);
    expect(r.taxable_subtotal_cents).toBe(0);
    expect(r.exempt_subtotal_cents).toBe(80_000);
  });

  it('handles an empty invoice without dividing by anything', () => {
    const r = computeSalesTax({ lines: [], rateBps: 825 });
    expect(r).toMatchObject({ tax_cents: 0, taxable_subtotal_cents: 0, exempt_subtotal_cents: 0 });
    expect(r.lines).toEqual([]);
  });

  it('clamps a negative or unparseable line total to zero rather than crediting tax', () => {
    const r = computeSalesTax({
      lines: [line(-5_000, { category: 'boundary' }), line(NaN, { category: 'boundary' }), line(10_000, { category: 'boundary' })],
      rateBps: 825,
    });
    expect(r.taxable_subtotal_cents).toBe(10_000);
    expect(r.tax_cents).toBe(825);
  });

  it('never lets the two subtotals disagree with the line totals', () => {
    const lines = [
      line(1_234, { category: 'boundary' }),
      line(5_678, { category: 'topographic' }),
      line(9_012),
    ];
    const r = computeSalesTax({ lines, rateBps: 825 });
    const sum = r.lines.reduce((a, l) => a + l.total_cents, 0);
    expect(r.taxable_subtotal_cents + r.exempt_subtotal_cents).toBe(sum);
  });
});

describe('the explanation a human checks the number against', () => {
  it('shows the taxable base, the rate and the result', () => {
    const r = computeSalesTax({
      lines: [line(120_000, { category: 'boundary' }), line(30_000, { category: 'topographic' })],
      rateBps: 825,
    });
    expect(describeSalesTax(r, money))
      .toBe('$1200.00 taxable at 8.25% = $99.00; $300.00 not taxable.');
  });

  it('names an honoured exemption instead of printing arithmetic', () => {
    const r = computeSalesTax({
      lines: [line(120_000, { category: 'boundary' })], rateBps: 825,
      exemption: { kind: 'new_residential_construction', certificateOnFile: true },
    });
    expect(describeSalesTax(r, money)).toMatch(/^No tax — new residential construction/);
  });

  it('says so plainly when nothing was taxable', () => {
    const r = computeSalesTax({ lines: [line(500, { category: 'tree' })], rateBps: 825 });
    expect(describeSalesTax(r, money)).toBe('No tax — no taxable services on this invoice.');
  });
});

describe('the type guards', () => {
  it('recognises exactly the declared ids', () => {
    expect(isServiceCategory('boundary')).toBe(true);
    expect(isServiceCategory('nope')).toBe(false);
    expect(isServiceCategory(undefined)).toBe(false);
    expect(isExemptionKind('landman')).toBe(true);
    expect(isExemptionKind('landmen')).toBe(false);
  });

  it('falls back to `other` for an unknown category rather than throwing', () => {
    expect(serviceCategory(null).id).toBe('other');
    expect(serviceCategoryLabel('nope')).toBe('Other — not yet categorised');
  });

  it('gives every exemption that needs a certificate a document to name', () => {
    for (const e of EXEMPTION_KINDS) {
      if (e.needsCertificate) expect(e.documentName.length, `${e.id}`).toBeGreaterThan(3);
    }
  });
});
