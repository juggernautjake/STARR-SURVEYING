// app/api/share/[token]/route.ts
// Phase 17: Public share endpoint — no authentication required.
//
// GET /api/share/{token}?password=...
//   • 200 — { shareRecord, reportData: { ... filtered by permission } }
//   • 401 — password required or incorrect
//   • 404 — token not found, expired, or revoked

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { createHash } from 'crypto';

function hashPassword(pw: string): string {
  return createHash('sha256').update(pw).digest('hex');
}

function extractToken(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/share/')[1]?.split('/');
  return parts?.[0] || null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  const password = req.nextUrl.searchParams.get('password') ?? undefined;

  // Look up the share token
  const { data: share, error: shareError } = await supabaseAdmin
    .from('report_shares')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (shareError || !share) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Check revocation
  if (share.is_revoked) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Check expiry
  if (share.expires_at && new Date(share.expires_at) <= new Date()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Check view limit
  if (share.max_views !== null && share.view_count >= share.max_views) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Password check
  if (share.password_hash) {
    if (!password) {
      return NextResponse.json(
        { error: 'Password required', is_password_protected: true },
        { status: 401 },
      );
    }
    if (hashPassword(password) !== share.password_hash) {
      return NextResponse.json(
        { error: 'Incorrect password', is_password_protected: true },
        { status: 401 },
      );
    }
  }

  // Fetch the project
  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select(
      'id, property_address, legal_description, county, state, status, ' +
      'confidence_score, boundary_summary, created_at',
    )
    .eq('id', share.project_id)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Record the view (fire-and-forget)
  supabaseAdmin
    .from('report_shares')
    .update({
      view_count: (share.view_count ?? 0) + 1,
      last_viewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('token', token)
    .then(() => {})
    .catch(() => {});

  // Build permission-filtered report data
  const permission: string = share.permission;
  let reportData: Record<string, unknown> = {};

  if (permission === 'full_report') {
    reportData = { ...project };
  } else if (permission === 'summary_only') {
    reportData = {
      property_address: project.property_address,
      county: project.county,
      state: project.state,
      confidence_score: project.confidence_score,
      status: project.status,
    };
  } else if (permission === 'boundary_only') {
    reportData = {
      property_address: project.property_address,
      boundary_summary: project.boundary_summary,
      legal_description: project.legal_description,
    };
  } else if (permission === 'documents_excluded') {
    reportData = {
      property_address: project.property_address,
      legal_description: project.legal_description,
      county: project.county,
      state: project.state,
      confidence_score: project.confidence_score,
      boundary_summary: project.boundary_summary,
      status: project.status,
    };
  }

  return NextResponse.json({
    shareRecord: {
      token: share.token,
      projectId: share.project_id,
      permission: share.permission,
      createdBy: share.created_by,
      expiresAt: share.expires_at,
      viewCount: share.view_count,
      maxViews: share.max_views,
      label: share.label,
      createdAt: share.created_at,
      lastViewedAt: share.last_viewed_at,
      isRevoked: share.is_revoked,
      is_password_protected: !!share.password_hash,
    },
    reportData,
  });
}, { routeName: 'share/token' });
