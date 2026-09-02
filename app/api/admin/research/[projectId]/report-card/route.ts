// app/api/admin/research/[projectId]/report-card/route.ts — what a run achieved, per dollar (R30).
//
// "As cheap but as effective as possible" has not been a number. R4 made spend measurable, R5 made
// the budget enforceable, R22 put both on a screen — but nothing said whether a run that cost $4.20
// did more than one that cost $1.10.
//
// `?compare=1` returns the two most recent runs side by side, which is the acceptance case: two runs
// on one property with different budgets, on one screen.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import { buildReportCard, compareCards, type RunContent, type RunFacts } from '@/lib/research/report-card';
import { evidenceFor } from '@/lib/research/fact-evidence';
import type { ExtractedDataPoint } from '@/types/research';

function extractProjectId(req: NextRequest): string | null {
  const after = req.nextUrl.pathname.split('/research/')[1];
  return after ? after.split('/')[0] || null : null;
}

interface RunRow {
  id: string; status: string; started_at: string; finished_at: string | null;
  cost_usd: number | string; paid_pages: number;
  limits: RunFacts['limits']; skipped_work: RunFacts['skippedWork']; budget_summary: string | null;
}

function toFacts(r: RunRow): RunFacts {
  return {
    runId: r.id,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    costUsd: Number(r.cost_usd) || 0,
    paidPages: r.paid_pages ?? 0,
    limits: r.limits ?? null,
    skippedWork: r.skipped_work ?? [],
    budgetSummary: r.budget_summary,
  };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  const compare = req.nextUrl.searchParams.get('compare') === '1';

  const { data: runData, error: runErr } = await supabaseAdmin
    .from('research_runs')
    .select('id, status, started_at, finished_at, cost_usd, paid_pages, limits, skipped_work, budget_summary')
    .eq('research_project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(compare ? 2 : 1);

  // A failed read is not "no runs" — the distinction this repo has had to make everywhere.
  if (runErr) {
    return NextResponse.json(
      { error: 'The run history could not be read. This is not the same as no run having happened.' },
      { status: 500 },
    );
  }

  const runs = (runData ?? []) as RunRow[];
  if (runs.length === 0) {
    return NextResponse.json({ card: null, message: 'No run has been recorded for this project yet.' });
  }

  // ── SCOPED TO THE RUN, NOW THAT A DOCUMENT CAN NAME ITS RUN (plan D5) ─────────────────────
  //
  // This measured the whole PROJECT and said so on the card: "nothing tags a document or fact
  // with its run, so the counts above are for the whole project, not this run alone." That was
  // true, and seed 623 made it false — `research_documents.research_run_id` records which run
  // first produced each row.
  //
  // A disclaimer that outlives the limitation it describes is worse than no disclaimer: it
  // trains people to discount a number that has become correct.
  //
  // The fallback is not cosmetic. 671 documents in this database predate attribution entirely,
  // and for a project made only of those, a run-scoped count is ZERO — which would read as a run
  // that found nothing rather than a run nobody labelled. So: count by run when the run has any
  // attributed rows, fall back to the project when it has none, and SAY WHICH on the card.
  const [runDocRes, docRes, factRes, conflictRes, adapterRes, projectRes] = await Promise.all([
    supabaseAdmin.from('research_documents')
      .select('id, readability, processing_status')
      .eq('research_project_id', projectId)
      .eq('research_run_id', runs[0].id),
    supabaseAdmin.from('research_documents')
      .select('id, readability, processing_status').eq('research_project_id', projectId),
    supabaseAdmin.from('extracted_data_points').select('*').eq('research_project_id', projectId),
    supabaseAdmin.from('discrepancies').select('id').eq('research_project_id', projectId),
    supabaseAdmin.from('research_site_adapters').select('id, county_id, status').neq('status', 'retired'),
    supabaseAdmin.from('research_projects').select('county').eq('id', projectId).single(),
  ]);

  type DocRow = { readability: string | null; processing_status: string };
  const runDocuments = (runDocRes.data ?? []) as DocRow[];
  const projectDocuments = (docRes.data ?? []) as DocRow[];
  // Attributed rows exist for this run → the card is about this run. None → it is about the
  // project, and the card says that in place of the old blanket disclaimer.
  const scopedToRun = runDocuments.length > 0;
  const documents = scopedToRun ? runDocuments : projectDocuments;
  const facts = (factRes.data ?? []) as ExtractedDataPoint[];
  const unreadable = documents.filter((d) => d.processing_status === 'unreadable').length;

  // Sources registered for THIS county. Without a county on the project the denominator is unknown,
  // and the card says so rather than showing a coverage of zero.
  const county = (projectRes.data as { county?: string } | null)?.county ?? null;
  let sourcesRegistered = 0;
  if (county) {
    const { data: countyRows } = await supabaseAdmin
      .from('research_counties').select('id').ilike('name', county.replace(/\s+county$/i, '').trim());
    const countyIds = new Set(((countyRows ?? []) as Array<{ id: string }>).map((c) => c.id));
    sourcesRegistered = ((adapterRes.data ?? []) as Array<{ county_id: string }>)
      .filter((a) => countyIds.has(a.county_id)).length;
  }

  const content: RunContent = {
    documents: documents.length,
    unreadableDocuments: unreadable,
    sourcesRegistered,
    // A retrieved document nobody can read is not a source reached — counting it is how a thin run
    // scores well.
    sourcesReached: documents.length - unreadable,
    facts: facts.length,
    factsWithEvidence: facts.filter((f) => evidenceFor(f).strength !== 'asserted').length,
    factsReviewed: facts.filter((f) => f.review_status && f.review_status !== 'unreviewed').length,
    conflicts: (conflictRes.data ?? []).length,
  };

  const cards = runs.map((r) => buildReportCard(toFacts(r), content));

  return NextResponse.json(
    {
      card: cards[0],
      // Two runs on one property with different budgets, on one screen — the acceptance case.
      comparison: compare && cards.length === 2 ? compareCards(cards[1]!, cards[0]!) : null,
      // Was an unconditional `true` beside a disclaimer saying the card could never be
      // run-scoped. It can be now (plan D5), so this reports which scope was actually used —
      // and the panel renders a different sentence for each.
      contentIsPerProject: !scopedToRun,
      documentsScopedToRun: scopedToRun,
      runNumber: (runs[0] as unknown as { run_number?: number }).run_number ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { routeName: 'research/report-card' });
