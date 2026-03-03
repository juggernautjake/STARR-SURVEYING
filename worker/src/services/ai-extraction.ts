// worker/src/services/ai-extraction.ts — Stage 3: AI Extraction
// Multi-pass Claude text extraction and Vision OCR with confidence verification.
// Documents are screened, analyzed, re-analyzed for confirmation, and scored.
// We prioritize accuracy over speed: multiple passes to confirm results.

import type { DocumentResult, ExtractedBoundaryData, BoundaryCall, DocumentReference } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';

// ── Constants ──────────────────────────────────────────────────────────────

const AI_MODEL = 'claude-sonnet-4-5-20250929';
const REQUEST_TIMEOUT_MS = 180_000; // 3 minutes per AI call
const MAX_RETRIES = 4;
const BASE_RETRY_DELAY_MS = 2_000;
const CONFIDENCE_THRESHOLD_RERUN = 0.80; // Re-run extraction if below this
const MAX_VERIFICATION_PASSES = 3; // Up to 3 verification passes per document

// ── Document Screening Keywords ────────────────────────────────────────────

const PRIMARY_KEYWORDS = [
  'metes', 'bounds', 'thence', 'bearing', 'degrees', 'iron rod', 'iron pin',
  'feet', 'varas', 'curve', 'radius', 'point of beginning', 'pob',
  'minutes', 'seconds', 'north', 'south', 'east', 'west',
];

const SECONDARY_KEYWORDS = [
  'easement', 'deed', 'plat', 'subdivision', 'volume', 'page', 'instrument',
  'grantor', 'grantee', 'tract', 'parcel', 'lot', 'block', 'abstract',
  'survey', 'county', 'conveyed', 'described', 'recorded', 'filed',
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
];

// ── Texas Surveying System Prompt ──────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are an expert Texas Registered Professional Land Surveyor (RPLS) and title examiner with 30+ years of experience analyzing Texas property records. You have deep expertise in:

- Texas metes and bounds legal descriptions (modern and historical)
- Spanish land grants, Republic of Texas patents, Mexican-era surveys
- Texas vara measurements (1 vara = 33⅓ inches = 2.7778 feet)
- Chain measurements (1 chain = 66 feet, 1 rod = 16.5 feet)
- Bearing notation in all formats: N 45°30'15" E, N45-30-15E, N45°30'E
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
4. Decimal degrees for quadrant bearings: NE = degrees as-is, SE = degrees as-is, SW = degrees as-is, NW = degrees as-is. The quadrant tells direction. Decimal degrees is the angle within that quadrant (always 0-90°).
5. For distances, identify the unit. Modern Texas deeds use feet. Historical deeds may use varas, chains, or rods.
6. For curves, extract ALL available data: radius, arc length, chord bearing, chord distance, delta angle, and direction (left/right).
7. Flag any unclear, illegible, or ambiguous text with a warning.
8. Note ALL document references (volume/page, instrument number, plat cabinet/slide, abstract/survey).
9. Set confidence per-call (0.0-1.0). Anything unclear gets < 0.85.
10. Think step by step. Read the entire document before extracting. Identify the description type first, then extract systematically.

RESPONSE FORMAT — Return ONLY valid JSON (no markdown fences, no explanation outside JSON):
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
      "bearing": {
        "raw": "N 45°30'15\\" E",
        "decimalDegrees": 45.504167,
        "quadrant": "NE"
      },
      "distance": {
        "raw": "150.00 feet",
        "value": 150.00,
        "unit": "feet"
      },
      "curve": null,
      "toPoint": "an iron rod found",
      "along": "the south line of Lot 12",
      "confidence": 0.95
    }
  ],
  "references": [
    {
      "type": "deed",
      "volume": "1234",
      "page": "567",
      "instrumentNumber": null,
      "cabinetSlide": null,
      "county": "Bell",
      "description": "source deed"
    }
  ],
  "area": { "raw": "1.234 acres", "value": 1.234, "unit": "acres" },
  "lotBlock": {
    "lot": "21",
    "block": "8",
    "subdivision": "Dawson Ridge",
    "phase": "1",
    "cabinet": "A",
    "slide": "123"
  },
  "confidence": 0.90,
  "warnings": ["unclear text at line 5"]
}`;

// ── OCR System Prompt ──────────────────────────────────────────────────────

const OCR_SYSTEM_PROMPT = `You are an expert document OCR specialist for Texas land surveying records. You will be given an image of a recorded document (deed, plat, survey, field notes).

TASK: Extract ALL text visible in the document with maximum accuracy.

CRITICAL RULES FOR SURVEYING DOCUMENTS:
1. Preserve ALL symbols exactly: ° (degrees), ' (minutes), " (seconds), ½, ¼, ⅓
2. Preserve ALL abbreviations: N, S, E, W, ft, Blk, Lt, Vol, Pg, Inst, Abs
3. For bearing notation, get degree/minute/second symbols exactly right
4. For distances, preserve decimal precision exactly as shown
5. Read handwritten text carefully — old Texas deeds may be handwritten
6. If a character is unclear, use your best reading but mark with [?]
7. Read in natural document order: top to bottom, left to right
8. Capture EVERY piece of text, including headers, footers, stamps, marginalia

RESPONSE FORMAT — Return ONLY valid JSON:
{
  "full_text": "complete extracted text in reading order, with line breaks preserved",
  "regions": [
    {
      "text": "extracted text region",
      "location": "description of where on page",
      "confidence": 95
    }
  ],
  "overall_confidence": 90,
  "document_type_guess": "warranty deed | plat | survey | field notes | other",
  "notes": "any issues, unclear areas, or special observations"
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
  let lastError: unknown = null;

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
        logger.warn('Stage3', `${label}: Empty response from Claude`);
        continue;
      }

      return textBlock.text;
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);

      // Don't retry on non-transient errors
      if (err && typeof err === 'object' && 'status' in err) {
        const status = (err as { status: number }).status;
        if (status === 400 || status === 401 || status === 403) {
          logger.error('Stage3', `${label}: Non-retryable error (${status})`, err);
          return null;
        }
      }

      logger.warn('Stage3', `${label}: Attempt ${attempt + 1} failed: ${errMsg}`);
    }
  }

  logger.error('Stage3', `${label}: All ${MAX_RETRIES + 1} attempts failed`, lastError);
  return null;
}

// ── Document Screening ─────────────────────────────────────────────────────

type ScreeningResult = 'analyze' | 'enrich' | 'skip';

/**
 * Screen a document to decide whether it's worth full AI analysis.
 * Returns 'analyze' for full extraction, 'enrich' for metadata only, 'skip' for irrelevant.
 */
export function screenDocument(text: string): ScreeningResult {
  if (!text || text.length < 50) return 'skip';

  // Check skip patterns
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(text)) return 'skip';
  }

  const lowerText = text.toLowerCase();

  // Count primary keywords (metes & bounds indicators)
  let primaryCount = 0;
  for (const kw of PRIMARY_KEYWORDS) {
    if (lowerText.includes(kw)) primaryCount++;
  }

  // Count secondary keywords (deed/title indicators)
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

// ── Parse Claude Response ──────────────────────────────────────────────────

function parseExtractionResponse(raw: string): ExtractedBoundaryData | null {
  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (!parsed.type || !['metes_and_bounds', 'lot_and_block', 'hybrid', 'reference_only'].includes(parsed.type)) {
      return null;
    }

    // Normalize the response
    const result: ExtractedBoundaryData = {
      type: parsed.type,
      datum: parsed.datum ?? 'unknown',
      pointOfBeginning: {
        description: parsed.pointOfBeginning?.description ?? '',
        referenceMonument: parsed.pointOfBeginning?.referenceMonument ?? null,
      },
      calls: Array.isArray(parsed.calls) ? parsed.calls.map(normalizeCall) : [],
      references: Array.isArray(parsed.references) ? parsed.references.map(normalizeReference) : [],
      area: parsed.area ? {
        raw: parsed.area.raw ?? '',
        value: typeof parsed.area.value === 'number' ? parsed.area.value : null,
        unit: parsed.area.unit ?? 'acres',
      } : null,
      lotBlock: parsed.lotBlock ? {
        lot: parsed.lotBlock.lot ?? '',
        block: parsed.lotBlock.block ?? '',
        subdivision: parsed.lotBlock.subdivision ?? '',
        phase: parsed.lotBlock.phase ?? null,
        cabinet: parsed.lotBlock.cabinet ?? null,
        slide: parsed.lotBlock.slide ?? null,
      } : null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };

    return result;
  } catch {
    return null;
  }
}

function normalizeCall(raw: Record<string, unknown>): BoundaryCall {
  const bearing = raw.bearing as Record<string, unknown> | null;
  const distance = raw.distance as Record<string, unknown> | null;
  const curve = raw.curve as Record<string, unknown> | null;

  return {
    sequence: typeof raw.sequence === 'number' ? raw.sequence : 0,
    bearing: bearing ? {
      raw: String(bearing.raw ?? ''),
      decimalDegrees: typeof bearing.decimalDegrees === 'number' ? bearing.decimalDegrees : 0,
      quadrant: String(bearing.quadrant ?? ''),
    } : null,
    distance: distance ? {
      raw: String(distance.raw ?? ''),
      value: typeof distance.value === 'number' ? distance.value : 0,
      unit: (['feet', 'varas', 'chains', 'meters'].includes(String(distance.unit))
        ? String(distance.unit) : 'feet') as 'feet' | 'varas' | 'chains' | 'meters',
    } : null,
    curve: curve ? {
      radius: {
        raw: String((curve.radius as Record<string, unknown>)?.raw ?? ''),
        value: typeof (curve.radius as Record<string, unknown>)?.value === 'number' ? (curve.radius as Record<string, unknown>).value as number : 0,
      },
      arcLength: curve.arcLength ? {
        raw: String((curve.arcLength as Record<string, unknown>).raw ?? ''),
        value: typeof (curve.arcLength as Record<string, unknown>).value === 'number' ? (curve.arcLength as Record<string, unknown>).value as number : 0,
      } : null,
      chordBearing: curve.chordBearing ? {
        raw: String((curve.chordBearing as Record<string, unknown>).raw ?? ''),
        decimalDegrees: typeof (curve.chordBearing as Record<string, unknown>).decimalDegrees === 'number' ? (curve.chordBearing as Record<string, unknown>).decimalDegrees as number : 0,
      } : null,
      chordDistance: curve.chordDistance ? {
        raw: String((curve.chordDistance as Record<string, unknown>).raw ?? ''),
        value: typeof (curve.chordDistance as Record<string, unknown>).value === 'number' ? (curve.chordDistance as Record<string, unknown>).value as number : 0,
      } : null,
      direction: curve.direction === 'left' ? 'left' : 'right',
      delta: curve.delta ? {
        raw: String((curve.delta as Record<string, unknown>).raw ?? ''),
        decimalDegrees: typeof (curve.delta as Record<string, unknown>).decimalDegrees === 'number' ? (curve.delta as Record<string, unknown>).decimalDegrees as number : 0,
      } : null,
    } : null,
    toPoint: typeof raw.toPoint === 'string' ? raw.toPoint : null,
    along: typeof raw.along === 'string' ? raw.along : null,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
  };
}

function normalizeReference(raw: Record<string, unknown>): DocumentReference {
  return {
    type: (['deed', 'plat', 'easement', 'survey', 'other'].includes(String(raw.type)) ? String(raw.type) : 'other') as DocumentReference['type'],
    volume: typeof raw.volume === 'string' ? raw.volume : null,
    page: typeof raw.page === 'string' ? raw.page : null,
    instrumentNumber: typeof raw.instrumentNumber === 'string' ? raw.instrumentNumber : null,
    cabinetSlide: typeof raw.cabinetSlide === 'string' ? raw.cabinetSlide : null,
    county: typeof raw.county === 'string' ? raw.county : null,
    description: typeof raw.description === 'string' ? raw.description : null,
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

  const userContent = `Analyze the following Texas property document and extract ALL boundary information, legal descriptions, document references, and relevant surveying data.

Think step by step:
1. First, read the entire document to understand its context
2. Identify the type of legal description (metes & bounds, lot & block, hybrid, reference only)
3. Extract the point of beginning if present
4. Extract every boundary call in sequence
5. Extract all document references (volumes, pages, instruments, plat references)
6. Extract area information
7. Extract lot/block/subdivision information
8. Note any unclear or ambiguous text

DOCUMENT TEXT:
---
${text}
---

Return your analysis as the specified JSON format. Think carefully about every bearing and distance.`;

  const rawResponse = await callClaudeWithRetry(
    anthropicApiKey,
    [{ role: 'user', content: userContent }],
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
    finish({ status: 'fail', error: 'Failed to parse extraction response' });
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
  mediaType: 'image/png' | 'image/jpeg',
  anthropicApiKey: string,
  logger: PipelineLogger,
  docLabel: string,
): Promise<{ ocrText: string | null; extracted: ExtractedBoundaryData | null }> {
  // Pass 1: OCR — extract raw text from image
  const ocrFinish = logger.startAttempt({
    layer: 'Stage3B-OCR',
    source: 'Claude-Vision',
    method: 'ocr-pass1',
    input: `${docLabel} (image)`,
  });

  const ocrResponse = await callClaudeWithRetry(
    anthropicApiKey,
    [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          {
            type: 'text',
            text: 'Extract ALL text from this Texas land surveying document. Be extremely thorough — every bearing, distance, monument, and reference matters. Read carefully, especially handwritten portions.',
          },
        ],
      },
    ],
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
  try {
    const cleaned = ocrResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    ocrText = parsed.full_text ?? ocrResponse;
  } catch {
    // If not valid JSON, use raw response as OCR text
    ocrText = ocrResponse;
  }

  ocrFinish({
    status: ocrText ? 'success' : 'fail',
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
 * Re-run extraction on the same document and compare results for consistency.
 * If the second pass disagrees on key fields, merge carefully and flag warnings.
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
    input: `${docLabel} (verification pass ${passNumber})`,
  });

  const verifyPrompt = `You previously analyzed this document and produced the extraction below. Please re-read the document VERY CAREFULLY and verify every single value. Check each bearing's degrees, minutes, and seconds. Check each distance value. Check each monument description. Check each document reference.

If you find ANY errors in the previous extraction, correct them. If everything is correct, confirm it.

PREVIOUS EXTRACTION:
${JSON.stringify(originalResult, null, 2)}

ORIGINAL DOCUMENT TEXT:
---
${text}
---

Return the corrected/confirmed extraction in the same JSON format. If you changed anything, add a warning noting what was corrected.`;

  const rawResponse = await callClaudeWithRetry(
    anthropicApiKey,
    [{ role: 'user', content: verifyPrompt }],
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
    return originalResult;
  }

  // Compare key fields
  const callCountMatch = verified.calls.length === originalResult.calls.length;
  const typeMatch = verified.type === originalResult.type;
  const mismatches: string[] = [];

  if (!callCountMatch) {
    mismatches.push(`Call count: ${originalResult.calls.length} → ${verified.calls.length}`);
  }
  if (!typeMatch) {
    mismatches.push(`Type: ${originalResult.type} → ${verified.type}`);
  }

  // Check individual call bearings/distances
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
        mismatches.push(`Call ${i + 1} distance: ${orig.distance.raw} → ${ver.distance.raw}`);
      }
    }
  }

  if (mismatches.length > 0) {
    logger.warn('Stage3-Verify', `Verification found ${mismatches.length} discrepancies: ${mismatches.join('; ')}`);
    // Use the verified version (more careful second read) with warnings
    verified.warnings = [
      ...verified.warnings,
      `Verification pass ${passNumber} corrected: ${mismatches.join('; ')}`,
    ];
    // Slightly lower confidence due to corrections needed
    verified.confidence = Math.max(0.5, verified.confidence - 0.05 * mismatches.length);
  } else {
    // Confirmed! Boost confidence slightly
    verified.confidence = Math.min(1.0, verified.confidence + 0.03);
    logger.info('Stage3-Verify', `Verification pass ${passNumber} confirmed all values`);
  }

  finish({
    status: 'success',
    dataPointsFound: verified.calls.length,
    details: `Mismatches: ${mismatches.length}, Final confidence: ${verified.confidence.toFixed(2)}`,
  });

  return verified;
}

// ── Main Extraction Function ───────────────────────────────────────────────

/**
 * Process all documents through AI extraction with multi-pass verification.
 * Each document is screened, extracted, verified, and scored.
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

  // First: process CAD legal description if available (highest priority source)
  if (legalDescriptionFromCad && legalDescriptionFromCad.length > 20) {
    const screening = screenDocument(legalDescriptionFromCad);
    logger.info('Stage3', `CAD legal description screening: ${screening}`);

    if (screening === 'analyze') {
      let extracted = await extractFromText(
        legalDescriptionFromCad,
        anthropicApiKey,
        logger,
        'CAD-legal-description',
      );

      if (extracted) {
        // Verification passes for low-confidence results
        let passCount = 0;
        while (extracted.confidence < CONFIDENCE_THRESHOLD_RERUN && passCount < MAX_VERIFICATION_PASSES) {
          passCount++;
          logger.info('Stage3', `CAD legal confidence ${extracted.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD_RERUN}, running verification pass ${passCount}`);
          extracted = await verifyExtraction(
            legalDescriptionFromCad,
            extracted,
            anthropicApiKey,
            logger,
            'CAD-legal-description',
            passCount,
          );
        }

        // Always run at least one verification pass for metes_and_bounds
        if (extracted.type === 'metes_and_bounds' && extracted.calls.length > 0 && passCount === 0) {
          extracted = await verifyExtraction(
            legalDescriptionFromCad,
            extracted,
            anthropicApiKey,
            logger,
            'CAD-legal-description',
            1,
          );
        }

        if (extracted.confidence > bestConfidence) {
          bestBoundary = extracted;
          bestConfidence = extracted.confidence;
        }
      }
    }
  }

  // Process each document
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const label = `doc-${i + 1}-${doc.ref.documentType}`;

    // Try text content first
    if (doc.textContent && doc.textContent.length > 50) {
      const screening = screenDocument(doc.textContent);
      logger.info('Stage3', `${label} text screening: ${screening} (${doc.textContent.length} chars)`);

      if (screening === 'skip') {
        logger.info('Stage3', `${label}: Skipping — not relevant`);
        continue;
      }

      if (screening === 'analyze') {
        let extracted = await extractFromText(doc.textContent, anthropicApiKey, logger, label);

        if (extracted) {
          // Verification loop
          let passCount = 0;
          while (extracted.confidence < CONFIDENCE_THRESHOLD_RERUN && passCount < MAX_VERIFICATION_PASSES) {
            passCount++;
            extracted = await verifyExtraction(doc.textContent, extracted, anthropicApiKey, logger, label, passCount);
          }

          // Mandatory verification for metes_and_bounds with calls
          if (extracted.type === 'metes_and_bounds' && extracted.calls.length > 0 && passCount === 0) {
            extracted = await verifyExtraction(doc.textContent, extracted, anthropicApiKey, logger, label, 1);
          }

          doc.extractedData = extracted;

          if (extracted.confidence > bestConfidence) {
            bestBoundary = extracted;
            bestConfidence = extracted.confidence;
          }
        }
      }
    }
    // Try image/screenshot if no text or text extraction failed
    else if (doc.imageBase64 && !doc.extractedData) {
      const mediaType = doc.imageFormat === 'jpg' ? 'image/jpeg' : 'image/png';

      const { ocrText, extracted } = await extractFromImage(
        doc.imageBase64,
        mediaType as 'image/png' | 'image/jpeg',
        anthropicApiKey,
        logger,
        label,
      );

      doc.ocrText = ocrText;

      if (extracted) {
        // Verification for OCR-sourced data (inherently less reliable)
        let verifiedExtraction = extracted;
        if (ocrText) {
          for (let pass = 1; pass <= Math.min(2, MAX_VERIFICATION_PASSES); pass++) {
            verifiedExtraction = await verifyExtraction(ocrText, verifiedExtraction, anthropicApiKey, logger, label, pass);
          }
        }

        doc.extractedData = verifiedExtraction;

        if (verifiedExtraction.confidence > bestConfidence) {
          bestBoundary = verifiedExtraction;
          bestConfidence = verifiedExtraction.confidence;
        }
      }
    } else {
      logger.warn('Stage3', `${label}: WARNING: No text or image content to analyze`);
    }
  }

  logger.info('Stage3', `Extraction complete. Best boundary: ${bestBoundary?.type ?? 'none'} (confidence: ${bestConfidence.toFixed(2)})`);

  return { documents, boundary: bestBoundary };
}
