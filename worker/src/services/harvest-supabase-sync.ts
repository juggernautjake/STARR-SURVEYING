// worker/src/services/harvest-supabase-sync.ts
//
// Supabase sync layer for the DocumentHarvester.
//
// After harvest() completes, this service:
//   1. Inserts each harvested document as a row in `research_documents`
//   2. Uploads any locally-saved image files to Supabase Storage
//      (bucket: research-documents/<projectId>/<instrumentNo>-p<page>.<ext>)
//   3. Back-patches storage_path / storage_url on the inserted row
//
// This runs entirely in the background (fire-and-forget from the harvest
// endpoint) so failures are logged rather than re-thrown.

import fs from 'fs';
import path from 'path';
import type { HarvestResult, HarvestedDocument } from './document-harvester.js';
import type { DocumentImage } from '../adapters/clerk-adapter.js';

// ── Supabase client (lazy init) ───────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof import('@supabase/supabase-js').createClient>>;

let _client: SupabaseClient | null = null;

async function getSupabase(): Promise<SupabaseClient | null> {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn('[HarvestSync] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — sync disabled');
    return null;
  }

  const { createClient } = await import('@supabase/supabase-js');
  _client = createClient(url, key);
  return _client;
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

/** Map worker DocumentType values to the research_documents CHECK constraint values */
export function mapDocumentType(workerType: string): string {
  const mapping: Record<string, string> = {
    warranty_deed:          'deed',
    special_warranty_deed:  'deed',
    quitclaim_deed:         'deed',
    deed_of_trust:          'deed',
    plat:                   'plat',
    replat:                 'plat',
    amended_plat:           'plat',
    vacating_plat:          'plat',
    easement:               'easement',
    utility_easement:       'easement',
    access_easement:        'easement',
    drainage_easement:      'easement',
    restrictive_covenant:   'restrictive_covenant',
    deed_restriction:       'restrictive_covenant',
    ccr:                    'restrictive_covenant',
    right_of_way:           'easement',
    dedication:             'county_record',
    vacation:               'county_record',
    affidavit:              'county_record',
    correction_instrument:  'county_record',
    release_of_lien:        'county_record',
    mechanics_lien:         'county_record',
    tax_lien:               'county_record',
    oil_gas_lease:          'county_record',
    mineral_deed:           'deed',
    other:                  'other',
  };
  return mapping[workerType] ?? 'other';
}

/** Derive a human-readable label for the document */
export function buildDocumentLabel(doc: HarvestedDocument): string {
  const type = doc.documentType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const date = doc.recordingDate ? ` (${doc.recordingDate.slice(0, 10)})` : '';
  const party = doc.grantors.length > 0 ? ` — ${doc.grantors[0]}` : '';
  return `${type}${date}${party}`;
}

/** Detect file extension from an image path or default to 'jpg' */
function fileExtension(imagePath: string): string {
  const ext = path.extname(imagePath).replace(/^\./, '').toLowerCase();
  return ext || 'jpg';
}

// ── Core sync logic ───────────────────────────────────────────────────────────

interface SyncOptions {
  /** Supabase Storage bucket name (default: 'research-documents') */
  storageBucket?: string;
}

export interface SyncResult {
  documentsInserted: number;
  imagesUploaded: number;
  errors: string[];
}

/**
 * Sync a completed HarvestResult to Supabase.
 *
 * @param projectId  UUID of the research_projects row
 * @param result     Completed HarvestResult from DocumentHarvester.harvest()
 * @param options    Optional overrides (storage bucket, etc.)
 */
export async function syncHarvestToSupabase(
  projectId: string,
  result: HarvestResult,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const syncResult: SyncResult = { documentsInserted: 0, imagesUploaded: 0, errors: [] };

  const supabase = await getSupabase();
  if (!supabase) {
    syncResult.errors.push('Supabase not configured — skipping sync');
    return syncResult;
  }

  const bucket = options.storageBucket ?? 'research-documents';

  // Collect all harvested documents in a flat list with their relevance category
  const allDocs: HarvestedDocument[] = [
    ...result.documents.target,
    ...result.documents.subdivision,
    ...Object.values(result.documents.adjacent).flat(),
  ];

  for (const doc of allDocs) {
    try {
      const row = buildResearchDocumentRow(projectId, doc);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: insertError } = await (supabase as any)
        .from('research_documents')
        .insert(row)
        .select('id')
        .single();

      if (insertError) {
        syncResult.errors.push(`Insert failed for ${doc.instrumentNumber}: ${insertError.message}`);
        continue;
      }

      syncResult.documentsInserted++;

      // Upload images if present
      const rowId: string = (inserted as { id: string }).id;
      const uploadResult = await uploadDocumentImages(supabase, bucket, projectId, rowId, doc);
      syncResult.imagesUploaded += uploadResult.uploaded;
      syncResult.errors.push(...uploadResult.errors);
    } catch (err) {
      syncResult.errors.push(
        `Unexpected error for ${doc.instrumentNumber}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (syncResult.documentsInserted > 0) {
    console.log(
      `[HarvestSync] Synced ${syncResult.documentsInserted} documents, ` +
      `${syncResult.imagesUploaded} images to Supabase for project ${projectId}`,
    );
  }

  return syncResult;
}

// ── Row builder ───────────────────────────────────────────────────────────────

function buildResearchDocumentRow(
  projectId: string,
  doc: HarvestedDocument,
): Record<string, unknown> {
  const hasImages = doc.images.length > 0;
  const firstImage = hasImages ? doc.images[0] : null;

  return {
    research_project_id: projectId,
    source_type:         'property_search',
    original_filename:   `${doc.instrumentNumber}.pdf`,
    file_type:           firstImage ? fileExtension(firstImage.imagePath) : 'pdf',
    file_size_bytes:     null,          // not known until upload
    storage_path:        null,          // back-patched after upload
    storage_url:         null,          // back-patched after upload
    source_url:          null,
    document_type:       mapDocumentType(doc.documentType),
    document_label:      buildDocumentLabel(doc),
    processing_status:   'pending',
    // Store extra harvest metadata in a JSONB column if it exists; safe to
    // ignore if the column is absent (Supabase will reject unknown columns but
    // that only surfaces as an insert error we catch above).
    harvest_metadata:    buildHarvestMetadata(doc),
  };
}

function buildHarvestMetadata(doc: HarvestedDocument): Record<string, unknown> {
  return {
    instrumentNumber:      doc.instrumentNumber,
    documentType:          doc.documentType,
    recordingDate:         doc.recordingDate,
    grantors:              doc.grantors,
    grantees:              doc.grantees,
    pages:                 doc.pages,
    isWatermarked:         doc.isWatermarked,
    source:                doc.source,
    purchaseAvailable:     doc.purchaseAvailable,
    estimatedPurchasePrice: doc.estimatedPurchasePrice,
    relevance:             doc.relevance,
    relevanceNote:         doc.relevanceNote,
  };
}

// ── Image upload ──────────────────────────────────────────────────────────────

interface UploadResult {
  uploaded: number;
  errors: string[];
}

async function uploadDocumentImages(
  supabase: SupabaseClient,
  bucket: string,
  projectId: string,
  documentRowId: string,
  doc: HarvestedDocument,
): Promise<UploadResult> {
  const result: UploadResult = { uploaded: 0, errors: [] };

  for (const image of doc.images) {
    // Only upload images that were actually downloaded to disk
    if (!image.imagePath || !fs.existsSync(image.imagePath)) {
      continue;
    }

    const ext = fileExtension(image.imagePath);
    const storagePath = `${projectId}/${doc.instrumentNumber}-p${image.pageNumber}.${ext}`;

    try {
      const fileBuffer = fs.readFileSync(image.imagePath);
      const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: uploadError } = await (supabase.storage as any)
        .from(bucket)
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        result.errors.push(
          `Storage upload failed for ${storagePath}: ${uploadError.message}`,
        );
        continue;
      }

      result.uploaded++;

      // Back-patch the row with storage_path and public URL for page 1 only
      if (image.pageNumber === 1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: urlData } = (supabase.storage as any)
          .from(bucket)
          .getPublicUrl(storagePath);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('research_documents')
          .update({
            storage_path: storagePath,
            storage_url:  urlData?.publicUrl ?? null,
          })
          .eq('id', documentRowId);
      }
    } catch (err) {
      result.errors.push(
        `Unexpected upload error for ${storagePath}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}
