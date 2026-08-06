// app/api/admin/marketing/uploads/route.ts — is the API upload path working, and what did Google reject? A8.
//
// GET → { connection, recent[], failures[], counts }
//
// ── WHY THIS ROUTE EXISTS AT ALL ────────────────────────────────────────────────────────────────────
//
// The nightly cron uploads with `partialFailure: true`, which means Google answers **HTTP 200 while
// rejecting individual rows**. Nothing about that run looks like a failure: no exception, no alert, no
// non-2xx. The only trace is `conversion_upload_log`, and a table nobody reads is not a trace.
//
// The plan's phrasing is the one to keep: *a silent failed upload is worse than no upload* — no upload is
// a gap you can see. This route is what makes the failed ones visible.
//
// ── IT REPORTS "NOT CONNECTED" AS A STATE, NOT AN ERROR ─────────────────────────────────────────────
//
// Right now there is no developer token; that is expected, not broken. The response names the SPECIFIC
// missing piece so the page can tell an operator what to do next, rather than showing a red box for a
// feature nobody has turned on yet.

import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { CREDENTIAL_HELP, conversionActionStatus, credentialProblem } from '@/lib/integrations/google-ads/client';
import { WINDOW_SKIP_KEY } from '@/lib/integrations/google-ads/adjustments';

interface LogRow {
  id: string;
  event_id: string | null;
  conversion_action: string;
  /** 'conversion' | 'adjustment'. See seed 508 — a rejected conversion is revenue Google never heard
   *  about; a rejected adjustment is revenue Google heard about at the WRONG number. */
  kind: string;
  adjustment_type: string | null;
  status: string;
  error_code: string | null;
  error_detail: string | null;
  attempts: number;
  uploaded_at: string | null;
  created_at: string;
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const problem = credentialProblem();

  const { data: connRow } = await supabaseAdmin
    .from('google_ads_connections')
    .select('customer_id, user_email, last_uploaded_at, last_error, created_at')
    .limit(1)
    .maybeSingle();

  const { data: rows } = await supabaseAdmin
    .from('conversion_upload_log')
    .select('id, event_id, conversion_action, kind, adjustment_type, status, error_code, error_detail, attempts, uploaded_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const log = (rows ?? []) as LogRow[];
  const failures = log.filter((r) => r.status === 'failed');

  // A9 — the window skips. These are NOT failures: the upload was never attempted, deliberately, because
  // the 90-day window had closed. They are counted separately because the response to them is different:
  // nothing to retry, and the gap between our revenue and Google's is now permanent for those jobs.
  const { count: windowSkips } = await supabaseAdmin
    .from('lead_lifecycle_events')
    .select('id', { count: 'exact', head: true })
    .not(`metadata->${WINDOW_SKIP_KEY}`, 'is', null);

  return NextResponse.json({
    connection: {
      // Which piece is missing — 'missing-developer-token' and 'not-connected' need different actions.
      problem: problem ?? (connRow ? null : 'not-connected'),
      help: problem ? CREDENTIAL_HELP[problem] : connRow ? null : CREDENTIAL_HELP['not-connected'],
      customerId: (connRow as { customer_id?: string } | null)?.customer_id ?? null,
      connectedBy: (connRow as { user_email?: string } | null)?.user_email ?? null,
      // Never uploaded is a different state from uploaded-then-started-failing, and the page must be able
      // to tell them apart.
      lastUploadedAt: (connRow as { last_uploaded_at?: string } | null)?.last_uploaded_at ?? null,
      lastError: (connRow as { last_error?: string } | null)?.last_error ?? null,
      // Which milestones can actually be reported. PARTIAL configuration is the state worth showing:
      // it is not an error, the job succeeds, and the milestones without a resource name are dropped
      // into `skipped.noAction` — which was counted and displayed nowhere until 2026-08-06.
      conversionActions: conversionActionStatus(),
    },
    counts: {
      total: log.length,
      uploaded: log.filter((r) => r.status === 'uploaded').length,
      failed: failures.length,
      pending: log.filter((r) => r.status === 'pending').length,
      // Split out because the two failure modes need different responses, not the same one twice.
      conversions: log.filter((r) => r.kind === 'conversion').length,
      adjustments: log.filter((r) => r.kind === 'adjustment').length,
      failedConversions: failures.filter((r) => r.kind === 'conversion').length,
      failedAdjustments: failures.filter((r) => r.kind === 'adjustment').length,
      windowSkips: windowSkips ?? 0,
    },
    // Google's OWN error text, unparaphrased — it is what the help pages are written against and what an
    // operator can actually search for.
    failures: failures.slice(0, 50),
    recent: log.slice(0, 25),
  });
}, { routeName: 'admin/marketing/uploads' });
