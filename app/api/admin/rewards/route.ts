// app/api/admin/rewards/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/* GET — Rewards overview: balance, store items, badges, pay progression */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userEmail = session.user.email;
  const { searchParams } = new URL(req.url);
  const section = searchParams.get('section'); // 'store', 'badges', 'pay', 'all'

  // XP Balance
  let { data: balance } = await supabaseAdmin.from('xp_balances')
    .select('*').eq('user_email', userEmail).maybeSingle();
  if (!balance) balance = { user_email: userEmail, current_balance: 0, total_earned: 0, total_spent: 0 };

  const result: Record<string, unknown> = { balance };

  if (!section || section === 'all' || section === 'store') {
    // Store catalog
    const { data: catalog } = await supabaseAdmin.from('rewards_catalog')
      .select('*').eq('is_active', true).order('sort_order');
    result.catalog = catalog || [];

    // Recent purchases
    const { data: purchases } = await supabaseAdmin.from('rewards_purchases')
      .select('*, rewards_catalog(name, category, tier)')
      .eq('user_email', userEmail).order('created_at', { ascending: false }).limit(20);
    result.purchases = purchases || [];
  }

  if (!section || section === 'all' || section === 'badges') {
    // All badges
    const { data: allBadges } = await supabaseAdmin.from('badges')
      .select('*').eq('is_active', true).order('sort_order');

    // User's earned badges
    const { data: earned } = await supabaseAdmin.from('user_badges')
      .select('badge_id, earned_at').eq('user_email', userEmail);
    const earnedMap = new Map((earned || []).map((e: { badge_id: string; earned_at: string }) => [e.badge_id, e.earned_at]));

    result.badges = (allBadges || []).map((b: { id: string; badge_key: string; name: string; description: string; icon: string; category: string; xp_reward: number }) => ({
      ...b,
      earned: earnedMap.has(b.id),
      earned_at: earnedMap.get(b.id) || null,
    }));
  }

  if (!section || section === 'all' || section === 'pay') {
    // Pay progression data
    const { data: milestones } = await supabaseAdmin.from('xp_pay_milestones')
      .select('*').eq('is_active', true).order('xp_threshold');

    const { data: achievements } = await supabaseAdmin.from('xp_milestone_achievements')
      .select('milestone_id, achieved_at').eq('user_email', userEmail);
    const achievedIds = new Set((achievements || []).map((a: { milestone_id: string }) => a.milestone_id));

    result.xp_milestones = (milestones || []).map((m: { id: string; xp_threshold: number; bonus_per_hour: number; label: string }) => ({
      ...m,
      achieved: achievedIds.has(m.id),
    }));

    // Seniority brackets
    const { data: seniority } = await supabaseAdmin.from('seniority_brackets')
      .select('*').order('min_years');
    result.seniority_brackets = seniority || [];

    // Credential bonuses
    const { data: credentials } = await supabaseAdmin.from('credential_bonuses')
      .select('*').order('bonus_per_hour', { ascending: false });
    result.credential_bonuses = credentials || [];

    // Work type rates
    const { data: workRates } = await supabaseAdmin.from('work_type_rates')
      .select('*').order('base_rate', { ascending: false });
    result.work_type_rates = workRates || [];

    // Role tiers
    const { data: roles } = await supabaseAdmin.from('role_tiers')
      .select('*').order('base_bonus', { ascending: false });
    result.role_tiers = roles || [];

    // User's earned credentials
    const { data: earnedCreds } = await supabaseAdmin.from('employee_earned_credentials')
      .select('credential_key, earned_date').eq('user_email', userEmail);
    result.earned_credentials = earnedCreds || [];

    // Employee profile for hire date
    const { data: profile } = await supabaseAdmin.from('employee_profiles')
      .select('hire_date, job_title, hourly_rate').eq('user_email', userEmail).maybeSingle();
    result.profile = profile || null;
  }

  return NextResponse.json(result);
}, { routeName: 'rewards' });
