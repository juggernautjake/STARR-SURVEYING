// app/api/platform/customers/route.ts
//
// Operator-side cross-tenant customer list. Joins organizations
// with their subscriptions for the table-row payload.
//
// Phase C-2 of OPERATOR_CONSOLE.md.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface CustomerRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  state: string | null;
  primaryAdminEmail: string;
  foundedAt: string;
  bundles: string[];
  monthlyMrrCents: number;
  seatCount: number;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Operator gate (M-9 will put isOperator in JWT; until then look up).
  if (!session.user.isOperator) {
    const { data: opr } = await supabaseAdmin
      .from('operator_users')
      .select('email, status')
      .eq('email', session.user.email)
      .maybeSingle();
    if (!opr || opr.status !== 'active') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Pull every org + its subscription. Two queries since Supabase JS
  // joins are syntactically heavier; cheap to merge in-memory at
  // current scale.
  const { data: orgs, error: oErr } = await supabaseAdmin
    .from('organizations')
    .select('id, slug, name, status, state, primary_admin_email, founded_at')
    .is('deleted_at', null)
    .order('founded_at', { ascending: false })
    .limit(500);
  if (oErr) {
    console.error('[customers] orgs query failed', oErr);
    return NextResponse.json({ error: 'Failed to load orgs' }, { status: 500 });
  }

  const orgIds = (orgs ?? []).map((o: { id: string }) => o.id);
  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('org_id, bundles, base_price_cents, per_seat_price_cents, seat_count')
    .in('org_id', orgIds);

  const subByOrg = new Map<string, { bundles: string[]; baseCents: number; perSeatCents: number; seatCount: number }>();
  for (const s of subs ?? []) {
    subByOrg.set(s.org_id as string, {
      bundles: (s.bundles as string[]) ?? [],
      baseCents: (s.base_price_cents as number | null) ?? 0,
      perSeatCents: (s.per_seat_price_cents as number | null) ?? 0,
      seatCount: (s.seat_count as number | null) ?? 0,
    });
  }

  const customers: CustomerRow[] = (orgs ?? []).map((o: Record<string, unknown>) => {
    const sub = subByOrg.get(o.id as string);
    const monthlyMrrCents = sub
      ? sub.baseCents + sub.perSeatCents * Math.max(0, sub.seatCount - 5)
      // Default rough MRR estimate when no sub row exists (shouldn't
      // happen post-M-2 but fail-safe).
      : 0;
    return {
      id: o.id as string,
      slug: o.slug as string,
      name: o.name as string,
      status: o.status as string,
      state: (o.state as string | null) ?? null,
      primaryAdminEmail: o.primary_admin_email as string,
      foundedAt: o.founded_at as string,
      bundles: sub?.bundles ?? [],
      monthlyMrrCents,
      seatCount: sub?.seatCount ?? 0,
    };
  });

  return NextResponse.json({ customers });
}
