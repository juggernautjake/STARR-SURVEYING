// lib/research/image-loader.ts — Shared image loading utility
//
// Centralizes the logic for loading research document images as base64
// for the Claude Vision API. Previously duplicated in:
//   - visual-comparison.service.ts (loadImageBase64)
//   - visual-lot-identifier.service.ts (loadDocumentImageBase64)
//
// Also returns document metadata (extracted_text, document_label) in a
// single query to avoid redundant DB round-trips.

import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import type { PipelineLogger } from './pipeline-logger';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoadedImage {
  /** Base64-encoded image data */
  base64: string;
  /** Media type for Vision API */
  mediaType: 'image/png' | 'image/jpeg';
  /** Document ID */
  documentId: string;
  /** Extracted text / description stored with the document */
  extractedText: string | null;
  /** Human-readable document label */
  documentLabel: string | null;
  /** Image size in bytes */
  sizeBytes: number;
}

const IMAGE_FETCH_TIMEOUT_MS = 30_000;

// ── Core Loader ──────────────────────────────────────────────────────────────

/**
 * Load a research document image as base64 for the Vision API.
 *
 * Fetches the image from the public URL first (faster), falls back to
 * downloading from Supabase Storage. Returns null if the image cannot
 * be loaded from either source.
 *
 * Also returns extracted_text and document_label from the DB row so
 * callers don't need a second query.
 */
export async function loadDocumentImage(
  documentId: string,
  logger?: PipelineLogger,
): Promise<LoadedImage | null> {
  try {
    const { data: doc } = await supabaseAdmin
      .from('research_documents')
      .select('storage_path, storage_url, file_type, extracted_text, document_label')
      .eq('id', documentId)
      .single();

    if (!doc) {
      logger?.warn('visual_compare', `Document ${documentId} not found in database`);
      return null;
    }

    const mediaType: 'image/png' | 'image/jpeg' =
      (doc.file_type === 'jpeg' || doc.file_type === 'jpg')
        ? 'image/jpeg'
        : 'image/png';

    // Try public URL first (faster than storage download)
    if (doc.storage_url) {
      try {
        const res = await fetch(doc.storage_url, {
          signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          logger?.debug('visual_compare', `Loaded image ${documentId} from public URL (${buf.byteLength} bytes)`);
          return {
            base64: buf.toString('base64'),
            mediaType,
            documentId,
            extractedText: doc.extracted_text ?? null,
            documentLabel: doc.document_label ?? null,
            sizeBytes: buf.byteLength,
          };
        }
      } catch {
        // Fall through to storage download
      }
    }

    // Download from Supabase Storage
    if (doc.storage_path) {
      const { data: fileData } = await supabaseAdmin.storage
        .from(RESEARCH_DOCUMENTS_BUCKET)
        .download(doc.storage_path);
      if (fileData) {
        const buf = Buffer.from(await fileData.arrayBuffer());
        logger?.debug('visual_compare', `Loaded image ${documentId} from storage (${buf.byteLength} bytes)`);
        return {
          base64: buf.toString('base64'),
          mediaType,
          documentId,
          extractedText: doc.extracted_text ?? null,
          documentLabel: doc.document_label ?? null,
          sizeBytes: buf.byteLength,
        };
      }
    }

    logger?.warn('visual_compare', `Could not load image for document ${documentId} — no public URL or storage path available`);
    return null;
  } catch (err) {
    logger?.error('visual_compare', `Image load error for ${documentId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Load multiple document images in parallel.
 * Returns a Map of documentId → LoadedImage for images that loaded successfully.
 * Logs each success/failure individually.
 */
export async function loadDocumentImages(
  documentIds: string[],
  logger?: PipelineLogger,
): Promise<Map<string, LoadedImage>> {
  const results = new Map<string, LoadedImage>();
  const loadPromises = documentIds.map(async (id) => {
    const loaded = await loadDocumentImage(id, logger);
    if (loaded) {
      results.set(id, loaded);
    }
  });

  await Promise.all(loadPromises);

  const succeeded = results.size;
  const failed = documentIds.length - succeeded;
  if (logger) {
    logger.info('visual_compare', `Loaded ${succeeded}/${documentIds.length} images${failed > 0 ? ` (${failed} failed)` : ''}`);
  }

  return results;
}
