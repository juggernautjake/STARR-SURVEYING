// worker/src/services/ai-extraction.ts — Stage 3: AI Extraction
// Multi-pass Claude text extraction and Vision OCR with confidence verification.
// Documents are screened, analyzed, verified, and scored.
// Supports user-uploaded files alongside online-retrieved documents.

import type { DocumentResult, ExtractedBoundaryData, BoundaryCall, DocumentReference, PageScreenshot, DocumentPage } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';
import { adaptiveVisionOcr } from './adaptive-vision.js';

// ── Constants ──────────────────────────────────────────────────────────────

const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929';
const MAX_RETRIES = 4;
const BASE_RETRY_DELAY_MS = 2_000;
const CONFIDENCE_THRESHOLD_RERUN = 0.80;
const MAX_VERIFICATION_PASSES = 3;

// ── Document Screening Keywords ────────────────────────────────────────────

const PRIMARY_KEYWORDS = [
  'metes', 'bounds', 'thence', 'bearing', 'degrees', 'iron rod', 'iron pin',
  'feet', 'varas', 'curve', 'radius', 'point of beginning', 'pob',
  'minutes', 'seconds', 'north', 'south', 'east', 'west',
  'monument', 'stake', 'concrete', 'cap', 'set', 'found',
  'beginning', 'commence', 'thence', 'along',
];

const SECONDARY_KEYWORDS = [
  'easement', 'deed', 'plat', 'subdivision', 'volume', 'page', 'instrument',
  'grantor', 'grantee', 'tract', 'parcel', 'lot', 'block', 'abstract',
  'survey', 'county', 'conveyed', 'described', 'recorded', 'filed',
  'warranty', 'being', 'situated', 'lying', 'containing', 'more or less',
  'acres', 'square feet', 'hectares',
];

const SKIP_PATTERNS = [
  /search\s*results/i,
  /404\s*not\s*found/i,
  /page\s*not\s*found/i,
  /login\s*required/i,
  /captcha/i,
  /access\s*denied/i,
  /no\s*records?\s*found/i,
  /session\s*expired/i,
  /please\s*sign\s*in/i,
  /forgot\s*password/i,
  /create\s*account/i,
];

// ── Texas Surveying System Prompt ──────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are an expert Texas Registered Professional Land Surveyor (RPLS) and title examiner with 30+ years of experience analyzing Texas property records. You have deep expertise in:

- Texas metes and bounds legal descriptions (modern and historical)
- Spanish land grants, Republic of Texas patents, Mexican-era surveys
- Texas vara measurements (1 vara = 33⅓ inches = 2.7778 feet)
- Chain measurements (1 chain = 66 feet, 1 rod = 16.5 feet)
- Bearing notation: N 45°30'15" E, N45-30-15E, N45°30'E, S89°59'30"W
- Curve data: radius, arc length, chord bearing, chord distance, delta angle
- Monument descriptions: iron rods, iron pins, concrete monuments, PK nails, railroad spikes
- Texas county recording systems: volumes, pages, instrument numbers, cabinet/slide plat references
- Lot and block descriptions referencing subdivisions, phases, plats
- Easement and right-of-way descriptions
- Chain of title analysis and deed reference following

CRITICAL RULES:
1. Extract ALL data — never skip or abbreviate. Every bearing, distance, monument, and reference matters.
2. Preserve EXACT notation from the document. Do not normalize or round values.
3. For bearings, ALWAYS provide both the raw text AND computed decimal degrees.
4. Decimal degrees for quadrant bearings: the angle within that quadrant (always 0-90°). The quadrant (NE/NW/SE/SW) tells direction.
5. For distances, identify the unit. Modern Texas deeds use feet. Historical deeds may use varas, chains, or rods.
6. For curves, extract ALL available data: radius, arc length, chord bearing, chord distance, delta angle, direction (left/right).
7. Flag unclear, illegible, or ambiguous text with a warning.
8. Note ALL document references (volume/page, instrument number, plat cabinet/slide, abstract/survey).
9. Set confidence per-call (0.0-1.0). Anything unclear gets < 0.85.
10. Read the entire document before extracting. Identify the description type first, then extract systematically.

RESPONSE FORMAT — Return ONLY valid JSON (no markdown fences):
{
  "type": "metes_and_bounds" | "lot_and_block" | "hybrid" | "reference_only",
  "datum": "NAD83" | "NAD27" | "unknown",
  "pointOfBeginning": {
    "description": "full POB text",
    "referenceMonument": "monument description or null"
  },
  "calls": [
    {
      "sequence": 1,
      "bearing": { "raw": "N 45°30'15\\" E", "decimalDegrees": 45.504167, "quadrant": "NE" },
      "distance": { "raw": "150.00 feet", "value": 150.00, "unit": "feet" },
      "curve": null,
      "toPoint": "an iron rod found",
      "along": "the south line of Lot 12",
      "confidence": 0.95
    }
  ],
  "references": [
    { "type": "deed", "volume": "1234", "page": "567", "instrumentNumber": null, "cabinetSlide": null, "county": "Bell", "description": "source deed" }
  ],
  "area": { "raw": "1.234 acres", "value": 1.234, "unit": "acres" },
  "lotBlock": { "lot": "21", "block": "8", "subdivision": "Dawson Ridge", "phase": "1", "cabinet": "A", "slide": "123" },
  "confidence": 0.90,
  "warnings": []
}`;

const OCR_SYSTEM_PROMPT = `You are an expert document OCR specialist for Texas land surveying records.

Extract ALL text visible in this document with maximum accuracy.

CRITICAL RULES:
1. Preserve ALL symbols exactly: ° (degrees), ' (minutes), " (seconds), ½, ¼, ⅓
2. Preserve ALL abbreviations: N, S, E, W, ft, Blk, Lt, Vol, Pg, Inst, Abs
3. For bearing notation, get degree/minute/second symbols exactly right
4. For distances, preserve decimal precision exactly as shown
5. Read handwritten text carefully — old Texas deeds may be handwritten
6. If a character is unclear, use your best reading but mark with [?]
7. Read in natural document order: top to bottom, left to right
8. Capture EVERY piece of text, including headers, footers, stamps, marginalia

Return ONLY valid JSON:
{
  "full_text": "complete extracted text in reading order",
  "regions": [{ "text": "region text", "location": "description", "confidence": 95 }],
  "overall_confidence": 90,
  "document_type_guess": "warranty deed | plat | survey | field notes | other",
  "notes": "any issues or observations"
}`;

// ── Retry Helper ───────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Thrown when the Anthropic API key has insufficient credits. Signals callers to abort all further AI calls. */
export class AnthropicCreditDepletedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnthropicCreditDepletedError';
  }
}

async function callClaudeWithRetry(
  anthropicApiKey: string,
  messages: Array<{ role: string; content: unknown }>,
  systemPrompt: string,
  logger: PipelineLogger,
  label: string,
  maxTokens: number = 16384,
): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      logger.info('Stage3', `Retry ${attempt}/${MAX_RETRIES} for ${label} after ${delayMs}ms`);
      await sleep(delayMs);
    }

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: anthropicApiKey });

      const response = await client.messages.create({
        model: AI_MODEL,
        max_tokens: maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages: messages as Parameters<typeof client.messages.create>[0]['messages'],
      });

      const textBlock = response.content.find((c) => c.type === 'text');
      if (!textBlock || textBlock.type !== 'text' || !textBlock.text.trim()) {
        logger.warn('Stage3', `${label}: Empty response from Claude (attempt ${attempt + 1})`);
        continue;
      }

      return textBlock.text;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Don't retry on auth/permission errors
      if (err && typeof err === 'object' && 'status' in err) {
        const status = (err as { status: number }).status;
        if (status === 400 || status === 401 || status === 403) {
          // Detect depleted credit balance specifically so the caller can fail fast
          if (/credit balance is too low/i.test(errMsg)) {
            throw new AnthropicCreditDepletedError(
              'Anthropic API credit balance is too low. Please go to Plans & Billing to add credits, then re-run research.',
            );
          }
          logger.error('Stage3', `${label}: Non-retryable error (HTTP ${status})`, err);
          return null;
        }
      }

      logger.warn('Stage3', `${label}: Attempt ${attempt + 1} failed: ${errMsg}`);
    }
  }

  logger.error('Stage3', `${label}: All ${MAX_RETRIES + 1} attempts exhausted`);
  return null;
}

// ── Document Screening ─────────────────────────────────────────────────────

type ScreeningResult = 'analyze' | 'enrich' | 'skip';

export function screenDocument(text: string): ScreeningResult {
  if (!text || text.length < 50) return 'skip';

  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(text)) return 'skip';
  }

  const lowerText = text.toLowerCase();

  let primaryCount = 0;
  for (const kw of PRIMARY_KEYWORDS) {
    if (lowerText.includes(kw)) primaryCount++;
  }

  let secondaryCount = 0;
  for (const kw of SECONDARY_KEYWORDS) {
    if (lowerText.includes(kw)) secondaryCount++;
  }

  if (primaryCount >= 2) return 'analyze';
  if (secondaryCount >= 3) return 'analyze';
  if (primaryCount >= 1 && secondaryCount >= 2) return 'analyze';
  if (secondaryCount >= 1) return 'enrich';

  return 'skip';
}

// ── Safe JSON Parsing ──────────────────────────────────────────────────────

function safeParseJson(raw: string): Record<string, unknown> | null {
  // Strip markdown fences
  let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  // Try direct parse
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch { /* continue */ }

  // Try to find JSON object in the response
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch { /* continue */ }
  }

  return null;
}

// ── Type-Safe Response Parsing ─────────────────────────────────────────────

function parseExtractionResponse(raw: string): ExtractedBoundaryData | null {
  const parsed = safeParseJson(raw);
  if (!parsed) return null;

  const validTypes = ['metes_and_bounds', 'lot_and_block', 'hybrid', 'reference_only'];
  if (!parsed.type || !validTypes.includes(String(parsed.type))) return null;

  return {
    type: parsed.type as ExtractedBoundaryData['type'],
    datum: (['NAD83', 'NAD27', 'unknown'].includes(String(parsed.datum ?? '')) ? String(parsed.datum) : 'unknown') as ExtractedBoundaryData['datum'],
    pointOfBeginning: {
      description: String(safeGet(parsed, 'pointOfBeginning', 'description') ?? ''),
      referenceMonument: safeGetString(parsed, 'pointOfBeginning', 'referenceMonument'),
    },
    calls: Array.isArray(parsed.calls) ? parsed.calls.map(safeNormalizeCall) : [],
    references: Array.isArray(parsed.references) ? parsed.references.map(safeNormalizeReference) : [],
    area: parsed.area && typeof parsed.area === 'object' ? {
      raw: String((parsed.area as Record<string, unknown>).raw ?? ''),
      value: safeNumber((parsed.area as Record<string, unknown>).value),
      unit: String((parsed.area as Record<string, unknown>).unit ?? 'acres'),
    } : null,
    lotBlock: parsed.lotBlock && typeof parsed.lotBlock === 'object' ? {
      lot: String((parsed.lotBlock as Record<string, unknown>).lot ?? ''),
      block: String((parsed.lotBlock as Record<string, unknown>).block ?? ''),
      subdivision: String((parsed.lotBlock as Record<string, unknown>).subdivision ?? ''),
      phase: safeGetString(parsed.lotBlock as Record<string, unknown>, 'phase'),
      cabinet: safeGetString(parsed.lotBlock as Record<string, unknown>, 'cabinet'),
      slide: safeGetString(parsed.lotBlock as Record<string, unknown>, 'slide'),
    } : null,
    confidence: safeNumber(parsed.confidence) ?? 0.5,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
  };
}

// Type-safe helpers
function safeGet(obj: Record<string, unknown>, ...keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function safeGetString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  const val = keys.length === 1 ? obj[keys[0]] : safeGet(obj, ...keys);
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str.length > 0 ? str : null;
}

function safeNumber(val: unknown): number | null {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return null;
}

function safeNormalizeCall(raw: unknown): BoundaryCall {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bearing = obj.bearing as Record<string, unknown> | null | undefined;
  const distance = obj.distance as Record<string, unknown> | null | undefined;
  const curve = obj.curve as Record<string, unknown> | null | undefined;

  return {
    sequence: safeNumber(obj.sequence) ?? 0,
    bearing: bearing && typeof bearing === 'object' ? {
      raw: String(bearing.raw ?? ''),
      decimalDegrees: safeNumber(bearing.decimalDegrees) ?? 0,
      quadrant: String(bearing.quadrant ?? ''),
    } : null,
    distance: distance && typeof distance === 'object' ? {
      raw: String(distance.raw ?? ''),
      value: safeNumber(distance.value) ?? 0,
      unit: (['feet', 'varas', 'chains', 'meters', 'rods', 'links'].includes(String(distance.unit)) ? String(distance.unit) : 'feet') as NonNullable<BoundaryCall['distance']>['unit'],
    } : null,
    curve: curve && typeof curve === 'object' ? parseCurveData(curve) : null,
    toPoint: safeGetString(obj, 'toPoint'),
    along: safeGetString(obj, 'along'),
    confidence: safeNumber(obj.confidence) ?? 0.5,
  };
}

function parseCurveData(curve: Record<string, unknown>): NonNullable<BoundaryCall['curve']> {
  const radius = curve.radius as Record<string, unknown> | undefined;
  const arcLength = curve.arcLength as Record<string, unknown> | null | undefined;
  const chordBearing = curve.chordBearing as Record<string, unknown> | null | undefined;
  const chordDistance = curve.chordDistance as Record<string, unknown> | null | undefined;
  const delta = curve.delta as Record<string, unknown> | null | undefined;

  return {
    radius: {
      raw: String(radius && typeof radius === 'object' ? radius.raw ?? '' : ''),
      value: (radius && typeof radius === 'object' ? safeNumber(radius.value) : safeNumber(curve.radius)) ?? 0,
    },
    arcLength: arcLength && typeof arcLength === 'object' ? {
      raw: String(arcLength.raw ?? ''),
      value: safeNumber(arcLength.value) ?? 0,
    } : null,
    chordBearing: chordBearing && typeof chordBearing === 'object' ? {
      raw: String(chordBearing.raw ?? ''),
      decimalDegrees: safeNumber(chordBearing.decimalDegrees) ?? 0,
      quadrant: String(chordBearing.quadrant ?? ''),
    } : null,
    chordDistance: chordDistance && typeof chordDistance === 'object' ? {
      raw: String(chordDistance.raw ?? ''),
      value: safeNumber(chordDistance.value) ?? 0,
    } : null,
    direction: curve.direction === 'left' ? 'left' : 'right',
    delta: delta && typeof delta === 'object' ? {
      raw: String(delta.raw ?? ''),
      decimalDegrees: safeNumber(delta.decimalDegrees) ?? 0,
    } : null,
  };
}

function safeNormalizeReference(raw: unknown): DocumentReference {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const validTypes = ['deed', 'plat', 'easement', 'survey', 'other'];
  return {
    type: (validTypes.includes(String(obj.type)) ? String(obj.type) : 'other') as DocumentReference['type'],
    volume: safeGetString(obj, 'volume'),
    page: safeGetString(obj, 'page'),
    instrumentNumber: safeGetString(obj, 'instrumentNumber'),
    cabinetSlide: safeGetString(obj, 'cabinetSlide'),
    county: safeGetString(obj, 'county'),
    description: safeGetString(obj, 'description'),
  };
}

// ── Layer 3A: Text Extraction ──────────────────────────────────────────────

/** Internal text extraction — takes explicit apiKey and docLabel. */
async function extractFromTextInternal(
  text: string,
  anthropicApiKey: string,
  logger: PipelineLogger,
  docLabel: string,
): Promise<ExtractedBoundaryData | null> {
  const tracker = logger.startAttempt({
    layer: 'Stage3A',
    source: 'Claude-Text',
    method: 'text-extraction',
    input: `${docLabel} (${text.length} chars)`,
  });

  // Truncate extremely long documents to avoid token limits
  const truncated = text.length > 80_000 ? text.substring(0, 80_000) + '\n\n[... document truncated at 80,000 characters ...]' : text;
  tracker.step(`Document length: ${text.length} chars${text.length > 80_000 ? ' (truncated to 80K)' : ''}`);

  tracker.step('Sending to Claude for text extraction...');
  const rawResponse = await callClaudeWithRetry(
    anthropicApiKey,
    [{
      role: 'user',
      content: `Analyze the following Texas property document and extract ALL boundary information, legal descriptions, document references, and relevant surveying data.

Think step by step:
1. Read the entire document to understand its context
2. Identify the type of legal description (metes & bounds, lot & block, hybrid, reference only)
3. Extract the point of beginning if present
4. Extract every boundary call in sequence
5. Extract all document references (volumes, pages, instruments, plat references)
6. Extract area information
7. Extract lot/block/subdivision information
8. Note any unclear or ambiguous text

DOCUMENT TEXT:
---
${truncated}
---

Return your analysis as the specified JSON format.`,
    }],
    EXTRACTION_SYSTEM_PROMPT,
    logger,
    `text-extract:${docLabel}`,
  );

  if (!rawResponse) {
    tracker({ status: 'fail', error: 'No response from Claude' });
    return null;
  }

  tracker.step(`Got response (${rawResponse.length} chars), parsing JSON...`);
  const extracted = parseExtractionResponse(rawResponse);
  if (!extracted) {
    tracker.step(`JSON parse failed. Raw response preview: ${rawResponse.substring(0, 300)}`);
    tracker({ status: 'fail', error: 'Failed to parse extraction response', details: rawResponse.substring(0, 200) });
    return null;
  }

  tracker.step(`Parsed: type=${extracted.type}, calls=${extracted.calls.length}, refs=${extracted.references.length}, confidence=${extracted.confidence}`);
  tracker({
    status: 'success',
    dataPointsFound: extracted.calls.length + extracted.references.length,
    details: `Type: ${extracted.type}, Calls: ${extracted.calls.length}, Refs: ${extracted.references.length}, Confidence: ${extracted.confidence}`,
  });

  return extracted;
}

// ── PDF Page Rendering via Playwright ────────────────────────────────────────

/**
 * Minimum characters in Claude PDF OCR response to consider it complete.
 * When the response is below this threshold for a multi-page plat, we fall
 * back to Playwright per-page rendering + adaptive vision tiling.
 * Note: document.service.ts uses a lower threshold (500) because its Next.js
 * context processes individually-uploaded files which tend to be smaller than
 * the multi-page plat PDFs handled here.
 */
const PDF_OCR_MIN_CHARS_FOR_COMPLETE = 800;

/**
 * Render a PDF document to per-page screenshots using Playwright, then apply
 * the adaptive vision pipeline to each page. This is the fallback for large
 * complex plat PDFs (12+ acres, multiple lots) where Claude's single-pass
 * PDF processing misses fine details.
 *
 * Returns merged OCR text across all pages, or null if Playwright fails.
 */
async function extractPdfViaPageRendering(
  pdfBase64: string,
  anthropicApiKey: string,
  logger: PipelineLogger,
  docLabel: string,
): Promise<string | null> {
  let browser: import('playwright').Browser | null = null;
  const renderTracker = logger.attempt(
    'Stage3B-PDF', 'Playwright-PDF-Render', 'per-page-adaptive-ocr',
    `${docLabel} PDF → page screenshots`,
  );

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

    // Navigate to the PDF as a data URL
    const dataUrl = `data:application/pdf;base64,${pdfBase64}`;
    renderTracker.step(`Navigating to PDF data URL (${Math.round(pdfBase64.length / 1024)}KB base64)`);
    try {
      await page.goto(dataUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    } catch {
      await page.goto(dataUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3_000);
    }

    const allPageTexts: string[] = [];
    const maxPages = 20;

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        if (pageNum > 1) {
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(1_500);
        }

        // Screenshot the rendered PDF page
        const screenshotBuf = await page.screenshot({ fullPage: false, type: 'png' });
        renderTracker.step(`Page ${pageNum}: screenshot ${Math.round(screenshotBuf.length / 1024)}KB`);

        // Apply adaptive vision OCR to this page
        const avResult = await adaptiveVisionOcr(
          screenshotBuf, 'image/png', anthropicApiKey, logger,
          `${docLabel}-p${pageNum}`,
          docLabel,
        );

        const pageText = avResult.mergedText.trim();
        renderTracker.step(
          `Page ${pageNum}: ${avResult.totalSegments} segments, ` +
          `confidence=${avResult.overallConfidence}, ${pageText.length} chars`,
        );

        if (pageText.length > 20) {
          allPageTexts.push(`[Page ${pageNum}]\n${pageText}`);
        } else if (pageNum > 2) {
          // Reached the end — stop trying more pages
          renderTracker.step(`Page ${pageNum}: empty — stopping at ${pageNum - 1} pages`);
          break;
        }
      } catch (pageErr) {
        renderTracker.step(`Page ${pageNum} error: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`);
        if (pageNum > 2) break;
      }
    }

    await browser.close();
    browser = null;

    const merged = allPageTexts.join('\n\n');
    if (merged.length > 50) {
      renderTracker.success(
        allPageTexts.length,
        `${allPageTexts.length} pages rendered, ${merged.length} chars extracted`,
      );
      return merged;
    }

    renderTracker.fail('Per-page rendering produced no usable text');
    return null;

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    renderTracker.fail(`Playwright PDF rendering failed: ${msg}`);
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

// ── Layer 3B: Vision OCR — Adaptive (large) or single-pass (small) ───────────

/** Base64 character threshold above which we use the adaptive vision pipeline.
 *  ~800 000 base64 chars ≈ 600 KB decoded, which is roughly a small thumbnail.
 *  Anything larger (full-res plat scans) goes through adaptive-vision.ts. */
const ADAPTIVE_VISION_THRESHOLD = 800_000;

/** Anthropic Vision API maximum pixels on any single dimension. */
const MAX_VISION_DIMENSION = 7_900; // leave 100px margin below the hard 8000 limit

/** Anthropic Vision API hard limit: 5 MiB per image. Use 4.5 MiB as our safety margin. */
const MAX_IMAGE_BYTES = 4_718_592; // 4.5 MiB

/**
 * Resizes and/or compresses an image buffer so that:
 *   1. Neither pixel dimension exceeds MAX_VISION_DIMENSION (7 900 px), and
 *   2. The encoded byte size stays below MAX_IMAGE_BYTES (4.5 MB).
 *
 * Strategy:
 *   - Step 1: pixel resize (PNG) if dimensions are too large.
 *   - Step 2: JPEG compression at quality=80 if buffer is still > 4.5 MB.
 *   - Step 3: JPEG compression at quality=60 if buffer is still > 4.5 MB.
 *
 * Returns the original buffer unchanged if it is within limits or if sharp
 * is unavailable (non-fatal).
 *
 * Intentionally uses console.log (not PipelineLogger) because this function
 * is a standalone utility not bound to any pipeline execution context.
 */
async function resizeIfNeeded(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const { default: sharp } = await import('sharp') as { default: typeof import('sharp') };
    const meta = await sharp(imageBuffer).metadata();
    const { width, height } = meta;
    if (!width || !height) return imageBuffer;

    let result = imageBuffer;

    // Step 1: pixel dimension resize
    if (width > MAX_VISION_DIMENSION || height > MAX_VISION_DIMENSION) {
      const scale = MAX_VISION_DIMENSION / Math.max(width, height);
      const newWidth  = Math.round(width  * scale);
      const newHeight = Math.round(height * scale);
      console.log(`[Vision] Resizing image from ${width}x${height} to ${newWidth}x${newHeight}`);
      result = await sharp(result)
        .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    }

    // Step 2: byte-size compression — JPEG quality=80
    if (result.length > MAX_IMAGE_BYTES) {
      console.log(`[Vision] Compressing image (${result.length} bytes > ${MAX_IMAGE_BYTES}) — JPEG q80`);
      result = await sharp(result)
        .jpeg({ quality: 80 })
        .toBuffer();
    }

    // Step 3: byte-size compression — JPEG quality=60 (last resort)
    if (result.length > MAX_IMAGE_BYTES) {
      console.log(`[Vision] Re-compressing image (${result.length} bytes still > ${MAX_IMAGE_BYTES}) — JPEG q60`);
      result = await sharp(result)
        .jpeg({ quality: 60 })
        .toBuffer();
    }

    return result;
  } catch {
    // If sharp fails for any reason, return the original (non-fatal)
    return imageBuffer;
  }
}

/** Internal image extraction -- takes explicit apiKey, mediaType, and docLabel. */
async function extractFromImageInternal(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/tiff' | 'application/pdf',
  anthropicApiKey: string,
  logger: PipelineLogger,
  docLabel: string,
): Promise<{ ocrText: string | null; extracted: ExtractedBoundaryData | null }> {
  // ── Route: PDF document source type ──────────────────────────────────────
  // Bell County free plat PDFs are sent as 'application/pdf' with Claude's
  // native document source. This is the correct approach — it processes all
  // pages and handles multi-page plat drawings properly. Much better than
  // incorrectly converting to image/png (which was the old behavior).
  if (mediaType === 'application/pdf') {
    const pdfTracker = logger.startAttempt({
      layer: 'Stage3B-OCR',
      source: 'Claude-Vision-PDF',
      method: 'ocr-pdf-document',
      input: `${docLabel} (${imageBase64.length} base64 chars, PDF)`,
    });
    pdfTracker.step(
      `PDF document: ${Math.round(imageBase64.length / 1024)}KB base64 — ` +
      `sending as application/pdf document source (multi-page support, no watermarks)`,
    );

    const ocrResponse = await callClaudeWithRetry(
      anthropicApiKey,
      [{
        role: 'user',
        // `content` is typed as `unknown` in callClaudeWithRetry and cast to the
        // Anthropic SDK type at the call site. The 'document' content block is a
        // valid Anthropic API content type for PDF inputs (Claude 3+ with PDFs beta).
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 },
          },
          {
            type: 'text',
            text: 'Extract ALL text from this Texas land surveying document (plat or deed). ' +
                  'Be extremely thorough — every bearing, distance, curve data, monument, ' +
                  'lot acreage, easement, adjacent property reference, and recording number matters. ' +
                  'For a plat with multiple lots/parcels, list EACH lot separately with all its ' +
                  'boundary calls. Include every page — this may have 12+ acres and multiple properties.',
          },
        ] as unknown,
      }],
      OCR_SYSTEM_PROMPT,
      logger,
      `${docLabel}-pdf-ocr`,
    );

    if (!ocrResponse || ocrResponse.length < 30) {
      pdfTracker({ status: 'fail', error: 'Empty or minimal PDF OCR response' });
      return { ocrText: null, extracted: null };
    }

    pdfTracker.step(`PDF OCR Pass 1: ${ocrResponse.length} chars`);

    // For sparse results on large plats, try per-page Playwright rendering + adaptive vision
    if (ocrResponse.length < PDF_OCR_MIN_CHARS_FOR_COMPLETE) {
      pdfTracker.step(
        `PDF OCR result sparse (${ocrResponse.length} chars < ${PDF_OCR_MIN_CHARS_FOR_COMPLETE}) — ` +
        `trying per-page Playwright rendering for large plat`,
      );
      const renderText = await extractPdfViaPageRendering(imageBase64, anthropicApiKey, logger, docLabel);
      if (renderText && renderText.length > ocrResponse.length) {
        pdfTracker.step(`Per-page rendering produced more text (${renderText.length} chars) — using that`);
        pdfTracker({
          status: 'success',
          dataPointsFound: 1,
          details: `PDF OCR via page rendering: ${renderText.length} chars`,
        });
        const extracted = await extractFromTextInternal(renderText, anthropicApiKey, logger, `${docLabel}-pdf-render-struct`);
        return { ocrText: renderText, extracted };
      }
      pdfTracker.step('Per-page rendering did not improve — using original PDF OCR result');
    }

    pdfTracker({
      status: 'success',
      dataPointsFound: 1,
      details: `PDF OCR: ${ocrResponse.length} chars`,
    });

    // Pass 2: structured extraction from OCR text
    const extracted = await extractFromTextInternal(ocrResponse, anthropicApiKey, logger, `${docLabel}-pdf-struct`);
    return { ocrText: ocrResponse, extracted };
  }

  // For TIFF, Claude doesn't support it directly — would need conversion
  if (mediaType === 'image/tiff') {
    const tracker = logger.startAttempt({ layer: 'Stage3B-OCR', source: 'Claude-Vision', method: 'ocr-tiff', input: docLabel });
    tracker({ status: 'fail', error: 'TIFF not directly supported — needs conversion to PNG' });
    return { ocrText: null, extracted: null };
  }

  // effectiveMediaType is now only used for image paths (png/jpeg)
  const effectiveMediaType = mediaType;

  // ── Route: Adaptive Vision (large plat images) vs single-pass (small) ────
  const isLarge = imageBase64.length > ADAPTIVE_VISION_THRESHOLD;

  if (isLarge && (effectiveMediaType === 'image/png' || effectiveMediaType === 'image/jpeg')) {
    // ── Adaptive Vision path ─────────────────────────────────────────────
    const ocrTracker = logger.startAttempt({
      layer: 'Stage3B-OCR',
      source: 'Claude-Vision-Adaptive',
      method: 'adaptive-quadrant-ocr',
      input: `${docLabel} (${imageBase64.length} base64 chars)`,
    });
    ocrTracker.step(`Large image (${imageBase64.length} chars) — using adaptive vision pipeline`);

    const imgBuffer = Buffer.from(imageBase64, 'base64');
    const avResult = await adaptiveVisionOcr(
      imgBuffer, effectiveMediaType, anthropicApiKey, logger, docLabel, docLabel,
    );

    ocrTracker.step(
      `Adaptive vision complete: ${avResult.totalSegments} segments, ` +
      `${avResult.escalatedSegments} escalated, ${avResult.totalApiCalls} API calls, ` +
      `overall confidence=${avResult.overallConfidence}`,
    );

    const ocrText = avResult.mergedText || null;

    if (avResult.manualReviewSegments > 0) {
      ocrTracker.step(`⚠ ${avResult.manualReviewSegments} segment(s) flagged for manual review (confidence < 50)`);
    }

    ocrTracker({
      status: ocrText && ocrText.length > 50 ? 'success' : 'partial',
      dataPointsFound: avResult.totalSegments,
      details: `Grid: ${avResult.gridUsed ? `${avResult.gridUsed.rows}×${avResult.gridUsed.cols}` : 'single'}, ` +
               `confidence: ${avResult.overallConfidence}, calls: ${avResult.totalApiCalls}`,
    });

    if (!ocrText || ocrText.length < 50) {
      return { ocrText, extracted: null };
    }

    // Pass 2: structured extraction from merged OCR text
    const extracted = await extractFromTextInternal(ocrText, anthropicApiKey, logger, `${docLabel}-adaptive-ocr`);
    return { ocrText, extracted };
  }

  // ── Single-pass Vision path (small images) ─────────────────────────────
  const ocrTracker = logger.startAttempt({
    layer: 'Stage3B-OCR',
    source: 'Claude-Vision',
    method: 'ocr-pass1',
    input: `${docLabel} (image ${mediaType})`,
  });
  ocrTracker.step(`Media type: ${mediaType}, effective: ${effectiveMediaType}, base64 length: ${imageBase64.length}`);

  ocrTracker.step('Sending image to Claude Vision for OCR...');
  const imgBuffer = Buffer.from(imageBase64, 'base64');
  const resizedBuffer = await resizeIfNeeded(imgBuffer);
  const resizedBase64 = resizedBuffer === imgBuffer ? imageBase64 : resizedBuffer.toString('base64');
  const ocrResponse = await callClaudeWithRetry(
    anthropicApiKey,
    [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: effectiveMediaType, data: resizedBase64 },
        },
        {
          type: 'text',
          text: 'Extract ALL text from this Texas land surveying document. Be extremely thorough — every bearing, distance, monument, and reference matters.',
        },
      ],
    }],
    OCR_SYSTEM_PROMPT,
    logger,
    `ocr:${docLabel}`,
  );

  if (!ocrResponse) {
    ocrTracker({ status: 'fail', error: 'No OCR response' });
    return { ocrText: null, extracted: null };
  }

  ocrTracker.step(`Got OCR response (${ocrResponse.length} chars), parsing...`);
  let ocrText: string | null = null;
  const parsed = safeParseJson(ocrResponse);
  if (parsed && typeof parsed.full_text === 'string') {
    ocrText = parsed.full_text;
    ocrTracker.step(`Parsed structured OCR: ${ocrText.length} chars, confidence: ${parsed.overall_confidence ?? 'N/A'}`);
  } else {
    ocrText = ocrResponse;
    ocrTracker.step(`OCR response not JSON — using raw text (${ocrText.length} chars)`);
  }

  ocrTracker({
    status: ocrText && ocrText.length > 50 ? 'success' : 'partial',
    dataPointsFound: ocrText ? 1 : 0,
    details: `OCR text: ${ocrText?.length ?? 0} chars`,
  });

  if (!ocrText || ocrText.length < 50) {
    return { ocrText, extracted: null };
  }

  const extracted = await extractFromTextInternal(ocrText, anthropicApiKey, logger, `${docLabel}-ocr`);
  return { ocrText, extracted };
}

// ── Verification Pass ──────────────────────────────────────────────────────

/**
 * Re-run extraction and compare. Keeps the BETTER result (not just the latest).
 * If disagreements are found, the more conservative (lower confidence) values
 * are flagged but both versions are preserved in warnings.
 */
async function verifyExtraction(
  text: string,
  originalResult: ExtractedBoundaryData,
  anthropicApiKey: string,
  logger: PipelineLogger,
  docLabel: string,
  passNumber: number,
): Promise<ExtractedBoundaryData> {
  const tracker = logger.startAttempt({
    layer: `Stage3-Verify-${passNumber}`,
    source: 'Claude-Text',
    method: 'verification-pass',
    input: `${docLabel} (pass ${passNumber})`,
  });

  tracker.step(`Verification pass ${passNumber}: original has ${originalResult.calls.length} calls, confidence ${originalResult.confidence.toFixed(2)}`);
  tracker.step('Sending to Claude for re-analysis...');
  const rawResponse = await callClaudeWithRetry(
    anthropicApiKey,
    [{
      role: 'user',
      content: `You previously analyzed this document. Please re-read it VERY CAREFULLY and verify every value. Check each bearing, distance, monument, and reference.

If you find ANY errors in the previous extraction, correct them. If everything is correct, confirm it.

PREVIOUS EXTRACTION:
${JSON.stringify(originalResult, null, 2)}

ORIGINAL DOCUMENT TEXT:
---
${text}
---

Return the corrected/confirmed extraction in the same JSON format. Add warnings for anything you corrected.`,
    }],
    EXTRACTION_SYSTEM_PROMPT,
    logger,
    `verify:${docLabel}:pass${passNumber}`,
  );

  if (!rawResponse) {
    tracker({ status: 'fail', error: 'No verification response' });
    return originalResult;
  }

  tracker.step(`Got verification response (${rawResponse.length} chars), parsing...`);
  const verified = parseExtractionResponse(rawResponse);
  if (!verified) {
    tracker.step(`JSON parse failed for verification response. Preview: ${rawResponse.substring(0, 200)}`);
    tracker({ status: 'fail', error: 'Failed to parse verification response' });
    return originalResult; // Keep original rather than losing data
  }

  // Compare and merge
  const mismatches: string[] = [];
  const callCountMatch = verified.calls.length === originalResult.calls.length;
  if (!callCountMatch) {
    mismatches.push(`Call count: ${originalResult.calls.length} → ${verified.calls.length}`);
  }
  if (verified.type !== originalResult.type) {
    mismatches.push(`Type: ${originalResult.type} → ${verified.type}`);
  }

  // Check individual calls
  const minCalls = Math.min(verified.calls.length, originalResult.calls.length);
  for (let i = 0; i < minCalls; i++) {
    const orig = originalResult.calls[i];
    const ver = verified.calls[i];

    if (orig.bearing && ver.bearing) {
      const degDiff = Math.abs(orig.bearing.decimalDegrees - ver.bearing.decimalDegrees);
      if (degDiff > 0.01) {
        mismatches.push(`Call ${i + 1} bearing: ${orig.bearing.raw} (${orig.bearing.decimalDegrees}°) → ${ver.bearing.raw} (${ver.bearing.decimalDegrees}°)`);
      }
    }

    if (orig.distance && ver.distance) {
      const distDiff = Math.abs(orig.distance.value - ver.distance.value);
      if (distDiff > 0.01) {
        mismatches.push(`Call ${i + 1} distance: ${orig.distance.raw} (${orig.distance.value}) → ${ver.distance.raw} (${ver.distance.value})`);
      }
    }
  }

  if (mismatches.length > 0) {
    logger.warn('Stage3-Verify', `Pass ${passNumber} found ${mismatches.length} corrections: ${mismatches.join('; ')}`);
    verified.warnings = [
      ...verified.warnings,
      `Verification pass ${passNumber} corrected: ${mismatches.join('; ')}`,
    ];
    verified.confidence = Math.max(0.3, verified.confidence - 0.05 * mismatches.length);
  } else {
    // Confirmed — boost confidence
    verified.confidence = Math.min(1.0, verified.confidence + 0.03);
    logger.info('Stage3-Verify', `Pass ${passNumber} confirmed all values`);
  }

  verified.verificationPasses = passNumber;
  verified.verified = mismatches.length === 0;

  tracker.step(`Verification result: ${mismatches.length} corrections, final confidence ${verified.confidence.toFixed(2)}, verified=${verified.verified}`);
  tracker({
    status: 'success',
    dataPointsFound: verified.calls.length,
    details: `Corrections: ${mismatches.length}, Confidence: ${verified.confidence.toFixed(2)}`,
  });

  return verified;
}

// ── Multi-Page Screenshot OCR ──────────────────────────────────────────────

/**
 * Process ALL page screenshots from a document viewer.
 * OCRs each page individually, concatenates the text, then runs
 * structured extraction on the combined text for the full document.
 */
async function extractFromPageScreenshots(
  pages: PageScreenshot[],
  anthropicApiKey: string,
  logger: PipelineLogger,
  docLabel: string,
): Promise<{ ocrText: string | null; extracted: ExtractedBoundaryData | null }> {
  if (!pages.length) return { ocrText: null, extracted: null };

  const tracker = logger.startAttempt({
    layer: 'Stage3B-MultiPage',
    source: 'Claude-Vision',
    method: 'multi-page-ocr',
    input: `${docLabel} (${pages.length} pages)`,
  });

  tracker.step(`Processing ${pages.length} page screenshot(s) for ${docLabel}`);

  // For single-page documents, just use the standard image extraction
  if (pages.length === 1) {
    tracker.step('Single page — delegating to standard image extraction');
    tracker({ status: 'success', dataPointsFound: 1, details: 'Delegated to single-page extractor' });
    return extractFromImageInternal(pages[0].imageBase64, 'image/png', anthropicApiKey, logger, `${docLabel}-p1`);
  }

  // For multi-page: OCR each page, then combine and extract
  const pageTexts: string[] = [];
  const batchSize = 3; // Send up to 3 pages at a time to reduce API calls

  for (let batchStart = 0; batchStart < pages.length; batchStart += batchSize) {
    const batch = pages.slice(batchStart, batchStart + batchSize);
    const batchEnd = Math.min(batchStart + batchSize, pages.length);
    const batchLabel = `pages ${batchStart + 1}-${batchEnd}`;
    tracker.step(`OCR batch: ${batchLabel} of ${pages.length}`);

    // Build multi-image message content
    const contentParts: Array<{ type: string; source?: unknown; text?: string }> = [];
    for (const page of batch) {
      const pageBuffer = Buffer.from(page.imageBase64, 'base64');
      const resizedPageBuffer = await resizeIfNeeded(pageBuffer);
      const pageBase64 = resizedPageBuffer === pageBuffer ? page.imageBase64 : resizedPageBuffer.toString('base64');
      contentParts.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png' as const, data: pageBase64 },
      });
      contentParts.push({
        type: 'text',
        text: `[Page ${page.pageNumber} — ${page.width}x${page.height}px]`,
      });
    }
    contentParts.push({
      type: 'text',
      text: `Extract ALL text from ${batch.length > 1 ? 'these pages' : 'this page'} of a Texas land surveying document. Be extremely thorough — every bearing, distance, monument, and reference matters. Return text for each page labeled with its page number.`,
    });

    const ocrResponse = await callClaudeWithRetry(
      anthropicApiKey,
      [{ role: 'user', content: contentParts }],
      OCR_SYSTEM_PROMPT,
      logger,
      `ocr-batch:${docLabel}:${batchLabel}`,
      16384,
    );

    if (ocrResponse) {
      // Try to parse as JSON, fall back to raw text
      const parsed = safeParseJson(ocrResponse);
      if (parsed && typeof parsed.full_text === 'string') {
        pageTexts.push(parsed.full_text);
        tracker.step(`Batch ${batchLabel}: extracted ${parsed.full_text.length} chars (structured)`);
      } else {
        pageTexts.push(ocrResponse);
        tracker.step(`Batch ${batchLabel}: extracted ${ocrResponse.length} chars (raw)`);
      }
    } else {
      tracker.step(`Batch ${batchLabel}: OCR failed — no response`);
    }
  }

  if (!pageTexts.length) {
    tracker({ status: 'fail', error: `All ${pages.length} pages failed OCR` });
    return { ocrText: null, extracted: null };
  }

  // Combine all page texts
  const combinedText = pageTexts.join('\n\n--- PAGE BREAK ---\n\n');
  tracker.step(`Combined OCR: ${combinedText.length} chars from ${pageTexts.length} batch(es)`);

  tracker({
    status: 'success',
    dataPointsFound: pageTexts.length,
    details: `OCR'd ${pages.length} pages → ${combinedText.length} chars total`,
  });

  // Now run structured extraction on the combined text
  const extracted = await extractFromTextInternal(combinedText, anthropicApiKey, logger, `${docLabel}-multipage`);
  return { ocrText: combinedText, extracted };
}

// ── Main Extraction Function ───────────────────────────────────────────────

/**
 * Process all documents through AI extraction with multi-pass verification.
 * User-uploaded files are processed with the same pipeline.
 */
export async function extractDocuments(
  documents: DocumentResult[],
  legalDescriptionFromCad: string | null,
  anthropicApiKey: string,
  logger: PipelineLogger,
): Promise<{ documents: DocumentResult[]; boundary: ExtractedBoundaryData | null }> {
  logger.info('Stage3', `Processing ${documents.length} documents + ${legalDescriptionFromCad ? 'CAD legal description' : 'no CAD legal'}`);

  let bestBoundary: ExtractedBoundaryData | null = null;
  let bestConfidence = 0;

  function updateBest(extracted: ExtractedBoundaryData): void {
    if (extracted.confidence > bestConfidence) {
      bestBoundary = extracted;
      bestConfidence = extracted.confidence;
    }
  }

  // Helper to run verification loops
  async function runVerification(
    text: string,
    extracted: ExtractedBoundaryData,
    label: string,
  ): Promise<ExtractedBoundaryData> {
    let result = extracted;
    let passCount = 0;

    // Run verification if confidence is below threshold
    while (result.confidence < CONFIDENCE_THRESHOLD_RERUN && passCount < MAX_VERIFICATION_PASSES) {
      passCount++;
      logger.info('Stage3', `${label} confidence ${result.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD_RERUN} — verification pass ${passCount}`);
      result = await verifyExtraction(text, result, anthropicApiKey, logger, label, passCount);
    }

    // Mandatory verification for metes_and_bounds with calls (regardless of confidence)
    if (result.type === 'metes_and_bounds' && result.calls.length > 0 && passCount === 0) {
      passCount++;
      result = await verifyExtraction(text, result, anthropicApiKey, logger, label, passCount);
    }

    return result;
  }

  // ── Process CAD legal description first (highest priority) ──
  if (legalDescriptionFromCad && legalDescriptionFromCad.length > 20) {
    const screening = screenDocument(legalDescriptionFromCad);
    logger.info('Stage3', `CAD legal description screening: ${screening}`);

    try {
      if (screening === 'analyze') {
        const extracted = await extractFromTextInternal(legalDescriptionFromCad, anthropicApiKey, logger, 'CAD-legal');
        if (extracted) {
          const verified = await runVerification(legalDescriptionFromCad, extracted, 'CAD-legal');
          updateBest(verified);
        }
      } else if (screening === 'enrich') {
        // Still worth sending to Claude for lot/block info even if no metes & bounds
        const extracted = await extractFromTextInternal(legalDescriptionFromCad, anthropicApiKey, logger, 'CAD-legal-enrich');
        if (extracted) {
          updateBest(extracted);
        }
      }
    } catch (err) {
      if (err instanceof AnthropicCreditDepletedError) {
        logger.error('Stage3', `AI extraction halted — ${err.message}`);
        return { documents, boundary: null };
      }
      throw err;
    }
  }

  // ── Process each document ──
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const label = `doc-${i + 1}-${doc.ref.documentType.replace(/\s+/g, '_').substring(0, 20)}`;
    const isUserUpload = doc.fromUserUpload ?? false;

    // User uploads always get analyzed (user paid for and chose these files)
    const forceAnalyze = isUserUpload;

    try {
      // Try text content first
      if (doc.textContent && doc.textContent.length > 50) {
        const screening = forceAnalyze ? 'analyze' : screenDocument(doc.textContent);
        logger.info('Stage3', `${label} text screening: ${screening} (${doc.textContent.length} chars)${isUserUpload ? ' [USER UPLOAD]' : ''}`);

        if (screening === 'skip' && !forceAnalyze) {
          logger.info('Stage3', `${label}: Skipping — not relevant`);
          continue;
        }

        if (screening === 'analyze' || forceAnalyze) {
          const extracted = await extractFromTextInternal(doc.textContent, anthropicApiKey, logger, label);
          if (extracted) {
            const verified = await runVerification(doc.textContent, extracted, label);
            doc.extractedData = verified;
            updateBest(verified);
          }
        } else if (screening === 'enrich') {
          const extracted = await extractFromTextInternal(doc.textContent, anthropicApiKey, logger, `${label}-enrich`);
          if (extracted) {
            doc.extractedData = extracted;
            updateBest(extracted);
          }
        }
      }

      // Try multi-page screenshots first (highest quality — captured at full resolution)
      if (!doc.extractedData && doc.pageScreenshots && doc.pageScreenshots.length > 0) {
        logger.info('Stage3', `${label}: Processing ${doc.pageScreenshots.length} page screenshot(s)`);
        const { ocrText, extracted } = await extractFromPageScreenshots(
          doc.pageScreenshots, anthropicApiKey, logger, label,
        );

        doc.ocrText = ocrText;

        if (extracted && ocrText) {
          const verified = await runVerification(ocrText, extracted, `${label}-pages`);
          doc.extractedData = verified;
          updateBest(verified);
        } else if (extracted) {
          doc.extractedData = extracted;
          updateBest(extracted);
        }
      }

      // Route C: Downloaded page images via Kofile signed URL interception
      const docPages = doc.pages ?? [];
      if (!doc.extractedData && docPages.length > 0) {
        logger.info('Stage3', `  ${label}: Processing ${docPages.length} downloaded page images`);
        const prompt = `You are analyzing county clerk records from Texas. These are ${docPages.length} page image${docPages.length !== 1 ? 's' : ''} from a ${doc.ref.documentType}${doc.ref.instrumentNumber ? ` (instrument ${doc.ref.instrumentNumber})` : ''}. Extract ALL data: 1) METES AND BOUNDS with every bearing and distance. 2) LOT BOUNDARIES. 3) POINT OF BEGINNING. 4) ACREAGE totals. 5) SURVEYOR info. 6) Full LEGAL DESCRIPTION. 7) CURVE DATA. 8) EASEMENTS. 9) Recording references. Be extremely precise with all numbers.`;
        try {
          const { text, data } = await analyzeMultiPageDocument(docPages, '', prompt, logger);
          if (text) doc.ocrText = text;
          if (data) doc.extractedData = data;
        } catch (pagesErr: any) {
          if (pagesErr instanceof AnthropicCreditDepletedError) throw pagesErr;
          logger.warn('Stage3', `  ${label}: Page images extraction failed: ${pagesErr.message}`);
        }
      }

      // Fall back to single image if no page screenshots or text extraction succeeded
      if (!doc.extractedData && doc.imageBase64) {
        const mediaType = doc.imageFormat === 'jpg' ? 'image/jpeg' as const
          : doc.imageFormat === 'pdf' ? 'application/pdf' as const
          : doc.imageFormat === 'tiff' ? 'image/tiff' as const
          : 'image/png' as const;

        const { ocrText, extracted } = await extractFromImageInternal(
          doc.imageBase64, mediaType, anthropicApiKey, logger, label,
        );

        doc.ocrText = ocrText;

        if (extracted && ocrText) {
          // OCR-sourced data gets extra verification (inherently less reliable)
          const verified = await runVerification(ocrText, extracted, `${label}-ocr`);
          doc.extractedData = verified;
          updateBest(verified);
        } else if (extracted) {
          doc.extractedData = extracted;
          updateBest(extracted);
        }
      }

      // Warn if document had no usable content at all
      if (!doc.textContent && !doc.imageBase64 && (!doc.pageScreenshots || doc.pageScreenshots.length === 0) && (!doc.pages || doc.pages.length === 0)) {
        logger.warn('Stage3', `${label}: WARNING — No text, images, or page screenshots to analyze`);
        if (!doc.processingErrors) doc.processingErrors = [];
        doc.processingErrors.push('No text or image content available for AI analysis');
      }
    } catch (err) {
      if (err instanceof AnthropicCreditDepletedError) {
        logger.error('Stage3', `AI extraction halted at ${label} — ${err.message}`);
        // Return what we have so far; remaining documents won't be enriched
        break;
      }
      throw err;
    }
  }

  // TypeScript control-flow analysis loses track of `bestBoundary` after
  // mutations inside nested closures (updateBest).  Use a type assertion so
  // the optional-chaining accesses below compile correctly.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const finalBoundary = bestBoundary as ExtractedBoundaryData | null;
  logger.info('Stage3', `Extraction complete. Best: ${finalBoundary?.type ?? 'none'} (confidence: ${bestConfidence.toFixed(2)}, calls: ${finalBoundary?.calls.length ?? 0})`);

  return { documents, boundary: finalBoundary };
}

// ── Stage 3C: Plat-based boundary extraction for platted subdivisions ─────────

const PLAT_LOT_EXTRACTION_PROMPT = (lot: string, block: string, subdivision: string) =>
  `You are analyzing a recorded subdivision plat drawing. Extract the boundary data for a specific lot.

TARGET: Lot ${lot}, Block ${block}, ${subdivision}

Find this specific lot on the plat and extract ALL boundary information:
1. All boundary line bearings and distances (in order, clockwise from the most northerly point)
2. Any curve data (radius, arc length, chord bearing, chord distance, delta angle)
3. The lot area (if shown — acreage or square feet)
4. Adjacent lot numbers on each side
5. Street names and right-of-way widths for any sides fronting streets

Return ONLY valid JSON in this exact format:
{
  "type": "metes_and_bounds",
  "calls": [
    { "bearing": "N 56°31'22\" W", "distance": 150.00, "type": "line" },
    { "radius": 300.00, "arcLength": 45.67, "chordBearing": "N 60°00'00\" W", "chordDistance": 45.50, "delta": "8°43'15\"", "type": "curve" }
  ],
  "area_sqft": 8500,
  "area_acres": 0.195,
  "confidence": 0.85,
  "adjacentLots": ["Lot 23 Block 8", "Lot 25 Block 8"],
  "streets": [{ "name": "WAGGONER DR", "rowWidth": 60 }],
  "lot": "${lot}",
  "block": "${block}",
  "subdivision": "${subdivision}"
}

If you cannot find the specific lot on this plat, return:
{ "type": "lot_and_block", "calls": [], "confidence": 0.0, "reason": "lot not found on plat" }`;

/**
 * Stage 3C: Plat-specific boundary extraction for platted subdivisions.
 *
 * Called when Stage 3 returns only lot_and_block results (no metes-and-bounds)
 * AND the property is classified as a platted subdivision. Sends the plat
 * image to Claude Vision with a lot-targeted prompt to extract the specific
 * lot's boundary calls from the plat drawing.
 *
 * @param platDoc  - The plat document with image data
 * @param lot      - Lot number from the deed extraction
 * @param block    - Block number from the deed extraction
 * @param subdivision - Subdivision name
 * @param anthropicApiKey
 * @param logger
 */
export async function extractPlatBoundary(
  platDoc: DocumentResult,
  lot: string,
  block: string,
  subdivision: string,
  anthropicApiKey: string,
  logger: PipelineLogger,
): Promise<ExtractedBoundaryData | null> {
  const tracker = logger.startAttempt({
    layer: 'Stage3-Plat',
    source: 'Claude-Vision-Plat',
    method: 'plat-lot-extraction',
    input: `Lot ${lot} Block ${block} ${subdivision}`,
  });

  tracker.step(`Extracting boundary for Lot ${lot}, Block ${block} from plat drawing`);

  // Resolve the image to send — prefer page screenshots, then imageBase64
  let imageBase64ForVision: string | null = null;
  let mediaType: 'image/png' | 'image/jpeg' | 'application/pdf' = 'image/png';

  if (platDoc.imageBase64 && platDoc.imageFormat) {
    imageBase64ForVision = platDoc.imageBase64;
    mediaType = platDoc.imageFormat === 'jpg' ? 'image/jpeg'
      : platDoc.imageFormat === 'pdf' ? 'application/pdf'
      : 'image/png';
  } else if (platDoc.pageScreenshots && platDoc.pageScreenshots.length > 0) {
    // Use first page screenshot
    imageBase64ForVision = platDoc.pageScreenshots[0].imageBase64;
    mediaType = 'image/png';
  }

  if (!imageBase64ForVision) {
    tracker({ status: 'fail', error: 'No image available in plat document' });
    return null;
  }

  // Resize if needed before sending to Vision API
  const imgBuffer = Buffer.from(imageBase64ForVision, 'base64');
  const resizedBuffer = await resizeIfNeeded(imgBuffer);
  const sendBase64 = resizedBuffer === imgBuffer ? imageBase64ForVision : resizedBuffer.toString('base64');
  const sendMediaType: 'image/png' | 'image/jpeg' | 'application/pdf' = mediaType;

  const prompt = PLAT_LOT_EXTRACTION_PROMPT(lot, block, subdivision);

  let rawResponse: string | null = null;
  try {
    if (sendMediaType === 'application/pdf') {
      rawResponse = await callClaudeWithRetry(
        anthropicApiKey,
        [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: sendBase64 } },
            { type: 'text', text: prompt },
          ] as unknown,
        }],
        'You are an expert land surveyor analyzing a Texas subdivision plat drawing.',
        logger,
        `plat-lot:${lot}-${block}`,
        4096,
      );
    } else {
      rawResponse = await callClaudeWithRetry(
        anthropicApiKey,
        [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: sendMediaType, data: sendBase64 } },
            { type: 'text', text: prompt },
          ],
        }],
        'You are an expert land surveyor analyzing a Texas subdivision plat drawing.',
        logger,
        `plat-lot:${lot}-${block}`,
        4096,
      );
    }
  } catch (err) {
    tracker({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return null;
  }

  if (!rawResponse) {
    tracker({ status: 'fail', error: 'No response from Claude Vision' });
    return null;
  }

  // Parse the JSON response
  const parsed = safeParseJson(rawResponse);
  if (!parsed || typeof parsed !== 'object') {
    tracker({ status: 'fail', error: 'Non-JSON response from plat extraction' });
    return null;
  }

  // If Claude couldn't find the lot
  if (parsed.type === 'lot_and_block' || (Array.isArray(parsed.calls) && parsed.calls.length === 0)) {
    tracker({
      status: 'partial',
      dataPointsFound: 0,
      details: `Lot not found or no calls extracted: ${parsed.reason ?? 'unknown'}`,
    });
    return null;
  }

  // Build ExtractedBoundaryData from the plat extraction result.
  // decimalDegrees values are set to 0 as placeholders — the `raw` string is the
  // authoritative value.  Downstream validation (traverse-closure.ts) parses the
  // raw bearing string rather than relying on pre-computed decimal degrees.
  const calls: BoundaryCall[] = [];
  if (Array.isArray(parsed.calls)) {
    let seq = 1;
    for (const c of parsed.calls) {
      if (c.type === 'curve' && c.radius != null) {
        calls.push({
          sequence: seq++,
          bearing: null,
          distance: null,
          curve: {
            radius: { raw: String(c.radius), value: c.radius },
            arcLength: c.arcLength != null ? { raw: String(c.arcLength), value: c.arcLength } : null,
            chordBearing: c.chordBearing ? { raw: c.chordBearing, decimalDegrees: 0, quadrant: '' } : null,
            chordDistance: c.chordDistance != null ? { raw: String(c.chordDistance), value: c.chordDistance } : null,
            direction: 'right',
            delta: c.delta ? { raw: c.delta, decimalDegrees: 0 } : null,
          },
          toPoint: null,
          along: null,
          confidence: 0.75,
        });
      } else if (c.bearing && c.distance != null) {
        calls.push({
          sequence: seq++,
          bearing: { raw: c.bearing, decimalDegrees: 0, quadrant: '' },
          distance: { raw: String(c.distance), value: c.distance, unit: 'feet' },
          curve: null,
          toPoint: null,
          along: null,
          confidence: 0.75,
        });
      }
    }
  }

  const areaSqft  = typeof parsed.area_sqft  === 'number' ? parsed.area_sqft  : null;
  const areaAcres = typeof parsed.area_acres === 'number' ? parsed.area_acres : null;

  const result: ExtractedBoundaryData = {
    type: calls.length > 0 ? 'metes_and_bounds' : 'lot_and_block',
    datum: 'unknown',
    pointOfBeginning: { description: '', referenceMonument: null },
    calls,
    references: [],
    area: areaSqft != null
      ? { raw: `${areaSqft} sqft`, value: areaSqft / 43560, unit: 'acres' }
      : areaAcres != null
      ? { raw: `${areaAcres} acres`, value: areaAcres, unit: 'acres' }
      : null,
    lotBlock: {
      lot,
      block,
      subdivision,
      phase: null,
      cabinet: null,
      slide: null,
    },
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : (calls.length > 0 ? 0.75 : 0),
    warnings: [],
    verified: false,
  };

  tracker({
    status: calls.length > 0 ? 'success' : 'partial',
    dataPointsFound: calls.length,
    details: `Plat extraction: ${calls.length} boundary calls, confidence=${result.confidence}`,
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVEN VISION PIPELINE — from Ash Trust sessions (March 4, 2026)
// These lean exports are used by the new pipeline.ts orchestrator.
// They complement (not replace) the extractDocuments() orchestrator above,
// which is still used by reanalysis.ts, ai-deed-analyzer.ts, etc.
// ─────────────────────────────────────────────────────────────────────────────

// DocumentPage is already imported at the top of this file.
// Anthropic SDK is loaded via dynamic import (same as rest of this file).

// Lazy Anthropic client instance — reads ANTHROPIC_API_KEY from env at call time.
let _anthropicClient: any | null = null;
async function getAnthropicClient(): Promise<any> {
  if (!_anthropicClient) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropicClient;
}

// ── System Prompts ─────────────────────────────────────────────────────────

const VISION_OCR_SYSTEM_PROMPT = `You are an OCR specialist for Texas land surveying documents. Extract ALL text from this image with extreme precision. Pay special attention to:

- Degree symbols (°), minute marks ('), second marks (")
- Bearing notation: N 45°30'15" E
- Distance values with decimal precision
- Monument descriptions (iron rod, iron pin, set nail, found)
- Legal description terms (thence, along, to a point, curve)
- Recording references (Volume, Page, Cabinet, Slide, Instrument)
- Owner names, grantor/grantee
- Lot numbers, acreages, subdivision names
- Curve data tables (radius, arc, chord, delta)
- Surveyor name, license number, firm name

Preserve the EXACT formatting of bearings and distances. Do NOT interpret or summarize — extract the raw text as written.

Return ONLY the extracted text, nothing else.`;

const PLAT_QUADRANT_PROMPT_PREFIX = `This is a quadrant of a subdivision plat for a property in Bell County, Texas. Extract EVERY piece of text you can read including: lot numbers, acreages, bearings (N/S degrees minutes seconds E/W), distances in feet, curve data (radius, arc length, chord bearing, chord distance, delta angle), point labels, road names, easement widths, surveyor info, title block text, monument descriptions, line table data, curve table data, and any notes. Be extremely precise with every number and measurement. If text is partially obscured by watermarks, note what you can read and flag uncertainty.`;

/**
 * NEW: Text extraction using lazy-init Anthropic client (no API key parameter).
 * County is used as context in the extraction prompt.
 */
export async function extractFromText(
  text: string,
  county: string,
  logger: PipelineLogger,
): Promise<ExtractedBoundaryData | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  return extractFromTextInternal(text, apiKey, logger, `text-${county || 'unknown'}`);
}

/**
 * NEW: Two-pass Vision OCR extraction (OCR pass → structured extraction pass).
 * Proven working on Ash Trust watermarked deed and plat images.
 */
export async function extractFromImage(
  imageBase64: string,
  imageFormat: string,
  county: string,
  logger: PipelineLogger,
): Promise<{ ocrText: string; data: ExtractedBoundaryData | null }> {
  const ocrAttempt = logger.attempt('3B-OCR', 'anthropic-api', 'CLAUDE_VISION_OCR', `${county}-image`);
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';

  const mediaType: 'image/png' | 'image/jpeg' =
    imageFormat === 'jpg' || imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';

  let ocrText = '';
  try {
    const client = await getAnthropicClient();
    const imgBuffer = Buffer.from(imageBase64, 'base64');
    const resizedBuffer = await resizeIfNeeded(imgBuffer);
    const sendBase64 = resizedBuffer === imgBuffer ? imageBase64 : resizedBuffer.toString('base64');
    const ocrResponse = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8192,
      system: VISION_OCR_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: sendBase64 } },
          { type: 'text', text: `Extract all text from this Texas property document. County: ${county}.` },
        ],
      }],
    });

    ocrText = ocrResponse.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text as string)
      .join('');

    ocrAttempt.success(1, `OCR extracted ${ocrText.length} chars`);
  } catch (err: any) {
    ocrAttempt.fail(err.message);
    return { ocrText: '', data: null };
  }

  if (ocrText.length < 50) {
    return { ocrText, data: null };
  }

  const data = await extractFromTextInternal(ocrText, apiKey, logger, `vision-ocr-${county}`);
  return { ocrText, data };
}

/**
 * NEW: Quadrant-based high-resolution analysis.
 * Splits large plat images (> 4000×6000) into quadrants for better Vision API
 * throughput against watermarked docs. Proven on Ash Trust 7510×11897 plat.
 */
export async function analyzeDocumentQuadrants(
  pages: DocumentPage[],
  county: string,
  documentType: string,
  logger: PipelineLogger,
): Promise<{ ocrTexts: string[]; combinedData: ExtractedBoundaryData | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  const ocrTexts: string[] = [];
  let bestData: ExtractedBoundaryData | null = null;
  let bestConfidence = 0;
  const quadrantLabels = ['TOP-LEFT', 'TOP-RIGHT', 'BOTTOM-LEFT', 'BOTTOM-RIGHT'];

  for (const page of pages) {
    if (page.width > 4000 || page.height > 6000) {
      console.log(`[QUADRANT] Page ${page.pageNumber}: ${page.width}x${page.height} — splitting into quadrants`);

      for (let q = 0; q < 4; q++) {
        const attempt = logger.attempt(
          `3C-Q${q}`, 'anthropic-api', 'CLAUDE_VISION_QUADRANT',
          `Page ${page.pageNumber} ${quadrantLabels[q]}`,
        );

        try {
          const client = await getAnthropicClient();
          const mediaType: 'image/png' | 'image/jpeg' =
            page.imageFormat === 'jpg' ? 'image/jpeg' : 'image/png';
          const focusPrompt = `${PLAT_QUADRANT_PROMPT_PREFIX}\n\nFocus specifically on the ${quadrantLabels[q]} portion of this image. This is page ${page.pageNumber} of a ${documentType} from ${county} County, Texas.`;

          const imgBuf = Buffer.from(page.imageBase64, 'base64');
          const resized = await resizeIfNeeded(imgBuf);
          const sendData = resized === imgBuf ? page.imageBase64 : resized.toString('base64');

          const response = await client.messages.create({
            model: AI_MODEL,
            max_tokens: 8000,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: sendData } },
                { type: 'text', text: focusPrompt },
              ],
            }],
          });

          const text = response.content
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text as string)
            .join('');

          ocrTexts.push(`=== Page ${page.pageNumber} ${quadrantLabels[q]} ===\n${text}`);
          attempt.success(1, `Quadrant OCR: ${text.length} chars`);
        } catch (err: any) {
          attempt.fail(err.message);
        }
      }
    } else {
      // Standard single-pass for smaller images
      const { ocrText, data } = await extractFromImage(
        page.imageBase64, page.imageFormat, county, logger,
      );
      if (ocrText) ocrTexts.push(ocrText);
      if (data && data.confidence > bestConfidence) {
        bestData = data;
        bestConfidence = data.confidence;
      }
    }
  }

  // Combined extraction pass
  if (ocrTexts.length > 1) {
    const combinedText = ocrTexts.join('\n\n');
    console.log(`[QUADRANT] Combined OCR: ${combinedText.length} chars — running final extraction`);
    const data = await extractFromTextInternal(combinedText, apiKey, logger, `quadrant-combined-${county}`);
    if (data && data.confidence > bestConfidence) {
      bestData = data;
    }
  }

  return { ocrTexts, combinedData: bestData };
}

/**
 * Analyze multiple document pages by processing each page individually.
 *
 * Each page image is pre-processed through resizeIfNeeded() (pixel resize +
 * byte-size JPEG compression) before being sent to Claude, so no single
 * API call will exceed the 5 MB per-image limit.  Individual page texts are
 * concatenated and then passed through extractFromTextInternal() for
 * structured extraction.
 */
export async function analyzeMultiPageDocument(
  pages: DocumentPage[],
  county: string,
  prompt: string,
  logger: PipelineLogger,
): Promise<{ text: string; data: ExtractedBoundaryData | null }> {
  const attempt = logger.attempt(
    '3B-MULTI', 'anthropic-api', 'CLAUDE_VISION_MULTI', `${pages.length} pages`,
  );
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';

  if (!pages.length) {
    attempt.fail('No pages provided');
    return { text: '', data: null };
  }

  try {
    const client = await getAnthropicClient();
    const pageTexts: string[] = [];

    for (const page of pages) {
      const imgBuf = Buffer.from(page.imageBase64, 'base64');
      const resized = await resizeIfNeeded(imgBuf);
      const pageBase64 = resized === imgBuf ? page.imageBase64 : resized.toString('base64');
      // Map common format strings to Claude-supported MIME types; default to PNG
      const mediaType: 'image/jpeg' | 'image/png' =
        page.imageFormat === 'jpg' ? 'image/jpeg' : 'image/png';

      try {
        const response = await client.messages.create({
          model: AI_MODEL,
          max_tokens: 8000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: pageBase64 } },
              { type: 'text', text: `[Page ${page.pageNumber}] ${prompt}` },
            ],
          }],
        });

        const pageText = response.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text as string)
          .join('');

        if (pageText) {
          pageTexts.push(`--- PAGE ${page.pageNumber} ---\n${pageText}`);
        }
      } catch (pageErr: any) {
        // Log per-page failure but continue with remaining pages
        logger.warn('3B-MULTI', `Page ${page.pageNumber} extraction failed: ${pageErr.message}`);
      }
    }

    const text = pageTexts.join('\n\n');
    attempt.success(pageTexts.length, `Multi-page extraction: ${text.length} chars from ${pageTexts.length}/${pages.length} pages`);

    const data = await extractFromTextInternal(text, apiKey, logger, `multi-page-${county}`);
    return { text, data };
  } catch (err: any) {
    attempt.fail(err.message);
    return { text: '', data: null };
  }
}
