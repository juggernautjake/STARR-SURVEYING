// lib/cad/calculators/place-curve.ts — C29, a solved curve becomes geometry
//
// ── THE GAP ─────────────────────────────────────────────────────────────────────────────────────
//
// `CurveCalculator` has an `onPlace?: (curve: CurveParameters) => void` prop and renders its "Place
// on drawing" button only when that prop is present. **Nothing passes it.** So the button has never
// rendered, and the only curve path in the product that creates geometry does not.
//
// C28's registry asserted `curve-place.writesGeometry: true` on the strength of the prop existing —
// which was wrong, and is a fair illustration of why C27's scan needed four corrections: a
// capability can be present in the type signature and absent from the running product.
//
// ── WHY A PURE MODULE ───────────────────────────────────────────────────────────────────────────
//
// Turning `CurveParameters` into an ARC is one conversion with three chances to be silently wrong —
// the angle convention, the sweep direction, and which end is the start. All three produce a curve
// that looks plausible and is not the one that was solved, which on a plat is worse than no curve.
// So it is tested against the parameters it came from rather than eyeballed on a canvas.

import type { CurveParameters, Feature, ArcGeometry } from '../types';
import { generateId } from '../types';
import { DEFAULT_FEATURE_STYLE } from '../constants';
import { stampDerivation } from '../derivation';

/**
 * Arc geometry for a solved curve.
 *
 * **Angles are measured from east, counter-clockwise** — the math convention `ArcGeometry` uses
 * everywhere else in this codebase (`tessellateArc`, the DXF writer, the renderer). `CurveParameters`
 * carries `rp` (the radius point) and the two endpoints, so the angles come straight out of
 * `atan2`; nothing here re-derives geometry the solver already produced.
 *
 * `anticlockwise` follows the curve's own `direction`, and **the mapping was measured rather than
 * derived**. The obvious reasoning — "a curve deflecting RIGHT sweeps clockwise, so LEFT is the
 * anticlockwise one" — is backwards for this solver, and the first version of this file shipped
 * exactly that. Solving R=200, Δ=60° from the origin on azimuth 0 gives:
 *
 *     RIGHT   start −180°  end −120°   → increasing, i.e. anticlockwise
 *     LEFT    start    0°  end  −60°   → decreasing, i.e. clockwise
 *
 * Getting it backwards draws the *major* arc — the long way round the circle. At R=200 that is
 * 1047 ft of arc where 209 was solved: a 300-foot error that still passes for a curve at a glance,
 * which is why the minor-arc sweep is asserted in both directions rather than reasoned about here.
 */
export function curveToArcGeometry(curve: CurveParameters): ArcGeometry {
  const startAngle = Math.atan2(curve.pc.y - curve.rp.y, curve.pc.x - curve.rp.x);
  const endAngle = Math.atan2(curve.pt.y - curve.rp.y, curve.pt.x - curve.rp.x);
  return {
    center: { ...curve.rp },
    radius: curve.R,
    startAngle,
    endAngle,
    anticlockwise: curve.direction === 'RIGHT',
  };
}

/**
 * A drawable ARC feature for a solved curve.
 *
 * The curve's numbers are stamped onto `properties` — radius, arc length, chord, delta in degrees,
 * tangent, and the direction. **This is the closest thing to provenance the product currently has**
 * and it is deliberately not called that: C30 is where a derivation becomes a first-class field
 * that a viewer can read back. Until then these properties at least mean a placed curve carries the
 * numbers it was solved from, so a curve table can be checked against the geometry rather than
 * against a memory of what was typed.
 */
export function curveToFeature(
  curve: CurveParameters,
  layerId: string,
  id: string = generateId(),
): Feature {
  return {
    id,
    type: 'ARC',
    geometry: { type: 'ARC', arc: curveToArcGeometry(curve) },
    layerId,
    style: { ...DEFAULT_FEATURE_STYLE },
    // C30 — one derivation vocabulary. This shipped in C29 with its own ad-hoc `calc*` keys, and
    // by the end of that slice run four surfaces had each invented a different set. The drift was
    // introduced by the slices fixing the gap, which is the argument for the shared model.
    properties: stampDerivation({}, {
      method: 'CURVE_CALCULATOR',
      inputs: {
        radius: round(curve.R),
        deltaDeg: round((curve.delta * 180) / Math.PI),
        direction: curve.direction,
      },
      // Solved, not given — and labelled as such, because "R 200, L 209.44" tells a reader nothing
      // about which was which, and on a plat under examination that is the only question.
      outputs: {
        arcLength: round(curve.L),
        chord: round(curve.C),
        tangent: round(curve.T),
      },
      at: new Date().toISOString(),
    }),
  };
}

/** Three decimals — survey feet. Storing raw floats would put `132.48000000000002` in a curve
 *  table, which reads as a precision claim nobody made. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
