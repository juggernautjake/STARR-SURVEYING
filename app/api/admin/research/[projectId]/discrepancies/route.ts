// app/api/admin/research/[projectId]/discrepancies/route.ts — List discrepancies
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

/* GET — List all discrepancies for a project */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const url = req.nextUrl;
  const severity = url.searchParams.get('severity');
  const status = url.searchParams.get('status');

  let query = supabaseAdmin
    .from('discrepancies')
    .select('*')
    .eq('research_project_id', projectId)
    .order('severity', { ascending: true })
    .order('created_at', { ascending: true });

  if (severity) {
    query = query.eq('severity', severity);
  }
  if (status) {
    query = query.eq('resolution_status', status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summary counts by severity
  const summary = {
    total: data?.length || 0,
    by_severity: {} as Record<string, number>,
    by_status: {} as Record<string, number>,
    open_count: 0,
    resolved_count: 0,
  };

  for (const d of data || []) {
    summary.by_severity[d.severity] = (summary.by_severity[d.severity] || 0) + 1;
    summary.by_status[d.resolution_status] = (summary.by_status[d.resolution_status] || 0) + 1;
    if (d.resolution_status === 'resolved' || d.resolution_status === 'accepted') {
      summary.resolved_count++;
    } else {
      summary.open_count++;
    }
  }

  return NextResponse.json({
    discrepancies: data || [],
    summary,
  });
}, { routeName: 'research/discrepancies' });
