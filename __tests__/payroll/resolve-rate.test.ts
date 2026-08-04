// __tests__/payroll/resolve-rate.test.ts
//
// The consolidated pay model. Fixtures below are the firm's LIVE config as of 2026-08-04 (read from
// `work_type_rates`, `role_tiers`, `seniority_brackets`, `pay_rate_standards`), so a failure here
// means a real person's rate changed, not that a made-up number moved.

import { describe, it, expect } from 'vitest';
import { resolvePayRate, totalHourBlocks, type HourBlock } from '@/lib/payroll/resolve-rate';
import type { RoleTierRow, SeniorityBracketRow, WorkTypeRow } from '@/lib/payroll/effective-rate';

// ── Live config, 2026-08-04 ─────────────────────────────────────────────────────────────────────
const FIELD_WORK: WorkTypeRow = { work_type: 'field_work', base_rate: 20, bonus_multiplier: 1, max_bonus_cap: null };
const DRAWING: WorkTypeRow = { work_type: 'drawing', base_rate: 23, bonus_multiplier: 1, max_bonus_cap: null };
const DRIVING: WorkTypeRow = { work_type: 'driving', base_rate: 16, bonus_multiplier: 1, max_bonus_cap: null };

const PARTY_CHIEF: RoleTierRow = { role_key: 'party_chief', base_bonus: 10, max_effective_rate: null };
const INTERN: RoleTierRow = { role_key: 'intern', base_bonus: 0, max_effective_rate: null };

// The live rows, verbatim. These are INCLUSIVE ranges — 1–1 means "exactly one year" — which is
// what exposed the exclusive-bound bug in `findSeniorityBracket`. Writing them as half-open (0–1,
// 1–2, …) would have tiled neatly and hidden it, which is what the original fixtures did.
const SENIORITY: SeniorityBracketRow[] = [
  { min_years: 0, max_years: 0, bonus_per_hour: 0 },
  { min_years: 1, max_years: 1, bonus_per_hour: 0.5 },
  { min_years: 2, max_years: 2, bonus_per_hour: 1 },
  { min_years: 3, max_years: 4, bonus_per_hour: 2 },
  { min_years: 5, max_years: 6, bonus_per_hour: 3.5 },
  { min_years: 20, max_years: null, bonus_per_hour: 12 },
];

/** The firm's one employee: party chief, agreed $25/hr, hired 2025-07-15 → one year in. */
const OWNER_EMPLOYEE = {
  basePay: 25,
  tier: PARTY_CHIEF,
  yearsEmployed: 1,
  seniority: SENIORITY,
};

describe('resolvePayRate — precedence', () => {
  it('a hand-set amount outranks every table', () => {
    const r = resolvePayRate({
      ...OWNER_EMPLOYEE,
      manualRate: 40,
      workType: FIELD_WORK,
      override: { fixed_rate: 32 },
    });
    expect(r.rate).toBe(40);
    expect(r.source).toBe('manual');
  });

  it('a hand-set amount is the whole answer — acting-up pay is not stacked on top', () => {
    // Otherwise the person who typed 40 would see 45 saved, which reads as the system overruling
    // them. Acting-up pay is a component of a *computed* rate, not a surcharge on a decision.
    const r = resolvePayRate({ ...OWNER_EMPLOYEE, manualRate: 40, actingBonus: 5 });
    expect(r.rate).toBe(40);
    expect(r.actingBonus).toBe(0);
  });

  it('a standing fixed override outranks the activity stack', () => {
    const r = resolvePayRate({ ...OWNER_EMPLOYEE, workType: FIELD_WORK, override: { fixed_rate: 32 } });
    expect(r.rate).toBe(32);
    expect(r.source).toBe('override');
  });

  it('a manual rate of zero is honoured — unpaid is a decision somebody can make', () => {
    // Distinct from `unset`. Volunteer hours, or an hour the boss decides not to pay, is a real
    // outcome; it must not fall through to base pay just because the number happens to be zero.
    const r = resolvePayRate({ ...OWNER_EMPLOYEE, manualRate: 0, workType: FIELD_WORK });
    expect(r.rate).toBe(0);
    expect(r.source).toBe('manual');
  });

  it('a negative rate is not a rate — it falls through rather than paying backwards', () => {
    const r = resolvePayRate({ ...OWNER_EMPLOYEE, manualRate: -10, workType: FIELD_WORK });
    expect(r.source).toBe('activity');
  });
});

describe('resolvePayRate — the activity stack', () => {
  it('reproduces the pay-progression number for the firm’s party chief on field work', () => {
    // $20 field work + $10 party chief + $0.50 one-year seniority.
    const r = resolvePayRate({ ...OWNER_EMPLOYEE, workType: FIELD_WORK });
    expect(r.rate).toBe(30.5);
    expect(r.source).toBe('activity');
    expect(r.floorApplied).toBe(false);
  });

  it('explains itself in named parts rather than a bare figure', () => {
    const r = resolvePayRate({ ...OWNER_EMPLOYEE, workType: FIELD_WORK });
    expect(r.explanation).toContain('$20.00 field work');
    expect(r.explanation).toContain('$10.00 party chief');
    expect(r.explanation).toContain('$0.50 seniority');
  });

  it('adds acting-up pay for a bigger role filled that day', () => {
    // A survey technician running the crew: $20 field work + $0 intern tier + $5 acting up.
    const r = resolvePayRate({
      basePay: null, tier: INTERN, yearsEmployed: 0, seniority: SENIORITY,
      workType: FIELD_WORK, actingBonus: 5,
    });
    expect(r.rate).toBe(25);
    expect(r.actingBonus).toBe(5);
    expect(r.explanation).toContain('acting up');
  });
});

describe('resolvePayRate — base pay is a floor', () => {
  it('driving does not cut an agreed $25 down to $16', () => {
    // This is the reconciliation the owner reported: "my base pay is $25 an hour, but when I go to
    // My Hours it shows a bunch of different rates and doesn't show the $25".
    // $16 driving + $10 party chief + $0.50 = $26.50, above the floor — so the floor does NOT bite
    // for this person. Strip the tier and it does.
    const chief = resolvePayRate({ ...OWNER_EMPLOYEE, workType: DRIVING });
    expect(chief.rate).toBe(26.5);
    expect(chief.floorApplied).toBe(false);

    const untiered = resolvePayRate({ ...OWNER_EMPLOYEE, tier: null, workType: DRIVING });
    expect(untiered.rate).toBe(25);
    expect(untiered.floorApplied).toBe(true);
    expect(untiered.explanation).toContain('$16.50');
  });

  it('names the floor rather than silently showing the higher number', () => {
    const r = resolvePayRate({ ...OWNER_EMPLOYEE, tier: null, workType: DRIVING });
    expect(r.explanation).toContain('agreed base pay');
  });

  it('the floor compares against the rate INCLUDING acting-up pay', () => {
    // $16 driving + $5 acting up = $21, still under the $25 floor → floor wins at $25, not $30.
    // Floating the floor on top of the bonus would pay $30 and quietly double-count it.
    const r = resolvePayRate({ ...OWNER_EMPLOYEE, tier: null, workType: DRIVING, actingBonus: 5 });
    expect(r.rate).toBe(25);
    expect(r.floorApplied).toBe(true);
  });

  it('somebody with no agreed base gets the activity rate untouched', () => {
    const r = resolvePayRate({ tier: INTERN, yearsEmployed: 0, seniority: SENIORITY, workType: DRIVING });
    expect(r.rate).toBe(16);
    expect(r.floorApplied).toBe(false);
  });
});

describe('resolvePayRate — hours with no activity', () => {
  it('falls to the agreed base pay, which is what "submit without choosing a rate" costs', () => {
    const r = resolvePayRate(OWNER_EMPLOYEE);
    expect(r.rate).toBe(25);
    expect(r.source).toBe('base');
    expect(r.explanation).toContain('no activity recorded');
  });

  it('returns null — never zero — when nobody has set a rate at all', () => {
    // A zero totals into a payroll figure and reads as "worked for free". Null reads as "not set",
    // which is both true and actionable.
    const r = resolvePayRate({ tier: null, seniority: [] });
    expect(r.rate).toBeNull();
    expect(r.source).toBe('unset');
  });
});

describe('resolvePayRate — the advisory band', () => {
  // Folded in from `pay_rate_standards`, which gives a party chief $22–$40. It warns; it never
  // blocks, because the owner is the authority on what somebody is paid.
  const band = { min: 22, max: 40 };

  it('reports a custom rate under the grade’s band without refusing it', () => {
    const r = resolvePayRate({ ...OWNER_EMPLOYEE, manualRate: 8, band });
    expect(r.rate).toBe(8);
    expect(r.outOfBand).toEqual({ band, direction: 'below' });
  });

  it('reports one above the band too', () => {
    const r = resolvePayRate({ ...OWNER_EMPLOYEE, manualRate: 95, band });
    expect(r.outOfBand?.direction).toBe('above');
  });

  it('stays quiet when the rate sits inside the band', () => {
    expect(resolvePayRate({ ...OWNER_EMPLOYEE, workType: FIELD_WORK, band }).outOfBand).toBeNull();
  });
});

describe('totalHourBlocks — a day split across rates', () => {
  // The owner's worked example: "someone might draw for a couple hours, and also work in the field
  // for about 6 hours… the boss might choose to pay the rate for drawing for 2 hours and the field
  // work rate for 6 hours."
  const drawing = resolvePayRate({ ...OWNER_EMPLOYEE, workType: DRAWING });   // 23 + 10 + 0.5 = 33.50
  const field = resolvePayRate({ ...OWNER_EMPLOYEE, workType: FIELD_WORK });  // 20 + 10 + 0.5 = 30.50

  it('adds up from stated parts', () => {
    const blocks: HourBlock[] = [
      { hours: 2, resolved: drawing },
      { hours: 6, resolved: field },
    ];
    const t = totalHourBlocks(blocks);
    expect(t.amount).toBe(250);       // 67.00 + 183.00
    expect(t.paidHours).toBe(8);
    expect(t.blendedRate).toBe(31.25);
  });

  it('lets the boss pay one flat unique amount for the same day instead', () => {
    const flat = resolvePayRate({ ...OWNER_EMPLOYEE, manualRate: 28 });
    const t = totalHourBlocks([{ hours: 8, resolved: flat }]);
    expect(t.amount).toBe(224);
  });

  it('or the agreed base for the whole time', () => {
    const t = totalHourBlocks([{ hours: 8, resolved: resolvePayRate(OWNER_EMPLOYEE) }]);
    expect(t.amount).toBe(200);
  });

  it('holds undecided hours apart instead of totalling them as free labour', () => {
    const undecided = resolvePayRate({ tier: null, seniority: [] });
    const t = totalHourBlocks([
      { hours: 6, resolved: field },
      { hours: 2, resolved: undecided },
    ]);
    expect(t.amount).toBe(183);
    expect(t.paidHours).toBe(6);
    expect(t.unsetHours).toBe(2);
    // The blend is over PAID hours — dividing by 8 would understate the rate the firm actually owes
    // and make an unapproved block look like a discount.
    expect(t.blendedRate).toBe(30.5);
  });

  it('ignores zero and negative hour blocks rather than subtracting money', () => {
    const t = totalHourBlocks([
      { hours: 6, resolved: field },
      { hours: -2, resolved: field },
      { hours: 0, resolved: field },
    ]);
    expect(t.amount).toBe(183);
    expect(t.paidHours).toBe(6);
  });

  it('reports null rather than NaN when there is nothing paid to blend', () => {
    expect(totalHourBlocks([]).blendedRate).toBeNull();
  });
});
