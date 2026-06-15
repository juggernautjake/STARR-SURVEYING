// app/api/admin/leads/[id]/route.ts
//
// GET /api/admin/leads/{id} — single-lead fetch for the detail page.
//
// The list endpoint at /api/admin/leads already returns every lead;
// the detail page could read from that, but the user's experience
// would be flaky: a fresh browser tab opened via the notification
// deep link would have to wait for the list endpoint AND then find
// the matching row. A focused single-row fetch keeps the surface
// fast under poor connections and lets RLS / auth checks scope
// per-id later without leaking the rest of the pipeline.
//
// mobile-and-customer-query-gap Slice S1 (detail page).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const SELECT_COLS =
  'id, name, email, phone, company, source, status, notes, property_address, city, state, survey_type, estimated_acreage, quote_amount, assigned_to, follow_up_date, converted_job_id, created_by, created_at, updated_at';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin(session.user.roles)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { error: null as null, session };
}

export const GET = withErrorHandler(
  async (req: NextRequest) => {
    const gate = await requireAdmin();
    if (gate.error) return gate.error;

    // `withErrorHandler` only forwards `req`, not Next's `ctx.params`,
    // so we parse the id off the URL pathname. Path is always
    //   /api/admin/leads/<id>
    // so the last non-empty segment is the lead id.
    const pathname = new URL(req.url).pathname;
    const segments = pathname.split('/').filter((s) => s.length > 0);
    const id = segments[segments.length - 1];
    if (!id || id === 'leads') {
      return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('leads')
      .select(SELECT_COLS)
      .eq('id', id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    return NextResponse.json({ lead: data });
  },
  { routeName: 'admin/leads/[id]' },
);
