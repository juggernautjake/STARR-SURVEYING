// app/api/admin/research/[projectId]/share/route.ts
// Phase 17: Admin API to manage share tokens for a research project.
//
// GET    /api/admin/research/{projectId}/share           — list all shares
// POST   /api/admin/research/{projectId}/share           — create a new share
// DELETE /api/admin/research/{projectId}/share?token=... — revoke a share

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { createHash } from 'crypto';
import type { ShareOptions } from '@/../worker/src/services/report-share-service.js';

function hashPassword(pw: string): string {
  return createHash('sha256').update(pw).digest('hex');
}

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

function buildExpiresAt(expiresInDays: number | null | undefined): string | null {
  if (expiresInDays == null) return null;
  return new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
}

/* GET — list all share tokens for a project */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const { data: shares, error } = await supabaseAdmin
    .from('report_shares')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return NextResponse.json({ shares: shares ?? [] });
}, { routeName: 'research/projectId/share/list' });

/* POST — create a new share token for a project */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const options = (await req.json().catch(() => ({}))) as ShareOptions;

  const token = crypto.randomUUID();
  const expiresAt = buildExpiresAt(options.expiresInDays);

  const { data: share, error } = await supabaseAdmin
    .from('report_shares')
    .insert({
      token,
      project_id: projectId,
      permission: options.permission ?? 'full_report',
      created_by: session.user.email,
      expires_at: expiresAt,
      max_views: options.maxViews ?? null,
      label: options.label ?? null,
      password_hash: options.password ? hashPassword(options.password) : null,
      is_revoked: false,
      view_count: 0,
    })
    .select('*')
    .single();

  if (error) throw error;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'https://app.starrsurveying.com';

  return NextResponse.json(
    {
      shareUrl: `${baseUrl}/share/${token}`,
      token,
      shareRecord: share,
    },
    { status: 201 },
  );
}, { routeName: 'research/projectId/share/create' });

/* DELETE — revoke a specific share token */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token query param required' }, { status: 400 });

  const { data: share, error: findError } = await supabaseAdmin
    .from('report_shares')
    .select('id, project_id')
    .eq('token', token)
    .eq('project_id', projectId)
    .maybeSingle();

  if (findError || !share) {
    return NextResponse.json({ error: 'Share token not found' }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from('report_shares')
    .update({ is_revoked: true, updated_at: new Date().toISOString() })
    .eq('token', token);

  if (error) throw error;

  return NextResponse.json({ revoked: true, token });
}, { routeName: 'research/projectId/share/revoke' });
