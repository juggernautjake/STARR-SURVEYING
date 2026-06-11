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

/** cad-domain-audit Slice N — the canonical property key every new
 *  creation path stamps a point's display name under. Legacy keys
 *  (`pointNo` / `pointNumber` / `name`) remain readable as fallbacks
 *  for unmigrated data, but writers should standardise on this. */
export const CANONICAL_POINT_NAME_KEY = 'pointName' as const;

/** Resolve a point's display number/name, or null when it has none.
 *
 *  Read order (first hit wins): `pointNo` → `pointNumber` →
 *  `pointName` → `name`. `pointName` is the CANONICAL key going
 *  forward (`CANONICAL_POINT_NAME_KEY`) — new creation paths stamp
 *  it and the load-time migration `canonicalizePointName` backfills
 *  it from the legacy keys when missing — but the read order keeps
 *  pre-canonical writers (e.g. the renumber operation which still
 *  writes `pointNumber`) authoritative until they migrate too. */
export function pointNumberOf(f: HasProps): string | null {
  const p = f.properties ?? {};
  const v = p.pointNo ?? p.pointNumber ?? p.pointName ?? p.name;
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** cad-domain-audit Slice N — ensure `properties.pointName` is set,
 *  copying from the legacy alias chain (`pointNo` / `pointNumber` /
 *  `name`) when missing. Returns the input UNCHANGED when the
 *  canonical key is already populated OR no alias is set. Used by
 *  the document-load migration so unmigrated saved data normalises
 *  on open without touching the file on disk. */
export function canonicalizePointName(
  properties: Record<string, string | number | boolean> | null | undefined,
): Record<string, string | number | boolean> | undefined {
  const p = properties ?? {};
  if (typeof p.pointName === 'string' && p.pointName.trim().length > 0) {
    return properties ?? undefined;
  }
  const legacy = p.pointNo ?? p.pointNumber ?? p.name;
  if (legacy == null) return properties ?? undefined;
  const s = String(legacy).trim();
  if (s.length === 0) return properties ?? undefined;
  return { ...p, [CANONICAL_POINT_NAME_KEY]: s };
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
