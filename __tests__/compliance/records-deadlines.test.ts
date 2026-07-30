// __tests__/compliance/records-deadlines.test.ts — the records register and the deadline math.
//
// The date tests all pin a fixed `today`, because the bugs worth catching here are calendar-boundary ones:
// the day a window opens, the day after a due date, and the January view of a December deadline.
import { describe, it, expect } from 'vitest';
import {
  RECORDS, RECORD_CATEGORIES, annualFeeTotalUsd, categoryLabel, openItems,
  professionalReviewQueue, recordById, recordsInCategory, salesTaxNote, workerClassificationNote,
} from '@/lib/compliance/records-catalogue';
import {
  DUE_SOON_DAYS, addYears, daysBetween, deadlineSummary, fromEpochDay, mayBeDestroyed,
  nextOccurrence, overdueDeadlines, retentionExpiry, toEpochDay, upcomingDeadlines, urgencyFor,
} from '@/lib/compliance/deadlines';

const rec = (id: string) => {
  const r = recordById(id);
  if (!r) throw new Error(`missing record ${id}`);
  return r;
};

describe('the register itself', () => {
  it('has every id unique — ids are what the vault and the deadline list join on', () => {
    const ids = RECORDS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('puts every record in a declared category', () => {
    const known = new Set(RECORD_CATEGORIES.map((c) => c.id));
    for (const r of RECORDS) expect(known.has(r.category), `${r.id} → ${r.category}`).toBe(true);
  });

  it('gives every record a reason it is kept, so nobody deletes it to tidy up', () => {
    for (const r of RECORDS) expect(r.why.length, `${r.id} needs a real why`).toBeGreaterThan(20);
  });

  it('covers all ten checklist categories', () => {
    for (const c of RECORD_CATEGORIES) {
      expect(recordsInCategory(c.id).length, `${c.id} should have records`).toBeGreaterThan(0);
    }
    expect(categoryLabel('licensing')).toBe('Licensing & professional');
  });

  it('records the two licences the owner already holds as on file, with their numbers', () => {
    expect(rec('rpls-licence').status).toBe('on_file');
    expect(rec('rpls-licence').ownerStated).toMatch(/6706/);
    expect(rec('tbpels-firm-registration').status).toBe('on_file');
    expect(rec('tbpels-firm-registration').ownerStated).toMatch(/10193754/);
  });

  it('keeps `pending` out of the open-items list', () => {
    // Pending means "starts when you hire" or "if there is ever a second owner". Showing those as
    // outstanding tasks would bury the real ones.
    const open = openItems().map((r) => r.id);
    expect(open).not.toContain('form-i9');
    expect(open).not.toContain('shareholder-agreement');
    expect(open).toContain('sales-tax-permit');
  });

  it('routes each professional-review item to exactly one professional', () => {
    const q = professionalReviewQueue();
    expect(q.cpa.map((r) => r.id)).toContain('sales-tax-permit');
    expect(q.attorney.map((r) => r.id)).toContain('lien-forms');
    expect(q.insurance_agent.map((r) => r.id)).toContain('professional-liability-eo');
    const total = q.cpa.length + q.attorney.length + q.insurance_agent.length;
    expect(total).toBe(RECORDS.filter((r) => r.professionalReview).length);
  });

  it('totals the known recurring fees', () => {
    // RPLS 100 + TBPELS firm 150 + assumed name 25 + Apple 99 = 374. A number the owner can budget.
    expect(annualFeeTotalUsd()).toBe(374);
  });

  it('keeps permanent retention on the records that can never be destroyed', () => {
    for (const id of ['sealed-deliverable-archive', 'certificate-of-formation', 'professional-liability-eo']) {
      expect(rec(id).retention.kind, id).toBe('permanent');
    }
  });
});

describe('the sales tax finding is recorded, not paraphrased', () => {
  it('names the rule and the permit obligation', () => {
    expect(salesTaxNote.authority).toMatch(/3\.276/);
    expect(salesTaxNote.finding).toMatch(/must obtain a sales and use tax permit/i);
  });

  it('keeps the taxable and non-taxable lists disjoint', () => {
    const overlap = salesTaxNote.taxable.filter((t) => (salesTaxNote.notTaxable as readonly string[]).includes(t));
    expect(overlap).toEqual([]);
  });

  it('carries both statutory exclusions', () => {
    expect(salesTaxNote.statutoryExclusions).toHaveLength(2);
    expect(salesTaxNote.statutoryExclusions.join(' ')).toMatch(/residential/);
    expect(salesTaxNote.statutoryExclusions.join(' ')).toMatch(/landman/);
  });

  it('flags the permit as an action needing the CPA', () => {
    expect(rec('sales-tax-permit').status).toBe('action');
    expect(rec('sales-tax-permit').professionalReview).toBe('cpa');
    expect(rec('sales-tax-permit').verified).toBe(true);
  });
});

describe('the classification question is pointed at a human', () => {
  it('names the owner and the affected records', () => {
    expect(workerClassificationNote.owner).toMatch(/CPA|attorney/i);
    for (const id of workerClassificationNote.affects) expect(recordById(id), id).toBeDefined();
  });
});

describe('date primitives', () => {
  it('round-trips a date through epoch days', () => {
    expect(fromEpochDay(toEpochDay('2026-07-29')!)).toBe('2026-07-29');
  });

  it('rejects malformed and impossible dates instead of rolling them forward', () => {
    // Date.UTC(2026, 1, 31) silently becomes 3 March. A compliance tracker must not invent that date.
    for (const bad of ['2026-02-31', '2026-13-01', '26-07-29', '2026-7-9', 'yesterday', '']) {
      expect(toEpochDay(bad), bad).toBeNull();
    }
  });

  it('counts days across a month and a year boundary', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-01-31', '2026-03-01')).toBe(29); // 2026 is not a leap year
    expect(daysBetween('2027-01-01', '2026-12-31')).toBe(-1);
  });

  it('adds years without drifting', () => {
    expect(addYears('2026-07-29', 10)).toBe('2036-07-29');
    expect(addYears('bad', 1)).toBeNull();
  });

  it('bands urgency at the documented thresholds', () => {
    expect(urgencyFor(-1)).toBe('overdue');
    expect(urgencyFor(0)).toBe('due_soon');
    expect(urgencyFor(DUE_SOON_DAYS)).toBe('due_soon');
    expect(urgencyFor(DUE_SOON_DAYS + 1)).toBe('upcoming');
    expect(urgencyFor(90)).toBe('upcoming');
    expect(urgencyFor(91)).toBe('later');
  });
});

describe('annual deadlines', () => {
  it('finds this year’s date when it is still ahead', () => {
    const occ = nextOccurrence(rec('franchise-tax-pir'), '2026-03-01');
    expect(occ?.dueOn).toBe('2026-05-15');
    expect(occ?.daysUntil).toBe(75);
  });

  it('rolls to next year once the date has passed', () => {
    expect(nextOccurrence(rec('franchise-tax-pir'), '2026-05-16')?.dueOn).toBe('2027-05-15');
  });

  it('treats the due date itself as due today, not as passed', () => {
    const occ = nextOccurrence(rec('franchise-tax-pir'), '2026-05-15');
    expect(occ?.dueOn).toBe('2026-05-15');
    expect(occ?.daysUntil).toBe(0);
    expect(occ?.urgency).toBe('due_soon');
  });
});

describe('renewal windows — where the RPLS and firm registration live', () => {
  it('reports the window as CLOSED before it opens', () => {
    const occ = nextOccurrence(rec('rpls-licence'), '2026-09-01');
    expect(occ?.dueOn).toBe('2026-12-31');
    expect(occ?.opensOn).toBe('2026-11-01');
    expect(occ?.windowOpen).toBe(false);
  });

  it('reports it OPEN on the day it opens, and promotes it out of `upcoming`', () => {
    // 1 Nov → 31 Dec is 60 days, which the raw day-count bands as 'upcoming'. An open window is
    // actionable TODAY, so it is promoted to 'due_soon' rather than sorting below work that cannot be
    // started yet. Without this, modelling the window changed nothing.
    const occ = nextOccurrence(rec('rpls-licence'), '2026-11-01');
    expect(occ?.windowOpen).toBe(true);
    expect(occ?.daysUntil).toBe(60);
    expect(occ?.urgency).toBe('due_soon');
  });

  it('leaves a closed-window record at its natural urgency', () => {
    const occ = nextOccurrence(rec('rpls-licence'), '2026-10-15');
    expect(occ?.windowOpen).toBe(false);
    expect(occ?.urgency).toBe('upcoming');
  });

  it('does NOT report last year’s closed window as open in January', () => {
    // The bug this pins: pairing next year's due date with this year's already-passed opening would make
    // a 1 January view say "the window is open" about a window that shut the night before.
    const occ = nextOccurrence(rec('tbpels-firm-registration'), '2027-01-05');
    expect(occ?.dueOn).toBe('2027-12-31');
    expect(occ?.opensOn).toBe('2027-11-01');
    expect(occ?.windowOpen).toBe(false);
  });

  it('counts the firm registration as due 31 December, not in the new year', () => {
    // Renewal must be complete BEFORE 1 January to offer services next year, so the practical deadline is
    // the 31st. If this ever reads January, someone has mistaken the renewal year for the deadline.
    expect(nextOccurrence(rec('tbpels-firm-registration'), '2026-12-01')?.dueOn).toBe('2026-12-31');
  });
});

describe('already-lapsed records', () => {
  it('reports the expired assumed name as overdue against its own expiry, not its next cycle', () => {
    const occ = nextOccurrence(rec('assumed-name-503'), '2026-07-29');
    expect(occ?.urgency).toBe('overdue');
    expect(occ?.dueOn).toBe('2021-11-28');
    expect(occ?.daysUntil).toBeLessThan(0);
  });

  it('does not treat a future expiry as overdue', () => {
    // The RPLS runs through 2026-12-31; on this date it is current.
    expect(nextOccurrence(rec('rpls-licence'), '2026-07-29')?.urgency).not.toBe('overdue');
  });

  it('flips to overdue the day after expiry', () => {
    expect(nextOccurrence(rec('rpls-licence'), '2027-01-01')?.urgency).toBe('overdue');
  });
});

describe('undated obligations stay off the calendar', () => {
  it('returns null for once / per_event / ongoing records', () => {
    for (const id of ['certificate-of-formation', 'contractor-w9', 'job-register']) {
      expect(nextOccurrence(rec(id), '2026-07-29'), id).toBeNull();
    }
  });

  it('keeps them in the register regardless', () => {
    expect(rec('contractor-w9').recurrence.kind).toBe('per_event');
  });
});

describe('the deadline list', () => {
  it('sorts overdue first, then soonest', () => {
    const list = upcomingDeadlines('2026-07-29');
    expect(list.length).toBeGreaterThan(3);
    for (let i = 1; i < list.length; i += 1) {
      expect(list[i].daysUntil).toBeGreaterThanOrEqual(list[i - 1].daysUntil);
    }
    expect(list[0].urgency).toBe('overdue');
  });

  it('never hides an overdue item behind the horizon', () => {
    // A deadline missed years ago is the most urgent thing on the list.
    const tight = upcomingDeadlines('2026-07-29', 1);
    expect(tight.some((o) => o.recordId === 'assumed-name-503')).toBe(true);
  });

  it('respects the horizon for items that are merely far off', () => {
    const near = upcomingDeadlines('2026-07-29', 10).filter((o) => o.urgency !== 'overdue');
    for (const o of near) expect(o.daysUntil).toBeLessThanOrEqual(10);
  });

  it('carries the form link through to the list so the item is actionable', () => {
    const pir = upcomingDeadlines('2026-04-01', 90).find((o) => o.recordId === 'franchise-tax-pir');
    expect(pir?.formNumber).toBe('Form 05-102');
    expect(pir?.sourceUrl).toMatch(/^https:/);
  });

  it('summarises without double-counting', () => {
    const s = deadlineSummary('2026-07-29');
    expect(s.overdue).toBe(overdueDeadlines('2026-07-29').length);
    expect(s.overdue).toBeGreaterThan(0);
  });
});

describe('retention', () => {
  it('computes a destruction date for year-based retention', () => {
    expect(retentionExpiry({ kind: 'years', years: 10, from: 'job_completion' }, '2026-07-29'))
      .toBe('2036-07-29');
  });

  it('returns null — never a date — for permanent and while-active', () => {
    expect(retentionExpiry({ kind: 'permanent' }, '2026-07-29')).toBeNull();
    expect(retentionExpiry({ kind: 'while_active' }, '2026-07-29')).toBeNull();
  });

  it('refuses to say a permanent record may be destroyed', () => {
    expect(mayBeDestroyed({ kind: 'permanent' }, '1990-01-01', '2026-07-29')).toBe(false);
  });

  it('allows destruction only once the full span has elapsed', () => {
    const r = { kind: 'years', years: 4, from: 'creation' } as const;
    expect(mayBeDestroyed(r, '2022-07-29', '2026-07-28')).toBe(false);
    expect(mayBeDestroyed(r, '2022-07-29', '2026-07-29')).toBe(true);
  });

  it('is conservative about a malformed date', () => {
    expect(mayBeDestroyed({ kind: 'years', years: 1, from: 'creation' }, 'nonsense', '2026-07-29')).toBe(false);
  });
});
