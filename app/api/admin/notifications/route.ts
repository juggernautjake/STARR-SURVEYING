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

// Validation caps — generous but bounded so a typo or paste-error
// doesn't insert garbage. The mobile banner truncates to 1 line of
// title + 2 lines of body anyway.
const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 2000;
const MAX_LINK_LEN = 1000;
const VALID_ESCALATIONS = new Set([
  'low',
  'normal',
  'high',
  'urgent',
  'critical',
]);

// Server-side dedup window for log_hours/submit_week reminders. If the
// admin clicks Ping twice in rapid succession (or two dispatchers ping
// the same user), we re-stamp the existing unread row's created_at +
// expires_at instead of inserting a duplicate. Mobile then sees a
// single banner — the user isn't bombarded with five "log your hours"
// notifications. admin_direct messages are NEVER deduped (each one is
// a distinct admin authored message).
const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const DEDUP_KINDS = new Set(['log_hours', 'submit_week']);

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email || !isAdmin(session.user.roles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

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
    if (targetEmail.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(targetEmail)) {
      return NextResponse.json(
        { error: 'target_user_email is malformed' },
        { status: 400 }
      );
    }

    const kindRaw = body.kind;
    const kind: LogHoursKind | undefined =
      typeof kindRaw === 'string' && kindRaw in KIND_DEFAULTS
        ? (kindRaw as LogHoursKind)
        : undefined;
    if (kindRaw && !kind) {
      return NextResponse.json(
        {
          error: `Unknown kind. Allowed: ${Object.keys(KIND_DEFAULTS).join(
            ', '
          )}`,
        },
        { status: 400 }
      );
    }
    const defaults = kind ? KIND_DEFAULTS[kind] : null;

    // Title required (either from kind defaults or explicit body).
    const titleRaw =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim()
        : defaults?.title ?? '';
    if (!titleRaw) {
      return NextResponse.json(
        { error: 'title (or a known kind) is required' },
        { status: 400 }
      );
    }
    if (titleRaw.length > MAX_TITLE_LEN) {
      return NextResponse.json(
        { error: `title exceeds ${MAX_TITLE_LEN} characters` },
        { status: 400 }
      );
    }
    const title = titleRaw;

    // Optional fields — coerce + validate each.
    let messageBody: string | null = null;
    if (typeof body.body === 'string') {
      if (body.body.length > MAX_BODY_LEN) {
        return NextResponse.json(
          { error: `body exceeds ${MAX_BODY_LEN} characters` },
          { status: 400 }
        );
      }
      messageBody = body.body;
    } else if (defaults) {
      messageBody = defaults.body;
    }

    let link: string | null = null;
    if (typeof body.link === 'string') {
      if (body.link.length > MAX_LINK_LEN) {
        return NextResponse.json(
          { error: `link exceeds ${MAX_LINK_LEN} characters` },
          { status: 400 }
        );
      }
      link = body.link;
    } else if (defaults) {
      link = defaults.link;
    }

    const escalation: string =
      typeof body.escalation_level === 'string'
        ? body.escalation_level
        : defaults?.escalation_level ?? 'normal';
    if (!VALID_ESCALATIONS.has(escalation)) {
      return NextResponse.json(
        {
          error: `escalation_level must be one of ${Array.from(
            VALID_ESCALATIONS
          ).join(', ')}`,
        },
        { status: 400 }
      );
    }

    let expiresAt: string;
    if (typeof body.expires_at === 'string') {
      const parsed = Date.parse(body.expires_at);
      if (!Number.isFinite(parsed)) {
        return NextResponse.json(
          { error: 'expires_at is not a valid ISO timestamp' },
          { status: 400 }
        );
      }
      // Don't allow setting an expiry in the past — that would make
      // the row invisible from the moment of insert.
      if (parsed <= Date.now()) {
        return NextResponse.json(
          { error: 'expires_at must be in the future' },
          { status: 400 }
        );
      }
      expiresAt = new Date(parsed).toISOString();
    } else {
      // Default 24-hour expiry for ephemeral pings.
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

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

    // Server-side dedup for log_hours / submit_week. If the admin
    // pings twice in quick succession, refresh the existing unread
    // row's timestamps instead of inserting a dupe. We still return
    // the row so the admin sees the same delivered/read indicators
    // that drive the Team page UI.
    if (kind && DEDUP_KINDS.has(kind)) {
      const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
      const { data: existing } = await supabaseAdmin
        .from('notifications')
        .select(
          'id, user_email, target_user_id, source_type, created_at'
        )
        .eq('user_email', targetEmail)
        .eq('source_type', defaults?.source_type ?? '')
        .eq('is_read', false)
        .eq('is_dismissed', false)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        // Bump created_at so it bubbles to the top of the user's
        // inbox, and reset delivered_at so the device re-fires the
        // OS banner (the dispatcher clicked Ping a second time
        // because the first didn't get through). expires_at also
        // refreshed so the row doesn't age out under the user.
        const nowIso = new Date().toISOString();
        const { data: bumped, error: bumpErr } = await supabaseAdmin
          .from('notifications')
          .update({
            created_at: nowIso,
            delivered_at: null,
            expires_at: expiresAt,
            // If the dispatcher tweaked title/body in a follow-up
            // ping, take the new copy.
            title,
            body: messageBody,
            link,
            escalation_level: escalation,
          })
          .eq('id', existing.id)
          .select(
            'id, user_email, target_user_id, source_type, created_at'
          )
          .single();
        if (bumpErr) {
          return NextResponse.json(
            { error: bumpErr.message },
            { status: 500 }
          );
        }
        return NextResponse.json({
          success: true,
          notification: bumped,
          deduped: true,
        });
      }
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
      expires_at: expiresAt,
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
