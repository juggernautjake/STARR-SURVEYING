// lib/cad/io/trv-fill-patterns.ts
//
// cad-trv-line-curve-fidelity Slice 3 — maps Traverse PC's named
// fill patterns to Starr CAD's infill options. The authoritative
// TPC fill list comes from the Traverse Drawing Settings → Fill
// dropdown (47 named patterns in order), captured from the user's
// screenshots.
//
// Starr's 8 fill patterns: NONE / SOLID / DOT_UNIFORM /
// DOT_GRAVEL / LINES / CROSSHATCH / BRICK / WAVE. We approximate
// each TPC pattern with the closest Starr pattern + a rotation
// (degrees) + density hint so the imported fill reads as close to
// the TPC original as our pattern set allows. The user can fine-
// tune rotation / size / density afterward via the infill panel.
//
// Pure module: no DOM, no React, no store deps.

import type { FillPattern } from '../types';

/** TPC's fill dropdown, in display order. Index = the 0-based
 *  position in the Traverse Drawing Settings → Fill list. The
 *  trailing `*` ("exports to CAD") is dropped from the name. */
export const TPC_FILL_NAMES: string[] = [
  'Diagonal /',        // 0
  'Cross',             // 1
  'Diagonal Cross',    // 2
  'Brick',             // 3
  'Brick Filled',      // 4
  'Clay',              // 5
  'Concrete',          // 6
  'Earth',             // 7
  'Forest',            // 8
  'Forest (filled)',   // 9
  'Grass',             // 10
  'Gravel',            // 11
  'Sand',              // 12
  'Swamp',             // 13
  'Swamp (filled)',    // 14
  'Water',             // 15
  'Water (filled)',    // 16
  '5 Percent',         // 17
  '10 Percent',        // 18
  '20 Percent',        // 19
  '25 Percent',        // 20
  '30 Percent',        // 21
  '40 Percent',        // 22
  '50 Percent',        // 23
  '60 Percent',        // 24
  '70 Percent',        // 25
  '75 Percent',        // 26
  '80 Percent',        // 27
  '90 Percent',        // 28
  'Light Diagonal \\', // 29
  'Light Diagonal /',  // 30
  'Dark Diagonal \\',  // 31
  'Dark Diagonal /',   // 32
  'Wide Diagonal \\',  // 33
  'Wide Diagonal /',   // 34
  'Light Vertical',    // 35
  'Light Horizontal',  // 36
  'Narrow Vertical',   // 37
  'Narrow Horizontal', // 38
  'Dark Vertical',     // 39
  'Dark Horizontal',   // 40
  'Dashed Diagonal \\',// 41
  'Dashed Diagonal /', // 42
  'Dashed Horizontal', // 43
  'Dashed Vertical',   // 44
  'Small Confetti',    // 45
  'Large Confetti',    // 46
];

export interface StarrFillSpec {
  /** Closest Starr fill pattern. */
  pattern: FillPattern;
  /** Pattern rotation in degrees (0 = unrotated baseline). */
  rotation: number;
  /** Density multiplier hint (0.25–4). Higher = denser dots /
   *  tighter hatch. */
  density: number;
  /** The canonical TPC name this came from (for audit). */
  tpcName: string;
}

/** Map a TPC fill (by NAME) to the closest Starr fill spec.
 *  Returns null when the name isn't recognized (caller falls
 *  back to NONE + preserves the raw record for round-trip). */
export function tpcFillNameToStarr(name: string): StarrFillSpec | null {
  const clean = name.replace(/\*$/, '').trim();
  const lower = clean.toLowerCase();

  // ── Diagonal hatch families ──
  if (lower === 'diagonal /' || lower === 'light diagonal /' || lower === 'dark diagonal /' || lower === 'wide diagonal /' || lower === 'dashed diagonal /') {
    return { pattern: 'LINES', rotation: 45, density: densityForWeight(lower), tpcName: clean };
  }
  if (lower === 'light diagonal \\' || lower === 'dark diagonal \\' || lower === 'wide diagonal \\' || lower === 'dashed diagonal \\') {
    return { pattern: 'LINES', rotation: 135, density: densityForWeight(lower), tpcName: clean };
  }
  // ── Cross families ──
  if (lower === 'cross') {
    return { pattern: 'CROSSHATCH', rotation: 0, density: 1, tpcName: clean };
  }
  if (lower === 'diagonal cross') {
    return { pattern: 'CROSSHATCH', rotation: 45, density: 1, tpcName: clean };
  }
  // ── Brick ──
  if (lower === 'brick' || lower === 'brick filled') {
    return { pattern: 'BRICK', rotation: 0, density: 1, tpcName: clean };
  }
  // ── Vertical / horizontal line families ──
  if (lower === 'light vertical' || lower === 'narrow vertical' || lower === 'dark vertical' || lower === 'dashed vertical') {
    return { pattern: 'LINES', rotation: 90, density: densityForWeight(lower), tpcName: clean };
  }
  if (lower === 'light horizontal' || lower === 'narrow horizontal' || lower === 'dark horizontal' || lower === 'dashed horizontal') {
    return { pattern: 'LINES', rotation: 0, density: densityForWeight(lower), tpcName: clean };
  }
  // ── Stipple / dot families (natural-earth textures) ──
  if (lower === 'gravel' || lower === 'sand' || lower === 'earth' || lower === 'clay' || lower === 'concrete' || lower === 'small confetti' || lower === 'large confetti') {
    return { pattern: 'DOT_GRAVEL', rotation: 0, density: lower === 'large confetti' ? 0.5 : lower === 'sand' ? 2 : 1, tpcName: clean };
  }
  // ── Water / swamp → wave ──
  if (lower === 'water' || lower === 'water (filled)' || lower === 'swamp' || lower === 'swamp (filled)') {
    return { pattern: 'WAVE', rotation: 0, density: 1, tpcName: clean };
  }
  // ── Vegetation → grass tufts ──
  // cad-trv-fidelity Slice 6 — map TPC grass/forest fills to the
  // dedicated GRASS pattern (upward blades) instead of the old
  // dense-dot approximation, for a much closer match to the plat.
  if (lower === 'forest' || lower === 'forest (filled)' || lower === 'grass') {
    return { pattern: 'GRASS', rotation: 0, density: 1, tpcName: clean };
  }
  // ── Percent screens → uniform dots, density scaled by % ──
  const pct = /^(\d+)\s+percent$/.exec(lower);
  if (pct) {
    const p = parseInt(pct[1], 10);
    // 5% → sparse (0.5×), 90% → dense (4×). Linear-ish map.
    const density = Math.max(0.25, Math.min(4, (p / 100) * 4));
    return { pattern: 'DOT_UNIFORM', rotation: 0, density, tpcName: clean };
  }
  return null;
}

/** Map a TPC fill by INDEX into the dropdown list. */
export function tpcFillIndexToStarr(index: number): StarrFillSpec | null {
  if (index < 0 || index >= TPC_FILL_NAMES.length) return null;
  return tpcFillNameToStarr(TPC_FILL_NAMES[index]);
}

/** Density hint from the light/narrow/dark/wide/dashed qualifier
 *  on a hatch name. */
function densityForWeight(lowerName: string): number {
  if (lowerName.startsWith('light')) return 0.5;
  if (lowerName.startsWith('narrow')) return 2;
  if (lowerName.startsWith('dark')) return 1.5;
  if (lowerName.startsWith('wide')) return 0.5;
  if (lowerName.startsWith('dashed')) return 1;
  return 1;
}
