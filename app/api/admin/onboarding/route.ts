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
  // ── `'*'`, NOT `'id'` (owner report, 2026-08-04) ─────────────────────────────────────────────
  //
  // `organization_members` and `org_counties` are **join tables with composite keys and no `id`
  // column**. Selecting `id` returns a Postgres 42703 — so both counts hit the error branch below
  // and returned 0, *always*, for every firm, regardless of the data.
  //
  // Measured on the live database while chasing "0 of 2 essentials done": 6 member rows and 8 county
  // rows, both counted as zero. Two of the six steps could never be completed by adding anything,
  // and one of them is an **essential** — so the card was structurally incapable of reaching "done".
  //
  // The error branch did exactly its job: it logged. Nobody was reading the server log, which is why
  // "0 because the query failed" needs to be visible somewhere a person actually looks — and is why
  // this now uses a projection that works on any table rather than one that assumes a surrogate key.
  const { count, error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
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

  // ── AN OPERATOR IS STILL LOOKING AT A FIRM (owner report, 2026-08-04) ────────────────────────
  //
  // *"I go in and have all of our firm's details and save it. Then it shows I need to add your
  // people, but it is still locked and says I need to add the firm's details first."*
  //
  // `orgIdForSession` returns **null for an operator**, deliberately — a platform operator is not
  // scoped to one tenant, and that is right for reading data. It is wrong for this question.
  // The owner is an active `operator_users` row *and* a member of the firm, so every fact below
  // was measured against no org at all: `getTenantProfile(null)` returns the empty profile and
  // each count filters on a null scope.
  //
  // The card therefore read **"0 of 2 essentials done" permanently**, whatever was saved — and the
  // firm's row has been complete the whole time (name, phone, billing email, address, website), with
  // two members and four counties. Nothing was missing. The question was being asked about nobody.
  //
  // So: fall back to the session's own membership. An operator who belongs to a firm is asked about
  // that firm; an operator who belongs to none has no firm to set up, and `null` flows through to a
  // state whose steps are all undone but which the card is told not to render (see below).
  const orgId = orgIdForSession(session) ?? session.user.memberships?.[0]?.orgId ?? null;
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
