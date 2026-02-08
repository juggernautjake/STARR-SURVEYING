// lib/xp.ts — XP award helper (shared across API routes)
import { supabaseAdmin } from '@/lib/supabase';

export async function awardXP(
  userEmail: string,
  amount: number,
  transactionType: string,
  sourceType: string,
  sourceId: string | null,
  description: string
) {
  // Get or create balance
  let { data: balance } = await supabaseAdmin.from('xp_balances')
    .select('*').eq('user_email', userEmail).maybeSingle();

  if (!balance) {
    const { data: newBal } = await supabaseAdmin.from('xp_balances')
      .insert({ user_email: userEmail, current_balance: 0, total_earned: 0, total_spent: 0 })
      .select().single();
    balance = newBal;
  }

  const newCurrent = (balance?.current_balance || 0) + amount;
  const newTotal = (balance?.total_earned || 0) + amount;

  await supabaseAdmin.from('xp_balances')
    .upsert({
      user_email: userEmail,
      current_balance: newCurrent,
      total_earned: newTotal,
      total_spent: balance?.total_spent || 0,
      last_updated: new Date().toISOString(),
    }, { onConflict: 'user_email' });

  await supabaseAdmin.from('xp_transactions').insert({
    user_email: userEmail,
    amount,
    transaction_type: transactionType,
    source_type: sourceType,
    source_id: sourceId,
    description,
    balance_after: newCurrent,
  });

  // Check for new milestone achievements
  const { data: milestones } = await supabaseAdmin.from('xp_pay_milestones')
    .select('*').eq('is_active', true).lte('xp_threshold', newTotal).order('xp_threshold');

  const { data: existing } = await supabaseAdmin.from('xp_milestone_achievements')
    .select('milestone_id').eq('user_email', userEmail);

  const existingIds = new Set((existing || []).map((e: { milestone_id: string }) => e.milestone_id));
  const newMilestones: { id: string; label: string; bonus_per_hour: number }[] = [];

  for (const m of (milestones || []) as { id: string; label: string; bonus_per_hour: number; xp_threshold: number }[]) {
    if (!existingIds.has(m.id)) {
      await supabaseAdmin.from('xp_milestone_achievements')
        .insert({ user_email: userEmail, milestone_id: m.id });
      newMilestones.push(m);

      // Notify
      try {
        await supabaseAdmin.from('notifications').insert({
          user_email: userEmail,
          type: 'milestone_reached',
          title: `XP Milestone: ${m.label}!`,
          message: `You reached ${m.xp_threshold} total XP! This earns you a +$${m.bonus_per_hour}/hr pay bonus.`,
          is_read: false,
        });
      } catch { /* ignore */ }
    }
  }

  return {
    balance: newCurrent,
    total_earned: newTotal,
    xp_awarded: amount,
    new_milestones: newMilestones,
  };
}
