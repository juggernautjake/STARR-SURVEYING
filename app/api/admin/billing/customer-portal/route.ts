// app/api/admin/billing/customer-portal/route.ts
//
// Stripe Customer Portal redirect. POST returns { url: ... } so the
// client can window.location to it. Until the operator wires up
// Stripe products + saves the customer id on the subscription, we
// return 503 with a friendly explanation.
//
// Phase D-2 follow-up of CUSTOMER_PORTAL.md (Stripe one-click
// upgrade flow). When `STRIPE_SECRET_KEY` is configured AND the
// subscription has a stripe_customer_id, we open a portal session;
// otherwise we surface the pending-billing state.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
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

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id, status')
    .eq('org_id', user.default_org_id)
    .maybeSingle();

  if (!sub?.stripe_customer_id || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      {
        error: 'billing_pending',
        message:
          'Stripe billing is being finalized by the Starr Software team. You will receive an email once your payment methods can be managed self-serve.',
      },
      { status: 503 },
    );
  }

  // Real Stripe portal-session creation lands when STRIPE_SECRET_KEY
  // is wired and BUNDLES carries the product price IDs. The exact
  // SDK call shape lives in SUBSCRIPTION_BILLING_SYSTEM.md §6 B-5.
  return NextResponse.json(
    {
      error: 'not_implemented',
      message:
        'Stripe Customer Portal integration ships in Phase B-5 of SUBSCRIPTION_BILLING_SYSTEM.md once products are live.',
    },
    { status: 501 },
  );
}
