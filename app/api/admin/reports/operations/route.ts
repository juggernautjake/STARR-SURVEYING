// app/api/admin/reports/operations/route.ts
//
// Owner operations report. Single endpoint that aggregates the five
// report sections (jobs / hours / receipts / mileage / financials)
// for a given date window, scoped to the caller's active org.
//
// Phase R-2 of OWNER_REPORTS.md. Section loaders live in
// `lib/reports/operations-data.ts` so the PDF endpoint + weekly cron
// can reuse them.
//
// GET /api/admin/reports/operations?from=<iso>&to=<iso>

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { buildOperationsReport } from '@/lib/reports/operations-data';

export const runtime = 'nodejs';

function parseIsoDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return { from, to };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user?.default_org_id) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', user.default_org_id)
    .eq('user_email', session.user.email)
    .maybeSingle();
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 });
  }

  const url = new URL(req.url);
  const fallback = defaultRange();
  const from = parseIsoDate(url.searchParams.get('from')) ?? fallback.from;
  const to = parseIsoDate(url.searchParams.get('to')) ?? fallback.to;

  try {
    const payload = await buildOperationsReport(user.default_org_id, from.toISOString(), to.toISOString());
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[reports/operations] failed', err);
    return NextResponse.json({ error: 'Failed to build report' }, { status: 500 });
  }
}
