// worker/src/adapters/aumentum-results-parser.ts — Harris/Aumentum's results grid (plan R39).
//
// Bastrop County, read live on 2026-08-02. The grid (`#Table1`) is not one <tr> per record: like
// Avenu's, it renders as a flat sequence of cells with the records run together, so per-row parsing
// returns one record however many came back. Records are cut at each cell that is EXACTLY a date —
// the filing date is the only reliable boundary.
//
// A record's cells look like this, relative to the date at index d:
//
//     d-5  2325                     instrument number
//     d-4  2325 101-231             instrument + book-page, combined for display
//     d-3  2325                     instrument again
//     d-2  101                      book
//     d-1  231                      page
//     d    10/24/1974               FILING DATE  ← the boundary
//     d+1  DEED OF TRUST            document type
//     d+2  DEED OF TRUST            document type again
//     d+3  [E] SMITH JAMES (+) [R] JENSEN DONALD (+)     ← both parties, with roles
//
// ── WHY THE PARTY SUMMARY IS THE SOURCE OF TRUTH ────────────────────────────────────────────────
//
// The individual name cells sit at unstable offsets — they shift with how many parties a document
// has, and blank cells pad unpredictably. The summary cell at d+3 carries EVERY party with its role
// marker inline, so parsing it is both simpler and safer than counting positions.
//
//     [R] = grantoR      [E] = grantEe
//
// Those markers match the search form's own party-type radio values, which is what confirms the
// mapping rather than a guess about which letter means which side.

import type { ParsedRow } from './kofile-results-parser.js';

/** A cell that is exactly a date — the record boundary. */
export const DATE_CELL = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

/** `[R] NAME (+) [E] OTHER NAME` — role marker followed by everything up to the next marker. */
const PARTY_RUN = /\[([RE])\]\s*([^[]+)/g;

export type Role = 'grantor' | 'grantee';

export function roleForMarker(marker: string): Role | null {
  const m = (marker ?? '').trim().toUpperCase();
  if (m === 'R') return 'grantor';
  if (m === 'E') return 'grantee';
  return null;
}

export interface Party {
  name: string;
  role: Role;
}

/** Split the summary cell into parties.
 *
 *  `(+)` is the site's marker for "and others" — it is kept, because dropping it would silently
 *  turn a conveyance by several people into one by a single person. */
export function parseParties(summary: string): Party[] {
  const out: Party[] = [];
  const text = (summary ?? '').replace(/\s+/g, ' ');
  PARTY_RUN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PARTY_RUN.exec(text)) !== null) {
    const role = roleForMarker(m[1]);
    const name = m[2].trim();
    if (!role || !name) continue;
    if (!out.some((p) => p.name === name && p.role === role)) out.push({ name, role });
  }
  return out;
}

export interface AumentumRow extends ParsedRow {
  /** Kept separately because Aumentum prints book and page in their own cells. */
  book?: string;
  page?: string;
}

/** Is this cell a plausible book or page number? Blank padding cells are common. */
const NUMERICISH = /^[0-9]{1,7}$/;

/** Build one record from the cells around a date boundary. */
export function parseRecord(cells: string[], dateIndex: number): AumentumRow | null {
  const at = (i: number): string => (i >= 0 && i < cells.length ? (cells[i] ?? '').trim() : '');
  const recordingDate = at(dateIndex);
  if (!DATE_CELL.test(recordingDate)) return null;

  // Document type is the first non-empty cell after the date.
  let documentType = '';
  for (let i = dateIndex + 1; i <= dateIndex + 3 && i < cells.length; i++) {
    const v = at(i);
    if (v && !/^\[/.test(v)) { documentType = v; break; }
  }

  // The party summary is the first cell after the date carrying a role marker. Searching for it
  // rather than assuming d+3 keeps this working when a column is added.
  let summary = '';
  for (let i = dateIndex + 1; i < Math.min(cells.length, dateIndex + 12); i++) {
    if (/\[[RE]\]/.test(at(i))) { summary = at(i); break; }
  }
  const parties = parseParties(summary);

  // Book and page are the two numeric cells immediately before the date.
  const page = NUMERICISH.test(at(dateIndex - 1)) ? at(dateIndex - 1) : undefined;
  const book = NUMERICISH.test(at(dateIndex - 2)) ? at(dateIndex - 2) : undefined;

  // The instrument number is the first numeric cell walking back past book and page. Some records
  // are book/page only, so this is allowed to be absent rather than invented.
  let instrumentNumber = '';
  for (let i = dateIndex - 3; i >= Math.max(0, dateIndex - 7); i--) {
    const v = at(i);
    if (NUMERICISH.test(v)) { instrumentNumber = v; break; }
  }

  // A record with neither an instrument number nor a citation cannot be identified at all.
  if (!instrumentNumber && !(book && page)) return null;

  return {
    instrumentNumber: instrumentNumber || `${book}-${page}`,
    documentType,
    recordingDate,
    grantors: parties.filter((p) => p.role === 'grantor').map((p) => p.name),
    grantees: parties.filter((p) => p.role === 'grantee').map((p) => p.name),
    bookVolumePage: book && page ? `${book}-${page}` : undefined,
    book,
    page,
  };
}

/** Aumentum returns at most this many rows and offers NO pagination.
 *
 *  Verified on Bastrop 2026-08-02: "SMITH", "SMITH JAMES" and "ENSERCH" each returned exactly 100
 *  records, and the first/prev/next/last controls named in the toolbar script are not present on the
 *  results list at all — they belong to the document detail view.
 *
 *  So a search that matches 3,000 documents returns 100, with a counter that says "100 records" as
 *  though that were the answer. This is the silent-truncation case: unlike Tyler's over-limit banner
 *  or Avenu's timeout modal, NOTHING here announces that the result is partial. */
export const AUMENTUM_RESULT_CAP = 100;

export interface AumentumParseReport {
  rows: AumentumRow[];
  /** How many date boundaries were seen, whether or not they yielded a record. */
  boundaries: number;
  /** The grid's own "100 records" counter, when present. */
  reportedRecords: number | null;
  /** True when the grid reported more records than were parsed. */
  short: boolean;
  /** True when the result sits exactly on the cap, so the real total is unknown and probably larger. */
  capped: boolean;
}

/** Parse the whole grid from its flattened cells.
 *
 *  Records that share an instrument number AND filing date are the SAME document listed once per
 *  party, exactly as on eDocTec and Avenu. They are merged rather than returned twice, because a
 *  duplicated deed reads as two conveyances of the same land. The merge unions the party lists, so
 *  a document whose grantors were split across rows comes back whole. */
export function parseResults(cells: string[], pageText = ''): AumentumParseReport {
  const byKey = new Map<string, AumentumRow>();
  let boundaries = 0;

  for (let i = 0; i < cells.length; i++) {
    if (!DATE_CELL.test((cells[i] ?? '').trim())) continue;
    boundaries += 1;
    const rec = parseRecord(cells, i);
    if (!rec) continue;

    const key = `${rec.instrumentNumber}::${rec.recordingDate}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, rec);
      continue;
    }
    for (const g of rec.grantors) if (!existing.grantors.includes(g)) existing.grantors.push(g);
    for (const g of rec.grantees) if (!existing.grantees.includes(g)) existing.grantees.push(g);
    if (!existing.documentType && rec.documentType) existing.documentType = rec.documentType;
    if (!existing.bookVolumePage && rec.bookVolumePage) existing.bookVolumePage = rec.bookVolumePage;
  }

  const rows = [...byKey.values()];

  const m = /([\d,]+)\s*records?/i.exec(pageText ?? '');
  const reportedRecords = m ? Number(m[1].replace(/,/g, '')) : null;

  // Compare the portal's count against BOUNDARIES, not against merged documents. The grid counts
  // rows; merging several party rows into one document legitimately produces fewer documents than
  // rows, and comparing the merged total would cry INCOMPLETE on a complete read.
  return {
    rows,
    boundaries,
    reportedRecords,
    short: reportedRecords !== null && boundaries < reportedRecords,
    // Landing exactly on the cap is the only signal there is. It cannot distinguish "exactly 100
    // documents exist" from "thousands exist" — which is precisely why it must be reported rather
    // than assumed either way.
    capped: boundaries >= AUMENTUM_RESULT_CAP,
  };
}

export function describeParse(report: AumentumParseReport, county: string): string {
  const parts = [`${county}: ${report.rows.length} record(s) from ${report.boundaries} date boundary(ies).`];
  if (report.reportedRecords !== null) {
    parts.push(`The grid reports ${report.reportedRecords}.`);
    if (report.short) {
      // Stated, never inferred. A short answer that looks complete is the failure this whole
      // document exists to prevent.
      parts.push(`INCOMPLETE — ${report.reportedRecords - report.rows.length} record(s) were not parsed; treat this page as partial.`);
    }
  }
  if (report.capped) {
    parts.push(
      `TRUNCATED — the portal returns at most ${AUMENTUM_RESULT_CAP} rows and offers NO pagination, ` +
        `so the true total is UNKNOWN and probably larger. Narrow by document type, legal description ` +
        `or a fuller name and search again. Do NOT treat this as the complete set.`,
    );
  }
  return parts.join(' ');
}
