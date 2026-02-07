// app/api/admin/employees/manage/route.ts — Admin employee management
// Handles: role changes, credential attribution, pay modifiers, profile notes
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// Helper: create notification + profile change for employee
async function notifyEmployee(
  userEmail: string,
  changeType: string,
  title: string,
  description: string,
  changedBy: string,
  oldValue?: string,
  newValue?: string,
  link?: string
) {
  // Log in employee_profile_changes
  await supabaseAdmin.from('employee_profile_changes').insert({
    user_email: userEmail,
    change_type: changeType,
    title,
    description,
    old_value: oldValue || null,
    new_value: newValue || null,
    changed_by: changedBy,
  });

  // Also create a notification
  await supabaseAdmin.from('notifications').insert({
    user_email: userEmail,
    type: 'profile_change',
    title,
    body: description,
    icon: changeType === 'pay_raise' ? '💰' : changeType === 'role_change' ? '🎉' : changeType === 'credential_added' ? '🏅' : changeType === 'bonus_awarded' ? '🎁' : '📋',
    link: link || '/admin/profile',
    source_type: 'payroll',
  });
}

// GET: Fetch full employee management data
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  // Fetch employee profile
  const { data: profile } = await supabaseAdmin
    .from('employee_profiles')
    .select('*')
    .eq('user_email', email)
    .single();

  // Fetch role tier info
  const { data: roleTiers } = await supabaseAdmin.from('role_tiers').select('*').order('sort_order');

  // Fetch certifications
  const { data: certs } = await supabaseAdmin
    .from('employee_certifications')
    .select('*')
    .eq('user_email', email)
    .order('created_at', { ascending: false });

  // Fetch earned credentials (from v2 system)
  const { data: earnedCreds } = await supabaseAdmin
    .from('employee_earned_credentials')
    .select('*')
    .eq('user_email', email);

  // Fetch credential bonuses reference
  const { data: credBonuses } = await supabaseAdmin.from('credential_bonuses').select('*').order('sort_order');

  // Fetch role history
  const { data: roleHistory } = await supabaseAdmin
    .from('employee_role_history')
    .select('*')
    .eq('user_email', email)
    .order('created_at', { ascending: false });

  // Fetch learning credits
  const { data: credits } = await supabaseAdmin
    .from('employee_learning_credits')
    .select('*')
    .eq('user_email', email)
    .order('earned_at', { ascending: false });

  const totalPoints = (credits || []).reduce((sum: number, c: { points_earned: number }) => sum + c.points_earned, 0);

  // Fetch threshold achievements
  const { data: achievements } = await supabaseAdmin
    .from('employee_threshold_achievements')
    .select('*')
    .eq('user_email', email);

  // Fetch recent profile changes
  const { data: changes } = await supabaseAdmin
    .from('employee_profile_changes')
    .select('*')
    .eq('user_email', email)
    .order('created_at', { ascending: false })
    .limit(50);

  // Fetch seniority bracket
  const yearsEmployed = profile?.hire_date
    ? Math.floor((Date.now() - new Date(profile.hire_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;

  const { data: seniorityBrackets } = await supabaseAdmin.from('seniority_brackets').select('*').order('min_years');

  return NextResponse.json({
    profile: profile || null,
    role_tiers: roleTiers || [],
    certifications: certs || [],
    earned_credentials: earnedCreds || [],
    credential_bonuses: credBonuses || [],
    role_history: roleHistory || [],
    learning_credits: credits || [],
    total_points: totalPoints,
    threshold_achievements: achievements || [],
    profile_changes: changes || [],
    seniority_brackets: seniorityBrackets || [],
    years_employed: yearsEmployed,
  });
}, { routeName: 'employees/manage' });

// POST: Perform management actions
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { action, email } = body as { action: string; email: string; [key: string]: unknown };
  if (!action || !email) return NextResponse.json({ error: 'action and email required' }, { status: 400 });
  const adminEmail = session.user.email;

  switch (action) {
    // ─── Change Role/Tier ───
    case 'change_role': {
      const { new_role, new_tier, reason } = body as { new_role: string; new_tier: string; reason: string; [key: string]: unknown };
      if (!new_role || !new_tier || !reason) return NextResponse.json({ error: 'new_role, new_tier, reason required' }, { status: 400 });

      // Get current profile
      const { data: profile } = await supabaseAdmin.from('employee_profiles').select('job_title').eq('user_email', email).single();
      const oldRole = profile?.job_title || 'unknown';

      // Get old and new tier bonuses
      const { data: oldTierData } = await supabaseAdmin.from('role_tiers').select('base_bonus, label').eq('role_key', oldRole).single();
      const { data: newTierData } = await supabaseAdmin.from('role_tiers').select('base_bonus, label').eq('role_key', new_tier).single();
      const payImpact = (newTierData?.base_bonus || 0) - (oldTierData?.base_bonus || 0);

      // Update profile
      await supabaseAdmin.from('employee_profiles').update({ job_title: new_role }).eq('user_email', email);

      // Log role history
      await supabaseAdmin.from('employee_role_history').insert({
        user_email: email, old_role: oldRole, new_role, old_tier: oldRole, new_tier,
        reason, effective_date: new Date().toISOString().split('T')[0],
        changed_by: adminEmail, pay_impact: payImpact,
      });

      // Log payout if pay impact
      let payoutLogId = null;
      if (payImpact !== 0) {
        const { data: pl } = await supabaseAdmin.from('payout_log').insert({
          user_email: email, payout_type: 'promotion_raise', amount: payImpact,
          reason: `Role change: ${oldTierData?.label || oldRole} → ${newTierData?.label || new_role}`,
          details: reason, old_rate: oldTierData?.base_bonus, new_rate: newTierData?.base_bonus,
          old_role: oldRole, new_role, source_type: 'admin_manual',
          processed_by: adminEmail,
        }).select('id').single();
        payoutLogId = pl?.id;
      }

      // Notify employee
      await notifyEmployee(
        email, 'role_change',
        `Role Updated: ${newTierData?.label || new_role}`,
        `You have been ${payImpact > 0 ? 'promoted' : 'reassigned'} to ${newTierData?.label || new_role}. ${payImpact !== 0 ? `Pay impact: ${payImpact > 0 ? '+' : ''}$${payImpact.toFixed(2)}/hr` : ''}`,
        adminEmail, oldTierData?.label || oldRole, newTierData?.label || new_role
      );

      // Activity log
      try {
        await supabaseAdmin.from('activity_log').insert({
          user_email: adminEmail, action_type: 'role_change',
          entity_type: 'employee', entity_id: email,
          metadata: { old_role: oldRole, new_role, new_tier, reason, pay_impact: payImpact, payout_log_id: payoutLogId },
        });
      } catch { /* ignore */ }

      return NextResponse.json({ success: true, pay_impact: payImpact });
    }

    // ─── Grant Credential ───
    case 'grant_credential': {
      const { credential_key, earned_date, notes: credNotes } = body as { credential_key: string; earned_date?: string; notes?: string; [key: string]: unknown };
      if (!credential_key) return NextResponse.json({ error: 'credential_key required' }, { status: 400 });

      // Get credential info
      const { data: credInfo } = await supabaseAdmin.from('credential_bonuses').select('*').eq('credential_key', credential_key).single();
      if (!credInfo) return NextResponse.json({ error: 'Invalid credential' }, { status: 400 });

      // Upsert earned credential
      const { error: insertErr } = await supabaseAdmin.from('employee_earned_credentials').upsert({
        user_email: email, credential_key,
        earned_date: earned_date || new Date().toISOString().split('T')[0],
        verified: true, verified_by: adminEmail, verified_at: new Date().toISOString(),
        notes: credNotes || null,
      }, { onConflict: 'user_email,credential_key' });

      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

      // Log payout for credential bonus
      if (credInfo.bonus_per_hour > 0) {
        await supabaseAdmin.from('payout_log').insert({
          user_email: email, payout_type: 'credential_bonus',
          amount: credInfo.bonus_per_hour,
          reason: `Credential earned: ${credInfo.label} (+$${credInfo.bonus_per_hour}/hr)`,
          details: credNotes || null,
          source_type: 'credential', processed_by: adminEmail,
        });
      }

      // Notify employee
      await notifyEmployee(
        email, 'credential_added',
        `Credential Earned: ${credInfo.label}`,
        `${credInfo.label} has been added to your profile. ${credInfo.bonus_per_hour > 0 ? `This adds +$${credInfo.bonus_per_hour}/hr to your pay.` : ''}`,
        adminEmail, undefined, credInfo.label
      );

      return NextResponse.json({ success: true, bonus: credInfo.bonus_per_hour });
    }

    // ─── Remove Credential ───
    case 'remove_credential': {
      const { credential_key: removeKey } = body as { credential_key: string; [key: string]: unknown };
      if (!removeKey) return NextResponse.json({ error: 'credential_key required' }, { status: 400 });

      const { data: credInfo2 } = await supabaseAdmin.from('credential_bonuses').select('label').eq('credential_key', removeKey).single();

      await supabaseAdmin.from('employee_earned_credentials').delete().eq('user_email', email).eq('credential_key', removeKey);

      await notifyEmployee(
        email, 'credential_removed',
        `Credential Removed: ${credInfo2?.label || removeKey}`,
        `${credInfo2?.label || removeKey} has been removed from your profile.`,
        adminEmail, credInfo2?.label || removeKey, undefined
      );

      return NextResponse.json({ success: true });
    }

    // ─── Award Manual Bonus ───
    case 'award_bonus': {
      const { amount, bonus_type, reason: bonusReason, notes: bonusNotes } = body as {
        amount: number; bonus_type: string; reason: string; notes?: string; [key: string]: unknown;
      };
      if (!amount || amount <= 0 || !bonusReason) return NextResponse.json({ error: 'amount and reason required' }, { status: 400 });

      await supabaseAdmin.from('payout_log').insert({
        user_email: email, payout_type: bonus_type || 'bonus',
        amount, reason: bonusReason, details: bonusNotes || null,
        source_type: 'admin_manual', processed_by: adminEmail,
      });

      await notifyEmployee(
        email, 'bonus_awarded',
        `Bonus Awarded: $${amount.toFixed(2)}`,
        `You received a $${amount.toFixed(2)} ${bonus_type?.replace('_', ' ') || 'bonus'}. Reason: ${bonusReason}`,
        adminEmail
      );

      return NextResponse.json({ success: true });
    }

    // ─── Apply Pay Raise ───
    case 'pay_raise': {
      const { raise_amount, reason: raiseReason } = body as { raise_amount: number; reason: string; [key: string]: unknown };
      if (!raise_amount || !raiseReason) return NextResponse.json({ error: 'raise_amount and reason required' }, { status: 400 });

      const { data: profile2 } = await supabaseAdmin.from('employee_profiles').select('hourly_rate').eq('user_email', email).single();
      const oldRate = profile2?.hourly_rate || 0;
      const newRate = oldRate + raise_amount;

      await supabaseAdmin.from('employee_profiles').update({ hourly_rate: newRate }).eq('user_email', email);

      // Log in pay_raises table
      await supabaseAdmin.from('pay_raises').insert({
        user_email: email, old_rate: oldRate, new_rate: newRate,
        raise_amount, reason: raiseReason, effective_date: new Date().toISOString().split('T')[0],
        approved_by: adminEmail,
      });

      // Log in payout_log
      await supabaseAdmin.from('payout_log').insert({
        user_email: email, payout_type: 'pay_raise', amount: raise_amount,
        reason: raiseReason, old_rate: oldRate, new_rate: newRate,
        source_type: 'admin_manual', processed_by: adminEmail,
      });

      await notifyEmployee(
        email, 'pay_raise',
        `Pay Raise: +$${raise_amount.toFixed(2)}/hr`,
        `Your hourly rate has been increased from $${oldRate.toFixed(2)} to $${newRate.toFixed(2)}. Reason: ${raiseReason}`,
        adminEmail, `$${oldRate.toFixed(2)}/hr`, `$${newRate.toFixed(2)}/hr`
      );

      return NextResponse.json({ success: true, old_rate: oldRate, new_rate: newRate });
    }

    // ─── Award Learning Credits ───
    case 'award_credits': {
      const { points, credit_reason, entity_type: entType, entity_id: entId } = body as {
        points: number; credit_reason: string; entity_type?: string; entity_id?: string; [key: string]: unknown;
      };
      if (!points || points <= 0 || !credit_reason) return NextResponse.json({ error: 'points and credit_reason required' }, { status: 400 });

      await supabaseAdmin.from('employee_learning_credits').insert({
        user_email: email, entity_type: entType || 'manual', entity_id: entId || null,
        entity_label: credit_reason, points_earned: points,
        source_type: 'manual', awarded_by: adminEmail, notes: credit_reason,
      });

      await notifyEmployee(
        email, 'bonus_awarded',
        `${points} Learning Credits Awarded`,
        `You earned ${points} learning credits. Reason: ${credit_reason}`,
        adminEmail
      );

      return NextResponse.json({ success: true });
    }

    // ─── Add Profile Note ───
    case 'add_note': {
      const { note, visible_to_employee } = body as { note: string; visible_to_employee?: boolean; [key: string]: unknown };
      if (!note) return NextResponse.json({ error: 'note required' }, { status: 400 });

      if (visible_to_employee) {
        await notifyEmployee(email, 'note_added', 'Admin Note', note, adminEmail);
      }

      // Log in activity
      try {
        await supabaseAdmin.from('activity_log').insert({
          user_email: adminEmail, action_type: 'admin_note',
          entity_type: 'employee', entity_id: email,
          metadata: { note, visible: visible_to_employee },
        });
      } catch { /* ignore */ }

      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}, { routeName: 'employees/manage' });
