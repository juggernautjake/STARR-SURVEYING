// app/api/admin/badges/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { awardXP } from '@/lib/xp';

/* GET — List badges for user or all badges (admin) */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userEmail = searchParams.get('user_email') && isAdmin(session.user.email)
    ? searchParams.get('user_email')! : session.user.email;

  const { data: allBadges } = await supabaseAdmin.from('badges')
    .select('*').eq('is_active', true).order('sort_order');

  const { data: earned } = await supabaseAdmin.from('user_badges')
    .select('badge_id, earned_at, awarded_by').eq('user_email', userEmail);

  const earnedMap = new Map<string, { badge_id: string; earned_at: string; awarded_by: string }>((earned || []).map((e: { badge_id: string; earned_at: string; awarded_by: string }) => [e.badge_id, e]));

  const badges = (allBadges || []).map((b: { id: string; badge_key: string; name: string; description: string; icon: string; category: string; xp_reward: number }) => ({
    ...b,
    earned: earnedMap.has(b.id),
    earned_at: earnedMap.get(b.id)?.earned_at || null,
    awarded_by: earnedMap.get(b.id)?.awarded_by || null,
  }));

  return NextResponse.json({ badges });
}, { routeName: 'badges' });

/* POST — Award badge to user */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { user_email, badge_key } = body;

  if (!user_email || !badge_key) {
    return NextResponse.json({ error: 'user_email and badge_key required' }, { status: 400 });
  }

  // Get badge
  const { data: badge } = await supabaseAdmin.from('badges')
    .select('*').eq('badge_key', badge_key).single();
  if (!badge) return NextResponse.json({ error: 'Badge not found' }, { status: 404 });

  // Check if already earned
  const { data: existing } = await supabaseAdmin.from('user_badges')
    .select('id').eq('user_email', user_email).eq('badge_id', badge.id).maybeSingle();
  if (existing) return NextResponse.json({ error: 'Badge already earned' }, { status: 400 });

  // Award badge
  await supabaseAdmin.from('user_badges').insert({
    user_email,
    badge_id: badge.id,
    awarded_by: session.user.email,
  });

  // Award XP for badge
  let xpResult = null;
  if (badge.xp_reward > 0) {
    xpResult = await awardXP(
      user_email, badge.xp_reward, 'badge_earned', 'badge', badge.id,
      `Badge earned: ${badge.name} (+${badge.xp_reward} XP)`
    );
  }

  // Notify user
  try {
    await supabaseAdmin.from('notifications').insert({
      user_email,
      type: 'badge_earned',
      title: `Badge Earned: ${badge.icon} ${badge.name}`,
      message: `${badge.description}${badge.xp_reward > 0 ? ` (+${badge.xp_reward} XP)` : ''}`,
      is_read: false,
    });
  } catch { /* ignore */ }

  return NextResponse.json({ badge, xp_result: xpResult });
}, { routeName: 'badges' });
