// app/api/admin/research/[projectId]/documents/[docId]/full-extract/route.ts
// Runs the comprehensive extraction-objectives analysis on a single document.
// Uses the resource-analyzer to check every extraction objective and creates
// DataAtoms for cross-validation.
//
// This works for ANY document: user-uploaded, auto-discovered, or manual entry.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { analyzeResource, type AnalysisInput } from '@/lib/research/resource-analyzer';
import type { ResourceType } from '@/lib/research/extraction-objectives';
// sharp is imported dynamically for PDF rendering

export const maxDuration = 300; // 5 minutes for full extraction

function extractIds(req: NextRequest): { projectId: string | null; docId: string | null } {
  const parts = req.nextUrl.pathname.split('/');
  const researchIdx = parts.indexOf('research');
  const documentsIdx = parts.indexOf('documents');
  return {
    projectId: researchIdx >= 0 ? (parts[researchIdx + 1] ?? null) : null,
    docId: documentsIdx >= 0 ? (parts[documentsIdx + 1] ?? null) : null,
  };
}

/** Map document_type to ResourceType for extraction objectives */
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
    default: return 'deed_document'; // Default to deed for broadest extraction objectives
  }
}

/**
 * POST — Run full extraction-objectives analysis on a document.
 *
 * Reads the document content (text + images), runs AI analysis against
 * all applicable extraction objectives, and returns the comprehensive report.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) {
    return NextResponse.json({ error: 'Project ID and Document ID are required' }, { status: 400 });
  }

  // Load project + document
  const [projectRes, docRes] = await Promise.all([
    supabaseAdmin
      .from('research_projects')
      .select('id, property_address, county')
      .eq('id', projectId)
      .single(),
    supabaseAdmin
      .from('research_documents')
      .select('id, document_type, document_label, extracted_text, source_type, source_url, file_type, storage_path, storage_url, original_filename')
      .eq('id', docId)
      .eq('research_project_id', projectId)
      .single(),
  ]);

  if (!projectRes.data) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  if (!docRes.data) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const doc = docRes.data;
  const resourceType = docTypeToResourceType(doc.document_type);
  const label = doc.document_label || doc.original_filename || `Document ${docId}`;

  // Build analysis input
  const input: AnalysisInput = {
    resource_id: docId,
    resource_label: label,
    resource_type: resourceType,
    text_content: doc.extracted_text || undefined,
    source_url: doc.source_url || undefined,
    pipeline_step: 'full-extract',
  };

  // For image/PDF documents, try to get the image for visual analysis
  const fileType = (doc.file_type ?? '').toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'tif', 'bmp', 'gif'].includes(fileType);

  if (isImage && (doc.storage_path || doc.storage_url)) {
    try {
      let imageBuffer: Buffer | null = null;

      if (doc.storage_path) {
        const { data, error } = await supabaseAdmin.storage
          .from(RESEARCH_DOCUMENTS_BUCKET)
          .download(doc.storage_path);
        if (!error && data) {
          imageBuffer = Buffer.from(await data.arrayBuffer());
        }
      }

      if (!imageBuffer && doc.storage_url) {
        const resp = await fetch(doc.storage_url, { signal: AbortSignal.timeout(30_000) });
        if (resp.ok) {
          imageBuffer = Buffer.from(await resp.arrayBuffer());
        }
      }

      if (imageBuffer) {
        input.image_data = imageBuffer.toString('base64');
        input.image_media_type = `image/${fileType === 'jpg' ? 'jpeg' : fileType}`;
      }
    } catch (err) {
      console.warn(`[full-extract] Could not load image for ${docId}:`, err);
    }
  }

  // For PDFs, render first page as image for visual analysis
  if (fileType === 'pdf' && doc.storage_path) {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(RESEARCH_DOCUMENTS_BUCKET)
        .download(doc.storage_path);

      if (!error && data) {
        const pdfBuffer = Buffer.from(await data.arrayBuffer());
        try {
          const sharp = (await import('sharp')).default;
          const pageBuffer = await sharp(pdfBuffer, { page: 0, density: 150 }).png().toBuffer();
          input.image_data = pageBuffer.toString('base64');
          input.image_media_type = 'image/png';
        } catch {
          // sharp not available or PDF render failed — use text only
        }
      }
    } catch {
      // Non-fatal — will analyze text only
    }
  }

  // Run the analysis
  const result = await analyzeResource(input);

  // Store the extraction report as a data point in the project
  try {
    await supabaseAdmin
      .from('research_documents')
      .update({
        analysis_metadata: {
          full_extraction_report: result.report,
          extraction_atoms_count: result.atoms.length,
          extraction_timestamp: new Date().toISOString(),
        },
      })
      .eq('id', docId);
  } catch {
    // Non-fatal — report is returned in the response regardless
  }

  return NextResponse.json({
    report: result.report,
    atoms_created: result.atoms.length,
    atoms: result.atoms,
    resource_type: resourceType,
    extraction_score: result.report.extraction_score,
    summary: result.report.summary,
    interesting_findings: result.report.interesting_findings,
  });
}, { routeName: 'research/documents/full-extract' });
