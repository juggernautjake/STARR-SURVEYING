// lib/cad/import/rw5-parser.ts — the RW5 family: Carlson, Topcon and Spectra (audit item 8k).
//
// §3c.2 lists Topcon as *"partly covered by the same RW5 / PNEZD paths; nothing Topcon-specific"* and
// Spectra as *"Survey Pro raw is RW5-family, so partly covered"*. "Partly" was doing a lot of work:
// the reader handled `SP` records and nothing else, which is one of the several ways a coordinate
// gets into an RW5 file, and not the one Topcon MAGNET or Spectra Survey Pro use most.
//
// ── ONE FORMAT, THREE DIALECTS, AND THE DIFFERENCES ARE NOT COSMETIC ────────────────────────────
//
// RW5 is Carlson's raw data format, adopted by Topcon (MAGNET Field, TopSURV) and by Spectra
// Precision (Survey Pro). All three write the same record grammar — `TYPE,FIELD,FIELD,...--comment`
// — but they populate it differently:
//
//   `SP` store point         — Carlson's primary coordinate record. Was the only one read.
//   `LS` instrument/rod hts  — heights, not coordinates. Skipped.
//   `OC` occupy point        — CARRIES COORDINATES. Topcon and Spectra write the setup station this
//                              way, so a file whose control came from an occupy record imported as
//                              zero control points and read as "the file has no points".
//   `BK` backsight           — a bearing/azimuth, sometimes with the backsight point's coordinates.
//   `SS`/`TR`/`BD`/`BR`      — sideshot / traverse observations. These are ANGLES AND DISTANCES, not
//                              coordinates. Reducing them here would repeat the collector's own
//                              adjustment with less information than it had, so they are counted and
//                              reported rather than silently dropped or wrongly computed.
//   `MO` mode                — declares the UNITS. See below; this is the important one.
//   `--`                     — comment, and also where the point description lives.
//
// ── THE UNIT RECORD IS THE TRAP ─────────────────────────────────────────────────────────────────
//
// `MO,AD0,UN1,SF1.00000000,EC1,EO0.0,AU0` — `UN` is the distance unit: 0 = feet, 1 = metres,
// 2 = US survey feet. The previous reader never looked at it, so a metric Topcon file imported as if
// its numbers were feet: every distance 3.28× too small, every coordinate in the wrong place, and no
// error anywhere. That is the single most expensive defect in this file's history and the reason the
// unit is now surfaced on the result rather than assumed.
//
// We do NOT convert. The pipeline's other readers hand back numbers as written and the drawing
// carries its own units; converting here and again downstream is how a survey ends up scaled twice.
// The unit is reported so the caller — and the user — can act on it.

import type { ParsedImportRow } from './types';
import { cadLog } from '../logger';

export type Rw5Unit = 'feet' | 'meters' | 'usFeet' | 'unknown';

export interface Rw5Document {
  rows: ParsedImportRow[];
  /** As declared by the `MO` record. `unknown` means the file did not say. */
  unit: Rw5Unit;
  /** Which dialect this most looks like. Advisory — the grammar is shared. */
  dialect: 'carlson' | 'topcon' | 'spectra' | 'unknown';
  /** Counts of what was in the file, so "0 points" can be explained rather than just reported. */
  recordCounts: Record<string, number>;
  warnings: string[];
}

/** Record types that carry a coordinate. `SP` is Carlson's; `OC` is how Topcon and Spectra write the
 *  occupied station, and omitting it was the gap that made those two "partly covered". */
const COORDINATE_RECORDS = new Set(['SP', 'OC']);

/** Record types that are observations — angles and distances, not positions. Named so they can be
 *  counted and explained, because a file that is entirely these is a real and common thing to be
 *  handed, and "no points found" is a useless thing to say about it. */
const OBSERVATION_RECORDS = new Set(['SS', 'TR', 'BD', 'BR', 'BK', 'AD', 'FD', 'FV']);

const UNIT_BY_CODE: Record<string, Rw5Unit> = { '0': 'feet', '1': 'meters', '2': 'usFeet' };

/** Pull a field that starts with a prefix out of a comma-split record.
 *
 *  RW5 pads inconsistently — `N 3162345.12`, `N3162345.12` and ` N 3162345.12` all occur — so the
 *  prefix match trims first and the value is whatever follows. */
function field(parts: string[], prefix: string): string | null {
  for (const p of parts) {
    const t = p.trim();
    if (t.startsWith(prefix)) return t.slice(prefix.length).trim();
  }
  return null;
}

function numField(parts: string[], prefix: string): number | null {
  const raw = field(parts, prefix);
  if (raw === null) return null;
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : null;
}

/** Split a record into its fields and its trailing `--` comment.
 *
 *  Done before comma-splitting because a description legitimately contains commas — "FENCE CORNER,
 *  NW" is one description, not two fields — and splitting first turns it into junk fields that the
 *  prefix matcher then rummages through. */
function splitRecord(line: string): { fields: string[]; comment: string } {
  const idx = line.indexOf('--');
  if (idx === -1) return { fields: line.split(','), comment: '' };
  return { fields: line.slice(0, idx).split(','), comment: line.slice(idx + 2).trim() };
}

/** The `--comment` on a coordinate record carries the description, and sometimes the code.
 *
 *  Convention (Carlson, followed by the other two): the first word is the field code, the rest is
 *  free description. The previous reader treated the first word as a point NAME when there was only
 *  one, which silently renamed points to their own field code. */
function readComment(comment: string): { code: string; description: string } {
  const t = comment.trim();
  if (!t) return { code: '', description: '' };
  const words = t.split(/\s+/);
  return { code: words[0], description: words.slice(1).join(' ') };
}

function detectDialect(text: string): Rw5Document['dialect'] {
  const head = text.slice(0, 8192);
  // The `JB` job record's `NM` field and any leading comment usually name the software.
  if (/MAGNET|TopSURV|Topcon/i.test(head)) return 'topcon';
  if (/Survey\s*Pro|Spectra/i.test(head)) return 'spectra';
  if (/Carlson|SurvCE|SurvPC/i.test(head)) return 'carlson';
  return 'unknown';
}

export function parseRW5Document(text: string): Rw5Document {
  const lines = text.split(/\r?\n/);
  const rows: ParsedImportRow[] = [];
  const recordCounts: Record<string, number> = {};
  const warnings: string[] = [];
  let unit: Rw5Unit = 'unknown';

  cadLog.info('RW5Parser', `Parsing RW5: ${lines.length} line(s)`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // A whole-line comment. Not a record.
    if (line.startsWith('--')) continue;

    const type = line.slice(0, 2).toUpperCase();
    recordCounts[type] = (recordCounts[type] ?? 0) + 1;

    const { fields, comment } = splitRecord(line);

    // ── Units, from the MO record ──
    if (type === 'MO') {
      const un = field(fields, 'UN');
      if (un !== null && UNIT_BY_CODE[un[0]]) unit = UNIT_BY_CODE[un[0]];
      continue;
    }

    if (!COORDINATE_RECORDS.has(type)) continue;

    try {
      const ptNum = numField(fields, 'PN');
      const northing = numField(fields, 'N ') ?? numField(fields, 'N');
      const easting = numField(fields, 'E ') ?? numField(fields, 'E');
      const elevation = numField(fields, 'EL');

      if (northing === null || easting === null) {
        // An OC record without coordinates is normal — it can reference a stored point by number
        // instead. Not an error, and emphatically not a point at 0,0.
        continue;
      }

      const { code, description } = readComment(comment);
      const pointName = ptNum !== null ? String(ptNum) : (code || String(rows.length + 1));

      rows.push({
        lineNumber: i + 1,
        rawLine: line,
        error: null,
        data: {
          pointNumber: ptNum ?? rows.length + 1,
          pointName,
          northing,
          easting,
          elevation,
          rawCode: code,
          description,
        },
      });
    } catch (err) {
      cadLog.warn('RW5Parser', `Line ${i + 1}: unexpected parse error — ${err}`);
      rows.push({ lineNumber: i + 1, rawLine: line, error: `Parse error: ${err}`, data: null });
    }
  }

  // ── What to tell the user ──
  if (unit === 'unknown') {
    warnings.push(
      'No MO record declared the distance unit, so coordinates were read exactly as written. ' +
      'Confirm feet vs metres before merging with existing data — a metric file read as feet is 3.28× off with no other symptom.',
    );
  } else if (unit === 'meters') {
    warnings.push('This file declares METRES (MO record, UN1). Coordinates were imported as written; convert before combining with a survey in feet.');
  }

  const observations = [...OBSERVATION_RECORDS].reduce((a, t) => a + (recordCounts[t] ?? 0), 0);
  if (rows.filter((r) => r.data).length === 0 && observations > 0) {
    warnings.push(
      `This file holds ${observations} observation record(s) (angles and distances) and no stored coordinates. ` +
      'Reduce it in the collector or its office software and export stored points — recomputing the traverse here would repeat that adjustment with less information than the instrument had.',
    );
  }

  const dialect = detectDialect(text);
  cadLog.info('RW5Parser', `RW5 (${dialect}, ${unit}) parse complete: ${rows.length} coordinate record(s), ${observations} observation(s)`);
  return { rows, unit, dialect, recordCounts, warnings };
}

/** The pipeline-facing signature, unchanged so every existing caller keeps working. */
export function parseRW5(text: string): ParsedImportRow[] {
  return parseRW5Document(text).rows;
}

/** Does this look like an RW5-family raw file? Matches the record grammar rather than the extension,
 *  since Topcon and Spectra both ship files named `.rw5`, `.raw` and `.rd5`. */
export function looksLikeRw5(text: string): boolean {
  return /^(JB|MO|SP|OC|BK|LS|SS|TR),/m.test(text.slice(0, 4096));
}
