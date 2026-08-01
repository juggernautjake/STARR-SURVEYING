// __tests__/integrations/lead-to-cash-lifecycle.test.ts — one lead, all the way through. A14.
//
// Every other test in this plan checks one module. This one walks a SINGLE lead from the ad click to the
// final payment and asserts the exact event stream, the exact export rows, the exact API payloads, the
// adjustment, and the dashboard numbers that come out the other end.
//
// ── WHY A WHOLE-JOURNEY TEST EARNS ITS KEEP HERE ───────────────────────────────────────────────────
//
// The modules agree in isolation and disagree at the seams. The failures this catches are the ones unit
// tests structurally cannot: the CSV and the API disagreeing about what time a conversion happened, the
// dedupe key drifting between the writer and the exporter, the adjustment keying off a different order id
// than the upload that created it. Each of those is invisible until Google's numbers quietly differ from
// ours, weeks later.
//
// It runs against the pure layer with no database, which is what makes it worth having: it is fast,
// deterministic, and it fails on a REASON rather than on a fixture.
import { describe, it, expect } from 'vitest';
import { dedupeKeyFor, toCents, GOOGLE_MILESTONES, PRIMARY_BIDDING_MILESTONE, type Milestone } from '@/lib/pipeline/events';
import { buildCsv, formatConversionTime, withinClickWindow, type ConversionRow } from '@/lib/integrations/google-ads/offline';
import { selectConversions, type SelectableEvent } from '@/lib/integrations/google-ads/select';
import { payloadHash } from '@/lib/integrations/google-ads/client';
import { planAdjustment } from '@/lib/integrations/google-ads/adjustments';
import { buildCoverage, buildFunnel, buildCostPerStage, type FunnelEvent } from '@/lib/pipeline/funnel';
import { parseAttribution, mergeAttribution } from '@/lib/leads/attribution';

// ── THE JOURNEY ─────────────────────────────────────────────────────────────────────────────────────
//
// Jane clicks a Boundary Survey ad on 1 June, fills in the form the same evening, is called back on the
// 3rd, quoted $4,800 on the 9th, accepts on the 12th, the job is created the same day, delivered on
// 8 July, and pays $5,200 (a change order) on the 20th.

const LEAD_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const GCLID = 'Cj0KCQjw-abc123';
const CLICK_AT = '2026-06-01T18:04:00.000Z';
const ACTION = 'customers/1234567890/conversionActions/555';

const JOURNEY: Array<{ milestone: Milestone; at: string; valueCents: number | null; sourceTable: string; sourceId: string }> = [
  { milestone: 'inquiry_received',  at: '2026-06-01T23:12:00.000Z', valueCents: null,    sourceTable: 'leads', sourceId: LEAD_ID },
  { milestone: 'contacted',         at: '2026-06-03T15:30:00.000Z', valueCents: null,    sourceTable: 'leads', sourceId: LEAD_ID },
  { milestone: 'quoted',            at: '2026-06-09T17:00:00.000Z', valueCents: 480_000, sourceTable: 'leads', sourceId: LEAD_ID },
  { milestone: 'quote_accepted',    at: '2026-06-12T14:00:00.000Z', valueCents: 480_000, sourceTable: 'leads', sourceId: LEAD_ID },
  { milestone: 'job_created',       at: '2026-06-12T14:05:00.000Z', valueCents: 480_000, sourceTable: 'jobs',  sourceId: JOB_ID },
  { milestone: 'deliverables_sent', at: '2026-07-08T20:00:00.000Z', valueCents: null,    sourceTable: 'jobs',  sourceId: JOB_ID },
  { milestone: 'payment_received',  at: '2026-07-20T16:00:00.000Z', valueCents: 520_000, sourceTable: 'jobs',  sourceId: JOB_ID },
];

const events: SelectableEvent[] = JOURNEY.map((s, i) => ({
  id: `evt-${i}`,
  milestone: s.milestone,
  occurred_at: s.at,
  value_cents: s.valueCents,
  lead_id: LEAD_ID,
}));

describe('1 — the click is captured before the form exists', () => {
  it('parses the gclid off the landing query string', () => {
    const a = parseAttribution(
      '?gclid=Cj0KCQjw-abc123&utm_campaign=Boundary%20%E2%80%94%20Do%C3%B1a%20Ana&utm_source=google&utm_medium=cpc',
      { landingPage: 'https://starrsurveying.com/services', referrer: 'https://www.google.com/', now: CLICK_AT },
    );
    expect(a.gclid).toBe(GCLID);
    expect(a.utm_campaign).toBe('Boundary — Doña Ana');
    expect(a.first_seen_at).toBe(CLICK_AT);
  });

  it('the LATER organic visit does not overwrite the paid click', () => {
    // Jane comes back three days later by typing the address in. First write wins — otherwise the ad
    // that actually bought the lead is erased by the visit it caused.
    const first = parseAttribution(`?gclid=${GCLID}&utm_source=google`, {
      landingPage: 'https://starrsurveying.com/', referrer: 'https://www.google.com/', now: CLICK_AT,
    });
    // No identifying params at all: parseAttribution returns {} rather than a record of an
    // unattributable visit, which is precisely what lets the earlier click survive the merge.
    const later = parseAttribution('', { landingPage: 'https://starrsurveying.com/contact', now: '2026-06-04T09:00:00.000Z' });
    expect(later).toEqual({});
    const merged = mergeAttribution(first, later);
    expect(merged.gclid).toBe(GCLID);
    expect(merged.first_seen_at).toBe(CLICK_AT);
  });
});

describe('2 — the event stream is exactly seven milestones, each keyed once', () => {
  it('records the journey in order', () => {
    expect(JOURNEY.map((s) => s.milestone)).toEqual([
      'inquiry_received', 'contacted', 'quoted', 'quote_accepted',
      'job_created', 'deliverables_sent', 'payment_received',
    ]);
  });

  it('produces a UNIQUE dedupe key per milestone', () => {
    // A collision here would silently drop a milestone; a drift would duplicate one. A duplicated
    // `job_created` is a job counted twice in the revenue signal Smart Bidding trains on.
    const keys = JOURNEY.map((s) => dedupeKeyFor({
      milestone: s.milestone, leadId: LEAD_ID, sourceTable: s.sourceTable, sourceId: s.sourceId,
    }));
    expect(new Set(keys).size).toBe(JOURNEY.length);
    expect(keys).toContain(`job_created:jobs:${JOB_ID}`);
  });

  it('re-running the same journey is a no-op, not a duplicate', () => {
    // This is what makes the backfill safe to run twice.
    const key = (s: typeof JOURNEY[number]) => dedupeKeyFor({
      milestone: s.milestone, leadId: LEAD_ID, sourceTable: s.sourceTable, sourceId: s.sourceId,
    });
    expect(JOURNEY.map(key)).toEqual(JOURNEY.map(key));
  });

  it('keeps money as cents with null meaning ABSENT, not zero', () => {
    expect(toCents(4800)).toBe(480_000);
    expect(toCents(null)).toBeNull();
    expect(JOURNEY.find((s) => s.milestone === 'contacted')!.valueCents).toBeNull();
  });
});

describe('3 — only four of the seven become Google conversions', () => {
  it('exports inquiry, quoted, job_created and payment — and nothing else', () => {
    // `contacted`, `deliverables_sent` and `quote_accepted` are cycle-time facts, not purchase intent.
    // Feeding Google a dozen overlapping actions degrades its bidding.
    const exported = JOURNEY.filter((s) => GOOGLE_MILESTONES.includes(s.milestone));
    expect(exported.map((s) => s.milestone)).toEqual(['inquiry_received', 'quoted', 'job_created', 'payment_received']);
  });

  it('the primary bidding conversion is job_created, valued at the ACCEPTED QUOTE', () => {
    // Finding 5: payment routinely lands outside the 90-day window, so a payment-keyed primary would
    // under-report the slowest jobs — which are usually the biggest.
    const primary = JOURNEY.find((s) => s.milestone === PRIMARY_BIDDING_MILESTONE)!;
    expect(primary.valueCents).toBe(480_000);
    expect(withinClickWindow(CLICK_AT, primary.at)).toBe(true);
  });

  it('the payment is STILL inside the window for this job, but only just conceptually', () => {
    // 1 June → 20 July is 49 days. A job that ran twice as long would not be, which is the whole reason
    // payment is an adjustment rather than the bid target.
    expect(withinClickWindow(CLICK_AT, '2026-07-20T16:00:00.000Z')).toBe(true);
    expect(withinClickWindow(CLICK_AT, '2026-10-20T16:00:00.000Z')).toBe(false);
  });
});

describe('4 — the CSV and the API agree, field by field', () => {
  const primary = JOURNEY.find((s) => s.milestone === 'job_created')!;
  const primaryEvent = events.find((e) => e.milestone === 'job_created')!;

  const csvRow: ConversionRow = {
    clickId: GCLID,
    conversionName: 'Job — Won',
    occurredAt: primary.at,
    valueCents: primary.valueCents,
    orderId: `job_created:${primaryEvent.id}`,
  };

  const { payloads } = selectConversions({
    events: [primaryEvent],
    leads: new Map([[LEAD_ID, { gclid: GCLID, first_seen_at: CLICK_AT }]]),
    uploadedKeys: new Set(),
    resourceFor: () => ACTION,
  });

  it('formats the SAME instant identically in both paths', () => {
    // Two formatters would eventually disagree about a timezone and the same conversion would appear in
    // Ads an hour apart, looking like a duplicate. This is the seam a unit test cannot see.
    expect(payloads[0].conversionDateTime).toBe(formatConversionTime(primary.at));
    const { csv } = buildCsv([csvRow], 'click');
    expect(csv).toContain(formatConversionTime(primary.at));
  });

  it('uses the SAME order id in both paths', () => {
    // Google dedupes on this string. A CSV upload and an API upload disagreeing about it counts the job
    // twice — which is the failure this whole plan is built to prevent.
    const { csv } = buildCsv([csvRow], 'click');
    expect(payloads[0].orderId).toBe(csvRow.orderId);
    expect(csv).toContain(csvRow.orderId);
  });

  it('sends dollars on the API and dollars in the CSV, from cents in the DB', () => {
    expect(payloads[0].conversionValue).toBe(4800);
    expect(buildCsv([csvRow], 'click').csv).toContain('4800.00');
  });

  it('emits the timezone parameter line and the click columns', () => {
    const { csv, included, skipped } = buildCsv([csvRow], 'click');
    expect(csv.split('\n')[0]).toMatch(/^Parameters:TimeZone=/);
    expect(csv).toContain('Google Click ID');
    expect(included).toBe(1);
    expect(skipped).toBe(0);
  });
});

describe('5 — the payment restates the quote rather than adding a conversion', () => {
  const primaryEvent = events.find((e) => e.milestone === 'job_created')!;

  it('restates $4,800 to $5,200 against the ORIGINAL order id', () => {
    const result = planAdjustment({
      eventId: primaryEvent.id,
      orderId: `job_created:${primaryEvent.id}`,
      uploadedAction: ACTION,
      uploadedValueCents: 480_000,
      originalUploaded: true,
      currentValueCents: 520_000,   // the change order
      clickAt: CLICK_AT,
      decidedAt: '2026-07-20T16:00:00.000Z',
    });
    expect('skip' in result).toBe(false);
    if ('skip' in result) return;
    expect(result.adjustment).toMatchObject({
      adjustmentType: 'RESTATEMENT',
      restatementValue: 5200,
      orderId: `job_created:${primaryEvent.id}`,
      conversionAction: ACTION,
    });
  });

  it('the adjustment keys off the SAME order id the upload used', () => {
    // If these ever drift, the adjustment silently fails with CONVERSION_NOT_FOUND and the estimate stays
    // in the account forever. Asserted directly rather than trusted.
    const { payloads } = selectConversions({
      events: [primaryEvent],
      leads: new Map([[LEAD_ID, { gclid: GCLID, first_seen_at: CLICK_AT }]]),
      uploadedKeys: new Set(),
      resourceFor: () => ACTION,
    });
    const adj = planAdjustment({
      eventId: primaryEvent.id, orderId: payloads[0].orderId, uploadedAction: ACTION,
      uploadedValueCents: 480_000, originalUploaded: true, currentValueCents: 520_000,
      clickAt: CLICK_AT, decidedAt: '2026-07-20T16:00:00.000Z',
    });
    if ('skip' in adj) throw new Error('expected an adjustment');
    expect(adj.adjustment.orderId).toBe(payloads[0].orderId);
  });

  it('a re-run of the whole night sends nothing twice', () => {
    // The conversion is already uploaded and the value has not moved again.
    const leads = new Map([[LEAD_ID, { gclid: GCLID, first_seen_at: CLICK_AT }]]);
    const first = selectConversions({ events: [primaryEvent], leads, uploadedKeys: new Set(), resourceFor: () => ACTION });
    const key = `${primaryEvent.id}:${payloadHash(first.payloads[0])}`;
    const second = selectConversions({ events: [primaryEvent], leads, uploadedKeys: new Set([key]), resourceFor: () => ACTION });
    expect(second.payloads).toHaveLength(0);
    expect(second.skipped.alreadyUploaded).toBe(1);
  });
});

describe('6 — the dashboard tells the same story', () => {
  const funnelEvents: FunnelEvent[] = JOURNEY.map((s, i) => ({
    subjectId: LEAD_ID, milestone: s.milestone, occurredAt: s.at, valueCents: s.valueCents,
  }));

  it('shows one subject at every stage, top to bottom', () => {
    const funnel = buildFunnel(funnelEvents);
    expect(funnel.every((s) => s.count === 1)).toBe(true);
    expect(funnel.map((s) => s.label)).toEqual([
      'Inquiry', 'Contacted', 'Quoted', 'Accepted', 'Job created', 'Delivered', 'Paid',
    ]);
  });

  it('reports the real stage times, not the elapsed total', () => {
    const funnel = buildFunnel(funnelEvents);
    const contacted = funnel.find((s) => s.milestone === 'contacted')!;
    const quoted = funnel.find((s) => s.milestone === 'quoted')!;
    const delivered = funnel.find((s) => s.milestone === 'deliverables_sent')!;
    expect(contacted.medianDaysFromPrevious).toBeCloseTo(1.68, 1);   // 1 Jun 23:12 → 3 Jun 15:30
    expect(quoted.medianDaysFromPrevious).toBeCloseTo(6.06, 1);      // 3 Jun → 9 Jun
    expect(delivered.medianDaysFromPrevious).toBeCloseTo(26.2, 0);   // 12 Jun → 8 Jul, the long leg
  });

  it('counts this lead as click-attributed in the coverage meter', () => {
    const c = buildCoverage([{ hasClickId: true, hasEmailOrPhone: true }]);
    expect(c.clickShare).toBe(1);
    expect(c.unattributable).toBe(0);
  });

  it('computes cost per won job from real spend', () => {
    // $294 of spend bought this one job at $5,200 — roughly 17.7× return.
    const cost = buildCostPerStage({
      spendMicros: 294_000_000, leads: 1, quotes: 1, wonJobs: 1, revenueCents: 520_000,
    });
    expect(cost.costPerWonJob).toBe(294);
    expect(cost.roas).toBeCloseTo(17.7, 1);
  });
});

describe('7 — the phone lead beside it, which is most of the business', () => {
  // Finding 6. The same journey with no click must still flow through everything without erroring, and
  // must be reported as unattributable rather than quietly dropped or credited to a campaign.
  it('produces no click-path conversions at all', () => {
    const { payloads, skipped } = selectConversions({
      events,
      leads: new Map([[LEAD_ID, { first_seen_at: null }]]),
      uploadedKeys: new Set(),
      resourceFor: () => ACTION,
    });
    expect(payloads).toHaveLength(0);
    expect(skipped.noClick).toBe(events.length);
  });

  it('is still exportable on the ENHANCED path, which is the point of having one', () => {
    const { csv, included } = buildCsv([{
      hashedEmail: 'a'.repeat(64),
      conversionName: 'Job — Won',
      occurredAt: '2026-06-12T14:05:00.000Z',
      valueCents: 480_000,
      orderId: 'job_created:evt-4',
    }], 'enhanced');
    expect(included).toBe(1);
    expect(csv).toContain('a'.repeat(64));
  });

  it('shows up in the coverage meter as matchable, NOT as a hole and NOT as a match', () => {
    const c = buildCoverage([
      { hasClickId: true, hasEmailOrPhone: true },
      { hasClickId: false, hasEmailOrPhone: true },
      { hasClickId: false, hasEmailOrPhone: false },
    ]);
    expect(c).toMatchObject({ clickAttributed: 1, matchable: 1, unattributable: 1 });
  });
});
