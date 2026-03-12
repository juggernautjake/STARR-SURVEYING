// app/api/admin/research/route.ts — Research Projects CRUD
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/* GET — List all research projects (with optional filters) */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const archived = searchParams.get('archived') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  // Single project fetch
  if (id) {
    const { data: project, error } = await supabaseAdmin
      .from('research_projects')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });

    // Fetch counts in parallel
    const [docsRes, pointsRes, discRes] = await Promise.all([
      supabaseAdmin.from('research_documents').select('id', { count: 'exact' }).eq('research_project_id', id),
      supabaseAdmin.from('extracted_data_points').select('id', { count: 'exact' }).eq('research_project_id', id),
      supabaseAdmin.from('discrepancies').select('id, resolution_status', { count: 'exact' }).eq('research_project_id', id),
    ]);

    const resolvedCount = (discRes.data || []).filter(
      (d: { resolution_status: string }) => d.resolution_status === 'resolved' || d.resolution_status === 'accepted'
    ).length;

    return NextResponse.json({
      project: {
        ...project,
        document_count: docsRes.count || 0,
        data_point_count: pointsRes.count || 0,
        discrepancy_count: discRes.count || 0,
        resolved_count: resolvedCount,
      },
    });
  }

  // List projects
  let query = supabaseAdmin
    .from('research_projects')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (archived) {
    query = query.not('archived_at', 'is', null);
  } else {
    query = query.is('archived_at', null);
  }

  if (status && status !== 'all') query = query.eq('status', status);
  if (search) {
    // Sanitize search input: escape special PostgREST characters to prevent filter injection
    const sanitized = search.replace(/[%_\\(),."']/g, '');
    if (sanitized) {
      query = query.or(`name.ilike.%${sanitized}%,property_address.ilike.%${sanitized}%,county.ilike.%${sanitized}%`);
    }
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ projects: data || [], total: count || 0 });
}, { routeName: 'research' });

/* POST — Create a new research project */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, description, property_address, county, state, job_id } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('research_projects')
    .insert({
      created_by: session.user.email,
      name: name.trim(),
      description: description?.trim() || null,
      property_address: property_address?.trim() || null,
      county: county?.trim() || null,
      state: state?.trim() || 'TX',
      job_id: job_id || null,
      status: 'upload',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ project: data }, { status: 201 });
}, { routeName: 'research' });

/* PATCH — Update a research project */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, clear_analysis_data, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'Project id is required' }, { status: 400 });

  // Only allow updating specific fields
  const allowed: Record<string, unknown> = {};
  if (updates.name !== undefined) allowed.name = (updates.name || '').trim();
  if (updates.description !== undefined) allowed.description = updates.description?.trim() || null;
  if (updates.property_address !== undefined) allowed.property_address = updates.property_address?.trim() || null;
  if (updates.county !== undefined) allowed.county = updates.county?.trim() || null;
  if (updates.state !== undefined) allowed.state = updates.state?.trim() || 'TX';
  if (updates.status !== undefined) {
    const validStatuses = ['upload', 'configure', 'analyzing', 'review', 'drawing', 'verifying', 'complete'];
    if (!validStatuses.includes(updates.status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }
    allowed.status = updates.status;
  }
  if (updates.analysis_template_id !== undefined) allowed.analysis_template_id = updates.analysis_template_id;
  if (updates.analysis_filters !== undefined) allowed.analysis_filters = updates.analysis_filters;

  // job_notes lives inside analysis_metadata so it survives analysis reruns but is
  // explicitly preserved across clear_analysis_data resets (user-authored content).
  // Fetch current analysis_metadata once (needed by both job_notes and clear_analysis_data paths).
  let currentMeta: Record<string, unknown> = {};
  if (updates.job_notes !== undefined || clear_analysis_data) {
    const { data: current } = await supabaseAdmin
      .from('research_projects')
      .select('analysis_metadata')
      .eq('id', id)
      .single();
    currentMeta = (current?.analysis_metadata as Record<string, unknown>) ?? {};
  }

  if (updates.job_notes !== undefined) {
    allowed.analysis_metadata = { ...currentMeta, job_notes: updates.job_notes };
    // Update currentMeta so the clear path below sees the merged value
    currentMeta = allowed.analysis_metadata as Record<string, unknown>;
  }

  allowed.updated_at = new Date().toISOString();

  if (updates.status === 'complete') {
    allowed.completed_at = new Date().toISOString();
  }

  // When reverting to a pre-analysis step the caller can request clearing extracted data.
  // job_notes are preserved — only AI-generated analysis data is wiped.
  if (clear_analysis_data) {
    // Keep only user-authored job_notes; discard all AI-generated analysis data
    const preservedNotes = (currentMeta.job_notes as string | undefined) ?? '';
    allowed.analysis_metadata = preservedNotes ? { job_notes: preservedNotes } : {};
    await Promise.all([
      supabaseAdmin.from('extracted_data_points').delete().eq('research_project_id', id),
      supabaseAdmin.from('discrepancies').delete().eq('research_project_id', id),
      // Reset document processing_status from 'analyzed'/'analyzing' back to 'extracted'
      // so they are available for re-analysis without requiring re-upload.
      supabaseAdmin
        .from('research_documents')
        .update({ processing_status: 'extracted', processing_error: null, updated_at: new Date().toISOString() })
        .eq('research_project_id', id)
        .in('processing_status', ['analyzed', 'analyzing']),
    ]);
  }

  const { data, error } = await supabaseAdmin
    .from('research_projects')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ project: data });
}, { routeName: 'research' });

/* DELETE — Soft-delete (archive) a research project */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Project id is required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('research_projects')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}, { routeName: 'research' });
