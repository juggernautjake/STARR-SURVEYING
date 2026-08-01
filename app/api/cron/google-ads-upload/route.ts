// app/api/cron/google-ads-upload/route.ts — push offline conversions to Google Ads nightly. A8.
//
// Auth: `Authorization: Bearer <CRON_SECRET>`, the same as every other cron here.
//
// **Inert until credentials exist.** With no developer token or no connected account this returns a clear
// `skipped` with the reason, and returns 200 — because a cron that 500s every night for a feature nobody
// has turned on is a cron whose alerts get muted, and then its real failures are muted too.
//
// ── WHAT IT DOES ────────────────────────────────────────────────────────────────────────────────────
//
// Reads A4's lifecycle stream for conversion-worthy milestones that have not been uploaded, builds the
// API payload with the SAME formatter A7's CSV uses, uploads with `partialFailure: true`, and writes one
// `conversion_upload_log` row per attempt carrying Google's own error text.
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
  CREDENTIAL_HELP, credentialProblem, payloadHash, uploadClickConversions,
} from '@/lib/integrations/google-ads/client';
import { selectConversions, type SelectableEvent, type SelectableLead } from '@/lib/integrations/google-ads/select';
import { GOOGLE_MILESTONES, type Milestone } from '@/lib/pipeline/events';

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

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: events, error } = await supabaseAdmin
    .from('lead_lifecycle_events')
    .select('id, milestone, occurred_at, value_cents, lead_id')
    .in('milestone', GOOGLE_MILESTONES as unknown as string[])
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (events ?? []) as SelectableEvent[];
  if (!rows.length) {
    return NextResponse.json({
      attempted: 0, uploaded: 0,
      skipped: { noAction: 0, noClick: 0, outOfWindow: 0, alreadyUploaded: 0 },
    });
  }

  // Already uploaded? The log is the record, not a flag on the event — an event can legitimately be
  // uploaded once and then adjusted (A9), and a boolean cannot express that.
  const { data: logged } = await supabaseAdmin
    .from('conversion_upload_log')
    .select('event_id, payload_hash, status')
    .in('event_id', rows.map((r) => r.id))
    .eq('status', 'uploaded');
  const uploadedKeys = new Set(
    ((logged ?? []) as Array<{ event_id: string; payload_hash: string }>).map((l) => `${l.event_id}:${l.payload_hash}`),
  );

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

  if (!payloads.length) {
    return NextResponse.json({ uploaded: 0, attempted: 0, skipped });
  }

  const outcome = await uploadClickConversions(payloads);

  // One log row per attempt, with Google's own text. Written whatever happened — including the fatal
  // case, because "we tried and the whole request failed" is exactly the state that otherwise leaves no
  // trace at all.
  const failureByIndex = new Map(outcome.failures.map((f) => [f.index, f]));
  const now = new Date().toISOString();
  for (let i = 0; i < payloads.length; i += 1) {
    const failure = failureByIndex.get(i);
    const failed = Boolean(failure) || Boolean(outcome.fatal);
    await supabaseAdmin.from('conversion_upload_log').insert({
      event_id: eventIds[i],
      conversion_action: payloads[i].conversionAction,
      payload_hash: payloadHash(payloads[i]),
      status: failed ? 'failed' : 'uploaded',
      error_code: failure?.code ?? (outcome.fatal ? 'REQUEST_FAILED' : null),
      error_detail: failure?.message ?? outcome.fatal ?? null,
      attempts: 1,
      uploaded_at: failed ? null : now,
    });
  }

  await supabaseAdmin
    .from('google_ads_connections')
    .update({ last_uploaded_at: now, last_error: outcome.fatal ?? null, updated_at: now })
    .not('customer_id', 'is', null);

  return NextResponse.json({
    attempted: outcome.attempted,
    uploaded: outcome.uploaded,
    failed: outcome.failures.length,
    fatal: outcome.fatal ?? null,
    skipped,
  });
}, { routeName: 'cron/google-ads-upload' });
