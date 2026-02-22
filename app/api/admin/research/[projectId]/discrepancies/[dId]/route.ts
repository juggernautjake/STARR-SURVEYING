// app/api/admin/research/[projectId]/discrepancies/[dId]/route.ts — Resolve discrepancy
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractIds(req: NextRequest): { projectId: string | null; dId: string | null } {
  const path = req.nextUrl.pathname;
  const afterResearch = path.split('/research/')[1];
  if (!afterResearch) return { projectId: null, dId: null };

  const parts = afterResearch.split('/');
  // parts: [projectId, 'discrepancies', dId]
  return {
    projectId: parts[0] || null,
    dId: parts[2] || null,
  };
}

/* PATCH — Update a discrepancy (resolve, add notes, change status) */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, dId } = extractIds(req);
  if (!projectId || !dId) {
    return NextResponse.json({ error: 'Project ID and discrepancy ID required' }, { status: 400 });
  }

  // Verify discrepancy exists and belongs to this project
  const { data: existing } = await supabaseAdmin
    .from('discrepancies')
    .select('id, research_project_id')
    .eq('id', dId)
    .eq('research_project_id', projectId)
    .single();

  if (!existing) return NextResponse.json({ error: 'Discrepancy not found' }, { status: 404 });

  const body = await req.json();
  const allowedFields = ['resolution_status', 'resolution_notes', 'resolved_value', 'severity'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Validate enum fields before accepting
  if (body.resolution_status !== undefined) {
    const validStatuses = ['open', 'reviewing', 'resolved', 'accepted', 'deferred'];
    if (!validStatuses.includes(body.resolution_status)) {
      return NextResponse.json({ error: `Invalid resolution_status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }
  }
  if (body.severity !== undefined) {
    const validSeverities = ['info', 'unclear', 'uncertain', 'discrepancy', 'contradiction', 'error'];
    if (!validSeverities.includes(body.severity)) {
      return NextResponse.json({ error: `Invalid severity. Must be one of: ${validSeverities.join(', ')}` }, { status: 400 });
    }
  }

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  // Auto-set resolved metadata
  if (body.resolution_status === 'resolved' || body.resolution_status === 'accepted') {
    updates.resolved_by = session.user.email;
    updates.resolved_at = new Date().toISOString();
  }

  const { data: updated, error } = await supabaseAdmin
    .from('discrepancies')
    .update(updates)
    .eq('id', dId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ discrepancy: updated });
}, { routeName: 'research/discrepancies/resolve' });

/* GET — Get single discrepancy with full detail */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, dId } = extractIds(req);
  if (!projectId || !dId) {
    return NextResponse.json({ error: 'Project ID and discrepancy ID required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('discrepancies')
    .select('*')
    .eq('id', dId)
    .eq('research_project_id', projectId)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Discrepancy not found' }, { status: 404 });

  // Fetch related data points if any
  let relatedDataPoints = null;
  if (data.data_point_ids && data.data_point_ids.length > 0) {
    const { data: dps } = await supabaseAdmin
      .from('extracted_data_points')
      .select('*')
      .in('id', data.data_point_ids);
    relatedDataPoints = dps;
  }

  return NextResponse.json({
    discrepancy: data,
    related_data_points: relatedDataPoints,
  });
}, { routeName: 'research/discrepancies/detail' });
