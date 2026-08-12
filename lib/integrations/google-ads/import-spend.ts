// lib/integrations/google-ads/import-spend.ts — pull spend from Google into our table. A3.
//
// ── WHY THIS IS A MODULE AND NOT JUST THE CRON ROUTE ────────────────────────────────────────────
//
// Until A3 the only importer lived inside `app/api/cron/google-ads-spend/route.ts`, and the owner's
// ask — *"show all of that info for the current month by default… in real time"* — needs a second
// caller: a person pressing refresh, for a range they are looking at right now.
//
// Copying the upsert into a second route is the obvious move and the wrong one. The dangerous part of
// this code is not the fetch, it is the *grain*: `campaign_id: ''` instead of null, `on_conflict` on
// four columns, `source: 'api'`. Get any of those wrong in the copy and the second importer does not
// fail — it silently doubles the month, and the two totals disagree in a way nobody can attribute to
// a code path. One function, two callers.
//
// ── THE CRON STOPS AT YESTERDAY; A PERSON PRESSING REFRESH DOES NOT ─────────────────────────────
//
// Today's figures are partial — the day is not over, and Google is still counting. The nightly job
// deliberately ends at yesterday so it never freezes a half-day into the table as though it were
// final.
//
// But somebody looking at "this month" at 2pm wants today's spend *included*, partial and all, and a
// month total that stops at midnight last night is wrong by up to a day of spend with nothing on the
// page saying so. So the range is the caller's choice, and `includesToday` comes back in the result
// so the page can label the number instead of quietly implying it is settled.
//
// This is safe against the cron precisely because of the restatement window: tomorrow's run re-imports
// the last ten days and upserts the finished figure over today's partial one.

import { supabaseAdmin } from '@/lib/supabase';
import { CREDENTIAL_HELP, reportingProblem, runReportQuery } from './client';
import { buildSpendQuery, parseSpendRows, totalSpend } from './spend';

export interface ImportResult {
  from: string;
  to: string;
  imported: number;
  totalMicros: number;
  /** True when the range reaches today, whose figures Google is still counting. */
  includesToday: boolean;
  /** Set when nothing was imported. `skipped` distinguishes "not configured yet" from "it broke". */
  error?: string;
  skipped?: boolean;
  /** A problem that did NOT stop the import — currently only a misconfigured `login-customer-id`
   *  that the client works around. Passed up rather than logged, because a warning nobody sees is
   *  the same as no warning at all. */
  warning?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today in UTC, matching `segments.date` and the DATE column, both of which are date-only. */
export const todayIso = (now = Date.now()): string => new Date(now).toISOString().slice(0, 10);

/**
 * Import `from`..`to` inclusive and upsert on the table's grain.
 *
 * Returns rather than throws for every expected failure — a missing developer token, a Google error —
 * because both callers surface the reason to a human, and an exception at this boundary just becomes
 * a 500 with the useful part in a log nobody reads.
 */
export async function importSpendRange(from: string, to: string, now = Date.now()): Promise<ImportResult> {
  const base = { from, to, imported: 0, totalMicros: 0, includesToday: to >= todayIso(now) };

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return { ...base, error: `Dates must be YYYY-MM-DD, got "${from}".."${to}".` };
  }
  if (from > to) return { ...base, error: `The range is backwards: "${from}".."${to}".` };

  // `reportingProblem`, NOT `credentialProblem`. This import READS; it does not upload a conversion,
  // so it must not demand a conversion action be configured. Getting that wrong turned a working ad
  // account's spend, clicks and impressions into zeroes and answered with advice about setting up
  // conversion tracking — advice that has nothing to do with reading a report.
  const problem = reportingProblem();
  if (problem) {
    // Not an error worth alarming about: the manual-entry path exists exactly for this state.
    return { ...base, skipped: true, error: CREDENTIAL_HELP[problem] };
  }

  const report = await runReportQuery(buildSpendQuery(from, to));
  if ('error' in report) return { ...base, error: report.error };

  const { warning } = report;
  const rows = parseSpendRows(report.body);
  if (!rows.length) return { ...base, warning };

  // Upsert on the grain the unique constraint enforces. `source: 'api'` overwrites a manual estimate
  // for the same day — the real number should win, and silently keeping the guess would be worse.
  const { error } = await supabaseAdmin
    .from('ad_spend_daily')
    .upsert(
      rows.map((r) => ({
        spend_date: r.spendDate,
        platform: 'google_ads',
        // '' rather than null at the DB boundary: NULLs never collide in a unique constraint, so a
        // null campaign would re-insert on every run instead of updating. The parser keeps null
        // because that is what the API means; the table needs a value that can be compared.
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
        updated_at: new Date(now).toISOString(),
      })),
      { onConflict: 'spend_date,platform,campaign_id,ad_group_id' },
    );

  if (error) return { ...base, error: error.message, warning };
  return { ...base, imported: rows.length, totalMicros: totalSpend(rows), warning };
}
