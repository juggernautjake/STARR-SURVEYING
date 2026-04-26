// app/api/admin/notifications/route.ts — Notifications CRUD
//
// GET  — list current user's notifications (existing)
// PUT  — mark-read / mark-dismissed (existing)
// POST — admin-only: send a notification to a target user. Powers the
//        Starr Field dispatcher Ping button (admin Team page) and any
//        future "send a custom message to user X" admin flow.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
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

// ── POST — admin sends a notification to a target user ─────────────────────
//
// Used by:
//   - Starr Field admin Team page (Ping button) → kind='log_hours'
//   - Future "send custom message" admin tools
//
// Auth: caller MUST be admin (or have a future 'dispatcher' role that
// gets enabled here later). The `is_dispatcher` flag we'll likely add
// in F2+ would gate dispatchers without elevating them to full admins;
// for now require isAdmin to keep the surface minimal.
//
// Body:
//   {
//     target_user_email: string;            // required
//     kind?: 'log_hours' | 'submit_week'    // shorthand for the
//             | 'admin_direct';             // dispatcher pings;
//                                           // omit to use raw fields.
//     title?: string; body?: string;
//     link?: string;                        // optional override
//     escalation_level?: 'normal' | 'high' | 'urgent' | 'critical';
//     expires_at?: string;                  // ISO timestamp
//   }
//
// We INSERT directly here rather than calling the lib/notifications.ts
// helpers because we need fields lib/notifications.ts doesn't expose
// (expires_at, delivered_at). Trigger from seeds/222 fills target_user_id.
type LogHoursKind = 'log_hours' | 'submit_week' | 'admin_direct';

const KIND_DEFAULTS: Record<
  LogHoursKind,
  {
    type: string;
    source_type: string;
    title: string;
    body: string;
    icon: string;
    link: string;
    escalation_level: 'normal' | 'high' | 'urgent';
  }
> = {
  log_hours: {
    type: 'reminder',
    source_type: 'log_hours',
    title: 'Don’t forget to log your hours',
    body: 'Open Starr Field and clock in/out so payroll has accurate hours.',
    icon: '⏱',
    link: '/admin/my-hours',
    escalation_level: 'high',
  },
  submit_week: {
    type: 'reminder',
    source_type: 'submit_week',
    title: 'Submit this week for approval',
    body: 'Your weekly timesheet is ready to submit. Open Starr Field to review.',
    icon: '✅',
    link: '/admin/my-hours',
    escalation_level: 'normal',
  },
  admin_direct: {
    type: 'system',
    source_type: 'admin_direct',
    title: 'Message from dispatch',
    body: '',
    icon: '📢',
    link: '/admin/dashboard',
    escalation_level: 'urgent',
  },
};

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email || !isAdmin(session.user.roles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const targetEmail =
      typeof body.target_user_email === 'string'
        ? body.target_user_email.toLowerCase().trim()
        : null;
    if (!targetEmail) {
      return NextResponse.json(
        { error: 'target_user_email is required' },
        { status: 400 }
      );
    }

    const kind = body.kind as LogHoursKind | undefined;
    const defaults =
      kind && KIND_DEFAULTS[kind] ? KIND_DEFAULTS[kind] : null;

    // Title is required (either from kind defaults or explicit body).
    const title: string =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim()
        : defaults?.title ?? '';
    if (!title) {
      return NextResponse.json(
        { error: 'title (or a known kind) is required' },
        { status: 400 }
      );
    }

    const messageBody: string | null =
      typeof body.body === 'string' ? body.body : defaults?.body ?? null;
    const link: string | null =
      typeof body.link === 'string'
        ? body.link
        : defaults?.link ?? null;
    const escalation: string =
      typeof body.escalation_level === 'string'
        ? body.escalation_level
        : defaults?.escalation_level ?? 'normal';
    const expiresAt: string | null =
      typeof body.expires_at === 'string' ? body.expires_at : null;

    // Verify the target exists in registered_users so we don't insert
    // a notification for an unknown email (which would never be read).
    const { data: target, error: targetErr } = await supabaseAdmin
      .from('registered_users')
      .select('email')
      .eq('email', targetEmail)
      .maybeSingle();
    if (targetErr) {
      return NextResponse.json(
        { error: targetErr.message },
        { status: 500 }
      );
    }
    if (!target) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { status: 404 }
      );
    }

    const insertRow: Record<string, unknown> = {
      user_email: targetEmail,
      type: defaults?.type ?? 'system',
      source_type: defaults?.source_type ?? null,
      title,
      body: messageBody,
      icon: defaults?.icon ?? null,
      link,
      escalation_level: escalation,
      // Default 24-hour expiry for ephemeral pings — caller can
      // override. log_hours / submit_week reminders age out so the
      // mobile inbox doesn't accumulate stale rows.
      expires_at:
        expiresAt ??
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert(insertRow)
      .select('id, user_email, target_user_id, source_type, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, notification: data });
  },
  { routeName: 'notifications.post' }
);
