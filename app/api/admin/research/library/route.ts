// app/api/admin/research/library/route.ts
// Phase 13: Global document library API.
//
// GET — Returns all research documents across all of the authenticated user's
//       projects, with optional filters (county, document_type, search query)
//       and pagination.
//
// The user's projects are identified via the created_by field in research_projects.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

interface ProjectRow {
  id: string;
  property_address: string | null;
  county: string | null;
  state: string | null;
}

interface DocumentRow {
  [key: string]: unknown;
  original_filename?: string | null;
  document_label?: string | null;
  document_type?: string | null;
  source_url?: string | null;
  source_type?: string | null;
  research_project_id?: string | null;
}

interface DocumentStatsRow {
  document_type?: string | null;
  research_project_id?: string | null;
  source_type?: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const county = searchParams.get('county') || null;
  const docType = searchParams.get('type') || null;
  const search = searchParams.get('search') || null;
  const sort = searchParams.get('sort') || 'newest';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE))));
  const offset = (page - 1) * pageSize;

  // 1. Get all project IDs for this user
  const { data: userProjectsRaw, error: projErr } = await supabaseAdmin
    .from('research_projects')
    .select('id, property_address, county, state')
    .eq('created_by', session.user.email)
    .eq('is_archived', false);

  if (projErr) return NextResponse.json({ error: projErr.message }, { status: 500 });

  const userProjects = (userProjectsRaw ?? []) as ProjectRow[];
  const projectIds = userProjects.map((p: ProjectRow) => p.id);
  const projectById = new Map(userProjects.map((p: ProjectRow) => [p.id, p]));

  if (projectIds.length === 0) {
    return NextResponse.json({
      documents: [],
      stats: { totalDocuments: 0, totalPurchased: 0, totalSpent: 0, byType: {}, byCounty: {} },
      pagination: { page, pageSize, total: 0, totalPages: 0 },
    });
  }

  // 2. Build query for documents
  let query = supabaseAdmin
    .from('research_documents')
    .select('*', { count: 'exact' })
    .in('research_project_id', projectIds);

  if (docType) query = query.eq('document_type', docType);
  if (county) {
    // Filter by county from the parent project
    const countyProjects = userProjects
      .filter((p: ProjectRow) => p.county?.toLowerCase() === county.toLowerCase())
      .map((p: ProjectRow) => p.id);
    if (countyProjects.length === 0) {
      return NextResponse.json({
        documents: [],
        stats: { totalDocuments: 0, totalPurchased: 0, totalSpent: 0, byType: {}, byCounty: {} },
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      });
    }
    query = query.in('research_project_id', countyProjects);
  }

  // Sort
  if (sort === 'oldest') {
    query = query.order('created_at', { ascending: true });
  } else if (sort === 'type') {
    query = query.order('document_type', { ascending: true }).order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  // Pagination
  query = query.range(offset, offset + pageSize - 1);

  const { data: docs, error: docsErr, count } = await query;
  if (docsErr) return NextResponse.json({ error: docsErr.message }, { status: 500 });

  // 3. Apply text search (Supabase doesn't support full-text search via in() easily)
  let filteredDocs = (docs ?? []) as DocumentRow[];
  if (search) {
    const q = search.toLowerCase();
    filteredDocs = filteredDocs.filter((d: DocumentRow) =>
      (d.original_filename as string | null | undefined ?? '').toLowerCase().includes(q) ||
      (d.document_label as string | null | undefined ?? '').toLowerCase().includes(q) ||
      (d.document_type as string | null | undefined ?? '').toLowerCase().includes(q) ||
      (d.source_url as string | null | undefined ?? '').toLowerCase().includes(q),
    );
  }

  // 4. Augment docs with project context
  const augmented = filteredDocs.map((doc: DocumentRow) => ({
    ...doc,
    project: projectById.get(doc.research_project_id as string) ?? null,
  }));

  // 5. Compute stats (over all user docs, not just this page)
  const { data: allDocsRaw } = await supabaseAdmin
    .from('research_documents')
    .select('document_type, research_project_id, source_type')
    .in('research_project_id', projectIds);

  const allDocs = (allDocsRaw ?? []) as DocumentStatsRow[];
  const byType: Record<string, number> = {};
  const byCounty: Record<string, number> = {};
  let totalPurchased = 0;

  for (const d of allDocs) {
    if (d.document_type) byType[d.document_type] = (byType[d.document_type] ?? 0) + 1;
    const proj = projectById.get(d.research_project_id as string);
    if (proj?.county) byCounty[proj.county] = (byCounty[proj.county] ?? 0) + 1;
    // Purchased documents are those retrieved from clerk/vendor systems, not user-uploaded files
    if (d.source_type === 'property_search' || d.source_type === 'linked_reference') totalPurchased++;
  }

  const total = count ?? filteredDocs.length;
  return NextResponse.json({
    documents: augmented,
    stats: {
      totalDocuments: allDocs.length,
      totalPurchased,
      totalSpent: 0,  // TODO: integrate with billing tracker
      byType,
      byCounty,
    },
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}, { routeName: 'research/library' });
