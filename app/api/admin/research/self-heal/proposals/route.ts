// app/api/admin/research/self-heal/proposals/route.ts
//
// Slice 3 of research-self-heal-slice-1-manual-sweep-2026-06-22.md.
//
// GET — list pending proposals (status='proposed') with adapter +
//   county join so the review queue at /admin/research/self-heal can
//   show "Bell · property_records — Site returned 503" without N+1.
//
// The PATCH (approve / reject) lives in the [id] route next door.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface ProposalRow {
  id: string;
  adapter_id: string;
  health_check_id: string | null;
  confidence: number;
  rationale: string;
  diff: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

interface JoinedAdapter {
  id: string;
  base_url: string;
  site_type: string;
  status: string;
  county_id: string;
  vendor_id: string | null;
}

async function authGate(): Promise<
  | { ok: true; email: string }
  | { ok: false; res: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin(session.user.roles)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, email: session.user.email };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const g = await authGate();
  if (!g.ok) return g.res;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'proposed';
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 100)));

  const { data: proposalsRaw, error } = await supabaseAdmin
    .from('research_adapter_change_proposals')
    .select('id, adapter_id, health_check_id, confidence, rationale, diff, status, created_at')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const proposals = (proposalsRaw ?? []) as ProposalRow[];
  if (proposals.length === 0) {
    return NextResponse.json({ proposals: [], counts: { proposed: 0 } });
  }

  const adapterIds = Array.from(new Set(proposals.map((p) => p.adapter_id)));
  const { data: adapters } = await supabaseAdmin
    .from('research_site_adapters')
    .select('id, base_url, site_type, status, county_id, vendor_id')
    .in('id', adapterIds);
  const adapterRows = ((adapters ?? []) as JoinedAdapter[]);
  const adapterById = new Map<string, JoinedAdapter>();
  for (const a of adapterRows) {
    adapterById.set(a.id, a);
  }
  const countyIds = Array.from(new Set(adapterRows.map((a) => a.county_id)));
  const { data: counties } = countyIds.length > 0
    ? await supabaseAdmin.from('research_counties').select('id, name').in('id', countyIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const countyName = new Map<string, string>();
  for (const c of (counties ?? []) as Array<{ id: string; name: string }>) {
    countyName.set(c.id, c.name);
  }
  const vendorIds = Array.from(new Set(adapterRows.map((a) => a.vendor_id).filter((x): x is string => !!x)));
  const { data: vendors } = vendorIds.length > 0
    ? await supabaseAdmin.from('research_data_vendors').select('id, name').in('id', vendorIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const vendorName = new Map<string, string>();
  for (const v of (vendors ?? []) as Array<{ id: string; name: string }>) {
    vendorName.set(v.id, v.name);
  }

  const decorated = proposals.map((p) => {
    const adapter = adapterById.get(p.adapter_id);
    return {
      ...p,
      adapter: adapter
        ? {
            id: adapter.id,
            base_url: adapter.base_url,
            site_type: adapter.site_type,
            status: adapter.status,
            county: countyName.get(adapter.county_id) ?? null,
            vendor: adapter.vendor_id ? vendorName.get(adapter.vendor_id) ?? null : null,
          }
        : null,
    };
  });

  // Also surface the total count of proposed rows so the dashboard
  // badge stays accurate even when the page applies a limit.
  const { count } = await supabaseAdmin
    .from('research_adapter_change_proposals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'proposed');

  return NextResponse.json({ proposals: decorated, counts: { proposed: count ?? proposals.length } });
}, { routeName: 'admin/research/self-heal/proposals.get' });
