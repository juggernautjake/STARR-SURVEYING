// lib/receipts/deep-read.ts — read one receipt properly, in stages, and say what disagrees.
//
// Owner, 2026-08-18: *"I want it so that the AI determines what in the image is the actual receipt
// and what is the background, then it should crop the image to just the receipt, then it should
// break the receipt down into smaller sections, then it should thoroughly analyze each section,
// then it should tie all of the info together, research everything, and then sit and think for a bit
// to make sure it gets everything right."*
//
// That is exactly the shape below. Nine stages:
//
//   1  LOCATE      find the paper in the photo, and how far it is rotated
//   2  CROP        cut away the background — on the sample receipts this is over half the frame
//   3  TILE        split into overlapping bands, each enlarged to fill the model's budget
//   4  TRANSCRIBE  read each band verbatim, twice over (as photographed + contrast-stretched)
//   5  ASSEMBLE    stitch the bands into one transcript, without duplicating the overlaps
//   6  EXTRACT     structured fields, grounded on the transcript rather than on raw pixels
//   7  VERIFY      re-read the totals, the card line and the date in isolation, enlarged
//   8  RESEARCH    does the vendor exist at that address; are the items plausible for that merchant
//   9  DELIBERATE  weigh every source with extended thinking, and resolve the conflicts
//
// ── ON "IT SHOULD TAKE AT LEAST TWO MINUTES" ────────────────────────────────────────────────────
//
// It does — around a dozen model calls, mostly sequential, land between ninety seconds and three
// minutes. But the time is a CONSEQUENCE and never a target, and there is no sleep anywhere in this
// file. Padding a fast wrong answer out to two minutes would produce exactly the same wrong answer,
// and a pipeline that hits a duration target by waiting is lying about how hard it looked.
// What actually buys accuracy is the number of independent looks, and that is what is dialled up.
//
// ── NOTHING HERE IS ALLOWED TO THROW ────────────────────────────────────────────────────────────
//
// Every stage degrades. A failed locate means read the whole photo; a failed band means the others
// still assemble; a failed lookup means no external opinion. Losing a whole extraction because one
// of nine stages had a bad minute would be a worse product than a slightly thinner answer.

import Anthropic from '@anthropic-ai/sdk';

import {
  assembleTranscript, checkDateSanity, checkLineItemSum, compareReadings, sortDiscrepancies,
  summariseDiscrepancies, type BandTranscript, type Discrepancy,
} from './deep-merge';
import {
  cropToBox, loadUpright, renderBands, renderLocatorView, renderRegion, rotateBy,
  type Dimensions,
} from './render';
import { describeBand, planTiles } from './tiling';
import { mapBoxToOriginal, tierForModel, type Box } from './vision-geometry';
import { verifyVendor, type VendorVerification } from './vendor-verify';
import { checkNoteAgainstReading, noteBriefingFor, parseNoteHints } from './user-notes';

/** Overridable so a better vision model can be adopted without a redeploy — and so the resolution
 *  tier follows the model automatically, via `tierForModel`. */
export const DEEP_MODEL = process.env.STARR_RECEIPT_DEEP_MODEL ?? 'claude-sonnet-4-5-20250929';

/** How many band reads run at once. Small on purpose: the bands are the bulk of the work, and firing
 *  ten vision calls together is how a batch turns into a rate-limit wall and marks good receipts
 *  failed. Three keeps the wall-clock sane without the cliff. */
const BAND_CONCURRENCY = 3;

export interface DeepStage {
  name: string;
  ms: number;
  ok: boolean;
  detail?: string;
}

export interface DeepReadResult {
  /** The structured reading, in the same shape the existing extractor returns. */
  fields: Record<string, unknown>;
  /** Every line the readers saw, stitched. The evidence behind the fields — a person can read this
   *  and see what the machine actually had in front of it. */
  transcript: string[];
  discrepancies: Discrepancy[];
  /** One line for the top of the review panel, or null when there is nothing to say. */
  summary: string | null;
  vendorCheck?: VendorVerification;
  /** What the person's note confirmed, for the summary. Empty when they wrote nothing checkable. */
  noteConfirmations: string[];
  stages: DeepStage[];
  inputTokens: number;
  outputTokens: number;
  /** What the crop decided, for the audit trail and for showing the operator a box on the photo. */
  crop?: { applied: Box; wholeFrame: boolean; note?: string };
  bandCount: number;
  totalMs: number;
}

interface Ctx {
  client: Anthropic;
  inputTokens: number;
  outputTokens: number;
  stages: DeepStage[];
}

function jsonFrom(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Models occasionally wrap or prefix. Take the outermost balanced object rather than giving up —
    // a whole stage discarded over a stray sentence is an expensive way to be strict.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch { /* fall through */ }
    }
    return null;
  }
}

async function call(
  ctx: Ctx,
  opts: {
    system: string;
    content: Anthropic.MessageParam['content'];
    maxTokens?: number;
    thinkingBudget?: number;
  },
): Promise<string> {
  const body: Anthropic.MessageCreateParams = {
    model: DEEP_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: 'user', content: opts.content }],
  };

  if (opts.thinkingBudget) {
    // Extended thinking IS the "sit and think for a bit" stage. `temperature` must be left at its
    // default when thinking is on, so it is simply not set here.
    body.thinking = { type: 'enabled', budget_tokens: opts.thinkingBudget };
    body.max_tokens = Math.max(opts.maxTokens ?? 4096, opts.thinkingBudget + 4096);
  } else {
    body.temperature = 0;
  }

  const res = await ctx.client.messages.create(body);
  ctx.inputTokens += res.usage.input_tokens;
  ctx.outputTokens += res.usage.output_tokens;
  const text = res.content.find((c) => c.type === 'text');
  return text && text.type === 'text' ? text.text : '';
}

function imageBlock(bytes: Buffer): Anthropic.ImageBlockParam {
  return { type: 'image', source: { type: 'base64', media_type: 'image/png', data: bytes.toString('base64') } };
}

/** Run a stage, time it, and never let it take the pipeline down with it. */
async function stage<T>(ctx: Ctx, name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    ctx.stages.push({ name, ms: Date.now() - t0, ok: true });
    return out;
  } catch (err) {
    ctx.stages.push({
      name,
      ms: Date.now() - t0,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

// ── Stage 1: where is the receipt? ──────────────────────────────────────────────────────────────

const LOCATE_SYSTEM = `You are looking at a photograph that contains a paper receipt somewhere in it.

Your ONLY job is to say where the receipt is. Do not read it.

Return ONLY this JSON:
{
  "found": true | false,
  "box": [x1, y1, x2, y2],
  "rotation_degrees": number,
  "sheets": 1 | 2,
  "note": string
}

- "box" is in ABSOLUTE PIXEL COORDINATES of the image you were given: top-left and bottom-right
  corners, origin at the top-left, x to the right, y downward.
- Include the WHOLE piece of paper — every edge, from the torn top to the bottom. It is much better
  to include a little background than to clip a single line of print off an edge. If in doubt, go
  wider.
- "rotation_degrees": how far the receipt is rotated from upright, positive = clockwise. 0 if it is
  already straight. Only report an angle you are confident about; report 0 if unsure.
- "sheets": 2 if there are clearly TWO separate slips in the photo (restaurants often print an
  itemised bill and a card slip). Otherwise 1. If there are two, box BOTH of them together.
- "found": false only if there is genuinely no receipt visible. Then "box" is ignored.
- "note": one short phrase about anything odd — "receipt is curled", "bottom is cut off by the frame",
  "heavy glare across the middle".

Return raw JSON. No prose, no code fences.`;

interface LocateResult {
  found: boolean;
  box?: [number, number, number, number];
  rotation_degrees?: number;
  sheets?: number;
  note?: string;
}

// ── Stage 4: read one band, verbatim ────────────────────────────────────────────────────────────

const BAND_SYSTEM = `You are transcribing part of a paper receipt. Transcribe, do not interpret.

You are given the SAME strip of the receipt twice:
  Image 1 — as photographed.
  Image 2 — the same strip, greyscaled and contrast-stretched to bring out faded thermal ink.

Read both. They are the same paper, so where they disagree, a character is genuinely ambiguous —
that is information, and you must report it rather than quietly picking one.

Return ONLY this JSON:
{
  "lines": [string],
  "uncertain": [ { "text": string, "why": string, "alternatives": [string] } ],
  "ink": "good" | "fair" | "poor"
}

- "lines": every line of print in this strip, top to bottom, EXACTLY as printed. Keep the original
  spelling even when it is obviously a misprint or an OCR-looking mangling — this is a transcript,
  not a correction. Keep amounts exactly as written, including the currency symbol if present.
- Include everything: header, address, phone, item lines, subtotal, tax, total, card line, footer,
  survey blurb, store numbers. If a line is partly illegible, transcribe what you can and put "?" for
  each character you cannot make out.
- Do NOT invent lines. If the strip is blank or is background rather than paper, return an empty
  array.
- "uncertain": every place where the two images disagree, OR where a character could plausibly be a
  different character. Faded thermal print drops strokes systematically: 8 reads as 3, 6 or 0; 6 and
  5 read as 8; 0 reads as 8 or D; 1 and 7 swap; 9 reads as 4 or 0. A DROPPED digit shortens a number
  without leaving a gap. List the alternatives you considered.
- Digits matter more than words here. A wrong letter in a footer costs nothing; a wrong digit in an
  amount or a card number costs money.
- "ink": how well this strip is printed.

Return raw JSON. No prose, no code fences.`;

interface BandRead {
  lines?: string[];
  uncertain?: { text?: string; why?: string; alternatives?: string[] }[];
  ink?: string;
}

// ── Stage 7: targeted re-reads ──────────────────────────────────────────────────────────────────

const REGION_SYSTEM = `You are shown ONE small region of a receipt, enlarged. Read the figures on it.

You have no other context and you do not need any. Do not guess at anything outside this crop.

Return ONLY this JSON, omitting any key whose value is not visible in THIS crop:
{
  "total_cents": int,
  "subtotal_cents": int,
  "tax_cents": int,
  "tip_cents": int,
  "change_cents": int,
  "amount_tendered_cents": int,
  "payment_last4": string,
  "card_brand": string,
  "transaction_at": string,
  "confidence": { "<field>": 0..1 },
  "reading_notes": string
}

- All money in integer CENTS. $20.98 is 2098.
- Read the digits that are actually there. If a digit is ambiguous, pick the most likely, give that
  field a confidence below 0.8, and say why in reading_notes.
- If a figure is not in this crop, omit the key entirely. Do not carry over what you would expect.

- **ONLY report a figure that is LABELLED as that figure.** A crop of the bottom of a receipt
  contains several amounts that are not the total, and the total is not simply the last one.
  In particular:
    * "Change", "Change Due" and "Cash Back" are money handed BACK to the customer. That is
      \`change_cents\`. It is NEVER the total. A receipt whose total is $20.98 can perfectly well end
      with "Change: $0.02", and reporting two cents as the total is the single most damaging mistake
      you can make in this crop.
    * "Cash", "Tendered", "Amount Tendered" is what the customer handed over — \`amount_tendered_cents\`,
      also not the total.
    * The total is the line labelled "Total", "Total Due", "Amount Due", "Balance Due" or the amount
      authorised on a card slip.
  If you cannot see a line explicitly labelled as the total, OMIT \`total_cents\` rather than
  promoting the nearest number to it. An omission is read as "not visible here" and costs nothing; a
  guess is compared against the other readings and raises a false alarm on a correct receipt.

Return raw JSON. No prose, no code fences.`;

// ── Stage 9: deliberate ─────────────────────────────────────────────────────────────────────────

const DELIBERATE_SYSTEM = `You are the final reviewer of a receipt that has been read several
independent ways. Your job is to decide what the receipt ACTUALLY says, and to be honest about what
is still uncertain.

You are given:
  - the full transcript, stitched from overlapping strips read at high magnification;
  - a structured reading taken from that transcript;
  - separate close-up re-readings of the totals, the card line and the date, each read in isolation;
  - the result of looking the business up at the address printed on the receipt;
  - a list of places the automatic checks already found a conflict.

Think it through carefully before answering. In particular:

1. ARITHMETIC. subtotal + tax + service_charge + tip − discount = total. Work it out. If it does not
   balance, decide which figure was misread rather than leaving two numbers that contradict.
   An unprinted tip on a restaurant slip is the usual explanation for a total larger than the items;
   a gap on a fuel or hardware receipt is a misread, not a tip.
2. THE ITEMS SHOULD SUM TO THE SUBTOTAL. If they fall short, an item was probably missed — say so.
3. WHERE THE CLOSE-UP DISAGREES WITH THE WHOLE-RECEIPT READING, PREFER THE CLOSE-UP for that figure.
   It was read at much higher magnification with nothing else in frame. But if the close-up's answer
   breaks the arithmetic and the other does not, say so and flag it instead of forcing it.
4. THE ITEMS SHOULD SUIT THE MERCHANT. You know what kind of place this is. If an item name is close
   to something that merchant plainly sells, the transcript is probably a mangling of it — record the
   likely intended name in "items_probably_misread", and LEAVE the transcript's spelling in the line
   item itself. Do not rename an item you are merely guessing at, and do not invent a menu.
5. DO NOT TIDY. If the paper says something odd, report it odd and flag it. A cleaned-up guess with
   no flag is the single outcome that costs somebody real money, because it is indistinguishable from
   a correct reading.

Return ONLY this JSON:
{
  "vendor_name": string|null, "vendor_address": string|null, "vendor_phone": string|null,
  "transaction_at": string|null,
  "subtotal_cents": int|null, "tax_cents": int|null, "tip_cents": int|null,
  "service_charge_cents": int|null, "discount_cents": int|null, "total_cents": int|null,
  "currency": string|null, "payment_method": string|null, "payment_last4": string|null,
  "card_brand": string|null, "card_holder_name": string|null, "receipt_number": string|null,
  "category": string|null, "tax_deductible_flag": string|null, "ai_summary": string|null,
  "review_flags": [string],
  "line_items": [ { "description": string|null, "amount_cents": int|null, "quantity": number|null } ],
  "confidence": { "<field>": 0..1 },
  "legibility": { "quality": "good"|"fair"|"poor", "issues": [string], "fields_to_verify": [string] },
  "items_probably_misread": [ { "as_printed": string, "likely": string, "why": string } ],
  "resolved": [ { "field": string, "chose": string, "over": string, "because": string } ],
  "still_uncertain": [ { "field": string, "why": string } ]
}

"category" is exactly one of: fuel, meals, supplies, equipment, tolls, parking, lodging,
professional_services, office_supplies, client_entertainment, other.
"tax_deductible_flag" is exactly one of: full, partial_50, none, review.

Return raw JSON. No prose, no code fences.`;

export interface DeepReadOptions {
  /** Bands to aim for. More bands = more magnification per band and more calls. */
  bands?: number;
  /** Thinking budget for the final deliberation. */
  thinkingBudget?: number;
  /** Skip the outside lookup (used by tests and by offline runs). */
  skipResearch?: boolean;
  /**
   * What the person who photographed the receipt wrote about it.
   *
   * Owner, 2026-08-18: *"if the user writes anything in the notes, the AI takes that into
   * account."* On a 480×640 photo this is regularly the ONLY source that can settle a digit — see
   * `user-notes.ts` for the Guy's Quick Stop case, where two independent readings AND the
   * arithmetic all agreed on the wrong number.
   */
  userNote?: string | null;
  signal?: AbortSignal;
}

/**
 * Read one receipt image, thoroughly.
 *
 * Takes the raw bytes so it can be driven from a route, a script or a test without a database.
 */
export async function deepReadReceipt(
  original: Buffer,
  options: DeepReadOptions = {},
): Promise<DeepReadResult> {
  const startedAt = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set — deep receipt reading cannot run.');

  const ctx: Ctx = {
    client: new Anthropic({ apiKey }),
    inputTokens: 0,
    outputTokens: 0,
    stages: [],
  };
  const tier = tierForModel(DEEP_MODEL);

  // Parsed once, used three times: in the two prompts that reason, and in the deterministic check
  // afterwards. Parsing is pure and cheap; re-deriving it per use is how the prompt and the check
  // end up disagreeing about what the person wrote.
  const noteHints = parseNoteHints(options.userNote);
  const noteBriefing = noteBriefingFor(options.userNote, noteHints);

  // ── 1. Upright, then locate ──────────────────────────────────────────────────────────────────
  const upright = await loadUpright(original);
  let working = upright.bytes;
  let dims: Dimensions = upright.dims;

  const located = await stage<LocateResult | null>(ctx, 'locate', async () => {
    const view = await renderLocatorView(working, dims, tier);
    const text = await call(ctx, {
      system: LOCATE_SYSTEM,
      maxTokens: 1024,
      content: [
        imageBlock(view.bytes),
        { type: 'text', text: `This image is ${view.dims.width} pixels wide and ${view.dims.height} tall. Give the box in those pixel coordinates.` },
      ],
    });
    return jsonFrom(text) as LocateResult | null;
  }, null);

  let crop: DeepReadResult['crop'] = { applied: { x1: 0, y1: 0, x2: dims.width, y2: dims.height }, wholeFrame: true };

  // ── 2. Crop, and straighten ──────────────────────────────────────────────────────────────────
  if (located?.found && Array.isArray(located.box) && located.box.length === 4) {
    await stage(ctx, 'crop', async () => {
      const [x1, y1, x2, y2] = located.box as [number, number, number, number];
      // The locator answered in the coordinate space of the image IT saw. Mapping back is not
      // optional — on a photo Claude resized, using the raw numbers cuts the wrong rectangle, and
      // the error is largest on exactly the tall receipt photos that most need cropping.
      const box = mapBoxToOriginal({ x1, y1, x2, y2 }, dims.width, dims.height, tier);
      const cropped = await cropToBox(working, dims, box);

      const area = (cropped.dims.width * cropped.dims.height) / (dims.width * dims.height);
      // A crop that keeps almost nothing is a locator failure, not a small receipt. Refusing it
      // costs a little background; accepting it silently discards most of the paper.
      if (area < 0.05) {
        crop = { applied: box, wholeFrame: true, note: 'Proposed crop was implausibly small — read the whole frame instead.' };
        return;
      }

      working = cropped.bytes;
      dims = cropped.dims;
      crop = { applied: cropped.applied, wholeFrame: false, note: located.note };

      if (located.rotation_degrees && Math.abs(located.rotation_degrees) >= 1) {
        const straightened = await rotateBy(working, -located.rotation_degrees);
        working = straightened.bytes;
        dims = straightened.dims;
      }
    }, undefined);
  } else if (located && located.found === false) {
    crop = { applied: crop.applied, wholeFrame: true, note: located.note ?? 'No receipt was found in the photo.' };
  }

  // ── 3. Tile ──────────────────────────────────────────────────────────────────────────────────
  // `thorough` on purpose: banding is not only about avoiding a downscale, it is about how many
  // visual tokens the model gets to spend on the print. On the 480×640 photos in the live bucket
  // this is the difference between ~1,500 tokens spread over a car dashboard and ~7,700 spent on the
  // paper alone.
  const activePlan = planTiles(dims.width, dims.height, {
    tier, thorough: true, thoroughBands: options.bands ?? 5,
  });
  const rendered = await renderBands(working, dims, activePlan);

  ctx.stages.push({ name: 'tile', ms: 0, ok: true, detail: activePlan.rationale });

  // ── 4. Transcribe each band ──────────────────────────────────────────────────────────────────
  const bandReads: (BandRead | null)[] = new Array(rendered.length).fill(null);
  for (let i = 0; i < rendered.length; i += BAND_CONCURRENCY) {
    const slice = rendered.slice(i, i + BAND_CONCURRENCY);
    await Promise.all(slice.map(async (band) => {
      bandReads[band.index] = await stage<BandRead | null>(ctx, `band ${band.index + 1}`, async () => {
        const where = describeBand(activePlan.bands[band.index], rendered.length);
        const text = await call(ctx, {
          system: BAND_SYSTEM,
          maxTokens: 3000,
          content: [
            { type: 'text', text: 'Image 1 — as photographed:' },
            imageBlock(band.plain),
            { type: 'text', text: 'Image 2 — the same strip, contrast-stretched:' },
            imageBlock(band.enhanced),
            { type: 'text', text: `This is ${where}. Transcribe every line of print you can see.` },
          ],
        });
        return jsonFrom(text) as BandRead | null;
      }, null);
    }));
  }

  // ── 5. Assemble ──────────────────────────────────────────────────────────────────────────────
  const bandTranscripts: BandTranscript[] = rendered.map((b) => ({
    index: b.index,
    lines: (bandReads[b.index]?.lines ?? []).filter((l) => typeof l === 'string'),
  }));
  const transcript = assembleTranscript(bandTranscripts);

  const uncertainNotes = bandReads
    .flatMap((r) => r?.uncertain ?? [])
    .filter((u) => u && u.text)
    .map((u) => `"${u.text}" — ${u.why ?? 'ambiguous'}${u.alternatives?.length ? ` (could be: ${u.alternatives.join(', ')})` : ''}`);

  // ── 6 & 7 in parallel: structured extraction, and the close-up re-reads ───────────────────────
  const [structured, totalsRead, cardRead] = await Promise.all([
    stage<Record<string, unknown> | null>(ctx, 'extract', async () => {
      const text = await call(ctx, {
        system: DELIBERATE_SYSTEM,
        maxTokens: 5000,
        content: [
          { type: 'text', text: 'The whole receipt, for reference:' },
          imageBlock((await renderLocatorView(working, dims, tier)).bytes),
          {
            type: 'text',
            text:
              `TRANSCRIPT (stitched from ${rendered.length} magnified strip${rendered.length === 1 ? '' : 's'}):\n`
              + transcript.map((l) => `  ${l}`).join('\n')
              + (uncertainNotes.length
                ? `\n\nCHARACTERS THE STRIP READERS FLAGGED AS AMBIGUOUS:\n${uncertainNotes.map((u) => `  - ${u}`).join('\n')}`
                : '')
              + (noteBriefing ? `\n\n${noteBriefing}` : '')
              + '\n\nNo close-up re-readings or lookup are available yet — this is the first structured pass. '
              + 'Fill in what the transcript supports.',
          },
        ],
      });
      return jsonFrom(text) as Record<string, unknown> | null;
    }, null),

    // The bottom third, enlarged: where the subtotal, tax and total live on nearly every receipt.
    stage<Record<string, unknown> | null>(ctx, 'verify totals', async () => {
      const region = await renderRegion(working, dims, { top: 0.5, bottom: 1 }, tier);
      if (!region) return null;
      const text = await call(ctx, {
        system: REGION_SYSTEM,
        maxTokens: 1200,
        content: [imageBlock(region.bytes), { type: 'text', text: 'Read the money figures in this crop.' }],
      });
      return jsonFrom(text) as Record<string, unknown> | null;
    }, null),

    // The very bottom, where the card line and the change usually sit.
    stage<Record<string, unknown> | null>(ctx, 'verify card', async () => {
      const region = await renderRegion(working, dims, { top: 0.72, bottom: 1 }, tier);
      if (!region) return null;
      const text = await call(ctx, {
        system: REGION_SYSTEM,
        maxTokens: 1200,
        content: [imageBlock(region.bytes), { type: 'text', text: 'Read the card and payment details in this crop.' }],
      });
      return jsonFrom(text) as Record<string, unknown> | null;
    }, null),
  ]);

  // ── 8. Research ──────────────────────────────────────────────────────────────────────────────
  let vendorCheck: VendorVerification | undefined;
  if (!options.skipResearch && structured) {
    vendorCheck = await stage<VendorVerification>(ctx, 'research vendor', async () => verifyVendor({
      vendorName: structured.vendor_name as string | null,
      vendorAddress: structured.vendor_address as string | null,
      vendorPhone: structured.vendor_phone as string | null,
    }), { status: 'error', detail: 'Lookup did not run.', discrepancies: [] });
  }

  // ── Deterministic checks, in code, before the model gets another say ─────────────────────────
  const discrepancies: Discrepancy[] = [];
  const num = (o: Record<string, unknown> | null, k: string) =>
    (o && typeof o[k] === 'number' ? o[k] as number : null);

  for (const field of ['total_cents', 'subtotal_cents', 'tax_cents', 'tip_cents'] as const) {
    const d = compareReadings(field, [
      { source: 'whole receipt', value: num(structured, field) },
      { source: 'totals, enlarged', value: num(totalsRead, field) },
    ]);
    if (d) discrepancies.push(d);
  }

  const last4 = compareReadings('payment_last4', [
    { source: 'whole receipt', value: (structured?.payment_last4 as string) ?? null },
    { source: 'card line, enlarged', value: (cardRead?.payment_last4 as string) ?? null },
  ]);
  if (last4) discrepancies.push(last4);

  const dateIssue = checkDateSanity(structured?.transaction_at as string | null);
  if (dateIssue) discrepancies.push(dateIssue);

  const items = (structured?.line_items as { amount_cents?: number | null }[] | undefined) ?? [];
  const sumIssue = checkLineItemSum(items, {
    subtotal_cents: num(structured, 'subtotal_cents'),
  });
  if (sumIssue) discrepancies.push(sumIssue);

  if (vendorCheck) discrepancies.push(...vendorCheck.discrepancies);

  // ── 9. Deliberate ────────────────────────────────────────────────────────────────────────────
  const finalFields = await stage<Record<string, unknown> | null>(ctx, 'deliberate', async () => {
    const text = await call(ctx, {
      system: DELIBERATE_SYSTEM,
      maxTokens: 6000,
      thinkingBudget: options.thinkingBudget ?? 6000,
      content: [
        { type: 'text', text: 'The whole receipt:' },
        imageBlock((await renderLocatorView(working, dims, tier)).bytes),
        {
          type: 'text',
          text: [
            `TRANSCRIPT (${rendered.length} magnified strip${rendered.length === 1 ? '' : 's'}):`,
            transcript.map((l) => `  ${l}`).join('\n'),
            '',
            'FIRST STRUCTURED READING:',
            JSON.stringify(structured, null, 2),
            '',
            'CLOSE-UP RE-READING OF THE TOTALS BLOCK:',
            JSON.stringify(totalsRead, null, 2),
            '',
            'CLOSE-UP RE-READING OF THE CARD LINE:',
            JSON.stringify(cardRead, null, 2),
            '',
            'LOOKING THE BUSINESS UP AT THE PRINTED ADDRESS:',
            vendorCheck ? `${vendorCheck.status}: ${vendorCheck.detail}` : 'not run',
            '',
            uncertainNotes.length
              ? `CHARACTERS FLAGGED AS AMBIGUOUS BY THE STRIP READERS:\n${uncertainNotes.map((u) => `  - ${u}`).join('\n')}`
              : 'No characters were flagged as ambiguous.',
            '',
            discrepancies.length
              ? `CONFLICTS THE AUTOMATIC CHECKS ALREADY FOUND:\n${discrepancies.map((d) => `  - [${d.severity}] ${d.message}`).join('\n')}`
              : 'The automatic checks found no conflicts.',
            '',
            noteBriefing ?? '',
            noteBriefing ? '' : 'The person who photographed this receipt left no note.',
            '',
            'Decide what this receipt says. Resolve the conflicts where the evidence supports it, and',
            'leave flagged what it does not.',
          ].join('\n'),
        },
      ],
    });
    return jsonFrom(text) as Record<string, unknown> | null;
  }, null);

  const fields = finalFields ?? structured ?? {};

  // The deliberation may add its own flags; fold them in rather than replacing what code proved.
  // Capped, and not arbitrarily. On the first live run the deliberation returned six separate notes
  // about faded characters in a store number and a phone number — all true, none actionable, and
  // together they buried the one note that mattered. A list of ten things "worth a look" is read as
  // a list of zero things worth a look, which is strictly worse than the four that would have been.
  const MAX_MODEL_NOTES = 4;
  const stillUncertain = ((fields.still_uncertain as { field?: string; why?: string }[] | undefined) ?? [])
    .filter((u) => u?.why);
  for (const u of stillUncertain.slice(0, MAX_MODEL_NOTES)) {
    discrepancies.push({
      code: 'model_uncertain',
      field: u.field,
      severity: 'low',
      message: u.why as string,
    });
  }
  if (stillUncertain.length > MAX_MODEL_NOTES) {
    discrepancies.push({
      code: 'model_uncertain_more',
      severity: 'low',
      message:
        `${stillUncertain.length - MAX_MODEL_NOTES} further minor notes about faded characters were `
        + 'recorded with the reading but are not shown here.',
    });
  }

  const misread = (fields.items_probably_misread as { as_printed?: string; likely?: string; why?: string }[] | undefined) ?? [];
  for (const m of misread) {
    if (!m?.as_printed || !m?.likely) continue;
    discrepancies.push({
      code: 'item_probably_misread',
      field: 'line_items',
      severity: 'low',
      message: `"${m.as_printed}" is probably "${m.likely}"${m.why ? ` — ${m.why}` : ''}. Left as printed; correct it if you agree.`,
      readings: [
        { source: 'as printed', value: m.as_printed },
        { source: 'likely', value: m.likely },
      ],
    });
  }

  // The note, checked against the FINAL reading rather than the first one — the deliberation may
  // already have adopted the note's figure, and flagging a disagreement it has just resolved would
  // send a person to look at something that is now right.
  //
  // In code, not in the prompt. The model has been asked to weigh the note and generally does; this
  // is the part that cannot forget to. A total the person wrote down and the machine did not read is
  // the single most valuable disagreement in the pipeline, and it is one subtraction.
  const noteCheck = checkNoteAgainstReading(noteHints, {
    total_cents: typeof fields.total_cents === 'number' ? fields.total_cents : null,
    subtotal_cents: typeof fields.subtotal_cents === 'number' ? fields.subtotal_cents : null,
    transaction_at: (fields.transaction_at as string | null) ?? null,
    vendor_name: (fields.vendor_name as string | null) ?? null,
  });
  discrepancies.push(...noteCheck.discrepancies);

  const sorted = sortDiscrepancies(discrepancies);

  return {
    fields,
    transcript,
    discrepancies: sorted,
    summary: summariseDiscrepancies(sorted),
    vendorCheck,
    noteConfirmations: noteCheck.confirmations,
    stages: ctx.stages,
    inputTokens: ctx.inputTokens,
    outputTokens: ctx.outputTokens,
    crop,
    bandCount: rendered.length,
    totalMs: Date.now() - startedAt,
  };
}
