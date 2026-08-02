// app/api/admin/research/coverage/route.ts — measured coverage, not intended (plan R11).
//
// GET → per-county coverage rolled up from `research_site_adapters` and the health checks that have
// actually run against them.
//
// The page this feeds also renders the worker's COMPILED registry, which is a map of intent. Both
// are worth showing and they are different claims: one says "somebody wrote an adapter for this
// county", the other says "we proved it read a page". Keeping them apart is what stops a firm
// promising a customer a county it cannot search.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import {
  coverageHeadline,
  coverageTotals,
  rollupCoverage,
  type AdapterRow,
} from '@/lib/research/coverage-rollup';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const [adapterRes, countyRes, checkRes] = await Promise.all([
    supabaseAdmin
      .from('research_site_adapters')
      .select('id, county_id, site_type, status, config, last_verified_at')
      .neq('status', 'retired'),
    supabaseAdmin.from('research_counties').select('id, name'),
    // Latest check per adapter. Fetched as a window and reduced here rather than with a lateral
    // join, because PostgREST cannot express "one row per group" and a per-adapter round trip would
    // be 21 requests to render one page.
    supabaseAdmin
      .from('research_adapter_health_checks')
      .select('adapter_id, status, ran_at')
      .order('ran_at', { ascending: false })
      .limit(500),
  ]);

  // A read that FAILED is not an empty coverage map. "No counties are covered" and "we could not
  // read the registry" are opposite facts that render identically — the §1.1b defect this repo has
  // shipped five times.
  if (adapterRes.error) {
    return NextResponse.json({ error: 'The adapter registry could not be read.' }, { status: 500 });
  }

  const countyName = new Map(
    ((countyRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  );

  const latestCheck = new Map<string, { status: string; ran_at: string }>();
  for (const row of (checkRes.data ?? []) as Array<{ adapter_id: string; status: string; ran_at: string }>) {
    if (!latestCheck.has(row.adapter_id)) latestCheck.set(row.adapter_id, row);
  }

  const rows: AdapterRow[] = ((adapterRes.data ?? []) as Array<{
    id: string; county_id: string; site_type: string; status: string;
    config: Record<string, unknown> | null; last_verified_at: string | null;
  }>).map((a) => {
    const check = latestCheck.get(a.id);
    return {
      countyName: countyName.get(a.county_id) ?? 'Unknown county',
      siteType: a.site_type,
      status: a.status as AdapterRow['status'],
      system: (a.config?.system as string) ?? null,
      lastVerifiedAt: a.last_verified_at,
      lastCheckStatus: (check?.status as AdapterRow['lastCheckStatus']) ?? null,
      lastCheckAt: check?.ran_at ?? null,
    };
  });

  const counties = rollupCoverage(rows);
  const totals = coverageTotals(counties);

  return NextResponse.json(
    {
      counties,
      totals,
      headline: coverageHeadline(totals),
      // Said explicitly: the absence of checks is a fact about US, not about the counties.
      checksSeen: (checkRes.data ?? []).length,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
