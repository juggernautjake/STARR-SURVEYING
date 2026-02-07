// app/api/admin/profile/changes/route.ts — Employee's own profile changes
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET: Fetch the current user's profile changes and learning credits
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = session.user.email;
  const { searchParams } = new URL(req.url);
  const section = searchParams.get('section'); // 'changes', 'credits', or all

  const results: Record<string, unknown> = {};

  if (!section || section === 'changes') {
    const { data } = await supabaseAdmin
      .from('employee_profile_changes')
      .select('*')
      .eq('user_email', email)
      .order('created_at', { ascending: false })
      .limit(50);
    results.profile_changes = data || [];
  }

  if (!section || section === 'credits') {
    const { data: credits } = await supabaseAdmin
      .from('employee_learning_credits')
      .select('*')
      .eq('user_email', email)
      .order('earned_at', { ascending: false })
      .limit(50);

    const totalPoints = (credits || []).reduce((s: number, c: { points_earned: number }) => s + c.points_earned, 0);
    results.employee_credits = credits || [];
    results.total_points = totalPoints;
  }

  return NextResponse.json(results);
}, { routeName: 'profile/changes' });

// PUT: Mark profile changes as read
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ids } = await req.json();
  if (!ids || !Array.isArray(ids)) return NextResponse.json({ error: 'ids required' }, { status: 400 });

  await supabaseAdmin
    .from('employee_profile_changes')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_email', session.user.email)
    .in('id', ids);

  return NextResponse.json({ success: true });
}, { routeName: 'profile/changes' });
