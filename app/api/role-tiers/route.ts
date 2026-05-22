// app/api/role-tiers/route.ts
//
// Public(-ish) read of the role_tiers table. Returns the catalog of pay
// tiers (label / description / icon / sort order) for any authenticated
// user. Used by client-side hooks that need to render a tier dropdown
// or look up a label for a tier_key.
//
// This route deliberately does NOT live under /api/admin/ — the data is
// safe for any employee to see (it's the same data shown on the public
// pay-progression page) and several non-admin surfaces (MyPayPanel, the
// rewards page) need it.
//
// Compensation values (base_bonus, max_effective_rate) are intentionally
// returned alongside label/icon — the pay-progression page already shows
// them publicly to employees, so they're not sensitive.

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('role_tiers')
    .select('role_key, label, description, icon, base_bonus, max_effective_rate, sort_order, aliases')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('base_bonus', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tiers: data || [] });
}, { routeName: 'role-tiers' });
