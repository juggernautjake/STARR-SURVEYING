// app/api/admin/research/adapter-health/route.ts — is my county working? (roadmap §9.8)
//
// GET → { entries } — one row per registered adapter, worst first.
//
// `rollupAdapterDashboard()` shipped in slice 17 as a pure aggregator and has had no caller since:
// the roadmap recorded it as "data layer ✅ … route handler + the UI extension lands when the
// dashboard slice ships". This is that slice's server half.
//
// ── THE AGGREGATION IS PURE AND STAYS THAT WAY ──────────────────────────────────────────────────
//
// Everything this route does is four reads and one function call. The verdict logic — what counts as
// degraded, when a run of failures pulls the light from yellow to red, how proposals affect priority
// — lives in the pure module and is tested there without a database. This handler's only job is to
// fetch the four inputs in the shapes that module declares.
//
// ── THE WINDOW IS THE SAME ONE THE ROLLUP USES ──────────────────────────────────────────────────
//
// `recentWindowHours` defaults to 168. The query below asks for exactly that window rather than "the
// last N rows", because a rollup fed more history than it reasons over silently disagrees with
// itself: the same adapter would score differently depending on how busy the checker had been.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import {
  rollupAdapterDashboard,
  type AdapterRowForDashboard,
  type HealthCheckRow,
  type PendingProposalRow,
} from '@/lib/research/dashboard-rollup';

const RECENT_WINDOW_HOURS = 168;

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const now = new Date();
  const since = new Date(now.getTime() - RECENT_WINDOW_HOURS * 3600_000).toISOString();

  const [adapterRes, checkRes, proposalRes, countyRes, vendorRes] = await Promise.all([
    supabaseAdmin
      .from('research_site_adapters')
      .select('id, county_id, site_type, status, vendor_id, base_url, last_verified_at')
      .neq('status', 'retired'),
    supabaseAdmin
      .from('research_adapter_health_checks')
      .select('id, adapter_id, ran_at, status, diff_summary')
      .gte('ran_at', since),
    supabaseAdmin
      .from('research_adapter_change_proposals')
      .select('id, adapter_id, confidence, rationale, created_at, status')
      .eq('status', 'proposed'),
    supabaseAdmin.from('research_counties').select('id, name, fips, metro_tier'),
    supabaseAdmin.from('research_data_vendors').select('id, vendor_key'),
  ]);

  // A failure here is reported, not rendered as an empty dashboard. "No adapters are unhealthy" and
  // "we could not read the adapters" are opposite facts that look identical as an empty table — the
  // defect §1.1b and the compliance page each shipped.
  if (adapterRes.error) {
    return NextResponse.json({ error: 'The adapter registry could not be read.' }, { status: 500 });
  }

  const counties = new Map(
    ((countyRes.data ?? []) as Array<{ id: string; name: string; fips: string | null; metro_tier: number | null }>)
      .map((c) => [c.id, c]),
  );
  const vendors = new Map(
    ((vendorRes.data ?? []) as Array<{ id: string; vendor_key: string }>).map((v) => [v.id, v.vendor_key]),
  );

  const adapters: AdapterRowForDashboard[] = (
    (adapterRes.data ?? []) as Array<{
      id: string; county_id: string; site_type: AdapterRowForDashboard['site_type'];
      status: AdapterRowForDashboard['status']; vendor_id: string | null;
      base_url: string; last_verified_at: string | null;
    }>
  ).map((a) => {
    const county = counties.get(a.county_id);
    return {
      id: a.id,
      county_id: a.county_id,
      county_name: county?.name,
      county_fips: county?.fips ?? undefined,
      metro_tier: county?.metro_tier ?? null,
      site_type: a.site_type,
      status: a.status,
      vendor_key: a.vendor_id ? vendors.get(a.vendor_id) ?? null : null,
      base_url: a.base_url,
      last_verified_at: a.last_verified_at,
    };
  });

  const entries = rollupAdapterDashboard(
    adapters,
    (checkRes.data ?? []) as HealthCheckRow[],
    (proposalRes.data ?? []) as PendingProposalRow[],
    // `now` is an explicit parameter of the rollup, not a clock it reads — that is what makes its
    // "how many hours since the last check" arithmetic testable. It gets the SAME instant the
    // `since` cutoff above was computed from, so the window the query asked for and the window the
    // rollup scores over cannot drift apart by the duration of the four queries.
    now,
    { recentWindowHours: RECENT_WINDOW_HOURS },
  );

  return NextResponse.json(
    {
      entries,
      // Reported so the UI can say "checks have not run" rather than showing every adapter as
      // unknown and leaving the reader to guess whether that means healthy.
      checksInWindow: (checkRes.data ?? []).length,
      windowHours: RECENT_WINDOW_HOURS,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
