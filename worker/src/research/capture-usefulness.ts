/**
 * Is this screenshot worth filing?
 *
 * Owner, 2026-09-21: "A lot of times we are getting back screenshots of pages or websites where
 * nothing was found or it didn't load or something, and those images are useless. It would be cool
 * if the pipeline did a quick AI agent call to review the image and make sure it is useful before
 * posting it."
 *
 * ── THE ORDER IS THE DESIGN ─────────────────────────────────────────────────────────────────────
 *
 * Three gates, cheapest first, and a verdict is returned the moment one of them is certain:
 *
 *   1. **The bytes.** A 4KB PNG is a blank page. A 1×1 is a tracking pixel. These cost nothing to
 *      detect and they are a large share of the useless captures.
 *   2. **The page's own text**, when the caller has it. "No results found", "Access Denied",
 *      "Just a moment", an outdated-browser wall — all of them render as a perfectly valid image
 *      of nothing, and all of them are readable without a model.
 *   3. **A vision call**, and ONLY when the first two are inconclusive.
 *
 * That order matters because the naive version — ask the model about every capture — spends money
 * on the easy cases and is slower than the run that produced them. Job 26144's run captured five
 * images; four could have been judged by their text alone.
 *
 * ── WHAT "USEFUL" MEANS HERE ────────────────────────────────────────────────────────────────────
 *
 * Not "pretty" and not "complete". A capture is useful when a surveyor looking at it later learns
 * something about the property that is not already written down. An aerial with the parcel in it is
 * useful. A county GIS viewer showing the right parcel is useful. A screenshot of "0 results" is
 * not — but the FACT of zero results is, and belongs in the log rather than in a PDF.
 */

export type CaptureVerdict = 'useful' | 'useless' | 'unsure';

export interface UsefulnessCheck {
  verdict: CaptureVerdict;
  /** Which gate decided. Goes in the log so a wrong call can be traced to its rule. */
  decidedBy: 'bytes' | 'text' | 'vision' | 'default';
  /** Plain words. Shown to the operator when a capture is dropped. */
  why: string;
  /** 0-1. Only a vision call produces anything other than 1 or 0. */
  confidence: number;
  /** True when a vision call was spent. */
  usedVision: boolean;
}

const check = (
  verdict: CaptureVerdict, decidedBy: UsefulnessCheck['decidedBy'], why: string,
  confidence = 1, usedVision = false,
): UsefulnessCheck => ({ verdict, decidedBy, why, confidence, usedVision });

// ── GATE 1 · THE BYTES ──────────────────────────────────────────────────────────────────────────

/**
 * Below this, a PNG cannot contain a map, a document or a page of results.
 *
 * Measured against the captures this pipeline actually produces: a real aerial at 0.26 m/px runs to
 * hundreds of kilobytes, and a rendered county GIS sheet at 2880×1800 is larger still. A blank or
 * single-colour page compresses to a few kilobytes because PNG is very good at flat colour — which
 * is exactly why the threshold works.
 */
export const MIN_USEFUL_BYTES = 12_000;

/** A capture smaller than this in either dimension is not a page. */
export const MIN_USEFUL_PIXELS = 200;

export interface CaptureBytes {
  byteLength: number;
  width?: number | null;
  height?: number | null;
}

export function checkBytes(b: CaptureBytes): UsefulnessCheck | null {
  if (b.byteLength <= 0) {
    return check('useless', 'bytes', 'The capture is empty — zero bytes were written.');
  }
  if (b.byteLength < MIN_USEFUL_BYTES) {
    return check('useless', 'bytes',
      `The capture is ${Math.round(b.byteLength / 1024)}KB, below the ${Math.round(MIN_USEFUL_BYTES / 1024)}KB ` +
      'floor. PNG compresses flat colour very well, so a file this small is a blank or single-colour ' +
      'page rather than a map or a document.');
  }
  const w = b.width ?? null;
  const h = b.height ?? null;
  if ((w !== null && w < MIN_USEFUL_PIXELS) || (h !== null && h < MIN_USEFUL_PIXELS)) {
    return check('useless', 'bytes', `The capture is ${w}×${h} — too small to be a page.`);
  }
  return null;
}

// ── GATE 2 · THE PAGE'S OWN WORDS ───────────────────────────────────────────────────────────────

/**
 * Phrases that mean the page rendered fine and contains nothing worth keeping.
 *
 * Deliberately narrow. "Not found" alone would match a page ABOUT a not-found easement, so each
 * pattern is anchored to the shape these messages actually take.
 */
const EMPTY_PAGE = [
  /\bno (search )?results?\s+(were\s+)?(found|match|returned)/i,
  /\b0 (total )?results?\b/i,
  /\bno records? (were )?found/i,
  /\byour search (returned|found|produced) (no|zero)\b/i,
  /\bnothing (was )?found\b/i,
  /\bno documents? (were )?found/i,
  /\bno matching\b/i,
  /\bthere are no\b.*\bto display/i,
];

const BROKEN_PAGE = [
  /\b(404|403|500|502|503)\b.*\b(error|not found|forbidden|unavailable)/i,
  /\bpage (not found|cannot be displayed|isn'?t working)/i,
  /\bserver error\b/i,
  /\bservice unavailable\b/i,
  /\bthis site can'?t be reached\b/i,
  /\berr_(name_not_resolved|connection|tunnel|cert)/i,
  /\byour connection is not private\b/i,
  /\bapplication error\b/i,
  /\ban error has occurred\b/i,
];

const WALL = [
  /outdatedbrowser\.com|update your browser|browser is (out of date|not supported)/i,
  /just a moment|checking your browser|cloudflare|perimeterx|datadome|are you a robot/i,
  /access denied|forbidden|request blocked|unusual traffic/i,
  /enable javascript to (view|continue|run)/i,
];

const LOADING = [
  /^\s*(loading|please wait)\.{0,3}\s*$/i,
  /\bloading\b.*\bplease wait\b/i,
];

/** Signals the page DID render something worth looking at. */
const SUBSTANTIVE = [
  /\bgrantor\b/i, /\bgrantee\b/i, /\blegal description\b/i, /\bacres?\b/i,
  /\bsubdivision\b/i, /\babstract\b/i, /\bplat\b/i, /\bsurvey\b/i, /\blot \d/i, /\bblock \d/i,
  /\binstrument\b/i, /\bvolume\b/i, /\brecorded\b/i, /\bowner\b/i, /\bparcel\b/i,
  /\btotal results\b/i, /\bappraised\b/i, /\bmarket value\b/i,
];

export function checkText(pageText: string | null | undefined): UsefulnessCheck | null {
  const t = String(pageText ?? '').trim();
  if (!t) return null;

  // ── THE NEGATIVE PATTERNS RUN AT ANY LENGTH ─────────────────────────────────────────────────
  //
  // A length guard used to sit here, to stop an aerial photograph — which legitimately carries
  // almost no text — being judged useless for having nothing to read. It was too blunt: "No
  // records found" is sixteen characters and completely decisive, and the guard was swallowing it.
  //
  // The distinction is not how MUCH text there is, it is whether the text SAYS something. So the
  // refusal and empty-result patterns run against any length, and the length guard moved down to
  // the positive check, where it belongs — a short string is not enough to conclude a page is
  // useful, but it can be more than enough to conclude it is not.
  for (const re of WALL) {
    if (re.test(t)) {
      return check('useless', 'text',
        'The page is a bot wall or an access refusal, not the county\'s content. Filing this would ' +
        'put a picture of our own blocked request into a survey report.');
    }
  }
  for (const re of BROKEN_PAGE) {
    if (re.test(t)) {
      return check('useless', 'text', 'The page is an error page — the site did not serve content.');
    }
  }
  for (const re of LOADING) {
    if (re.test(t)) {
      return check('useless', 'text',
        'The capture was taken before the page finished loading. Retry with a longer wait rather ' +
        'than filing a picture of a spinner.');
    }
  }
  for (const re of EMPTY_PAGE) {
    if (re.test(t)) {
      return check('useless', 'text',
        'The search ran and matched nothing. That is a real finding and belongs in the run log — ' +
        'but a screenshot of an empty result table tells a reader nothing the log does not.');
    }
  }

  // The guard, in its right place: too little text to conclude a page is USEFUL. An aerial's
  // "Esri, Maxar" attribution lands here and returns null — no verdict — rather than either
  // verdict, which is the honest answer for an image whose value is not in its words.
  if (t.length < 40) return null;

  const hits = SUBSTANTIVE.filter((re) => re.test(t)).length;
  if (hits >= 2) {
    return check('useful', 'text',
      `The page carries ${hits} kinds of property content — names, legal description, measurements ` +
      'or recording references.');
  }

  return null;
}

// ── GATE 3 · THE VISION CALL ────────────────────────────────────────────────────────────────────

export interface VisionJudge {
  /**
   * Answer, for one image, whether a surveyor would learn anything from it.
   *
   * Injected rather than imported so this module stays testable without a key, and so the pipeline
   * can decline to provide one — in which case the gate is skipped and the verdict stays `unsure`,
   * which the caller resolves with its own default.
   */
  (input: { imageBase64: string; mimeType: string; context: string }):
    Promise<{ useful: boolean; why: string; confidence: number } | null>;
}

/**
 * The prompt.
 *
 * Exported because it is the part most likely to need tuning against real captures, and because a
 * prompt buried in a function body never gets reviewed.
 *
 * It asks for a decision and a REASON, and it names the specific failures this pipeline produces —
 * a model told only "is this useful?" will call a well-rendered error page useful, because it is a
 * clear screenshot of something.
 */
export const VISION_PROMPT = [
  'You are checking whether a screenshot captured during a property-research run is worth keeping',
  'in a land surveyor\'s file.',
  '',
  'KEEP it when it shows something a surveyor would learn from: an aerial or satellite view of a',
  'property, a county GIS or parcel map, a plat or survey drawing, a recorded document, an',
  'appraisal record, or a table of search results with actual rows in it.',
  '',
  'DISCARD it when it shows: an empty result set, an error or "page not found", a login or',
  'disclaimer prompt, a bot check or "update your browser" wall, a page still loading, a blank or',
  'mostly-blank page, a cookie banner over nothing, or a map that failed to render its tiles.',
  '',
  'A screenshot can be sharp, well-framed and still worthless. Judge the CONTENT, not the quality.',
  '',
  'Answer as JSON only: {"useful": true|false, "why": "<one sentence>", "confidence": 0.0-1.0}',
].join('\n');

export interface UsefulnessInput {
  bytes: CaptureBytes;
  /** The rendered text, when the caller has it. Free and decides most cases. */
  pageText?: string | null;
  /** Base64 image, for the vision gate. */
  imageBase64?: string | null;
  mimeType?: string;
  /** What this capture was meant to be — "Aerial — subject parcel". Given to the model. */
  label?: string;
  judge?: VisionJudge;
  /**
   * What to do when nothing decided. Defaults to KEEPING the capture: a wrongly-dropped aerial is
   * worse than a wrongly-kept one, because the operator can ignore a bad image and cannot recover
   * one that was never filed.
   */
  whenUnsure?: 'keep' | 'drop';
}

/**
 * Decide whether to file a capture.
 *
 * Returns as soon as a gate is certain, so the vision call is made only for captures that the free
 * checks could not settle.
 */
export async function assessCapture(input: UsefulnessInput): Promise<UsefulnessCheck> {
  const byBytes = checkBytes(input.bytes);
  if (byBytes) return byBytes;

  const byText = checkText(input.pageText);
  if (byText) return byText;

  if (input.judge && input.imageBase64) {
    try {
      const v = await input.judge({
        imageBase64: input.imageBase64,
        mimeType: input.mimeType ?? 'image/png',
        context: input.label
          ? `This capture was taken as: ${input.label}`
          : 'This capture was taken during a property research run.',
      });
      if (v) {
        return check(v.useful ? 'useful' : 'useless', 'vision', v.why, v.confidence, true);
      }
    } catch {
      // A failed vision call must not lose a capture. Fall through to the default.
    }
  }

  const keep = (input.whenUnsure ?? 'keep') === 'keep';
  return check(
    keep ? 'useful' : 'useless', 'default',
    keep
      ? 'Nothing decided this either way, so it is kept — a wrongly-dropped aerial cannot be ' +
        'recovered, and a wrongly-kept one can be ignored.'
      : 'Nothing decided this either way and the caller asked to drop on doubt.',
    0.5,
  );
}

/** One line for the run log, in the shape the other capture lines take. */
export function usefulnessLine(label: string, c: UsefulnessCheck): string {
  const head = c.verdict === 'useful' ? 'filed' : 'not filed';
  const how = c.decidedBy === 'vision' ? ` (vision, ${c.confidence.toFixed(2)})` : ` (${c.decidedBy})`;
  return `${label} — ${head}${how}: ${c.why}`;
}
