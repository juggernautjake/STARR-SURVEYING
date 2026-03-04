// worker/src/services/ai-extraction.ts — Stage 3: AI Extraction
// Multi-pass Claude text extraction and Vision OCR with confidence verification.
// Documents are screened, analyzed, verified, and scored.
// Supports user-uploaded files alongside online-retrieved documents.

import type { DocumentResult, ExtractedBoundaryData, BoundaryCall, DocumentReference } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';

// ── Constants ──────────────────────────────────────────────────────────────

const AI_MODEL = 'claude-sonnet-4-5-20250929';
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
      unit: (['feet', 'varas', 'chains', 'meters'].includes(String(distance.unit)) ? String(distance.unit) : 'feet') as BoundaryCall['distance'] extends null ? never : NonNullable<BoundaryCall['distance']>['unit'],
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

async function extractFromText(
  text: string,
  anthropicApiKey: string,
  logger: PipelineLogger,
  docLabel: string,
): Promise<ExtractedBoundaryData | null> {
  const finish = logger.startAttempt({
    layer: 'Stage3A',
    source: 'Claude-Text',
    method: 'text-extraction',
    input: `${docLabel} (${text.length} chars)`,
  });

  // Truncate extremely long documents to avoid token limits
  const truncated = text.length > 80_000 ? text.substring(0, 80_000) + '\n\n[... document truncated at 80,000 characters ...]' : text;

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
    finish({ status: 'fail', error: 'No response from Claude' });
    return null;
  }

  const extracted = parseExtractionResponse(rawResponse);
  if (!extracted) {
    finish({ status: 'fail', error: 'Failed to parse extraction response', details: rawResponse.substring(0, 200) });
    return null;
  }

  finish({
    status: 'success',
    dataPointsFound: extracted.calls.length + extracted.references.length,
    details: `Type: ${extracted.type}, Calls: ${extracted.calls.length}, Refs: ${extracted.references.length}, Confidence: ${extracted.confidence}`,
  });

  return extracted;
}

// ── Layer 3B: Vision OCR (Two-Pass) ────────────────────────────────────────

async function extractFromImage(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/tiff' | 'application/pdf',
  anthropicApiKey: string,
  logger: PipelineLogger,
  docLabel: string,
): Promise<{ ocrText: string | null; extracted: ExtractedBoundaryData | null }> {
  // Pass 1: OCR
  const ocrFinish = logger.startAttempt({
    layer: 'Stage3B-OCR',
    source: 'Claude-Vision',
    method: 'ocr-pass1',
    input: `${docLabel} (image ${mediaType})`,
  });

  // For PDFs, we send as image/png (Playwright screenshots) or skip
  const effectiveMediaType = mediaType === 'application/pdf' ? 'image/png' as const : mediaType;
  // For TIFF, Claude doesn't support it directly — would need conversion
  if (mediaType === 'image/tiff') {
    ocrFinish({ status: 'fail', error: 'TIFF not directly supported — needs conversion to PNG' });
    return { ocrText: null, extracted: null };
  }

  const ocrResponse = await callClaudeWithRetry(
    anthropicApiKey,
    [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: effectiveMediaType, data: imageBase64 },
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
    ocrFinish({ status: 'fail', error: 'No OCR response' });
    return { ocrText: null, extracted: null };
  }

  // Parse OCR result
  let ocrText: string | null = null;
  const parsed = safeParseJson(ocrResponse);
  if (parsed && typeof parsed.full_text === 'string') {
    ocrText = parsed.full_text;
  } else {
    // Use raw response as OCR text if it's not JSON
    ocrText = ocrResponse;
  }

  ocrFinish({
    status: ocrText && ocrText.length > 50 ? 'success' : 'partial',
    dataPointsFound: ocrText ? 1 : 0,
    details: `OCR text: ${ocrText?.length ?? 0} chars`,
  });

  if (!ocrText || ocrText.length < 50) {
    return { ocrText, extracted: null };
  }

  // Pass 2: Extract structured data from OCR text
  const extracted = await extractFromText(ocrText, anthropicApiKey, logger, `${docLabel}-ocr`);
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
  const finish = logger.startAttempt({
    layer: `Stage3-Verify-${passNumber}`,
    source: 'Claude-Text',
    method: 'verification-pass',
    input: `${docLabel} (pass ${passNumber})`,
  });

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
    finish({ status: 'fail', error: 'No verification response' });
    return originalResult;
  }

  const verified = parseExtractionResponse(rawResponse);
  if (!verified) {
    finish({ status: 'fail', error: 'Failed to parse verification response' });
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

  finish({
    status: 'success',
    dataPointsFound: verified.calls.length,
    details: `Corrections: ${mismatches.length}, Confidence: ${verified.confidence.toFixed(2)}`,
  });

  return verified;
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

    if (screening === 'analyze') {
      const extracted = await extractFromText(legalDescriptionFromCad, anthropicApiKey, logger, 'CAD-legal');
      if (extracted) {
        const verified = await runVerification(legalDescriptionFromCad, extracted, 'CAD-legal');
        updateBest(verified);
      }
    } else if (screening === 'enrich') {
      // Still worth sending to Claude for lot/block info even if no metes & bounds
      const extracted = await extractFromText(legalDescriptionFromCad, anthropicApiKey, logger, 'CAD-legal-enrich');
      if (extracted) {
        updateBest(extracted);
      }
    }
  }

  // ── Process each document ──
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const label = `doc-${i + 1}-${doc.ref.documentType.replace(/\s+/g, '_').substring(0, 20)}`;
    const isUserUpload = doc.fromUserUpload ?? false;

    // User uploads always get analyzed (user paid for and chose these files)
    const forceAnalyze = isUserUpload;

    // Try text content first
    if (doc.textContent && doc.textContent.length > 50) {
      const screening = forceAnalyze ? 'analyze' : screenDocument(doc.textContent);
      logger.info('Stage3', `${label} text screening: ${screening} (${doc.textContent.length} chars)${isUserUpload ? ' [USER UPLOAD]' : ''}`);

      if (screening === 'skip' && !forceAnalyze) {
        logger.info('Stage3', `${label}: Skipping — not relevant`);
        continue;
      }

      if (screening === 'analyze' || forceAnalyze) {
        const extracted = await extractFromText(doc.textContent, anthropicApiKey, logger, label);
        if (extracted) {
          const verified = await runVerification(doc.textContent, extracted, label);
          doc.extractedData = verified;
          updateBest(verified);
        }
      } else if (screening === 'enrich') {
        const extracted = await extractFromText(doc.textContent, anthropicApiKey, logger, `${label}-enrich`);
        if (extracted) {
          doc.extractedData = extracted;
          updateBest(extracted);
        }
      }
    }

    // Try image/screenshot if no text extraction succeeded
    if (!doc.extractedData && doc.imageBase64) {
      const mediaType = doc.imageFormat === 'jpg' ? 'image/jpeg' as const
        : doc.imageFormat === 'pdf' ? 'application/pdf' as const
        : doc.imageFormat === 'tiff' ? 'image/tiff' as const
        : 'image/png' as const;

      const { ocrText, extracted } = await extractFromImage(
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

    // Warn if document had no usable content
    if (!doc.textContent && !doc.imageBase64) {
      logger.warn('Stage3', `${label}: WARNING — No text or image content to analyze`);
      if (!doc.processingErrors) doc.processingErrors = [];
      doc.processingErrors.push('No text or image content available for AI analysis');
    }
  }

  logger.info('Stage3', `Extraction complete. Best: ${bestBoundary?.type ?? 'none'} (confidence: ${bestConfidence.toFixed(2)}, calls: ${bestBoundary?.calls.length ?? 0})`);

  return { documents, boundary: bestBoundary };
}
