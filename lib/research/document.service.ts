// lib/research/document.service.ts — Document processing pipeline
// Handles text extraction, OCR, document classification, and processing state.
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
// Can the model actually read this? Assessed at capture time (plan I/S8).
import { assessCapture, chooseTiles, type CaptureAssessment } from '@/worker/src/services/ocr-legibility';
import { callAI, callVision, callDocumentAI, AIServiceError } from './ai-client';
import type { ResearchDocument, DocumentType } from '@/types/research';
// An unreadable page must say so rather than becoming a document with no facts (research plan R18).
import { assessOcr, isLandRecordType, statusFor } from './ocr-quality';
import { toConfidenceFraction } from './confidence-scale';

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

    // Is what came back actually readable? (plan R18)
    //
    // This used to write `processing_status: 'extracted'` unconditionally, so an empty or noise
    // extraction became a document with no facts and no explanation — and the packet then reported
    // the property as having no easements rather than as having a deed nobody could read.
    const assessment = assessOcr({
      text: extraction.text,
      pageCount: extraction.pageCount,
      confidence: extraction.ocrConfidence,
      method: extraction.method,
      isLandRecord: isLandRecordType(doc.document_type),
    });

    // Update with extracted text
    await supabaseAdmin.from('research_documents').update({
      extracted_text: extraction.text,
      extracted_text_method: extraction.method,
      page_count: extraction.pageCount || null,
      // The extraction prompt returns 0–100 and the worker's returns 0–1. One scale in the column;
      // see lib/research/confidence-scale.ts for why 0–1 won.
      ocr_confidence: toConfidenceFraction(extraction.ocrConfidence),
      // `ocr_regions` is DELIBERATELY NOT WRITTEN HERE (plan R17, seed 570).
      //
      // Despite its name it does not hold OCR regions: `artifact-uploader.ts` stores
      // {"pageUrls": [...]} in it, and SourceDocumentViewer and ResearchRunPanel read it back to
      // render a document's pages. This line used to write `extraction.ocrRegions || null` into it,
      // which meant every processed document either overwrote those page URLs with the OCR model's
      // own invented coordinates, or — far more often, since the field is usually absent — wrote
      // NULL and wiped them. The symptom is a document that stops displaying its pages, which points
      // nowhere near this line.
      //
      // Measured tile geometry goes to `ocr_segments` instead, and the model's claimed regions are
      // not persisted at all: nothing validated them, nothing read them, and invented pixel
      // coordinates are worse than none because they look authoritative.
      ocr_segments: extraction.ocrSegments ?? null,
      processing_status: statusFor(assessment),
      readability: assessment.readability,
      readability_reason: assessment.reason,
      readability_signals: assessment.signals,
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);

    if (assessment.readability === 'unreadable') {
      // Stop here. Classifying and analysing noise produces confident nonsense, and a document that
      // needs a person's eyes must not travel further down the pipeline pretending to be data.
      console.warn(`[Document] ${documentId} is unreadable: ${assessment.reason}`);
      await updateDocumentStatus(documentId, 'unreadable');
      return;
    }

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
  /** The MODEL's own claimed regions. `bbox` is typed `unknown` because nothing has ever validated
   *  or used it — see the note on `ocr_segments` below. Kept only so the shape of what the OCR
   *  prompt returns stays visible. */
  ocrRegions?: unknown[];

  /** Where each tile actually was, in pixels, with the page it was measured against (plan R17).
   *
   *  This is MEASURED, not asserted. The tiling loops below compute `left/top/width/height` with
   *  `sharp().extract()` — they know exactly where each tile sat — and then threw that away while
   *  collecting `data.regions`, coordinates the OCR model invented, which nothing validated and
   *  nothing read. Model-invented pixel coordinates are worse than none: they look authoritative and
   *  would scroll a reviewer to a confident wrong place. */
  ocrSegments?: {
    pageSize: { width: number; height: number };
    regions: Array<{
      segmentId: string;
      depth: number;
      page?: number;
      boundingBox: { x: number; y: number; w: number; h: number };
      text: string;
    }>;
    /** Whether fine survey text can be resolved at this capture size and tile grid (plan I/S8).
     *
     *  Stored WITH the segments because it is a property of this capture, not of the document: the
     *  same deed fetched at 300 DPI and at 36 DPI is readable in one and not the other, and a fact
     *  extracted from the second should be able to say which it came from. */
    legibility?: CaptureAssessment;
  };
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
/** Default tile grid for PDF page images — 3x3 provides excellent detail for plats.
 *
 *  A FLOOR now, not a fixed value: `chooseTiles()` may raise it for a page whose resolution the
 *  default would throw away in the API downscale. It never lowers it — see `ocr-legibility.ts`. */
const PDF_TILE_ROWS = 3;
const PDF_TILE_COLS = 3;
/** Overlap fraction between adjacent PDF tiles (8% — larger than image tiles
 *  because plat drawings have critical detail at tile boundaries) */
const PDF_TILE_OVERLAP = 0.08;
/** DPI to render PDF pages at for OCR.
 *
 *  Was `72 * 2` = **144 DPI**, under a comment claiming "2x = ~150 DPI → ~300 DPI". The comment was
 *  wrong in the direction that matters: twice PDF's 72 DPI baseline is 144, not 300.
 *
 *  144 DPI puts a 0.07" bearing label at **10.1 px**, below the 13 px floor in `ocr-legibility.ts` —
 *  so fine text on a plat was unreadable *before any tiling happened*, and no grid could recover it,
 *  because tiling cannot add resolution the render never produced. Every plat processed through this
 *  path was being OCR'd at a resolution where a bearing cannot be resolved, and OCR asked to read a
 *  bearing it cannot resolve returns a plausible one rather than an error.
 *
 *  288 DPI puts that label at **20.2 px** — the comfortable threshold, not merely the floor. The
 *  cost is 4× the pixels of the old setting: a letter page renders at 2448×3168, well inside the
 *  API's 8000 px limit, and a 36×48 plat at 10368×13824, which the tiling then handles. */
const PDF_RENDER_DPI = 288;

/**
 * Minimum characters in Claude PDF OCR result to skip the per-page tiling pass.
 * Large plat PDFs with 12+ acres and multiple properties often yield very thin
 * results from a single-pass Claude PDF call — the tiling pass is the fallback.
 * Uses a lower threshold (500) than the worker's ai-extraction.ts (800) because
 * this path processes individually-uploaded files which tend to be smaller and
 * have less dense content than multi-page subdivision plat PDFs.
 */
const PDF_OCR_MIN_CHARS_FOR_COMPLETE = 500;

/**
 * Extract text from a PDF buffer.
 *
 * Strategy:
 * 1. Try pdf-parse for text-layer PDFs (fast, no AI cost).
 * 2. If the result is sparse (scanned/image-only PDF), render each page to a
 *    high-resolution image using sharp (via PDF → PNG conversion), split each
 *    page image into a 3×3 tile grid with overlap, OCR each tile individually,
 *    and merge the results. This ensures we capture every detail from large
 *    plats and survey documents.
 * 3. If sharp-based rendering fails, fall back to Claude's native PDF document
 *    OCR which handles multi-page PDFs directly.
 * 4. If Claude PDF OCR result is also sparse (large complex plat with many
 *    lots), render each page via Playwright and apply the 2×2 tiling pipeline
 *    to each page for maximum detail extraction.
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
    console.warn('[Document] pdf-parse failed; falling back to visual OCR');
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
  // Try rendering each page to a high-res image and tiling it for detailed OCR.
  console.info('[Document] PDF has sparse text; attempting page-to-image tiled OCR');

  const tiledResult = await extractFromPdfPageTiled(buffer, pdfPageCount);
  if (tiledResult) return tiledResult;

  // Fallback: send the full PDF to Claude using the native 'document' content type
  console.info('[Document] Tiled OCR failed; using Claude PDF document OCR');
  const base64 = buffer.toString('base64');
  const result = await callDocumentAI(
    base64,
    'OCR_EXTRACTOR',
    'Extract ALL text from this PDF document, processing EVERY page thoroughly. ' +
    'This is a Texas land surveying plat or deed — preserve all measurements, bearings, ' +
    'distances, curve data, lot numbers, acreage, easements, and legal descriptions ' +
    'exactly as written. List every lot and its boundary calls separately.',
  );

  const data = result.response as {
    full_text?: string;
    regions?: { text: string; bbox: unknown; confidence: number }[];
    overall_confidence?: number;
    notes?: string;
  };

  const claudePdfText = data?.full_text || result.raw || pdfParseText;

  // If Claude PDF OCR returned substantial text, return it.
  if ((claudePdfText).replace(/\s/g, '').length >= PDF_OCR_MIN_CHARS_FOR_COMPLETE) {
    return {
      text: claudePdfText,
      method: 'pdf-ocr-vision',
      pageCount: pdfPageCount,
      ocrConfidence: data?.overall_confidence,
      ocrRegions: data?.regions,
    };
  }

  // === ENHANCED PATH ===
  // The PDF is large/complex (e.g., a multi-lot plat with 12+ acres) and
  // Claude's single-pass PDF OCR missed details. Render each page to a
  // high-resolution image and apply the 2×2 tiling pipeline for maximum
  // coverage.
  console.info(
    '[Document] PDF OCR result is sparse (' + claudePdfText.replace(/\s/g, '').length + ' chars); ' +
    'attempting per-page screenshot + tiling for ' + (pdfPageCount ?? '?') + '-page PDF',
  );

  const tiledText = await extractFromPdfViaTiling(buffer, pdfPageCount);
  if (tiledText && tiledText.replace(/\s/g, '').length > claudePdfText.replace(/\s/g, '').length) {
    return {
      text: tiledText,
      method: 'pdf-tiled-screenshots',
      pageCount: pdfPageCount,
    };
  }

  // Fall back to whatever Claude PDF OCR produced (could be empty for truly blank PDFs)
  return {
    text: claudePdfText,
    method: 'pdf-ocr-vision',
    pageCount: pdfPageCount,
    ocrConfidence: data?.overall_confidence,
    ocrRegions: data?.regions,
  };
}

/**
 * Render each PDF page to a high-resolution PNG image using sharp, then
 * split each page into a PDF_TILE_ROWS × PDF_TILE_COLS grid with overlap.
 * Each tile is OCR'd individually and the results are merged in reading order.
 *
 * This approach is critical for large plat documents where a single-pass
 * analysis misses fine details (lot dimensions, bearings, monument callouts).
 */
async function extractFromPdfPageTiled(
  buffer: Buffer,
  knownPageCount?: number,
): Promise<ExtractionResult | null> {
  let sharp: typeof import('sharp');
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('[Document] sharp not available for PDF-to-image tiling');
    return null;
  }

  // Determine page count
  const pageCount = knownPageCount ?? 1;
  const allPageTexts: string[] = [];
  const allConfidences: number[] = [];
  const allRegions: unknown[] = [];
  /** Measured tile geometry across pages, and the page size it is all measured against (plan R17). */
  const measuredPdf: NonNullable<ExtractionResult['ocrSegments']>['regions'] = [];
  let pdfPageSize: { width: number; height: number } | null = null;
  let successfulPages = 0;
  /** Grids actually used, which now vary per page. A method string naming one constant would be a
   *  fiction the moment two pages of a document are different sizes — and a mixed-size PDF (a deed
   *  with a plat exhibit stapled on) is exactly the case worth being able to see afterwards. */
  const gridsUsed = new Set<string>();

  // For each page, try to render the PDF to an image.
  // sharp can read PDF files if it was compiled with libvips PDF support (poppler or pdfium).
  // If that fails, we try sending each page region via the callDocumentAI approach.
  for (let pageIdx = 0; pageIdx < Math.min(pageCount, 20); pageIdx++) {
    console.info(`[Document] Processing PDF page ${pageIdx + 1}/${pageCount}`);
    let pageBuffer: Buffer;

    try {
      // sharp's PDF input: render a specific page at a given density.
      // The density is what fixes whether fine survey text exists in the image at all — see
      // PDF_RENDER_DPI, where the arithmetic is written out.
      pageBuffer = await sharp(buffer, {
        page: pageIdx,
        density: PDF_RENDER_DPI,
      })
        .png()
        .toBuffer();
    } catch (renderErr) {
      console.warn(
        `[Document] Could not render PDF page ${pageIdx + 1} to image:`,
        renderErr instanceof Error ? renderErr.message : renderErr,
      );
      // Can't render this page — try the native document approach for this page
      // by sending the full PDF to Claude (it handles pages internally)
      if (pageIdx === 0 && pageCount <= 5) {
        // For small PDFs where page rendering fails, fall back entirely
        return null;
      }
      continue;
    }

    // Now tile this page image
    try {
      const meta = await sharp(pageBuffer).metadata();
      const imgW = meta.width ?? 0;
      const imgH = meta.height ?? 0;

      if (!imgW || !imgH) {
        // Single-image fallback for this page
        const pageBase64 = pageBuffer.toString('base64');
        const result = await callVision(pageBase64, 'image/png', 'OCR_EXTRACTOR');
        const parsed = parseVisionResult(result, false);
        if (parsed.text.trim()) {
          allPageTexts.push(`[Page ${pageIdx + 1}]\n${parsed.text.trim()}`);
          successfulPages++;
        }
        continue;
      }

      // How many tiles, decided rather than assumed (plan R18).
      //
      // This path processes `research_documents` and writes the facts, and it cut every page into a
      // constant 3×3 whether it was an 8.5×11 deed or a 36×48 plat. `assessCapture()` was already
      // computing the grid that WOULD work — on every document — and nothing read it. A page with
      // the resolution to be readable had it thrown away in the API downscale, and the OCR did not
      // fail: it returned a plausible bearing.
      //
      // The physical size here is EXACT, and it is the only path in this file where that is true.
      // sharp renders the PDF's MediaBox at a density we choose, so inches = pixels ÷ that density —
      // no assumption about page size and no reliance on an embedded DPI a scanner may have set
      // wrongly. A 36×48 plat comes out as 36×48 rather than being assumed to be letter, which is
      // the assumption that reports four times the true DPI.
      //
      // (`pdfPageSize` above is the rendered PIXEL size, not the MediaBox in points — it is used for
      // region geometry, not for physical size. Reading it as points would call every letter-size
      // deed a 35-inch sheet.)
      const pdfPhysical = {
        widthIn: imgW / PDF_RENDER_DPI,
        heightIn: imgH / PDF_RENDER_DPI,
        source: 'pdf_mediabox' as const,
      };
      const grid = chooseTiles(imgW, imgH, { rows: PDF_TILE_ROWS, cols: PDF_TILE_COLS }, pdfPhysical);
      if (grid.changed || grid.capped) {
        console.log(`[Document] PDF page ${pageIdx + 1} tiling: ${grid.statement}`);
      }
      const rowsN = grid.tiles.rows;
      const colsN = grid.tiles.cols;
      gridsUsed.add(`${rowsN}x${colsN}`);

      // Split into tiles
      const overlapX = Math.floor(imgW * PDF_TILE_OVERLAP);
      const overlapY = Math.floor(imgH * PDF_TILE_OVERLAP);
      const baseTileW = Math.floor(imgW / colsN);
      const baseTileH = Math.floor(imgH / rowsN);
      const tileTexts: string[] = [];

      for (let row = 0; row < rowsN; row++) {
        for (let col = 0; col < colsN; col++) {
          const left = Math.max(0, col * baseTileW - overlapX);
          const top = Math.max(0, row * baseTileH - overlapY);
          const width = Math.min(baseTileW + 2 * overlapX, imgW - left);
          const height = Math.min(baseTileH + 2 * overlapY, imgH - top);

          if (width <= 0 || height <= 0) continue;

          try {
            const tileBuffer = await sharp(pageBuffer)
              .extract({ left, top, width, height })
              .jpeg({ quality: JPEG_QUALITY })
              .toBuffer();

            const tileBase64 = tileBuffer.toString('base64');
            const tileResult = await callVision(tileBase64, 'image/jpeg', 'OCR_EXTRACTOR');
            const parsed = parseVisionResult(tileResult, false);

            if (parsed.text.trim()) {
              tileTexts.push(`[Page ${pageIdx + 1} Tile ${row + 1}-${col + 1}]\n${parsed.text.trim()}`);
              // Measured tile geometry (plan R17). Only pages rendered at the same size as the first
              // are recorded: one `pageSize` cannot describe two differently-sized pages, and a box
              // divided by the wrong page's dimensions lands confidently in the wrong place. A
              // skipped page simply has no regions, which the locator reports honestly.
              if (!pdfPageSize) pdfPageSize = { width: imgW, height: imgH };
              if (pdfPageSize.width === imgW && pdfPageSize.height === imgH) {
                measuredPdf.push({
                  segmentId: `p${pageIdx + 1}r${row}c${col}`,
                  depth: 0,
                  page: pageIdx + 1,
                  boundingBox: { x: left, y: top, w: width, h: height },
                  text: parsed.text.trim(),
                });
              }
            }
            if (parsed.ocrConfidence != null) allConfidences.push(parsed.ocrConfidence);
            if (parsed.ocrRegions) allRegions.push(...parsed.ocrRegions);
          } catch (tileErr) {
            console.warn(
              `[Document] PDF page ${pageIdx + 1} tile ${row}-${col} OCR failed:`,
              tileErr instanceof Error ? tileErr.message : tileErr,
            );
          }
        }
      }

      if (tileTexts.length > 0) {
        allPageTexts.push(tileTexts.join('\n\n'));
        successfulPages++;
      } else {
        // All tiles failed — try single-image OCR for this page
        const pageBase64 = pageBuffer.toString('base64');
        const result = await callVision(pageBase64, 'image/png', 'OCR_EXTRACTOR');
        const parsed = parseVisionResult(result, false);
        if (parsed.text.trim()) {
          allPageTexts.push(`[Page ${pageIdx + 1}]\n${parsed.text.trim()}`);
          successfulPages++;
        }
      }
    } catch (tilePipeErr) {
      console.warn(
        `[Document] PDF page ${pageIdx + 1} tiling pipeline failed:`,
        tilePipeErr instanceof Error ? tilePipeErr.message : tilePipeErr,
      );
    }
  }

  if (successfulPages === 0) return null;

  const mergedText = allPageTexts.join('\n\n');
  const avgConfidence = allConfidences.length
    ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
    : undefined;

  const processedPageCount = Math.min(pageCount, 20);
  return {
    text: mergedText,
    method: `pdf-page-tiled-${gridsUsed.size ? [...gridsUsed].sort().join('+') : `${PDF_TILE_ROWS}x${PDF_TILE_COLS}`}@${PDF_RENDER_DPI}dpi`,
    pageCount: processedPageCount,
    ocrConfidence: avgConfidence,
    ocrRegions: allRegions.length ? allRegions : undefined,
    ocrSegments: pdfPageSize && measuredPdf.length ? { pageSize: pdfPageSize, regions: measuredPdf } : undefined,
  };
}

/**
 * Render a PDF to per-page screenshots using Playwright and apply 2×2 tiling
 * OCR to each page. This handles large complex plats where a single-pass
 * analysis misses fine details.
 *
 * Returns merged OCR text from all pages and all tiles, or null if Playwright
 * is unavailable or fails.
 */
async function extractFromPdfViaTiling(
  buffer: Buffer,
  pageCount?: number,
): Promise<string | null> {
  let browser: import('playwright').Browser | null = null;
  const allPageTexts: string[] = [];

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1400, height: 1800 },
    });
    const page = await context.newPage();

    // Build a data URL for the PDF so we can open it in the browser
    const pdfBase64 = buffer.toString('base64');
    const dataUrl = `data:application/pdf;base64,${pdfBase64}`;

    // Navigate to the PDF — Chrome's built-in PDF viewer will render it
    try {
      await page.goto(dataUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    } catch {
      await page.goto(dataUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3_000);
    }

    // Determine how many pages to process
    const maxPages = Math.min(pageCount ?? 5, 20);
    console.info(`[Document] Rendering ${maxPages} PDF page(s) via Playwright for tiling`);

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        if (pageNum > 1) {
          // Navigate to the next page in Chrome's PDF viewer
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(1_500);
        }

        // Take a full-page screenshot of the rendered page
        const screenshotBuffer = await page.screenshot({
          fullPage: false,
          type: 'png',
        });

        const pageBase64 = screenshotBuffer.toString('base64');
        console.info(`[Document] Page ${pageNum}: screenshot ${Math.round(screenshotBuffer.length / 1024)}KB`);

        // Apply 2×2 tiling to this page for fine-detail extraction
        const tileResult = await extractFromImageTiled(screenshotBuffer, 'image/png', 'OCR_EXTRACTOR');
        const pageText = tileResult.text.trim();

        if (pageText.length > 20) {
          allPageTexts.push(`[Page ${pageNum}]\n${pageText}`);
          console.info(`[Document] Page ${pageNum}: extracted ${pageText.length} chars via tiling`);
        } else {
          // Tiling didn't help — try single-pass for this page
          const singleResult = await callVision(pageBase64, 'image/png', 'OCR_EXTRACTOR');
          const parsed = parseVisionResult(singleResult, false);
          if (parsed.text.trim().length > 20) {
            allPageTexts.push(`[Page ${pageNum}]\n${parsed.text.trim()}`);
          }
        }
      } catch (pageErr) {
        console.warn(`[Document] Page ${pageNum} rendering failed:`, pageErr instanceof Error ? pageErr.message : String(pageErr));
      }
    }

    await browser.close();
    browser = null;

    const merged = allPageTexts.join('\n\n');
    console.info(`[Document] PDF tiling complete: ${allPageTexts.length} pages, ${merged.length} chars total`);
    return merged || null;

  } catch (err) {
    console.error('[Document] PDF tiling via Playwright failed:', err instanceof Error ? err.message : String(err));
    if (browser) await browser.close().catch(() => {});
    return null;
  }
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

  // The same decision as the PDF path, from the same policy (plan R18) — which is the point: two
  // paths tiled documents and disagreed, and the one that writes the facts used the blinder rule.
  //
  // The physical size is weaker here than on the PDF path: a standalone image carries no MediaBox,
  // so the embedded density is used when the scanner set one, and otherwise the assessment assumes
  // letter and says that it assumed.
  const imagePhysical = meta.density && meta.density > 1
    ? { widthIn: imgW / meta.density, heightIn: imgH / meta.density, source: 'image_density' as const }
    : null;
  const grid = chooseTiles(imgW, imgH, { rows: TILE_ROWS, cols: TILE_COLS }, imagePhysical);
  if (grid.changed || grid.capped) console.log(`[Document] Image tiling: ${grid.statement}`);
  const rowsN = grid.tiles.rows;
  const colsN = grid.tiles.cols;

  const overlapX = Math.floor(imgW * TILE_OVERLAP);
  const overlapY = Math.floor(imgH * TILE_OVERLAP);
  const tileW = Math.floor(imgW / colsN) + overlapX;
  const tileH = Math.floor(imgH / rowsN) + overlapY;

  const tileTexts: string[] = [];
  const tileConfidences: number[] = [];
  const tileRegions: unknown[] = [];
  /** Where each tile actually was. Measured here, not asked of the model (plan R17). */
  const measured: NonNullable<ExtractionResult['ocrSegments']>['regions'] = [];

  for (let row = 0; row < rowsN; row++) {
    for (let col = 0; col < colsN; col++) {
      const left = Math.max(0, Math.floor(col * imgW / colsN) - overlapX);
      const top = Math.max(0, Math.floor(row * imgH / rowsN) - overlapY);
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
          // The tile's real geometry, paired with the text read from it. A fact quoted from this
          // text can now be pointed at this part of the page.
          measured.push({
            segmentId: `r${row}c${col}`,
            depth: 0,
            page: 1,
            boundingBox: { x: left, y: top, w: width, h: height },
            text: parsed.text.trim(),
          });
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

  // Can the model actually read fine survey text off this? Assessed HERE, where the pixel size and
  // the tile grid are both known, rather than being inferred later from a stored image.
  //
  // Assessed against the grid ACTUALLY USED, not against the constant. Reporting the default here
  // while `chooseTiles` had raised it would file a verdict about a capture that never happened —
  // and the stored verdict is what a reviewer later reads to decide whether to trust the numbers.
  const legibility = assessCapture(imgW, imgH, grid.tiles, imagePhysical);
  console.log(`[Document] OCR legibility (${legibility.verdict}): ${legibility.fullStatement}`);

  return {
    text: mergedText,
    // The grid ACTUALLY used. `method` is stored on the row and is how anyone later reconstructs
    // how a document was read; naming the default while a different grid ran makes it a fiction.
    method: `ocr-tiled-${rowsN}x${colsN}`,
    ocrConfidence: avgConfidence,
    ocrRegions: tileRegions.length ? tileRegions : undefined,
    ocrSegments: measured.length
      ? { pageSize: { width: imgW, height: imgH }, regions: measured, legibility }
      : undefined,
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
