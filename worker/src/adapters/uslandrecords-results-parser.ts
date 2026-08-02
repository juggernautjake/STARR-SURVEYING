// worker/src/adapters/uslandrecords-results-parser.ts — party rows keyed on book/page (plan R39).
//
// Read off Robertson and Falls on 2026-08-02. The grid's own header row:
//
//     File Date | Name/Corporation | Book/Vol/Page | Pages | Type Desc. | Type | View Img. | Add to Basket
//
// Two things make this vendor different from every other one here:
//
// 1. THERE IS NO INSTRUMENT NUMBER. The only citation is `OR/00062/223` — series, volume, page. So
//    a document's identity is its book-and-page, and the volume is not numeric: Robertson's 19th
//    century volumes are lettered (`OR/0000U/271`, `OR/0000R/226`). Parsing the volume as a number
//    turns volume "0000U" into NaN and silently merges every lettered volume into one.
//
// 2. `Type` is the PARTY ROLE, not the document type — GR is grantor, GT is grantee. The document
//    type lives in `Type Desc.`. Reading the columns by position and taking the last one as the
//    type would file every deed under "GR".
//
// Like eDocTec, this is one row per PARTY, so rows group back into documents — and like eDocTec, a
// name search returns only the parties that MATCHED, so the resulting party lists are partial.

import type { ParsedRow } from './kofile-results-parser.js';

export const USLR_HEADERS = ['File Date', 'Name/Corporation', 'Book/Vol/Page', 'Pages', 'Type Desc.', 'Type'] as const;

/** Header text → index. Read from the grid rather than assumed, so a county that adds a column
 *  does not shift every field by one. */
export function mapColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const t = (h ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (/^file date$/.test(t)) map.fileDate = i;
    else if (/^name\/corporation$/.test(t)) map.name = i;
    else if (/^book\/vol\/page$/.test(t)) map.bookVolPage = i;
    else if (/^pages$/.test(t)) map.pages = i;
    else if (/^type desc\.?$/.test(t)) map.docType = i;
    else if (/^type$/.test(t)) map.role = i;
  });
  return map;
}

export type Role = 'grantor' | 'grantee' | 'unknown';

/** GR is grantor, GT is grantee.
 *
 *  Anything else is kept as unknown rather than guessed — dropping a party loses a person from the
 *  chain, and guessing puts them on the wrong side of a conveyance. */
export function roleFor(code: string): Role {
  const c = (code ?? '').trim().toUpperCase();
  if (c === 'GR') return 'grantor';
  if (c === 'GT' || c === 'GE') return 'grantee';
  return 'unknown';
}

export interface Citation {
  series: string;
  volume: string;
  page: string;
}

/** Split `OR/00062/223`.
 *
 *  Volume stays a STRING. Robertson's 19th-century volumes are lettered — `0000U`, `0000R`, `0000S`
 *  — and Number("0000U") is NaN, which would collapse every lettered volume into one bucket and
 *  merge unrelated 1870s deeds into a single document. */
export function parseCitation(value: string): Citation | null {
  const parts = (value ?? '').trim().split('/');
  if (parts.length < 3) return null;
  const [series, volume, page] = parts;
  if (!series || !volume || !page) return null;
  return { series: series.trim(), volume: volume.trim(), page: page.trim() };
}

/** Leading zeros are display padding; `00062` and `62` are the same volume. Kept for the key only,
 *  never for what is shown to a human, who should see the citation as the county prints it. */
function citationKey(c: Citation): string {
  const strip = (s: string) => s.replace(/^0+(?=.)/, '');
  return `${c.series.toUpperCase()}/${strip(c.volume).toUpperCase()}/${strip(c.page)}`;
}

export interface PartyRow {
  fileDate: string;
  name: string;
  citation: Citation;
  citationText: string;
  pageCount: number | null;
  documentType: string;
  role: Role;
}

export function parseRow(cells: string[], map: Record<string, number>): PartyRow | null {
  const at = (k: string): string => {
    const i = map[k];
    return i === undefined ? '' : (cells[i] ?? '').trim();
  };

  const citationText = at('bookVolPage');
  const citation = parseCitation(citationText);
  const name = at('name');
  // Without a citation there is no document identity, and without a name the row carries nothing.
  if (!citation || !name) return null;

  const pages = Number(at('pages'));

  return {
    fileDate: at('fileDate'),
    name,
    citation,
    citationText,
    pageCount: Number.isFinite(pages) && pages > 0 ? pages : null,
    documentType: at('docType'),
    role: roleFor(at('role')),
  };
}

export interface GroupedDocument extends ParsedRow {
  citation: Citation;
  /** FALSE for anything from a name search — only the matching parties came back. */
  partiesComplete: boolean;
  unclassified: string[];
  pageCount: number | null;
}

/** Group party rows into documents by citation and file date.
 *
 *  Date is part of the key because a volume/page can be reused across series in some counties, and
 *  merging two documents would produce one deed with parties from both. */
export function groupByCitation(rows: PartyRow[], complete = false): GroupedDocument[] {
  const byKey = new Map<string, GroupedDocument>();

  for (const row of rows) {
    const key = `${citationKey(row.citation)}::${row.fileDate}`;
    let doc = byKey.get(key);
    if (!doc) {
      doc = {
        // This vendor publishes no instrument number; the citation IS the identifier.
        instrumentNumber: row.citationText,
        documentType: row.documentType,
        recordingDate: row.fileDate,
        grantors: [],
        grantees: [],
        bookVolumePage: row.citationText,
        citation: row.citation,
        partiesComplete: complete,
        unclassified: [],
        pageCount: row.pageCount,
      };
      byKey.set(key, doc);
    }
    const bucket = row.role === 'grantor' ? doc.grantors : row.role === 'grantee' ? doc.grantees : doc.unclassified;
    if (!bucket.includes(row.name)) bucket.push(row.name);
  }

  return [...byKey.values()];
}

/** The modal this portal shows when a search is too broad. */
export const TIMEOUT_TEXT = /reached the configured timeout period/i;

export type SearchOutcome =
  | { state: 'too_broad'; statement: string }
  | { state: 'empty'; statement: string }
  | { state: 'has_results'; documents: GroupedDocument[]; rowsSeen: number; statement: string };

export interface ParseInput {
  headers: string[];
  rows: string[][];
  pageText: string;
  /** The grid's own "239 rows" counter, when present. */
  reportedRows?: number | null;
}

/** Read a search result without letting a timeout look like an empty index.
 *
 *  The portal answers a too-broad search with a modal — "Your search has reached the configured
 *  timeout period" — and no rows. Unhandled, that is indistinguishable from "this name owns nothing
 *  in this county", which is the defect this whole document exists to close. It is the third
 *  variant of it found in one day, after Kofile's empty department and Tyler's totalPages: 0. */
export function readResults(input: ParseInput, county: string, complete = false): SearchOutcome {
  if (TIMEOUT_TEXT.test(input.pageText ?? '')) {
    return {
      state: 'too_broad',
      statement:
        `${county}: the portal TIMED OUT because the search was too broad — it did not report that there are no records. ` +
        `Narrow it (add a first name, or a date range via Advanced) and search again. Never record this as "no records found".`,
    };
  }

  const map = mapColumns(input.headers);
  const parsed = input.rows.map((r) => parseRow(r, map)).filter((r): r is PartyRow => r !== null);
  const documents = groupByCitation(parsed, complete);

  if (documents.length === 0) {
    return { state: 'empty', statement: `${county}: no rows and no timeout — genuinely nothing recorded for this query.` };
  }

  const parts = [`${county}: ${parsed.length} party row(s) → ${documents.length} document(s).`];
  if (!complete) parts.push('Party lists are PARTIAL — a name search returns only the parties that matched.');
  if (input.reportedRows != null && input.reportedRows !== parsed.length) {
    // The grid paginates at 20; a larger reported count means more pages exist.
    parts.push(`The grid reports ${input.reportedRows} row(s) total, so this is ONE PAGE of a larger result set — page through before concluding.`);
  }

  return { state: 'has_results', documents, rowsSeen: parsed.length, statement: parts.join(' ') };
}
