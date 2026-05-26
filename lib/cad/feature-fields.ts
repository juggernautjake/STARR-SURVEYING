// lib/cad/feature-fields.ts
//
// Point features are created by several code paths (AI assembly,
// manual draw, renumber ops) that historically stored the point
// number under different property keys — `pointNumber`, `pointName`,
// or `pointNo`. Exporters must read all of them or survey points lose
// their numbers (and fall back to internal UUIDs). These helpers are
// the single source of truth for pulling survey-meaningful fields off
// a feature regardless of which path produced it.

interface HasProps {
  properties?: Record<string, string | number | boolean> | null;
}

/** Resolve a point's display number/name, or null when it has none. */
export function pointNumberOf(f: HasProps): string | null {
  const p = f.properties ?? {};
  const v = p.pointNo ?? p.pointNumber ?? p.pointName ?? p.name;
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Resolve a point's survey code (e.g. "BC02"), or empty string. */
export function pointCodeOf(f: HasProps): string {
  const p = f.properties ?? {};
  return String(p.code ?? p.rawCode ?? p.resolvedAlphaCode ?? '').trim();
}

/** Resolve a point's description, or empty string. */
export function pointDescriptionOf(f: HasProps): string {
  const p = f.properties ?? {};
  return String(p.description ?? p.desc ?? p.name ?? '').trim();
}
