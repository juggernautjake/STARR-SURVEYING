// app/api/admin/billing/plan-history/route.ts
//
// Customer billing plan-history API. Lists `subscription_events`
// rows for the caller's org — every plan change, bundle addition,
// cancellation schedule, reactivation, trial conversion.
//
// Phase D-2 of CUSTOMER_PORTAL.md.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface EventRow {
  id: string;
  eventType: string;
  triggeredBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function GET(): Promise<NextResponse<{ events: EventRow[] } | { error: string }>> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user?.default_org_id) return NextResponse.json({ events: [] });

  const { data, error } = await supabaseAdmin
    .from('subscription_events')
    .select('id, event_type, triggered_by, metadata, created_at')
    .eq('org_id', user.default_org_id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[admin/billing/plan-history] query failed', error);
    return NextResponse.json({ error: 'Failed to load plan history' }, { status: 500 });
  }

  const events: EventRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    eventType: r.event_type as string,
    triggeredBy: (r.triggered_by as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
  }));

  return NextResponse.json({ events });
}
