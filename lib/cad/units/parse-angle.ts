// lib/cad/units/parse-angle.ts
//
// Phase 8 §11.5 — angle-input parser. Returns the canonical
// surveyor azimuth (0 = North, clockwise, 0–360). Auto-
// detects bearing vs. azimuth, accepts DMS / decimal /
// hyphen-separated forms, and supports the DMS-packed
// numeric shortcut common in Trimble / Carlson exports
// where `45.3000` means `45° 30' 00"`.
//
// The existing `lib/cad/geometry/bearing.ts::parseBearing`
// covers a tighter subset; this module is a superset and
// the rest of the codebase should migrate to it.

import { quadrantToAzimuth, dmsToDecimal } from '../geometry/bearing';
import type { QuadrantBearing } from '../geometry/bearing';

export type AngleMode = 'BEARING' | 'AZIMUTH' | 'AUTO';

export interface ParsedAngle {
  /** Canonical value: decimal-degree azimuth (0 = North, clockwise). */
  azimuth: number;
  sourceMode: 'BEARING' | 'AZIMUTH';
  /** DMS components when the input had them, else null. */
  components: { deg: number; min: number; sec: number } | null;
  /** True when the input contained explicit DMS markers (° ' " or hyphen-separated triples). */
  hadDmsMarkers: boolean;
}

interface ParseOpts {
  /** When true (default), `45.3000` is interpreted as `45° 30' 00"`. */
  dmsPackedEnabled?: boolean;
}

/**
 * Strip DMS markers (° ' ′ " ″) and split a body string on whitespace
 * or hyphens into 1–3 numeric tokens. Returns the components or null
 * when the body isn't a valid deg / deg-min / deg-min-sec form.
 */
function parseDmsBody(body: string): { deg: number; min: number; sec: number } | null {
  // Replace DMS markers with whitespace, collapse hyphens to whitespace,
  // then split on whitespace.
  const stripped = body
    .replace(/[°′'″"]/g, ' ')
    .replace(/-/g, ' ')
    .trim();
  const parts = stripped.split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 3) return null;
  for (const p of parts) if (!/^-?\d+(?:\.\d+)?$/.test(p)) return null;
  const deg = parseFloat(parts[0]);
  const min = parts[1] != null ? parseFloat(parts[1]) : 0;
  const sec = parts[2] != null ? parseFloat(parts[2]) : 0;
  if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
  if (min >= 60 || sec >= 60 || min < 0 || sec < 0) return null;
  return { deg, min, sec };
}

function tryParseQuadrantBearing(s: string): { qb: QuadrantBearing; comps: { deg: number; min: number; sec: number } } | null {
  // Match leading N/S + body + trailing E/W. Body may contain DMS
  // markers and whitespace; we delegate component parsing to
  // parseDmsBody so trailing minute-marker without seconds works.
  const m = s.toUpperCase().match(/^([NS])\s*(.+?)\s*([EW])$/);
  if (!m) return null;
  const body = m[2].trim();
  if (!body) return null;
  const dms = parseDmsBody(body);
  if (!dms) return null;
  const decimalDeg = dms.deg + dms.min / 60 + dms.sec / 3600;
  if (decimalDeg < 0 || decimalDeg > 90) return null;
  const intDeg = Math.floor(decimalDeg);
  const fracDeg = decimalDeg - intDeg;
  const intMin = Math.floor(fracDeg * 60);
  const intSec = Math.floor((fracDeg * 60 - intMin) * 60);
  const qb: QuadrantBearing = {
    direction1: m[1] as 'N' | 'S',
    degrees: intDeg,
    minutes: intMin,
    seconds: intSec,
    tenthSeconds: 0,
    direction2: m[3] as 'E' | 'W',
  };
  return {
    qb,
    comps: { deg: intDeg, min: intMin, sec: intSec },
  };
}

/** DMS azimuth: ddd°mm'ss" (or hyphen separators). */
function tryParseAzimuthDms(s: string): { azimuth: number; comps: { deg: number; min: number; sec: number } } | null {
  // Require either explicit ° / ' / " markers OR a hyphen-separated
  // triple — otherwise we'd swallow plain decimal numbers.
  const dmsMarker = /[°'′"″]/;
  const hyphenTriple = /^\d+\s*-\s*\d+\s*-\s*\d+(?:\.\d+)?$/;
  if (!dmsMarker.test(s) && !hyphenTriple.test(s)) return null;
  const dms = parseDmsBody(s);
  if (!dms) return null;
  const az = dmsToDecimal(Math.floor(dms.deg), dms.min, dms.sec);
  if (az < 0 || az >= 360) return null;
  return {
    azimuth: az,
    comps: { deg: Math.floor(dms.deg), min: Math.floor(dms.min), sec: Math.floor(dms.sec) },
  };
}

/**
 * DMS-packed numeric shortcut.
 * `DDD.MMSS` (or `DDD.MMSST` for tenth-second) — split as:
 *   deg = floor(int part)
 *   min = floor(frac * 100)
 *   sec = round((frac * 10000) % 100)
 *
 * Triggered only when the input has ≥ 4 decimal digits (otherwise it's
 * almost certainly plain decimal degrees). Returns null if mm or ss
 * fall outside [0,60).
 */
function tryParseDmsPacked(s: string): { azimuth: number; comps: { deg: number; min: number; sec: number } } | null {
  const m = s.match(/^(\d+)\.(\d{4,})$/);
  if (!m) return null;
  const intPart = parseInt(m[1], 10);
  const fracStr = m[2];
  const mm = parseInt(fracStr.slice(0, 2), 10);
  const ssStr = fracStr.slice(2, 4);
  const ss = parseInt(ssStr, 10);
  // Tenth-of-second tail — silently discarded (we still surface ss).
  if (mm >= 60 || ss >= 60) return null;
  const azimuth = intPart + mm / 60 + ss / 3600;
  if (azimuth >= 360) return null;
  return {
    azimuth,
    comps: { deg: intPart, min: mm, sec: ss },
  };
}

export function parseAngle(
  input: string,
  mode: AngleMode = 'AUTO',
  opts: ParseOpts = {},
): ParsedAngle | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const dmsPackedEnabled = opts.dmsPackedEnabled ?? true;

  // 1. Quadrant bearing — only when allowed by mode.
  if (mode !== 'AZIMUTH') {
    const qbHit = tryParseQuadrantBearing(raw);
    if (qbHit) {
      const azimuth = quadrantToAzimuth(qbHit.qb);
      return {
        azimuth,
        sourceMode: 'BEARING',
        components: qbHit.comps,
        hadDmsMarkers: /[°'′"″\-]/.test(raw),
      };
    }
  }

  // 2. DMS azimuth (markers or hyphen-triple).
  if (mode !== 'BEARING') {
    const dms = tryParseAzimuthDms(raw);
    if (dms) {
      return {
        azimuth: dms.azimuth,
        sourceMode: 'AZIMUTH',
        components: dms.comps,
        hadDmsMarkers: true,
      };
    }
  }

  // 3. DMS-packed numeric shortcut.
  if (mode !== 'BEARING' && dmsPackedEnabled) {
    const packed = tryParseDmsPacked(raw);
    if (packed) {
      return {
        azimuth: packed.azimuth,
        sourceMode: 'AZIMUTH',
        components: packed.comps,
        hadDmsMarkers: false,
      };
    }
  }

  // 4. Plain decimal degrees.
  if (mode !== 'BEARING') {
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
      const v = parseFloat(raw);
      if (Number.isFinite(v) && v >= 0 && v < 360) {
        return {
          azimuth: v,
          sourceMode: 'AZIMUTH',
          components: null,
          hadDmsMarkers: false,
        };
      }
    }
  }

  return null;
}
