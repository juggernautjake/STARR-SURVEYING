// app/api/platform/customers/[orgId]/route.ts
//
// Operator-side single-customer view. Returns the org row +
// subscription + member count + last-30d audit entries + last-30d
// ticket count. Powers `/platform/customers/[orgId]`.
//
// Phase C-2 of OPERATOR_CONSOLE.md.

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

interface RouteParams { params: Promise<{ orgId: string }> }

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.user.isOperator && !(await gateOperator(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { orgId } = await params;

  const [{ data: org }, { data: sub }] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('id, slug, name, status, state, country, primary_admin_email, billing_contact_email, phone, created_at, metadata')
      .eq('id', orgId)
      .maybeSingle(),
    supabaseAdmin
      .from('subscriptions')
      .select('status, bundles, seat_count, base_price_cents, per_seat_price_cents, trial_ends_at, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id')
      .eq('org_id', orgId)
      .maybeSingle(),
  ]);

  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [{ count: memberCount }, { count: invoiceCount }, { data: recentAudit }, { count: openTickets }] = await Promise.all([
    supabaseAdmin
      .from('organization_members')
      .select('user_email', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active'),
    supabaseAdmin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabaseAdmin
      .from('audit_log')
      .select('id, operator_email, customer_email, action, severity, created_at, metadata')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(25),
    supabaseAdmin
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', ['open', 'awaiting_customer', 'awaiting_operator']),
  ]);

  return NextResponse.json({
    org: {
      id: org.id,
      slug: org.slug,
      name: org.name,
      status: org.status,
      state: org.state,
      country: org.country,
      primaryAdminEmail: org.primary_admin_email,
      billingContactEmail: org.billing_contact_email,
      phone: org.phone,
      createdAt: org.created_at,
    },
    subscription: sub ? {
      status: sub.status,
      bundles: (sub.bundles as string[]) ?? [],
      seatCount: sub.seat_count ?? 0,
      baseCents: sub.base_price_cents ?? 0,
      perSeatCents: sub.per_seat_price_cents ?? 0,
      trialEndsAt: sub.trial_ends_at ?? null,
      currentPeriodEnd: sub.current_period_end ?? null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      stripeCustomerId: sub.stripe_customer_id ?? null,
      stripeSubscriptionId: sub.stripe_subscription_id ?? null,
    } : null,
    stats: {
      memberCount: memberCount ?? 0,
      invoiceCount: invoiceCount ?? 0,
      openTickets: openTickets ?? 0,
    },
    recentAudit: (recentAudit ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      operatorEmail: (r.operator_email as string | null) ?? null,
      customerEmail: (r.customer_email as string | null) ?? null,
      action: r.action as string,
      severity: (r.severity as string) ?? 'info',
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt: r.created_at as string,
    })),
  });
}
