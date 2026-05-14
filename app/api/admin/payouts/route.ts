// app/api/admin/payouts/route.ts
//
// Employee-payout ledger CRUD. List + record per-employee compensation
// outflows by rail (Venmo / CashApp / Stripe / Check / Cash / etc.).
//
// Phase R-13 of OWNER_REPORTS.md.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const VALID_METHODS = ['venmo', 'cashapp', 'stripe', 'check', 'cash', 'ach', 'zelle', 'other'] as const;
type Method = (typeof VALID_METHODS)[number];

interface PayoutRow {
  id: string;
  userEmail: string;
  amountCents: number;
  method: string;
  reference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string | null;
  paidAt: string;
  createdBy: string;
  createdAt: string;
}

async function resolveAdminOrg(email: string): Promise<string | null> {
  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', email)
    .maybeSingle();
  if (!user?.default_org_id) return null;
  const { data: m } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', user.default_org_id)
    .eq('user_email', email)
    .maybeSingle();
  if (!m || m.role !== 'admin') return null;
  return user.default_org_id;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = await resolveAdminOrg(session.user.email);
  if (!orgId) return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 });

  const url = new URL(req.url);
  const fromIso = url.searchParams.get('from');
  const toIso = url.searchParams.get('to');
  const employee = url.searchParams.get('employee');
  const method = url.searchParams.get('method');

  let query = supabaseAdmin
    .from('employee_payouts')
    .select('id, user_email, amount_cents, method, reference, period_start, period_end, notes, paid_at, created_by, created_at')
    .eq('org_id', orgId)
    .order('paid_at', { ascending: false })
    .limit(500);

  if (fromIso) query = query.gte('paid_at', fromIso);
  if (toIso) query = query.lte('paid_at', toIso);
  if (employee) query = query.eq('user_email', employee);
  if (method) query = query.eq('method', method);

  const { data, error } = await query;
  if (error) {
    console.error('[payouts] list failed', error);
    return NextResponse.json({ error: 'Failed to load payouts' }, { status: 500 });
  }

  const payouts: PayoutRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    userEmail: r.user_email as string,
    amountCents: r.amount_cents as number,
    method: r.method as string,
    reference: (r.reference as string | null) ?? null,
    periodStart: (r.period_start as string | null) ?? null,
    periodEnd: (r.period_end as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    paidAt: r.paid_at as string,
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
  }));

  // Aggregate totals by method (the boss wants this for reconciliation).
  const byMethod: Record<string, number> = {};
  let totalCents = 0;
  for (const p of payouts) {
    byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountCents;
    totalCents += p.amountCents;
  }

  return NextResponse.json({ payouts, totalCents, byMethod });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = await resolveAdminOrg(session.user.email);
  if (!orgId) return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 });

  let body: {
    userEmail?: string;
    amountCents?: number;
    method?: string;
    reference?: string;
    periodStart?: string;
    periodEnd?: string;
    notes?: string;
    paidAt?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const userEmail = body.userEmail?.trim().toLowerCase();
  if (!userEmail) return NextResponse.json({ error: 'userEmail required' }, { status: 400 });

  const amountCents = Math.round(body.amountCents ?? 0);
  if (!amountCents || amountCents <= 0) {
    return NextResponse.json({ error: 'amountCents must be > 0' }, { status: 400 });
  }

  const method = body.method as Method | undefined;
  if (!method || !VALID_METHODS.includes(method)) {
    return NextResponse.json({ error: `method must be one of: ${VALID_METHODS.join(', ')}` }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    org_id: orgId,
    user_email: userEmail,
    amount_cents: amountCents,
    method,
    reference: body.reference?.trim() || null,
    period_start: body.periodStart || null,
    period_end: body.periodEnd || null,
    notes: body.notes?.trim() || null,
    paid_at: body.paidAt || new Date().toISOString(),
    created_by: session.user.email,
  };

  const { data, error } = await supabaseAdmin
    .from('employee_payouts')
    .insert(insert)
    .select('id, amount_cents, method, user_email, paid_at')
    .single();

  if (error || !data) {
    console.error('[payouts] insert failed', error);
    return NextResponse.json({ error: 'Failed to record payout' }, { status: 500 });
  }

  await supabaseAdmin.from('audit_log').insert({
    org_id: orgId,
    customer_email: session.user.email,
    action: 'PAYOUT_RECORDED',
    severity: 'info',
    metadata: { payout_id: data.id, user_email: userEmail, amount_cents: amountCents, method },
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}
