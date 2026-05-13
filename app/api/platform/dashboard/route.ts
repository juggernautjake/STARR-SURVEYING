// app/api/platform/dashboard/route.ts
//
// Operator dashboard headline stats. Returns totals across every
// tenant: customer count, total MRR (cents), open support tickets,
// audit entries in the last 24h, recent signups.
//
// Phase C-8 of OPERATOR_CONSOLE.md.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

async function gateOperator(email: string): Promise<boolean> {
  const { data: opr } = await supabaseAdmin
    .from('operator_users')
    .select('email, status')
    .eq('email', email)
    .maybeSingle();
  return !!opr && opr.status === 'active';
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.user.isOperator && !(await gateOperator(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [orgsResp, subsResp, ticketsResp, auditResp, recentResp] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('id, status', { count: 'exact' }),
    supabaseAdmin
      .from('subscriptions')
      .select('status, base_price_cents, per_seat_price_cents, seat_count')
      .in('status', ['active', 'trialing']),
    supabaseAdmin
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'awaiting_customer', 'awaiting_operator']),
    supabaseAdmin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', dayAgo),
    supabaseAdmin
      .from('organizations')
      .select('id, name, slug, status, created_at')
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const totalOrgs = orgsResp.count ?? 0;
  const activeOrgs = (orgsResp.data ?? []).filter((o: { status: string }) => o.status === 'active').length;
  const trialingOrgs = (orgsResp.data ?? []).filter((o: { status: string }) => o.status === 'trialing').length;

  let totalMrrCents = 0;
  for (const s of subsResp.data ?? []) {
    const row = s as { base_price_cents: number | null; per_seat_price_cents: number | null; seat_count: number | null };
    const base = row.base_price_cents ?? 0;
    const perSeat = row.per_seat_price_cents ?? 0;
    const seats = row.seat_count ?? 0;
    totalMrrCents += base + perSeat * seats;
  }

  return NextResponse.json({
    customers: {
      total: totalOrgs,
      active: activeOrgs,
      trialing: trialingOrgs,
    },
    mrrCents: totalMrrCents,
    openTickets: ticketsResp.count ?? 0,
    auditLast24h: auditResp.count ?? 0,
    recentSignups: (recentResp.data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      status: r.status as string,
      createdAt: r.created_at as string,
    })),
  });
}
