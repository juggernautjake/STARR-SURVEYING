// worker/src/services/receipt-extraction-core.ts
//
// The parts of receipt extraction that have no infrastructure in them: the prompt, the shape of the
// answer, the parser, the field-merge rules and the duplicate fingerprint.
//
// WHY IT IS ITS OWN FILE
//
// The extraction had exactly one caller — a CLI you run on a droplet — and on Vercel nothing runs
// it, so every receipt uploaded from the website sat at `extraction_status = 'queued'` forever. The
// AI was written, tested, and never reached (owner, 2026-08-11: *"Let's make sure that AI is
// actually fully hooked up to the receipt recording/analysis section."*). Fixing that means the
// Next.js app has to be able to run an extraction too.
//
// It cannot simply import `receipt-extraction.ts`: that file pulls `../infra/usage.js`, which pulls
// `services/pipeline.js`, which is the entire property-research pipeline — Playwright, Browserbase,
// BullMQ. Importing it from a route handler would drag all of that into the web bundle.
//
// The alternative — a second copy of the prompt on the web side — is worse than the bug. Two prompts
// drift, and the drift is invisible: both sides keep returning plausible JSON, and only the numbers
// on the books disagree. So the shared, dependency-free half lives here and both runners import it.
// `receipt-extraction.ts` (worker CLI, batch) and `lib/receipts/extract.ts` (web, on demand) are
// then only two different ways to *reach* one extractor, not two extractors.

// ── Constants ─────────────────────────────────────────────────────────────────

export const RECEIPTS_BUCKET = 'starr-field-receipts';

/** Per plan §5.11.2: Claude Sonnet for receipt extraction.
 *  STARR_FIELD_VISION_MODEL overrides without redeploying. */
export const VISION_MODEL = process.env.STARR_FIELD_VISION_MODEL ?? 'claude-sonnet-4-5-20250929';

/** Cap per single extraction shot — receipts are short, no tool use. Raised from 2048 when the
 *  prompt started asking for line items on grocery-length receipts: a truncated response is not a
 *  partial answer, it is invalid JSON, and it failed the whole extraction. */
export const MAX_TOKENS = 4096;

/** Watchdog window for crashed-worker detection. A row sitting in 'running' longer than this is
 *  considered abandoned and is eligible for re-claim. */
export const STALE_RUNNING_MS = 5 * 60 * 1000;

/** Plan §5.11.2 categories — must stay in sync with mobile RECEIPT_CATEGORIES. */
export const CATEGORIES = [
  'fuel',
  'meals',
  'supplies',
  'equipment',
  'tolls',
  'parking',
  'lodging',
  'professional_services',
  'office_supplies',
  'client_entertainment',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const TAX_FLAGS = ['full', 'partial_50', 'none', 'review'] as const;
export type TaxFlag = (typeof TAX_FLAGS)[number];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractedReceipt {
  vendor_name: string | null;
  vendor_address: string | null;
  vendor_phone: string | null;
  /** ISO-8601 with TZ offset when the photo includes time of day. */
  transaction_at: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  tip_cents: number | null;
  discount_cents: number | null;
  total_cents: number | null;
  currency: string | null;
  payment_method: string | null;
  payment_last4: string | null;
  card_brand: string | null;
  receipt_number: string | null;
  category: Category | null;
  tax_deductible_flag: TaxFlag | null;
  /** One line of plain English on what this purchase was and why it is deductible the way it is. */
  ai_summary: string | null;
  /** Things a bookkeeper should look at: totals that do not add up, an illegible date, a personal
   *  item on a company card. Empty array when the receipt is clean. */
  review_flags: string[];
  line_items: Array<{
    description: string | null;
    amount_cents: number | null;
    quantity: number | null;
  }>;
  /** Free-form per-field 0..1 confidence Claude reports for itself. */
  confidence: Record<string, number>;
}

/** Fields a runner reads back before deciding what to overwrite — see `buildReceiptUpdate`. */
export interface ReceiptCurrentSnapshot {
  vendor_name: string | null;
  vendor_address: string | null;
  transaction_at: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  tip_cents: number | null;
  total_cents: number | null;
  payment_method: string | null;
  payment_last4: string | null;
  category: string | null;
  category_source: string | null;
  tax_deductible_flag: string | null;
  notes: string | null;
}

export interface ExtractionResult {
  receiptId: string;
  status: 'done' | 'failed';
  error?: string;
  costCents?: number;
}

// ── Field merge ───────────────────────────────────────────────────────────────

/**
 * Write `value` into `update[key]` only when the current row already has that field empty (NULL or
 * empty string). Preserves any explicit edits made by the mobile owner or the bookkeeper between
 * 'queued' and 'done'.
 */
export function fillIfEmpty<K extends keyof ReceiptCurrentSnapshot>(
  update: Record<string, unknown>,
  current: Partial<ReceiptCurrentSnapshot>,
  key: K,
  value: ReceiptCurrentSnapshot[K] | null,
): void {
  if (value === null || value === undefined) return;
  const existing = current[key];
  const isEmpty = existing === null || existing === undefined || existing === '';
  if (isEmpty) update[key] = value;
}

/**
 * Build the `receipts` UPDATE for a finished extraction, given what the row holds right now.
 *
 * Pure on purpose: this is the part that decides whether a human's typed correction survives the
 * AI's answer, and that decision is worth being able to test without a database. The rule is
 * fill-if-empty for every ordinary field, and for `category` the stronger rule that a human's choice
 * (`category_source = 'user'`) is never overwritten.
 *
 * The rich fields — summary, flags, phone, brand, receipt number — go into `ai_extras`, a jsonb
 * column, rather than becoming eleven more top-level columns. They are the AI's reading of the
 * receipt, they are not accounting fields, and a bookkeeper edits none of them.
 */
export function buildReceiptUpdate(
  current: Partial<ReceiptCurrentSnapshot>,
  extracted: ExtractedReceipt,
  costCents: number,
  completedAt: string,
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    ai_confidence_per_field: extracted.confidence,
    extraction_status: 'done',
    extraction_completed_at: completedAt,
    extraction_error: null,
    extraction_cost_cents: costCents,
    ai_extras: {
      summary: extracted.ai_summary,
      review_flags: extracted.review_flags,
      vendor_phone: extracted.vendor_phone,
      card_brand: extracted.card_brand,
      receipt_number: extracted.receipt_number,
      discount_cents: extracted.discount_cents,
      currency: extracted.currency,
    },
  };

  fillIfEmpty(update, current, 'vendor_name', extracted.vendor_name);
  fillIfEmpty(update, current, 'vendor_address', extracted.vendor_address);
  fillIfEmpty(update, current, 'transaction_at', extracted.transaction_at);
  fillIfEmpty(update, current, 'subtotal_cents', extracted.subtotal_cents);
  fillIfEmpty(update, current, 'tax_cents', extracted.tax_cents);
  fillIfEmpty(update, current, 'tip_cents', extracted.tip_cents);
  fillIfEmpty(update, current, 'total_cents', extracted.total_cents);
  fillIfEmpty(update, current, 'payment_method', extracted.payment_method);
  fillIfEmpty(update, current, 'payment_last4', extracted.payment_last4);
  fillIfEmpty(update, current, 'tax_deductible_flag', extracted.tax_deductible_flag);

  // Category is special: only fill when no human (mobile owner OR bookkeeper) has touched it.
  // `category_source` tracks who set it.
  if (extracted.category && current.category_source !== 'user') {
    update.category = extracted.category;
    update.category_source = 'ai';
  }

  return update;
}

// ── JSON parsing ──────────────────────────────────────────────────────────────

export function parseExtraction(raw: string): ExtractedReceipt {
  // Strip code fences if Claude added them despite the instruction.
  const jsonText = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `model returned non-JSON: ${(err as Error).message}; first 200 chars: ${jsonText.slice(0, 200)}`,
    );
  }
  if (!isObject(parsed)) {
    throw new Error('model returned non-object JSON');
  }

  return {
    vendor_name: trimOrNull(parsed.vendor_name),
    vendor_address: trimOrNull(parsed.vendor_address),
    vendor_phone: trimOrNull(parsed.vendor_phone),
    transaction_at: normalizeIsoOrNull(parsed.transaction_at),
    subtotal_cents: nonNegIntOrNull(parsed.subtotal_cents),
    tax_cents: nonNegIntOrNull(parsed.tax_cents),
    tip_cents: nonNegIntOrNull(parsed.tip_cents),
    discount_cents: nonNegIntOrNull(parsed.discount_cents),
    total_cents: nonNegIntOrNull(parsed.total_cents),
    currency: trimOrNull(parsed.currency),
    payment_method: trimOrNull(parsed.payment_method),
    payment_last4: digits4OrNull(parsed.payment_last4),
    card_brand: trimOrNull(parsed.card_brand),
    receipt_number: trimOrNull(parsed.receipt_number),
    category: enumOrNull(parsed.category, CATEGORIES),
    tax_deductible_flag: enumOrNull(parsed.tax_deductible_flag, TAX_FLAGS),
    ai_summary: trimOrNull(parsed.ai_summary),
    review_flags: Array.isArray(parsed.review_flags)
      ? parsed.review_flags
          .map((f: unknown) => trimOrNull(f))
          .filter((f): f is string => f !== null)
          .slice(0, 12)
      : [],
    line_items: Array.isArray(parsed.line_items)
      ? parsed.line_items
          .filter((li: unknown): li is Record<string, unknown> => isObject(li))
          .map((li) => ({
            description: trimOrNull(li.description),
            amount_cents: nonNegIntOrNull(li.amount_cents),
            quantity: typeof li.quantity === 'number' ? li.quantity : null,
          }))
      : [],
    confidence: isObject(parsed.confidence) ? (parsed.confidence as Record<string, number>) : {},
  };
}

/**
 * Compute the duplicate-detection fingerprint for a receipt.
 *
 * Format: `{normVendor}|{cents}|{YYYY-MM-DD}` where:
 *   - normVendor: vendor_name lowercased + alphanumeric-only. Strips store numbers, suffixes
 *     ("STORE #1234"), spaces, punctuation. "Lowe's #1234" and "LOWES STORE 1234" both normalise to
 *     "lowes1234" and match.
 *   - cents: total_cents as a plain integer. Exact match required — $4.99 vs $5.00 is two receipts.
 *   - YYYY-MM-DD: extracted from transaction_at via UTC date.
 *
 * Returns null when ANY of the three components is missing — a partial fingerprint would create
 * false matches against other partials.
 */
export function computeDedupFingerprint(
  vendor: string | null,
  totalCents: number | null,
  transactionAt: string | null,
): string | null {
  if (!vendor || totalCents == null || !transactionAt) return null;
  const normVendor = vendor.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normVendor) return null;
  const t = Date.parse(transactionAt);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${normVendor}|${totalCents}|${yyyy}-${mm}-${dd}`;
}

/** Best-guess Vision media type from a storage path. Vision accepts these four only. */
export function mediaTypeForPath(
  storagePath: string,
): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function nonNegIntOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v);
}

function digits4OrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const digits = v.replace(/\D/g, '').slice(-4);
  return digits.length === 4 ? digits : null;
}

function enumOrNull<T extends string>(v: unknown, allowed: ReadonlyArray<T>): T | null {
  if (typeof v !== 'string') return null;
  return allowed.includes(v as T) ? (v as T) : null;
}

function normalizeIsoOrNull(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

// ── Prompt ────────────────────────────────────────────────────────────────────

export const EXTRACTION_PROMPT = `You are a receipt-field extractor for Starr Surveying's bookkeeping pipeline.

The user has uploaded a photo of a paper receipt (gas station, hardware store, restaurant, hotel, etc.). Read it and return ONLY a JSON object with exactly these keys:

{
  "vendor_name":          string | null,    // Business name as printed
  "vendor_address":       string | null,    // Street address line if visible
  "vendor_phone":         string | null,    // Phone number as printed, digits and separators
  "transaction_at":       string | null,    // ISO-8601 if date+time visible (e.g. "2026-04-26T14:35:00-05:00"); date-only if no time ("2026-04-26"); null if illegible
  "subtotal_cents":       int | null,       // Pre-tax pre-tip subtotal in cents
  "tax_cents":            int | null,       // Sales tax in cents
  "tip_cents":            int | null,       // Tip / gratuity in cents (restaurants only; null for retail)
  "discount_cents":       int | null,       // Discounts / coupons applied, as a POSITIVE number of cents
  "total_cents":          int | null,       // Grand total in cents
  "currency":             string | null,    // ISO code, e.g. "USD". Null if not stated and not obviously USD
  "payment_method":       string | null,    // 'card' | 'cash' | 'check' | 'other' or null if unclear
  "payment_last4":        string | null,    // Last 4 of card number, digits only; null if not visible
  "card_brand":           string | null,    // 'visa' | 'mastercard' | 'amex' | 'discover' | other as printed; null if absent
  "receipt_number":       string | null,    // Receipt / invoice / transaction number as printed
  "category":             string | null,    // EXACTLY one of: fuel, meals, supplies, equipment, tolls, parking, lodging, professional_services, office_supplies, client_entertainment, other
  "tax_deductible_flag":  string | null,    // EXACTLY one of: full, partial_50, none, review
  "ai_summary":           string | null,    // ONE plain sentence: what was bought and why the tax treatment is what it is. E.g. "Diesel for the field truck — fully deductible fuel."
  "review_flags":         [string],         // Short phrases a bookkeeper should check. Empty array if the receipt is clean.
  "line_items": [
    { "description": string | null, "amount_cents": int | null, "quantity": number | null }
  ],
  "confidence": {
    "vendor_name":  0..1,
    "total_cents":  0..1,
    "category":     0..1
    // ...one entry per field you populated; omit fields you set to null
  }
}

Rules:
- Currency is USD unless the receipt says otherwise. Convert all dollar amounts to integer cents (e.g. $42.18 → 4218). Round to the nearest cent.
- If a field is illegible, blurry, or genuinely missing from the receipt, return null for it. Do NOT guess.
- Transcribe EVERY line item you can read, in the order printed. This is the part a bookkeeper cannot reconstruct later from the photo alone, so it is worth the tokens. If the receipt has no itemised lines (a fuel pump slip, a toll), return an empty array.
- Category guidelines:
    * fuel              — gas pump, fuel cards
    * meals             — restaurants, take-out, drinks at a counter
    * supplies          — hardware store, paint, lumber, consumable field gear
    * equipment         — durable goods over ~$200 (tools, instruments)
    * tolls             — toll plaza, EZ-Tag
    * parking           — meters, lots, garage
    * lodging           — hotels, motels, Airbnb
    * professional_services — surveyors, lawyers, contractors
    * office_supplies   — paper, ink, office consumables
    * client_entertainment — non-meal client gifts/events
    * other             — fallback when none of the above clearly fit
- tax_deductible_flag guidance (best-effort; bookkeeper has final say):
    * full         — fuel, supplies under $2,500, tolls, parking, lodging
    * partial_50   — meals (IRS 50% rule for 2026)
    * none         — client_entertainment (post-2018), personal items
    * review       — equipment over $2,500 (capitalisation question), anything ambiguous
- review_flags: raise one ONLY when a person needs to act. Good examples: "Subtotal + tax does not equal total", "Date is illegible", "Contains what looks like a personal item (birthday card)", "Handwritten total", "Receipt is for a return/refund, amount may need to be negative". Do NOT flag ordinary receipts — an empty array is the common, correct answer.
- ai_summary is for a human skimming a queue of fifty receipts. One sentence, no preamble, no restating the JSON.
- The "confidence" object: report 0..1 for each populated field. 1.0 = printed and clearly readable; 0.5 = inferred or partial; 0.2 = best-guess. Skip fields you set to null.
- DO NOT wrap your response in markdown code fences. Return raw JSON only.
`;
