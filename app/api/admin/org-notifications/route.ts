// app/api/admin/org-notifications/route.ts
//
// SaaS-side in-app notifications API. Reads from public.org_notifications
// (shipped seeds/267) — the table the notifications dispatcher writes
// to via lib/saas/notifications/in-app.ts.
//
// Distinct from /api/admin/notifications which is the legacy Starr-
// internal `notifications` table (XP, badges, system messages). Both
// coexist during the SaaS transition; the bell-icon UI consumer will
// merge them in a future slice.
//
// Phase D-6 of CUSTOMER_PORTAL.md.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface NotificationOut {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  readAt: string | null;
  createdAt: string;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Resolve active org so we can include org-wide notifications
  // (user_email NULL + org_id = caller's org).
  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();

  let query = supabaseAdmin
    .from('org_notifications')
    .select('id, type, severity, title, body, action_url, action_label, read_at, created_at')
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (user?.default_org_id) {
    // Either targeted at this user OR org-wide for caller's org.
    // PostgREST OR syntax: comma between predicates inside the or().
    query = query.or(
      `user_email.eq.${session.user.email},and(user_email.is.null,org_id.eq.${user.default_org_id})`,
    );
  } else {
    query = query.eq('user_email', session.user.email);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[org-notifications] list failed', error);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }

  const out: NotificationOut[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    type: r.type as string,
    severity: (r.severity as 'info' | 'warning' | 'critical') ?? 'info',
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    actionUrl: (r.action_url as string | null) ?? null,
    actionLabel: (r.action_label as string | null) ?? null,
    readAt: (r.read_at as string | null) ?? null,
    createdAt: r.created_at as string,
  }));

  const unreadCount = out.filter((n) => n.readAt === null).length;
  return NextResponse.json({ notifications: out, unreadCount });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { id?: string; markAllRead?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (body.markAllRead) {
    const { error } = await supabaseAdmin
      .from('org_notifications')
      .update({ read_at: now })
      .eq('user_email', session.user.email)
      .is('read_at', null);
    if (error) {
      console.error('[org-notifications] mark-all-read failed', error);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('org_notifications')
    .update({ read_at: now })
    .eq('id', body.id)
    .eq('user_email', session.user.email);
  if (error) {
    console.error('[org-notifications] mark-read failed', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('org_notifications')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_email', session.user.email);
  if (error) {
    console.error('[org-notifications] dismiss failed', error);
    return NextResponse.json({ error: 'Failed to dismiss' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
