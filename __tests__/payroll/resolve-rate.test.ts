// __tests__/payroll/resolve-rate.test.ts
//
// The simple pay model (owner decision, 2026-08-04): base pay per person, set rates for the
// activities that pay the same to everybody, and an override for whoever is paying. Fixtures are
// the firm's live `work_type_rates` and the one employee's live base pay.

import { describe, it, expect } from 'vitest';
import { resolvePayRate, totalHourBlocks, type ActivityRate, type HourBlock } from '@/lib/payroll/resolve-rate';

// Live `work_type_rates`, 2026-08-04. `base_rate` on a `base` row is ignored — the person's own
// rate is what applies — so the $20 on field work is deliberately left in place to prove it.
const FIELD_WORK: ActivityRate = { work_type: 'field_work', base_rate: 20, rate_mode: 'base' };
const DRAWING: ActivityRate = { work_type: 'drawing', base_rate: 23, rate_mode: 'base' };
const DRIVING: ActivityRate = { work_type: 'driving', base_rate: 15, rate_mode: 'flat' };

/** The firm's one employee: base pay $25/hr. */
const CHIEF = { basePay: 25 };
/** Somebody on a lower base — used to prove which rates vary by person and which do not. */
const INTERN = { basePay: 14 };

describe('resolvePayRate — the owner’s worked example', () => {
  // "Right now I want to log 7 hours of field work at $25 an hour, and 1 hour of driving time at
  // $15 an hour." This is the whole feature, in one test.
  it('logs field work at the person’s $25 and driving at the set $15', () => {
    const field = resolvePayRate({ ...CHIEF, activity: FIELD_WORK });
    const driving = resolvePayRate({ ...CHIEF, activity: DRIVING });

    expect(field.rate).toBe(25);
    expect(driving.rate).toBe(15);

    const day = totalHourBlocks([
      { hours: 7, resolved: field },
      { hours: 1, resolved: driving },
    ]);
    expect(day.amount).toBe(190);   // 175.00 + 15.00
    expect(day.paidHours).toBe(8);
  });
});

describe('resolvePayRate — base pay', () => {
  it('pays an ordinary hour at the person’s own base pay', () => {
    const r = resolvePayRate(CHIEF);
    expect(r.rate).toBe(25);
    expect(r.source).toBe('base');
    expect(r.explanation).toContain('base pay');
  });

  it('pays a different person their different base pay', () => {
    // "One person might be set at one base pay, and another person might be set at something else."
    expect(resolvePayRate(INTERN).rate).toBe(14);
  });

  it('returns null — never zero — when nobody has set a base pay', () => {
    // A zero totals into a payroll figure and reads as "worked for free". Null reads as "not set",
    // which is both true and actionable.
    const r = resolvePayRate({});
    expect(r.rate).toBeNull();
    expect(r.source).toBe('unset');
  });
});

describe('resolvePayRate — activities that pay base pay', () => {
  it('pays the PERSON’S rate, not the number sitting in the activity row', () => {
    // Field work is $25 for somebody on $25 and $14 for somebody on $14. The $20 in the row is
    // ignored entirely; it is left there only so a future `flat` switch has a value to use.
    expect(resolvePayRate({ ...CHIEF, activity: FIELD_WORK }).rate).toBe(25);
    expect(resolvePayRate({ ...INTERN, activity: FIELD_WORK }).rate).toBe(14);
  });

  it('still names the activity, because what was done is worth recording', () => {
    const r = resolvePayRate({ ...CHIEF, activity: DRAWING });
    expect(r.source).toBe('base');
    expect(r.explanation).toContain('drawing');
  });

  it('treats an unset or unrecognised mode as base pay, never as a set rate', () => {
    // The safe wrong answer: a misconfigured row pays people their normal rate rather than whatever
    // number happens to be in `base_rate`.
    expect(resolvePayRate({ ...CHIEF, activity: { work_type: 'x', base_rate: 9 } }).rate).toBe(25);
    expect(resolvePayRate({ ...CHIEF, activity: { work_type: 'x', base_rate: 9, rate_mode: 'Flat' } }).rate).toBe(25);
    expect(resolvePayRate({ ...CHIEF, activity: { work_type: 'x', base_rate: 9, rate_mode: null } }).rate).toBe(25);
  });
});

describe('resolvePayRate — activities that pay a set rate', () => {
  it('pays the set rate, not the person’s base pay', () => {
    const r = resolvePayRate({ ...CHIEF, activity: DRIVING });
    expect(r.rate).toBe(15);
    expect(r.source).toBe('activity');
  });

  it('pays EVERYONE the same for it', () => {
    // "Those types of activities should just be set and should be the same for everyone. If people
    // are riding in a vehicle for an hour to a job, then they all get $15."
    expect(resolvePayRate({ ...CHIEF, activity: DRIVING }).rate).toBe(15);
    expect(resolvePayRate({ ...INTERN, activity: DRIVING }).rate).toBe(15);
  });

  it('does NOT floor a set rate at the person’s base pay', () => {
    // $15 driving against a $25 base stays $15. Lifting it would make the rate not-the-same-for-
    // everyone, which is the one property these rates exist to have.
    expect(resolvePayRate({ ...CHIEF, activity: DRIVING }).rate).toBe(15);
  });

  it('does not add base pay and the set rate together', () => {
    expect(resolvePayRate({ ...CHIEF, activity: DRIVING }).rate).not.toBe(40);
  });

  it('says the rate is the same for everyone, so nobody reads it as personal', () => {
    expect(resolvePayRate({ ...CHIEF, activity: DRIVING }).explanation).toContain('the same for everyone');
  });

  it('falls through to base pay when a set rate is unusable', () => {
    const broken: ActivityRate = { work_type: 'driving', base_rate: Number.NaN, rate_mode: 'flat' };
    expect(resolvePayRate({ ...CHIEF, activity: broken }).rate).toBe(25);
  });
});

describe('resolvePayRate — overrides', () => {
  it('a rate typed by whoever is paying outranks everything', () => {
    // "Of course, this can be overridden by the person paying the money out."
    const r = resolvePayRate({ ...CHIEF, activity: DRIVING, override: { fixed_rate: 32 }, manualRate: 40 });
    expect(r.rate).toBe(40);
    expect(r.source).toBe('manual');
  });

  it('a standing pinned rate outranks both the set rate and base pay', () => {
    const r = resolvePayRate({ ...CHIEF, activity: DRIVING, override: { fixed_rate: 32 } });
    expect(r.rate).toBe(32);
    expect(r.source).toBe('override');
  });

  it('honours a typed zero — unpaid is a decision somebody can make', () => {
    // Distinct from `unset`. Volunteer hours, or an hour the boss decides not to pay, is a real
    // outcome and must not fall through to base pay just because the number happens to be zero.
    const r = resolvePayRate({ ...CHIEF, manualRate: 0, activity: FIELD_WORK });
    expect(r.rate).toBe(0);
    expect(r.source).toBe('manual');
  });

  it('ignores a negative rate rather than paying backwards', () => {
    expect(resolvePayRate({ ...CHIEF, manualRate: -10, activity: DRIVING }).source).toBe('activity');
  });

  it('rounds to the cent', () => {
    expect(resolvePayRate({ ...CHIEF, manualRate: 21.4449 }).rate).toBe(21.44);
  });
});

describe('resolvePayRate — nothing graduated is applied', () => {
  it('ignores grade, seniority, credentials and XP entirely', () => {
    // Progression is parked: "put the whole pay progression and seniority thing on hold". Passing
    // any of it must not change the answer — this test is what keeps it parked.
    const withExtras = { ...CHIEF, activity: FIELD_WORK, tier: { base_bonus: 10 }, yearsEmployed: 12 };
    expect(resolvePayRate(withExtras as never).rate).toBe(25);
  });
});

describe('totalHourBlocks — a day split across rates', () => {
  const field = resolvePayRate({ ...CHIEF, activity: FIELD_WORK });  // $25, their base pay
  const driving = resolvePayRate({ ...CHIEF, activity: DRIVING });   // $15, the set rate

  it('adds up from stated parts', () => {
    const blocks: HourBlock[] = [
      { hours: 6, resolved: field },
      { hours: 2, resolved: driving },
    ];
    const t = totalHourBlocks(blocks);
    expect(t.amount).toBe(180);       // 150.00 + 30.00
    expect(t.paidHours).toBe(8);
    expect(t.blendedRate).toBe(22.5);
  });

  it('lets the boss pay one flat unique amount for the same day instead', () => {
    const flat = resolvePayRate({ ...CHIEF, manualRate: 28 });
    expect(totalHourBlocks([{ hours: 8, resolved: flat }]).amount).toBe(224);
  });

  it('or base pay for the whole time', () => {
    expect(totalHourBlocks([{ hours: 8, resolved: resolvePayRate(CHIEF) }]).amount).toBe(200);
  });

  it('holds undecided hours apart instead of totalling them as free labour', () => {
    const undecided = resolvePayRate({});
    const t = totalHourBlocks([
      { hours: 6, resolved: field },
      { hours: 2, resolved: undecided },
    ]);
    expect(t.amount).toBe(150);
    expect(t.paidHours).toBe(6);
    expect(t.unsetHours).toBe(2);
    // The blend is over PAID hours — dividing by 8 would understate the rate the firm actually owes
    // and make an unapproved block look like a discount already granted.
    expect(t.blendedRate).toBe(25);
  });

  it('ignores zero and negative hour blocks rather than subtracting money', () => {
    const t = totalHourBlocks([
      { hours: 6, resolved: field },
      { hours: -2, resolved: field },
      { hours: 0, resolved: field },
    ]);
    expect(t.amount).toBe(150);
    expect(t.paidHours).toBe(6);
  });

  it('reports null rather than NaN when there is nothing paid to blend', () => {
    expect(totalHourBlocks([]).blendedRate).toBeNull();
  });
});

describe('resolvePayRate — no rate on purpose', () => {
  // "Make it so that we can log hours without assigning any specific pay rate at all if we don't
  // want to assign one. The pay rate selection should be optional, and it shouldn't be pointing to
  // a specific pay rate by default."
  it('resolves to nothing at all, not to base pay', () => {
    const r = resolvePayRate({ ...CHIEF, unpriced: true });
    expect(r.rate).toBeNull();
    expect(r.source).toBe('unset');
  });

  it('outranks a set activity rate and a standing pin', () => {
    // Both would put a number on hours the submitter explicitly declined to price.
    expect(resolvePayRate({ ...CHIEF, unpriced: true, activity: DRIVING }).rate).toBeNull();
    expect(resolvePayRate({ ...CHIEF, unpriced: true, override: { fixed_rate: 32 } }).rate).toBeNull();
  });

  it('does NOT outrank the approver — that is who it is deferring to', () => {
    const r = resolvePayRate({ ...CHIEF, unpriced: true, manualRate: 30 });
    expect(r.rate).toBe(30);
    expect(r.source).toBe('manual');
  });

  it('says who will decide, rather than reading as an error', () => {
    expect(resolvePayRate({ ...CHIEF, unpriced: true }).explanation).toContain('whoever approves');
  });

  it('is distinct from having no base pay at all', () => {
    // Both are `unset`, but one is a choice and the other is a gap in the person's record. The
    // sentences differ so the reader can tell which they are looking at.
    const declined = resolvePayRate({ ...CHIEF, unpriced: true });
    const missing = resolvePayRate({});
    expect(declined.explanation).not.toBe(missing.explanation);
    expect(missing.explanation).toContain('no base pay');
  });
});
