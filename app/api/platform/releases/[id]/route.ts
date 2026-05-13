// app/api/platform/releases/[id]/route.ts
//
// Single-release detail + delivery analytics. Returns the release
// row plus aggregate counters: notifications sent, read by users,
// dismissed, and acked.
//
// Phase G-9 of SOFTWARE_UPDATE_DISTRIBUTION.md.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

async function gateOperator(email: string): Promise<boolean> {
  const { data: opr } = await supabaseAdmin
    .from('operator_users')
    .select('email, status')
    .eq('email', email)
    .maybeSingle();
  return !!opr && opr.status === 'active';
}

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.user.isOperator && !(await gateOperator(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const { data: release } = await supabaseAdmin
    .from('releases')
    .select('id, version, release_type, bundles, required, notes_markdown, published_at, scheduled_for, rollout_strategy, published_by, created_at')
    .eq('id', id)
    .maybeSingle();

  if (!release) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Look up the notifications that match this release id in payload
  // and aggregate read / dismissed counters. The fanout writes
  // one row per org with payload.release_id = <id>.
  const [{ data: notifs }, { count: ackCount }] = await Promise.all([
    supabaseAdmin
      .from('org_notifications')
      .select('org_id, read_at, dismissed_at')
      .eq('payload->>release_id', id),
    supabaseAdmin
      .from('release_acks')
      .select('user_email', { count: 'exact', head: true })
      .eq('release_id', id),
  ]);

  type NotifRow = { read_at: string | null; dismissed_at: string | null };
  const rows = (notifs as NotifRow[] | null) ?? [];
  const sent = rows.length;
  const read = rows.filter((n) => n.read_at !== null).length;
  const dismissed = rows.filter((n) => n.dismissed_at !== null).length;

  return NextResponse.json({
    release: {
      id: release.id,
      version: release.version,
      releaseType: release.release_type,
      bundles: (release.bundles as string[]) ?? [],
      required: release.required,
      notesMarkdown: release.notes_markdown,
      publishedAt: release.published_at,
      scheduledFor: release.scheduled_for,
      rolloutStrategy: release.rollout_strategy,
      publishedBy: release.published_by,
      createdAt: release.created_at,
    },
    analytics: {
      orgsNotified: sent,
      reads: read,
      dismissals: dismissed,
      acks: ackCount ?? 0,
    },
  });
}
