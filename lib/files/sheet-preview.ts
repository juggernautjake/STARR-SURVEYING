// lib/files/sheet-preview.ts — spreadsheets in the file viewer (owner, 2026-10-01).
//
// "Can you make it so that we can view excel and csv files in the file viewer … preview the rows
// and columns and stuff."
//
// Pure: which files are spreadsheets, a CSV/TSV parser, and the grid helpers the viewer's table
// uses. Excel itself is parsed by SheetJS in the component (loaded only when one is opened); this
// module is what the tests pin.
//
// `fileKind` in viewer-model.ts is deliberately NOT changed: a .csv stays kind 'text' there, because
// that kind also decides which job folders accept an upload. The viewer asks this module first.

export type SheetFormat = 'csv' | 'tsv' | 'excel';

/** Rows shown at first, and added by each "Show more". A survey point file is usually well under
 *  this; a county export can be tens of thousands of rows and the table must stay responsive. */
export const SHEET_PAGE_ROWS = 1000;
/** Bigger than this is not fetched for a preview — saving it is the better answer. */
export const SHEET_MAX_BYTES = 25 * 1024 * 1024;
/** Columns past this are not drawn (a sheet with a stray value in column XFD would be 16k wide). */
export const SHEET_MAX_COLS = 200;

const EXCEL_EXT = /\.(xlsx|xlsm|xlsb|xls|ods)$/i;
const EXCEL_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12',
  'application/vnd.oasis.opendocument.spreadsheet',
]);

/** Which spreadsheet format a file is, or null when it is not one. The name wins over the type,
 *  because uploads often arrive as `application/octet-stream` or with no type at all. */
export function sheetFormat(name: string | null | undefined, mime?: string | null): SheetFormat | null {
  const n = name ?? '';
  const m = (mime ?? '').toLowerCase();
  if (/\.csv$/i.test(n)) return 'csv';
  if (/\.tsv$/i.test(n) || /\.tab$/i.test(n)) return 'tsv';
  if (EXCEL_EXT.test(n)) return 'excel';
  if (m === 'text/csv' || m === 'application/csv') return 'csv';
  if (m === 'text/tab-separated-values') return 'tsv';
  if (EXCEL_MIME.has(m)) return 'excel';
  return null;
}

/** The delimiter a CSV-ish file most likely uses: comma, tab, semicolon or pipe — whichever splits
 *  the first few lines into the most consistent, widest set of columns. Quoted text is ignored. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '').slice(0, 10);
  if (lines.length === 0) return ',';
  let best = ',';
  let bestScore = -1;
  for (const d of [',', '\t', ';', '|']) {
    const counts = lines.map((l) => l.replace(/"[^"]*"/g, '').split(d).length - 1);
    const min = Math.min(...counts);
    if (min === 0) continue;
    const consistent = counts.every((c) => c === counts[0]);
    const score = min * (consistent ? 2 : 1);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** RFC 4180 parsing: quoted fields, doubled quotes inside them, delimiters and line breaks inside
 *  quotes, CRLF / LF / CR line endings, and a leading byte-order mark. Stops after `maxRows` rows
 *  and reports whether there was more. */
export function parseDelimited(text: string, opts: { delimiter?: string; maxRows?: number } = {}): { rows: string[][]; truncated: boolean } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delim = opts.delimiter ?? detectDelimiter(src);
  const maxRows = opts.maxRows ?? Infinity;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endRow = () => {
    row.push(field);
    field = '';
    rows.push(row);
    row = [];
  };
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"' && field === '') { quoted = true; i += 1; continue; }
    if (ch === delim) { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\r' || ch === '\n') {
      endRow();
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
      if (rows.length >= maxRows) {
        const rest = src.slice(i);
        return { rows, truncated: rest.trim() !== '' };
      }
      continue;
    }
    field += ch; i += 1;
  }
  if (field !== '' || row.length > 0) endRow();
  return { rows, truncated: false };
}

/** 0 → "A", 25 → "Z", 26 → "AA" — the column letters a spreadsheet shows. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** How many columns to draw: the widest row, capped. Trailing columns that are empty in every row
 *  are dropped, so a sheet formatted out to column Z does not show twenty blank columns. */
export function columnCount(rows: string[][]): number {
  let width = 0;
  for (const r of rows) {
    for (let c = Math.min(r.length, SHEET_MAX_COLS) - 1; c >= width; c--) {
      if ((r[c] ?? '') !== '') { width = c + 1; break; }
    }
  }
  return width;
}
