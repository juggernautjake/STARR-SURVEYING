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
import { awardXP } from '@/lib/xp';

// G1 (2026-06-21) — Safety badges. When a safety credential is verified,
// grant the matching catalogue badge (seeds/001_config.sql) idempotently.
const SAFETY_BADGE_FOR: Record<string, string> = {
  osha_30: 'osha_certified',
  osha_10: 'osha_certified',
  first_aid_cpr: 'first_aid_ready',
  hazwoper: 'hazwoper_qualified',
  field_safety: 'field_safety_done',
};

/** Award a badge to a user by badge_key — idempotent (no-op if already
 *  earned or the badge_key doesn't exist), mirrors the /badges POST flow. */
async function awardBadge(userEmail: string, badgeKey: string): Promise<void> {
  const { data: badge } = await supabaseAdmin
    .from('badges')
    .select('id, name, xp_reward')
    .eq('badge_key', badgeKey)
    .maybeSingle();
  if (!badge) return;
  const { data: existing } = await supabaseAdmin
    .from('user_badges')
    .select('id')
    .eq('user_email', userEmail)
    .eq('badge_id', badge.id)
    .maybeSingle();
  if (existing) return;
  await supabaseAdmin.from('user_badges').insert({
    user_email: userEmail,
    badge_id: badge.id,
    awarded_by: 'system:credential-verified',
  });
  if (badge.xp_reward > 0) {
    try {
      await awardXP(userEmail, badge.xp_reward, 'badge_earned', 'badge', badge.id,
        `Badge earned: ${badge.name} (+${badge.xp_reward} XP)`);
    } catch { /* XP failure shouldn't block the badge */ }
  }
}

/** After a safety credential is verified, grant its badge + the
 *  "Safety First" entry badge, and "Safety Champion" once every core
 *  safety credential is verified. */
async function awardSafetyBadges(userEmail: string, credentialKey: string): Promise<void> {
  const specific = SAFETY_BADGE_FOR[credentialKey];
  if (!specific) return; // not a safety credential
  await awardBadge(userEmail, specific);
  await awardBadge(userEmail, 'safety_first');
  const { data: verified } = await supabaseAdmin
    .from('employee_earned_credentials')
    .select('credential_key')
    .eq('user_email', userEmail)
    .eq('verified', true);
  const keys = new Set((verified ?? []).map((v: { credential_key: string }) => v.credential_key));
  const hasOsha = keys.has('osha_30') || keys.has('osha_10');
  if (hasOsha && keys.has('first_aid_cpr') && keys.has('hazwoper') && keys.has('field_safety')) {
    await awardBadge(userEmail, 'safety_champion');
  }
}

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

  // G1 — grant safety badges when a safety credential is verified.
  // Best-effort: never block the approval response on a badge hiccup.
  if (data?.user_email && data?.credential_key) {
    try {
      await awardSafetyBadges(data.user_email, data.credential_key);
    } catch { /* swallow — approval already succeeded */ }
  }

  return NextResponse.json({ approved: data });
}, { routeName: 'pay-config/credential-queue/POST' });
