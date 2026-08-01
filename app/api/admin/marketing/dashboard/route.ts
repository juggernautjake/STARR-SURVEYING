// app/api/admin/marketing/dashboard/route.ts — the numbers behind /admin/marketing. A12.
//
// GET ?from=&to=&slice=campaign|source|survey_type|county
//
// Everything A1–A11 built exists to make this honest. The arithmetic lives in `lib/pipeline/funnel.ts`,
// pure and tested; this route is the query layer and nothing else.
//
// ── THE SUBJECT OF THE FUNNEL IS THE LEAD, FALLING BACK TO THE JOB ─────────────────────────────────
//
// Most jobs come from a lead, but not all — legacy and walk-in jobs exist with no lead row at all. Keying
// the funnel purely on `lead_id` would drop those jobs entirely and make the won-job count smaller than
// the truth, which flatters cost-per-job. So the subject is `lead_id ?? job_id`.
//
// ── COVERAGE IS COMPUTED OVER LEADS IN RANGE, NOT OVER EVENTS ──────────────────────────────────────
//
// A lead with eight milestones would otherwise count eight times, and a lead that inquired and vanished
// once — so the busiest leads would dominate the coverage figure, which is exactly backwards: the ones
// that went nowhere are the ones attribution most needs to explain.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  buildCostPerStage, buildCoverage, buildFunnel, buildRepeatStats, funnelIsMonotonic,
  type CustomerJob, type FunnelEvent,
} from '@/lib/pipeline/funnel';
import type { Milestone } from '@/lib/pipeline/events';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// A13 adds `how_heard` — the self-reported dimension. It is the only one that says anything about the
// phone and referral leads, which at this business are the majority.
const SLICES = ['campaign', 'source', 'survey_type', 'county', 'how_heard'] as const;
type Slice = (typeof SLICES)[number];

interface EventRow {
  id: string; milestone: Milestone; occurred_at: string; value_cents: number | null;
  lead_id: string | null; job_id: string | null;
}
interface LeadRow {
  id: string; gclid: string | null; gbraid: string | null; wbraid: string | null;
  email: string | null; phone: string | null; source: string | null;
  utm_campaign: string | null; survey_type: string | null; how_heard: string | null;
}
interface JobRow {
  id: string; customer_id: string | null; created_at: string;
  final_amount: number | null; quote_amount: number | null;
  survey_type: string | null; county: string | null; origin_lead_id: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const sliceParam = url.searchParams.get('slice');
  const slice: Slice = (SLICES as readonly string[]).includes(sliceParam ?? '') ? sliceParam as Slice : 'campaign';

  // Default to the last 90 days — the click window, which is the natural period for anything
  // ad-attributed to be comparable in.
  const to = toParam && DATE_RE.test(toParam) ? toParam : new Date().toISOString().slice(0, 10);
  const from = fromParam && DATE_RE.test(fromParam)
    ? fromParam
    : new Date(Date.parse(`${to}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);

  const fromIso = `${from}T00:00:00.000Z`;
  const toIso = `${to}T23:59:59.999Z`;

  const [{ data: eventData }, { data: leadData }, { data: jobData }, { data: spendData }] = await Promise.all([
    supabaseAdmin.from('lead_lifecycle_events')
      .select('id, milestone, occurred_at, value_cents, lead_id, job_id')
      .gte('occurred_at', fromIso).lte('occurred_at', toIso)
      .order('occurred_at', { ascending: true }).limit(5000),
    supabaseAdmin.from('leads')
      .select('id, gclid, gbraid, wbraid, email, phone, source, utm_campaign, survey_type, how_heard')
      .gte('created_at', fromIso).lte('created_at', toIso).limit(5000),
    supabaseAdmin.from('jobs')
      .select('id, customer_id, created_at, final_amount, quote_amount, survey_type, county, origin_lead_id')
      .gte('created_at', fromIso).lte('created_at', toIso)
      .is('deleted_at', null).limit(5000),
    supabaseAdmin.from('ad_spend_daily')
      .select('spend_date, platform, campaign_name, cost_micros, source, clicks')
      .gte('spend_date', from).lte('spend_date', to).limit(2000),
  ]);

  const events = (eventData ?? []) as EventRow[];
  const leads = (leadData ?? []) as LeadRow[];
  const jobs = (jobData ?? []) as JobRow[];
  const spend = (spendData ?? []) as Array<{ cost_micros: number; source: string; clicks: number; campaign_name: string | null }>;

  // See the header — lead first, job as the fallback so lead-less jobs are not silently dropped.
  const funnelEvents: FunnelEvent[] = events
    .map((e) => ({
      subjectId: e.lead_id ?? e.job_id ?? '',
      milestone: e.milestone, occurredAt: e.occurred_at, valueCents: e.value_cents,
    }))
    .filter((e) => e.subjectId);

  const funnel = buildFunnel(funnelEvents);

  const coverage = buildCoverage(leads.map((l) => ({
    hasClickId: Boolean(l.gclid || l.gbraid || l.wbraid),
    hasEmailOrPhone: Boolean(l.email || l.phone),
  })));

  const spendMicros = spend.reduce((s, r) => s + Number(r.cost_micros ?? 0), 0);
  const manualMicros = spend.filter((r) => r.source === 'manual').reduce((s, r) => s + Number(r.cost_micros ?? 0), 0);

  const stageCount = (m: Milestone) => funnel.find((s) => s.milestone === m)?.count ?? 0;
  // Revenue is the invoice where one exists, the quote otherwise — the same rule A9 restates on.
  const revenueCents = jobs.reduce((s, j) => s + Math.round(((j.final_amount ?? j.quote_amount ?? 0) as number) * 100), 0);

  const cost = buildCostPerStage({
    spendMicros,
    leads: stageCount('inquiry_received'),
    quotes: stageCount('quoted'),
    wonJobs: stageCount('job_created'),
    revenueCents,
  });

  // ── The slice. Campaign comes from the lead's utm_campaign; county and survey type from the job. ──
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const sliceKeyFor = (j: JobRow): string => {
    const lead = j.origin_lead_id ? leadById.get(j.origin_lead_id) : undefined;
    switch (slice) {
      case 'campaign': return lead?.utm_campaign || '(no campaign)';
      case 'source': return lead?.source || '(unknown)';
      case 'survey_type': return j.survey_type || lead?.survey_type || '(unspecified)';
      case 'county': return j.county || '(unknown)';
      // '(not asked)' rather than '(unknown)': a blank here means the customer skipped the dropdown or
      // never saw the form at all, which is a different fact from a missing county.
      case 'how_heard': return lead?.how_heard || '(not asked)';
    }
  };

  const sliceTotals = new Map<string, { jobs: number; revenue: number }>();
  for (const j of jobs) {
    const key = sliceKeyFor(j);
    const entry = sliceTotals.get(key) ?? { jobs: 0, revenue: 0 };
    entry.jobs += 1;
    entry.revenue += ((j.final_amount ?? j.quote_amount ?? 0) as number);
    sliceTotals.set(key, entry);
  }

  // ── Repeat customers. Only jobs with a customer can be attributed to one. ──
  const repeatJobs: CustomerJob[] = jobs
    .filter((j) => j.customer_id)
    .map((j) => ({
      customerId: j.customer_id as string,
      jobId: j.id,
      createdAt: j.created_at,
      valueCents: Math.round(((j.final_amount ?? j.quote_amount ?? 0) as number) * 100),
      originCampaign: j.origin_lead_id ? leadById.get(j.origin_lead_id)?.utm_campaign ?? null : null,
    }));

  return NextResponse.json({
    range: { from, to },
    funnel,
    // Surfaced rather than assumed. If this is ever false the funnel is lying about something and the
    // page should say so instead of drawing a confident graph.
    funnelMonotonic: funnelIsMonotonic(funnel),
    coverage,
    cost,
    spend: {
      micros: spendMicros,
      manualMicros,
      manualShare: spendMicros > 0 ? manualMicros / spendMicros : 0,
      clicks: spend.reduce((s, r) => s + Number(r.clicks ?? 0), 0),
    },
    slice: {
      by: slice,
      rows: [...sliceTotals.entries()]
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 25),
    },
    repeat: buildRepeatStats(repeatJobs),
    counts: { events: events.length, leads: leads.length, jobs: jobs.length },
  });
}, { routeName: 'admin/marketing/dashboard' });
