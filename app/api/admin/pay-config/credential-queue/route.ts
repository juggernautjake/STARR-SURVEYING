// app/api/admin/pay-config/credential-queue/route.ts
//
// Admin approval queue for pending earned credentials.
// P-21 of PAY_PROGRESSION_OVERHAUL.md.
//
// GET                          — list all employee_earned_credentials with
//                                verified=false. Joined with credential_bonuses
//                                so the queue shows the pay bump that will be
//                                granted on approval.
// POST { id, action: 'approve' } — flips verified=true, stamps verified_at
//                                and verified_by. The effect on pay flows
//                                through the rewards API's verified=true
//                                filter — no row in pay_raises is written
//                                because hourly_rate isn't directly modified;
//                                the bump is a calculated component. (If/when
//                                payroll-run reads hourly_rate directly, a
//                                follow-up slice can wire pay_raises here.)
// POST { id, action: 'deny' }   — deletes the pending row.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface QueueAction {
  id: string;
  action: 'approve' | 'deny';
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async () => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  // Fetch pending rows; resolve each row's credential label + bonus by
  // joining against credential_bonuses (table is small enough to JS-join).
  const { data: pending, error } = await supabaseAdmin
    .from('employee_earned_credentials')
    .select('id, user_email, credential_key, earned_date, source, created_at')
    .eq('verified', false)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const keys = Array.from(new Set((pending || []).map((p: { credential_key: string }) => p.credential_key)));
  let bonuses: { credential_key: string; label: string | null; bonus_per_hour: number }[] = [];
  if (keys.length > 0) {
    const { data } = await supabaseAdmin
      .from('credential_bonuses')
      .select('credential_key, label, bonus_per_hour')
      .in('credential_key', keys);
    bonuses = data || [];
  }
  const bonusMap = new Map(bonuses.map(b => [b.credential_key, b]));

  const queue = (pending || []).map((p: { id: string; user_email: string; credential_key: string; earned_date: string; source: string | null; created_at: string }) => ({
    ...p,
    bonus_per_hour: bonusMap.get(p.credential_key)?.bonus_per_hour ?? null,
    credential_label: bonusMap.get(p.credential_key)?.label ?? null,
  }));

  return NextResponse.json({ queue });
}, { routeName: 'pay-config/credential-queue/GET' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as QueueAction;
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (body.action !== 'approve' && body.action !== 'deny') {
    return NextResponse.json({ error: 'action must be "approve" or "deny"' }, { status: 400 });
  }

  if (body.action === 'deny') {
    const { error } = await supabaseAdmin
      .from('employee_earned_credentials')
      .delete()
      .eq('id', body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ denied: body.id });
  }

  // Approve: flip verified=true, stamp the auditor.
  const { data, error } = await supabaseAdmin
    .from('employee_earned_credentials')
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
      verified_by: gate.email,
    })
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ approved: data });
}, { routeName: 'pay-config/credential-queue/POST' });
