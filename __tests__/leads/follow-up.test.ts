// __tests__/leads/follow-up.test.ts — chasing leads, and knowing where they came from (D1-2, D1-3).
//
// D1-2 is the only item in the surveying analysis that finds money already on the floor rather than
// preventing a loss: a lead has been paid for — an ad click, a form fill, somebody's time — and then sits
// with a follow-up date in the past because the column was displayed on one detail page and asked about
// nowhere.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLOSED_STATUSES, attributionOf, describeFollowUp, followUps, summarize, type LeadRow,
} from '@/lib/leads/follow-up';

const DAY = 24 * 60 * 60 * 1000;
// Midday, so a test is never within an hour of a day boundary.
const NOW = new Date(2026, 7, 1, 12, 0, 0).getTime();
const dateOffset = (days: number) => {
  const d = new Date(NOW + days * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const lead = (over: Partial<LeadRow> = {}): LeadRow => ({
  id: 'l1', name: 'A Lead', email: null, phone: '555', status: 'contacted', source: 'Website',
  quote_amount: 1000, follow_up_date: dateOffset(-3), converted_job_id: null, assigned_to: null,
  created_at: new Date(NOW - 30 * DAY).toISOString(), ...over,
});
const run = (rows: LeadRow[], horizonDays = 7) => followUps(rows, { asOf: NOW, horizonDays });

describe('D1-2 — the calls nobody has made', () => {
  it('finds an overdue follow-up', () => {
    const [f] = run([lead()]);
    expect(f.due).toBe('overdue');
    expect(f.daysOut).toBe(-3);
  });

  it('separates DUE TODAY from overdue', () => {
    // Yesterday's call is a mistake and today's is a plan. Merged, the list is red every morning before
    // anyone has done anything wrong — and the honest response to a list that is always red is to stop
    // reading it.
    const [f] = run([lead({ follow_up_date: dateOffset(0) })]);
    expect(f.due).toBe('today');
    expect(f.daysOut).toBe(0);
  });

  it('does not treat a DATE as an instant, which would make today overdue overnight', () => {
    // `follow_up_date` is a date. A bare `YYYY-MM-DD` parses as UTC midnight, which is the previous
    // evening in every American timezone — so every one of tomorrow's calls would be red before anyone
    // went home.
    for (const hour of [0, 6, 13, 23]) {
      const asOf = new Date(2026, 7, 1, hour).getTime();
      const [f] = followUps([lead({ follow_up_date: '2026-08-01' })], { asOf });
      expect(f.due, `at ${hour}:00 a call due today must not read as overdue`).toBe('today');
    }
  });

  it('IGNORES A CONVERTED LEAD, whatever its date says', () => {
    // Nobody clears the date when they convert — they create the job and move on, which is correct. A
    // chaser that ignored the conversion would fill with customers who are already being surveyed.
    expect(run([lead({ converted_job_id: 'job1' })])).toEqual([]);
  });

  it('ignores a closed lead', () => {
    for (const status of CLOSED_STATUSES) {
      expect(run([lead({ status })]), `${status} must not be chased`).toEqual([]);
    }
    // And case does not save it.
    expect(run([lead({ status: 'LOST' })])).toEqual([]);
  });

  it('bounds the upcoming end, so the list is workable', () => {
    // A chaser that shows a call due in four months is a chaser nobody scrolls.
    expect(run([lead({ follow_up_date: dateOffset(3) })])).toHaveLength(1);
    expect(run([lead({ follow_up_date: dateOffset(30) })])).toEqual([]);
    expect(run([lead({ follow_up_date: dateOffset(30) })], 60)).toHaveLength(1);
  });

  it('ignores a lead with no date at all', () => {
    expect(run([lead({ follow_up_date: null })])).toEqual([]);
  });

  it('sorts most-overdue first, then by value', () => {
    // Two calls equally late are not equally urgent: a $12,000 boundary survey outranks a $400 lot stake
    // when the office has ten minutes before lunch.
    const got = run([
      lead({ id: 'small-late', follow_up_date: dateOffset(-5), quote_amount: 400 }),
      lead({ id: 'today', follow_up_date: dateOffset(0) }),
      lead({ id: 'big-late', follow_up_date: dateOffset(-5), quote_amount: 12_000 }),
    ]);
    expect(got.map((f) => f.lead.id)).toEqual(['big-late', 'small-late', 'today']);
  });

  it('counts the three groups for a heading without re-walking the list', () => {
    const list = run([
      lead({ id: 'a', follow_up_date: dateOffset(-1) }),
      lead({ id: 'b', follow_up_date: dateOffset(0) }),
      lead({ id: 'c', follow_up_date: dateOffset(2) }),
    ]);
    expect(summarize(list)).toEqual({ overdue: 1, today: 1, upcoming: 1 });
  });

  it('describes a row in words rather than a number', () => {
    expect(describeFollowUp(run([lead({ follow_up_date: dateOffset(-1) })])[0])).toBe('1 day overdue');
    expect(describeFollowUp(run([lead({ follow_up_date: dateOffset(-4) })])[0])).toBe('4 days overdue');
    expect(describeFollowUp(run([lead({ follow_up_date: dateOffset(0) })])[0])).toBe('Due today');
    expect(describeFollowUp(run([lead({ follow_up_date: dateOffset(1) })])[0])).toBe('Due in 1 day');
  });
});

describe('D1-3 — where a lead came from, in order of how much each field is worth believing', () => {
  const attr = (over: Partial<Parameters<typeof attributionOf>[0]> = {}) => attributionOf({
    source: null, gclid: null, utm_source: null, utm_medium: null, utm_campaign: null,
    how_heard: null, referrer: null, ...over,
  });

  it('a gclid outranks everything, and is the only certainly-PAID signal', () => {
    // Google handed it to us: it cannot be wrong, and it is what decides whether a `job_secured` upload
    // can be attributed at all. `utm_medium: cpc` is a claim; a gclid is a receipt.
    const a = attr({ gclid: 'abc', utm_source: 'newsletter', source: 'Phone', utm_campaign: 'spring' });
    expect(a.label).toBe('Google Ads');
    expect(a.paid).toBe(true);
    expect(a.detail).toBe('spring');
  });

  it('utm_source is believed next, and cpc/ppc/paid mark it as spend', () => {
    expect(attr({ utm_source: 'facebook', utm_medium: 'cpc' }).paid).toBe(true);
    expect(attr({ utm_source: 'facebook', utm_medium: 'social' }).paid).toBe(false);
  });

  it('then what the CUSTOMER said, which is useful and frequently vague', () => {
    const a = attr({ how_heard: 'Saw your truck', source: 'Phone' });
    expect(a.label).toBe('Saw your truck');
    expect(a.detail).toBe('customer said');
  });

  it('then the referrer, reduced to a host', () => {
    expect(attr({ referrer: 'https://www.google.com/search?q=surveyor' }).label).toBe('google.com');
    // A referrer that is not a URL is shown rather than dropped — a broken value is still a clue.
    expect(attr({ referrer: 'somewhere' }).label).toBe('somewhere');
  });

  it('the office dropdown is LAST, because it is accurate about intent and useless for spend', () => {
    expect(attr({ source: 'Referral' }).label).toBe('Referral');
    expect(attr({ source: 'Referral' }).detail).toBe('entered by the office');
  });

  it('nothing at all is UNATTRIBUTED, not "Direct"', () => {
    // Calling a lead we failed to attribute "direct traffic" is how a business decides its advertising
    // does nothing.
    expect(attr({}).label).toBe('Unattributed');
    expect(attr({}).paid).toBe(false);
  });
});

describe('one function, both boards', () => {
  it('the leads board and the follow-up queue call the same attribution', () => {
    // "Also G1-4 in the Google doc — do it once." Two implementations would disagree about where a lead
    // came from, on two screens, and the one the office believed would be whichever they opened second.
    const board = readFileSync(join(process.cwd(), 'app/admin/leads/page.tsx'), 'utf8');
    const queue = readFileSync(join(process.cwd(), 'app/api/admin/leads/follow-ups/route.ts'), 'utf8');
    expect(board).toMatch(/attributionOf/);
    expect(queue).toMatch(/attributionOf/);
  });

  it('and the leads API actually returns the columns it needs', () => {
    // The board could call `attributionOf` on rows that never carried a gclid and would silently report
    // every paid click as "Website" — which is the exact failure this slice exists to fix.
    const api = readFileSync(join(process.cwd(), 'app/api/admin/leads/route.ts'), 'utf8');
    for (const col of ['gclid', 'utm_source', 'utm_campaign', 'how_heard', 'referrer']) {
      expect(api, `${col} must be selected`).toContain(col);
    }
  });
});
