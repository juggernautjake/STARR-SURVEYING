// worker/src/services/artifact-uploader.ts
// Uploads pipeline artifacts (screenshots, page images, plat images) to
// Supabase Storage so they're accessible from the frontend for review.
//
// Multi-page documents (deeds, plats) are grouped by instrument number and
// bundled into a single PDF per document so the user can view all pages
// together in the review stage.
//
// Stored at: research-documents/{projectId}/artifacts/{category}/{filename}

import type { SupabaseClient } from '@supabase/supabase-js';
import { pageImagesToBuffer } from './pages-to-pdf.js';
import type { DocumentPage } from '../types/index.js';

import { assessOcr, isLandRecordType, type Readability } from '../infra/ocr-quality.js';
import { ProjectLibrary, refFromRow } from '../research/project-library.js';
import { fileResearchDocument, FilingTally, type FileDocumentDb } from '../research/file-document.js';

// ── FILING CONTEXT ─────────────────────────────────────────────────────────────────────────────
//
// What a run needs in order to file a document without duplicating it: which project's library to
// check against, which county the identity is scoped to, and which run to stamp the row with.
//
// Registered per project rather than passed down through five call sites, because every one of
// those sites already has `projectId` in scope and none of them has any business knowing about
// deduplication. Keyed by project and not held in a module-level singleton, because this worker
// runs several pipelines at once (`CAPACITY.maxConcurrentPipelines`) and a shared context would
// let one project's run dedupe against another project's library — which would silently drop
// documents, the one failure this whole subsystem is built to make impossible.
export interface FilingContext {
  library: ProjectLibrary;
  county: string;
  runId: string | null;
  tally: FilingTally;
}

const filingContexts = new Map<string, FilingContext>();

/** Load the project's library and register it for the duration of a run. */
export async function beginFiling(
  supabase: SupabaseClient,
  projectId: string,
  county: string,
  runId: string | null,
): Promise<FilingContext> {
  const library = await ProjectLibrary.load(
    supabase as unknown as Parameters<typeof ProjectLibrary.load>[0],
    projectId,
    county,
  );
  const ctx: FilingContext = { library, county, runId, tally: new FilingTally() };
  filingContexts.set(projectId, ctx);
  console.log(`[ArtifactUploader] ${projectId}: ${library.describe()}`);
  return ctx;
}

/** End a run's filing and hand back what deduplication actually did. */
export function endFiling(projectId: string): FilingTally | null {
  const ctx = filingContexts.get(projectId);
  filingContexts.delete(projectId);
  if (!ctx) return null;
  console.log(`[ArtifactUploader] ${projectId}: ${ctx.tally.describe()}`);
  return ctx.tally;
}

/** The live context, for callers that want to report progress mid-run. */
export function filingTally(projectId: string): FilingTally | null {
  return filingContexts.get(projectId)?.tally ?? null;
}

// ── The readability floor, on the worker path too (plan R18) ───────────────────────────────────
//
// R18 put a quality floor on the app's extraction path. This is the path that actually runs
// production pipelines, and it had none — a scanned deed that OCR'd to nothing was written with
// `processing_status: 'analyzed'`, which is a stronger claim than the app's path ever made about a
// document it could actually read.
//
// Same assessor as the app, imported rather than reimplemented: two copies is how the rule ends up
// enforced on one path and not the other.
function assessArtifact(
  text: string | null | undefined,
  pageCount: number,
  documentType: string | null | undefined,
): { status: 'analyzed' | 'extracted' | 'unreadable'; readability: Readability; reason: string } {
  const a = assessOcr({
    text: text ?? '',
    pageCount,
    // Artifact text comes from the vision path, so the digit test applies to land records.
    method: 'ocr-vision',
    isLandRecord: isLandRecordType(documentType),
  });
  return {
    // 'analyzed' only when the text is good enough to have been analysed. A thin extraction is
    // 'extracted' — real, but not a finished analysis — and an unusable one says so.
    status: a.readability === 'unreadable' ? 'unreadable' : a.readability === 'good' ? 'analyzed' : 'extracted',
    readability: a.readability,
    reason: a.reason,
  };
}


const BUCKET = 'research-documents';

// ── Screenshot Classification ──────────────────────────────────────────────

/** Patterns in URLs or descriptions that indicate a useless/junk screenshot */
const MISC_SCREENSHOT_PATTERNS = [
  // Error/empty pages
  /no\s*results?\s*found/i,
  /0\s*results?\s*found/i,
  /no\s*records?\s*found/i,
  /no\s*documents?\s*found/i,
  /no\s*data\s*(?:available|found)/i,
  /try\s*again/i,
  /please\s*try\s*(?:again|later)/i,
  /search\s*returned\s*no/i,
  /your\s*search\s*did\s*not/i,
  // Auth/access issues
  /not\s*authorized/i,
  /unauthorized/i,
  /access\s*denied/i,
  /permission\s*denied/i,
  /login\s*required/i,
  /sign\s*in\s*to\s*continue/i,
  /session\s*(?:expired|timeout)/i,
  /403\s*forbidden/i,
  /401\s*unauthorized/i,
  // Generic error pages
  /page\s*not\s*found/i,
  /404\s*(?:error|not\s*found)/i,
  /500\s*(?:error|internal\s*server)/i,
  /server\s*error/i,
  /something\s*went\s*wrong/i,
  /an?\s*error\s*(?:has\s*)?occurred/i,
  // Empty/loading states
  /loading\.{3,}/i,
  /please\s*wait/i,
  // CAPTCHA/bot detection
  /captcha/i,
  /verify\s*you\s*are\s*(?:human|not\s*a\s*(?:robot|bot))/i,
  /robot\s*verification/i,
];

/** URL patterns that typically produce useless screenshots */
const MISC_URL_PATTERNS = [
  /\/query\?/i,          // ArcGIS REST API JSON responses
  /[?&]f=json/i,         // ArcGIS JSON format parameter
  /\/login/i,            // Login pages
  /\/auth\//i,           // Auth pages
  /\/error/i,            // Error pages
  /about:blank/i,        // Blank pages
  /chrome-error/i,       // Chrome error pages
];

/**
 * Classify a screenshot as 'useful' or 'misc' based on its URL, description,
 * and visible page text. Misc screenshots include error pages, empty search
 * results, auth walls, empty PDF viewers, etc.
 */
function classifyScreenshot(url: string, description: string, pageText?: string): 'useful' | 'misc' {
  // Check URL + description
  const textToCheck = `${url} ${description}`;
  for (const pattern of MISC_SCREENSHOT_PATTERNS) {
    if (pattern.test(textToCheck)) return 'misc';
  }
  for (const pattern of MISC_URL_PATTERNS) {
    if (pattern.test(url)) return 'misc';
  }

  // Check visible page text (captured from the browser)
  if (pageText) {
    for (const pattern of MISC_SCREENSHOT_PATTERNS) {
      if (pattern.test(pageText)) return 'misc';
    }

    // Very short page text often means an empty/broken page
    // (less than 20 chars of visible text = probably empty or loading)
    const trimmed = pageText.replace(/\s+/g, ' ').trim();
    if (trimmed.length < 20) return 'misc';
  }

  return 'useful';
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArtifactScreenshot {
  source: string;
  url: string;
  imageBase64: string;
  capturedAt: string;
  description: string;
  /** First ~500 chars of visible page text (for classification) */
  pageText?: string;
  /** Pre-classified by AI/regex in the pipeline (if set, skips re-classification) */
  classification?: 'useful' | 'misc';
}

export interface ArtifactPageImage {
  /** Category: 'deed', 'plat', 'easement', etc. */
  category: string;
  /** Instrument number or document identifier */
  label: string;
  /** Page number within the document */
  pageNumber: number;
  /** Base64-encoded image data */
  imageBase64: string;
  /** Source URL from scraper */
  sourceUrl: string | null;
  /** Rich display label for the document (e.g. "WARRANTY DEED — Smith to Jones (Instr. 123)") */
  documentLabel?: string;
  /** Recording info (e.g. "Instrument No. 123 — Vol. 4, Pg. 56") */
  recordingInfo?: string | null;
  /** Recording date */
  recordedDate?: string | null;
  /** AI analysis text / extracted text to persist */
  extractedText?: string | null;
  /** Document type override (e.g. 'deed', 'subdivision_plat') */
  documentType?: string | null;
}

export interface ArtifactUploadResult {
  screenshotsUploaded: number;
  documentsUploaded: number;
  pageImagesUploaded: number;
  errors: string[];
}

// ── Main Upload Function ──────────────────────────────────────────────────────

/**
 * Upload all pipeline artifacts to Supabase Storage and create research_documents rows.
 *
 * Multi-page documents are grouped by label and bundled into a single PDF.
 * Individual page images are also uploaded for the artifact gallery.
 * One research_documents row is created per document (not per page).
 *
 * Never throws — all errors are caught and logged.
 */
export async function uploadPipelineArtifacts(
  supabase: SupabaseClient,
  projectId: string,
  screenshots: ArtifactScreenshot[],
  pageImages: ArtifactPageImage[],
): Promise<ArtifactUploadResult> {
  const result: ArtifactUploadResult = {
    screenshotsUploaded: 0,
    documentsUploaded: 0,
    pageImagesUploaded: 0,
    errors: [],
  };

  console.log(
    `[ArtifactUploader] ${projectId}: START — uploading ${screenshots.length} screenshot(s) + ${pageImages.length} page image(s)`,
  );
  console.log(
    `[ArtifactUploader] ${projectId}: Screenshot sources: ${screenshots.map(s => `${s.source}(${s.url?.substring(0, 60) ?? 'no-url'})`).join(', ')}`,
  );

  // ── Upload screenshots — group by source so multi-page docs stay together ──
  // Screenshots from the same source (e.g., "Bell County Clerk - Deed Viewer")
  // are grouped into a single research_documents row with multiple page images,
  // so the viewer's arrow-key page navigation works.
  let miscCount = 0;
  let usefulCount = 0;

  // Step 1: Classify all screenshots and group useful ones by source
  const classified: Array<{
    ss: ArtifactScreenshot;
    index: number;
    classification: 'useful' | 'misc';
    docType: string;
  }> = screenshots.map((ss, i) => {
    const cls = ss.classification ?? classifyScreenshot(ss.url || '', ss.description || '', ss.pageText);
    const docType = cls === 'misc' ? 'other' : classifyScreenshotDocType(ss.url || '', ss.description || '', ss.source || '');
    return { ss, index: i, classification: cls, docType };
  });

  // Group useful screenshots by source name (e.g., "Bell County Clerk")
  type ClassifiedSS = (typeof classified)[number];
  const usefulGroups = new Map<string, ClassifiedSS[]>();
  const miscScreenshots: ClassifiedSS[] = [];

  for (const cs of classified) {
    if (cs.classification === 'misc') {
      miscScreenshots.push(cs);
      miscCount++;
    } else {
      usefulCount++;
      const groupKey = cs.ss.source || 'unknown';
      if (!usefulGroups.has(groupKey)) usefulGroups.set(groupKey, []);
      usefulGroups.get(groupKey)!.push(cs);
    }
  }

  console.log(
    `[ArtifactUploader] ${projectId}: Screenshots — ${usefulCount} useful (${usefulGroups.size} group(s)), ${miscCount} misc`,
  );

  // Step 2: Upload misc screenshots individually (no grouping needed)
  for (const cs of miscScreenshots) {
    try {
      const safeName = sanitizeFilename(cs.ss.source);
      const filename = `screenshot_${cs.index + 1}_${safeName}.png`;
      const storagePath = `${projectId}/artifacts/screenshots-misc/${filename}`;

      const buffer = Buffer.from(cs.ss.imageBase64, 'base64');
      const { error: uploadErr } = await (supabase.storage as any)
        .from(BUCKET)
        .upload(storagePath, buffer, {
          contentType: 'image/png',
          upsert: true,
          cacheControl: '86400',
        });

      if (uploadErr) {
        result.errors.push(`Screenshot ${cs.index + 1}: ${uploadErr.message}`);
        continue;
      }

      const { data: urlData } = (supabase.storage as any).from(BUCKET).getPublicUrl(storagePath);
      const publicUrl: string = urlData?.publicUrl ?? '';

      const { error: insertErr } = await resilientInsertDocument(supabase, projectId, {
        research_project_id: projectId,
        source_type: 'property_search',
        original_filename: filename,
        file_type: 'png',
        file_size_bytes: buffer.length,
        storage_path: storagePath,
        storage_url: publicUrl,
        source_url: cs.ss.url || null,
        document_type: 'other',
        document_label: `MISC Screenshot: ${cs.ss.description || cs.ss.source}`,
        processing_status: 'analyzed',
        extracted_text: `[MISC] Screenshot captured from ${cs.ss.source} at ${cs.ss.url}\n${cs.ss.description}`,
        created_at: cs.ss.capturedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (insertErr) { result.errors.push(`Screenshot ${cs.index + 1} insert: ${insertErr}`); continue; }
      result.screenshotsUploaded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Screenshot ${cs.index + 1}: ${msg}`);
    }
  }

  // Step 3: Upload useful screenshots grouped by source
  // Multiple screenshots from the same source become pages of one document
  for (const [groupSource, groupScreenshots] of usefulGroups) {
    try {
      const pageUrls: string[] = [];
      let totalBytes = 0;
      const safeName = sanitizeFilename(groupSource);
      const firstSs = groupScreenshots[0];
      const docType = firstSs.docType;

      // Upload each screenshot as a page image
      for (let pageIdx = 0; pageIdx < groupScreenshots.length; pageIdx++) {
        const cs = groupScreenshots[pageIdx];
        try {
          const filename = `screenshot_${safeName}_page${pageIdx + 1}.png`;
          const storagePath = `${projectId}/artifacts/screenshots/${filename}`;
          const buffer = Buffer.from(cs.ss.imageBase64, 'base64');
          totalBytes += buffer.length;

          const { error: uploadErr } = await (supabase.storage as any)
            .from(BUCKET)
            .upload(storagePath, buffer, {
              contentType: 'image/png',
              upsert: true,
              cacheControl: '86400',
            });

          if (uploadErr) {
            result.errors.push(`Screenshot ${cs.index + 1}: ${uploadErr.message}`);
            console.warn(`[ArtifactUploader] Screenshot page ${pageIdx + 1} upload failed: ${uploadErr.message}`);
            continue;
          }

          const { data: urlData } = (supabase.storage as any).from(BUCKET).getPublicUrl(storagePath);
          const url: string = urlData?.publicUrl ?? '';
          pageUrls.push(url);
          result.screenshotsUploaded++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(`Screenshot page ${pageIdx + 1}: ${msg}`);
        }
      }

      if (pageUrls.length === 0) continue;

      // Bundle into PDF if multiple pages
      let pdfUrl: string | null = null;
      if (pageUrls.length > 1) {
        try {
          const docPages: DocumentPage[] = groupScreenshots.map((cs, i) => ({
            pageNumber: i + 1,
            imageBase64: cs.ss.imageBase64,
            imageFormat: detectFormat(cs.ss.imageBase64),
            width: 0,
            height: 0,
            signedUrl: null,
          }));
          const pdfBuffer = await pageImagesToBuffer(docPages);
          const pdfFilename = `screenshot_${safeName}_all_pages.pdf`;
          const pdfPath = `${projectId}/artifacts/screenshots/${pdfFilename}`;

          const { error: pdfErr } = await (supabase.storage as any)
            .from(BUCKET)
            .upload(pdfPath, pdfBuffer, {
              contentType: 'application/pdf',
              upsert: true,
              cacheControl: '86400',
            });

          if (!pdfErr) {
            const { data: pdfUrlData } = (supabase.storage as any).from(BUCKET).getPublicUrl(pdfPath);
            pdfUrl = pdfUrlData?.publicUrl ?? null;
            console.log(
              `[ArtifactUploader] ${groupSource}: bundled ${groupScreenshots.length} screenshot(s) into PDF (${Math.round(pdfBuffer.length / 1024)}KB)`,
            );
          }
        } catch (pdfErr) {
          console.warn(
            `[ArtifactUploader] ${groupSource}: PDF bundle failed: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`,
          );
        }
      }

      // Build combined extracted text from all screenshots in this group
      const combinedText = groupScreenshots.map((cs, i) =>
        `[Page ${i + 1}] Screenshot captured from ${cs.ss.source} at ${cs.ss.url}\n${cs.ss.description}`
      ).join('\n\n');

      // Create ONE research_documents row for the group
      const displayLabel = groupScreenshots.length > 1
        ? `${groupSource} (${groupScreenshots.length} pages)`
        : `Screenshot: ${firstSs.ss.description || groupSource}`;

      const { error: grpInsertErr } = await resilientInsertDocument(supabase, projectId, {
        research_project_id: projectId,
        source_type: 'property_search',
        original_filename: `screenshot_${safeName}`,
        file_type: pageUrls.length > 1 ? 'pdf' : 'png',
        file_size_bytes: totalBytes,
        storage_path: `${projectId}/artifacts/screenshots/`,
        storage_url: pageUrls[0] || null,
        pages_pdf_url: pdfUrl,
        source_url: firstSs.ss.url || null,
        document_type: docType,
        document_label: displayLabel,
        page_count: groupScreenshots.length,
        processing_status: 'analyzed',
        ocr_regions: JSON.stringify({ pageUrls }),
        extracted_text: combinedText,
        created_at: firstSs.ss.capturedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (grpInsertErr) {
        result.errors.push(`Screenshot group "${groupSource}" insert: ${grpInsertErr}`);
        continue;
      }

      console.log(
        `[ArtifactUploader] ${groupSource}: created grouped document (${groupScreenshots.length} page(s), type=${docType}, PDF=${!!pdfUrl})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Screenshot group "${groupSource}": ${msg}`);
      console.warn(`[ArtifactUploader] Screenshot group "${groupSource}" error: ${msg}`);
    }
  }

  console.log(`[ArtifactUploader] ${projectId}: Screenshot upload complete — ${usefulCount} useful, ${miscCount} misc, ${result.errors.length} errors`);

  // ── Group page images by document (category + label) ─────────────
  // This ensures all pages from the same deed/plat are bundled together.
  const docGroups = new Map<string, ArtifactPageImage[]>();
  for (const img of pageImages) {
    const key = `${img.category}::${img.label}`;
    if (!docGroups.has(key)) docGroups.set(key, []);
    docGroups.get(key)!.push(img);
  }

  // Sort pages within each group by pageNumber
  for (const pages of docGroups.values()) {
    pages.sort((a, b) => a.pageNumber - b.pageNumber);
  }

  console.log(
    `[ArtifactUploader] ${projectId}: ${pageImages.length} page image(s) grouped into ${docGroups.size} document(s)`,
  );
  for (const [key, pages] of docGroups) {
    console.log(`[ArtifactUploader] ${projectId}: Doc group "${key}": ${pages.length} page(s), sourceUrl=${pages[0]?.sourceUrl ?? 'none'}`);
  }

  // ── Upload grouped documents ──────────────────────────────────────
  for (const [groupKey, pages] of docGroups) {
    const firstPage = pages[0];
    const category = firstPage.category;
    const label = firstPage.label;
    const safeLabel = sanitizeFilename(label);
    const docType = mapCategoryToDocType(category);

    try {
      // 1. Upload individual page images (for the artifact gallery thumbnails)
      const pageUrls: string[] = [];
      let totalBytes = 0;

      for (const img of pages) {
        try {
          const filename = `${category}_${safeLabel}_page${img.pageNumber}.png`;
          const storagePath = `${projectId}/artifacts/${category}/${filename}`;
          const buffer = Buffer.from(img.imageBase64, 'base64');
          totalBytes += buffer.length;

          const contentType = detectImageContentType(img.imageBase64);

          const { error: uploadErr } = await (supabase.storage as any)
            .from(BUCKET)
            .upload(storagePath, buffer, {
              contentType,
              upsert: true,
              cacheControl: '86400',
            });

          if (uploadErr) {
            result.errors.push(`${label} page ${img.pageNumber}: ${uploadErr.message}`);
            console.warn(`[ArtifactUploader] ${label} page ${img.pageNumber} upload failed: ${uploadErr.message}`);
            continue;
          }

          const { data: urlData } = (supabase.storage as any)
            .from(BUCKET)
            .getPublicUrl(storagePath);
          const url: string = urlData?.publicUrl ?? '';
          pageUrls.push(url);
          result.pageImagesUploaded++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(`${label} page ${img.pageNumber}: ${msg}`);
        }
      }

      // 2. Bundle all pages into a single PDF for inline viewing
      let pdfUrl: string | null = null;
      if (pages.length > 0) {
        try {
          const docPages: DocumentPage[] = pages.map(p => ({
            pageNumber: p.pageNumber,
            imageBase64: p.imageBase64,
            imageFormat: detectFormat(p.imageBase64),
            width: 0,
            height: 0,
            signedUrl: null,
          }));

          const pdfBuffer = await pageImagesToBuffer(docPages);
          const pdfFilename = `${category}_${safeLabel}_all_pages.pdf`;
          const pdfPath = `${projectId}/artifacts/${category}/${pdfFilename}`;

          const { error: pdfErr } = await (supabase.storage as any)
            .from(BUCKET)
            .upload(pdfPath, pdfBuffer, {
              contentType: 'application/pdf',
              upsert: true,
              cacheControl: '86400',
            });

          if (!pdfErr) {
            const { data: pdfUrlData } = (supabase.storage as any)
              .from(BUCKET)
              .getPublicUrl(pdfPath);
            pdfUrl = pdfUrlData?.publicUrl ?? null;
            console.log(
              `[ArtifactUploader] ${label}: bundled ${pages.length} page(s) into PDF (${Math.round(pdfBuffer.length / 1024)}KB)`,
            );
          } else {
            console.warn(`[ArtifactUploader] ${label}: PDF bundle upload failed: ${pdfErr.message}`);
          }
        } catch (pdfErr) {
          console.warn(
            `[ArtifactUploader] ${label}: PDF bundle failed: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`,
          );
        }
      }

      // 3. Create ONE research_documents row for this document
      //    with the PDF URL for viewing and page URLs stored in ocr_regions JSON.
      //    Use rich metadata from the pipeline when available (documentLabel, extractedText, etc.)
      const richLabel = firstPage.documentLabel;
      const displayLabel = richLabel
        ? (pages.length > 1 ? `${richLabel} (${pages.length} pages)` : richLabel)
        : (pages.length > 1
          ? `${capitalizeFirst(category)}: ${label} (${pages.length} pages)`
          : `${capitalizeFirst(category)}: ${label}`);
      const finalDocType = firstPage.documentType || docType;

      const { error: docInsertErr } = await resilientInsertDocument(supabase, projectId, {
        research_project_id: projectId,
        source_type: 'property_search',
        original_filename: `${category}_${safeLabel}`,
        file_type: pdfUrl ? 'pdf' : 'png',
        file_size_bytes: totalBytes,
        storage_path: `${projectId}/artifacts/${category}/`,
        storage_url: pageUrls[0] || null,         // First page image for thumbnail
        pages_pdf_url: pdfUrl,                      // Bundled PDF for inline viewing
        source_url: firstPage.sourceUrl,
        document_type: finalDocType,
        document_label: displayLabel,
        page_count: pages.length,
        // Both branches of this ternary used to read 'analyzed', so a document with NO extracted
        // text was marked fully analysed exactly like one with text. The floor now decides (R18).
        processing_status: assessArtifact(firstPage.extractedText, pages.length, finalDocType).status,
        readability: assessArtifact(firstPage.extractedText, pages.length, finalDocType).readability,
        readability_reason: assessArtifact(firstPage.extractedText, pages.length, finalDocType).reason,
        ocr_regions: JSON.stringify({ pageUrls }),  // Store all page URLs for gallery
        extracted_text: firstPage.extractedText?.slice(0, 50_000) || null,
        recording_info: firstPage.recordingInfo || null,
        recorded_date: firstPage.recordedDate || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (docInsertErr) {
        result.errors.push(`Document ${label} insert: ${docInsertErr}`);
        continue;
      }
      result.documentsUploaded++;
      console.log(
        `[ArtifactUploader] ${label}: created document record (${pages.length} page(s), PDF=${!!pdfUrl})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Document ${label}: ${msg}`);
      console.warn(`[ArtifactUploader] Document ${label} error: ${msg}`);
    }
  }

  console.log(
    `[ArtifactUploader] ${projectId}: done — ` +
    `${result.screenshotsUploaded} screenshots, ` +
    `${result.documentsUploaded} document(s) (${result.pageImagesUploaded} page images) uploaded` +
    (result.errors.length > 0 ? ` (${result.errors.length} error(s))` : ''),
  );

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeFilename(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 60);
}

function detectImageContentType(base64: string): string {
  if (base64.startsWith('/9j/') || base64.startsWith('/9J/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('SUkq') || base64.startsWith('TU0A')) return 'image/tiff';
  return 'image/png';
}

function detectFormat(base64: string): 'png' | 'jpg' | 'tiff' {
  if (base64.startsWith('/9j/') || base64.startsWith('/9J/')) return 'jpg';
  if (base64.startsWith('SUkq') || base64.startsWith('TU0A')) return 'tiff';
  return 'png';
}

function mapCategoryToDocType(category: string): string {
  const map: Record<string, string> = {
    deed: 'deed',
    plat: 'plat',
    subdivision_plat: 'subdivision_plat',
    survey: 'survey',
    easement: 'easement',
    aerial: 'aerial_photo',
    topo: 'topo_map',
    tax: 'appraisal_record',
    fema: 'flood_map',
    txdot: 'road_map',
    gis: 'gis_map',
    flood: 'flood_map',
    road: 'road_map',
    map: 'gis_map',
    property: 'property_report',
    county: 'county_record',
    field_notes: 'field_notes',
    metes: 'metes_and_bounds',
    legal: 'legal_description',
    title: 'title_commitment',
  };
  return map[category.toLowerCase()] ?? 'other';
}

/**
 * Classify a screenshot's document_type based on its source URL and description.
 * This replaces the blanket 'other' assignment for all screenshots.
 */
function classifyScreenshotDocType(url: string, description: string, source: string): string {
  const text = `${url} ${description} ${source}`.toLowerCase();

  // GIS / CAD map screenshots
  if (/arcgis|gis|cad|parcel.*map|map.*viewer|parcel.*viewer/i.test(text)) return 'gis_map';

  // Deed screenshots
  if (/deed|instrument|conveyance|grantor|grantee|clerk.*record/i.test(text)) return 'deed_screenshot';

  // Plat screenshots
  if (/plat|subdivision.*map|lot.*map|replat/i.test(text)) return 'plat_screenshot';

  // Aerial / satellite imagery
  if (/aerial|satellite|imagery|google.*earth/i.test(text)) return 'aerial_photo';

  // Flood map
  if (/fema|flood|firm.*panel|flood.*zone|flood.*map/i.test(text)) return 'flood_map';

  // TxDOT / road / ROW
  if (/txdot|right.of.way|row.*map|road.*map|highway/i.test(text)) return 'road_map';

  // Topo maps
  if (/topo|elevation|usgs|contour/i.test(text)) return 'topo_map';

  // Tax / appraisal records
  if (/tax|apprais|esearch|property.*detail|cad.*property|market.*value/i.test(text)) return 'appraisal_record';

  // County records
  if (/county.*clerk|county.*record|public.*record|recording/i.test(text)) return 'county_record';

  // Property reports
  if (/property.*report|property.*search|property.*info/i.test(text)) return 'property_report';

  // General map screenshots
  if (/map|google.*maps|openstreetmap|street.*view/i.test(text)) return 'map_screenshot';

  // Survey documents
  if (/survey|rpls|surveyor|field.*note/i.test(text)) return 'survey';

  return 'other';
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Incremental Upload ──────────────────────────────────────────────────────
//
// Called mid-pipeline to upload a single document (deed, plat, screenshot set)
// immediately rather than waiting for the full pipeline to complete.
// This lets the frontend artifact gallery show results as they're captured.

/**
 * Upload a set of page images for a single document incrementally.
 * Creates the storage objects + research_documents row immediately.
 * Safe to call concurrently — each call operates on its own document.
 */
export async function uploadDocumentIncremental(
  supabase: SupabaseClient,
  projectId: string,
  pages: ArtifactPageImage[],
): Promise<{ ok: boolean; error?: string }> {
  if (pages.length === 0) return { ok: true };
  const firstPage = pages[0];
  const category = firstPage.category;
  const label = firstPage.label;
  const safeLabel = sanitizeFilename(label);

  try {
    // Sort by page number
    const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

    // 1. Upload individual page images
    const pageUrls: string[] = [];
    let totalBytes = 0;
    for (const img of sorted) {
      const filename = `${category}_${safeLabel}_page${img.pageNumber}.png`;
      const storagePath = `${projectId}/artifacts/${category}/${filename}`;
      const buffer = Buffer.from(img.imageBase64, 'base64');
      totalBytes += buffer.length;
      const contentType = detectImageContentType(img.imageBase64);

      const { error: uploadErr } = await (supabase.storage as any)
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType, upsert: true, cacheControl: '86400' });

      if (uploadErr) {
        console.warn(`[ArtifactUploader:Incremental] ${label} page ${img.pageNumber} upload failed: ${uploadErr.message}`);
        continue;
      }
      const { data: urlData } = (supabase.storage as any).from(BUCKET).getPublicUrl(storagePath);
      pageUrls.push(urlData?.publicUrl ?? '');
    }
    if (pageUrls.length === 0) return { ok: false, error: 'All page uploads failed' };

    // 2. Bundle into PDF
    let pdfUrl: string | null = null;
    if (sorted.length > 0) {
      try {
        const docPages: DocumentPage[] = sorted.map(p => ({
          pageNumber: p.pageNumber,
          imageBase64: p.imageBase64,
          imageFormat: detectFormat(p.imageBase64),
          width: 0, height: 0, signedUrl: null,
        }));
        const pdfBuffer = await pageImagesToBuffer(docPages);
        const pdfFilename = `${category}_${safeLabel}_all_pages.pdf`;
        const pdfPath = `${projectId}/artifacts/${category}/${pdfFilename}`;
        const { error: pdfErr } = await (supabase.storage as any)
          .from(BUCKET)
          .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true, cacheControl: '86400' });
        if (!pdfErr) {
          const { data: pdfUrlData } = (supabase.storage as any).from(BUCKET).getPublicUrl(pdfPath);
          pdfUrl = pdfUrlData?.publicUrl ?? null;
        }
      } catch {
        // PDF bundle is optional — page images still available
      }
    }

    // 3. Create research_documents row
    const docType = firstPage.documentType || mapCategoryToDocType(category);
    const richLabel = firstPage.documentLabel;
    const displayLabel = richLabel
      ? (sorted.length > 1 ? `${richLabel} (${sorted.length} pages)` : richLabel)
      : `${capitalizeFirst(category)}: ${label}${sorted.length > 1 ? ` (${sorted.length} pages)` : ''}`;

    const { error: insertErr } = await resilientInsertDocument(supabase, projectId, {
      research_project_id: projectId,
      source_type: 'property_search',
      original_filename: `${category}_${safeLabel}`,
      file_type: pdfUrl ? 'pdf' : 'png',
      file_size_bytes: totalBytes,
      storage_path: `${projectId}/artifacts/${category}/`,
      storage_url: pageUrls[0] || null,
      pages_pdf_url: pdfUrl,
      source_url: firstPage.sourceUrl,
      document_type: docType,
      document_label: displayLabel,
      page_count: sorted.length,
      processing_status: assessArtifact(firstPage.extractedText, sorted.length, docType).status,
      readability: assessArtifact(firstPage.extractedText, sorted.length, docType).readability,
      readability_reason: assessArtifact(firstPage.extractedText, sorted.length, docType).reason,
      ocr_regions: JSON.stringify({ pageUrls }),
      extracted_text: firstPage.extractedText?.slice(0, 50_000) || null,
      recording_info: firstPage.recordingInfo || null,
      recorded_date: firstPage.recordedDate || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (insertErr) return { ok: false, error: insertErr };

    console.log(
      `[ArtifactUploader:Incremental] ${projectId}: uploaded ${category} "${label}" — ${sorted.length} page(s), PDF=${!!pdfUrl}`,
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ArtifactUploader:Incremental] ${projectId}: ${category} "${label}" failed: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Upload a set of screenshots incrementally (e.g., GIS screenshots).
 * Classifies, groups by source, and uploads with DB row creation.
 */
export async function uploadScreenshotsIncremental(
  supabase: SupabaseClient,
  projectId: string,
  screenshots: ArtifactScreenshot[],
): Promise<{ ok: boolean; uploaded: number; error?: string }> {
  if (screenshots.length === 0) return { ok: true, uploaded: 0 };
  let uploaded = 0;
  for (const ss of screenshots) {
    try {
      const cls = ss.classification ?? classifyScreenshot(ss.url || '', ss.description || '', ss.pageText);
      if (cls === 'misc') continue; // Skip junk screenshots
      const docType = classifyScreenshotDocType(ss.url || '', ss.description || '', ss.source || '');
      const safeName = sanitizeFilename(ss.source || 'unknown');
      const filename = `screenshot_${safeName}_${Date.now()}.png`;
      const storagePath = `${projectId}/artifacts/screenshots/${filename}`;
      const buffer = Buffer.from(ss.imageBase64, 'base64');

      const { error: uploadErr } = await (supabase.storage as any)
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: 'image/png', upsert: true, cacheControl: '86400' });

      if (uploadErr) {
        console.warn(`[ArtifactUploader:Incremental] Screenshot upload failed: ${uploadErr.message}`);
        continue;
      }

      const { data: urlData } = (supabase.storage as any).from(BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData?.publicUrl ?? '';

      const { error: insertErr } = await resilientInsertDocument(supabase, projectId, {
        research_project_id: projectId,
        source_type: 'property_search',
        original_filename: filename,
        file_type: 'png',
        file_size_bytes: buffer.length,
        storage_path: storagePath,
        storage_url: publicUrl,
        source_url: ss.url || null,
        document_type: docType,
        document_label: `Screenshot: ${ss.description || ss.source}`,
        processing_status: 'analyzed',
        extracted_text: `Screenshot captured from ${ss.source} at ${ss.url}\n${ss.description}`,
        created_at: ss.capturedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (!insertErr) uploaded++;
    } catch (err) {
      console.warn(`[ArtifactUploader:Incremental] Screenshot error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`[ArtifactUploader:Incremental] ${projectId}: uploaded ${uploaded}/${screenshots.length} screenshots`);
  return { ok: true, uploaded };
}

/** Original document_type values from seed 090 (before migration 106). */
const ORIGINAL_DOC_TYPES = new Set([
  'deed', 'plat', 'survey', 'legal_description', 'title_commitment',
  'easement', 'restrictive_covenant', 'field_notes', 'subdivision_plat',
  'metes_and_bounds', 'county_record', 'appraisal_record', 'aerial_photo',
  'topo_map', 'utility_map', 'other',
]);

/** Strip the columns an older database will not have, for the retry.
 *
 *  Named, because it is this module's knowledge of its own schema drift — the generic filer has no
 *  business knowing which of these columns are new. */
function narrowRow(row: Record<string, unknown>): Record<string, unknown> {
  const fallbackRow = { ...row };
  delete fallbackRow.pages_pdf_url;
  if (fallbackRow.document_type && !ORIGINAL_DOC_TYPES.has(fallbackRow.document_type as string)) {
    fallbackRow.document_type = 'other';
  }
  return fallbackRow;
}

/**
 * File a research_documents row — deduplicating first, when the run registered a filing context.
 *
 * ── WHY THIS IS NO LONGER A BARE INSERT ───────────────────────────────────────────────────────
 *
 * It was, and that is one half of why a re-run duplicated a project's entire library. The other
 * half was that nothing stamped the row with the run that produced it, so the duplicates were
 * invisible even after they existed. Both are handled in `research/file-document.ts`, which is now
 * the only way a pipeline document reaches the table.
 *
 * With no context registered — a caller not yet updated, or Supabase unavailable when the run
 * started — this behaves exactly as it did before. Losing a document because its bookkeeping was
 * unavailable would be a worse failure than the duplicate this exists to prevent.
 */
export async function resilientInsertDocument(
  supabase: SupabaseClient,
  projectId: string,
  row: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const ctx = filingContexts.get(projectId);

  if (ctx) {
    const derived = refFromRow(row, ctx.county);
    const outcome = await fileResearchDocument(
      supabase as unknown as FileDocumentDb,
      ctx.library,
      {
        row,
        runId: ctx.runId,
        fallbackRow: narrowRow,
        candidate: {
          county: ctx.county,
          instrumentNumber: derived.instrumentNumber,
          recordingDate: derived.recordingDate,
          documentLabel: (row.document_label as string) ?? undefined,
          recordingInfo: (row.recording_info as string) ?? undefined,
          storagePath: (row.storage_path as string) ?? undefined,
          contentSha256: (row.content_sha256 as string) ?? undefined,
        },
      },
    );
    ctx.tally.record(outcome);

    switch (outcome.outcome) {
      case 'merged':
        console.log(`[ArtifactUploader] ${projectId}: already held — ${outcome.reason}`);
        return { error: null };
      case 'flagged':
        console.log(`[ArtifactUploader] ${projectId}: filed and flagged — ${outcome.reason}`);
        return { error: null };
      case 'error':
        return { error: outcome.error };
      default:
        return { error: null };
    }
  }

  // ── No filing context: the original behaviour, unchanged ────────────────────────────────────
  const { error: err1 } = await (supabase as any).from('research_documents').insert(row);
  if (!err1) return { error: null };

  const msg1 = err1.message || String(err1);
  console.warn(`[ArtifactUploader] Insert failed (attempt 1): ${msg1}`);

  const fallbackRow = narrowRow(row);
  const { error: err2 } = await (supabase as any).from('research_documents').insert(fallbackRow);
  if (!err2) {
    console.log(`[ArtifactUploader] Fallback insert succeeded (without pages_pdf_url, type=${fallbackRow.document_type})`);
    return { error: null };
  }

  return { error: `${msg1} → fallback also failed: ${err2.message || String(err2)}` };
}

// ── Imagery captures (plan F5–F7) ───────────────────────────────────────────────────────────────
//
// A capture is a research document, and this is what makes that true rather than aspirational.
//
// Bell's screenshots already went through this file, and until the project library landed they went
// through a bare `.insert(row)` — so every re-run filed every screenshot again. 19 of the 53
// duplicate document groups measured in production on 2026-09-01 were one image, re-taken and
// re-inserted. Routing captures through `resilientInsertDocument` puts them on exactly the same
// dedupe-and-attribute path as a deed: same library, same run id, same "found it again is an
// OBSERVATION, not a new document" rule.
//
// Exported so `capture-runner.ts` never needs to know the bucket name or the path convention, which
// is the knowledge this file exists to own.

/**
 * Store one captured image and file its row.
 *
 * Returns null when the upload fails, and the caller files NOTHING in that case — a row pointing at
 * a file that was never written is worse than no row at all, and this repository has shipped 22 of
 * those before.
 */
export async function storeCaptureImage(
  supabase: SupabaseClient,
  projectId: string,
  captureKey: string,
  bytes: Buffer,
): Promise<{ storagePath: string; publicUrl: string | null } | null> {
  const safe = sanitizeFilename(captureKey.replace(/[^A-Za-z0-9]+/g, '_')).slice(0, 120);
  const storagePath = `${projectId}/artifacts/captures/${safe}.png`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: uploadErr } = await (supabase.storage as any)
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: 'image/png', upsert: true, cacheControl: '86400' });
    if (uploadErr) {
      console.warn(`[ArtifactUploader] ${projectId}: capture upload failed — ${uploadErr.message}`);
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = (supabase.storage as any).from(BUCKET).getPublicUrl(storagePath);
    return { storagePath, publicUrl: (data?.publicUrl as string) ?? null };
  } catch (e) {
    console.warn(`[ArtifactUploader] ${projectId}: capture upload threw — ${String(e)}`);
    return null;
  }
}

/** File a capture's row through the SAME path every other document takes. */
export async function fileCaptureRow(
  supabase: SupabaseClient,
  projectId: string,
  row: Record<string, unknown>,
): Promise<{ outcome: 'inserted' | 'merged' | 'flagged' | 'error'; reason?: string; error?: string }> {
  const { error } = await resilientInsertDocument(supabase, projectId, row);
  if (error) return { outcome: 'error', error };
  // `resilientInsertDocument` consults the filing context, so a merge or a flag has already been
  // decided and tallied by the time it returns; it reports only success or failure. The tally is
  // what the run log prints, so the distinction is not lost — it is just not per-row here.
  return { outcome: 'inserted' };
}
