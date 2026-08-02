// worker/src/adapters/edoctec-results-parser.ts — the party-row result model (plan R39).
//
// eDocTec is a vendor the platform did not know existed. It was found on 2026-08-02 while looking
// for Coryell's portal, and it serves at least two counties inside the 80-mile ring:
//
//     Coryell   https://mclennan.edoctec.com/CoryellPublicRecords    12,705 docs / 20,267 records
//     Lampasas  https://mclennan.edoctec.com/LampasasPublicRecords
//
// Both are fully open — no login, no paywall — and current to within days.
//
// ── WHY THIS IS NOT THE KOFILE PARSER ───────────────────────────────────────────────────────────
//
// Kofile returns one row per DOCUMENT, with a Grantor cell and a Grantee cell. eDocTec returns one
// row per PARTY:
//
//     Instrument No | Filed Date | Party Type | Full Name | Document Type | Book/Volume | Page/Line
//     212478        | 07/28/2026 | Grantor    | SMITH, CHRISTOPHER D. | SPECIAL WARRANTY DEED | 0 | 0
//     212478        | 07/28/2026 | Grantor    | SMITH, SONYA N.       | SPECIAL WARRANTY DEED | 0 | 0
//
// The same instrument appears once per party. The site's own counters say so out loud — Coryell
// reports "12,705 Documents / 20,267 Total Records" for one search. Feeding those rows to the chain
// walker as documents would count the same deed once per grantor.
//
// So rows are grouped back into documents by instrument number.
//
// ── THE TRAP THAT MATTERS MORE ──────────────────────────────────────────────────────────────────
//
// A party search returns only the rows whose party MATCHED. Searching LastName=SMITH on Lampasas
// returned instrument 212478 with two Grantors and no Grantee — because the grantee is not a Smith.
// The grantee exists. It is simply not in this result set.
//
// Recording that document as "grantee: none" would be this project's recurring defect exactly: an
// unknown rendered as an answer. It would also stop the chain walker dead, since a deed with no
// grantee has nothing to walk to.
//
// Every document assembled from a party search therefore carries `partiesComplete: false`, and
// callers must re-read the document itself (or run a document search on the instrument number)
// before treating its party list as the whole story.

import type { ParsedRow } from './kofile-results-parser.js';

/** The columns eDocTec serves. Its own set — it shares no header text with Kofile beyond the
 *  document type, so it gets its own table rather than polluting Kofile's. */
export type EdocField =
  | 'instrument' | 'filedDate' | 'partyType' | 'fullName'
  | 'docType' | 'book' | 'page' | 'pageCount';

const HEADER_SYNONYMS: Array<[RegExp, EdocField]> = [
  [/^inst(rument)?\s*(no\.?|number|#)$/i, 'instrument'],
  [/^(filed|file|recorded|recording)\s*date$/i, 'filedDate'],
  [/^party\s*type$/i, 'partyType'],
  [/^(full\s*name|party\s*name|name)$/i, 'fullName'],
  [/^(doc(ument)?\s*type|instrument\s*type)$/i, 'docType'],
  [/^book\s*\/?\s*volume$/i, 'book'],
  [/^page\s*\/?\s*line$/i, 'page'],
  [/^pages$/i, 'pageCount'],
];

export function fieldForHeader(header: string): EdocField | null {
  const h = (header ?? '').replace(/\s+/g, ' ').trim();
  if (!h) return null;
  for (const [re, field] of HEADER_SYNONYMS) if (re.test(h)) return field;
  return null;
}

/** Without these a party row cannot be grouped or attributed. `book`/`page` are not required —
 *  eDocTec writes literal "0" for both on modern electronically-filed instruments. */
export const REQUIRED_FIELDS: EdocField[] = ['instrument', 'filedDate', 'partyType', 'fullName', 'docType'];

export interface ColumnMap {
  index: Partial<Record<EdocField, number>>;
  /** Headers that matched nothing — reported, never guessed around. "Actions" is expected here. */
  unmapped: string[];
  missing: EdocField[];
}

export function mapColumns(headers: string[]): ColumnMap {
  const index: ColumnMap['index'] = {};
  const unmapped: string[] = [];

  headers.forEach((h, i) => {
    const text = (h ?? '').trim();
    if (!text) return; // structural icon column
    const field = fieldForHeader(text);
    if (field) {
      if (index[field] === undefined) index[field] = i;
    } else {
      unmapped.push(text);
    }
  });

  return { index, unmapped, missing: REQUIRED_FIELDS.filter((f) => index[f] === undefined) };
}

/** A single party row, before grouping. */
export interface PartyRow {
  instrumentNumber: string;
  filedDate: string;
  partyType: string;
  fullName: string;
  documentType: string;
  book?: string;
  page?: string;
}

/** eDocTec writes "0" into Book/Volume and Page/Line for instruments that were never in a book.
 *  Storing "0/0" as a book-and-page citation would invent a citation that does not exist. */
const ABSENT_BOOK_PAGE = /^0*$/;

function bookPage(book: string, page: string): string | undefined {
  const b = (book ?? '').trim();
  const p = (page ?? '').trim();
  if (!b || ABSENT_BOOK_PAGE.test(b)) return undefined;
  if (!p || ABSENT_BOOK_PAGE.test(p)) return b;
  return `${b}/${p}`;
}

export function parseRow(cells: string[], map: ColumnMap): PartyRow | null {
  const at = (f: EdocField): string => {
    const i = map.index[f];
    return i === undefined ? '' : (cells[i] ?? '').trim();
  };

  const instrumentNumber = at('instrument');
  const fullName = at('fullName');
  // A row with no instrument cannot be grouped; a row with no name carries nothing. Both are
  // dropped rather than stored as blanks that later read as real parties.
  if (!instrumentNumber || !fullName) return null;

  return {
    instrumentNumber,
    filedDate: at('filedDate'),
    partyType: at('partyType'),
    fullName,
    documentType: at('docType'),
    book: bookPage(at('book'), at('page')),
  };
}

/** Party-type text → which side of the conveyance. eDocTec uses the plain words, but grantor-side
 *  and grantee-side synonyms appear on other instrument classes (a lien has a Debtor and a Secured
 *  Party, a deed of trust a Trustor and a Beneficiary). */
export type Side = 'grantor' | 'grantee' | 'unknown';

export function sideForPartyType(partyType: string): Side {
  const t = (partyType ?? '').trim();
  if (/^(grantor|debtor|trustor|mortgagor|seller|assignor|lessor)/i.test(t)) return 'grantor';
  if (/^(grantee|secured\s*party|beneficiary|mortgagee|buyer|assignee|lessee)/i.test(t)) return 'grantee';
  return 'unknown';
}

/** A document reassembled from its party rows. */
export interface GroupedDocument extends ParsedRow {
  /** FALSE for anything built from a party search — see the header. The parties present are the
   *  ones that matched the search term, not the document's full party list. */
  partiesComplete: boolean;
  /** Parties whose type did not map to a side. Kept, because dropping a party silently loses a
   *  person from the chain; a human decides what a "Filer" is. */
  unclassified: string[];
  /** How many rows the site served for this instrument. */
  rowCount: number;
}

export interface GroupOptions {
  /** True only when the rows came from a DOCUMENT search (which returns every party), false for a
   *  party search. Defaults to false: assuming completeness is the dangerous direction. */
  complete?: boolean;
}

/** Group party rows back into documents.
 *
 *  Keyed on instrument number AND filed date. Instrument numbers restart in some counties, and two
 *  documents sharing a number across years must not merge into one deed with four grantors. */
export function groupByInstrument(rows: PartyRow[], opts: GroupOptions = {}): GroupedDocument[] {
  const complete = opts.complete ?? false;
  const byKey = new Map<string, GroupedDocument>();

  for (const row of rows) {
    const key = `${row.instrumentNumber}::${row.filedDate}`;
    let doc = byKey.get(key);
    if (!doc) {
      doc = {
        instrumentNumber: row.instrumentNumber,
        documentType: row.documentType,
        recordingDate: row.filedDate,
        grantors: [],
        grantees: [],
        bookVolumePage: row.book,
        partiesComplete: complete,
        unclassified: [],
        rowCount: 0,
      };
      byKey.set(key, doc);
    }

    doc.rowCount += 1;
    // Book/page can be blank on one row and present on another; keep the first real value.
    if (!doc.bookVolumePage && row.book) doc.bookVolumePage = row.book;

    const side = sideForPartyType(row.partyType);
    const bucket = side === 'grantor' ? doc.grantors : side === 'grantee' ? doc.grantees : doc.unclassified;
    // The same name can legitimately appear twice (grantor and trustee); dedupe within a side only.
    if (!bucket.includes(row.fullName)) bucket.push(row.fullName);
  }

  return [...byKey.values()];
}

export interface ParseReport {
  documents: GroupedDocument[];
  /** Rows the site served. Distinct from `documents.length` — that difference is the whole point. */
  rowsSeen: number;
  rowsParsed: number;
  map: ColumnMap;
  /** True when the header row could not be mapped well enough to trust anything below it. */
  unusable: boolean;
}

export function parseResults(headers: string[], rows: string[][], opts: GroupOptions = {}): ParseReport {
  const map = mapColumns(headers);
  const unusable = map.missing.length > 0;

  // A table whose headers did not map is not parsed at all. Reading it positionally is how a
  // document type becomes a grantor.
  const parsed = unusable ? [] : rows.map((r) => parseRow(r, map)).filter((r): r is PartyRow => r !== null);

  return {
    documents: groupByInstrument(parsed, opts),
    rowsSeen: rows.length,
    rowsParsed: parsed.length,
    map,
    unusable,
  };
}

/** A sentence a human can act on. */
export function describeParse(report: ParseReport, county: string): string {
  if (report.unusable) {
    return (
      `${county}: results table NOT parsed — missing required column(s): ${report.map.missing.join(', ')}. ` +
      `Headers seen: ${report.map.unmapped.join(', ') || '(none recognised)'}. ` +
      `Treat as unread, NOT as "no records".`
    );
  }

  const parts = [
    `${county}: ${report.rowsParsed}/${report.rowsSeen} party rows → ${report.documents.length} document(s).`,
  ];
  if (report.documents.length > 0 && !report.documents[0].partiesComplete) {
    parts.push(
      'Party lists are PARTIAL (party search returns only matching parties) — re-read each document ' +
        'before relying on its grantee.',
    );
  }
  const unclassified = report.documents.reduce((n, d) => n + d.unclassified.length, 0);
  if (unclassified > 0) parts.push(`${unclassified} part(y|ies) had an unrecognised party type and were kept unclassified.`);
  if (report.map.unmapped.length > 0) parts.push(`Unmapped columns: ${report.map.unmapped.join(', ')}.`);
  return parts.join(' ');
}
