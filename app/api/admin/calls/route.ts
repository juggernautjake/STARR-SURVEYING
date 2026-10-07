// app/api/admin/calls/route.ts — the call log for /admin/calls.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { listCalls } from '@/lib/receptionist/calls';
import { readAgentHealth } from '@/lib/receptionist/call-outcome';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

/**
 * The call log.
 *
 * `scope` picks which log: `live` (the default — real customers), `test` (the bench), or `both`.
 * They are separated in the QUERY rather than in the browser, because a page that asks for 200 rows
 * and hides half of them is showing 100 while claiming 200, and the oldest fall off the end unseen.
 *
 * `search` narrows server-side. The browser ranks what comes back — see call-search.ts for why the
 * two halves are deliberately different strictnesses.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const params = new URL(req.url).searchParams;
  const limit = Math.min(Number(params.get('limit')) || 100, 500);

  const asked = params.get('scope');
  const scope = asked === 'test' || asked === 'both' ? asked : 'live';

  const calls = await listCalls(supabaseAdmin, {
    limit,
    scope,
    search: params.get('search') ?? undefined,
  });
  // Whether callers are actually talking to the receptionist (2026-09-29). Only for the live log:
  // test calls are not evidence about the business line. Null when the read failed.
  const health = scope === 'live' ? await readAgentHealth(supabaseAdmin) : null;
  return NextResponse.json({ calls, scope, health, week: scope === 'live' ? await lastWeek() : null });
}, { routeName: 'admin/calls' });

/**
 * The last seven days in one line: how many calls, how many were real, and how many the screening
 * kept off the phone. The number the owner reviews at the end of the week (2026-10-06): "review how
 * successful it is at the end of the week."
 */
async function lastWeek(): Promise<{ total: number; real: number; screened: number; blocked: number; robocalls: number; silent: number; fromAds: number; fromSite: number } | null> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin.from('phone_calls')
    .select('caller_verdict, screened_as, answered_by, source')
    .eq('is_test', false).gte('started_at', since).limit(2000);
  if (error) return null;
  const rows = (data ?? []) as Array<{ caller_verdict: string | null; screened_as: string | null; answered_by: string | null; source: string | null }>;
  return {
    total: rows.length,
    real: rows.filter((r) => r.caller_verdict === 'person').length,
    screened: rows.filter((r) => r.screened_as === 'voicemail').length,
    blocked: rows.filter((r) => r.screened_as === 'blocked' || r.answered_by === 'blocked').length,
    robocalls: rows.filter((r) => r.caller_verdict === 'robocall').length,
    silent: rows.filter((r) => r.caller_verdict === 'silent').length,
    fromAds: rows.filter((r) => r.source === 'google_ads').length,
    fromSite: rows.filter((r) => r.source === 'website').length,
  };
}
