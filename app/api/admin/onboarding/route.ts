// app/api/admin/onboarding/route.ts — how far along is this firm (audit item 8i).
//
// GET → { state } from `evaluateOnboarding`, measured live.
//
// ── MEASURED, NEVER REMEMBERED ──────────────────────────────────────────────────────────────────
//
// There is deliberately no `onboarding_complete` column. A stored flag lies the moment somebody
// deletes their only vehicle, and it cannot distinguish a firm that abandoned setup halfway from one
// that finished — which is exactly the population this needs to help. Counting is cheap: eight
// head-count queries against indexed tables, in parallel, on a page nobody loads in a loop.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { orgIdForSession } from '@/lib/saas/org-scope-context';
import { getTenantProfile } from '@/lib/saas/tenant-profile';
import { evaluateOnboarding, type OnboardingFacts } from '@/lib/saas/onboarding';

/** `head: true` with an exact count — the row bodies are never needed and fetching them on a table
 *  with 40,000 jobs would be a slow way to learn the number is not zero. */
async function countOf(table: string): Promise<number> {
  const { count, error } = await supabaseAdmin.from(table).select('id', { count: 'exact', head: true });
  // A failed count returns 0 rather than throwing, so one missing table cannot blank the whole
  // checklist — but it is logged, because "0 because there are none" and "0 because the query failed"
  // are the §1.1b pair and only one of them is worth acting on.
  if (error) {
    console.error(`[onboarding] could not count ${table}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const orgId = orgIdForSession(session);
  const profile = await getTenantProfile(orgId);

  const [memberCount, countyCount, workTypeCount, equipmentCount, customerCount, jobCount] = await Promise.all([
    countOf('organization_members'),
    countOf('org_counties'),
    countOf('work_type_rates'),
    countOf('equipment_inventory'),
    countOf('customers'),
    countOf('jobs'),
  ]);

  const facts: OnboardingFacts = {
    hasFirmName: !!profile.name,
    // Either channel counts. A firm reachable only by phone is a real firm, and requiring both would
    // hold the checklist open forever on a technicality.
    hasFirmContact: !!(profile.contactEmail || profile.phone),
    memberCount,
    countyCount,
    workTypeCount,
    equipmentCount,
    customerCount,
    jobCount,
    // Live payments are a deployment fact, not a per-firm one today (BLOCKERS.md §D). Read from the
    // flag rather than pretended to be configurable, so the step is honest about what it checks.
    paymentsConfigured: process.env.PAYMENTS_LIVE === 'true' || process.env.PAYMENTS_LIVE === '1',
  };

  return NextResponse.json(
    { state: evaluateOnboarding(facts), facts },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
