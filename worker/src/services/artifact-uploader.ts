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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArtifactScreenshot {
  source: string;
  url: string;
  imageBase64: string;
  capturedAt: string;
  description: string;
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
    `[ArtifactUploader] ${projectId}: uploading ${screenshots.length} screenshot(s) + ${pageImages.length} page image(s)`,
  );

  // ── Upload screenshots ────────────────────────────────────────────
  for (let i = 0; i < screenshots.length; i++) {
    const ss = screenshots[i];
    try {
      const safeName = sanitizeFilename(ss.source);
      const filename = `screenshot_${i + 1}_${safeName}.png`;
      const storagePath = `${projectId}/artifacts/screenshots/${filename}`;

      const buffer = Buffer.from(ss.imageBase64, 'base64');
      const { error: uploadErr } = await (supabase.storage as any)
        .from(BUCKET)
        .upload(storagePath, buffer, {
          contentType: 'image/png',
          upsert: true,
          cacheControl: '86400',
        });

      if (uploadErr) {
        result.errors.push(`Screenshot ${i + 1}: ${uploadErr.message}`);
        console.warn(`[ArtifactUploader] Screenshot ${i + 1} upload failed: ${uploadErr.message}`);
        continue;
      }

      const { data: urlData } = (supabase.storage as any)
        .from(BUCKET)
        .getPublicUrl(storagePath);
      const publicUrl: string = urlData?.publicUrl ?? '';

      await (supabase as any).from('research_documents').insert({
        research_project_id: projectId,
        source_type: 'property_search',
        original_filename: filename,
        file_type: 'png',
        file_size_bytes: buffer.length,
        storage_path: storagePath,
        storage_url: publicUrl,
        source_url: ss.url || null,
        document_type: 'other',
        document_label: `Screenshot: ${ss.description || ss.source}`,
        processing_status: 'analyzed',
        extracted_text: `Screenshot captured from ${ss.source} at ${ss.url}\n${ss.description}`,
        created_at: ss.capturedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      result.screenshotsUploaded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Screenshot ${i + 1}: ${msg}`);
      console.warn(`[ArtifactUploader] Screenshot ${i + 1} error: ${msg}`);
    }
  }

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

      await (supabase as any).from('research_documents').insert({
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
    fema: 'other',
    txdot: 'other',
  };
  return map[category.toLowerCase()] ?? 'other';
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
