// lib/research/ocr-quality.ts — an unreadable page must say so (plan R18).
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// `processDocument()` sets `processing_status: 'extracted'` unconditionally. The PDF path's own
// final return carries the comment "could be empty for truly blank PDFs" — and that empty string is
// stored as the document's extracted text, marked extracted, and passed to analysis, which then
// extracts facts from nothing. There is no `unreadable` state anywhere in the pipeline.
//
// `ocr_confidence` is written to the row and read by nothing.
//
// The failure this produces is the quiet kind: a scanned 1940s deed that OCR'd to noise does not
// error. It becomes a document with a little garbage text, no facts, and no explanation — and the
// packet reports the property as having no easements rather than as having a deed nobody could read.
//
// ── WHY THE DIGIT TEST ──────────────────────────────────────────────────────────────────────────
//
// The generic signals (empty, too short, low confidence) miss the worst case: OCR that returns
// plausible-looking prose from an illegible scan. A domain signal catches it. Deeds and plats are
// dense with numbers — bearings, distances, curve data, instrument numbers, volumes, pages, dates.
// A page of a land record with several hundred characters and NO digits at all is not a land record
// that happens to lack numbers; it is OCR output that has lost them.

export type Readability = 'good' | 'partial' | 'unreadable';

export interface OcrAssessment {
  readability: Readability;
  /** Non-whitespace characters per page. The unit that matters — a 40-page deed book with 200 total
   *  characters is unreadable even though 200 sounds like text. */
  charsPerPage: number;
  /** Normalised 0–1, whatever scale the provider reported in. Null when none was reported. */
  confidence: number | null;
  /** Plain sentence for the document row and the review UI. */
  reason: string;
  /** What a person should do. Empty when the extraction is good. */
  nextStep: string;
  /** Signals that fired, for debugging a wrong verdict without re-running the OCR. */
  signals: string[];
}

/** Below this many non-whitespace characters per page, there is not enough text to analyse. A
 *  recorded instrument page is dense — even a short release runs to hundreds of characters. */
export const MIN_CHARS_PER_PAGE = 120;
/** Between the two thresholds the page is `partial`: something came through, but not a page's worth,
 *  so facts drawn from it must be treated as incomplete rather than absent. */
export const PARTIAL_CHARS_PER_PAGE = 400;
/** Provider confidence below this is not usable output. */
export const MIN_CONFIDENCE = 0.5;
/** Above this many characters, a land record with no digits is OCR noise, not a numberless deed. */
const DIGIT_TEST_MIN_CHARS = 250;

/** Providers report confidence as 0–1 or as 0–100 depending on the call. Guessing wrong by a factor
 *  of 100 would either fail every page or pass every page, so both are accepted and normalised. */
export function normaliseConfidence(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw < 0) return null;
  return raw > 1 ? Math.min(raw / 100, 1) : raw;
}

/** Fraction of characters that are letters, digits or ordinary punctuation. OCR failure on a bad
 *  scan produces box-drawing characters, stray diacritics and symbol soup. */
export function legibleRatio(text: string): number {
  const stripped = text.replace(/\s/g, '');
  if (stripped.length === 0) return 0;
  const legible = stripped.match(/[A-Za-z0-9.,;:'"()\-/°′″&$%#*+=[\]{}!?]/g)?.length ?? 0;
  return legible / stripped.length;
}

export interface AssessInput {
  text: string;
  /** Pages the document actually has. Missing means one page — assuming more would inflate the
   *  per-page floor and let a bad extraction pass. */
  pageCount?: number | null;
  confidence?: number | null;
  /** `pdf-parse` output from a text-layer PDF is not OCR and is not subject to the digit test: a
   *  born-digital cover letter legitimately has no numbers. */
  method?: string | null;
  /** Land records get the digit test. A screenshot of a county search page does not. */
  isLandRecord?: boolean;
}

export function assessOcr(input: AssessInput): OcrAssessment {
  const text = input.text ?? '';
  const pages = Math.max(1, input.pageCount ?? 1);
  const nonWhitespace = text.replace(/\s/g, '').length;
  const charsPerPage = Math.round(nonWhitespace / pages);
  const confidence = normaliseConfidence(input.confidence);
  const signals: string[] = [];

  const fail = (reason: string, nextStep: string): OcrAssessment => ({
    readability: 'unreadable', charsPerPage, confidence, reason, nextStep, signals,
  });

  if (nonWhitespace === 0) {
    signals.push('no characters');
    return fail(
      'No text was extracted from this document at all.',
      'Open the page image. If it is legible to a person, the OCR failed and the document should be re-run; if it is blank, remove it.',
    );
  }

  if (charsPerPage < MIN_CHARS_PER_PAGE) {
    signals.push(`${charsPerPage} chars/page < ${MIN_CHARS_PER_PAGE}`);
    return fail(
      `Only ${charsPerPage} characters per page were extracted across ${pages} page(s) — far less than a recorded instrument contains.`,
      'Re-run extraction at higher resolution, or read the page image directly. Do NOT treat the absent content as absent facts.',
    );
  }

  if (confidence != null && confidence < MIN_CONFIDENCE) {
    signals.push(`confidence ${confidence.toFixed(2)} < ${MIN_CONFIDENCE}`);
    return fail(
      `The OCR engine reported ${(confidence * 100).toFixed(0)}% confidence in this page — below the floor for usable output.`,
      'Escalate to vision extraction, or have a person read the page. Values read at this confidence should not be relied on.',
    );
  }

  const legible = legibleRatio(text);
  if (legible < 0.75) {
    signals.push(`legible ratio ${legible.toFixed(2)}`);
    return fail(
      `${Math.round((1 - legible) * 100)}% of the extracted characters are not letters, digits or ordinary punctuation — this is OCR noise, not text.`,
      'Re-scan or re-run at higher resolution. The page image may be skewed, too dark, or a photograph of a screen.',
    );
  }

  // The domain signal. Only for land records, and only past a length where the absence is telling.
  const isOcr = (input.method ?? '').includes('ocr') || (input.method ?? '').includes('vision') || (input.method ?? '').includes('tiled');
  if (input.isLandRecord && isOcr && nonWhitespace >= DIGIT_TEST_MIN_CHARS && !/\d/.test(text)) {
    signals.push('no digits in a land record');
    return fail(
      'This land record contains no digits at all. Deeds and plats are dense with bearings, distances, instrument numbers and dates — their absence means the OCR lost them, not that the document has none.',
      'Re-run with vision extraction. The prose may read plausibly while every measurement on the page is missing.',
    );
  }

  if (charsPerPage < PARTIAL_CHARS_PER_PAGE) {
    signals.push(`${charsPerPage} chars/page < ${PARTIAL_CHARS_PER_PAGE}`);
    return {
      readability: 'partial', charsPerPage, confidence, signals,
      reason: `${charsPerPage} characters per page were extracted — enough to use, but thin for a recorded instrument.`,
      nextStep: 'Treat facts from this document as incomplete rather than complete. Check the page image before concluding something is absent.',
    };
  }

  if (confidence != null && confidence < 0.8) {
    signals.push(`confidence ${confidence.toFixed(2)}`);
    return {
      readability: 'partial', charsPerPage, confidence, signals,
      reason: `Extracted ${charsPerPage} characters per page at ${(confidence * 100).toFixed(0)}% confidence.`,
      nextStep: 'Spot-check the numbers against the page image before relying on them.',
    };
  }

  return {
    readability: 'good', charsPerPage, confidence, signals,
    reason: `Extracted ${charsPerPage} characters per page across ${pages} page(s).`,
    nextStep: '',
  };
}

/** The document row's processing status for an assessment.
 *
 *  `unreadable` is a distinct status rather than `error`: nothing went wrong with the pipeline, and
 *  calling it an error would put it in the retry bucket, where it would fail identically forever. It
 *  needs a person or a better scan, which is a different queue. */
export function statusFor(a: OcrAssessment): 'extracted' | 'unreadable' {
  return a.readability === 'unreadable' ? 'unreadable' : 'extracted';
}

/** Document types where the digit test applies. */
export function isLandRecordType(documentType: string | null | undefined): boolean {
  if (!documentType) return false;
  return [
    'deed', 'plat', 'survey', 'legal_description', 'easement', 'restrictive_covenant',
    'field_notes', 'subdivision_plat', 'metes_and_bounds', 'county_record', 'title_commitment',
  ].includes(documentType);
}
