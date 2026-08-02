// worker/src/services/plat-history.ts — which plat actually governs this lot (plan R15).
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// `subdivision-classifier.searchForAmendments()` finds replats, amended plats and vacating plats
// and returns them as a flat list. Nothing then decides WHICH of them controls the lot being
// surveyed. The pipeline reads dimensions off "the plat" — meaning whichever one was found first.
//
// `lot-correlator.ts:530` already carries the comment: "WARNING: The CAD lot number may not always
// match the plat if the subdivision was replatted." The risk was known and unhandled. Reading lot
// dimensions off a superseded plat does not produce a slightly stale answer; it produces a boundary
// in the wrong place, staked in the ground.
//
// ── WHY THIS IS PER-LOT, NOT PER-SUBDIVISION ────────────────────────────────────────────────────
//
// A replat almost never covers the whole subdivision. "Replat of Lots 4-7, Block 2, Sunset Acres"
// governs those four lots and leaves the other ninety under the original plat. So "the governing
// plat" is not a property of the subdivision at all — it is a property of the LOT, and a module that
// answers it per subdivision is wrong in the common case rather than the rare one.

export type PlatKind = 'original' | 'replat' | 'amended' | 'vacating' | 'correction';

export interface PlatInstrument {
  instrument: string;
  /** Title as recorded — the string the kind and scope are read from. */
  title: string;
  /** ISO date. An empty string is handled, not assumed to be old or new. */
  recordingDate: string;
  subdivision?: string;
  imagePaths?: string[];
  /** Pre-classified kind, when the adapter already worked it out. */
  kind?: PlatKind;
}

/** Which lots an instrument reaches. `whole` means every lot in the subdivision. */
export interface PlatScope {
  whole: boolean;
  /** Explicit `block → lots` when the title named them. */
  lots: Array<{ block: string | null; lot: string }>;
  /** How the scope was determined — this ends up in the packet, because "we could not tell" must
   *  never look the same as "it covers everything". */
  basis: 'stated' | 'assumed_whole_unparseable' | 'assumed_whole_no_lots_named';
}

export function classifyPlat(title: string, fallback?: PlatKind): PlatKind {
  const t = title.toUpperCase();
  // Order matters: "AMENDED REPLAT" is a replat that amends, and treating it as a plain amendment
  // would lose the fact that it redrew lot lines.
  if (t.includes('VACAT')) return 'vacating';
  if (t.includes('REPLAT') || t.includes('RE-PLAT')) return 'replat';
  if (t.includes('AMEND')) return 'amended';
  if (t.includes('CORRECT')) return 'correction';
  return fallback ?? 'original';
}

// ── Scope parsing ───────────────────────────────────────────────────────────────────────────────

/** `Lots 4 through 7`, `Lots 4-7`, `Lots 4 & 5`, `Lot 12`, each optionally `, Block 2`. */
// The negative lookahead is load-bearing: without it the trailing `, Block 2` is consumed as another
// lot, and `Lots 4-7, Block 2` parses as five lots, one of them named BLOCK.
const LOT_RANGE =
  /\bLOTS?\s+((?!BLOCK\b)[0-9A-Z]+(?:\s*(?:-|–|THROUGH|THRU|TO|&|AND|,)\s*(?!BLOCK\b)[0-9A-Z]+)*)\b/gi;

/** A lot designation we are willing to believe: `12`, `12A`, `A`. Anything else means the clause was
 *  not a lot list and we should say so rather than record `SEVEN THROUGH TWELVE` as a lot. */
const LOT_ID = /^(?:[0-9]{1,4}[A-Z]?|[A-Z])$/;
const RANGE_WORD = /-|–|\bTHROUGH\b|\bTHRU\b|\bTO\b/i;
const BLOCK_NEAR = /\bBLOCK\s+([0-9A-Z]+)\b/i;

function expandLotList(raw: string): string[] {
  const out: string[] = [];
  // Split on separators that mean "and also", keeping ranges intact for the pass below.
  for (const part of raw.split(/\s*(?:,|&|\bAND\b)\s*/i)) {
    const range = part.match(/^([0-9]+)\s*(?:-|–|THROUGH|THRU|TO)\s*([0-9]+)$/i);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      // A backwards or absurd range is a parse failure, not a 10,000-lot subdivision.
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a && b - a <= 500) {
        for (let i = a; i <= b; i++) out.push(String(i));
        continue;
      }
      return [];
    }
    const single = part.trim().toUpperCase();
    if (!single) continue;
    // A part that reads like a range but did not parse as one (`SEVEN THROUGH TWELVE`) is a parse
    // failure. Recording it as a lot named "SEVEN THROUGH TWELVE" would match nothing and quietly
    // narrow the replat's scope to zero lots — the under-claim this module must never make.
    if (RANGE_WORD.test(single) || !LOT_ID.test(single)) return [];
    out.push(single);
  }
  return out;
}

/** What does this instrument reach?
 *
 *  The fail-safe direction is the whole design. When the title names no lots, or names them in a way
 *  we cannot parse, the answer is **the whole subdivision** — never "no lots". Assuming a replat
 *  covers nothing would silently hand back the superseded original plat as governing, which is the
 *  exact wrong-boundary failure this module exists to prevent. Over-claiming scope costs a surveyor
 *  one extra document to read; under-claiming costs them the corner. */
export function platScope(title: string): PlatScope {
  const lots: PlatScope['lots'] = [];
  let sawLotWord = false;

  for (const m of title.matchAll(LOT_RANGE)) {
    sawLotWord = true;
    const expanded = expandLotList(m[1]!);
    if (expanded.length === 0) {
      return { whole: true, lots: [], basis: 'assumed_whole_unparseable' };
    }
    // The block is whichever one is named after this lot clause — titles read "Lots 4-7, Block 2".
    const after = title.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
    const block = after.match(BLOCK_NEAR)?.[1] ?? title.match(BLOCK_NEAR)?.[1] ?? null;
    for (const lot of expanded) lots.push({ block: block?.toUpperCase() ?? null, lot });
  }

  if (lots.length === 0) {
    return {
      whole: true,
      lots: [],
      basis: sawLotWord ? 'assumed_whole_unparseable' : 'assumed_whole_no_lots_named',
    };
  }
  return { whole: false, lots, basis: 'stated' };
}

function coversLot(scope: PlatScope, lot: string, block: string | null): boolean {
  if (scope.whole) return true;
  const L = lot.trim().toUpperCase();
  const B = block?.trim().toUpperCase() ?? null;
  return scope.lots.some((s) => {
    if (s.lot !== L) return false;
    // A plat that named no block is taken to mean the lot number is unique in the subdivision.
    if (s.block === null || B === null) return true;
    return s.block === B;
  });
}

// ── History ─────────────────────────────────────────────────────────────────────────────────────

export interface PlatHistoryEntry extends PlatInstrument {
  kind: PlatKind;
  scope: PlatScope;
}

export interface PlatHistory {
  subdivision: string;
  /** Oldest first — a plat history reads forward, unlike a chain of title. */
  entries: PlatHistoryEntry[];
  /** Instruments with no recording date, whose position is assumed rather than established. */
  undated: string[];
}

export function buildPlatHistory(subdivision: string, instruments: PlatInstrument[]): PlatHistory {
  const entries = instruments.map((p) => ({
    ...p,
    kind: classifyPlat(p.title, p.kind),
    scope: platScope(p.title),
  }));

  // Undated instruments sort to the END: an unknown date must not be allowed to silently supersede
  // a dated plat. Being last means it is reported as the possible latest word rather than assumed
  // to be the original.
  entries.sort((a, b) => {
    if (!a.recordingDate) return 1;
    if (!b.recordingDate) return -1;
    return new Date(a.recordingDate).getTime() - new Date(b.recordingDate).getTime();
  });

  return {
    subdivision,
    entries,
    undated: entries.filter((e) => !e.recordingDate).map((e) => e.instrument),
  };
}

// ── The answer ──────────────────────────────────────────────────────────────────────────────────

export interface GoverningPlat {
  /** The plat to read dimensions from. Null when the lot was vacated or nothing covers it. */
  governing: PlatHistoryEntry | null;
  /** Earlier plats this lot has outgrown, newest first. Included in the packet because a surveyor
   *  reads the superseded ones too — that is where the original monumentation is described. */
  superseded: PlatHistoryEntry[];
  /** Later instruments that modified the governing plat without replacing it (corrections). */
  modifiedBy: PlatHistoryEntry[];
  /** The lot was vacated: it may no longer exist as a legal lot. */
  vacated: boolean;
  statement: string;
  /** Anything that makes this answer less than certain. Empty when it is clean. */
  caveats: string[];
}

/** Which plat controls this lot, and what else a surveyor must read.
 *
 *  Walks the history forward. Each instrument covering the lot REPLACES the governing plat, except a
 *  correction, which modifies it. A vacating plat removes the lot outright. */
export function governingPlatFor(
  history: PlatHistory,
  lot: string,
  block: string | null = null,
): GoverningPlat {
  const superseded: PlatHistoryEntry[] = [];
  const modifiedBy: PlatHistoryEntry[] = [];
  const caveats: string[] = [];
  let governing: PlatHistoryEntry | null = null;
  let vacated = false;

  for (const e of history.entries) {
    if (!coversLot(e.scope, lot, block)) continue;

    if (e.scope.basis !== 'stated' && e.kind !== 'original') {
      caveats.push(
        `${e.instrument} (${e.title}) does not state which lots it covers, so it is treated as ` +
        'covering the whole subdivision. Read it to confirm whether this lot is included.',
      );
    }

    if (e.kind === 'vacating') {
      if (governing) superseded.unshift(governing);
      governing = null;
      vacated = true;
      continue;
    }

    if (e.kind === 'correction') {
      // A correction fixes a scrivener's error on an existing plat; it does not redraw the lot.
      modifiedBy.push(e);
      continue;
    }

    // original / replat / amended all become the controlling document for the lots they reach.
    if (governing) superseded.unshift(governing);
    governing = e;
    vacated = false;
  }

  if (history.undated.length > 0) {
    caveats.push(
      `${history.undated.length} plat instrument(s) have no recording date (${history.undated.join(', ')}), ` +
      'so the order of supersession is assumed rather than established.',
    );
  }

  // A replat with no original in the set means we are missing the document that created the lot —
  // and that is where the original monumentation and the subdivision perimeter are described.
  if (governing && governing.kind === 'replat' && !history.entries.some((e) => e.kind === 'original')) {
    caveats.push(
      'The original plat for this subdivision is not among the retrieved documents. ' +
      'Pull it — the replat shows what changed, not what was set.',
    );
  }

  const statement = vacated
    ? `Lot ${lot}${block ? `, Block ${block}` : ''} was VACATED by ${lastVacating(history, lot, block)}. ` +
      'It may no longer exist as a platted lot — confirm before surveying it as one.'
    : governing
      ? `Lot ${lot}${block ? `, Block ${block}` : ''} is governed by ${governing.instrument} ` +
        `(${governing.kind}, ${governing.recordingDate?.slice(0, 10) || 'undated'})` +
        (superseded.length
          ? `, which superseded ${superseded.map((s) => s.instrument).join(', ')}.`
          : '.')
      : `No retrieved plat covers Lot ${lot}${block ? `, Block ${block}` : ''}. ` +
        'This is a retrieval gap, not evidence that the lot is unplatted.';

  return { governing, superseded, modifiedBy, vacated, statement, caveats };
}

function lastVacating(history: PlatHistory, lot: string, block: string | null): string {
  const v = history.entries.filter((e) => e.kind === 'vacating' && coversLot(e.scope, lot, block));
  return v[v.length - 1]?.instrument ?? 'a vacating plat';
}

/** Every document a surveyor should have for this lot, newest first: the governing plat, anything
 *  that corrected it, and every superseded plat. The packet needs all three — the superseded ones
 *  describe the monumentation that is actually in the ground. */
export function platPacketFor(g: GoverningPlat): PlatHistoryEntry[] {
  return [...(g.governing ? [g.governing] : []), ...g.modifiedBy, ...g.superseded];
}
