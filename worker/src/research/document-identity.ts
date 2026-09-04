// worker/src/research/document-identity.ts — never pay twice for the same document (plan S-12).
//
// The owner's requirement: when a run escalates to paid sources, it must not buy a document it
// already has — whether that came free from a county portal or was already bought from a different
// paid site.
//
// That needs a document identity that is stable ACROSS VENDORS, and the same instrument is cited
// differently by every one of them. Real examples collected while building the six adapters:
//
//     Kofile       2019-3389        1981-147096
//     Tyler Eagle  2025028512
//     eDocTec      395664
//     Avenu        OR/00062/223     DT/0000L/150     (no instrument numbers at all)
//     Aumentum     8577             8577 347-249
//     iDocMarket   2026-02531
//     GLO          file 000001A     (a grant, not a conveyance — see below)
//
// ── THE ASYMMETRY THAT DECIDES EVERY TIE ────────────────────────────────────────────────────────
//
// Deduplication is a SPENDING decision, and its two failure modes are not equally bad:
//
//   A FALSE MATCH  — we think we already have it, so we skip buying. The research is silently
//                    short, the missing document is invisible, and nothing downstream contradicts
//                    it. This is the defect this whole project exists to prevent.
//
//   A FALSE MISS   — we buy a duplicate. It costs a few dollars and appears in the ledger, where
//                    somebody can see it and fix it.
//
// So: WHEN IDENTITY IS UNCERTAIN, BUY. Every function here is built to fail toward spending money
// rather than toward omitting a document.

/** Where a document came from, which decides whether skipping it saves anything. */
export type SourceCost = 'free' | 'paid';

export interface DocumentRef {
  /** County name — always required. The same instrument number exists in many counties. */
  county: string;
  /** The vendor's instrument/document number, exactly as it printed it. */
  instrumentNumber?: string;
  /** Book/volume/page citation, for vendors that publish no instrument number. */
  book?: string;
  page?: string;
  /** Series prefix some vendors carry (OR = Official Records, DT = Deed of Trust). */
  series?: string;
  /** Recording/filing date, any format the vendor used. */
  recordingDate?: string;
  vendor?: string;
  cost?: SourceCost;
}

/** Normalise an instrument number so the same document matches across vendors.
 *
 *  Strips punctuation and leading zeros, uppercases, and collapses whitespace. `2019-3389` and
 *  `20193389` become the same string; `000001A` becomes `1A`.
 *
 *  Deliberately NOT clever beyond that. A looser rule — dropping a trailing letter, say — would make
 *  `000001` and `000001A` collide, and those are two different Bell County grants. */
export function normaliseInstrument(raw: string | undefined): string {
  if (!raw) return '';
  // Strip padding from EACH segment before joining, not just the front of the whole string.
  // `OR/00062/223` and `OR/62/223` are the same citation, and joining first would leave the
  // interior zeros in place and treat them as different documents.
  const segments = raw.toUpperCase().split(/[\s.\-#/\\]+/).filter(Boolean);
  if (segments.length === 0) return '';
  return segments.map((s) => s.replace(/^0+(?=.)/, '')).join('');
}

/** Instrument numbers of the form YYYYNNNNNN carry their filing year. Nine digits or more after a
 *  plausible year: 1982002520 (10), 201600013474 (12). Anything shorter may repeat across years. */
export function yearStamped(instrument: string): boolean {
  return /^(19|20)\d{2}\d{5,}$/.test(instrument);
}

/** Normalise a book/page citation into `BOOK-PAGE`, dropping display padding.
 *
 *  Volumes can be LETTERED — Robertson's 19th-century volumes are `0000U`, `0000R` — so this stays
 *  a string. Parsing it as a number yields NaN and merges every lettered volume into one. */
export function normaliseBookPage(book: string | undefined, page: string | undefined): string {
  const b = (book ?? '').toUpperCase().replace(/[\s.\-#/\\]+/g, '').replace(/^0+(?=.)/, '');
  const p = (page ?? '').toUpperCase().replace(/[\s.\-#/\\]+/g, '').replace(/^0+(?=.)/, '');
  if (!b || !p) return '';
  return `${b}-${p}`;
}

/** Normalise a date to `YYYY-MM-DD`, or '' when it cannot be read.
 *
 *  Returning '' rather than guessing matters: an unparsed date must not silently become part of a
 *  key, because two documents with unreadable dates would then look identical. */
export function normaliseDate(raw: string | undefined): string {
  if (!raw) return '';
  const t = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return '';
}

export function normaliseCounty(raw: string | undefined): string {
  return (raw ?? '').replace(/\s+county$/i, '').trim().toUpperCase();
}

/** The identity key, or null when the reference cannot identify a document at all. */
export function identityKey(ref: DocumentRef): string | null {
  const county = normaliseCounty(ref.county);
  if (!county) return null;

  const instrument = normaliseInstrument(ref.instrumentNumber);
  const citation = normaliseBookPage(ref.book, ref.page);
  const date = normaliseDate(ref.recordingDate);

  // Instrument number is the strongest identifier. Date is part of the key because instrument
  // numbers RESTART in some counties — a 1994 and a 2011 document can share a number, and merging
  // them would produce one document with both sets of parties.
  // ── A YEAR-STAMPED INSTRUMENT NUMBER IS ITS OWN DATE ───────────────────────────────────────
  //
  // Bell (and every Tyler/Kofile county) numbers instruments YYYYNNNNNN: 1982002520 is the
  // 2,520th filing of 1982, 2024039298 the 39,298th of 2024. The year the date was guarding
  // against is inside the number, so the number alone is the identity — and it must be the SAME
  // key whether or not this filing carried a recording date, or the two roads a plat arrives by
  // (the plat upload without a date, the clerk sink with one) file it twice. On 2026-09-04 plat
  // 1982002520 was on file three times, every row with a null key.
  if (instrument && yearStamped(instrument)) return `${county}|I:${instrument}`;
  if (instrument && date) return `${county}|I:${instrument}|${date}`;
  if (citation && date) return `${county}|B:${citation}|${date}`;

  // Without a date we cannot safely key on a number that may repeat across years.
  return null;
}

export type MatchVerdict =
  | { kind: 'same'; key: string }
  | { kind: 'different' }
  | { kind: 'uncertain'; reason: string };

/** Decide whether two references are the same document.
 *
 *  Returns `uncertain` rather than guessing whenever the evidence is incomplete — and callers must
 *  treat `uncertain` as "buy it", per the asymmetry at the top of this file. */
export function compareDocuments(a: DocumentRef, b: DocumentRef): MatchVerdict {
  const ka = identityKey(a);
  const kb = identityKey(b);

  if (ka && kb) {
    if (ka === kb) return { kind: 'same', key: ka };
    // Both fully identified and the keys differ — genuinely different documents.
    if (normaliseCounty(a.county) === normaliseCounty(b.county)) {
      const ia = normaliseInstrument(a.instrumentNumber);
      const ib = normaliseInstrument(b.instrumentNumber);
      // Same instrument, different date: this is the restart case, and it is exactly where a
      // careless rule would merge two unrelated conveyances.
      if (ia && ia === ib) {
        return {
          kind: 'uncertain',
          reason:
            `Same county and instrument (${ia}) but different recording dates ` +
            `(${normaliseDate(a.recordingDate) || '?'} vs ${normaliseDate(b.recordingDate) || '?'}). ` +
            `Instrument numbers restart in some counties, so these may be two different documents.`,
        };
      }
    }
    return { kind: 'different' };
  }

  if (normaliseCounty(a.county) !== normaliseCounty(b.county)) return { kind: 'different' };

  // At least one side could not be keyed. Say what is missing rather than assuming either way.
  const missing = !ka ? a : b;
  const why = !normaliseDate(missing.recordingDate)
    ? 'no readable recording date'
    : 'no instrument number and no book/page citation';
  return {
    kind: 'uncertain',
    reason: `Cannot identify one of the documents (${why}) — treat as NOT already held and buy it.`,
  };
}

export interface HeldDocument extends DocumentRef {
  key: string;
  cost: SourceCost;
}

export interface PurchaseDecision {
  buy: boolean;
  reason: string;
  /** True when we are buying despite a possible match, so the run can report it. */
  underUncertainty: boolean;
  matchedKey?: string;
}

/** What we already have, and whether a candidate needs buying.
 *
 *  Free documents are registered here BEFORE any paid source is queried (plan S-14) — ordering is
 *  what prevents paying for something a free source was about to return. Filtering afterwards does
 *  not, because by then the money is gone. */
export class DocumentIndex {
  private held = new Map<string, HeldDocument>();
  /** References we could not key. Kept so their count can be reported, not silently dropped. */
  private unkeyable: DocumentRef[] = [];

  /** Register a document we now hold. Returns false when it could not be keyed. */
  register(ref: DocumentRef, cost: SourceCost): boolean {
    const key = identityKey(ref);
    if (!key) {
      this.unkeyable.push(ref);
      return false;
    }
    // A free copy supersedes a paid one for reporting purposes: what matters later is that we have
    // it, and that we did not need to pay again.
    const existing = this.held.get(key);
    if (!existing || (existing.cost === 'paid' && cost === 'free')) {
      this.held.set(key, { ...ref, key, cost });
    }
    return true;
  }

  has(ref: DocumentRef): boolean {
    const key = identityKey(ref);
    return key !== null && this.held.has(key);
  }

  get size(): number {
    return this.held.size;
  }

  get unkeyableCount(): number {
    return this.unkeyable.length;
  }

  all(): HeldDocument[] {
    return [...this.held.values()];
  }

  /** Should we pay for this candidate?
   *
   *  Fails toward BUYING. A false match omits a document we do not have and hides the fact; a false
   *  miss costs a few dollars and shows up in the ledger. */
  decide(candidate: DocumentRef): PurchaseDecision {
    const key = identityKey(candidate);

    if (!key) {
      return {
        buy: true,
        underUncertainty: true,
        reason:
          'The candidate could not be identified (no date, or no instrument/book-page), so it cannot ' +
          'be matched against what we hold. Buying: a skipped document we do not have is unrecoverable.',
      };
    }

    const exact = this.held.get(key);
    if (exact) {
      return {
        buy: false,
        underUncertainty: false,
        matchedKey: key,
        reason: `Already held from a ${exact.cost} source (${exact.vendor ?? 'unknown vendor'}) — key ${key}.`,
      };
    }

    // No exact match. Look for a near miss worth flagging, but still buy.
    for (const h of this.held.values()) {
      const v = compareDocuments(candidate, h);
      if (v.kind === 'uncertain') {
        return {
          buy: true,
          underUncertainty: true,
          matchedKey: h.key,
          reason: `Possible match against ${h.key}, but not certain: ${v.reason} Buying rather than risking an omission.`,
        };
      }
    }

    return { buy: true, underUncertainty: false, reason: `Not held — key ${key}.` };
  }

  /** A sentence a run can put in its report. */
  describe(): string {
    const free = this.all().filter((d) => d.cost === 'free').length;
    const paid = this.all().length - free;
    const parts = [`${this.size} document(s) held (${free} free, ${paid} paid).`];
    if (this.unkeyable.length > 0) {
      parts.push(
        `${this.unkeyable.length} could NOT be keyed and are excluded from duplicate checks — ` +
          `anything matching them will be bought again.`,
      );
    }
    return parts.join(' ');
  }
}
