// app/api/admin/research/[projectId]/data-points/route.ts — Extracted data points
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

/* GET — List all extracted data points for a project */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const url = req.nextUrl;
  const category = url.searchParams.get('category');
  const documentId = url.searchParams.get('document_id');
  const group = url.searchParams.get('group');

  let query = supabaseAdmin
    .from('extracted_data_points')
    .select('*')
    .eq('research_project_id', projectId)
    .order('sequence_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (category) {
    query = query.eq('data_category', category);
  }
  if (documentId) {
    query = query.eq('document_id', documentId);
  }
  if (group) {
    query = query.eq('sequence_group', group);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by category for the UI
  const grouped: Record<string, typeof data> = {};
  for (const dp of data || []) {
    if (!grouped[dp.data_category]) grouped[dp.data_category] = [];
    grouped[dp.data_category].push(dp);
  }

  return NextResponse.json({
    data_points: data || [],
    grouped,
    total: data?.length || 0,
  });
}, { routeName: 'research/data-points' });
