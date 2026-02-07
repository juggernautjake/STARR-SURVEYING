// app/api/admin/notifications/route.ts — Notifications CRUD
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);

  let query = supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_email', session.user.email)
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq('is_read', false);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also get unread count
  const { count: unreadCount } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_email', session.user.email)
    .eq('is_read', false)
    .eq('is_dismissed', false);

  return NextResponse.json({
    notifications: data || [],
    total: count || 0,
    unread_count: unreadCount || 0,
  });
}, { routeName: 'notifications' });

// Mark as read or dismiss
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, action, ids } = body;

  // Bulk mark-all-read
  if (action === 'mark_all_read') {
    await supabaseAdmin
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_email', session.user.email)
      .eq('is_read', false);
    return NextResponse.json({ success: true });
  }

  // Bulk action on specific IDs
  if (ids && Array.isArray(ids)) {
    const updates: Record<string, unknown> = {};
    if (action === 'read') { updates.is_read = true; updates.read_at = new Date().toISOString(); }
    if (action === 'dismiss') { updates.is_dismissed = true; }

    await supabaseAdmin
      .from('notifications')
      .update(updates)
      .eq('user_email', session.user.email)
      .in('id', ids);
    return NextResponse.json({ success: true });
  }

  // Single notification
  if (!id) return NextResponse.json({ error: 'Notification ID required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (action === 'read') { updates.is_read = true; updates.read_at = new Date().toISOString(); }
  if (action === 'dismiss') { updates.is_dismissed = true; }

  const { error } = await supabaseAdmin
    .from('notifications')
    .update(updates)
    .eq('id', id)
    .eq('user_email', session.user.email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'notifications' });
