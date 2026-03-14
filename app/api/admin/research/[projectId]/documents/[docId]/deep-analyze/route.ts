// app/api/admin/research/[projectId]/documents/[docId]/deep-analyze/route.ts
// Runs a deep AI analysis on a document with comprehensive logging.
//
// ENHANCED PIPELINE (v2):
//   1. For uploaded PDFs/images: renders pages to images, tiles them into a grid,
//      OCRs each tile individually, and merges the results for complete coverage.
//   2. For property_search documents: fetches live data from the source URL or
//      runs the boundary-fetch pipeline.
//   3. After initial analysis, extracts identifiers (plat name, instrument numbers,
//      property IDs) and automatically searches bell.tx.publicsearch.us to retrieve
//      all deed/plat records. Each found document is screenshotted and analyzed.
//   4. Produces both a basic log (key results) and a detailed log (every attempt,
//      success, failure, and reason).
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { deepAnalyzeDocument, fetchSourceContent, buildBoundaryFetchText } from '@/lib/research/document-analysis.service';
import { fetchBoundaryCalls, extractPublicsearchItems } from '@/lib/research/boundary-fetch.service';
import { callVision, callDocumentAI } from '@/lib/research/ai-client';
import type { DocumentType } from '@/types/research';

// Allow up to 5 minutes for deep analysis with tile-based scanning + Bell County lookup
export const maxDuration = 300;

const MIN_PROPERTY_TEXT_LENGTH = 500;

// ── Detailed Logger ──────────────────────────────────────────────────────────

interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error' | 'success';
  phase: string;
  message: string;
  detail?: string;
  durationMs?: number;
}

class DeepAnalysisLogger {
  readonly basicLogs: LogEntry[] = [];
  readonly detailedLogs: LogEntry[] = [];
  private startedAt = Date.now();

  log(level: LogEntry['level'], phase: string, message: string, detail?: string) {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      phase,
      message,
      detail,
      durationMs: Date.now() - this.startedAt,
    };
    this.detailedLogs.push(entry);
    // Only promote success, error, and key info messages to basic logs
    if (level === 'success' || level === 'error' || (level === 'info' && phase !== 'detail')) {
      this.basicLogs.push(entry);
    }
  }

  info(phase: string, message: string, detail?: string) { this.log('info', phase, message, detail); }
  detail(message: string, detail?: string) { this.log('info', 'detail', message, detail); }
  success(phase: string, message: string, detail?: string) { this.log('success', phase, message, detail); }
  warn(phase: string, message: string, detail?: string) { this.log('warn', phase, message, detail); }
  error(phase: string, message: string, detail?: string) { this.log('error', phase, message, detail); }
}

// ── ID Extraction ────────────────────────────────────────────────────────────

function extractIds(req: NextRequest): { projectId: string | null; docId: string | null } {
  const parts = req.nextUrl.pathname.split('/');
  const researchIdx = parts.indexOf('research');
  const documentsIdx = parts.indexOf('documents');
  return {
    projectId: researchIdx >= 0 ? (parts[researchIdx + 1] ?? null) : null,
    docId:     documentsIdx >= 0 ? (parts[documentsIdx + 1] ?? null) : null,
  };
}

// ── Bell County PublicSearch Scraper ──────────────────────────────────────────

interface BellClerkRecord {
  instrumentNumber: string;
  documentType: string;
  recordedDate: string;
  grantor: string;
  grantee: string;
  bookVolumePage: string;
  propertyDescription: string;
  sourceUrl: string;
}

/**
 * Search bell.tx.publicsearch.us via their HTML results page.
 * The site is a React SPA, but the results page URL includes all search params
 * and we can parse the HTML for document references, then fetch document detail
 * pages to get instrument metadata.
 */
async function searchBellPublicSearch(
  searchValue: string,
  logger: DeepAnalysisLogger,
): Promise<BellClerkRecord[]> {
  const records: BellClerkRecord[] = [];
  const origin = 'https://bell.tx.publicsearch.us';

  logger.detail(`Searching bell.tx.publicsearch.us for: "${searchValue}"`);

  // Build the search URL (same format the user provided)
  const searchUrl = `${origin}/results?department=RP&keywordSearch=false` +
    `&recordedDateRange=16000101%2C${new Date().toISOString().slice(0, 10).replace(/-/g, '')}` +
    `&searchOcrText=false&searchType=quickSearch` +
    `&searchValue=${encodeURIComponent(searchValue)}`;

  logger.detail(`Search URL: ${searchUrl}`);

  // Try the JSON API endpoints that the React SPA calls internally
  const apiHeaders = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Referer': origin + '/',
    'Origin': origin,
  };

  const apiEndpoints = [
    `${origin}/api/instruments?searchText=${encodeURIComponent(searchValue)}&pageSize=50`,
    `${origin}/api/v1/instruments?q=${encodeURIComponent(searchValue)}&pageSize=50`,
    `${origin}/api/instruments?q=${encodeURIComponent(searchValue)}&limit=50`,
  ];

  let instruments: Array<Record<string, unknown>> = [];
  let successEndpoint = '';

  for (const ep of apiEndpoints) {
    try {
      logger.detail(`Trying API endpoint: ${ep}`);
      const res = await fetch(ep, {
        signal: AbortSignal.timeout(15_000),
        headers: apiHeaders,
      });
      if (!res.ok) {
        logger.detail(`API returned ${res.status}`, ep);
        continue;
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) {
        logger.detail(`Not JSON response (${ct})`, ep);
        continue;
      }
      const data = await res.json() as Record<string, unknown>;
      const items = extractPublicsearchItems(data);
      if (items.length > 0) {
        instruments = items;
        successEndpoint = ep;
        logger.success('bell-search', `Found ${items.length} instrument(s) via API`, ep);
        break;
      }
    } catch (err) {
      logger.detail(`API endpoint failed: ${err instanceof Error ? err.message : String(err)}`, ep);
    }
  }

  if (instruments.length === 0) {
    logger.warn('bell-search', `No instruments found for "${searchValue}" via any API endpoint`);

    // Fall back to HTML fetch (limited data but better than nothing)
    try {
      const htmlRes = await fetch(searchUrl, {
        signal: AbortSignal.timeout(15_000),
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)',
        },
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        // Extract any instrument numbers from the HTML (even from the SPA shell)
        const instrMatches = html.match(/\d{10,}/g);
        if (instrMatches && instrMatches.length > 0) {
          logger.detail(`Found ${instrMatches.length} potential instrument number(s) in HTML`);
          for (const instrNum of [...new Set(instrMatches)].slice(0, 20)) {
            records.push({
              instrumentNumber: instrNum,
              documentType: 'UNKNOWN',
              recordedDate: '',
              grantor: '',
              grantee: '',
              bookVolumePage: '',
              propertyDescription: '',
              sourceUrl: `${origin}/doc/${instrNum}`,
            });
          }
        }
      }
    } catch (err) {
      logger.detail(`HTML fallback failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return records;
  }

  // Convert API instrument objects to our record format
  for (const inst of instruments.slice(0, 30)) {
    const id = String(inst.id ?? inst.instrumentId ?? inst.InstrumentId ?? '');
    const docType = String(inst.type ?? inst.instrumentType ?? inst.InstrumentType ?? inst.docType ?? 'UNKNOWN');
    const date = String(inst.recordedDate ?? inst.instrumentDate ?? inst.Date ?? '');
    const grantors = String(inst.grantors ?? inst.Grantors ?? inst.grantor ?? '');
    const grantees = String(inst.grantees ?? inst.Grantees ?? inst.grantee ?? '');
    const vol = String(inst.volume ?? inst.Volume ?? inst.bookVolume ?? '');
    const pg = String(inst.page ?? inst.Page ?? '');
    const desc = String(inst.description ?? inst.Description ?? inst.legalDescription ?? '');

    if (!id) continue;

    records.push({
      instrumentNumber: id,
      documentType: docType,
      recordedDate: date,
      grantor: grantors,
      grantee: grantees,
      bookVolumePage: vol && pg ? `${vol}/${pg}` : '',
      propertyDescription: desc,
      sourceUrl: `${origin}/doc/${id}`,
    });
  }

  logger.success('bell-search', `Parsed ${records.length} record(s) from bell.tx.publicsearch.us`, successEndpoint);
  return records;
}

/**
 * Fetch document details from bell.tx.publicsearch.us for a specific instrument.
 * Tries to get the document image URL and summary metadata.
 */
async function fetchBellDocumentDetail(
  instrumentId: string,
  logger: DeepAnalysisLogger,
): Promise<{ metadata: string; imageUrls: string[] } | null> {
  const origin = 'https://bell.tx.publicsearch.us';
  const docUrl = `${origin}/doc/${instrumentId}`;

  logger.detail(`Fetching document detail for instrument ${instrumentId}`, docUrl);

  const apiHeaders = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Referer': origin + '/',
    'Origin': origin,
  };

  // Try known API endpoints for document detail
  const detailEndpoints = [
    `${origin}/api/instruments/${instrumentId}`,
    `${origin}/api/v1/instruments/${instrumentId}`,
  ];

  for (const ep of detailEndpoints) {
    try {
      const res = await fetch(ep, {
        signal: AbortSignal.timeout(12_000),
        headers: apiHeaders,
      });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) continue;
      const detail = await res.json() as Record<string, unknown>;

      // Extract image URLs from the detail response
      const imageUrls: string[] = [];
      const pages = detail.pages ?? detail.images ?? detail.pageImages;
      if (Array.isArray(pages)) {
        for (const page of pages) {
          const url = typeof page === 'string' ? page
            : (page as Record<string, unknown>).url ?? (page as Record<string, unknown>).imageUrl ?? '';
          if (url) imageUrls.push(String(url));
        }
      }

      // Also try to extract image URL pattern from the document viewer
      // Pattern: /files/documents/{instrumentId}/images/{imageId}_{pageNum}.png
      if (imageUrls.length === 0) {
        const numPages = Number(detail.numberOfPages ?? detail.pageCount ?? detail.numPages ?? 1);
        for (let i = 1; i <= Math.min(numPages, 10); i++) {
          // The actual image URL pattern from the HTML the user showed:
          // /files/documents/{instrumentId}/images/{imageId}_{pageNum}.png with signed URL
          // We can't construct signed URLs, but the API detail may contain them
        }
      }

      const metadata = JSON.stringify(detail, null, 2).substring(0, 10000);
      logger.success('bell-detail', `Got detail for instrument ${instrumentId}: ${Object.keys(detail).length} fields`, ep);
      return { metadata, imageUrls };
    } catch (err) {
      logger.detail(`Detail endpoint failed: ${err instanceof Error ? err.message : String(err)}`, ep);
    }
  }

  // Fall back to fetching HTML page for metadata extraction
  try {
    const htmlRes = await fetch(docUrl, {
      signal: AbortSignal.timeout(12_000),
      headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
    });
    if (htmlRes.ok) {
      const html = await htmlRes.text();
      // Extract image URLs from HTML (the user's HTML shows image xlink:href)
      const imageUrls: string[] = [];
      const imgMatches = html.matchAll(/xlink:href="([^"]+)"|src="(https:\/\/bell\.tx\.publicsearch\.us\/files\/[^"]+)"/g);
      for (const m of imgMatches) {
        const url = m[1] || m[2];
        if (url && url.includes('/files/documents/')) {
          imageUrls.push(url);
        }
      }

      // Strip HTML for metadata
      const text = html
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length > 50 || imageUrls.length > 0) {
        logger.detail(`Got HTML metadata (${text.length} chars) + ${imageUrls.length} image URL(s)`);
        return { metadata: text.substring(0, 10000), imageUrls };
      }
    }
  } catch (err) {
    logger.detail(`HTML fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  logger.warn('bell-detail', `Could not fetch detail for instrument ${instrumentId}`);
  return null;
}

/**
 * Extract identifiers from analysis results for auto-search.
 * Looks for plat names, instrument numbers, property IDs, subdivision names.
 */
function extractSearchableIdentifiers(
  analysisResult: unknown,
  extractedText: string,
): { platNames: string[]; instrumentNumbers: string[]; subdivisionNames: string[]; ownerNames: string[] } {
  const platNames: string[] = [];
  const instrumentNumbers: string[] = [];
  const subdivisionNames: string[] = [];
  const ownerNames: string[] = [];

  // Extract from AI analysis result
  if (analysisResult && typeof analysisResult === 'object') {
    const result = analysisResult as Record<string, unknown>;

    // Plat analysis
    const plat = result.plat as Record<string, unknown> | undefined;
    if (plat) {
      if (plat.subdivision_name) subdivisionNames.push(String(plat.subdivision_name));
      if (plat.plat_name) platNames.push(String(plat.plat_name));
      if (plat.platName) platNames.push(String(plat.platName));
    }

    // Legal description analysis
    const legal = result.legal_description as Record<string, unknown> | undefined;
    if (legal) {
      if (legal.subdivision) subdivisionNames.push(String(legal.subdivision));
      if (legal.abstract_name) platNames.push(String(legal.abstract_name));
    }

    // Recording references
    const refs = result.recording_references ?? result.recordingReferences;
    if (Array.isArray(refs)) {
      for (const ref of refs) {
        const r = ref as Record<string, unknown>;
        if (r.instrument_number || r.instrumentNumber) {
          instrumentNumbers.push(String(r.instrument_number ?? r.instrumentNumber));
        }
      }
    }
  }

  // Extract from raw text using regex patterns
  // Instrument numbers (10-digit numbers common in Bell County)
  const instrMatches = extractedText.match(/(?:instrument\s*(?:no|number|#)?\.?\s*:?\s*)(\d{10})/gi);
  if (instrMatches) {
    for (const m of instrMatches) {
      const num = m.match(/(\d{10})/)?.[1];
      if (num) instrumentNumbers.push(num);
    }
  }

  // Plat/subdivision names
  const platMatch = extractedText.match(/(?:plat\s+of|subdivision[:\s]+|addition[:\s]+)([A-Z][A-Z\s]+(?:ADDITION|SUBDIVISION|ESTATES?|ACRES?|RANCH|HEIGHTS))/gi);
  if (platMatch) {
    for (const m of platMatch) {
      const name = m.replace(/^(?:plat\s+of|subdivision[:\s]+|addition[:\s]+)/i, '').trim();
      if (name.length > 3) platNames.push(name);
    }
  }

  // Owner/trust names (look for TRUST, LLC, etc.)
  const ownerMatch = extractedText.match(/([A-Z][A-Z\s]+(?:TRUST|LLC|INC|ESTATE|FAMILY\s+TRUST))/g);
  if (ownerMatch) {
    for (const m of ownerMatch) {
      const name = m.trim();
      if (name.length > 5 && name.split(/\s+/).length <= 6) ownerNames.push(name);
    }
  }

  return {
    platNames: [...new Set(platNames)],
    instrumentNumbers: [...new Set(instrumentNumbers)],
    subdivisionNames: [...new Set(subdivisionNames)],
    ownerNames: [...new Set(ownerNames)],
  };
}

// ── Main Handler ─────────────────────────────────────────────────────────────

/**
 * POST — Run deep AI analysis on a specific document.
 *
 * Enhanced v2 pipeline:
 *  1. For uploaded documents: re-processes with enhanced tile-based scanning
 *  2. For property_search documents: fetches live data from source URLs
 *  3. Runs deep AI analysis on the content
 *  4. Extracts identifiers and auto-searches bell.tx.publicsearch.us
 *  5. Returns comprehensive results with basic + detailed logs
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) {
    return NextResponse.json({ error: 'Project ID and Document ID are required' }, { status: 400 });
  }

  const logger = new DeepAnalysisLogger();
  logger.info('init', 'Starting deep analysis pipeline v2');

  // Load project + document in parallel
  const [projectRes, docRes] = await Promise.all([
    supabaseAdmin
      .from('research_projects')
      .select('id, property_address, county, parcel_id')
      .eq('id', projectId)
      .single(),
    supabaseAdmin
      .from('research_documents')
      .select('id, document_type, document_label, extracted_text, processing_status, source_type, source_url, extracted_text_method, file_type, storage_path, storage_url, original_filename')
      .eq('id', docId)
      .eq('research_project_id', projectId)
      .single(),
  ]);

  if (projectRes.error || !projectRes.data) {
    logger.error('init', 'Project not found');
    return NextResponse.json({ error: 'Project not found', logs: logger.basicLogs, detailedLogs: logger.detailedLogs }, { status: 404 });
  }
  if (docRes.error || !docRes.data) {
    logger.error('init', 'Document not found');
    return NextResponse.json({ error: 'Document not found', logs: logger.basicLogs, detailedLogs: logger.detailedLogs }, { status: 404 });
  }

  const project = projectRes.data;
  const doc = docRes.data;
  const countyKey = (project.county ?? '').toLowerCase().replace(/\s+county$/i, '').trim();

  logger.info('init', `Document: "${doc.document_label || doc.original_filename || 'Untitled'}"`, `Type: ${doc.document_type || 'unknown'}, File: ${doc.file_type || 'unknown'}, Size: ${doc.extracted_text?.length ?? 0} chars`);

  let textToAnalyze = doc.extracted_text ?? '';
  let fetchMethod = doc.extracted_text_method ?? 'stored';

  // ── PHASE 1: Content acquisition ───────────────────────────────────────────
  logger.info('phase1', 'Phase 1: Content acquisition');

  // For uploaded PDFs/images that may need re-scanning with enhanced tiling
  const isUploadedDocument = doc.source_type === 'user_upload';
  const isImageOrPdf = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'tiff', 'tif'].includes((doc.file_type ?? '').toLowerCase());
  const hasWeakExtraction = !textToAnalyze || textToAnalyze.trim().length < MIN_PROPERTY_TEXT_LENGTH;

  if (isUploadedDocument && isImageOrPdf && hasWeakExtraction && (doc.storage_path || doc.storage_url)) {
    logger.info('phase1', 'Uploaded document has weak text extraction — attempting enhanced tile-based re-scan');
    logger.detail(`Current text length: ${textToAnalyze.trim().length} chars, threshold: ${MIN_PROPERTY_TEXT_LENGTH}`);

    // Fetch the file from storage
    let fileBuffer: Buffer | null = null;
    if (doc.storage_path) {
      try {
        const { data, error } = await supabaseAdmin.storage
          .from(RESEARCH_DOCUMENTS_BUCKET)
          .download(doc.storage_path);
        if (!error && data) {
          fileBuffer = Buffer.from(await data.arrayBuffer());
          logger.detail(`Downloaded file from storage: ${fileBuffer.length} bytes`);
        } else {
          logger.warn('phase1', `Storage download failed: ${error?.message ?? 'no data'}`);
        }
      } catch (err) {
        logger.warn('phase1', `Storage download error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!fileBuffer && doc.storage_url) {
      try {
        const resp = await fetch(doc.storage_url, { signal: AbortSignal.timeout(30_000) });
        if (resp.ok) {
          fileBuffer = Buffer.from(await resp.arrayBuffer());
          logger.detail(`Downloaded file from URL: ${fileBuffer.length} bytes`);
        }
      } catch (err) {
        logger.warn('phase1', `URL download error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (fileBuffer) {
      const fileType = (doc.file_type ?? '').toLowerCase();

      if (fileType === 'pdf') {
        // Enhanced PDF tiling: render each page to a high-res image, tile it, OCR each tile
        logger.info('phase1', 'Starting enhanced PDF tile-based scanning');

        try {
          let sharp: typeof import('sharp');
          try {
            sharp = (await import('sharp')).default;
          } catch {
            logger.warn('phase1', 'sharp not available — falling back to Claude document OCR');
            sharp = null as unknown as typeof import('sharp');
          }

          if (sharp) {
            // Get page count via pdf-parse
            let pageCount = 1;
            try {
              const pdfParse = (await import('pdf-parse')).default as unknown as (buf: Buffer) => Promise<{ numpages: number }>;
              const pdfInfo = await pdfParse(fileBuffer);
              pageCount = pdfInfo.numpages || 1;
              logger.detail(`PDF has ${pageCount} page(s)`);
            } catch {
              logger.detail('Could not determine page count; defaulting to 1');
            }

            const allPageTexts: string[] = [];
            for (let pageIdx = 0; pageIdx < Math.min(pageCount, 20); pageIdx++) {
              logger.detail(`Processing page ${pageIdx + 1}/${pageCount}`);

              try {
                // Render page to PNG at 2x density (150 DPI base → 300 DPI)
                const pageBuffer = await sharp(fileBuffer, {
                  page: pageIdx,
                  density: 150,
                }).png().toBuffer();

                const meta = await sharp(pageBuffer).metadata();
                const imgW = meta.width ?? 0;
                const imgH = meta.height ?? 0;
                logger.detail(`Page ${pageIdx + 1} rendered: ${imgW}x${imgH}px`);

                if (!imgW || !imgH) {
                  // Single-image fallback
                  const b64 = pageBuffer.toString('base64');
                  const result = await callVision(b64, 'image/png', 'OCR_EXTRACTOR');
                  const raw = result.raw || '';
                  if (raw.trim()) allPageTexts.push(`[Page ${pageIdx + 1}]\n${raw.trim()}`);
                  continue;
                }

                // Tile the page: 3x3 grid with 8% overlap
                const tileRows = 3, tileCols = 3, overlap = 0.08;
                const baseTileW = Math.floor(imgW / tileCols);
                const baseTileH = Math.floor(imgH / tileRows);
                const overlapX = Math.floor(imgW * overlap);
                const overlapY = Math.floor(imgH * overlap);
                const tileTexts: string[] = [];
                let successTiles = 0;

                for (let row = 0; row < tileRows; row++) {
                  for (let col = 0; col < tileCols; col++) {
                    const left = Math.max(0, col * baseTileW - overlapX);
                    const top = Math.max(0, row * baseTileH - overlapY);
                    const width = Math.min(baseTileW + 2 * overlapX, imgW - left);
                    const height = Math.min(baseTileH + 2 * overlapY, imgH - top);

                    if (width <= 0 || height <= 0) continue;

                    try {
                      const tileBuffer = await sharp(pageBuffer)
                        .extract({ left, top, width, height })
                        .jpeg({ quality: 92 })
                        .toBuffer();

                      const tileB64 = tileBuffer.toString('base64');
                      logger.detail(`Tile ${row+1}-${col+1}: ${width}x${height}px, ${tileBuffer.length} bytes`);

                      const tileResult = await callVision(tileB64, 'image/jpeg', 'OCR_EXTRACTOR');
                      const tileRaw = tileResult.raw || '';
                      if (tileRaw.trim()) {
                        tileTexts.push(`[Page ${pageIdx+1} Tile ${row+1}-${col+1}]\n${tileRaw.trim()}`);
                        successTiles++;
                      } else {
                        logger.detail(`Tile ${row+1}-${col+1}: no text extracted`);
                      }
                    } catch (tileErr) {
                      logger.warn('phase1', `Tile ${row+1}-${col+1} failed: ${tileErr instanceof Error ? tileErr.message : String(tileErr)}`);
                    }
                  }
                }

                logger.detail(`Page ${pageIdx+1}: ${successTiles}/${tileRows*tileCols} tiles produced text`);
                if (tileTexts.length > 0) {
                  allPageTexts.push(tileTexts.join('\n\n'));
                }
              } catch (pageErr) {
                logger.warn('phase1', `Page ${pageIdx+1} rendering failed: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`);

                // Fallback: send the whole PDF to Claude document API
                if (pageIdx === 0) {
                  logger.detail('Falling back to Claude PDF document OCR for page 1');
                  try {
                    const b64 = fileBuffer.toString('base64');
                    const result = await callDocumentAI(b64, 'OCR_EXTRACTOR',
                      'Extract ALL text from this PDF document. This is a survey plat or deed document. ' +
                      'Preserve all measurements, bearings, legal descriptions, lot numbers, subdivision names, ' +
                      'instrument numbers, and notation exactly as written. Be extremely thorough.');
                    const raw = result.raw || '';
                    if (raw.trim()) {
                      allPageTexts.push(raw.trim());
                      logger.success('phase1', 'Claude PDF OCR extracted text', `${raw.length} chars`);
                    }
                  } catch (aiErr) {
                    logger.error('phase1', `Claude PDF OCR failed: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}`);
                  }
                }
              }
            }

            if (allPageTexts.length > 0) {
              const mergedText = allPageTexts.join('\n\n');
              logger.success('phase1', `Enhanced PDF scanning complete: ${mergedText.length} chars extracted across ${allPageTexts.length} section(s)`);

              // Only use the new text if it's better than what we had
              if (mergedText.length > textToAnalyze.length) {
                textToAnalyze = mergedText;
                fetchMethod = 'deep-analyze-pdf-tiled-3x3';
              }
            }
          } else {
            // sharp not available — use Claude document OCR
            const b64 = fileBuffer.toString('base64');
            const result = await callDocumentAI(b64, 'OCR_EXTRACTOR',
              'Extract ALL text from this PDF document. This is a survey plat or deed document. ' +
              'Preserve all measurements, bearings, legal descriptions, lot numbers, subdivision names, ' +
              'instrument numbers, and notation exactly as written. Be extremely thorough.');
            const raw = result.raw || '';
            if (raw.trim() && raw.length > textToAnalyze.length) {
              textToAnalyze = raw;
              fetchMethod = 'deep-analyze-pdf-document-ocr';
              logger.success('phase1', `Claude PDF OCR: ${raw.length} chars`);
            }
          }
        } catch (err) {
          logger.error('phase1', `Enhanced PDF scanning failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        // Image file — tile it for detailed OCR
        logger.info('phase1', 'Starting enhanced image tile-based scanning');
        try {
          const sharp = (await import('sharp')).default;
          const meta = await sharp(fileBuffer).metadata();
          const imgW = meta.width ?? 0;
          const imgH = meta.height ?? 0;

          if (imgW && imgH) {
            const tileRows = 3, tileCols = 3, overlap = 0.08;
            const baseTileW = Math.floor(imgW / tileCols);
            const baseTileH = Math.floor(imgH / tileRows);
            const overlapX = Math.floor(imgW * overlap);
            const overlapY = Math.floor(imgH * overlap);
            const tileTexts: string[] = [];

            for (let row = 0; row < tileRows; row++) {
              for (let col = 0; col < tileCols; col++) {
                const left = Math.max(0, col * baseTileW - overlapX);
                const top = Math.max(0, row * baseTileH - overlapY);
                const width = Math.min(baseTileW + 2 * overlapX, imgW - left);
                const height = Math.min(baseTileH + 2 * overlapY, imgH - top);
                if (width <= 0 || height <= 0) continue;

                try {
                  const tileBuffer = await sharp(fileBuffer)
                    .extract({ left, top, width, height })
                    .jpeg({ quality: 92 })
                    .toBuffer();
                  const tileB64 = tileBuffer.toString('base64');
                  const tileResult = await callVision(tileB64, 'image/jpeg', 'OCR_EXTRACTOR');
                  const raw = tileResult.raw || '';
                  if (raw.trim()) tileTexts.push(`[Tile ${row+1}-${col+1}]\n${raw.trim()}`);
                } catch (tileErr) {
                  logger.warn('phase1', `Image tile ${row+1}-${col+1} failed: ${tileErr instanceof Error ? tileErr.message : String(tileErr)}`);
                }
              }
            }

            if (tileTexts.length > 0) {
              const mergedText = tileTexts.join('\n\n');
              if (mergedText.length > textToAnalyze.length) {
                textToAnalyze = mergedText;
                fetchMethod = 'deep-analyze-image-tiled-3x3';
                logger.success('phase1', `Image tiling complete: ${mergedText.length} chars from ${tileTexts.length} tiles`);
              }
            }
          }
        } catch (err) {
          logger.error('phase1', `Image tiling failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else {
      logger.warn('phase1', 'Could not retrieve file buffer for enhanced scanning');
    }
  }

  // ── Live fetch for property_search documents ─────────────────────────────
  const isSearchRef = doc.source_type === 'property_search' ||
    doc.extracted_text_method === 'property_search' ||
    textToAnalyze.trim().length < MIN_PROPERTY_TEXT_LENGTH;

  if (isSearchRef) {
    logger.info('phase1', 'Document has weak/search text — attempting live fetch');

    // Strategy A: Fetch the actual source URL
    if (doc.source_url) {
      logger.detail(`Trying source URL: ${doc.source_url}`);
      const fetched = await fetchSourceContent(doc.source_url, {
        propertyId: project.parcel_id ?? undefined,
        address: project.property_address ?? undefined,
      });
      if (fetched && fetched.text.length > 150) {
        textToAnalyze = fetched.text;
        fetchMethod = fetched.method;
        logger.success('phase1', `Source URL fetch: ${fetched.text.length} chars via ${fetched.method}`);
      } else {
        logger.detail(`Source URL fetch returned ${fetched?.text.length ?? 0} chars — insufficient`);
      }
    }

    // Strategy B: Boundary-fetch pipeline
    if (
      textToAnalyze.trim().length < MIN_PROPERTY_TEXT_LENGTH &&
      (project.property_address || project.parcel_id)
    ) {
      logger.detail('Trying boundary-fetch pipeline');
      const fetchResult = await fetchBoundaryCalls({
        address: project.property_address ?? undefined,
        county:  project.county          ?? undefined,
        parcel_id: project.parcel_id     ?? undefined,
      });

      if (fetchResult.legal_description) {
        textToAnalyze = buildBoundaryFetchText(fetchResult);
        fetchMethod = 'boundary-fetch-pipeline';
        logger.success('phase1', 'Boundary-fetch pipeline returned legal description');

        if (fetchResult.property_id && !project.parcel_id) {
          await supabaseAdmin
            .from('research_projects')
            .update({ parcel_id: fetchResult.property_id, updated_at: new Date().toISOString() })
            .eq('id', projectId);
          logger.detail(`Saved parcel ID: ${fetchResult.property_id}`);
        }
      } else if (fetchResult.property) {
        textToAnalyze = buildBoundaryFetchText(fetchResult);
        fetchMethod = 'boundary-fetch-partial';
        logger.warn('phase1', 'Boundary-fetch returned partial data (no legal description)');
      }
    }

    // Persist freshly fetched content
    if (fetchMethod !== (doc.extracted_text_method ?? 'stored') && textToAnalyze.length > 150) {
      await supabaseAdmin.from('research_documents').update({
        extracted_text: textToAnalyze,
        extracted_text_method: fetchMethod,
        processing_status: 'extracted',
        updated_at: new Date().toISOString(),
      }).eq('id', docId);
      logger.detail('Saved refreshed text to database');
    }
  }

  // ── Guard: must have something to analyze ────────────────────────────────
  if (!textToAnalyze || textToAnalyze.trim().length < 20) {
    logger.error('phase1', 'No analyzable content found after all acquisition strategies');
    return NextResponse.json(
      {
        error: [
          'Could not retrieve property data for analysis.',
          project.property_address
            ? `Address used: "${project.property_address}"`
            : 'No property address on this project.',
          'Try setting the property address on the project and running Fetch Boundary Calls first.',
        ].join(' '),
        logs: logger.basicLogs,
        detailedLogs: logger.detailedLogs,
      },
      { status: 422 },
    );
  }

  logger.success('phase1', `Content acquired: ${textToAnalyze.length} chars via ${fetchMethod}`);

  // ── PHASE 2: Deep AI analysis ──────────────────────────────────────────────
  logger.info('phase2', 'Phase 2: Running deep AI analysis');

  const result = await deepAnalyzeDocument(
    docId,
    textToAnalyze,
    doc.document_type as DocumentType | null,
    doc.document_label,
  );

  if (result.error) {
    logger.error('phase2', `Analysis error: ${result.error}`);
  } else {
    logger.success('phase2', `Analysis complete: type=${result.analysis_type}`);
  }

  // ── PHASE 3: Auto-search Bell County publicsearch.us ──────────────────────
  logger.info('phase3', 'Phase 3: Extracting identifiers for auto-search');

  const identifiers = extractSearchableIdentifiers(result, textToAnalyze);
  logger.info('phase3', 'Extracted identifiers', JSON.stringify({
    platNames: identifiers.platNames,
    instrumentNumbers: identifiers.instrumentNumbers,
    subdivisionNames: identifiers.subdivisionNames,
    ownerNames: identifiers.ownerNames,
  }));

  const bellCountyResults: {
    records: BellClerkRecord[];
    documentDetails: Array<{ instrumentNumber: string; metadata: string; imageAnalysis?: string }>;
  } = { records: [], documentDetails: [] };

  // Only run Bell County search if this is a Bell County project
  const isBellCounty = countyKey === 'bell' || !countyKey;

  if (isBellCounty) {
    // Collect all search terms
    const searchTerms = new Set<string>();
    for (const name of identifiers.platNames) searchTerms.add(name);
    for (const name of identifiers.subdivisionNames) searchTerms.add(name);
    for (const name of identifiers.ownerNames) searchTerms.add(name);

    if (searchTerms.size > 0) {
      logger.info('phase3', `Searching bell.tx.publicsearch.us with ${searchTerms.size} search term(s)`);

      for (const term of searchTerms) {
        try {
          const records = await searchBellPublicSearch(term, logger);
          for (const rec of records) {
            if (!bellCountyResults.records.find(r => r.instrumentNumber === rec.instrumentNumber)) {
              bellCountyResults.records.push(rec);
            }
          }
        } catch (err) {
          logger.error('phase3', `Bell search failed for "${term}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Also search by instrument numbers found in the document
      for (const instrNum of identifiers.instrumentNumbers) {
        if (!bellCountyResults.records.find(r => r.instrumentNumber === instrNum)) {
          try {
            const records = await searchBellPublicSearch(instrNum, logger);
            for (const rec of records) {
              if (!bellCountyResults.records.find(r => r.instrumentNumber === rec.instrumentNumber)) {
                bellCountyResults.records.push(rec);
              }
            }
          } catch (err) {
            logger.error('phase3', `Bell instrument search failed for ${instrNum}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      logger.success('phase3', `Bell County search: ${bellCountyResults.records.length} total record(s) found`);

      // Fetch details for the most relevant records (plats and deeds first)
      const prioritizedRecords = bellCountyResults.records
        .sort((a, b) => {
          const typeOrder: Record<string, number> = { PLAT: 0, DEED: 1, 'WARRANTY DEED': 1, DEDICATION: 2 };
          return (typeOrder[a.documentType] ?? 5) - (typeOrder[b.documentType] ?? 5);
        })
        .slice(0, 10);

      logger.info('phase3', `Fetching details for ${prioritizedRecords.length} prioritized record(s)`);

      for (const rec of prioritizedRecords) {
        try {
          const detail = await fetchBellDocumentDetail(rec.instrumentNumber, logger);
          if (detail) {
            const docDetail: { instrumentNumber: string; metadata: string; imageAnalysis?: string } = {
              instrumentNumber: rec.instrumentNumber,
              metadata: detail.metadata,
            };

            // If we got image URLs, try to analyze them
            if (detail.imageUrls.length > 0) {
              logger.detail(`Analyzing ${detail.imageUrls.length} image(s) for instrument ${rec.instrumentNumber}`);
              const imageTexts: string[] = [];
              for (const imgUrl of detail.imageUrls.slice(0, 5)) {
                try {
                  const imgResp = await fetch(imgUrl, { signal: AbortSignal.timeout(15_000) });
                  if (imgResp.ok) {
                    const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
                    const imgB64 = imgBuffer.toString('base64');
                    const ct = imgResp.headers.get('content-type') ?? 'image/png';
                    const mediaType = ct.includes('jpeg') ? 'image/jpeg' as const : 'image/png' as const;
                    const imgResult = await callVision(imgB64, mediaType, 'OCR_EXTRACTOR');
                    if (imgResult.raw?.trim()) {
                      imageTexts.push(imgResult.raw.trim());
                      logger.success('phase3', `Image OCR for ${rec.instrumentNumber}: ${imgResult.raw.length} chars`);
                    }
                  }
                } catch (imgErr) {
                  logger.detail(`Image fetch/OCR failed: ${imgErr instanceof Error ? imgErr.message : String(imgErr)}`);
                }
              }
              if (imageTexts.length > 0) {
                docDetail.imageAnalysis = imageTexts.join('\n\n');
              }
            }

            bellCountyResults.documentDetails.push(docDetail);
          }
        } catch (err) {
          logger.warn('phase3', `Detail fetch failed for ${rec.instrumentNumber}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else {
      logger.info('phase3', 'No searchable identifiers extracted — skipping Bell County auto-search');
    }
  } else {
    logger.info('phase3', `County is "${countyKey}" — Bell County auto-search not applicable`);
  }

  // ── Persist updated text if we found more content ─────────────────────────
  if (fetchMethod !== (doc.extracted_text_method ?? 'stored') && textToAnalyze.length > (doc.extracted_text?.length ?? 0)) {
    await supabaseAdmin.from('research_documents').update({
      extracted_text: textToAnalyze,
      extracted_text_method: fetchMethod,
      processing_status: 'extracted',
      updated_at: new Date().toISOString(),
    }).eq('id', docId);
  }

  logger.success('complete', 'Deep analysis pipeline v2 complete', JSON.stringify({
    textLength: textToAnalyze.length,
    fetchMethod,
    analysisType: result.analysis_type,
    bellRecordsFound: bellCountyResults.records.length,
    bellDetailsRetrieved: bellCountyResults.documentDetails.length,
  }));

  return NextResponse.json({
    ...result,
    bellCountyResults: bellCountyResults.records.length > 0 ? bellCountyResults : undefined,
    extractedIdentifiers: identifiers,
    logs: logger.basicLogs,
    detailedLogs: logger.detailedLogs,
  });
}, { routeName: 'research/documents/deep-analyze' });
