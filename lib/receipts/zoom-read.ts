// lib/receipts/zoom-read.ts — how every receipt is read: zoomed in, twice, and checked.
//
// Owner, 2026-10-07: "It really seems like it could be better at reading and understanding the
// structure and contents of different receipts. Not all businesses format their receipts and
// invoices the same … split receipt images/scans into smaller parts and zoom in on the contents,
// always keeping track of which part we are looking at and how it fits with the other images, and
// the full image altogether … make sure our receipt analysis system is as robust as possible so that
// it picks up the details for each receipt every time." And: "We need the analysis to be good every
// time and to get consistent results every time."
//
// ── WHAT WAS WRONG ───────────────────────────────────────────────────────────────────────────────
//
// Every upload got ONE look at the WHOLE photo. The API shrinks a large image before the model sees
// it, so a long receipt arrived at a third of its resolution: "614 E Ave O, Belton" was read as
// "614 E Ave D, Denton" and the vendor as "WELCOME TO DENTON HEB" (corrected by hand, 2026-08-17).
// A better pipeline existed (deep-read.ts) but only behind a button. PDFs were not read at all.
//
// ── WHAT THIS DOES INSTEAD, FOR EVERY RECEIPT ────────────────────────────────────────────────────
//
//   1. PREPARE   straighten (EXIF), crop to the content (the same rule as scanning, lib/scan/trim.ts),
//                then cut the receipt into overlapping horizontal SECTIONS at full resolution
//                (tiling.ts), plus one reduced view of the whole thing for layout. Every section is
//                labelled with where it sits ("section 2 of 4: 22%–58% from the top, overlaps the
//                one above"), so the reader always knows which part it is looking at and how it fits.
//   2. READ ×2   two independent reads of the same receipt: one on the sections as photographed,
//                one on contrast-enhanced sections (faded thermal print reads differently). Both at
//                temperature 0, both with the same instructions. Two reads that agree are far
//                stronger evidence than one confident read; two that disagree say exactly where to
//                look — the one thing a single read can never tell you.
//   3. CHECK     arithmetic in code (items → subtotal; subtotal + tax + tip − discount → total),
//                the date, the card digits.
//   4. SETTLE    any field the reads disagree on, or that fails a check, gets a third look: only
//                the region it lives in, enlarged 4×, with both earlier answers shown, and the model
//                must answer from the pixels. Settled → 'verified'. Still unsure → 'needs_review',
//                which a person must clear before a tax period can be locked.
//
// PDFs (invoices) are read the same way, twice, from the document itself.
//
// Never throws for a bad image: the caller gets a reading or an error string it can store.
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { loadUpright, renderBands, renderLocatorView, renderRegion, type Dimensions } from './render';
import { describeBand, planTiles } from './tiling';
import { tierForModel } from './vision-geometry';
import { trimPlan } from '@/lib/scan/trim';
import { reconcileAmounts } from './reconcile';
import { checkLineItemSum } from './deep-merge';
import { implausibleDateFlag } from './date-sanity';
import {
  EXTRACTION_PROMPT, MAX_TOKENS, parseExtraction, type ExtractedReceipt,
} from '@/worker/src/services/receipt-extraction-core';

/** The model every receipt is read with. Overridable without a deploy. */
export const READ_MODEL = process.env.STARR_RECEIPT_READ_MODEL ?? 'claude-sonnet-5-5';

export type ReadStatus = 'agreed' | 'verified' | 'needs_review';

/** Fields whose disagreement is recorded and settled but never on its own sends a receipt to review:
 *  many receipts print several numbers (order, ticket, transaction) and which is "the" receipt number
 *  is a judgement, not a misreading. 5 of 20 test reads were held for this alone (2026-10-07). */
export const SOFT_FIELDS: ReadonlySet<string> = new Set(['receipt_number']);

/** Fields both reads must agree on — the ones that move money or identify the purchase. */
export const COMPARED_FIELDS = [
  'vendor_name', 'transaction_at', 'subtotal_cents', 'tax_cents', 'tip_cents', 'discount_cents',
  'total_cents', 'payment_last4', 'receipt_number',
] as const;
type ComparedField = (typeof COMPARED_FIELDS)[number];

export interface ReadDetails {
  method: 'zoom-2' | 'pdf-2' | 'single';
  sections: number;
  cropped: boolean;
  /** Fields both reads gave the same value for. */
  agreed: string[];
  /** Fields the reads disagreed on, with both answers and how it was settled. */
  disputes: Array<{ field: string; a: unknown; b: unknown; settled: unknown; certain: boolean }>;
  /** Problems the code checks found, and whether the third look fixed them. */
  checks: Array<{ check: string; ok: boolean; message?: string }>;
  /** Plain sentences for the reviewer. */
  notes: string[];
}

export interface ZoomReadResult {
  extracted: ExtractedReceipt;
  status: ReadStatus;
  details: ReadDetails;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

// ── 1. PREPARE ─────────────────────────────────────────────────────────────────────────────────

interface Views {
  kind: 'image';
  overview: Buffer;
  plain: Buffer[];
  enhanced: Buffer[];
  labels: string[];
  working: Buffer;
  dims: Dimensions;
  cropped: boolean;
}

/** How many sections for a receipt of this shape: one per ~1.4 widths of length, 2–6. */
export function sectionCount(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  return Math.max(2, Math.min(6, Math.round(height / width / 1.4) + 1));
}

/** Crop a photo or scan to the box its content sits in (lib/scan/trim.ts), measured small. */
async function cropToContent(bytes: Buffer, dims: Dimensions): Promise<{ bytes: Buffer; dims: Dimensions; cropped: boolean }> {
  const scale = Math.min(1, 800 / Math.max(dims.width, dims.height));
  const w = Math.max(1, Math.round(dims.width * scale));
  const h = Math.max(1, Math.round(dims.height * scale));
  const gray = await sharp(bytes).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer();
  const rows = new Uint32Array(h);
  const cols = new Uint32Array(w);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (gray[y * w + x] < 160) { rows[y] += 1; cols[x] += 1; }
  const plan = trimPlan(rows, cols, w, h, Math.round(24 * scale) + 2);
  if (!plan) return { bytes, dims, cropped: false };
  const left = Math.max(0, Math.floor(plan.left / scale));
  const top = Math.max(0, Math.floor(plan.top / scale));
  const width = Math.min(dims.width - left, Math.ceil(plan.width / scale));
  const height = Math.min(dims.height - top, Math.ceil(plan.height / scale));
  if (width < 64 || height < 64) return { bytes, dims, cropped: false };
  const out = await sharp(bytes).extract({ left, top, width, height }).png().toBuffer();
  return { bytes: out, dims: { width, height }, cropped: true };
}

async function prepareImage(photo: Buffer, model: string): Promise<Views> {
  const tier = tierForModel(model);
  const upright = await loadUpright(photo);
  const crop = await cropToContent(upright.bytes, upright.dims);
  const plan = planTiles(crop.dims.width, crop.dims.height, { tier, thorough: true, thoroughBands: sectionCount(crop.dims.width, crop.dims.height) });
  const bands = await renderBands(crop.bytes, crop.dims, plan);
  const overview = await renderLocatorView(crop.bytes, crop.dims, tier);
  return {
    kind: 'image',
    overview: await toJpeg(overview.bytes),
    plain: await Promise.all(bands.map((b) => toJpeg(b.plain))),
    enhanced: await Promise.all(bands.map((b) => toJpeg(b.enhanced))),
    labels: plan.bands.map((b) => describeBand(b, plan.bands.length)),
    working: crop.bytes,
    dims: crop.dims,
    cropped: crop.cropped,
  };
}

/**
 * Every image goes to the model as high-quality JPEG. The renderer produces PNG, and a full-resolution
 * PNG strip of a photographed receipt can pass the API's 10 MB-per-image cap (measured 10.6 MB,
 * 2026-10-07) — the request is refused outright. JPEG at q92 keeps every character legible at a
 * fraction of the size; the 32 MB request limit stays far away even with seven images.
 */
async function toJpeg(png: Buffer): Promise<Buffer> {
  return sharp(png).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

const img = (bytes: Buffer): Anthropic.ImageBlockParam => ({
  type: 'image',
  source: { type: 'base64', media_type: 'image/jpeg', data: bytes.toString('base64') },
});

/** How the views are explained to the reader, appended to the extraction instructions. */
export const ZOOM_GUIDE = `
HOW THE RECEIPT IS SHOWN TO YOU
You are given the SAME receipt several ways:
  • VIEW 0 — the whole receipt, reduced. Use it ONLY to understand the layout: where the vendor block,
    the item list, the totals block and the payment block are, and whether there is more than one slip.
  • SECTIONS 1..N — the receipt cut into horizontal strips, top to bottom, at FULL resolution. Each is
    labelled with where it sits. Neighbouring sections OVERLAP, so a line near a cut appears in both —
    count it ONCE. Read every character, every digit and every amount from the SECTIONS, never from
    view 0.
Work in this order, silently: (1) identify the layout from view 0; (2) read each section top to
bottom; (3) join them, dropping the overlap; (4) fill the JSON; (5) check the arithmetic before
answering. Receipts and invoices are formatted every way imaginable — columns may be qty/price/amount
in any order, totals may be labelled "Amount due", "Balance", "Total charged" — decide what each
number IS from its label and position, not from where it usually is.
Also return "transcript": an array of strings, the receipt's lines in order, exactly as printed
(overlaps removed). Include it as an extra key in the JSON object.`;

function contentFor(v: Views, variant: 'plain' | 'enhanced'): Anthropic.ContentBlockParam[] {
  const bands = variant === 'plain' ? v.plain : v.enhanced;
  const blocks: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: 'VIEW 0 — the whole receipt, reduced (layout only):' },
    img(v.overview),
  ];
  bands.forEach((b, i) => {
    blocks.push({ type: 'text', text: `SECTION ${i + 1} of ${bands.length} — ${v.labels[i]}${variant === 'enhanced' ? ' (contrast-enhanced for faded print)' : ''}:` });
    blocks.push(img(b));
  });
  blocks.push({ type: 'text', text: 'Extract the receipt per the JSON schema in your instructions, plus "transcript". Return ONLY the JSON object.' });
  return blocks;
}

function pdfContent(pdf: Buffer, pass: 1 | 2): Anthropic.ContentBlockParam[] {
  return [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } } as Anthropic.ContentBlockParam,
    {
      type: 'text',
      text: pass === 1
        ? 'This is a receipt or invoice as a PDF. Extract it per the JSON schema in your instructions, plus "transcript" (its lines in order). Return ONLY the JSON object.'
        : 'Read this receipt or invoice PDF again from scratch, carefully, line by line, and extract it per the JSON schema, plus "transcript". Return ONLY the JSON object.',
    },
  ];
}

/**
 * Sampling settings. Older models take `temperature: 0` (as deterministic as they get); the Claude 5
 * family rejects the parameter outright ("`temperature` is deprecated for this model", 2026-10-07),
 * so it is sent only where accepted. Consistency does not rest on it either way: it rests on two
 * independent reads having to agree, and a third look settling anything they do not.
 */
export function samplingFor(model: string): { temperature?: number } {
  return /claude-[a-z]+-[1-4]([-.]|$)/.test(model) ? { temperature: 0 } : {};
}

// ── 2. READ ────────────────────────────────────────────────────────────────────────────────────

interface Usage { input: number; output: number }

async function readOnce(client: Anthropic, model: string, content: Anthropic.ContentBlockParam[], usage: Usage): Promise<{ extracted: ExtractedReceipt; transcript: string[] }> {
  const res = await client.messages.create({
    model,
    max_tokens: Math.max(MAX_TOKENS, 8000),
    ...samplingFor(model),
    system: EXTRACTION_PROMPT + '\n' + ZOOM_GUIDE,
    messages: [{ role: 'user', content }],
  });
  usage.input += res.usage.input_tokens;
  usage.output += res.usage.output_tokens;
  const text = res.content.find((c) => c.type === 'text');
  const raw = text && text.type === 'text' ? text.text : '';
  return { extracted: parseExtraction(raw), transcript: transcriptFrom(raw) };
}

function transcriptFrom(raw: string): string[] {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { transcript?: unknown };
    return Array.isArray(parsed.transcript) ? parsed.transcript.filter((l): l is string => typeof l === 'string').slice(0, 400) : [];
  } catch {
    return [];
  }
}

// ── 3. COMPARE AND CHECK (pure) ────────────────────────────────────────────────────────────────

/** Two values of one field, the same for bookkeeping purposes? */
export function sameValue(field: ComparedField, a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (field === 'vendor_name') return norm(String(a)) === norm(String(b));
  if (field === 'transaction_at') return String(a).slice(0, 10) === String(b).slice(0, 10);
  if (field === 'receipt_number' || field === 'payment_last4') return String(a).replace(/\W/g, '') === String(b).replace(/\W/g, '');
  return Number(a) === Number(b);
}

/** A vendor name for comparison: letters only, store numbers and greetings dropped. "Taco Bell
 *  036308" and "Taco Bell" are the same vendor (the two reads differed only so, 2026-10-07). */
const norm = (s: string) => s.toLowerCase()
  .replace(/\b(store|restaurant|rest|location|loc|unit)\b/g, '')
  .replace(/#?\s*\d+/g, '')
  .replace(/[^a-z]/g, '')
  .replace(/^(the|welcometo|welcome)/, '');

/** Fields the two reads disagree on. Pure. */
export function disagreements(a: ExtractedReceipt, b: ExtractedReceipt): ComparedField[] {
  const out: ComparedField[] = COMPARED_FIELDS.filter((f) => !sameValue(f, a[f], b[f]));
  return out;
}

/** The arithmetic and sanity checks, on one reading. Pure apart from `now`. */
export function runChecks(r: ExtractedReceipt, now = new Date()): ReadDetails['checks'] {
  const checks: ReadDetails['checks'] = [];
  if (r.total_cents == null) checks.push({ check: 'total', ok: false, message: 'No total could be read.' });
  const recon = reconcileAmounts({
    subtotal_cents: r.subtotal_cents, tax_cents: r.tax_cents, tip_cents: r.tip_cents,
    discount_cents: r.discount_cents, total_cents: r.total_cents, category: r.category,
  });
  if (recon.outcome === 'mismatch' || recon.outcome === 'spurious_tip') {
    checks.push({ check: 'arithmetic', ok: false, message: recon.flag ?? 'The amounts do not add up to the total.' });
  } else if (recon.outcome !== 'insufficient_data') {
    checks.push({ check: 'arithmetic', ok: true });
  }
  const lineGap = checkLineItemSum(r.line_items, { subtotal_cents: r.subtotal_cents } as never);
  checks.push(lineGap ? { check: 'line items', ok: false, message: lineGap.message } : { check: 'line items', ok: true });
  const dateFlag = implausibleDateFlag(r.transaction_at, now.toISOString());
  if (!r.transaction_at) checks.push({ check: 'date', ok: false, message: 'No date could be read.' });
  else checks.push(dateFlag ? { check: 'date', ok: false, message: dateFlag } : { check: 'date', ok: true });
  if (r.payment_last4 && !/^\d{4}$/.test(r.payment_last4)) checks.push({ check: 'card', ok: false, message: `Card digits "${r.payment_last4}" are not four digits.` });
  return checks;
}

/** Which fields a failed check implicates, for the third look. Pure. */
export function fieldsForChecks(checks: ReadDetails['checks']): ComparedField[] {
  const out = new Set<ComparedField>();
  for (const c of checks) {
    if (c.ok) continue;
    if (c.check === 'total' || c.check === 'arithmetic') ['subtotal_cents', 'tax_cents', 'tip_cents', 'discount_cents', 'total_cents'].forEach((f) => out.add(f as ComparedField));
    if (c.check === 'line items') ['subtotal_cents'].forEach((f) => out.add(f as ComparedField));
    if (c.check === 'date') out.add('transaction_at');
    if (c.check === 'card') out.add('payment_last4');
  }
  return [...out];
}

// ── 4. SETTLE ──────────────────────────────────────────────────────────────────────────────────

const SETTLE_SYSTEM = `You are settling a disagreement about a receipt. Two careful readings of it gave different
answers for some fields, or their figures do not add up. You are shown the receipt again, enlarged,
with nothing else to go on. Read ONLY what is printed. Return ONLY JSON:
{ "values": { "<field>": <value or null> }, "certain": { "<field>": true|false }, "line_items_missed": [{"description": string, "amount_cents": int}], "note": string }
Field formats: *_cents are integer cents; transaction_at is ISO date or date-time; payment_last4 is
exactly four digits; vendor_name as printed (the business, not a greeting like "Welcome to").
Mark a field certain only if you can see every character clearly. If the printed figures genuinely do
not add up (a misprint, an unprinted tip), say so in note rather than forcing them to.`;

async function settle(
  client: Anthropic, model: string, views: Views | null, pdf: Buffer | null,
  fields: ComparedField[], a: ExtractedReceipt, b: ExtractedReceipt, problems: string[], usage: Usage,
): Promise<{ values: Partial<Record<ComparedField, unknown>>; certain: Partial<Record<ComparedField, boolean>>; missed: Array<{ description: string | null; amount_cents: number | null }>; note: string | null }> {
  const blocks: Anthropic.ContentBlockParam[] = [];
  if (pdf) {
    blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } } as Anthropic.ContentBlockParam);
  } else if (views) {
    const tier = tierForModel(model);
    // The money and the date live at the top (header, date) and the bottom (totals, card); the
    // vendor at the top. Show those regions enlarged, plus every enhanced section for context.
    const wantsTop = fields.some((f) => f === 'vendor_name' || f === 'transaction_at' || f === 'receipt_number');
    const wantsBottom = fields.some((f) => /cents|last4|transaction_at|receipt_number/.test(f));
    if (wantsTop) {
      const top = await renderRegion(views.working, views.dims, { top: 0, bottom: 0.35 }, tier);
      if (top) { blocks.push({ type: 'text', text: 'TOP OF THE RECEIPT, enlarged:' }, img(await toJpeg(top.bytes))); }
    }
    if (wantsBottom) {
      const lower = await renderRegion(views.working, views.dims, { top: 0.45, bottom: 1 }, tier);
      if (lower) { blocks.push({ type: 'text', text: 'LOWER PART OF THE RECEIPT (totals and payment), enlarged:' }, img(await toJpeg(lower.bytes))); }
    }
    views.enhanced.forEach((band, i) => {
      blocks.push({ type: 'text', text: `SECTION ${i + 1} of ${views.enhanced.length} — ${views.labels[i]}:` }, img(band));
    });
  }
  const show = (r: ExtractedReceipt) => Object.fromEntries(fields.map((f) => [f, r[f]]));
  blocks.push({
    type: 'text',
    text: `Fields to settle: ${fields.join(', ')}.\nReading A: ${JSON.stringify(show(a))}\nReading B: ${JSON.stringify(show(b))}`
      + (problems.length ? `\nProblems found: ${problems.join(' | ')}` : '')
      + `\nItems read so far (A): ${JSON.stringify(a.line_items.map((l) => [l.description, l.amount_cents]))}`,
  });
  const res = await client.messages.create({ model, max_tokens: 2000, ...samplingFor(model), system: SETTLE_SYSTEM, messages: [{ role: 'user', content: blocks }] });
  usage.input += res.usage.input_tokens;
  usage.output += res.usage.output_tokens;
  const t = res.content.find((c) => c.type === 'text');
  try {
    const raw = t && t.type === 'text' ? t.text : '';
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as {
      values?: Record<string, unknown>; certain?: Record<string, boolean>; line_items_missed?: Array<{ description?: unknown; amount_cents?: unknown }>; note?: unknown;
    };
    return {
      values: j.values ?? {},
      certain: j.certain ?? {},
      missed: (j.line_items_missed ?? []).map((m) => ({ description: typeof m.description === 'string' ? m.description : null, amount_cents: Number.isInteger(m.amount_cents) ? Number(m.amount_cents) : null })).filter((m) => m.amount_cents != null),
      note: typeof j.note === 'string' ? j.note : null,
    };
  } catch {
    return { values: {}, certain: {}, missed: [], note: null };
  }
}

/** Normalise a settled value into the shape the field takes. Pure. */
export function coerce(field: ComparedField, v: unknown): unknown {
  if (v == null || v === '') return null;
  if (field.endsWith('_cents')) { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? n : null; }
  if (field === 'payment_last4') { const d = String(v).replace(/\D/g, ''); return d.length === 4 ? d : null; }
  return String(v).trim() || null;
}

// ── the whole thing ────────────────────────────────────────────────────────────────────────────

export async function zoomRead(photo: Buffer, opts: { isPdf: boolean; apiKey?: string; model?: string }): Promise<ZoomReadResult> {
  const model = opts.model ?? READ_MODEL;
  const client = new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY });
  const usage: Usage = { input: 0, output: 0 };
  const notes: string[] = [];

  let views: Views | null = null;
  let readA: { extracted: ExtractedReceipt; transcript: string[] };
  let readB: { extracted: ExtractedReceipt; transcript: string[] };
  if (opts.isPdf) {
    [readA, readB] = await Promise.all([
      readOnce(client, model, pdfContent(photo, 1), usage),
      readOnce(client, model, pdfContent(photo, 2), usage),
    ]);
  } else {
    views = await prepareImage(photo, model);
    [readA, readB] = await Promise.all([
      readOnce(client, model, contentFor(views, 'plain'), usage),
      readOnce(client, model, contentFor(views, 'enhanced'), usage),
    ]);
  }

  const a = readA.extracted;
  const b = readB.extracted;
  const disputed = disagreements(a, b);
  const agreed = COMPARED_FIELDS.filter((f) => !disputed.includes(f));
  // Start from read A; it saw the receipt as photographed.
  const final: ExtractedReceipt = { ...a, line_items: a.line_items.length >= b.line_items.length ? a.line_items : b.line_items };
  let checks = runChecks(final);
  const toSettle = [...new Set([...disputed, ...fieldsForChecks(checks)])];
  const disputes: ReadDetails['disputes'] = [];
  let allCertain = true;

  if (toSettle.length) {
    const s = await settle(client, model, views, opts.isPdf ? photo : null, toSettle, a, b, checks.filter((c) => !c.ok).map((c) => c.message ?? c.check), usage);
    for (const f of toSettle) {
      const has = Object.prototype.hasOwnProperty.call(s.values, f);
      const settled = has ? coerce(f, s.values[f]) : final[f];
      const certain = s.certain[f] === true;
      if (has) (final as unknown as Record<string, unknown>)[f] = settled;
      if (disputed.includes(f)) disputes.push({ field: f, a: a[f], b: b[f], settled, certain });
      if (!certain && !SOFT_FIELDS.has(f)) allCertain = false;
    }
    if (s.missed.length) {
      final.line_items = [...final.line_items, ...s.missed.map((m) => ({ description: m.description, amount_cents: m.amount_cents, quantity: null, category: null }))];
      notes.push(`${s.missed.length} item${s.missed.length === 1 ? ' was' : 's were'} found on a closer look.`);
    }
    if (s.note) notes.push(s.note);
    checks = runChecks(final);
  }

  const failing = checks.filter((c) => !c.ok);
  const status: ReadStatus = !toSettle.length && !failing.length ? 'agreed'
    : allCertain && !failing.length ? 'verified'
      : 'needs_review';

  if (status === 'needs_review') {
    final.review_flags = [
      ...final.review_flags,
      ...disputes.filter((d) => !d.certain && !SOFT_FIELDS.has(d.field)).map((d) => `Two readings disagreed on ${d.field.replace(/_cents$/, '').replace(/_/g, ' ')} (${fmt(d.a)} vs ${fmt(d.b)}) — check it on the receipt.`),
      ...failing.map((c) => c.message ?? `${c.check} check failed`),
    ];
  }

  return {
    extracted: { ...final, ...{ transcript: readA.transcript.length ? readA.transcript : readB.transcript } } as ExtractedReceipt,
    status,
    details: {
      method: opts.isPdf ? 'pdf-2' : 'zoom-2',
      sections: views?.plain.length ?? 0,
      cropped: views?.cropped ?? false,
      agreed,
      disputes,
      checks,
      notes,
    },
    model,
    inputTokens: usage.input,
    outputTokens: usage.output,
  };
}

function fmt(v: unknown): string {
  if (v == null) return 'nothing';
  if (typeof v === 'number') return `$${(v / 100).toFixed(2)}`;
  return String(v);
}
