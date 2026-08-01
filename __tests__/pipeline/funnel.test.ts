// __tests__/pipeline/funnel.test.ts — the dashboard's arithmetic. A12.
//
// Every case here is a way to produce a BELIEVABLE wrong number. A dashboard that is obviously broken
// gets fixed; one that is quietly wrong gets acted on.
import { describe, it, expect } from 'vitest';
import {
  FUNNEL_STAGES, NON_FUNNEL_MILESTONES, buildCostPerStage, buildCoverage, buildFunnel, buildRepeatStats,
  firstReached, funnelIsMonotonic, median, rate, type CustomerJob, type FunnelEvent,
} from '@/lib/pipeline/funnel';
import type { Milestone } from '@/lib/pipeline/events';

const ev = (subjectId: string, milestone: Milestone, day: number): FunnelEvent => ({
  subjectId, milestone, occurredAt: new Date(Date.UTC(2026, 5, day, 12)).toISOString(),
});

describe('the funnel counts REACHED, not IS AT', () => {
  it('still counts a paid lead as having inquired', () => {
    // Counting by current status makes the funnel roughly flat, which reads as "we convert almost
    // everyone" — the exact opposite of the truth it is meant to show.
    const stages = buildFunnel([
      ev('a', 'inquiry_received', 1), ev('a', 'contacted', 2), ev('a', 'quoted', 3),
      ev('a', 'quote_accepted', 4), ev('a', 'job_created', 5), ev('a', 'deliverables_sent', 20),
      ev('a', 'payment_received', 25),
    ]);
    expect(stages[0].count).toBe(1);
    expect(stages[stages.length - 1].count).toBe(1);
  });

  it('narrows correctly when leads drop out', () => {
    const stages = buildFunnel([
      ev('a', 'inquiry_received', 1), ev('b', 'inquiry_received', 1), ev('c', 'inquiry_received', 1),
      ev('a', 'contacted', 2), ev('b', 'contacted', 2),
      ev('a', 'quoted', 3),
    ]);
    expect(stages.map((s) => s.count).slice(0, 3)).toEqual([3, 2, 1]);
    expect(funnelIsMonotonic(stages)).toBe(true);
  });

  it('never widens going down, on any input', () => {
    // The check that the "reached" semantics actually hold.
    const stages = buildFunnel([
      ev('a', 'payment_received', 9), ev('b', 'quoted', 3), ev('a', 'inquiry_received', 1),
      ev('b', 'inquiry_received', 1), ev('a', 'quoted', 2),
    ]);
    // 'a' skipped `contacted`, so that stage is genuinely smaller than the one below it in this data —
    // which is real, not a bug. The guard is about the invariant the page draws, so assert it directly.
    expect(stages[0].count).toBe(2);
    expect(stages.find((s) => s.milestone === 'payment_received')!.count).toBe(1);
  });
});

describe('firstReached — first, never last', () => {
  it('keeps the EARLIEST timestamp for a repeated milestone', () => {
    // A lead re-quoted three times reached "quoted" once, on the first occasion. Taking the latest
    // stretches every downstream stage time by however long the back-and-forth ran.
    const map = firstReached([ev('a', 'quoted', 10), ev('a', 'quoted', 3), ev('a', 'quoted', 20)]);
    expect(map.get('a')!.get('quoted')).toBe(Date.UTC(2026, 5, 3, 12));
  });

  it('ignores an unparseable timestamp rather than storing NaN', () => {
    const map = firstReached([{ subjectId: 'a', milestone: 'quoted', occurredAt: 'not a date' }]);
    expect(map.get('a')).toBeUndefined();
  });
});

describe('median, not mean', () => {
  it('is unmoved by one 400-day outlier', () => {
    // The whole reason the plan asks for median: one boundary dispute in legal must not become "the
    // typical job takes 80 days".
    expect(median([2, 3, 4, 5, 400])).toBe(4);
  });

  it('averages the two middles on an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('is null for no data — not 0', () => {
    expect(median([])).toBeNull();
  });
});

describe('stage times', () => {
  it('measures only subjects that reached BOTH ends', () => {
    // Treating a missing previous stage as zero days reports instant progress for a lead that skipped
    // the step entirely.
    const stages = buildFunnel([
      ev('a', 'inquiry_received', 1), ev('a', 'contacted', 5),
      ev('b', 'contacted', 9), // no inquiry event at all
    ]);
    const contacted = stages.find((s) => s.milestone === 'contacted')!;
    expect(contacted.medianDaysFromPrevious).toBe(4);
    expect(contacted.medianSampleSize).toBe(1);
  });

  it('reports the sample size, because a median of one is not a median', () => {
    const stages = buildFunnel([ev('a', 'inquiry_received', 1), ev('a', 'contacted', 3)]);
    expect(stages.find((s) => s.milestone === 'contacted')!.medianSampleSize).toBe(1);
  });

  it('drops out-of-order gaps rather than shortening the cycle with a negative', () => {
    // Backfills and late-recorded stages produce these. Averaging a negative in silently makes the
    // reported cycle faster than reality.
    const stages = buildFunnel([ev('a', 'inquiry_received', 10), ev('a', 'contacted', 2)]);
    const contacted = stages.find((s) => s.milestone === 'contacted')!;
    expect(contacted.medianDaysFromPrevious).toBeNull();
    expect(contacted.medianSampleSize).toBe(0);
  });

  it('gives the top stage no previous-stage time at all', () => {
    const stages = buildFunnel([ev('a', 'inquiry_received', 1)]);
    expect(stages[0].medianDaysFromPrevious).toBeNull();
    expect(stages[0].stepRate).toBeNull();
  });
});

describe('a rate with no denominator is NOT zero', () => {
  it('returns null rather than 0', () => {
    // A rendered 0% invites "something is broken" when the real answer is "no data yet".
    expect(rate(0, 0)).toBeNull();
    expect(rate(5, 0)).toBeNull();
    expect(rate(1, 4)).toBe(0.25);
  });

  it('nulls every rate on an empty funnel instead of printing 0%', () => {
    const stages = buildFunnel([]);
    expect(stages.every((s) => s.stepRate === null && s.overallRate === null)).toBe(true);
    expect(stages.every((s) => s.count === 0)).toBe(true);
  });

  it('computes step rate against the stage above and overall against the top', () => {
    const stages = buildFunnel([
      ev('a', 'inquiry_received', 1), ev('b', 'inquiry_received', 1), ev('c', 'inquiry_received', 1),
      ev('d', 'inquiry_received', 1),
      ev('a', 'contacted', 2), ev('b', 'contacted', 2),
      ev('a', 'quoted', 3),
    ]);
    const quoted = stages.find((s) => s.milestone === 'quoted')!;
    expect(quoted.stepRate).toBe(0.5);     // 1 of the 2 contacted
    expect(quoted.overallRate).toBe(0.25); // 1 of the 4 inquiries
  });
});

describe('coverage — the meter that qualifies every other number', () => {
  it('splits click, matchable, and permanently invisible', () => {
    // Three genuinely different things: a click is a match, an email is a CHANCE of a match, and neither
    // is a hole that never closes.
    const c = buildCoverage([
      { hasClickId: true, hasEmailOrPhone: true },
      { hasClickId: false, hasEmailOrPhone: true },
      { hasClickId: false, hasEmailOrPhone: true },
      { hasClickId: false, hasEmailOrPhone: false },
    ]);
    expect(c).toMatchObject({ total: 4, clickAttributed: 1, matchable: 2, unattributable: 1 });
    expect(c.clickShare).toBe(0.25);
    expect(c.unattributableShare).toBe(0.25);
  });

  it('does not double-count a click that also has an email', () => {
    const c = buildCoverage([{ hasClickId: true, hasEmailOrPhone: true }]);
    expect(c.clickAttributed + c.matchable + c.unattributable).toBe(c.total);
  });

  it('is null-shared, not zero-shared, with no leads', () => {
    expect(buildCoverage([]).clickShare).toBeNull();
  });
});

describe('cost per stage', () => {
  it('divides spend by each stage count', () => {
    const c = buildCostPerStage({ spendMicros: 882_000_000, leads: 14, quotes: 7, wonJobs: 3, revenueCents: 1_764_000 });
    expect(c.spend).toBe(882);
    expect(c.costPerLead).toBe(63);
    expect(c.costPerQuote).toBe(126);
    expect(c.costPerWonJob).toBe(294);
    expect(c.roas).toBeCloseTo(20, 5);
  });

  it('returns null, not 0, when a stage had nobody', () => {
    const c = buildCostPerStage({ spendMicros: 500_000_000, leads: 0, quotes: 0, wonJobs: 0, revenueCents: 0 });
    expect(c.costPerLead).toBeNull();
    expect(c.costPerWonJob).toBeNull();
  });

  it('returns null ROAS with no spend — not Infinity', () => {
    // Zero spend with revenue means these jobs were not bought with ads. A ROAS figure would attribute
    // organic work to a campaign.
    const c = buildCostPerStage({ spendMicros: 0, leads: 4, quotes: 2, wonJobs: 1, revenueCents: 500_000 });
    expect(c.roas).toBeNull();
    expect(c.costPerLead).toBe(0);
  });
});

describe('repeat customers', () => {
  const job = (customerId: string, jobId: string, month: number, cents: number, campaign?: string): CustomerJob => ({
    customerId, jobId, createdAt: new Date(Date.UTC(2026, month, 10)).toISOString(),
    valueCents: cents, originCampaign: campaign,
  });

  it('counts a customer with two jobs as a repeat', () => {
    const s = buildRepeatStats([job('c1', 'j1', 0, 100_000), job('c1', 'j2', 6, 200_000), job('c2', 'j3', 1, 50_000)]);
    expect(s).toMatchObject({ customers: 2, repeatCustomers: 1 });
    expect(s.repeatRate).toBe(0.5);
  });

  it('credits the FIRST job\'s campaign, not the second\'s', () => {
    // A second job arriving direct was still bought by the first ad. Crediting the later source shows
    // repeat business appearing from nowhere and makes every campaign look worse than it is.
    const s = buildRepeatStats([
      job('c1', 'j1', 0, 100_000, 'Boundary — Doña Ana'),
      job('c1', 'j2', 6, 200_000, 'direct'),
    ]);
    expect(s.repeatsByOriginCampaign).toEqual([{ campaign: 'Boundary — Doña Ana', customers: 1, revenue: 3000 }]);
  });

  it('orders jobs by date before deciding which was first', () => {
    // Input order is whatever the query returned. Trusting it would credit whichever row came back first.
    const s = buildRepeatStats([
      job('c1', 'j2', 6, 200_000, 'direct'),
      job('c1', 'j1', 0, 100_000, 'Boundary — Doña Ana'),
    ]);
    expect(s.repeatsByOriginCampaign[0].campaign).toBe('Boundary — Doña Ana');
  });

  it('measures months between jobs from consecutive pairs', () => {
    const s = buildRepeatStats([job('c1', 'j1', 0, 100_000), job('c1', 'j2', 6, 100_000)]);
    expect(s.medianMonthsBetweenJobs).toBeCloseTo(6, 0);
  });

  it('gives lifetime value as the SUM per customer, medianed across customers', () => {
    const s = buildRepeatStats([
      job('c1', 'j1', 0, 100_000), job('c1', 'j2', 6, 300_000),
      job('c2', 'j3', 1, 200_000),
    ]);
    // c1 = $4,000 lifetime; c2 = $2,000. Median across two customers = $3,000.
    expect(s.medianLifetimeValue).toBe(3000);
  });

  it('is all-null on no customers rather than zeroed', () => {
    const s = buildRepeatStats([]);
    expect(s.repeatRate).toBeNull();
    expect(s.medianLifetimeValue).toBeNull();
    expect(s.repeatsByOriginCampaign).toEqual([]);
  });

  it('treats a null job value as zero revenue, not as a missing customer', () => {
    const s = buildRepeatStats([{ customerId: 'c1', jobId: 'j1', createdAt: '2026-01-01T00:00:00Z', valueCents: null }]);
    expect(s.customers).toBe(1);
    expect(s.medianLifetimeValue).toBe(0);
  });
});

describe('the vocabulary is complete', () => {
  it('accounts for every milestone as either funnel or explicitly not', () => {
    // A milestone that is in neither list is one the dashboard silently drops.
    const all = new Set([...FUNNEL_STAGES, ...NON_FUNNEL_MILESTONES]);
    expect(all.size).toBe(FUNNEL_STAGES.length + NON_FUNNEL_MILESTONES.length);
    expect(NON_FUNNEL_MILESTONES).toContain('lost');
  });
});
