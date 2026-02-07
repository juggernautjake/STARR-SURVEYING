// app/api/admin/learn/activity/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET - Fetch activity log entries
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const userEmail = searchParams.get('user_email');
  const actionType = searchParams.get('action_type');
  const entityType = searchParams.get('entity_type');

  let query = supabaseAdmin.from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  // Non-admins can only see their own activity
  if (!isAdmin(session.user.email)) {
    query = query.eq('user_email', session.user.email);
  } else if (userEmail) {
    query = query.eq('user_email', userEmail);
  }

  if (actionType) query = query.eq('action_type', actionType);
  if (entityType) query = query.eq('entity_type', entityType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activities: data || [] });
}, { routeName: 'learn/activity' });

// POST - Log an activity
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action_type, entity_type, entity_id, metadata } = body;

  if (!action_type) {
    return NextResponse.json({ error: 'action_type required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action_type,
    entity_type: entity_type || null,
    entity_id: entity_id || null,
    metadata: metadata || {},
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activity: data });
}, { routeName: 'learn/activity' });
