// worker/src/services/artifact-uploader.ts
// Uploads pipeline artifacts (screenshots, page images, plat images) to
// Supabase Storage so they're accessible from the frontend for review.
//
// Stored at: research-documents/{projectId}/artifacts/{category}/{filename}
// Each upload creates or updates a research_documents row with document_type
// and a public storage_url for direct browser access.

import type { SupabaseClient } from '@supabase/supabase-js';

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
  pageImagesUploaded: number;
  errors: string[];
}

// ── Main Upload Function ──────────────────────────────────────────────────────

/**
 * Upload all pipeline artifacts to Supabase Storage and create research_documents rows.
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

      // Create research_documents row
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

  // ── Upload page images ────────────────────────────────────────────
  for (let i = 0; i < pageImages.length; i++) {
    const img = pageImages[i];
    try {
      const safeLabel = sanitizeFilename(img.label);
      const filename = `${img.category}_${safeLabel}_page${img.pageNumber}.png`;
      const storagePath = `${projectId}/artifacts/${img.category}/${filename}`;

      const buffer = Buffer.from(img.imageBase64, 'base64');

      // Detect content type from base64 header
      const contentType = detectImageContentType(img.imageBase64);

      const { error: uploadErr } = await (supabase.storage as any)
        .from(BUCKET)
        .upload(storagePath, buffer, {
          contentType,
          upsert: true,
          cacheControl: '86400',
        });

      if (uploadErr) {
        result.errors.push(`Page image ${img.label} p${img.pageNumber}: ${uploadErr.message}`);
        console.warn(`[ArtifactUploader] Page image upload failed: ${uploadErr.message}`);
        continue;
      }

      const { data: urlData } = (supabase.storage as any)
        .from(BUCKET)
        .getPublicUrl(storagePath);
      const publicUrl: string = urlData?.publicUrl ?? '';

      // Create research_documents row
      const docType = mapCategoryToDocType(img.category);
      await (supabase as any).from('research_documents').insert({
        research_project_id: projectId,
        source_type: 'property_search',
        original_filename: filename,
        file_type: contentType.split('/')[1] || 'png',
        file_size_bytes: buffer.length,
        storage_path: storagePath,
        storage_url: publicUrl,
        source_url: img.sourceUrl,
        document_type: docType,
        document_label: `${capitalizeFirst(img.category)}: ${img.label} (Page ${img.pageNumber})`,
        processing_status: 'analyzed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      result.pageImagesUploaded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Page image ${img.label} p${img.pageNumber}: ${msg}`);
      console.warn(`[ArtifactUploader] Page image error: ${msg}`);
    }
  }

  console.log(
    `[ArtifactUploader] ${projectId}: done — ` +
    `${result.screenshotsUploaded} screenshots, ${result.pageImagesUploaded} page images uploaded` +
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
  // Check for JPEG magic bytes (FFD8FF)
  if (base64.startsWith('/9j/') || base64.startsWith('/9J/')) return 'image/jpeg';
  // Check for PNG magic bytes (89504E47)
  if (base64.startsWith('iVBOR')) return 'image/png';
  // Check for TIFF
  if (base64.startsWith('SUkq') || base64.startsWith('TU0A')) return 'image/tiff';
  // Default to PNG
  return 'image/png';
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
