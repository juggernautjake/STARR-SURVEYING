// app/api/admin/research/[projectId]/full-extract/route.ts
// Runs comprehensive extraction-objectives analysis on ALL documents + artifacts
// in a project, then cross-validates everything and produces a final synthesis.
//
// This is the "extract everything, cross-check everything, summarize everything" endpoint.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  analyzeResource,
  analyzeStructuredParcelData,
  analyzeResourceBatch,
  type AnalysisInput,
  type AnalysisResult,
} from '@/lib/research/resource-analyzer';
import { type ResourceType } from '@/lib/research/extraction-objectives';
import {
  categorizeDocument,
  isImageFileType,
  visualResourceTypeFor,
  type ArtifactCategory,
} from '@/lib/research/artifact-category';
import { synthesizeResearch, formatSynthesisForDisplay } from '@/lib/research/research-synthesizer';
import {
  createValidationGraph,
  addAtomAndValidate,
  crossValidateAtoms,
  type DataAtom,
  type ValidationGraph,
} from '@/lib/research/cross-validation.service';

export const maxDuration = 600; // 10 minutes — this is a full project analysis

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/');
  const researchIdx = parts.indexOf('research');
  return researchIdx >= 0 ? (parts[researchIdx + 1] ?? null) : null;
}

/** Map document_type to ResourceType */
function docTypeToResourceType(docType: string | null): ResourceType {
  switch (docType) {
    case 'deed': return 'deed_document';
    case 'plat':
    case 'subdivision_plat': return 'plat_document';
    case 'survey':
    case 'metes_and_bounds': return 'survey_document';
    case 'easement': return 'easement_document';
    case 'title_commitment': return 'title_document';
    case 'field_notes': return 'field_notes';
    case 'county_record': return 'county_record';
    case 'appraisal_record': return 'tax_record';
    case 'aerial_photo': return 'aerial_imagery';
    case 'topo_map': return 'gis_map';
    case 'utility_map': return 'gis_map';
    default: return 'deed_document';
  }
}

/**
 * POST — Run full extraction analysis on ALL project resources.
 *
 * Pipeline:
 *   1. Load all documents (user-uploaded + auto-discovered + manual)
 *   2. Load all artifacts (screenshots, maps)
 *   3. Run resource-analyzer on each (AI + programmatic)
 *   4. Create DataAtoms from all extractions
 *   5. Cross-validate all atoms
 *   6. Generate final synthesis with summaries
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  // Load project
  const { data: project, error: projErr } = await supabaseAdmin
    .from('research_projects')
    .select('id, property_address, county, parcel_id')
    .eq('id', projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const steps: Array<{ step: string; status: string; count?: number; duration_ms?: number }> = [];
  const startTime = Date.now();

  // ── Step 1: Load everything the project has gathered ────────────
  //
  // ONE query, because there is one table. This used to be two: documents from `research_documents`,
  // then screenshots from `research_artifacts` — a table that has never existed in any database or
  // seed (platform audit §1.1b/§8.4). The query discarded its error, so `allArtifacts` was always `[]`
  // and the visual half of this pipeline analysed nothing, on every run, without saying so.
  //
  // Artifacts are `research_documents` rows filed under an `/artifacts/…` storage path; `category` is
  // derived rather than stored. See lib/research/artifact-category.ts.
  const stepStart1 = Date.now();
  const { data: documents, error: docsError } = await supabaseAdmin
    .from('research_documents')
    .select('id, document_type, document_label, extracted_text, source_type, source_url, file_type, storage_path, storage_url, original_filename')
    .eq('research_project_id', projectId)
    .order('created_at', { ascending: true });

  // Fail loudly. Treating a broken query as "this project has no documents" is precisely how the
  // missing table stayed invisible for the lifetime of this route.
  if (docsError) {
    return NextResponse.json({ error: `Failed to load documents: ${docsError.message}` }, { status: 500 });
  }

  const allDocs = documents || [];
  steps.push({ step: 'Load documents', status: 'done', count: allDocs.length, duration_ms: Date.now() - stepStart1 });

  // ── Step 2: Split them into text work and vision work ───────────
  //
  // Each document is analysed ONCE, in whichever mode can actually read it. A row with extracted text
  // goes to the text analyser; an image with no text goes to the vision analyser. Sending both would
  // double the API spend and produce two atoms per fact that then have to be de-conflicted.
  const stepStart2 = Date.now();
  const textDocs: typeof allDocs = [];
  const visualDocs: Array<{ doc: (typeof allDocs)[number]; category: ArtifactCategory }> = [];
  let miscSkipped = 0;

  for (const doc of allDocs) {
    if (doc.extracted_text) { textDocs.push(doc); continue; }

    const category = categorizeDocument(doc.document_type, doc.storage_path, doc.document_label);
    // Error pages, empty result sets and auth walls the crawler captured on the way past. Paying a
    // vision model to read a 404 is the one outcome worse than not looking.
    if (category === 'screenshots-misc') { miscSkipped++; continue; }
    if (isImageFileType(doc.file_type) && doc.storage_url) visualDocs.push({ doc, category });
  }

  steps.push({
    step: `Split text vs visual — ${textDocs.length} text, ${visualDocs.length} visual, ${miscSkipped} misc skipped`,
    status: 'done',
    count: visualDocs.length,
    duration_ms: Date.now() - stepStart2,
  });

  // ── Step 3: Build analysis inputs ───────────────────────────────
  const inputs: AnalysisInput[] = [];

  // 3a. Documents
  for (const doc of textDocs) {
    const resourceType = docTypeToResourceType(doc.document_type);
    inputs.push({
      resource_id: doc.id,
      resource_label: doc.document_label || doc.original_filename || `Document ${doc.id}`,
      resource_type: resourceType,
      text_content: doc.extracted_text || undefined,
      source_url: doc.source_url || undefined,
      pipeline_step: `full-extract:doc:${doc.source_type || 'unknown'}`,
    });
  }

  // 3b. Images with no text of their own — plats, screenshots, aerials — go to the vision analyser.
  for (const { doc, category } of visualDocs) {
    inputs.push({
      resource_id: doc.id,
      resource_label: doc.document_label || doc.original_filename || `Artifact ${doc.id}`,
      resource_type: visualResourceTypeFor(category),
      image_data: doc.storage_url!, // URL-based image; the partition above guarantees it is set
      source_url: doc.source_url || doc.storage_url!,
      pipeline_step: `full-extract:artifact:${category}`,
    });
  }

  steps.push({ step: 'Build analysis inputs', status: 'done', count: inputs.length });

  // ── Step 4: Run batch analysis ──────────────────────────────────
  const stepStart4 = Date.now();
  const analysisResults = await analyzeResourceBatch(inputs, 3);
  steps.push({ step: 'Run batch analysis', status: 'done', count: analysisResults.length, duration_ms: Date.now() - stepStart4 });

  // ── Step 5: Collect all atoms ───────────────────────────────────
  const allAtoms: DataAtom[] = analysisResults.flatMap(r => r.atoms);
  steps.push({ step: 'Collect atoms', status: 'done', count: allAtoms.length });

  // ── Step 6: Cross-validate ──────────────────────────────────────
  const stepStart6 = Date.now();
  const graph = createValidationGraph();
  for (const atom of allAtoms) {
    addAtomAndValidate(graph, atom);
  }
  crossValidateAtoms(graph);
  steps.push({ step: 'Cross-validate', status: 'done', duration_ms: Date.now() - stepStart6 });

  // ── Step 7: Generate synthesis ──────────────────────────────────
  const stepStart7 = Date.now();
  const reports = analysisResults.map(r => r.report);

  const synthesis = await synthesizeResearch({
    project_id: projectId,
    property_address: project.property_address || 'Unknown address',
    validation_graph: graph,
    resource_reports: reports,
    validation_logs: [],
  });

  const displayData = formatSynthesisForDisplay(synthesis);
  steps.push({ step: 'Generate synthesis', status: 'done', duration_ms: Date.now() - stepStart7 });

  // ── Step 8: Store synthesis results ───────────────────────────────────────────────────────────
  //
  // ── THIS REPLACED THE WHOLE COLUMN ────────────────────────────────────────────────────────────
  //
  // `analysis_metadata` is a shared JSONB bag on the project. The seed calls it "prompt versions,
  // model used, etc."; `analysis.service.ts` keeps the run LOGS in it and — per its own comment at
  // line 560 — tracks **API spend per project** there.
  //
  // Writing a fresh object to a JSONB column REPLACES it. So running a full extraction destroyed
  // the project's logs, its recorded error and error_category, and its accumulated cost tracking.
  // Nothing said so: the update succeeded, and what was lost was whatever had been there before.
  //
  // `analysis.service.ts` already had the right shape — read, spread, write:
  //
  //     const existing = current?.analysis_metadata ?? {};
  //     .update({ analysis_metadata: { ...existing, ...extraMeta, logs } })
  //
  // Two writers to one bag, one merging and one overwriting. The merging one is correct and this
  // now matches it.
  //
  // ── AND THE `catch` COULD NEVER HAVE FIRED ────────────────────────────────────────────────────
  //
  // The Supabase client does not throw on a rejected write; it returns `{ error }`. A bare
  // `catch { /* Non-fatal */ }` around it is not error handling, it is the appearance of it — and
  // that appearance is what let a sibling route write to a non-existent column for its whole life
  // (seed 621).
  const { data: currentMeta } = await supabaseAdmin
    .from('research_projects')
    .select('analysis_metadata')
    .eq('id', projectId)
    .single();

  const { error: synthErr } = await supabaseAdmin
    .from('research_projects')
    .update({
      analysis_metadata: {
        ...((currentMeta?.analysis_metadata as Record<string, unknown>) ?? {}),
        full_extraction_synthesis: {
          generated_at: synthesis.generated_at,
          overall_confidence: synthesis.overall_confidence,
          confidence_tier: synthesis.confidence_tier,
          total_data_points: synthesis.total_data_points,
          confirmed_count: synthesis.confirmed_count,
          conflicted_count: synthesis.conflicted_count,
          data_found: synthesis.data_found,
          data_gaps: synthesis.data_gaps,
          resource_count: reports.length,
        },
        full_extraction_timestamp: new Date().toISOString(),
      },
    })
    .eq('id', projectId);

  if (synthErr) {
    // Still non-fatal — the synthesis is in the response below — but said out loud rather than
    // discarded, so a persistent failure is findable instead of invisible.
    console.error(
      `[full-extract] could not store synthesis for project ${projectId}: ${synthErr.message}`,
    );
  }

  steps.push({ step: 'Complete', status: 'done', duration_ms: Date.now() - startTime });

  return NextResponse.json({
    synthesis: displayData,
    executive_summary: synthesis.executive_summary,
    overall_confidence: synthesis.overall_confidence,
    confidence_tier: synthesis.confidence_tier,
    sections: displayData.sections,
    validation_summary: displayData.validation_summary,
    source_table: displayData.source_table,
    critical_issues: synthesis.critical_issues,
    data_found: synthesis.data_found,
    data_gaps: synthesis.data_gaps,
    gap_recommendations: synthesis.gap_recommendations,
    interesting_findings: synthesis.interesting_findings,
    resource_reports_count: reports.length,
    atoms_total: allAtoms.length,
    steps,
    duration_ms: Date.now() - startTime,
  });
}, { routeName: 'research/full-extract' });
