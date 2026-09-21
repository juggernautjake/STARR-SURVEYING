// lib/jobs/point-file.ts — reading a surveyor's point file.
//
// Owner, 2026-09-20: "we can upload point files/csv files into the interactive map and create a
// layer that shows all of the points according to their gps lat/long positions."
//
// ── WHAT A POINT FILE ACTUALLY LOOKS LIKE ───────────────────────────────────────────────────────
//
// Almost always `P,N,E,Z,D` — point number, northing, easting, elevation, description — with no
// header row, because that is what every data collector on earth exports and what every surveyor
// expects to hand somebody. Sometimes there IS a header. Sometimes the order is different.
// Sometimes it is comma-separated, sometimes tab, sometimes whitespace, sometimes semicolon
// because a European instrument wrote it or somebody opened it in a locale where comma is the
// decimal mark.
//
// So this module detects rather than demands, and REPORTS what it detected so a person can
// disagree before anything is written.
//
// ── THE COLUMN ORDER IS THE DANGEROUS PART ──────────────────────────────────────────────────────
//
// Northing and easting are both seven- or eight-digit numbers in the same range. Swapping them
// produces a file that parses perfectly and puts every point in the wrong hemisphere — the exact
// shape of failure `lib/geo/state-plane.ts` is built around. Nothing here can tell N from E by
// looking at one number.
//
// What it CAN do, and does:
//   - default to P,N,E,Z,D, because that is the overwhelming convention;
//   - read a header row when there is one, since a header that says "Easting" is real evidence;
//   - project a sample through every Texas zone and report which ones land in Texas, so the import
//     dialog can say "this looks like Central" and, crucially, "read this way these points are in
//     Mexico" when the columns are the other way round.
//
// The decision still belongs to the person. This module's job is to make a wrong one visible
// BEFORE 247 rows are written, not to be clever.

/** One row of a point file, before anything has been projected. */
export interface RawPoint {
  /** Point number or name, as written. Kept as text: "101", "CP1" and "1A" are all legitimate. */
  name: string;
  northing: number;
  easting: number;
  /** Elevation, in the same units as northing/easting. Null when the file has no Z column. */
  elevation: number | null;
  /** The description/code field. "FND 1/2 IR", "FL", "TBM". */
  description: string;
  /** 1-based line number in the source file, for error messages that a person can act on. */
  line: number;
}

export interface SkippedLine {
  line: number;
  text: string;
  why: string;
}

export type ColumnKey = 'name' | 'northing' | 'easting' | 'elevation' | 'description';

/** Which source column feeds each field. `-1` means the file has no such column. */
export interface ColumnMap {
  name: number;
  northing: number;
  easting: number;
  elevation: number;
  description: number;
}

/** The conventional order every collector writes and every surveyor expects. */
export const DEFAULT_COLUMNS: ColumnMap = { name: 0, northing: 1, easting: 2, elevation: 3, description: 4 };

export interface ParsedPointFile {
  points: RawPoint[];
  skipped: SkippedLine[];
  /** The delimiter that was detected, for showing back to the person. */
  delimiter: string;
  /** True when a header row was found and consumed. */
  hadHeader: boolean;
  /** Which columns were used — from the header when there was one, otherwise DEFAULT_COLUMNS. */
  columns: ColumnMap;
  /** How the column map was arrived at. The dialog says this out loud. */
  columnsFrom: 'header' | 'convention' | 'caller';
  /** Total data lines considered, including the ones that were skipped. */
  totalLines: number;
}

// ── DELIMITER ───────────────────────────────────────────────────────────────────────────────────

const CANDIDATES = [',', '\t', ';', '|'] as const;

/**
 * Which delimiter splits this file most consistently?
 *
 * Counting occurrences across the whole file rather than on the first line, because the first line
 * is the one most likely to be a comment, a title, or a header with different punctuation. The
 * winner is the candidate whose per-line count is both non-zero and the most STABLE — a file where
 * every line has exactly four commas is comma-separated; one where the comma count wanders is a
 * file with commas inside a description field.
 */
export function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 50).filter((l) => l.trim());
  if (sample.length === 0) return ',';

  let best = ',';
  let bestScore = -1;
  for (const d of CANDIDATES) {
    const counts = sample.map((l) => l.split(d).length - 1);
    const present = counts.filter((c) => c > 0).length;
    if (present === 0) continue;
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)] ?? 0;
    if (mode === 0) continue;
    const agree = counts.filter((c) => c === mode).length;
    // Consistency first, then how many fields it yields — a delimiter that splits every line into
    // five beats one that splits every line into two.
    const score = (agree / sample.length) * 100 + mode;
    if (score > bestScore) { bestScore = score; best = d; }
  }

  // Whitespace is the last resort, and only when nothing else appeared at all. A file with no
  // punctuation but aligned columns is rare but real — older RW5 exports do it.
  if (bestScore < 0 && sample.some((l) => /\s{1,}/.test(l.trim()))) return ' ';
  return best;
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === ' ') return line.trim().split(/\s+/);
  return line.split(delimiter).map((c) => c.trim());
}

// ── HEADER ──────────────────────────────────────────────────────────────────────────────────────

/** Words that mean each field, lowercased. Longest-first matching is NOT used — see below. */
const HEADER_WORDS: Record<ColumnKey, readonly string[]> = {
  name: ['p', 'pt', 'pnt', 'point', 'point#', 'pointnumber', 'pointname', 'number', 'no', 'name', 'id'],
  northing: ['n', 'north', 'northing', 'y', 'lat', 'latitude'],
  easting: ['e', 'east', 'easting', 'x', 'lon', 'lng', 'long', 'longitude'],
  elevation: ['z', 'elev', 'elevation', 'height', 'ht', 'alt', 'altitude'],
  description: ['d', 'desc', 'description', 'code', 'cd', 'note', 'notes', 'remark', 'remarks', 'feature'],
};

const clean = (s: string) => s.toLowerCase().replace(new RegExp('[^a-z0-9#]', 'g'), '');

/**
 * Is this row a header, and if so which column is which?
 *
 * A row is a header when NONE of its cells parse as a number and at least two of them are words we
 * recognise. Both halves matter: "1,2,3" is data even though those could be column indices, and
 * "Alpha,Bravo,Charlie" is not a header we can use even though it is clearly not data.
 */
export function readHeader(cells: string[]): ColumnMap | null {
  if (cells.length < 2) return null;
  if (cells.some((c) => c !== '' && Number.isFinite(Number(c)))) return null;

  const map: ColumnMap = { name: -1, northing: -1, easting: -1, elevation: -1, description: -1 };
  let hits = 0;
  cells.forEach((cell, i) => {
    const c = clean(cell);
    if (!c) return;
    for (const key of Object.keys(HEADER_WORDS) as ColumnKey[]) {
      // First match wins per column, so a file with both "Northing" and "N" does not have the
      // second quietly overwrite the first.
      if (map[key] === -1 && HEADER_WORDS[key].includes(c)) { map[key] = i; hits += 1; return; }
    }
  });

  // Northing and easting are the two that make a point. A "header" that found only a description
  // column has told us nothing useful and is more likely a stray line of text.
  if (hits < 2 || map.northing === -1 || map.easting === -1) return null;
  return map;
}

// ── NUMBERS ─────────────────────────────────────────────────────────────────────────────────────

/**
 * A coordinate, or null.
 *
 * Handles the thousands separators and stray units a hand-edited file picks up. Deliberately does
 * NOT handle a comma decimal mark: in a comma-delimited file "1,5" is two fields, and guessing
 * otherwise would silently halve somebody's coordinate.
 */
export function readNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  // Quotes and currency marks are stripped; INTERNAL whitespace deliberately is not. Stripping it
  // turned the cell "1 2" into the number 12 — two coordinates silently merged into one, which the
  // test suite caught and which no error would ever have reported. Trim handles the padding; a
  // space in the middle means the cell is not one number and should fail.
  const t = raw.trim().replace(new RegExp("[$'\"]", 'g'), '');
  if (!t) return null;
  // Strip thousands separators only when they are grouped in threes, which is what a separator
  // looks like and what a decimal comma does not.
  const stripped = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(new RegExp(',', 'g'), '') : t;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(stripped)) return null;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

// ── THE PARSE ───────────────────────────────────────────────────────────────────────────────────

const COMMENT = new RegExp('^\\s*(#|//|;;)');

export interface ParseOptions {
  /** Force a column map instead of detecting one — what the dialog sends after somebody adjusts it. */
  columns?: ColumnMap;
  /** Force a delimiter. */
  delimiter?: string;
  /** Refuse a file larger than this many data rows. */
  maxPoints?: number;
}

/** A cap, so a mis-selected 200MB file cannot try to become two million map points. */
export const MAX_POINTS = 20_000;

export function parsePointFile(text: string, opts: ParseOptions = {}): ParsedPointFile {
  // Strip a UTF-8 BOM — Excel writes one, and it turns the first header cell into "﻿Point" which
  // matches nothing.
  const body = text.replace(/^﻿/, '');
  const rawLines = body.split(/\r\n|\r|\n/);

  const delimiter = opts.delimiter ?? detectDelimiter(rawLines);

  const points: RawPoint[] = [];
  const skipped: SkippedLine[] = [];
  const max = opts.maxPoints ?? MAX_POINTS;

  let columns = opts.columns ?? DEFAULT_COLUMNS;
  let columnsFrom: ParsedPointFile['columnsFrom'] = opts.columns ? 'caller' : 'convention';
  let hadHeader = false;
  let totalLines = 0;

  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i]!;
    const lineNo = i + 1;
    if (!line.trim()) continue;
    if (COMMENT.test(line)) continue;

    const cells = splitLine(line, delimiter);

    // The header, if there is one, is the first non-blank non-comment row — and only that row. A
    // "header" found halfway down is a page break from a printed listing, not a schema.
    if (!hadHeader && points.length === 0 && skipped.length === 0 && !opts.columns) {
      const fromHeader = readHeader(cells);
      if (fromHeader) {
        columns = fromHeader;
        columnsFrom = 'header';
        hadHeader = true;
        continue;
      }
    }

    totalLines += 1;

    if (points.length >= max) {
      skipped.push({ line: lineNo, text: line.slice(0, 120), why: `over the ${max.toLocaleString()} point limit` });
      continue;
    }

    const northing = readNumber(cells[columns.northing]);
    const easting = readNumber(cells[columns.easting]);

    if (northing === null || easting === null) {
      skipped.push({
        line: lineNo,
        text: line.slice(0, 120),
        why: northing === null && easting === null
          ? 'no northing or easting could be read'
          : northing === null ? 'the northing is not a number' : 'the easting is not a number',
      });
      continue;
    }

    points.push({
      name: (cells[columns.name] ?? '').trim() || String(points.length + 1),
      northing,
      easting,
      elevation: columns.elevation === -1 ? null : readNumber(cells[columns.elevation]),
      description: (cells[columns.description] ?? '').trim(),
      line: lineNo,
    });
  }

  return { points, skipped, delimiter, hadHeader, columns, columnsFrom, totalLines };
}

/** How the delimiter should be described to a person. `","` means nothing on a screen. */
export function delimiterName(d: string): string {
  if (d === ',') return 'comma';
  if (d === '\t') return 'tab';
  if (d === ';') return 'semicolon';
  if (d === '|') return 'pipe';
  if (d === ' ') return 'spaces';
  return d;
}

/**
 * Are these coordinates already latitude and longitude?
 *
 * Worth asking, because a file exported from a GIS rather than a collector may already be in
 * degrees, and projecting degrees as if they were feet produces a point in the Gulf of Guinea.
 *
 * The test is the magnitude: a Texas state-plane coordinate is millions of feet, and a latitude
 * cannot exceed 90. Nothing in between is ambiguous, which is why this is safe to decide
 * automatically where the zone question is not.
 */
export function looksLikeDegrees(points: readonly RawPoint[]): boolean {
  if (points.length === 0) return false;
  return points.every(
    (p) => Math.abs(p.northing) <= 90 && Math.abs(p.easting) <= 180,
  );
}
