// worker/src/adapters/kofile-results-parser.ts — read the results table by its headers (R38).
//
// ── TWO BUGS THIS REPLACES ──────────────────────────────────────────────────────────────────────
//
// 1. The old parser required an instrument number matching `\d{10,13}` and skipped any row without
//    one. Real Kofile instrument numbers are `2019-3389` and `1981-147096` — neither matches. So
//    every row was dropped, and the adapter returned an empty array from a page full of records.
//
// 2. It then read cells positionally, from a comment describing "typical Kofile column order".
//    Driving five live counties on 2026-08-02 showed there is no typical order:
//
//      Milam / Leon / Walker  Grantor | Grantee | Doc Type | Recorded Date | Doc Number | Book/Volume/Page | Legal Description
//      Bell                   … same shape, different LABELS: "Inst Number", "Property Description"
//      Montgomery             17 columns in a DIFFERENT ORDER — Doc Number first, Grantor fifth,
//                             plus Notary, High Lot, Low Lot, Block, Subdivision, Acreage, Comment
//
//    A fixed index reads Montgomery's document number as its grantor.
//
// ── SO: MAP BY HEADER TEXT ──────────────────────────────────────────────────────────────────────
//
// The table names its own columns. Reading those names is the only approach that survives a county
// adding a column or a vendor renaming one — and when a header is not recognised, that is reported
// rather than guessed around, because a silently mis-mapped grantor is a chain of title for the
// wrong family.

/** Canonical fields an adapter needs from a results row. */
export type ResultField =
  | 'grantor' | 'grantee' | 'docType' | 'recordedDate'
  | 'instrument' | 'bookVolumePage' | 'legalDescription';

/** Header text → field. Matched case-insensitively on the normalised header, longest first, so
 *  "Property Description" does not fall through to a looser "description" rule. */
const HEADER_SYNONYMS: Array<[RegExp, ResultField]> = [
  [/^grantor/i, 'grantor'],
  [/^grantee/i, 'grantee'],
  [/^(doc(ument)?\s*type|instrument\s*type|type)$/i, 'docType'],
  [/^(recorded|recording|file[d]?)\s*date$/i, 'recordedDate'],
  [/^(doc(ument)?|inst(rument)?|file|clerk'?s?\s*file)\s*(number|no\.?|#)$/i, 'instrument'],
  [/^(book\s*\/?\s*volume\s*\/?\s*page|vol\s*\/?\s*bk\s*\/?\s*pg|volume\s*\/\s*page|book\s*\/\s*page)$/i, 'bookVolumePage'],
  [/^(legal|property)\s*description$/i, 'legalDescription'],
];

export function fieldForHeader(header: string): ResultField | null {
  const h = header.replace(/\s+/g, ' ').trim();
  if (!h) return null;
  for (const [re, field] of HEADER_SYNONYMS) if (re.test(h)) return field;
  return null;
}

export interface ColumnMap {
  /** Field → zero-based index into the row's cells. */
  index: Partial<Record<ResultField, number>>;
  /** Headers that matched nothing. Reported, not swallowed — a county adding "Notary" is harmless,
   *  a vendor renaming "Grantor" is not, and only a human can tell those apart. */
  unmapped: string[];
  /** Fields an adapter genuinely cannot work without. */
  missing: ResultField[];
}

/** Fields without which a result row is not usable as a chain link. `bookVolumePage` and
 *  `legalDescription` are NOT required — plenty of counties leave them blank. */
export const REQUIRED_FIELDS: ResultField[] = ['grantor', 'grantee', 'docType', 'recordedDate', 'instrument'];

/** Build the column map from the table's own header row.
 *
 *  `headers` must be every `<th>` in order, including the blank icon columns — their positions are
 *  what make the indices line up with the row's `<td>`s. */
export function mapColumns(headers: string[]): ColumnMap {
  const index: ColumnMap['index'] = {};
  const unmapped: string[] = [];

  headers.forEach((h, i) => {
    const text = (h ?? '').trim();
    // Blank headers are the checkbox / cart / preview icon columns. Skipped silently: they are
    // structural, not data, and reporting them as unmapped would bury the headers that matter.
    if (!text) return;
    const field = fieldForHeader(text);
    if (field) {
      // First match wins. A table with two date columns keeps the first, which is the recorded date
      // on every county seen.
      if (index[field] === undefined) index[field] = i;
    } else {
      unmapped.push(text);
    }
  });

  return { index, unmapped, missing: REQUIRED_FIELDS.filter((f) => index[f] === undefined) };
}

export interface ParsedRow {
  instrumentNumber: string;
  documentType: string;
  recordingDate: string;
  grantors: string[];
  grantees: string[];
  bookVolumePage?: string;
  legalDescription?: string;
}

/** Split a party cell into names.
 *
 *  Kofile stacks multiple parties in one cell, newline-separated. Splitting on commas would break
 *  "SMITH, JOHN A" into two people, which is how a grantor becomes two grantors and a chain stops
 *  joining. */
export function splitParties(cell: string): string[] {
  return cell
    .split(/\r?\n|\s{2,}|;/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '--');
}

/** A recorded date that is genuinely absent. Kofile prints this rather than leaving the cell empty,
 *  and storing the literal string would put "--/--/--" in a chain of title. */
const EMPTY_DATE = /^-+\/-+\/-+$/;

export function parseRow(cells: string[], map: ColumnMap): ParsedRow | null {
  const at = (f: ResultField): string => {
    const i = map.index[f];
    return i === undefined ? '' : (cells[i] ?? '').trim();
  };

  const instrument = at('instrument');
  // Without an instrument number a row cannot be cited, fetched, or deduplicated against the
  // purchase library (R13) — so it is not a usable result, however much else it carries.
  if (!instrument) return null;

  const rawDate = at('recordedDate');
  return {
    instrumentNumber: instrument,
    documentType: at('docType') || 'other',
    recordingDate: EMPTY_DATE.test(rawDate) ? '' : rawDate,
    grantors: splitParties(at('grantor')),
    grantees: splitParties(at('grantee')),
    bookVolumePage: at('bookVolumePage') || undefined,
    legalDescription: at('legalDescription') || undefined,
  };
}

export interface ParseReport {
  rows: ParsedRow[];
  /** Rows dropped for want of an instrument number. A count, because a page where most rows drop is
   *  a mapping problem rather than a thin index — and silence there is how the old parser returned
   *  nothing from a full page. */
  skipped: number;
  columnMap: ColumnMap;
  /** Set when the table cannot be read at all. */
  fatal: string | null;
}

export function parseResults(headers: string[], rows: string[][]): ParseReport {
  const columnMap = mapColumns(headers);

  if (columnMap.missing.length > 0) {
    return {
      rows: [], skipped: rows.length, columnMap,
      // Named fields, not "parse error": whoever reads this needs to know which column vanished.
      fatal:
        `The results table is missing column(s) this adapter needs: ${columnMap.missing.join(', ')}. ` +
        `Headers seen: ${headers.filter(Boolean).join(' | ') || '(none)'}. ` +
        'Either the county renamed a column or the page did not finish rendering — do not treat this as "no records".',
    };
  }

  const parsed: ParsedRow[] = [];
  let skipped = 0;
  for (const cells of rows) {
    const r = parseRow(cells, columnMap);
    if (r) parsed.push(r); else skipped++;
  }

  return { rows: parsed, skipped, columnMap, fatal: null };
}

/** One line for the run log. A page that yielded nothing must say WHY. */
export function describeParse(report: ParseReport, county: string): string {
  if (report.fatal) return `[Kofile/${county}] ${report.fatal}`;
  const extra = report.columnMap.unmapped.length
    ? ` Unrecognised columns ignored: ${report.columnMap.unmapped.join(', ')}.`
    : '';
  const dropped = report.skipped
    ? ` ${report.skipped} row(s) had no instrument number and were dropped.`
    : '';
  return `[Kofile/${county}] Parsed ${report.rows.length} result(s).${dropped}${extra}`;
}
