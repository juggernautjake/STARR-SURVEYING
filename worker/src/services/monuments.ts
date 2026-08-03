// worker/src/services/monuments.ts — the corner markers, read properly.
//
// The extraction already asks the model for monument descriptions and gets them: `BoundaryCall.
// toPoint` holds strings like `"a 5/8 inch iron rod with yellow cap stamped RPLS 5310 found"`. That
// text then travels through the whole platform untouched — nothing parses it, nothing can filter on
// it, and the field packet prints the sentence and no more.
//
// A crew is sent to a corner to FIND something. What they need is the thing itself: what it is, how
// big, what is stamped on the cap, and — before all of it — whether the last surveyor found it or
// set it.
//
// ── FOUND vs SET IS NOT A DETAIL ────────────────────────────────────────────────────────────────
//
// It is the distinction the whole of boundary retracement rests on.
//
//   FOUND       existing physical evidence. If it is original, it CONTROLS the corner — it outranks
//               the record distance, because the monument is where the parties actually put the
//               line.
//   SET         the previous surveyor's OPINION of where the corner is, made permanent. It is
//               evidence of that surveyor's conclusion, not of the original survey.
//   CALLED FOR  the deed says a monument is there. Whether it still is, nobody has said.
//
// Treating a set rod as found evidence is how a boundary drifts: surveyor A sets a rod a foot off,
// surveyor B "finds" it and holds it, and the error is now permanent and has a paper trail.
//
// So `status` is NEVER guessed. Text that does not say gets `unknown`, and `unknown` is reported as
// a question for the field rather than defaulted to either. Defaulting to `found` would manufacture
// controlling evidence; defaulting to `set` would discard it.

export type MonumentKind =
  | 'iron_rod' | 'iron_pipe' | 'concrete_monument' | 'pk_nail' | 'mag_nail'
  | 'railroad_spike' | 'fence_post' | 'fence_corner' | 'stone' | 'axle'
  | 'cross_in_concrete' | 'drill_hole' | 'wood_stake' | 'tree' | 'unknown';

export type MonumentStatus = 'found' | 'set' | 'called_for' | 'not_found' | 'unknown';

export interface Monument {
  kind: MonumentKind;
  status: MonumentStatus;
  /** Nominal diameter as written — `1/2"`, `5/8"`, `3/4"`. Null when not stated. */
  size: string | null;
  /** Cap or stamping text — usually the setting surveyor's registration number. */
  cap: string | null;
  /** RPLS / RPS registration number pulled out of the cap text, when present. */
  rpls: string | null;
  /** Reported condition: bent, disturbed, broken, flush, below grade… */
  condition: string | null;
  /** The text this was read from, kept so a person can always check the parse. */
  raw: string;
  /** What a field crew should be told. */
  statement: string;
  /** True when the status could not be established — the run must ASK, not assume. */
  statusUncertain: boolean;
}

// ── Kind ────────────────────────────────────────────────────────────────────────────────────────
//
// Order matters: the more specific pattern wins. "iron pipe" must be tested before "iron", and
// "concrete monument" before "concrete", or a pipe becomes a rod and a monument becomes a nail.
const KIND_PATTERNS: Array<[MonumentKind, RegExp]> = [
  ['cross_in_concrete', /\b(?:x|cross|chisel(?:ed)?\s+(?:x|cross))\s+(?:cut\s+)?in\s+concrete\b/i],
  ['concrete_monument', /\b(?:concrete\s+monument|conc\.?\s+mon\.?|c\.?m\.?\b|type\s+i+\s+monument)/i],
  ['iron_pipe',         /\b(?:iron\s+pipe|ip[fs]?\b|i\.?p\.?\b)/i],
  ['iron_rod',          /\b(?:iron\s+(?:rod|pin|stake)|rebar|re-?bar|ir[fs]?\b|cir[fs]?\b|i\.?r\.?\b)/i],
  ['railroad_spike',    /\b(?:railroad|r\.?r\.?)\s+spike\b/i],
  ['mag_nail',          /\bmag\s*nail\b/i],
  ['pk_nail',           /\b(?:p\.?k\.?\s*nail|pk\b)/i],
  ['drill_hole',        /\bdrill\s*hole\b/i],
  ['fence_corner',      /\bfence\s+corner\b/i],
  ['fence_post',        /\b(?:fence\s+post|corner\s+post)\b/i],
  ['wood_stake',        /\b(?:wood(?:en)?\s+stake|hub(?:\s+and\s+tack)?)\b/i],
  ['axle',              /\b(?:axle|axel)\b/i],
  ['stone',             /\b(?:stone|rock)\s*(?:mound|marker)?\b/i],
  ['tree',              /\b(?:\d+["']?\s*)?(?:oak|elm|cedar|pecan|mesquite|hackberry|post\s+oak)\b/i],
];

/** Which physical object is this? `unknown` when the text names none — a call reading "to a point"
 *  marks a mathematical corner with nothing in the ground, which is a real and common thing and must
 *  not be dressed up as a monument. */
export function monumentKind(text: string): MonumentKind {
  const t = text ?? '';
  for (const [kind, re] of KIND_PATTERNS) if (re.test(t)) return kind;
  return 'unknown';
}

// ── Status ──────────────────────────────────────────────────────────────────────────────────────

/** Found, set, merely called for, or unsaid.
 *
 *  The abbreviations carry it as their last letter — IRF/IRS, IPF/IPS, CIRF — and those are checked
 *  before the words, because a plat legend is nearly always abbreviated while a deed is nearly
 *  always prose.
 *
 *  Nothing here infers. "an iron rod" alone is `unknown`, not `found`: the deed simply did not say,
 *  and inventing a status either creates controlling evidence that may not exist or discards
 *  evidence that does. */
export function monumentStatus(text: string): MonumentStatus {
  const t = (text ?? '').toLowerCase();

  // Explicitly searched for and absent. Checked FIRST — "iron rod found" is a substring of "iron rod
  // not found", and testing `found` first would inverted the single most consequential field here.
  if (/\b(?:not\s+found|none\s+found|no\s+monument\s+found|missing|destroyed|obliterated)\b/.test(t)) {
    return 'not_found';
  }
  // Abbreviated forms: the trailing F/S is the status.
  if (/\b(?:c?ir|ip|cm)f\b/.test(t)) return 'found';
  if (/\b(?:c?ir|ip|cm)s\b/.test(t)) return 'set';

  if (/\b(?:found|fnd\.?|recovered|located)\b/.test(t)) return 'found';
  if (/\b(?:set|placed|established)\b/.test(t)) return 'set';
  // The deed says one is there; nobody has reported looking.
  if (/\b(?:called\s+for|per\s+(?:deed|plat)|of\s+record|as\s+(?:shown|called))\b/.test(t)) return 'called_for';

  return 'unknown';
}

// ── Detail ──────────────────────────────────────────────────────────────────────────────────────

/** Nominal size as written. Fractions are kept as fractions — a surveyor searching a fence line
 *  looks for a "half inch rod", and 0.5 tells them nothing they can hold up against one. */
export function monumentSize(text: string): string | null {
  const m = /(\d+\s*[-/]\s*\d+|\d+(?:\.\d+)?)\s*(?:"|''|\s*inch(?:es)?\b)/i.exec(text ?? '');
  if (!m) return null;
  return `${m[1].replace(/\s+/g, '')}"`;
}

/** Cap or stamping text. This is how a crew tells one surveyor's rod from another's standing at the
 *  same corner, and it is often the only way to date a monument. */
export function monumentCap(text: string): string | null {
  const t = text ?? '';
  const quoted = /(?:cap|stamped|marked)\s*(?:stamped\s*)?["“']([^"”']+)["”']/i.exec(t);
  if (quoted) return quoted[1].trim();
  const plain = /(?:with\s+(?:a\s+)?)?(?:(\w+)\s+)?cap(?:\s+stamped|\s+marked)?\s+([A-Z0-9][A-Z0-9\s.#-]{2,30})/i.exec(t);
  if (plain) return plain[2].trim().replace(/[.,;]$/, '');
  const stamped = /(?:stamped|marked)\s+([A-Z0-9][A-Z0-9\s.#-]{2,30})/i.exec(t);
  if (stamped) return stamped[1].trim().replace(/[.,;]$/, '');
  return null;
}

/** The registration number, which is what actually identifies the setting surveyor. */
export function monumentRpls(text: string): string | null {
  const m = /\b(?:rpls|rls|lsls|ls|psl)\.?\s*#?\s*(\d{3,6})\b/i.exec(text ?? '');
  return m ? m[1] : null;
}

const CONDITIONS = [
  'bent', 'disturbed', 'broken', 'leaning', 'flush', 'below grade', 'above grade',
  'in concrete', 'under asphalt', 'buried', 'damaged', 'illegible',
];

export function monumentCondition(text: string): string | null {
  const t = (text ?? '').toLowerCase();
  const hits = CONDITIONS.filter((c) => t.includes(c));
  return hits.length > 0 ? hits.join(', ') : null;
}

// ── The whole thing ─────────────────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<MonumentKind, string> = {
  iron_rod: 'iron rod', iron_pipe: 'iron pipe', concrete_monument: 'concrete monument',
  pk_nail: 'PK nail', mag_nail: 'mag nail', railroad_spike: 'railroad spike',
  fence_post: 'fence post', fence_corner: 'fence corner', stone: 'stone',
  axle: 'axle', cross_in_concrete: 'X in concrete', drill_hole: 'drill hole',
  wood_stake: 'wood stake', tree: 'tree', unknown: 'unspecified marker',
};

/** Read a monument out of a call's `toPoint` text.
 *
 *  Returns null when the text names no physical object AND says nothing about status — "to a point"
 *  or "to the place of beginning" are mathematical corners, and reporting them as monuments would
 *  send a crew looking for something nobody ever claimed was there. */
export function parseMonument(text: string | null | undefined): Monument | null {
  const raw = (text ?? '').trim();
  if (!raw) return null;

  const kind = monumentKind(raw);
  const status = monumentStatus(raw);
  if (kind === 'unknown' && status === 'unknown') return null;

  const size = monumentSize(raw);
  const cap = monumentCap(raw);
  const rpls = monumentRpls(raw);
  const condition = monumentCondition(raw);

  const described = [size, KIND_LABEL[kind]].filter(Boolean).join(' ');
  const capPart = cap ? ` with cap "${cap}"` : '';
  const rplsPart = rpls && (!cap || !cap.includes(rpls)) ? ` (RPLS ${rpls})` : '';
  const condPart = condition ? `, reported ${condition}` : '';

  let statement: string;
  switch (status) {
    case 'found':
      statement =
        `FOUND: ${described}${capPart}${rplsPart}${condPart}. Existing physical evidence — if original, ` +
        `it CONTROLS this corner over the record distance. Verify it is undisturbed before holding it.`;
      break;
    case 'set':
      statement =
        `SET: ${described}${capPart}${rplsPart}${condPart}. This is the previous surveyor's OPINION of the ` +
        `corner, not evidence of the original survey. Do not hold it as original.`;
      break;
    case 'called_for':
      statement =
        `CALLED FOR: ${described}${capPart}${rplsPart}. The record says it is here; nobody has reported ` +
        `looking. Search for it — finding it is the strongest evidence available for this corner.`;
      break;
    case 'not_found':
      statement =
        `NOT FOUND: ${described}${capPart}${rplsPart} was searched for and not recovered. The corner must be ` +
        `re-established from other evidence, and that reconstruction is a judgement to record.`;
      break;
    default:
      statement =
        `${described}${capPart}${rplsPart}${condPart} — the record does NOT say whether it was found or set. ` +
        `That is the difference between controlling evidence and one surveyor's opinion, so it has to be ` +
        `settled in the field rather than assumed here.`;
  }

  return { kind, status, size, cap, rpls, condition, raw, statement, statusUncertain: status === 'unknown' };
}

// ── Across a whole boundary ─────────────────────────────────────────────────────────────────────

export interface MonumentSummary {
  total: number;
  found: number;
  set: number;
  calledFor: number;
  notFound: number;
  unknownStatus: number;
  /** Distinct registration numbers seen — usually the surveyors whose work is in the ground. */
  rplsNumbers: string[];
  statement: string;
}

/** What the corners of this property look like, in one paragraph.
 *
 *  Leads with FOUND, because that is what a crew goes looking for and what controls the boundary,
 *  and names the unknown-status count explicitly — a monument whose status nobody recorded is a
 *  question, and a summary that folds it into "12 monuments" has answered it by accident. */
export function summariseMonuments(monuments: Monument[]): MonumentSummary {
  const by = (s: MonumentStatus) => monuments.filter((m) => m.status === s).length;
  const rplsNumbers = [...new Set(monuments.map((m) => m.rpls).filter((r): r is string => !!r))];

  const summary: MonumentSummary = {
    total: monuments.length,
    found: by('found'),
    set: by('set'),
    calledFor: by('called_for'),
    notFound: by('not_found'),
    unknownStatus: by('unknown'),
    rplsNumbers,
    statement: '',
  };

  if (monuments.length === 0) {
    summary.statement =
      'No monuments were described in the calls. That is a statement about the DOCUMENT, not about the ' +
      'ground — corners may well be monumented without the deed saying so.';
    return summary;
  }

  const parts = [`${summary.found} monument(s) reported FOUND — the evidence that controls corners.`];
  if (summary.calledFor > 0) parts.push(`${summary.calledFor} called for by the record but not reported looked for.`);
  if (summary.notFound > 0) parts.push(`${summary.notFound} searched for and NOT recovered — those corners need re-establishing.`);
  if (summary.set > 0) parts.push(`${summary.set} SET by a previous surveyor — opinion, not original evidence.`);
  if (summary.unknownStatus > 0) {
    parts.push(
      `${summary.unknownStatus} whose status the record does not give: neither found nor set is stated, so ` +
        `whether they control is an open question for the field.`,
    );
  }
  if (rplsNumbers.length > 0) parts.push(`Registration numbers in the ground: ${rplsNumbers.join(', ')}.`);

  summary.statement = parts.join(' ');
  return summary;
}
