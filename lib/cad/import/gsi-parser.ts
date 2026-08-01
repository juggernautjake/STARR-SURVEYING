// lib/cad/import/gsi-parser.ts — Leica GSI8 / GSI16, which unlocks GeoMax with it (audit item 8l).
//
// §3c.2 measured the gap: **Hexagon (Leica Geosystems) — nothing. GeoMax — nothing.** GeoMax is a
// Hexagon subsidiary and its instruments write GSI, so one reader covers both, and it is the only
// path to either that needs nobody's permission (§3d: Leica's cloud API is "assume closed").
//
// ── THE FORMAT IS FIXED-WIDTH, AND EVERY TRAP FOLLOWS FROM THAT ─────────────────────────────────
//
// A GSI line is a sequence of blocks. Each block is `WI` (a 2-digit word index) + 4 information
// characters + a value, right-justified and zero-padded:
//
//   110001+0000000000000001 81..00+0000000012345678 82..00+0000000087654321 83..00+0000000000012340
//   └ pt 1 ────────────────┘ └ easting ───────────┘ └ northing ──────────┘ └ elevation ─────────┘
//
//   GSI8  → 8 value characters per block (16 chars total)
//   GSI16 → 16 value characters per block (24 chars total), and lines start with `*`
//
// 1. **GSI is EASTING-first.** WI 81 is easting, 82 is northing, 83 is elevation. LandXML is
//    northing-first. A reader that carries the LandXML habit across mirrors every point about the
//    45° line — no crash, no warning, a plausible-looking plat. This is the single most likely bug
//    in this file and the reason the mapping is a named constant rather than positional.
//
// 2. **The units are IN the block, and there are seven of them.** Information character 6 says
//    whether the value is millimetres, 1/10 mm, 1/100 mm, 1/1000 ft, 1/10000 ft… Reading a
//    millimetre value as metres is a factor of 1000, and reading a 1/1000-ft value as millimetres is
//    a factor of 3.28 — both produce a survey that imports "successfully".
//
// 3. **The sign is a character, not part of the number.** `+` / `-` sits immediately before the
//    value. `parseFloat` on the zero-padded remainder silently drops the sign, which puts every
//    southern or western coordinate on the wrong side of the origin.
//
// 4. **GSI8 and GSI16 are the same format at two widths and must be detected, not configured.**
//    Asking the user is asking them to know something their instrument did not tell them; misreading
//    a GSI16 file as GSI8 splits every value in half and produces garbage that still parses.
//
// Blocks this reader understands: 11 (point number), 41–49 (codes), 71–79 (remarks/attributes),
// 81/82/83 (E/N/H). Measurement blocks (21 Hz, 22 V, 31 slope distance) are recognised and skipped —
// a raw angle-and-distance observation is not a coordinate, and inventing one by reducing it here
// would duplicate the instrument's own adjustment with less information than it had.

import type { ParsedImportRow } from './types';
import { cadLog } from '../logger';

/** WI → what it means. Named rather than positional, because trap 1 lives here. */
const WI_POINT_NUMBER = '11';
const WI_EASTING = '81';
const WI_NORTHING = '82';
const WI_ELEVATION = '83';

/** Information character 6 → metres per stored unit.
 *
 *  Straight from the Leica GSI specification. `6` (1/10 mm) and `8` (1/10000 ft) exist on newer
 *  instruments; omitting them would make a modern total station's export silently 10× wrong. */
const UNIT_SCALE_TO_METERS: Record<string, number> = {
  '0': 0.001,              // metre, 1 mm
  '1': 0.3048 / 1000,      // feet, 1/1000 ft   (International foot)
  '2': Math.PI / 180 / 100000, // gon/deg — angle, not used for coordinates
  '3': Math.PI / 180 / 100000,
  '4': 0.0001,             // metre, 1/10 mm
  '5': 0.000001,           // metre, 1/100 mm  (rarely seen)
  '6': 0.00001,            // metre, 1/100 mm alternative
  '7': 0.3048 / 10000,     // feet, 1/10000 ft
  '8': 0.3048 / 100000,    // feet, 1/100000 ft
};

export type GsiVariant = 'GSI8' | 'GSI16';

export interface GsiBlock {
  wi: string;
  /** The four characters between the WI and the sign. Character 6 (index 3 here) is the unit. */
  info: string;
  sign: 1 | -1;
  /** Raw digits, before unit scaling. */
  raw: string;
  /** Scaled to metres when the block is a distance; null for angle blocks and unknown units. */
  meters: number | null;
}

export interface GsiPoint {
  pointName: string;
  /** Metres. Converted from whatever the instrument stored, per block (trap 2). */
  easting: number;
  northing: number;
  elevation: number | null;
  code: string;
  description: string;
}

export interface GsiDocument {
  variant: GsiVariant;
  points: GsiPoint[];
  warnings: string[];
}

/** GSI16 lines begin with `*`; GSI8 lines do not. Detected from the file, never asked (trap 4).
 *
 *  A file whose first data line is ambiguous falls back to measuring the block width, because some
 *  writers omit the leading `*` even at 16 characters. */
export function detectGsiVariant(text: string): GsiVariant {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('*')) return 'GSI16';
  }
  // No asterisks — measure instead. A GSI8 block is 16 characters, GSI16 is 24.
  for (const line of lines) {
    const m = /^(\d{2})[\d.]{4}([+-])(\d+)/.exec(line.replace(/^\*/, ''));
    if (m) return m[3].length >= 16 ? 'GSI16' : 'GSI8';
  }
  return 'GSI8';
}

/** Split one line into blocks. Returns [] for a line that is not GSI at all. */
export function parseGsiLine(line: string, variant: GsiVariant): GsiBlock[] {
  const body = line.startsWith('*') ? line.slice(1) : line;
  const valueWidth = variant === 'GSI16' ? 16 : 8;
  const blockWidth = 2 + 4 + 1 + valueWidth; // WI + info + sign + value
  const blocks: GsiBlock[] = [];

  // Blocks are space-separated in practice but the format is fixed-width, so both are handled: walk
  // the string, skipping whitespace, taking `blockWidth` characters at a time. Relying on the spaces
  // alone breaks on the writers that omit them; relying on the width alone breaks on the ones that
  // pad irregularly.
  let i = 0;
  while (i < body.length) {
    while (i < body.length && body[i] === ' ') i++;
    if (i >= body.length) break;
    const chunk = body.slice(i, i + blockWidth);
    if (chunk.length < blockWidth) break;

    const wi = chunk.slice(0, 2);
    const info = chunk.slice(2, 6);
    const signChar = chunk[6];
    const raw = chunk.slice(7);
    i += blockWidth;

    if (!/^\d{2}$/.test(wi) || (signChar !== '+' && signChar !== '-')) continue;

    // Trap 3: the sign is this character, and it is the only place the sign lives.
    const sign: 1 | -1 = signChar === '-' ? -1 : 1;
    const digits = raw.replace(/\D/g, '');
    // Trap 2: information character 6 — the fourth of the four info characters.
    const unitChar = info[3];
    const scale = UNIT_SCALE_TO_METERS[unitChar];
    const numeric = digits ? Number(digits) : NaN;
    const meters = scale !== undefined && Number.isFinite(numeric) ? sign * numeric * scale : null;

    blocks.push({ wi, info, sign, raw, meters });
  }
  return blocks;
}

export function parseGsi(text: string): GsiDocument {
  const variant = detectGsiVariant(text);
  const warnings: string[] = [];
  const points: GsiPoint[] = [];
  const lines = text.split(/\r?\n/);

  let measurementOnly = 0;
  let unreadableUnits = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const blocks = parseGsiLine(line, variant);
    if (blocks.length === 0) continue;

    const byWi = new Map<string, GsiBlock>();
    for (const b of blocks) if (!byWi.has(b.wi)) byWi.set(b.wi, b);

    const east = byWi.get(WI_EASTING);
    const north = byWi.get(WI_NORTHING);
    if (!east || !north) {
      // An observation line (angles + slope distance) rather than a coordinate line. Counted, not
      // silently dropped — a file that is ALL observations should tell the user that, not import as
      // an empty success.
      measurementOnly++;
      continue;
    }
    if (east.meters === null || north.meters === null) {
      unreadableUnits++;
      continue;
    }

    const pn = byWi.get(WI_POINT_NUMBER);
    // The point number is stored zero-padded; leading zeros are padding, not part of the name. A
    // point named "0000000000000012" is nobody's idea of point 12.
    const pointName = pn ? (pn.raw.replace(/^0+/, '') || '0') : String(points.length + 1);

    const elev = byWi.get(WI_ELEVATION);
    const codeBlock = blocks.find((b) => b.wi >= '41' && b.wi <= '49');
    const remarkBlocks = blocks.filter((b) => b.wi >= '71' && b.wi <= '79');

    points.push({
      pointName,
      easting: east.meters,
      northing: north.meters,
      elevation: elev && elev.meters !== null ? elev.meters : null,
      code: codeBlock ? codeBlock.raw.replace(/^0+/, '').trim() : '',
      description: remarkBlocks.map((b) => b.raw.replace(/^0+/, '').trim()).filter(Boolean).join(' '),
    });
  }

  if (measurementOnly > 0) {
    warnings.push(
      `${measurementOnly} line(s) hold raw observations (angles and distances) rather than coordinates and were not imported. ` +
      'Reduce them on the instrument or in its office software first — recomputing them here would repeat that adjustment with less information than the instrument had.',
    );
  }
  if (unreadableUnits > 0) {
    warnings.push(`${unreadableUnits} line(s) declared a unit this reader does not recognise and were skipped rather than imported at the wrong scale.`);
  }
  if (points.length === 0 && lines.some((l) => l.trim())) {
    warnings.push('No coordinate blocks (WI 81/82) were found. If this is a Leica measurement file, export coordinates rather than raw observations.');
  }

  cadLog.info('GSI', `Parsed ${variant}: ${points.length} point(s), ${measurementOnly} observation line(s) skipped`);
  return { variant, points, warnings };
}

/** GSI points as the rows the existing import pipeline consumes.
 *
 *  `targetUnit` matters: GSI values are converted to metres above, and a firm working in US survey
 *  feet needs them back in feet. Defaulting to metres would import a Texas boundary at roughly a
 *  third of its size, which is visible but easy to "fix" by scaling — and scaling a survey is how a
 *  legal description stops matching the ground. */
export function parseGsiAsRows(text: string, targetUnit: 'meter' | 'USSurveyFoot' | 'foot' = 'USSurveyFoot'): ParsedImportRow[] {
  const doc = parseGsi(text);
  const perMeter = targetUnit === 'meter' ? 1 : targetUnit === 'USSurveyFoot' ? 3937 / 1200 : 1 / 0.3048;

  return doc.points.map((p, idx) => {
    const numMatch = /^(\d+)/.exec(p.pointName);
    return {
      lineNumber: idx + 1,
      rawLine: `${p.pointName} E=${p.easting.toFixed(4)}m N=${p.northing.toFixed(4)}m`,
      error: null,
      data: {
        pointNumber: numMatch ? parseInt(numMatch[1], 10) : idx + 1,
        pointName: p.pointName,
        northing: p.northing * perMeter,
        easting: p.easting * perMeter,
        elevation: p.elevation === null ? null : p.elevation * perMeter,
        rawCode: p.code,
        description: p.description,
      },
    };
  });
}

/** Does this look like GSI? Leading `*` or a `WI` + four info characters + sign + digits.
 *
 *  The four information characters are NOT always dots. `11` (point number) blocks are routinely
 *  written `110001+…` — the digits are the sequential line number — and only the measurement blocks
 *  use the `..00` form. A check requiring dots misses every file whose first line is a point number,
 *  which is most of them. */
export function looksLikeGsi(text: string): boolean {
  return /^\*?\d{2}[\d.]{4}[+-]\d+/m.test(text.slice(0, 4096));
}
