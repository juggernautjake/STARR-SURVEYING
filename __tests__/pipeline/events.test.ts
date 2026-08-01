// __tests__/pipeline/events.test.ts — the lifecycle stream's vocabulary and keys (A4).
//
// The pure parts are what matter here. `recordMilestone` is a thin insert; the things that go wrong
// quietly are the VOCABULARY (one route says `quoted`, another `quote_sent`, and the funnel reports half
// the truth) and the DEDUPE KEY (built differently by the backfill, so a re-run duplicates every
// historical milestone instead of being the no-op it is designed to be).
import { describe, it, expect } from 'vitest';
import {
  GOOGLE_MILESTONES, MILESTONES, PRIMARY_BIDDING_MILESTONE,
  dedupeKeyFor, milestoneForJobStage, milestoneForLeadStatus, toCents,
} from '@/lib/pipeline/events';

describe('the vocabulary matches the plan, exactly', () => {
  it('has the nine pipeline milestones plus lost, in pipeline order', () => {
    // Order is load-bearing: it renders a timeline and answers "how far did this lead get". A consumer
    // that needed an order and did not find one here would invent its own.
    expect([...MILESTONES]).toEqual([
      'inquiry_received', 'contacted', 'quoted', 'quote_accepted', 'job_created',
      'research_started', 'fieldwork_complete', 'deliverables_sent', 'payment_received', 'lost',
    ]);
  });

  it('sends only FOUR of them to Google', () => {
    // Google's bidding degrades when fed a dozen overlapping actions, and 2/6/7/8 are cycle-time facts,
    // not purchase intent.
    expect([...GOOGLE_MILESTONES]).toEqual(['inquiry_received', 'quoted', 'job_created', 'payment_received']);
    for (const m of GOOGLE_MILESTONES) expect(MILESTONES).toContain(m);
  });

  it('bids on job_created, NOT payment_received', () => {
    // THE decision this plan turns on. Google's click window maxes at 90 days and a boundary survey
    // routinely runs quote → delivery → payment past it, so a payment-keyed primary silently
    // under-reports the slowest jobs — which are usually the biggest.
    expect(PRIMARY_BIDDING_MILESTONE).toBe('job_created');
    expect(PRIMARY_BIDDING_MILESTONE).not.toBe('payment_received');
  });
});

describe('dedupeKeyFor — identical between the live writers and the backfill', () => {
  it('is built from what happened and which record', () => {
    expect(dedupeKeyFor({ milestone: 'quoted', sourceTable: 'leads', sourceId: 'abc' }))
      .toBe('quoted:leads:abc');
  });

  it('gives the SAME key for the same event described twice', () => {
    // The property the whole design rests on. If a re-run built a different key it would duplicate every
    // historical milestone, and a duplicated job_created is a job counted twice in the revenue signal.
    const live = dedupeKeyFor({ milestone: 'job_created', jobId: 'j1', sourceTable: 'jobs', sourceId: 'j1' });
    const backfill = dedupeKeyFor({ milestone: 'job_created', jobId: 'j1', sourceTable: 'jobs', sourceId: 'j1' });
    expect(live).toBe(backfill);
  });

  it('gives DIFFERENT keys for different milestones on one record', () => {
    // A job legitimately produces several milestones. They must not collapse into each other.
    const a = dedupeKeyFor({ milestone: 'job_created', jobId: 'j1' });
    const b = dedupeKeyFor({ milestone: 'payment_received', jobId: 'j1' });
    expect(a).not.toBe(b);
  });

  it('falls back to the job, then the lead, so a key is always derivable', () => {
    expect(dedupeKeyFor({ milestone: 'job_created', jobId: 'j1' })).toBe('job_created:jobs:j1');
    expect(dedupeKeyFor({ milestone: 'contacted', leadId: 'l1' })).toBe('contacted:leads:l1');
    expect(dedupeKeyFor({ milestone: 'lost' })).toBe('lost:leads:unknown');
  });
});

describe('toCents', () => {
  it('converts dollars once, at the boundary', () => {
    expect(toCents(1234.56)).toBe(123456);
    expect(toCents(0)).toBe(0);
  });

  it('keeps an ABSENT value null rather than turning it into zero', () => {
    // A milestone with no value must not become $0.00 — zero is a claim about money, null is an absence.
    expect(toCents(null)).toBeNull();
    expect(toCents(undefined)).toBeNull();
    expect(toCents(NaN)).toBeNull();
    expect(toCents(Infinity)).toBeNull();
  });

  it('rounds rather than truncating, so a half-cent does not vanish', () => {
    expect(toCents(0.005)).toBe(1);
    expect(toCents(19.999)).toBe(2000);
  });
});

describe('status and stage mapping — one definition, not a switch per caller', () => {
  it('maps the lead statuses that are milestones', () => {
    expect(milestoneForLeadStatus('contacted')).toBe('contacted');
    expect(milestoneForLeadStatus('quoted')).toBe('quoted');
    expect(milestoneForLeadStatus('accepted')).toBe('quote_accepted');
    expect(milestoneForLeadStatus('declined')).toBe('lost');
    expect(milestoneForLeadStatus('lost')).toBe('lost');
  });

  it('maps `new` to NOTHING', () => {
    // The enquiry milestone is written at INSERT. Mapping the status too would record it a second time
    // every time somebody reverted a lead to new.
    expect(milestoneForLeadStatus('new')).toBeNull();
  });

  it('maps job stages that are milestones and refuses the ones that are not', () => {
    expect(milestoneForJobStage('research')).toBe('research_started');
    expect(milestoneForJobStage('drawing')).toBe('fieldwork_complete');
    expect(milestoneForJobStage('delivery')).toBe('deliverables_sent');
    // `quote`, `on_hold` and `cancelled` are real stages that are NOT pipeline milestones. Forcing them
    // into the vocabulary would put states into the funnel that the funnel has no meaning for.
    for (const stage of ['quote', 'on_hold', 'cancelled', 'completed', 'nonsense']) {
      expect(milestoneForJobStage(stage), stage).toBeNull();
    }
  });

  it('every mapped value is a real milestone', () => {
    const mapped = [
      ...['contacted', 'quoted', 'accepted', 'declined', 'lost'].map(milestoneForLeadStatus),
      ...['research', 'drawing', 'delivery'].map(milestoneForJobStage),
    ].filter(Boolean);
    for (const m of mapped) expect(MILESTONES).toContain(m);
  });
});
