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

