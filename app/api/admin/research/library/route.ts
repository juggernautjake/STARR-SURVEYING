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
import { canReadResearch } from '@/lib/research/access';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { libraryCountyKey } from '@/lib/research/county-key';
import { needsReview, type DocumentCatalogue } from '@/lib/research/catalogue-schema';
import { verifiedEnoughToCite, verdictLabel, type VerificationResult } from '@/lib/research/surveyor-verification';

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
  /** The document's own county. A shared library row has one; its holding project does not. */
  county_fips?: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // C11b-0: this route answered ANY signed-in account until 2026-08-25 — measured, 200 to a plain
  // `employee`. `middleware.ts` gates the /admin/research PAGES to these six roles but never ran on
  // /api/*, so the gate was in front of the screen and not in front of the data. See
  // lib/research/access.ts.
  if (!canReadResearch(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
    // `archived_at IS NULL`, not `is_archived = false`. There has never been an `is_archived`
    // column on `research_projects` — archiving is recorded as the timestamp `archived_at` — so
    // this query returned `column research_projects.is_archived does not exist` and the whole
    // Library page showed "Failed to load library" with an HTTP 500 behind it. A wrong column name
    // is a runtime error PostgREST reports at query time, which is why nothing caught it earlier:
    // there is no type over this call, and the page it breaks is one nobody had opened recently.
    .is('archived_at', null);

  if (projErr) return NextResponse.json({ error: projErr.message }, { status: 500 });

  const userProjects = (userProjectsRaw ?? []) as ProjectRow[];
  const projectIds = userProjects.map((p: ProjectRow) => p.id);
  const projectById = new Map(userProjects.map((p: ProjectRow) => [p.id, p]));

  // ── THE FIRM LIBRARY IS NOT ONE PERSON'S PROJECTS (2026-09-23) ──────────────────────────────
  //
  // This used to scope every document to `research_projects.created_by = you`, which is right for
  // YOUR work and wrong for the page called Document Library. The 8,077 Bell County plats sit on a
  // project created by `library@starr-surveying.com` — an address no human signs in as — so the
  // Library showed zero of them to everybody, including the person who imported them.
  //
  // `shareable` is already the licence fence: seeds/658 sets it true only for public records the
  // firm may share, and `worker/src/research/document-library.ts` reads nothing without it. So the
  // Library is "my projects' documents, plus everything the firm may share", and a customer's
  // purchased file — shareable false — stays out of everyone else's view exactly as before.
  const ownScope = projectIds.length
    ? `research_project_id.in.(${projectIds.join(',')}),shareable.eq.true`
    : 'shareable.eq.true';

  // 2. Build query for documents
  let query = supabaseAdmin
    .from('research_documents')
    .select('*', { count: 'exact' })
    .or(ownScope);

  if (docType) query = query.eq('document_type', docType);
  if (county) {
    // The document's OWN county, not its parent project's. A shared library row carries
    // `county_fips` (seeds/658) and its parent project is the library holding pen, which has no
    // meaningful county of its own — filtering through the project would hide every shared row.
    query = query.eq('county_fips', libraryCountyKey(county));
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

  // 4. Augment docs with project context and with what we have read off the sheet
  //
  // ── THE CATALOGUE, AND WHAT IN IT IS DOUBTFUL ───────────────────────────────────────────────
  //
  // A catalogue that only surfaces its confident values quietly becomes a catalogue nobody checks.
  // `reviewCount` is the number of values a person should confirm — a low-confidence reading, or a
  // merely-probable RPLS number — and each carries the verbatim quote it was read from, so
  // confirming one is a glance rather than an investigation.
  const augmented = filteredDocs.map((doc: DocumentRow) => {
    const catalogue = (doc.catalogue ?? null) as DocumentCatalogue | null;
    const review = needsReview(catalogue);
    // ── WHO SEALED IT, AND WHETHER THE STATE AGREES ──────────────────────────────────────────
    //
    // Checked against the TBPELS register rather than trusted from the sheet: of 145 name+licence
    // pairs read off the first 198 plats, 49% did not match the register and 65 of those wrong
    // readings were rated "high" confidence. A model reading a stamped seal cannot know that
    // CHARLES C LIGORI is not a person; the register can.
    const verification = (doc.surveyor_verification ?? []) as VerificationResult[];
    const surveyorStatus = verification.length
      ? {
          verified: verification.some((v) => verifiedEnoughToCite(v)),
          labels: verification.map((v) => verdictLabel(v.verdict)),
          // The register's own wording, so the person reads why rather than only what.
          notes: verification.map((v) => v.note),
        }
      : null;
    return {
      ...doc,
      project: projectById.get(doc.research_project_id as string) ?? null,
      catalogued: Boolean(doc.catalogued_at),
      reviewCount: review.length,
      review,
      surveyorStatus,
    };
  });

  // 5. Compute stats (over all user docs, not just this page)
  const { data: allDocsRaw } = await supabaseAdmin
    .from('research_documents')
    .select('document_type, research_project_id, source_type, county_fips')
    .or(ownScope);

  const allDocs = (allDocsRaw ?? []) as DocumentStatsRow[];
  const byType: Record<string, number> = {};
  const byCounty: Record<string, number> = {};

  for (const d of allDocs) {
    if (d.document_type) byType[d.document_type] = (byType[d.document_type] ?? 0) + 1;
    // The row's own county first: a shared row has one and its holding project does not.
    const c = (d.county_fips as string | null) || projectById.get(d.research_project_id as string)?.county;
    if (c) byCounty[c] = (byCounty[c] ?? 0) + 1;
  }

  // ── '17 PURCHASED · $0.00 SPENT' WAS A SELF-CONTRADICTION ──────────────────────────────────
  //
  // `totalPurchased` counted every document whose `source_type` was `property_search` or
  // `linked_reference` — which is everything the pipeline RETRIEVED, free or not — and
  // `totalSpent` was a hard-coded `0` behind a TODO. So the Library reported seventeen documents
  // bought for nothing, on a firm where `research_document_purchases` has zero rows.
  //
  // Both numbers come from the purchases table now, and only `completed` counts: a failed attempt
  // is recorded so the reason is visible, and a refund releases the document — the seed says so at
  // the partial unique index, and a count that ignored status would claim ownership of neither.
  const { data: purchases } = await supabaseAdmin
    .from('research_document_purchases')
    .select('cost_usd')
    .eq('status', 'completed')
    .in('research_project_id', projectIds);

  const completedPurchases = (purchases ?? []) as Array<{ cost_usd?: number | string | null }>;
  const totalPurchased = completedPurchases.length;
  const totalSpent = completedPurchases.reduce(
    (sum: number, p) => sum + Number(p.cost_usd ?? 0),
    0,
  );

  const total = count ?? filteredDocs.length;
  return NextResponse.json({
    documents: augmented,
    stats: {
      totalDocuments: allDocs.length,
      totalPurchased,
      totalSpent,
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
