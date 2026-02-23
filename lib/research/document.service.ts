// lib/research/document.service.ts — Document processing pipeline
// Handles text extraction, OCR, document classification, and processing state.
import { supabaseAdmin } from '@/lib/supabase';
import { callAI, callVision, AIServiceError } from './ai-client';
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
      return await extractFromImage(fileBuffer, fileType, doc.document_type);

    case 'tiff':
    case 'tif':
      // TIFF needs conversion before OCR — treat as image
      return await extractFromImage(fileBuffer, 'png', doc.document_type);

    case 'txt':
      return {
        text: fileBuffer.toString('utf-8'),
        method: 'direct',
      };

    case 'docx':
      return await extractFromDocx(fileBuffer);

    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    // Dynamic import — pdf-parse is an optional dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = (await import('pdf-parse')).default as unknown as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const result = await pdfParse(buffer);

    // If we got meaningful text, use it
    if (result.text && result.text.trim().length > 50) {
      return {
        text: result.text,
        method: 'pdf-parse',
        pageCount: result.numpages,
      };
    }

    // Scanned PDF — fall through to OCR
    // Convert first page to image for OCR (would need pdf-to-image library)
    // For now, send the raw text we got + note that OCR may be needed
    return {
      text: result.text || '',
      method: 'pdf-parse-sparse',
      pageCount: result.numpages,
    };
  } catch {
    throw new Error('Failed to parse PDF. The file may be corrupted or password-protected.');
  }
}

async function extractFromImage(buffer: Buffer, fileType: string, documentType?: string | null): Promise<ExtractionResult> {
  const base64 = buffer.toString('base64');
  const mediaType: 'image/png' | 'image/jpeg' | 'image/webp' =
    fileType === 'png' ? 'image/png'
    : fileType === 'webp' ? 'image/webp'
    : 'image/jpeg';

  // Use specialized prompt for aerial/topo imagery to extract surveying-relevant features
  const isAerialOrTopo = documentType === 'aerial_photo' || documentType === 'topo_map';
  const promptKey = isAerialOrTopo ? 'AERIAL_IMAGE_ANALYZER' : 'OCR_EXTRACTOR';

  const result = await callVision(base64, mediaType, promptKey);

  if (isAerialOrTopo) {
    // Aerial/topo: the response is structured JSON describing visual features
    const data = result.response as {
      coverage_description?: string;
      surveying_notes?: string;
      boundary_features?: unknown[];
      structures?: unknown[];
      overall_confidence?: number;
    };

    // Convert structured JSON to a textual description for the data extraction pipeline
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

  // Standard OCR path
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
        .from('research-documents')
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
export const ACCEPTED_FILE_TYPES = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif', 'docx', 'txt', 'webp'];
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
