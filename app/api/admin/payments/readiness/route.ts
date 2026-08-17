// app/api/admin/payments/readiness/route.ts — can real money move, and if not, what is stopping it?
//
// M-slice of docs/planning/pending/MONEY_RAILS_AND_CARDS_2026-08-17.md.
//
// The plan asks the owner to verify five things by hand across three dashboards before setting
// `PAYMENTS_LIVE=true`. Four are answerable from the server instantly and the fifth from the
// database, so they are — a checklist walked by hand is walked once, on the day it is written, while
// the switch stays on forever afterwards.
//
// ── ADMIN ONLY, AND IT RETURNS NO SECRETS ───────────────────────────────────────────────────────
//
// The verdicts carry a CLASSIFICATION of each key (live / test / malformed / missing) and never the
// key. A readiness endpoint that echoes the secret it is checking is a worse problem than the one it
// solves, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` being safe to publish does not make the others so.
// Pinned by a test in `__tests__/payments/readiness.test.ts`.
import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { paymentsReadiness, readinessSummary } from '@/lib/payments/readiness';

export const runtime = 'nodejs';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Everything here describes how the firm gets paid. Not a read for the whole staff.
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  // Only cards that are still in service. A retired card cannot match a new receipt, so counting it
  // would report the register as populated when nothing on it is usable.
  const { count } = await supabaseAdmin
    .from('payment_cards')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'COMPANY')
    .is('retired_at', null);

  const checks = paymentsReadiness({ companyCards: count ?? 0 });
  return NextResponse.json({ summary: readinessSummary(checks), checks });
}, { routeName: 'admin/payments/readiness' });
