// lib/cad/points/point-naming.ts
//
// Deterministic core for point identity & auto-naming (plan §8). Pure,
// framework-free, unit-testable. AI naming is an OPTIONAL enhancement
// layered on top (§8e); correctness never depends on it.
//
// Rules (plan §8.1):
//   1. New vertices/points get a name (mint).
//   2. A vertex coincident with an existing point on the SAME layer
//      reuses that point's name (no mint).
//   3. A vertex coincident with an existing point on a DIFFERENT layer
//      gets `<base>:<N>` (the same physical point, referenced on another
//      layer). N increments per base.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §8

export interface NamedCoord {
  name: string;
  x: number;
  y: number;
  layerId?: string;
}

/** Split "255:1" → { base: "255", suffix: 1 }; "255" → { base: "255" }. */
export function parsePointName(name: string): { base: string; suffix?: number } {
  const i = name.lastIndexOf(':');
  if (i > 0 && i < name.length - 1) {
    const tail = name.slice(i + 1);
    if (/^\d+$/.test(tail)) return { base: name.slice(0, i), suffix: Number(tail) };
  }
  return { base: name };
}

/**
 * Next fresh point name given the names already in the drawing. Prefers
 * continuing a numeric scheme (max integer + 1); falls back to a `P#`
 * scheme, then guarantees no collision with any existing name.
 */
export function nextPointName(existing: Iterable<string>): string {
  const names = new Set<string>();
  let maxInt = -Infinity;
  let maxP = -Infinity;
  for (const raw of existing) {
    const n = String(raw).trim();
    if (n === '') continue;
    names.add(n);
    if (/^\d+$/.test(n)) maxInt = Math.max(maxInt, Number(n));
    const pm = /^P(\d+)$/.exec(n);
    if (pm) maxP = Math.max(maxP, Number(pm[1]));
  }

  const free = (candidate: string) => !names.has(candidate);

  if (Number.isFinite(maxInt)) {
    let next = maxInt + 1;
    while (!free(String(next))) next++;
    return String(next);
  }
  if (Number.isFinite(maxP)) {
    let next = maxP + 1;
    while (!free(`P${next}`)) next++;
    return `P${next}`;
  }
  // No recognizable scheme — start at 1, skipping any taken names.
  let next = 1;
  while (!free(String(next))) next++;
  return String(next);
}

/**
 * Cross-layer derived name `<base>:<N>` using the smallest free N ≥ 1.
 * `base` is stripped of any existing suffix first so deriving from
 * "255:2" still yields "255:N".
 */
export function derivedName(base: string, existing: Iterable<string>): string {
  const root = parsePointName(String(base)).base;
  const names = new Set<string>();
  for (const n of existing) names.add(String(n).trim());
  let n = 1;
  while (names.has(`${root}:${n}`)) n++;
  return `${root}:${n}`;
}

/**
 * Name of the registry point coincident with `coord` within `tol`
 * (nearest wins), or null. Used to decide reuse vs. mint vs. derive.
 */
export function coincidentName(
  coord: { x: number; y: number },
  registry: readonly NamedCoord[],
  tol: number,
): NamedCoord | null {
  let best: NamedCoord | null = null;
  let bestD2 = tol * tol;
  for (const p of registry) {
    const dx = p.x - coord.x;
    const dy = p.y - coord.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

/**
 * Decide the name for a new vertex at `coord` on `layerId` per §8 rules.
 * Returns the name plus whether a new registry entry should be created
 * (mint / derive) or an existing one reused.
 */
export function resolveVertexName(
  coord: { x: number; y: number },
  layerId: string,
  registry: readonly NamedCoord[],
  allNames: Iterable<string>,
  tol: number,
): { name: string; action: 'reuse' | 'derive' | 'mint' } {
  const hit = coincidentName(coord, registry, tol);
  if (hit && hit.layerId === layerId) return { name: hit.name, action: 'reuse' };
  if (hit) return { name: derivedName(hit.name, allNames), action: 'derive' };
  return { name: nextPointName(allNames), action: 'mint' };
}
