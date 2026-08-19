// lib/receipts/deep-merge.ts — stitch the band transcripts together and find what disagrees.
//
// Owner, 2026-08-18: *"then it should tie all of the info together … For any discrepancies, then we
// can have warnings and stuff to let the reviewer know that there is a discrepancy."*
//
// Pure: transcripts and readings in, one transcript and a list of discrepancies out. No I/O, no
// model calls. The orchestrator in `deep-read.ts` does the talking; this decides what the answers
// mean, and it is the part worth testing exhaustively.
//
// ── WHY DISAGREEMENT IS THE PRODUCT, NOT A PROBLEM ──────────────────────────────────────────────
//
// The deep reader reads the same receipt several ways: band by band, then as a whole against the
// assembled transcript, then again with the totals block cropped and enlarged and nothing else in
// frame. Those passes will sometimes differ.
//
// That is the single most valuable signal in the pipeline. One pass returning $20.98 tells you
// nothing about whether it is right. Two passes returning $20.98 and $20.90 tells you exactly where
// a person needs to look — and it is precisely the case a single confident read hides. A pipeline
// that quietly picks one and moves on has thrown away the only evidence it had.

export type DiscrepancySeverity = 'high' | 'medium' | 'low';

export interface Discrepancy {
  /** Stable key so the UI can group and the tests can assert. */
  code: string;
  /** Which extracted field it concerns, where there is one. */
  field?: string;
  severity: DiscrepancySeverity;
  /** One sentence, written for the bookkeeper who has to act on it. */
  message: string;
  /** What each source said, for the "who claimed what" table. */
  readings?: { source: string; value: string }[];
}

// ── Transcript assembly ─────────────────────────────────────────────────────────────────────────

export interface BandTranscript {
  index: number;
  /** Verbatim lines, top to bottom, exactly as the band reader saw them. */
  lines: string[];
}

/** Normalised for COMPARISON only — never for display. Case, runs of spaces and the characters that
 *  OCR routinely swaps are flattened so that two readings of the same line can be recognised as the
 *  same line. The original text is always what gets kept. */
export function normaliseForMatch(line: string): string {
  return line
    .toLowerCase()
    .replace(/[|]/g, 'i')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Join overlapping band transcripts into one, without repeating the overlap.
 *
 * Bands deliberately overlap by a fifth so no line can be cut out of both. That means the last few
 * lines of one band are the first few of the next, and naive concatenation duplicates them — which
 * would double a line item, and a doubled line item is a wrong subtotal.
 *
 * The join looks for the LONGEST run of lines at the end of the accumulated text that also opens the
 * next band, and drops the repeat. Longest rather than first, because receipts are full of short
 * repeated lines ("----", "Med Coke") and matching on one of those would splice the bands at the
 * wrong point and silently delete everything between.
 */
export function assembleTranscript(bands: readonly BandTranscript[]): string[] {
  const ordered = [...bands].sort((a, b) => a.index - b.index);
  const out: string[] = [];

  for (const band of ordered) {
    const lines = band.lines.filter((l) => l.trim().length > 0);
    if (out.length === 0) {
      out.push(...lines);
      continue;
    }

    const maxCheck = Math.min(out.length, lines.length, 40);
    let bestOverlap = 0;
    for (let n = maxCheck; n >= 1; n -= 1) {
      const tail = out.slice(out.length - n).map(normaliseForMatch);
      const head = lines.slice(0, n).map(normaliseForMatch);

      // ── WHY THIS TOLERATES A MISMATCHED LINE ────────────────────────────────────────────────
      //
      // Requiring EVERY line of the run to match exactly was too strict, and the cost was measured:
      // on Guy's Quick Stop the assembled transcript carried the item lines twice, the structured
      // pass duly reported six items on a four-item receipt, and their sum ($29.46) no longer
      // matched the subtotal — destroying the one check that could have caught a misread subtotal.
      //
      // Two readers looking at the same strip do not produce identical line LISTS. One catches a
      // faint separator the other drops; one splits a wrapped line in two. A single such difference
      // anywhere in the overlap made the whole run fail to match, so no overlap was detected and
      // every repeated line was kept.
      //
      // So the run is accepted on a majority of its lines matching. Two independent readings of
      // unrelated text do not agree on 60% of their lines; two readings of the same strip nearly
      // always do.
      // Matched by MEMBERSHIP in the tail, not position. A dropped line shifts everything after it,
      // so a positional comparison declares the rest of the run mismatched — and the first attempt
      // at this fix duly swallowed the "Subtotal 25.82" line that only the second reader had caught.
      const window = new Set(out.slice(Math.max(0, out.length - n - 5)).map(normaliseForMatch));
      void tail;

      const substantive = head.filter((t) => t.length > 2);
      if (substantive.length < 1) continue;
      const matched = substantive.filter((t) => window.has(t)).length;

      // The LAST line of the prefix being dropped must itself be present. Without this the run can
      // be accepted on the strength of its earlier lines while its final line — the one the other
      // reader alone saw — is discarded unread. That is a silent hole in the middle of the receipt,
      // which is the failure mode this whole module exists to avoid.
      const lastIsPresent = head[n - 1].length <= 2 || window.has(head[n - 1]);

      if (lastIsPresent && matched >= Math.max(1, Math.ceil(substantive.length * 0.6))) {
        bestOverlap = n;
        break;
      }
    }
    out.push(...lines.slice(bestOverlap));
  }

  return out;
}

// ── Comparing what the passes said ──────────────────────────────────────────────────────────────

/** One field, as read by one pass. */
export interface FieldReading {
  source: string;
  value: string | number | null | undefined;
  /** 0..1 if the pass reported one. */
  confidence?: number;
}

const MONEY_FIELDS = new Set([
  'total_cents', 'subtotal_cents', 'tax_cents', 'tip_cents',
  'service_charge_cents', 'discount_cents',
]);

function sameValue(field: string, a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return true; // silence is not disagreement
  if (MONEY_FIELDS.has(field)) return Number(a) === Number(b);
  return normaliseForMatch(String(a)) === normaliseForMatch(String(b));
}

function display(field: string, v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (MONEY_FIELDS.has(field) && typeof v === 'number') return `$${(v / 100).toFixed(2)}`;
  return String(v);
}

/**
 * Where the passes disagree about the same field.
 *
 * A field only one pass looked at is not a disagreement — most passes are deliberately narrow, and
 * treating "the totals reader did not report a vendor name" as a conflict would bury the real ones.
 */
export function compareReadings(
  field: string,
  readings: readonly FieldReading[],
): Discrepancy | null {
  const said = readings.filter((r) => r.value !== null && r.value !== undefined && r.value !== '');
  if (said.length < 2) return null;

  const first = said[0];
  const conflicting = said.filter((r) => !sameValue(field, first.value, r.value));
  if (conflicting.length === 0) return null;

  // Money is where a disagreement costs money. A vendor name read two ways is a nuisance; a total
  // read two ways is a wrong number in the books either way it is resolved.
  const severity: DiscrepancySeverity = MONEY_FIELDS.has(field)
    ? 'high'
    : field === 'payment_last4' || field === 'transaction_at' ? 'medium' : 'low';

  return {
    code: 'passes_disagree',
    field,
    severity,
    message:
      `Two readings of ${humanField(field)} disagree: `
      + said.map((r) => `${display(field, r.value)} (${r.source})`).join(' vs ')
      + '. Check it against the photo.',
    readings: said.map((r) => ({ source: r.source, value: display(field, r.value) })),
  };
}

export function humanField(field: string): string {
  const names: Record<string, string> = {
    total_cents: 'the total',
    subtotal_cents: 'the subtotal',
    tax_cents: 'the tax',
    tip_cents: 'the tip',
    service_charge_cents: 'the service charge',
    discount_cents: 'the discount',
    payment_last4: 'the card last four',
    transaction_at: 'the date',
    vendor_name: 'the vendor name',
    vendor_address: 'the address',
    card_brand: 'the card brand',
    receipt_number: 'the receipt number',
  };
  return names[field] ?? field.replace(/_/g, ' ');
}

// ── Arithmetic that must hold ───────────────────────────────────────────────────────────────────

export interface AmountSet {
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  tip_cents?: number | null;
  service_charge_cents?: number | null;
  discount_cents?: number | null;
  total_cents?: number | null;
}

/**
 * Do the line items add up to the subtotal?
 *
 * Separate from the subtotal+tax=total identity that `reconcile.ts` already checks, and it catches a
 * different failure: a line the reader MISSED. The parts can balance perfectly while an item is
 * absent, because the subtotal was read off the paper rather than summed — so this is the only check
 * that can see a dropped line.
 *
 * The tolerance is not slack for sloppiness. A receipt can legitimately carry a line the items do
 * not explain (a bottle deposit, a rounding line), so a small gap is noise and a large one is a
 * missing item.
 */
export function checkLineItemSum(
  items: readonly { amount_cents?: number | null; quantity?: number | null }[],
  amounts: AmountSet,
  toleranceCents = 2,
): Discrepancy | null {
  const priced = items.filter((i) => typeof i.amount_cents === 'number');
  if (priced.length === 0) return null;
  const subtotal = amounts.subtotal_cents;
  if (typeof subtotal !== 'number') return null;

  const sum = priced.reduce((a, i) => a + (i.amount_cents ?? 0), 0);
  const gap = subtotal - sum;
  if (Math.abs(gap) <= toleranceCents) return null;

  return {
    code: 'line_items_do_not_sum',
    field: 'line_items',
    severity: Math.abs(gap) > 500 ? 'high' : 'medium',
    message:
      `The ${priced.length} item${priced.length === 1 ? '' : 's'} read off this receipt come to `
      + `$${(sum / 100).toFixed(2)}, but the subtotal says $${(subtotal / 100).toFixed(2)}`
      + (gap > 0
        ? ` — $${(gap / 100).toFixed(2)} short, which usually means an item was missed.`
        : ` — $${(-gap / 100).toFixed(2)} over, which usually means an item was read twice.`),
    readings: [
      { source: 'sum of items', value: `$${(sum / 100).toFixed(2)}` },
      { source: 'printed subtotal', value: `$${(subtotal / 100).toFixed(2)}` },
    ],
  };
}

/** A date that cannot be right. Cheap, deterministic, and catches the faded-digit case that reads as
 *  a clean date in the wrong decade — the 8/12/2016 → 8/2/2026 failure this repo already knows. */
export function checkDateSanity(iso: string | null | undefined, now = new Date()): Discrepancy | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return {
      code: 'date_unparseable', field: 'transaction_at', severity: 'medium',
      message: `The date read as "${iso}", which is not a date. Check it against the photo.`,
    };
  }
  // A year outside any plausible range is its own failure and gets its own message. `new Date` is
  // far more permissive than people expect: "8/2/206" does not fail, it parses as the year 206, so
  // without this the dropped-digit case is reported as "more than three years ago" — true, useless,
  // and it hides the actual defect, which is that a digit of the year is missing.
  const year = d.getFullYear();
  if (year < 1990 || year > now.getFullYear() + 50) {
    return {
      code: 'date_unparseable', field: 'transaction_at', severity: 'medium',
      message:
        `The date read as "${iso}", giving the year ${year}. That is a digit lost or misread — check `
        + 'it against the photo.',
    };
  }

  const days = (d.getTime() - now.getTime()) / 86_400_000;
  if (days > 1) {
    return {
      code: 'date_in_future', field: 'transaction_at', severity: 'high',
      message:
        `This receipt is dated ${iso.slice(0, 10)}, which is in the future. A faded digit reads as a `
        + 'different digit — the year is the usual culprit.',
    };
  }
  if (days < -365 * 3) {
    return {
      code: 'date_very_old', field: 'transaction_at', severity: 'medium',
      message:
        `This receipt is dated ${iso.slice(0, 10)}, more than three years ago. Worth confirming — a `
        + 'dropped stroke turns 2026 into 2016 without looking wrong.',
    };
  }
  return null;
}

/** Order for display: the things that cost money first. */
export function sortDiscrepancies(list: readonly Discrepancy[]): Discrepancy[] {
  const rank: Record<DiscrepancySeverity, number> = { high: 0, medium: 1, low: 2 };
  return [...list].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** One line for the top of the review panel. Null when there is nothing to say — a banner that is
 *  always present stops being read. */
export function summariseDiscrepancies(list: readonly Discrepancy[]): string | null {
  if (list.length === 0) return null;
  const high = list.filter((d) => d.severity === 'high').length;
  if (high > 0) {
    return high === 1
      ? 'One thing on this receipt does not agree — check it against the photo.'
      : `${high} things on this receipt do not agree — check them against the photo.`;
  }
  const medium = list.filter((d) => d.severity === 'medium').length;
  if (medium > 0) {
    return medium === 1
      ? 'One thing is worth confirming against the photo.'
      : `${medium} things are worth confirming against the photo.`;
  }
  // Everything left is a minor note. Saying "nothing that affects the money" FIRST is the useful
  // part: a bare count reads as a problem, and a reviewer who opens ten low notes expecting a
  // problem learns to stop opening them.
  return `Nothing that affects the money — ${list.length} minor note${list.length === 1 ? '' : 's'} on the printing.`;
}
