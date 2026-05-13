// app/api/admin/billing/cancel/route.ts
//
// Schedule a subscription to cancel at the end of the current
// billing period. Sets cancel_at_period_end=true; the Stripe webhook
// (or daily reconciliation cron) handles the actual final-period
// behavior. The customer still has access until current_period_end.
//
// 30-day grace per §6 of master plan: between cancel and final
// deactivation, data is preserved + admin can reactivate from
// `/admin/billing`.
//
// Phase D-2 follow-up of CUSTOMER_PORTAL.md.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  let body: { reason?: string; reactivate?: boolean };
  try { body = await req.json(); } catch { body = {}; }

  const reactivate = body.reactivate === true;

  const { data: sub, error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      cancel_at_period_end: !reactivate,
      canceled_at: reactivate ? null : new Date().toISOString(),
    })
    .eq('org_id', user.default_org_id)
    .select('id, status, current_period_end, cancel_at_period_end')
    .maybeSingle();

  if (error || !sub) {
    console.error('[billing/cancel] update failed', error);
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }

  // Lifecycle event row
  await supabaseAdmin.from('subscription_events').insert({
    org_id: user.default_org_id,
    event_type: reactivate ? 'reactivate_canceled' : 'schedule_cancel',
    triggered_by: `customer:${session.user.email}`,
    metadata: { reason: body.reason ?? null },
  });

  await supabaseAdmin.from('audit_log').insert({
    org_id: user.default_org_id,
    customer_email: session.user.email,
    action: reactivate ? 'SUBSCRIPTION_REACTIVATED' : 'SUBSCRIPTION_CANCEL_SCHEDULED',
    severity: reactivate ? 'info' : 'warning',
    metadata: { reason: body.reason ?? null },
  });

  return NextResponse.json({
    ok: true,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    currentPeriodEnd: sub.current_period_end,
  });
}
