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

      const { error: insertErr } = await resilientInsertDocument(supabase, {
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

      const { error: grpInsertErr } = await resilientInsertDocument(supabase, {
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
      //    with the PDF URL for viewing and page URLs stored in ocr_regions JSON
      const displayLabel = pages.length > 1
        ? `${capitalizeFirst(category)}: ${label} (${pages.length} pages)`
        : `${capitalizeFirst(category)}: ${label}`;

      const { error: docInsertErr } = await resilientInsertDocument(supabase, {
        research_project_id: projectId,
        source_type: 'property_search',
        original_filename: `${category}_${safeLabel}`,
        file_type: pdfUrl ? 'pdf' : 'png',
        file_size_bytes: totalBytes,
        storage_path: `${projectId}/artifacts/${category}/`,
        storage_url: pageUrls[0] || null,         // First page image for thumbnail
        pages_pdf_url: pdfUrl,                      // Bundled PDF for inline viewing
        source_url: firstPage.sourceUrl,
        document_type: docType,
        document_label: displayLabel,
        page_count: pages.length,
        processing_status: 'analyzed',
        ocr_regions: JSON.stringify({ pageUrls }),  // Store all page URLs for gallery
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

/** Original document_type values from seed 090 (before migration 106). */
const ORIGINAL_DOC_TYPES = new Set([
  'deed', 'plat', 'survey', 'legal_description', 'title_commitment',
  'easement', 'restrictive_covenant', 'field_notes', 'subdivision_plat',
  'metes_and_bounds', 'county_record', 'appraisal_record', 'aerial_photo',
  'topo_map', 'utility_map', 'other',
]);

/**
 * Insert a research_documents row with automatic fallback:
 * 1. Try full insert (with pages_pdf_url and expanded doc types).
 * 2. If it fails (missing column or CHECK constraint), retry without
 *    pages_pdf_url and with document_type='other'.
 */
async function resilientInsertDocument(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<{ error: string | null }> {
  // First attempt — full insert
  const { error: err1 } = await (supabase as any).from('research_documents').insert(row);
  if (!err1) return { error: null };

  const msg1 = err1.message || String(err1);
  console.warn(`[ArtifactUploader] Insert failed (attempt 1): ${msg1}`);

  // Second attempt — remove pages_pdf_url, fall back doc type to 'other'
  const fallbackRow = { ...row };
  delete fallbackRow.pages_pdf_url;
  if (fallbackRow.document_type && !ORIGINAL_DOC_TYPES.has(fallbackRow.document_type as string)) {
    fallbackRow.document_type = 'other';
  }

  const { error: err2 } = await (supabase as any).from('research_documents').insert(fallbackRow);
  if (!err2) {
    console.log(`[ArtifactUploader] Fallback insert succeeded (without pages_pdf_url, type=${fallbackRow.document_type})`);
    return { error: null };
  }

  return { error: `${msg1} → fallback also failed: ${err2.message || String(err2)}` };
}
