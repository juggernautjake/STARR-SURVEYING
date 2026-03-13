// lib/research/document.service.ts — Document processing pipeline
// Handles text extraction, OCR, document classification, and processing state.
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import { callAI, callVision, callDocumentAI, AIServiceError } from './ai-client';
import type { ResearchDocument, DocumentType } from '@/types/research';

// ── Processing Pipeline ──────────────────────────────────────────────────────

/**
 * Process a document through the full pipeline:
 * 1. Text extraction (pdf-parse, OCR, or direct)
 * 2. Document classification (if not already typed)
 * 3. Update database with results
 *
 * Runs async — call this after creating the research_documents row.
 */
export async function processDocument(documentId: string): Promise<void> {
  try {
    // Mark as extracting
    await updateDocumentStatus(documentId, 'extracting');

    // Load document record
    const { data: doc } = await supabaseAdmin
      .from('research_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (!doc) throw new Error(`Document ${documentId} not found`);

    // Step 1: Extract text
    const extraction = await extractText(doc);

    // Update with extracted text
    await supabaseAdmin.from('research_documents').update({
      extracted_text: extraction.text,
      extracted_text_method: extraction.method,
      page_count: extraction.pageCount || null,
      ocr_confidence: extraction.ocrConfidence || null,
      ocr_regions: extraction.ocrRegions || null,
      processing_status: 'extracted',
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);

    // Step 2: Classify document type if not already set
    if (!doc.document_type && extraction.text.trim().length > 20) {
      const classification = await classifyDocument(extraction.text);
      await supabaseAdmin.from('research_documents').update({
        document_type: classification.documentType,
        updated_at: new Date().toISOString(),
      }).eq('id', documentId);
    }

    // Mark as extracted (ready for analysis in Phase 4)
    await updateDocumentStatus(documentId, 'extracted');

  } catch (err) {
    const isAIError = err instanceof AIServiceError;
    const userMessage = isAIError ? err.userMessage : (err instanceof Error ? err.message : String(err));
    const technicalMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Document Processing] Error processing ${documentId} [${isAIError ? err.category : 'unknown'}]:`, technicalMessage);
    await supabaseAdmin.from('research_documents').update({
      processing_status: 'error',
      processing_error: userMessage.slice(0, 2000),
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);
  }
}

// ── Text Extraction ──────────────────────────────────────────────────────────

interface ExtractionResult {
  text: string;
  method: string;
  pageCount?: number;
  ocrConfidence?: number;
  ocrRegions?: unknown[];
}

async function extractText(doc: ResearchDocument): Promise<ExtractionResult> {
  const fileType = (doc.file_type || '').toLowerCase();

  // Manual entries already have their text
  if (doc.source_type === 'manual_entry') {
    return {
      text: doc.extracted_text || '',
      method: 'manual',
    };
  }

  // We need the file buffer to process
  const fileBuffer = await fetchFileBuffer(doc);
  if (!fileBuffer) {
    throw new Error('Could not retrieve file for processing');
  }

  switch (fileType) {
    case 'pdf':
      return await extractFromPdf(fileBuffer);

    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
      return await extractFromImage(fileBuffer, fileType as 'png' | 'jpg' | 'jpeg' | 'webp', doc.document_type);

    case 'tiff':
    case 'tif':
      // TIFF needs conversion to PNG before sending to Vision API
      return await extractFromTiff(fileBuffer, doc.document_type);

    case 'bmp':
    case 'gif':
      // Convert to JPEG via sharp, then OCR
      return await extractFromRasterImage(fileBuffer, doc.document_type);

    case 'heic':
    case 'heif':
      // Convert HEIC/HEIF to JPEG via sharp, then OCR
      return await extractFromRasterImage(fileBuffer, doc.document_type);

    case 'txt':
    case 'rtf':
      // RTF: strip all backslash control words (including those with numeric
      // parameters like \f0, \fs20) then remove group delimiters.  This two-
      // pass approach naturally handles nested groups without needing balanced-
      // bracket parsing.  Simple cases (plain legal-description text saved as
      // RTF from Word) work well; documents with binary picture data, complex
      // font tables, or embedded objects may produce incomplete text — for those
      // users should convert to DOCX or PDF before uploading.
      return {
        text: fileType === 'rtf'
          ? fileBuffer.toString('utf-8')
            .replace(/\\[a-z*]+[-\d]*/gi, ' ')  // strip control words (\rtf1, \b, \f0, \fs20, etc.)
            .replace(/[{}]/g, ' ')               // remove group delimiters
            .replace(/\s{2,}/g, ' ')             // collapse whitespace
            .trim()
          : fileBuffer.toString('utf-8'),
        method: fileType === 'rtf' ? 'rtf-strip' : 'direct',
      };

    case 'docx':
      return await extractFromDocx(fileBuffer);

    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

// ── PDF Extraction ───────────────────────────────────────────────────────────

/** Minimum non-whitespace characters for pdf-parse output to be considered useful */
const PDF_TEXT_MIN_CHARS = 100;

/**
 * Extract text from a PDF buffer.
 *
 * Strategy:
 * 1. Try pdf-parse for text-layer PDFs (fast, no AI cost).
 * 2. If the result is sparse (scanned/image-only PDF), fall back to Claude's
 *    native PDF document OCR which handles all pages including scanned ones.
 */
async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  let pdfParseText = '';
  let pdfPageCount: number | undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = (await import('pdf-parse')).default as unknown as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const result = await pdfParse(buffer);
    pdfParseText = result.text || '';
    pdfPageCount = result.numpages;
  } catch {
    // pdf-parse failed (corrupted, encrypted, etc.) — fall through to AI OCR
    console.warn('[Document] pdf-parse failed; falling back to Claude PDF OCR');
  }

  // If we got enough meaningful text from pdf-parse, use it directly
  if (pdfParseText.replace(/\s/g, '').length >= PDF_TEXT_MIN_CHARS) {
    return {
      text: pdfParseText,
      method: 'pdf-parse',
      pageCount: pdfPageCount,
    };
  }

  // Sparse or empty — PDF is likely scanned/image-based.
  // Send the full PDF to Claude using the native 'document' content type which
  // handles multi-page and scanned PDFs without requiring page-by-page conversion.
  console.info('[Document] PDF has sparse text; using Claude PDF document OCR');
  const base64 = buffer.toString('base64');
  const result = await callDocumentAI(
    base64,
    'OCR_EXTRACTOR',
    'Extract all text from this PDF document. Preserve all measurements, bearings, legal descriptions, and notation exactly as written.',
  );

  const data = result.response as {
    full_text?: string;
    regions?: { text: string; bbox: unknown; confidence: number }[];
    overall_confidence?: number;
    notes?: string;
  };

  return {
    text: data?.full_text || result.raw || pdfParseText,
    method: 'pdf-ocr-vision',
    pageCount: pdfPageCount,
    ocrConfidence: data?.overall_confidence,
    ocrRegions: data?.regions,
  };
}

// ── Image Extraction ─────────────────────────────────────────────────────────

/** Base64 character count above which we tile the image for better OCR.
 *  800,000 base64 chars ≈ 600 KB of decoded binary data.  Above this
 *  threshold single-pass Claude Vision struggles with fine text on
 *  high-DPI survey scans. */
const IMAGE_TILE_THRESHOLD = 800_000;
/** Number of rows and columns to divide a large image into */
const TILE_ROWS = 2;
const TILE_COLS = 2;
/** Overlap fraction between adjacent tiles (5%) */
const TILE_OVERLAP = 0.05;
/** JPEG quality used for image conversion and tile extraction */
const JPEG_QUALITY = 92;

type SupportedVisionMediaType = 'image/png' | 'image/jpeg' | 'image/webp';

/**
 * Extract text from a PNG/JPEG/WebP image buffer using Claude Vision.
 * For large images (base64 > ~600 KB) the image is split into a 2×2 grid
 * of overlapping tiles, each processed separately, then the texts are merged.
 */
async function extractFromImage(
  buffer: Buffer,
  fileType: 'png' | 'jpg' | 'jpeg' | 'webp',
  documentType?: string | null,
): Promise<ExtractionResult> {
  const mediaType: SupportedVisionMediaType =
    fileType === 'png' ? 'image/png'
    : fileType === 'webp' ? 'image/webp'
    : 'image/jpeg';

  const base64 = buffer.toString('base64');

  // Use specialized prompt for aerial/topo imagery
  const isAerialOrTopo = documentType === 'aerial_photo' || documentType === 'topo_map';
  const promptKey = isAerialOrTopo ? 'AERIAL_IMAGE_ANALYZER' : 'OCR_EXTRACTOR';

  // Tile large images for better OCR accuracy
  if (!isAerialOrTopo && base64.length > IMAGE_TILE_THRESHOLD) {
    return await extractFromImageTiled(buffer, mediaType, promptKey);
  }

  const result = await callVision(base64, mediaType, promptKey);
  return parseVisionResult(result, isAerialOrTopo);
}

/**
 * Convert TIFF buffer to PNG using sharp, then run Vision OCR.
 * Falls back to treating the raw bytes as JPEG if sharp is unavailable.
 */
async function extractFromTiff(buffer: Buffer, documentType?: string | null): Promise<ExtractionResult> {
  let pngBuffer = buffer;
  let converted = false;

  try {
    const sharp = (await import('sharp')).default;
    pngBuffer = await sharp(buffer).png().toBuffer();
    converted = true;
  } catch {
    console.warn('[Document] sharp not available or TIFF conversion failed; attempting raw OCR');
  }

  const base64 = pngBuffer.toString('base64');
  const mediaType: SupportedVisionMediaType = converted ? 'image/png' : 'image/jpeg';
  const promptKey = documentType === 'aerial_photo' || documentType === 'topo_map'
    ? 'AERIAL_IMAGE_ANALYZER'
    : 'OCR_EXTRACTOR';
  const isAerialOrTopo = promptKey === 'AERIAL_IMAGE_ANALYZER';

  if (!isAerialOrTopo && base64.length > IMAGE_TILE_THRESHOLD) {
    return await extractFromImageTiled(pngBuffer, mediaType, promptKey);
  }

  const result = await callVision(base64, mediaType, promptKey);
  const extraction = parseVisionResult(result, isAerialOrTopo);
  extraction.method = converted ? 'tiff-to-png-ocr' : 'tiff-raw-ocr';
  return extraction;
}

/**
 * Convert raster formats (BMP, GIF, HEIC, HEIF) to JPEG using sharp,
 * then run Vision OCR. Falls back gracefully if sharp is unavailable.
 */
async function extractFromRasterImage(buffer: Buffer, documentType?: string | null): Promise<ExtractionResult> {
  let jpegBuffer = buffer;
  let converted = false;

  try {
    const sharp = (await import('sharp')).default;
    jpegBuffer = await sharp(buffer).jpeg({ quality: JPEG_QUALITY }).toBuffer();
    converted = true;
  } catch {
    console.warn('[Document] sharp not available; attempting raw OCR on raster image');
  }

  const base64 = jpegBuffer.toString('base64');
  const mediaType: SupportedVisionMediaType = 'image/jpeg';
  const isAerialOrTopo = documentType === 'aerial_photo' || documentType === 'topo_map';
  const promptKey = isAerialOrTopo ? 'AERIAL_IMAGE_ANALYZER' : 'OCR_EXTRACTOR';

  if (!isAerialOrTopo && base64.length > IMAGE_TILE_THRESHOLD) {
    return await extractFromImageTiled(jpegBuffer, mediaType, promptKey);
  }

  const result = await callVision(base64, mediaType, promptKey);
  const extraction = parseVisionResult(result, isAerialOrTopo);
  extraction.method = converted ? 'raster-converted-ocr' : 'raster-raw-ocr';
  return extraction;
}

/**
 * Split a large image into a TILE_ROWS × TILE_COLS grid with TILE_OVERLAP
 * overlap between adjacent tiles. Each tile is OCR'd individually and
 * the results are concatenated in top-to-bottom, left-to-right order.
 *
 * Requires `sharp` to be installed. Falls back to single-image OCR if sharp
 * is unavailable.
 */
async function extractFromImageTiled(
  buffer: Buffer,
  mediaType: SupportedVisionMediaType,
  promptKey: 'OCR_EXTRACTOR' | 'AERIAL_IMAGE_ANALYZER',
): Promise<ExtractionResult> {
  let sharp: typeof import('sharp');
  try {
    sharp = (await import('sharp')).default;
  } catch {
    // sharp not available — fall back to single-image OCR
    console.warn('[Document] sharp not available; falling back to single-image OCR');
    const base64 = buffer.toString('base64');
    const result = await callVision(base64, mediaType, promptKey);
    return parseVisionResult(result, false);
  }

  const meta = await sharp(buffer).metadata();
  const imgW = meta.width ?? 0;
  const imgH = meta.height ?? 0;

  if (!imgW || !imgH) {
    // Can't determine dimensions — single-image fallback
    const base64 = buffer.toString('base64');
    const result = await callVision(base64, mediaType, promptKey);
    return parseVisionResult(result, false);
  }

  const overlapX = Math.floor(imgW * TILE_OVERLAP);
  const overlapY = Math.floor(imgH * TILE_OVERLAP);
  const tileW = Math.floor(imgW / TILE_COLS) + overlapX;
  const tileH = Math.floor(imgH / TILE_ROWS) + overlapY;

  const tileTexts: string[] = [];
  const tileConfidences: number[] = [];
  const tileRegions: unknown[] = [];

  for (let row = 0; row < TILE_ROWS; row++) {
    for (let col = 0; col < TILE_COLS; col++) {
      const left = Math.max(0, Math.floor(col * imgW / TILE_COLS) - overlapX);
      const top = Math.max(0, Math.floor(row * imgH / TILE_ROWS) - overlapY);
      const width = Math.min(tileW, imgW - left);
      const height = Math.min(tileH, imgH - top);

      if (width <= 0 || height <= 0) continue;

      try {
        const tileBuffer = await sharp(buffer)
          .extract({ left, top, width, height })
          .jpeg({ quality: JPEG_QUALITY })
          .toBuffer();

        const tileBase64 = tileBuffer.toString('base64');
        const tileResult = await callVision(tileBase64, 'image/jpeg', promptKey);
        const parsed = parseVisionResult(tileResult, false);

        if (parsed.text.trim()) {
          tileTexts.push(`[Segment ${row + 1}-${col + 1}]\n${parsed.text.trim()}`);
        }
        if (parsed.ocrConfidence != null) tileConfidences.push(parsed.ocrConfidence);
        if (parsed.ocrRegions) tileRegions.push(...parsed.ocrRegions);
      } catch (tileErr) {
        console.warn(`[Document] Tile ${row}-${col} OCR failed:`, tileErr instanceof Error ? tileErr.message : tileErr);
      }
    }
  }

  const mergedText = tileTexts.join('\n\n');
  const avgConfidence = tileConfidences.length
    ? tileConfidences.reduce((a, b) => a + b, 0) / tileConfidences.length
    : undefined;

  // If tiling produced nothing, fall back to single-image
  if (!mergedText.trim()) {
    const base64 = buffer.toString('base64');
    const result = await callVision(base64, mediaType, promptKey);
    return parseVisionResult(result, false);
  }

  return {
    text: mergedText,
    method: `ocr-tiled-${TILE_ROWS}x${TILE_COLS}`,
    ocrConfidence: avgConfidence,
    ocrRegions: tileRegions.length ? tileRegions : undefined,
  };
}

/** Parse a `callVision` / `callDocumentAI` result into an ExtractionResult */
function parseVisionResult(result: Awaited<ReturnType<typeof callVision>>, isAerialOrTopo: boolean): ExtractionResult {
  if (isAerialOrTopo) {
    const data = result.response as {
      coverage_description?: string;
      surveying_notes?: string;
      boundary_features?: unknown[];
      structures?: unknown[];
      overall_confidence?: number;
    };

    const text = [
      data?.coverage_description ? `COVERAGE: ${data.coverage_description}` : '',
      data?.surveying_notes ? `\nSURVEYING NOTES: ${data.surveying_notes}` : '',
      result.raw ? `\n\nFULL ANALYSIS:\n${result.raw}` : '',
    ].filter(Boolean).join('');

    return {
      text: text || result.raw || '',
      method: 'aerial-vision-analysis',
      ocrConfidence: data?.overall_confidence,
    };
  }

  const data = result.response as {
    full_text?: string;
    regions?: { text: string; bbox: unknown; confidence: number }[];
    overall_confidence?: number;
    notes?: string;
  };

  return {
    text: data?.full_text || result.raw || '',
    method: 'ocr-vision',
    ocrConfidence: data?.overall_confidence,
    ocrRegions: data?.regions,
  };
}

async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      method: 'mammoth',
    };
  } catch {
    throw new Error('Failed to extract text from DOCX file.');
  }
}

// ── Document Classification ──────────────────────────────────────────────────

interface ClassificationResult {
  documentType: DocumentType;
  confidence: number;
  reasoning: string;
}

async function classifyDocument(text: string): Promise<ClassificationResult> {
  // Send first 3000 chars for classification
  const truncated = text.substring(0, 3000);

  const result = await callAI({
    promptKey: 'DOCUMENT_CLASSIFIER',
    userContent: `Classify this document:\n\n${truncated}`,
    maxTokens: 256,
  });

  const data = result.response as {
    document_type?: string;
    confidence?: number;
    reasoning?: string;
  };

  return {
    documentType: (data?.document_type || 'other') as DocumentType,
    confidence: data?.confidence || 0,
    reasoning: data?.reasoning || '',
  };
}

// ── File Retrieval ───────────────────────────────────────────────────────────

async function fetchFileBuffer(doc: ResearchDocument): Promise<Buffer | null> {
  // Try Supabase Storage first
  if (doc.storage_path) {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(RESEARCH_DOCUMENTS_BUCKET)
        .download(doc.storage_path);

      if (!error && data) {
        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
    } catch {
      // Fall through to URL-based fetch
    }
  }

  // Try storage URL or source URL
  const url = doc.storage_url || doc.source_url;
  if (url) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
    } catch {
      // Could not fetch
    }
  }

  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function updateDocumentStatus(documentId: string, status: string): Promise<void> {
  await supabaseAdmin.from('research_documents').update({
    processing_status: status,
    updated_at: new Date().toISOString(),
  }).eq('id', documentId);
}

/**
 * Get file size in a human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate file type for upload.
 */
export const ACCEPTED_FILE_TYPES = [
  'pdf',
  'png', 'jpg', 'jpeg', 'tiff', 'tif', 'webp', 'bmp', 'gif', 'heic', 'heif',
  'docx', 'txt', 'rtf',
];
export const MAX_FILE_SIZE_MB = parseInt(process.env.RESEARCH_MAX_FILE_SIZE_MB || '50');

export function validateUploadFile(filename: string, sizeBytes: number): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (!ACCEPTED_FILE_TYPES.includes(ext)) {
    return `Unsupported file type: .${ext}. Accepted: ${ACCEPTED_FILE_TYPES.join(', ')}`;
  }
  if (sizeBytes > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `File too large (${formatFileSize(sizeBytes)}). Maximum: ${MAX_FILE_SIZE_MB} MB`;
  }
  return null;
}
