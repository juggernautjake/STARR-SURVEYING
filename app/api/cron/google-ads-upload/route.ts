// app/api/cron/google-ads-upload/route.ts — push offline conversions to Google Ads nightly. A8 + A9.
//
// Auth: `Authorization: Bearer <CRON_SECRET>`, the same as every other cron here.
//
// **Inert until credentials exist.** With no developer token or no connected account this returns a clear
// `skipped` with the reason, and returns 200 — because a cron that 500s every night for a feature nobody
// has turned on is a cron whose alerts get muted, and then its real failures are muted too.
//
// ── TWO PHASES, AND THE SECOND RUNS EVEN WHEN THE FIRST HAS NOTHING TO DO ───────────────────────────
//
//   1. **New conversions** (A8) — lifecycle milestones that have not been uploaded.
//   2. **Adjustments** (A9) — jobs whose real invoice differs from the quote we already reported, and
//      cancelled jobs that must be retracted.
//
// The ordering matters and so does the independence: on a quiet night there are no new conversions but
// there may well be a job that just invoiced. An early return after phase 1 would mean the busiest
// pipeline gets its numbers corrected and a quiet one never does.
//
// ── WHY IT LOGS EVERY ROW ───────────────────────────────────────────────────────────────────────────
//
// A partial failure arrives inside an HTTP 200. Without a per-row log, a rejection is indistinguishable
// from success until someone notices, weeks later, that the numbers in Ads are lower than ours — with
// nothing to inspect. The plan's phrasing is the right one: a silent failed upload is worse than no
// upload, because no upload is a gap you can see.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  CREDENTIAL_HELP, credentialProblem, payloadHash, uploadClickConversions, uploadConversionAdjustments,
} from '@/lib/integrations/google-ads/client';
import { selectConversions, type SelectableEvent, type SelectableLead } from '@/lib/integrations/google-ads/select';
import { planAdjustments, windowSkipMetadata, WINDOW_SKIP_KEY, type AdjustmentInput } from '@/lib/integrations/google-ads/adjustments';
import { GOOGLE_MILESTONES, PRIMARY_BIDDING_MILESTONE, toCents, type Milestone } from '@/lib/pipeline/events';

/** Ads conversion-action RESOURCE NAMES (`customers/<id>/conversionActions/<id>`), from env.
 *  Resource names, not display names — the API takes the former; only the CSV takes the latter. */
function actionResourceFor(milestone: Milestone): string | null {
  const map: Partial<Record<Milestone, string | undefined>> = {
    inquiry_received: process.env.GOOGLE_ADS_RESOURCE_INQUIRY,
    quoted: process.env.GOOGLE_ADS_RESOURCE_QUOTED,
    job_created: process.env.GOOGLE_ADS_RESOURCE_JOB_WON,
    payment_received: process.env.GOOGLE_ADS_RESOURCE_JOB_PAID,
  };
  return map[milestone] ?? null;
}

/** How far back to look. Generous enough to catch up after an outage, bounded so a first run does not try
 *  to upload the entire history — most of which is `pre_attribution` and unuploadable anyway. */
const LOOKBACK_DAYS = 30;

/** Adjustments look further back on purpose: the whole point is a job that invoiced LONG after the quote
 *  was reported. 30 days would miss exactly the jobs this phase exists for. */
const ADJUSTMENT_LOOKBACK_DAYS = 120;

interface LogRow { event_id: string; payload_hash: string }

export const GET = withErrorHandler(async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/google-ads-upload] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Not configured is a normal state right now, not an error. See the header.
  const problem = credentialProblem();
  if (problem) {
    return NextResponse.json({ skipped: true, reason: problem, detail: CREDENTIAL_HELP[problem] });
  }

  const now = new Date().toISOString();
  const conversions = await uploadNewConversions(now);
  const adjustments = await uploadAdjustments(now);

  const fatal = conversions.fatal ?? adjustments.fatal ?? null;
  await supabaseAdmin
    .from('google_ads_connections')
    .update({
      // Only stamp a successful upload; a night where everything failed must not look like a healthy one.
      ...(conversions.uploaded || adjustments.uploaded ? { last_uploaded_at: now } : {}),
      last_error: fatal, updated_at: now,
    })
    .not('customer_id', 'is', null);

  return NextResponse.json({ conversions, adjustments, fatal });
}, { routeName: 'cron/google-ads-upload' });

// ── PHASE 1: new conversions ────────────────────────────────────────────────────────────────────────

async function uploadNewConversions(now: string) {
  const since = new Date(Date.parse(now) - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: events, error } = await supabaseAdmin
    .from('lead_lifecycle_events')
    .select('id, milestone, occurred_at, value_cents, lead_id')
    .in('milestone', GOOGLE_MILESTONES as unknown as string[])
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: true })
    .limit(500);

  const empty = { attempted: 0, uploaded: 0, failed: 0, fatal: null as string | null,
    skipped: { noAction: 0, noClick: 0, outOfWindow: 0, alreadyUploaded: 0 } };
  if (error) return { ...empty, fatal: error.message };

  const rows = (events ?? []) as SelectableEvent[];
  if (!rows.length) return empty;

  // Already uploaded? The log is the record, not a flag on the event — an event can legitimately be
  // uploaded once and then adjusted, and a boolean cannot express that.
  const { data: logged } = await supabaseAdmin
    .from('conversion_upload_log')
    .select('event_id, payload_hash')
    .eq('kind', 'conversion')
    .eq('status', 'uploaded')
    .in('event_id', rows.map((r) => r.id));
  const uploadedKeys = new Set(((logged ?? []) as LogRow[]).map((l) => `${l.event_id}:${l.payload_hash}`));

  // Click ids live on the lead.
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))] as string[];
  const leads = new Map<string, SelectableLead>();
  if (leadIds.length) {
    const { data } = await supabaseAdmin
      .from('leads').select('id, gclid, gbraid, wbraid, first_seen_at').in('id', leadIds);
    for (const l of (data ?? []) as Array<SelectableLead & { id: string }>) leads.set(l.id, l);
  }

  // The decision lives in `select.ts` — see that module for why each skip reason is counted separately.
  const { payloads, eventIds, skipped } = selectConversions({
    events: rows, leads, uploadedKeys, resourceFor: actionResourceFor,
  });
  if (!payloads.length) return { ...empty, skipped };

  const outcome = await uploadClickConversions(payloads);

  // One log row per attempt, with Google's own text. Written whatever happened — including the fatal
  // case, because "we tried and the whole request failed" is exactly the state that otherwise leaves no
  // trace at all.
  const failureByIndex = new Map(outcome.failures.map((f) => [f.index, f]));
  for (let i = 0; i < payloads.length; i += 1) {
    const failure = failureByIndex.get(i);
    const failed = Boolean(failure) || Boolean(outcome.fatal);
    await supabaseAdmin.from('conversion_upload_log').insert({
      event_id: eventIds[i],
      kind: 'conversion',
      conversion_action: payloads[i].conversionAction,
      payload_hash: payloadHash(payloads[i]),
      status: failed ? 'failed' : 'uploaded',
      error_code: failure?.code ?? (outcome.fatal ? 'REQUEST_FAILED' : null),
      error_detail: failure?.message ?? outcome.fatal ?? null,
      attempts: 1,
      uploaded_at: failed ? null : now,
    });
  }

  return {
    attempted: outcome.attempted, uploaded: outcome.uploaded,
    failed: outcome.failures.length, fatal: outcome.fatal ?? null, skipped,
  };
}

// ── PHASE 2: adjustments ────────────────────────────────────────────────────────────────────────────

interface PrimaryEventRow {
  id: string; occurred_at: string; value_cents: number | null; job_id: string | null; lead_id: string | null;
}

async function uploadAdjustments(now: string) {
  const empty = { attempted: 0, uploaded: 0, failed: 0, fatal: null as string | null,
    skipped: {} as Record<string, number>, windowSkips: 0 };

  const action = actionResourceFor(PRIMARY_BIDDING_MILESTONE);
  // Only the primary bidding conversion is adjusted. The others are observation actions; restating an
  // observation nobody bids on is work with no consequence.
  if (!action) return empty;

  const since = new Date(Date.parse(now) - ADJUSTMENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: events, error } = await supabaseAdmin
    .from('lead_lifecycle_events')
    .select('id, occurred_at, value_cents, job_id, lead_id')
    .eq('milestone', PRIMARY_BIDDING_MILESTONE)
    .gte('occurred_at', since)
    .not('job_id', 'is', null)
    .limit(500);
  if (error) return { ...empty, fatal: error.message };

  const rows = (events ?? []) as PrimaryEventRow[];
  if (!rows.length) return empty;

  // Only conversions Google ACCEPTED can be adjusted — see `adjustments.ts` on CONVERSION_NOT_FOUND.
  const { data: logged } = await supabaseAdmin
    .from('conversion_upload_log')
    .select('event_id, payload_hash, kind, status')
    .in('event_id', rows.map((r) => r.id))
    .eq('status', 'uploaded');
  const log = (logged ?? []) as Array<LogRow & { kind: string }>;
  const uploadedEvents = new Set(log.filter((l) => l.kind === 'conversion').map((l) => l.event_id));
  const sentAdjustments = new Set(log.filter((l) => l.kind === 'adjustment').map((l) => `${l.event_id}:${l.payload_hash}`));

  const jobIds = [...new Set(rows.map((r) => r.job_id).filter(Boolean))] as string[];
  const { data: jobRows } = await supabaseAdmin
    .from('jobs').select('id, quote_amount, final_amount, stage').in('id', jobIds);
  const jobs = new Map(((jobRows ?? []) as Array<{ id: string; quote_amount: number | null; final_amount: number | null; stage: string | null }>)
    .map((j) => [j.id, j]));

  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))] as string[];
  const clickAt = new Map<string, string | null>();
  if (leadIds.length) {
    const { data } = await supabaseAdmin.from('leads').select('id, first_seen_at').in('id', leadIds);
    for (const l of (data ?? []) as Array<{ id: string; first_seen_at: string | null }>) clickAt.set(l.id, l.first_seen_at);
  }

  const inputs: AdjustmentInput[] = rows.map((e) => {
    const job = e.job_id ? jobs.get(e.job_id) : undefined;
    const cancelled = job?.stage === 'cancelled';
    // The final invoice is the truth; the quote is what we reported. `final_amount` only exists once
    // someone has actually invoiced, so falling back to the quote keeps unfinished jobs as "no change"
    // rather than restating them to null and retracting a live job.
    const truth = cancelled ? null : toCents(job?.final_amount ?? job?.quote_amount ?? null);
    return {
      eventId: e.id,
      orderId: `${PRIMARY_BIDDING_MILESTONE}:${e.id}`,
      uploadedAction: action,
      uploadedValueCents: e.value_cents,
      originalUploaded: uploadedEvents.has(e.id),
      currentValueCents: truth,
      retracted: cancelled,
      clickAt: e.lead_id ? clickAt.get(e.lead_id) ?? null : null,
      decidedAt: now,
    };
  });

  const plan = planAdjustments(inputs, sentAdjustments);

  // G4: our books never bend to fit Google's window. Where the window closed, the internal number stays
  // right and the discrepancy is stamped on the event so it can be queried rather than wondered about.
  const windowSkips = plan.skipped.filter((s) => s.reason === 'out-of-window');
  for (const skip of windowSkips) {
    const input = inputs.find((i) => i.eventId === skip.eventId);
    if (!input) continue;
    const { data: existing } = await supabaseAdmin
      .from('lead_lifecycle_events').select('metadata').eq('id', skip.eventId).maybeSingle();
    const metadata = ((existing as { metadata?: Record<string, unknown> } | null)?.metadata) ?? {};
    if (metadata[WINDOW_SKIP_KEY]) continue; // already recorded; re-stamping every night says nothing new
    await supabaseAdmin
      .from('lead_lifecycle_events')
      .update({ metadata: { ...metadata, ...windowSkipMetadata(input) } })
      .eq('id', skip.eventId);
  }

  const skipCounts: Record<string, number> = {};
  for (const s of plan.skipped) skipCounts[s.reason] = (skipCounts[s.reason] ?? 0) + 1;

  if (!plan.adjustments.length) return { ...empty, skipped: skipCounts, windowSkips: windowSkips.length };

  const outcome = await uploadConversionAdjustments(plan.adjustments.map((a) => a.adjustment));

  const failureByIndex = new Map(outcome.failures.map((f) => [f.index, f]));
  for (let i = 0; i < plan.adjustments.length; i += 1) {
    const failure = failureByIndex.get(i);
    const failed = Boolean(failure) || Boolean(outcome.fatal);
    const { eventId, adjustment, hash } = plan.adjustments[i];
    await supabaseAdmin.from('conversion_upload_log').insert({
      event_id: eventId,
      kind: 'adjustment',
      adjustment_type: adjustment.adjustmentType,
      conversion_action: adjustment.conversionAction,
      payload_hash: hash,
      status: failed ? 'failed' : 'uploaded',
      error_code: failure?.code ?? (outcome.fatal ? 'REQUEST_FAILED' : null),
      error_detail: failure?.message ?? outcome.fatal ?? null,
      attempts: 1,
      uploaded_at: failed ? null : now,
    });
  }

  return {
    attempted: outcome.attempted, uploaded: outcome.uploaded,
    failed: outcome.failures.length, fatal: outcome.fatal ?? null,
    skipped: skipCounts, windowSkips: windowSkips.length,
  };
}
