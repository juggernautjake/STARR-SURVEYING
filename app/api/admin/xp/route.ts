// app/api/admin/xp/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { awardXP } from '@/lib/xp';

/* GET — XP balance, transactions, milestones for a user */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const targetEmail = searchParams.get('user_email') && isAdmin(session.user.email)
    ? searchParams.get('user_email')!
    : session.user.email;

  // Get or create XP balance
  let { data: balance } = await supabaseAdmin.from('xp_balances')
    .select('*').eq('user_email', targetEmail).maybeSingle();
  if (!balance) {
    balance = { user_email: targetEmail, current_balance: 0, total_earned: 0, total_spent: 0 };
  }

  // Recent transactions
  const { data: transactions } = await supabaseAdmin.from('xp_transactions')
    .select('*').eq('user_email', targetEmail)
    .order('created_at', { ascending: false }).limit(50);

  // All milestones and which ones achieved
  const { data: milestones } = await supabaseAdmin.from('xp_pay_milestones')
    .select('*').eq('is_active', true).order('xp_threshold');

  const { data: achievements } = await supabaseAdmin.from('xp_milestone_achievements')
    .select('milestone_id, achieved_at').eq('user_email', targetEmail);

  const achievedIds = new Set((achievements || []).map((a: { milestone_id: string }) => a.milestone_id));

  const milestonesWithStatus = (milestones || []).map((m: { id: string; xp_threshold: number; bonus_per_hour: number; label: string; description: string }) => ({
    ...m,
    achieved: achievedIds.has(m.id),
    progress: Math.min(100, Math.round((balance!.total_earned / m.xp_threshold) * 100)),
  }));

  // Badges
  const { data: userBadges } = await supabaseAdmin.from('user_badges')
    .select('badge_id, earned_at, badges(*)').eq('user_email', targetEmail);

  // Next milestone
  const nextMilestone = (milestones || []).find(
    (m: { xp_threshold: number }) => m.xp_threshold > balance!.total_earned
  );

  // Current XP pay bonus (sum of achieved milestone bonuses)
  const currentXpBonus = (milestones || [])
    .filter((m: { id: string; xp_threshold: number }) => achievedIds.has(m.id))
    .reduce((sum: number, m: { bonus_per_hour: number }) => sum + m.bonus_per_hour, 0);

  return NextResponse.json({
    balance,
    transactions: transactions || [],
    milestones: milestonesWithStatus,
    badges: userBadges || [],
    next_milestone: nextMilestone || null,
    current_xp_pay_bonus: currentXpBonus,
  });
}, { routeName: 'xp' });

/* POST — Award XP, admin adjustment, check milestones */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === 'award_xp') {
    // Only admins can manually award XP
    if (!isAdmin(session.user.email)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { user_email, amount, description, transaction_type, source_type, source_id } = body;
    if (!user_email || !amount || !description) {
      return NextResponse.json({ error: 'user_email, amount, and description required' }, { status: 400 });
    }

    const result = await awardXP(user_email, amount, transaction_type || 'admin_adjustment', source_type || 'admin', source_id || null, description);
    return NextResponse.json(result);
  }

  if (action === 'set_xp') {
    // Admin-only: directly set current_balance and/or total_earned
    if (!isAdmin(session.user.email)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { user_email, current_balance, total_earned, description } = body;
    if (!user_email) return NextResponse.json({ error: 'user_email required' }, { status: 400 });
    if (current_balance === undefined && total_earned === undefined) {
      return NextResponse.json({ error: 'Provide current_balance and/or total_earned' }, { status: 400 });
    }

    // Get or create balance row
    let { data: balance } = await supabaseAdmin.from('xp_balances')
      .select('*').eq('user_email', user_email).maybeSingle();

    if (!balance) {
      const { data: newBal } = await supabaseAdmin.from('xp_balances')
        .insert({ user_email, current_balance: 0, total_earned: 0, total_spent: 0 })
        .select().single();
      balance = newBal;
    }

    const updates: Record<string, unknown> = { last_updated: new Date().toISOString() };
    if (current_balance !== undefined) updates.current_balance = Math.max(0, Number(current_balance));
    if (total_earned !== undefined) updates.total_earned = Math.max(0, Number(total_earned));

    // Recalculate total_spent if both are being set
    if (current_balance !== undefined && total_earned !== undefined) {
      updates.total_spent = Math.max(0, Number(total_earned) - Number(current_balance));
    }

    await supabaseAdmin.from('xp_balances')
      .update(updates).eq('user_email', user_email);

    // Log the adjustment
    const desc = description || `Admin set XP: current=${current_balance ?? 'unchanged'}, total=${total_earned ?? 'unchanged'}`;
    await supabaseAdmin.from('xp_transactions').insert({
      user_email,
      amount: 0,
      transaction_type: 'admin_adjustment',
      source_type: 'admin',
      source_id: null,
      description: desc,
      balance_after: current_balance !== undefined ? Number(current_balance) : (balance?.current_balance || 0),
    });

    // Re-fetch updated balance
    const { data: updated } = await supabaseAdmin.from('xp_balances')
      .select('*').eq('user_email', user_email).single();

    return NextResponse.json({ balance: updated, message: 'XP values updated' });
  }

  if (action === 'spend_xp') {
    const { amount, description, source_type, source_id } = body;
    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });

    // Check balance
    const { data: balance } = await supabaseAdmin.from('xp_balances')
      .select('current_balance').eq('user_email', session.user.email).maybeSingle();
    if (!balance || balance.current_balance < amount) {
      return NextResponse.json({ error: 'Insufficient XP balance' }, { status: 400 });
    }

    const newBalance = balance.current_balance - amount;

    // Get full balance row to update total_spent
    const { data: fullBal } = await supabaseAdmin.from('xp_balances')
      .select('total_spent').eq('user_email', session.user.email).single();

    await supabaseAdmin.from('xp_balances')
      .update({
        current_balance: newBalance,
        total_spent: (fullBal?.total_spent || 0) + amount,
        last_updated: new Date().toISOString(),
      })
      .eq('user_email', session.user.email);

    await supabaseAdmin.from('xp_transactions').insert({
      user_email: session.user.email,
      amount: -amount,
      transaction_type: 'store_purchase',
      source_type: source_type || 'store',
      source_id: source_id || null,
      description: description || 'Store purchase',
      balance_after: newBalance,
    });

    return NextResponse.json({ balance: newBalance, spent: amount });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}, { routeName: 'xp' });

