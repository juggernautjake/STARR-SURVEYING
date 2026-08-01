// app/api/cron/google-ads-spend/route.ts — pull yesterday's ad spend. A11.
//
// Auth: `Authorization: Bearer <CRON_SECRET>`, the same as every other cron here.
//
// Separate from `google-ads-upload` on purpose. They share credentials and a schedule but not a failure
// mode: uploading conversions WRITES to the ad account, importing spend only READS. Folding them together
// means a reporting hiccup shows up as "the conversion upload failed", and someone spends an evening
// looking at the wrong system.
//
// ── WHY IT RE-IMPORTS A WINDOW RATHER THAN JUST YESTERDAY ──────────────────────────────────────────
//
// Google **restates recent spend**: invalid-click credits and conversion attribution land days after the
// fact, so yesterday's number is not final for about a week. Importing only yesterday would freeze the
// first, wrongest version of every day forever.
//
// So it re-imports a trailing window and UPSERTS on the table's grain. The unique index makes that safe;
// without it, a re-import would double every day in the window.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { CREDENTIAL_HELP, credentialProblem, runReportQuery } from '@/lib/integrations/google-ads/client';
import { buildSpendQuery, parseSpendRows, totalSpend } from '@/lib/integrations/google-ads/spend';

/** Long enough to catch Google's restatements, short enough that a nightly run stays cheap. */
const RESTATEMENT_WINDOW_DAYS = 10;

const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/google-ads-spend] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const problem = credentialProblem();
  if (problem) {
    // Expected until the developer token arrives. The manual-entry path exists exactly for this period.
    return NextResponse.json({ skipped: true, reason: problem, detail: CREDENTIAL_HELP[problem] });
  }

  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const from = isoDate(now - RESTATEMENT_WINDOW_DAYS * day);
  const to = isoDate(now - day); // yesterday; today is incomplete and importing it stores a partial day

  const report = await runReportQuery(buildSpendQuery(from, to));
  if ('error' in report) return NextResponse.json({ from, to, imported: 0, error: report.error }, { status: 200 });

  const rows = parseSpendRows(report.body);
  if (!rows.length) return NextResponse.json({ from, to, imported: 0, totalMicros: 0 });

  // Upsert on the grain the unique index enforces. `source: 'api'` overwrites a manual estimate for the
  // same day — the real number should win, and silently keeping the guess would be worse.
  const { error } = await supabaseAdmin
    .from('ad_spend_daily')
    .upsert(
      rows.map((r) => ({
        spend_date: r.spendDate,
        platform: 'google_ads',
        // '' rather than null at the DB boundary: NULLs never collide in a unique constraint, so a null
        // campaign would re-insert on every run instead of updating. The parser keeps null because that
        // is what the API means; the table needs a value that can be compared.
        campaign_id: r.campaignId ?? '',
        campaign_name: r.campaignName,
        ad_group_id: r.adGroupId ?? '',
        ad_group_name: r.adGroupName,
        impressions: r.impressions,
        clicks: r.clicks,
        cost_micros: r.costMicros,
        conversions: r.conversions,
        conversion_value_micros: r.conversionValueMicros,
        source: 'api',
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'spend_date,platform,campaign_id,ad_group_id' },
    );

  if (error) return NextResponse.json({ from, to, imported: 0, error: error.message }, { status: 500 });

  return NextResponse.json({ from, to, imported: rows.length, totalMicros: totalSpend(rows) });
}, { routeName: 'cron/google-ads-spend' });
