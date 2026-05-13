// app/api/admin/billing/route.ts
//
// Customer billing overview API. Returns org + active subscription
// state. Phase D-2 GET portion.
//
// PATCH/POST for plan changes lands in follow-up slices when the
// Stripe-side flow is wired.
//
// Spec: docs/planning/in-progress/CUSTOMER_PORTAL.md §3.3.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();

  if (!user?.default_org_id) {
    return NextResponse.json({ org: null, subscription: null });
  }

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, slug, name')
    .eq('id', user.default_org_id)
    .maybeSingle();

  if (!org) {
    return NextResponse.json({ org: null, subscription: null });
  }

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('status, bundles, seat_count, base_price_cents, per_seat_price_cents, trial_ends_at, current_period_end, cancel_at_period_end')
    .eq('org_id', user.default_org_id)
    .maybeSingle();

  return NextResponse.json({
    org: {
      id: org.id,
      slug: org.slug,
      name: org.name,
    },
    subscription: sub ? {
      status: sub.status,
      bundles: (sub.bundles as string[]) ?? [],
      seatCount: (sub.seat_count as number) ?? 0,
      baseCents: (sub.base_price_cents as number) ?? 0,
      perSeatCents: (sub.per_seat_price_cents as number) ?? 0,
      trialEndsAt: (sub.trial_ends_at as string | null) ?? null,
      currentPeriodEnd: (sub.current_period_end as string | null) ?? null,
      cancelAtPeriodEnd: (sub.cancel_at_period_end as boolean) ?? false,
    } : null,
  });
}
