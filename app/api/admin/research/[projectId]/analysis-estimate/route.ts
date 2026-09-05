// app/api/admin/research/[projectId]/analysis-estimate/route.ts — the AI-analysis price quote (E2).
//
// Plan GATHER_AND_REVIEW_SPLIT E2. Returns the FIXED standardized quote for AI-analysing this
// project's gathered documents: a total (sum of every file's pages × the $/page rate) and a per-file
// breakdown, each with its own price. The Review UI (E3) shows the total next to "Run AI Review" and
// a price on each file's "Analyze this" button. Read-only; charges nothing.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  ANALYSIS_RATE_USD_PER_PAGE,
  estimateAnalysis,
  estimateForDocuments,
  pageCountOf,
} from '@/lib/research/analysis-estimate';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

/* GET — the analysis price quote for a project: a total + a per-file breakdown. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('research_documents')
    .select('id, document_label, document_type, page_count')
    .eq('research_project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Could not load documents for the estimate', details: error.message }, { status: 500 });
  }

  const docs = (data ?? []) as Array<{
    id: string;
    document_label: string | null;
    document_type: string | null;
    page_count: number | null;
  }>;

  const perFile = docs.map((d) => {
    const pages = pageCountOf(d);
    const est = estimateAnalysis(pages);
    return {
      documentId: d.id,
      label: d.document_label ?? d.document_type ?? d.id,
      pages,
      costUsd: est.costUsd,
      etaSeconds: est.etaSeconds,
    };
  });

  const total = estimateForDocuments(docs);

  return NextResponse.json({
    projectId,
    ratePerPageUsd: ANALYSIS_RATE_USD_PER_PAGE,
    documentCount: docs.length,
    total: { pages: total.pages, costUsd: total.costUsd, etaSeconds: total.etaSeconds },
    perFile,
  });
});
