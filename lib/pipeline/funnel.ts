// lib/pipeline/funnel.ts — the funnel, the stage times, and the honesty meter. A12.
//
// Everything A1–A11 built exists to make one page honest. These are the pure functions behind it, split
// out because each encodes a judgement that is easy to get wrong in a way that produces a *believable*
// number — and a believable wrong number on a dashboard is acted on.
//
// ── 1. THE FUNNEL COUNTS "REACHED", NOT "IS AT" ────────────────────────────────────────────────────
//
// A lead that has been paid still inquired. Counting by CURRENT status undercounts every earlier stage —
// the further down the funnel someone gets, the more of the top of the funnel disappears — and the graph
// comes out roughly flat, which reads as "we convert almost everyone".
//
// So counts come from A4's EVENT STREAM: a lead is counted at every stage it ever reached, whether or not
// it is still there. That is what makes the funnel monotonically non-increasing, which is also the check.
//
// ── 2. MEDIAN, NOT MEAN ────────────────────────────────────────────────────────────────────────────
//
// The owner asked for the life cycle of a job. One boundary dispute that sat in legal for 400 days moves
// a mean far more than it moves reality; the median says what a typical job does. The plan says median
// and it is right.
//
// ── 3. A RATE WITH NO DENOMINATOR IS NOT ZERO ──────────────────────────────────────────────────────
//
// Zero leads is not a 0% conversion rate. Every rate here returns `null` rather than 0 when there is
// nothing to divide by, and the page prints "—". A rendered 0% invites the conclusion that something is
// broken when the real answer is "no data yet".

import { MILESTONES, type Milestone } from './events';

/** The funnel as the owner describes it, in order. `lost` is not a stage — it is an exit. */
export const FUNNEL_STAGES: readonly Milestone[] = [
  'inquiry_received',
  'contacted',
  'quoted',
  'quote_accepted',
  'job_created',
  'deliverables_sent',
  'payment_received',
];

export const STAGE_LABELS: Record<string, string> = {
  inquiry_received: 'Inquiry',
  contacted: 'Contacted',
  quoted: 'Quoted',
  quote_accepted: 'Accepted',
  job_created: 'Job created',
  research_started: 'Research',
  fieldwork_complete: 'Fieldwork done',
  deliverables_sent: 'Delivered',
  payment_received: 'Paid',
  lost: 'Lost',
};

export interface FunnelEvent {
  /** The thing moving through the funnel. A lead id, or a job id for jobs with no lead. */
  subjectId: string;
  milestone: Milestone;
  occurredAt: string;
  valueCents?: number | null;
}

export interface FunnelStage {
  milestone: Milestone;
  label: string;
  /** Subjects that EVER reached this stage. */
  count: number;
  /** Share of the stage above. Null when that stage had nobody — see judgement 3. */
  stepRate: number | null;
  /** Share of the top of the funnel. Null for the same reason. */
  overallRate: number | null;
  /** Median days from the PREVIOUS stage to this one, over subjects that did both. */
  medianDaysFromPrevious: number | null;
  /** How many subjects contributed to that median. A median of one job is not a median. */
  medianSampleSize: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The middle value. Even counts average the two middles, which is the ordinary definition. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A ratio, or null when the denominator is zero. See judgement 3 — this is not a rounding nicety. */
export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * First time each subject reached each milestone.
 *
 * FIRST, not last: a lead re-quoted three times reached "quoted" once, on the first occasion. Taking the
 * latest would stretch every downstream stage time by however long the back-and-forth ran.
 */
export function firstReached(events: FunnelEvent[]): Map<string, Map<Milestone, number>> {
  const bySubject = new Map<string, Map<Milestone, number>>();
  for (const e of events) {
    const at = Date.parse(e.occurredAt);
    if (Number.isNaN(at)) continue;
    let stages = bySubject.get(e.subjectId);
    if (!stages) { stages = new Map(); bySubject.set(e.subjectId, stages); }
    const existing = stages.get(e.milestone);
    if (existing === undefined || at < existing) stages.set(e.milestone, at);
  }
  return bySubject;
}

export function buildFunnel(events: FunnelEvent[], stages: readonly Milestone[] = FUNNEL_STAGES): FunnelStage[] {
  const bySubject = firstReached(events);
  const out: FunnelStage[] = [];
  let previousCount: number | null = null;
  let topCount = 0;

  for (let i = 0; i < stages.length; i += 1) {
    const milestone = stages[i];
    const reached = [...bySubject.values()].filter((s) => s.has(milestone));
    const count = reached.length;
    if (i === 0) topCount = count;

    // Stage time is measured only over subjects that reached BOTH ends. Treating a missing previous
    // stage as zero days would report instant progress for leads that skipped a step entirely.
    let gaps: number[] = [];
    if (i > 0) {
      const previous = stages[i - 1];
      gaps = [...bySubject.values()]
        .filter((s) => s.has(previous) && s.has(milestone))
        .map((s) => (s.get(milestone)! - s.get(previous)!) / DAY_MS)
        // A negative gap means the events arrived out of order — a backfill, or a stage recorded late.
        // Averaging it in would silently shorten the reported cycle.
        .filter((d) => d >= 0);
    }

    out.push({
      milestone,
      label: STAGE_LABELS[milestone] ?? milestone,
      count,
      stepRate: i === 0 ? null : rate(count, previousCount ?? 0),
      overallRate: i === 0 ? null : rate(count, topCount),
      medianDaysFromPrevious: median(gaps),
      medianSampleSize: gaps.length,
    });
    previousCount = count;
  }

  return out;
}

// ── ATTRIBUTION COVERAGE ────────────────────────────────────────────────────────────────────────────

export interface CoverageInput {
  hasClickId: boolean;
  hasEmailOrPhone: boolean;
}

export interface Coverage {
  total: number;
  /** A real ad click. The only leads Google can match precisely. */
  clickAttributed: number;
  /** No click, but enough identity for Enhanced Conversions to *maybe* match. */
  matchable: number;
  /** Neither. Invisible to Google forever. */
  unattributable: number;
  clickShare: number | null;
  matchableShare: number | null;
  unattributableShare: number | null;
}

/**
 * The meter that qualifies every other number on the page.
 *
 * Finding 6: at this business most inquiries arrive by phone and have no click to key on, so this will
 * not be 100% and it must not be presented as if it could be. The three buckets are genuinely different:
 * a click is a match, an email is a *chance* of a match, and neither is a permanent hole.
 */
export function buildCoverage(leads: CoverageInput[]): Coverage {
  const total = leads.length;
  const clickAttributed = leads.filter((l) => l.hasClickId).length;
  const matchable = leads.filter((l) => !l.hasClickId && l.hasEmailOrPhone).length;
  const unattributable = total - clickAttributed - matchable;
  return {
    total, clickAttributed, matchable, unattributable,
    clickShare: rate(clickAttributed, total),
    matchableShare: rate(matchable, total),
    unattributableShare: rate(unattributable, total),
  };
}

// ── COST PER STAGE ──────────────────────────────────────────────────────────────────────────────────

export interface CostInput {
  spendMicros: number;
  leads: number;
  quotes: number;
  wonJobs: number;
  revenueCents: number;
}

export interface CostPerStage {
  spend: number;
  costPerLead: number | null;
  costPerQuote: number | null;
  costPerWonJob: number | null;
  /** Revenue ÷ spend. Null with no spend — infinite ROAS is not a number anyone can use. */
  roas: number | null;
  revenue: number;
}

export function buildCostPerStage(input: CostInput): CostPerStage {
  const spend = input.spendMicros / 1_000_000;
  const revenue = input.revenueCents / 100;
  return {
    spend,
    revenue,
    costPerLead: input.leads > 0 ? spend / input.leads : null,
    costPerQuote: input.quotes > 0 ? spend / input.quotes : null,
    costPerWonJob: input.wonJobs > 0 ? spend / input.wonJobs : null,
    // Zero spend with revenue is not infinite return — it means these jobs were not bought with ads, and
    // a ROAS figure would be attributing organic work to a campaign.
    roas: spend > 0 ? revenue / spend : null,
  };
}

// ── REPEAT CUSTOMERS ────────────────────────────────────────────────────────────────────────────────

export interface CustomerJob {
  customerId: string;
  jobId: string;
  createdAt: string;
  valueCents: number | null;
  /** The campaign that bought the customer ORIGINALLY, if known. */
  originCampaign?: string | null;
}

export interface RepeatStats {
  customers: number;
  repeatCustomers: number;
  repeatRate: number | null;
  /** Median lifetime value across all customers, in dollars. Median for the same reason as stage times. */
  medianLifetimeValue: number | null;
  medianJobsPerCustomer: number | null;
  medianMonthsBetweenJobs: number | null;
  /** Campaign → repeat customers it originally bought. A second job arriving direct was still bought. */
  repeatsByOriginCampaign: Array<{ campaign: string; customers: number; revenue: number }>;
}

export function buildRepeatStats(jobs: CustomerJob[]): RepeatStats {
  const byCustomer = new Map<string, CustomerJob[]>();
  for (const j of jobs) {
    const list = byCustomer.get(j.customerId);
    if (list) list.push(j); else byCustomer.set(j.customerId, [j]);
  }

  const lifetimeValues: number[] = [];
  const jobCounts: number[] = [];
  const gapsMonths: number[] = [];
  const campaignTotals = new Map<string, { customers: number; revenue: number }>();
  let repeatCustomers = 0;

  for (const list of byCustomer.values()) {
    const sorted = [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const total = sorted.reduce((s, j) => s + (j.valueCents ?? 0), 0);
    lifetimeValues.push(total / 100);
    jobCounts.push(sorted.length);

    if (sorted.length > 1) {
      repeatCustomers += 1;
      for (let i = 1; i < sorted.length; i += 1) {
        const gap = (Date.parse(sorted[i].createdAt) - Date.parse(sorted[i - 1].createdAt)) / DAY_MS;
        if (Number.isFinite(gap) && gap >= 0) gapsMonths.push(gap / 30.44);
      }
      // The FIRST job's campaign is the one that bought this customer. Crediting the second job's source
      // — usually "direct" — would show repeat business appearing from nowhere.
      const campaign = sorted[0].originCampaign;
      if (campaign) {
        const entry = campaignTotals.get(campaign) ?? { customers: 0, revenue: 0 };
        entry.customers += 1;
        entry.revenue += total / 100;
        campaignTotals.set(campaign, entry);
      }
    }
  }

  return {
    customers: byCustomer.size,
    repeatCustomers,
    repeatRate: rate(repeatCustomers, byCustomer.size),
    medianLifetimeValue: median(lifetimeValues),
    medianJobsPerCustomer: median(jobCounts),
    medianMonthsBetweenJobs: median(gapsMonths),
    repeatsByOriginCampaign: [...campaignTotals.entries()]
      .map(([campaign, v]) => ({ campaign, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
  };
}

/** Guard: the funnel must never widen going down. Exported so the API can assert on real data. */
export function funnelIsMonotonic(stages: FunnelStage[]): boolean {
  for (let i = 1; i < stages.length; i += 1) {
    if (stages[i].count > stages[i - 1].count) return false;
  }
  return true;
}

/** Every milestone the funnel does NOT show, so nothing is silently dropped from the vocabulary. */
export const NON_FUNNEL_MILESTONES: readonly Milestone[] =
  MILESTONES.filter((m) => !FUNNEL_STAGES.includes(m));
