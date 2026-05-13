// app/api/platform/releases/route.ts
//
// Operator-side release management API. GET lists every release;
// POST creates a new one (draft state) or publishes one.
//
// Phase G-2 of SOFTWARE_UPDATE_DISTRIBUTION.md.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { fanoutReleasePublished } from '@/lib/saas/release-fanout';
import type { BundleId } from '@/lib/saas/bundles';

export const runtime = 'nodejs';

async function gateOperator(email: string): Promise<boolean> {
  const { data: opr } = await supabaseAdmin
    .from('operator_users')
    .select('email, status')
    .eq('email', email)
    .maybeSingle();
  return !!opr && opr.status === 'active';
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.user.isOperator && !(await gateOperator(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('releases')
    .select('id, version, release_type, bundles, required, notes_markdown, published_at, scheduled_for, rollout_strategy, published_by, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[platform/releases] list failed', error);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }

  return NextResponse.json({ releases: (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    version: r.version as string,
    releaseType: r.release_type as string,
    bundles: (r.bundles as string[]) ?? [],
    required: (r.required as boolean) ?? false,
    notesMarkdown: (r.notes_markdown as string | null) ?? null,
    publishedAt: (r.published_at as string | null) ?? null,
    scheduledFor: (r.scheduled_for as string | null) ?? null,
    rolloutStrategy: r.rollout_strategy as string,
    publishedBy: (r.published_by as string | null) ?? null,
    createdAt: r.created_at as string,
  })) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.user.isOperator && !(await gateOperator(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    version?: string;
    releaseType?: 'feature' | 'bugfix' | 'breaking' | 'security';
    bundles?: string[];
    notesMarkdown?: string;
    required?: boolean;
    publishNow?: boolean;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.version) return NextResponse.json({ error: 'version required' }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('releases')
    .insert({
      version: body.version,
      release_type: body.releaseType ?? 'feature',
      bundles: body.bundles ?? [],
      required: body.required ?? false,
      notes_markdown: body.notesMarkdown ?? null,
      published_at: body.publishNow ? now : null,
      rollout_strategy: 'immediate',
      published_by: session.user.email,
    })
    .select('id, version')
    .single();

  if (error || !data) {
    console.error('[platform/releases] create failed', error);
    return NextResponse.json({ error: 'Failed to create release' }, { status: 500 });
  }

  // Audit
  await supabaseAdmin.from('audit_log').insert({
    operator_email: session.user.email,
    action: body.publishNow ? 'RELEASE_PUBLISHED' : 'RELEASE_DRAFTED',
    severity: body.releaseType === 'breaking' || body.releaseType === 'security' ? 'warning' : 'info',
    metadata: { release_id: data.id, version: data.version, bundles: body.bundles, type: body.releaseType },
  });

  // Fanout: when publishing, write an org-wide notification to every
  // org whose active subscription has at least one of the release's
  // bundles (or every active org if the release has no bundles).
  let orgsNotified = 0;
  if (body.publishNow) {
    try {
      const result = await fanoutReleasePublished({
        releaseId: data.id,
        version: data.version,
        releaseType: body.releaseType ?? 'feature',
        bundles: (body.bundles ?? []) as BundleId[],
        required: body.required ?? false,
        notesMarkdown: body.notesMarkdown ?? null,
      });
      orgsNotified = result.orgsNotified;
    } catch (err) {
      console.error('[platform/releases] fanout failed', err);
    }
  }

  return NextResponse.json({ id: data.id, version: data.version, orgsNotified }, { status: 201 });
}
