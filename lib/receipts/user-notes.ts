// lib/receipts/user-notes.ts — what the person who was standing there told us.
//
// Owner, 2026-08-18: *"I want it so that the AI takes into account the user's notes … If the user
// puts down the total and location and job number and all that, then the AI should track that and
// use it in the summary if it is correct."*
//
// ── WHY A NOTE IS WORTH MORE THAN ANOTHER LOOK AT THE PIXELS ────────────────────────────────────
//
// Measured on this firm's own receipts, 2026-08-18: Guy's Quick Stop prints a subtotal of $25.82 and
// a total of $27.89. The reader returns $25.62 and $27.69 at two bands and at five, because the
// photograph is 480×640 and the strokes that separate an 8 from a 6 are not in it. Reading it again,
// harder, cannot fix that.
//
// Worse, the arithmetic cannot arbitrate: 25.62 + 2.07 = 27.69 balances exactly as well as
// 25.82 + 2.07 = 27.89. Both readings are self-consistent, and every internal check passes on the
// wrong one.
//
// A person who typed "27.89" while holding the paper has information no amount of re-reading
// recovers. That is what this module is for.
//
// ── AND WHY THE NOTE IS NEVER SIMPLY BELIEVED ───────────────────────────────────────────────────
//
// The owner's word for it is *"if it is correct"*. A note is a claim by somebody who was there,
// typed on a phone, possibly about a different receipt in the same stack, possibly with a typo. It
// is evidence — strong evidence — and it is weighed, not obeyed.
//
// So: where a note agrees with the reading, that agreement is recorded and raises confidence. Where
// it disagrees, BOTH are shown and a person decides. What never happens is a note silently
// overwriting what the paper says, because then a mistyped total becomes the books.
//
// Pure. No I/O, no model. Tested in `__tests__/receipts/user-notes.test.ts`.

import type { Discrepancy } from './deep-merge';

export interface NoteHints {
  /** A money figure the person wrote, in cents. The largest one, when several appear. */
  totalCents: number | null;
  /** Every money figure found, largest first — a note may name a total AND a tip. */
  allAmountsCents: number[];
  /** A job number, if one was named. Kept as written. */
  jobNumber: string | null;
  /** A date, ISO `YYYY-MM-DD`, when one was written unambiguously. */
  dateIso: string | null;
  /** Words that look like a place or vendor. Loose on purpose — used to corroborate, never to set. */
  placeTerms: string[];
  /** True when the note carries nothing a machine can check. Most notes are like this and that is
   *  fine; they still go to the model as context. */
  isFreeTextOnly: boolean;
}

const EMPTY: NoteHints = {
  totalCents: null,
  allAmountsCents: [],
  jobNumber: null,
  dateIso: null,
  placeTerms: [],
  isFreeTextOnly: true,
};

/**
 * `$27.89`, `27.89`, `$1,204.50` → cents.
 *
 * Requires either a currency symbol or two decimal places. A bare "24" in "24 pack of water" is not
 * a total, and treating it as one would manufacture a disagreement on a note that said nothing about
 * money — the fastest way to make people stop writing notes.
 */
function moneyInCents(text: string): number[] {
  const out: number[] = [];
  const re = /\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|(?<![\d.])([0-9][0-9,]*\.[0-9]{2})(?![\d])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = (m[1] ?? m[2] ?? '').replace(/,/g, '');
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    out.push(Math.round(n * 100));
  }
  return out;
}

/**
 * A job number as this firm writes them.
 *
 * Anchored on the word "job" (or "#" immediately before digits) rather than matching any number in
 * the note. "fuel for 2 trucks" contains a 2 and names no job, and a picker that guessed would file
 * receipts against job 2.
 */
function jobNumberIn(text: string): string | null {
  const patterns = [
    /\bjob\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Za-z]?\d{2,6}(?:-\d{1,4})?)\b/i,
    /\b(?:#|no\.?)\s*(\d{3,6})\b/,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** `8/12/26`, `8-12-2026`, `2026-08-12`. Two-digit years are read as 20xx, which is right for every
 *  receipt this business will ever file and wrong only for paperwork from the 1900s. */
function dateIn(text: string): string | null {
  const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (iso) {
    const [, y, mo, d] = iso;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const us = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/.exec(text);
  if (us) {
    const [, mo, d, yRaw] = us;
    const mm = Number(mo);
    const dd = Number(d);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  return null;
}

/** Words in the note that might name the place. Deliberately crude: these only ever CORROBORATE a
 *  vendor the reader already found, so a false positive costs nothing. */
function placeTermsIn(text: string): string[] {
  const stop = new Set([
    'the', 'and', 'for', 'from', 'with', 'this', 'that', 'was', 'were', 'job', 'receipt', 'total',
    'paid', 'bought', 'got', 'lunch', 'fuel', 'gas', 'truck', 'trucks', 'crew', 'client', 'office',
    'expense', 'business', 'personal', 'at', 'on', 'in', 'to', 'of', 'a', 'an', 'my', 'our',
  ]);
  return Array.from(new Set(
    text
      .replace(/[^A-Za-z' ]+/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3 && !stop.has(w.toLowerCase())),
  )).slice(0, 12);
}

/** Pull out everything checkable. Never throws; an empty note yields an empty hint set. */
export function parseNoteHints(note: string | null | undefined): NoteHints {
  const text = (note ?? '').trim();
  if (!text) return { ...EMPTY };

  const amounts = moneyInCents(text).sort((a, b) => b - a);
  const jobNumber = jobNumberIn(text);
  const dateIso = dateIn(text);
  const placeTerms = placeTermsIn(text);

  return {
    // The largest figure. Where somebody writes "27.89 incl 4.00 tip" the total is the bigger one,
    // and a note naming only a tip is rare enough to be worth getting wrong occasionally rather than
    // picking the smaller number and disagreeing with every correct reading.
    totalCents: amounts.length > 0 ? amounts[0] : null,
    allAmountsCents: amounts,
    jobNumber,
    dateIso,
    placeTerms,
    isFreeTextOnly: amounts.length === 0 && !jobNumber && !dateIso,
  };
}

export interface ReadingForNoteCheck {
  total_cents?: number | null;
  subtotal_cents?: number | null;
  transaction_at?: string | null;
  vendor_name?: string | null;
}

/**
 * Compare what the person wrote against what was read.
 *
 * Returns discrepancies for the disagreements and `confirmations` for the agreements. Both matter:
 * the confirmations are what let the summary say "the total matches what you wrote", which is the
 * owner's *"use it in the summary if it is correct"*.
 */
export function checkNoteAgainstReading(
  hints: NoteHints,
  reading: ReadingForNoteCheck,
): { discrepancies: Discrepancy[]; confirmations: string[] } {
  const discrepancies: Discrepancy[] = [];
  const confirmations: string[] = [];

  const money = (c: number) => `$${(c / 100).toFixed(2)}`;

  if (hints.totalCents !== null && typeof reading.total_cents === 'number') {
    if (hints.totalCents === reading.total_cents) {
      confirmations.push(`the total matches the ${money(hints.totalCents)} you noted`);
    } else if (hints.allAmountsCents.includes(reading.total_cents)) {
      // The note carried several figures and the reading matches one of the others. Not a conflict —
      // somebody wrote the subtotal and the total, and the largest was not the one that matched.
      confirmations.push(`the total matches one of the figures you noted (${money(reading.total_cents)})`);
    } else {
      discrepancies.push({
        code: 'note_total_mismatch',
        field: 'total_cents',
        // HIGH, and higher than a disagreement between two machine passes. A person holding the
        // paper is better evidence than another look at a photograph of it, and on a low-resolution
        // photo this is frequently the only source that can settle the digit.
        severity: 'high',
        message:
          `You noted ${money(hints.totalCents)}, but the receipt was read as `
          + `${money(reading.total_cents)}. One of the two is wrong — the note is usually right when `
          + 'the print is faded.',
        readings: [
          { source: 'your note', value: money(hints.totalCents) },
          { source: 'read from the photo', value: money(reading.total_cents) },
        ],
      });
    }
  }

  if (hints.dateIso && reading.transaction_at) {
    const readDate = String(reading.transaction_at).slice(0, 10);
    if (readDate === hints.dateIso) {
      confirmations.push(`the date matches the ${hints.dateIso} you noted`);
    } else {
      discrepancies.push({
        code: 'note_date_mismatch',
        field: 'transaction_at',
        severity: 'medium',
        message: `You noted ${hints.dateIso}, but the receipt was read as ${readDate}.`,
        readings: [
          { source: 'your note', value: hints.dateIso },
          { source: 'read from the photo', value: readDate },
        ],
      });
    }
  }

  if (hints.placeTerms.length > 0 && reading.vendor_name) {
    const vendor = reading.vendor_name.toLowerCase();
    const hit = hints.placeTerms.find((t) => vendor.includes(t.toLowerCase()));
    if (hit) confirmations.push(`"${hit}" in your note matches the vendor read off the receipt`);
  }

  return { discrepancies, confirmations };
}

/**
 * The block of text handed to the model.
 *
 * Written as instructions rather than as data, because a note pasted in raw gets treated as one more
 * ambiguous input. Saying plainly what the note IS — a person who was holding the paper — is what
 * makes the model weigh it correctly against its own reading of a blurry photograph.
 */
export function noteBriefingFor(note: string | null | undefined, hints: NoteHints): string | null {
  const text = (note ?? '').trim();
  if (!text) return null;

  const lines: string[] = [
    'NOTE WRITTEN BY THE PERSON WHO PHOTOGRAPHED THIS RECEIPT:',
    `  "${text}"`,
    '',
    'How to use it:',
    '  - This person was holding the paper. Where the print is faded and your reading is uncertain,',
    '    their note is usually the better evidence. Prefer it for that field and say so.',
    '  - It is NOT automatically right. It was typed on a phone, possibly about a different receipt',
    '    in the same stack. Where it disagrees with print you can read clearly, keep what is printed',
    '    and record the disagreement.',
    '',
    '  - ILLEGIBLE IS NOT THE SAME AS CONTRADICTED, and this is the distinction that matters most.',
    '      * The paper plainly says something ELSE — the note says $40, the print clearly reads $14.',
    '        Report $14 and flag the disagreement. The note does not get to overwrite legible print.',
    '      * The paper is UNREADABLE there — the figure is faded, torn away, or lost to glare, and',
    '        you would otherwise return null. USE THE NOTE. Put its value in the field, record it in',
    '        "resolved" with chose "the submitter\'s note", and name the field in',
    '        legibility.fields_to_verify.',
    '    Returning null when somebody has written the number down is the worst of the three outcomes:',
    '    the figure was available and the receipt still arrives at the books empty.',
    '  - Mention in ai_summary anything from the note that CHECKS OUT — the owner asked for the note',
    '    to be used in the summary when it is correct. Do not repeat parts that do not check out;',
    '    those belong in the flags.',
  ];

  if (hints.totalCents !== null) {
    lines.push(`  - They appear to have written a total of $${(hints.totalCents / 100).toFixed(2)}. Compare it with what you read.`);
  }
  if (hints.jobNumber) {
    lines.push(`  - They named job ${hints.jobNumber}. Record it in ai_summary; do not invent a job number they did not write.`);
  }
  if (hints.dateIso) {
    lines.push(`  - They appear to have written the date ${hints.dateIso}.`);
  }

  return lines.join('\n');
}
