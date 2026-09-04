// worker/src/research/drawing-hunt.ts — find the drawings on purpose (plan F6).
//
// ── THE OWNER'S REQUEST ─────────────────────────────────────────────────────────────────────────
//
// "We need to work especially hard on finding drawings and cad work for properties that we
//  research."
//
// ── WHY THAT WAS NOT HAPPENING ──────────────────────────────────────────────────────────────────
//
// `DocumentType` is a five-value union:
//
//     'deed' | 'plat' | 'easement' | 'lien' | 'other'
//
// A drawing that is not filed under the literal word PLAT has nowhere to go but `other`. And the
// classifier in `clerk-adapter.ts` reflects that: it tests REPLAT, AMENDED PLAT, VACATING PLAT and
// PLAT, and stops. So every one of these — all real Texas clerk index labels — is `other`:
//
//     PLAT OF SURVEY · SURVEY PLAT · MAP OF SURVEY · RIGHT OF WAY MAP · CONDOMINIUM MAP
//     FIELD NOTES · MONUMENT RECORD · SUBDIVISION MAP · DEDICATION PLAT · SURVEYOR'S CERTIFICATE
//
// `other` is where things go to stop being looked for. A retracement survey filed as "MAP OF
// SURVEY" — the single most useful document a surveyor can find on a property, because somebody
// has already done this work and set monuments — was indistinguishable in our own index from a
// power-of-attorney.
//
// ── SO THE HUNT IS EXPLICIT ─────────────────────────────────────────────────────────────────────
//
// Two halves, and both are needed:
//
//   1. RECOGNISE what came back. A drawing already retrieved and mis-filed is the cheapest one to
//      find, and it costs nothing but a string match.
//   2. GO LOOKING. The vocabulary below is what a clerk index actually calls these things, so a
//      search can ask for them by name instead of hoping a deed search happens to return one.
//
// Pure and data-driven, so the vocabulary can be extended from a real county index without touching
// any logic.

/** What kind of drawing this is. Coarser than the clerk's own label and more useful than `other`. */
export type DrawingCategory =
  /** A recorded subdivision plat: lots, blocks, dimensions, dedication. */
  | 'plat'
  /** A recorded survey of a specific tract — a retracement somebody already performed. */
  | 'survey'
  /** A right-of-way, easement or utility alignment drawing. */
  | 'right_of_way'
  /** A condominium or unit plan. */
  | 'condominium'
  /** Written metes and bounds accompanying a drawing. Not a picture, but it is the drawing's data. */
  | 'field_notes'
  /** A monument or control record: what was set, and where. */
  | 'monument'
  /** A map or CAD file the county publishes that is none of the above. */
  | 'map';

export interface DrawingMatch {
  isDrawing: boolean;
  category: DrawingCategory | null;
  /** Why this was classified as it was, in words that can be disagreed with. */
  reason: string;
  /** How strongly the label says "drawing". Used to rank, never to discard. */
  strength: 'strong' | 'probable' | 'weak';
}

/**
 * The vocabulary, most specific first.
 *
 * Order matters and is the same trap `run-progress.ts` fell into with "Stage 3.5": a general
 * pattern placed before a specific one makes the specific one unreachable. `PLAT` matches inside
 * `PLAT OF SURVEY`, so `PLAT OF SURVEY` is tested first — otherwise every recorded survey in the
 * county is filed as a subdivision plat, which is a different document answering a different
 * question.
 */
const DRAWING_PATTERNS: Array<{
  re: RegExp;
  category: DrawingCategory;
  strength: DrawingMatch['strength'];
  why: string;
}> = [
  // ── Surveys. Tested before PLAT, deliberately. ────────────────────────────────────────────────
  { re: /\b(plat|map)\s+of\s+survey\b/i, category: 'survey', strength: 'strong',
    why: 'a recorded survey of a specific tract — somebody has already retraced this boundary' },
  { re: /\bsurvey\s+(plat|map)\b/i, category: 'survey', strength: 'strong',
    why: 'a recorded survey drawing' },
  { re: /\bsurveyor'?s?\s+(certificate|report|affidavit)\b/i, category: 'survey', strength: 'strong',
    why: "a surveyor's own certificate, which names the work and usually the drawing it accompanies" },
  { re: /\bretracement\b/i, category: 'survey', strength: 'strong',
    why: 'an explicit retracement of an earlier survey' },
  { re: /\bboundary\s+(survey|line\s+agreement)\b/i, category: 'survey', strength: 'strong',
    why: 'a boundary survey or a recorded agreement about where a line runs' },

  // ── Plats ─────────────────────────────────────────────────────────────────────────────────────
  { re: /\b(re-?plat|amend(ed|ing)?\s+plat|vacating\s+plat|final\s+plat|preliminary\s+plat)\b/i,
    category: 'plat', strength: 'strong', why: 'a recorded plat action' },
  { re: /\bsubdivision\s+(plat|map)\b/i, category: 'plat', strength: 'strong',
    why: 'a subdivision plat: lots, blocks and dimensions' },
  { re: /\bdedication\b/i, category: 'plat', strength: 'probable',
    why: 'a dedication, which normally accompanies a plat and carries its street and easement grants' },
  // ── Right of way and easement drawings ───────────────────────────────────────────────────────
  //
  // BEFORE the bare /\bplat\b/ below. "UTILITY PLAT" and "CONDOMINIUM PLAT" both contain the word
  // plat, so a general plat test placed first swallows them and files a utility alignment as a
  // subdivision plat. The first draft of this file did exactly that — in a module whose own header
  // warns about this trap — and three tests caught it.
  { re: /\bright[\s-]?of[\s-]?way\s+(map|plat|drawing|exhibit)\b/i, category: 'right_of_way',
    strength: 'strong', why: 'a right-of-way alignment drawing' },
  { re: /\b(easement|utility)\s+(exhibit|plat|map|drawing)\b/i, category: 'right_of_way',
    strength: 'strong', why: 'an easement or utility drawing showing an alignment' },

  // ── Condominium ──────────────────────────────────────────────────────────────────────────────
  { re: /\bcondominium\s+(plat|map|plan|declaration)\b/i, category: 'condominium', strength: 'strong',
    why: 'a condominium plan, which carries unit boundaries' },

  // The general case, LAST among the plat-word patterns.
  { re: /\bplat\b/i, category: 'plat', strength: 'strong', why: 'filed as a plat' },

  // ── Field notes and monuments ────────────────────────────────────────────────────────────────
  { re: /\bfield\s+notes?\b/i, category: 'field_notes', strength: 'strong',
    why: 'field notes — the metes and bounds a drawing was made from' },
  { re: /\bmetes\s+and\s+bounds\b/i, category: 'field_notes', strength: 'probable',
    why: 'a metes-and-bounds description, which is a drawing written down' },
  { re: /\bmonument(ation)?\s+(record|report)\b/i, category: 'monument', strength: 'strong',
    why: 'a monument record: what was set on the ground, and where' },
  { re: /\b(control|benchmark)\s+(record|sheet|data)\b/i, category: 'monument', strength: 'probable',
    why: 'survey control data' },

  // ── Generic maps and CAD ─────────────────────────────────────────────────────────────────────
  { re: /\b(cad|autocad|\.dwg|\.dxf)\b/i, category: 'map', strength: 'strong',
    why: 'a CAD file' },
  { re: /\bexhibit\s+[a-z]\b.*\bmap\b|\bmap\s+exhibit\b/i, category: 'map', strength: 'probable',
    why: 'a map filed as an exhibit' },
  { re: /\b(sketch|drawing|diagram)\b/i, category: 'map', strength: 'weak',
    why: 'the label calls it a drawing, though not what kind' },
  { re: /\bmap\b/i, category: 'map', strength: 'weak',
    why: 'the label says map, which may or may not mean a survey product' },
];

/**
 * Is this document a drawing, and what kind?
 *
 * Looks at the label a clerk index gave it, not at the file. A `weak` match is still returned as a
 * drawing: this classification is used to SURFACE documents for a human to look at, never to
 * discard one, so a false positive costs a glance and a false negative loses the most useful
 * document on the property.
 */
export function classifyDrawing(
  label: string | null | undefined,
  declaredType?: string | null,
): DrawingMatch {
  // The LABEL alone, not label + declaredType concatenated.
  //
  // Concatenating them made the declared-type fallback at the bottom of this function
  // unreachable: classifyDrawing('Instrument 2004035448', 'plat') produced the text
  // "Instrument 2004035448 plat", which the bare /\bplat\b/ matched as a STRONG label match. The
  // adapter's own classification then never got its say, and a probable match was reported as a
  // certain one. Same class of bug as the pattern ordering above, found by the same test run.
  const text = (label ?? '').trim();
  if (!text && !declaredType) {
    return {
      isDrawing: false,
      category: null,
      reason: 'The document carries no label or type, so nothing can be said about it either way.',
      strength: 'weak',
    };
  }

  for (const p of text ? DRAWING_PATTERNS : []) {
    if (p.re.test(text)) {
      return {
        isDrawing: true,
        category: p.category,
        reason: `"${text.trim()}" — ${p.why}.`,
        strength: p.strength,
      };
    }
  }

  // The declared type is consulted last and on its own, so an adapter that already decided
  // "plat" is honoured even when the free-text label says nothing recognisable.
  if ((declaredType ?? '').toLowerCase() === 'plat') {
    return {
      isDrawing: true,
      category: 'plat',
      reason: 'The adapter classified this as a plat, though its label does not say so.',
      strength: 'probable',
    };
  }

  return {
    isDrawing: false,
    category: null,
    reason: text
      ? `"${text}" does not match any known drawing vocabulary.`
      : `The declared type "${declaredType}" is not a drawing type.`,
    strength: 'weak',
  };
}

/**
 * The searches worth running to go looking for drawings.
 *
 * A deed search returns drawings only by accident — it asks for a party name and takes whatever
 * comes back. These are the terms a clerk index actually files drawings under, so the hunt can ask
 * for them by name.
 *
 * Ordered by what a surveyor most wants to find. A recorded survey of THIS tract outranks the
 * subdivision plat, because it is somebody's completed retracement with monuments called for.
 */
export const DRAWING_SEARCH_TERMS: Array<{ term: string; why: string }> = [
  { term: 'PLAT OF SURVEY', why: 'a recorded retracement of this tract — the most useful single document there is' },
  { term: 'SURVEY', why: 'any recorded survey naming the property or its owners' },
  { term: 'FIELD NOTES', why: 'the metes and bounds a drawing was made from' },
  { term: 'PLAT', why: 'the subdivision plat, with lot dimensions and dedicated easements' },
  { term: 'REPLAT', why: 'a later plat action that may have moved a line since the original' },
  { term: 'RIGHT OF WAY MAP', why: 'road and utility alignments crossing or bounding the tract' },
  { term: 'EASEMENT EXHIBIT', why: 'the drawing attached to an easement, which is where its position actually lives' },
  { term: 'MONUMENT RECORD', why: 'what was set on the ground by an earlier surveyor' },
];

// ── C3: the drawings a document POINTS AT, read out of its own text ───────────────────────────────
//
// A deed or survey names the drawings it depends on — "being the same tract described in Cabinet A,
// Slide 312 of the Plat Records", "Volume 1234, Page 56", "the J. SMITH SURVEY, Abstract No. 123".
// Each of those is a document a surveyor would pull next, and until now nothing read them out of the
// text the reading pass produces. This turns the text into a list of citations the run can chase (or
// state as a miss); the fetch itself is a later slice.

export interface DrawingCitation {
  kind: 'cabinet-slide' | 'volume-page' | 'survey-abstract';
  /** The exact substring matched, so a reader can find it in the document. */
  raw: string;
  cabinet?: string;
  slide?: string;
  volume?: string;
  page?: string;
  abstract?: string;
}

/** A stable key so the same citation written twice (or in two documents) is listed once. */
export function citationKey(c: DrawingCitation): string {
  if (c.kind === 'cabinet-slide') return `cs|${(c.cabinet ?? '').toUpperCase()}|${c.slide}`;
  if (c.kind === 'volume-page') return `vp|${c.volume}|${c.page}`;
  return `sa|${c.abstract}`;
}

/**
 * Read the drawing/plat/survey citations out of one or more blocks of document text. Pure and
 * deduplicated; the raw match is kept from the FIRST time a citation is seen.
 */
export function citationsFromText(...texts: Array<string | null | undefined>): DrawingCitation[] {
  const out = new Map<string, DrawingCitation>();
  const add = (c: DrawingCitation) => { const k = citationKey(c); if (!out.has(k)) out.set(k, c); };

  for (const text of texts) {
    if (!text) continue;

    // "Cabinet A, Slide 312" / "Cab. A Sl. 312" / "Cabinet 2, Slides 5" — plat/map records.
    for (const m of text.matchAll(/\bcab(?:inet)?\.?\s*([A-Za-z0-9]{1,4})[.,\s]+sl(?:ide)?s?\.?\s*(\d{1,5})/gi)) {
      add({ kind: 'cabinet-slide', raw: m[0].trim(), cabinet: m[1], slide: m[2] });
    }

    // "Volume 1234, Page 56" / "Vol. 1234, Pg. 56" / "Vol 1234 Pg 56" — book-and-page records.
    for (const m of text.matchAll(/\bvol(?:ume)?\.?\s*(\d{1,6})[.,\s]+(?:pg|page)s?\.?\s*(\d{1,6})/gi)) {
      add({ kind: 'volume-page', raw: m[0].trim(), volume: m[1], page: m[2] });
    }

    // "Abstract No. 123" / "Abst. 123" / "A-123" — the survey abstract a tract sits in.
    for (const m of text.matchAll(/\b(?:abstract|abst)\.?\s*(?:no\.?|number|#)?\s*(\d{1,5})\b/gi)) {
      add({ kind: 'survey-abstract', raw: m[0].trim(), abstract: m[1] });
    }
    for (const m of text.matchAll(/\bA-(\d{1,5})\b/g)) {
      add({ kind: 'survey-abstract', raw: m[0].trim(), abstract: m[1] });
    }
  }

  return [...out.values()];
}

// ── C3 (miss half): a citation is either already on file, or a stated miss ────────────────────────
//
// Reading a citation out of a deed is only useful if the run then says whether it HAS that drawing.
// A referenced citation is "held" when a document we already filed IS that drawing — matched by the
// citation the document's own recording info/label carries, not its body text. What is left is a
// stated miss: named, so a surveyor knows exactly what to pull, even before the fetch is automated.
export interface CitationStatus {
  citation: DrawingCitation;
  held: boolean;
}

/** Mark each referenced citation held (a filed document already IS it) or a miss. Pure. */
export function reconcileCitations(referenced: DrawingCitation[], held: DrawingCitation[]): CitationStatus[] {
  const heldKeys = new Set(held.map(citationKey));
  return referenced.map((c) => ({ citation: c, held: heldKeys.has(citationKey(c)) }));
}

/** One line: how many referenced drawings are on file, and which are stated misses. */
export function describeReconciliation(statuses: CitationStatus[]): string {
  if (statuses.length === 0) return 'No plat, map-record or survey-abstract citation was found in the read text.';
  const misses = statuses.filter((s) => !s.held);
  const onFile = statuses.length - misses.length;
  const say = (c: DrawingCitation) =>
    c.kind === 'cabinet-slide' ? `Cabinet ${c.cabinet}, Slide ${c.slide}`
    : c.kind === 'volume-page' ? `Volume ${c.volume}, Page ${c.page}`
    : `Abstract No. ${c.abstract}`;
  const missNote = misses.length > 0
    ? ` Not yet retrieved (stated miss): ${misses.map((s) => say(s.citation)).join('; ')}.`
    : ' All are already on file.';
  return `${statuses.length} drawing citation(s) referenced in the text; ${onFile} already on file.${missNote}`;
}

/** One line naming what the text pointed at, for the run log and the hunt report. */
export function describeCitations(cites: DrawingCitation[]): string {
  if (cites.length === 0) return 'No plat, map-record or survey-abstract citation was found in the read text.';
  const say = (c: DrawingCitation) =>
    c.kind === 'cabinet-slide' ? `Cabinet ${c.cabinet}, Slide ${c.slide}`
    : c.kind === 'volume-page' ? `Volume ${c.volume}, Page ${c.page}`
    : `Abstract No. ${c.abstract}`;
  return `${cites.length} drawing citation(s) referenced in the text: ${cites.map(say).join('; ')}.`;
}

export interface DrawingHuntReport {
  /** Every document that looks like a drawing, strongest first. */
  found: Array<{ label: string; category: DrawingCategory; strength: DrawingMatch['strength']; reason: string }>;
  /** How many documents were examined. */
  examined: number;
  /** Terms that were searched for. Empty when the hunt only classified what was already retrieved. */
  searched: string[];
  summary: string;
}

/**
 * Classify a run's documents and report the drawings among them.
 *
 * The cheap half of the hunt: a drawing already retrieved and filed as `other` costs one string
 * match to find, and until now nothing was making that match.
 */
export function huntDrawings(
  documents: Array<{ label?: string | null; documentType?: string | null }>,
  searched: string[] = [],
): DrawingHuntReport {
  const found: DrawingHuntReport['found'] = [];

  for (const d of documents) {
    const m = classifyDrawing(d.label, d.documentType);
    if (m.isDrawing && m.category) {
      found.push({ label: d.label ?? '(unlabelled)', category: m.category, strength: m.strength, reason: m.reason });
    }
  }

  const rank = { strong: 0, probable: 1, weak: 2 } as const;
  found.sort((a, b) => rank[a.strength] - rank[b.strength]);

  return { found, examined: documents.length, searched, summary: describeHunt(found, documents.length, searched) };
}

function describeHunt(
  found: DrawingHuntReport['found'],
  examined: number,
  searched: string[],
): string {
  const searchNote = searched.length > 0
    ? ` ${searched.length} drawing-specific search term(s) were run.`
    : ' No drawing-specific search was run — this classified what the run had already retrieved.';

  if (found.length === 0) {
    // Never "no drawings exist". We looked at labels; a drawing filed under a word nobody has
    // written down yet is still out there, and saying otherwise invites a conclusion the run
    // did not test.
    return `No drawing was recognised among ${examined} document(s).${searchNote} ` +
      'That means none matched the known vocabulary — not that the county holds none.';
  }

  const byCat = new Map<DrawingCategory, number>();
  for (const f of found) byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1);
  const parts = [...byCat.entries()].map(([c, n]) => `${n} ${c.replace(/_/g, ' ')}`);
  const surveys = byCat.get('survey') ?? 0;

  return `${found.length} drawing(s) recognised among ${examined} document(s): ${parts.join(', ')}.` +
    (surveys > 0
      ? ` ${surveys} recorded survey(s) — somebody has already retraced this boundary; read those first.`
      : '') +
    searchNote;
}
