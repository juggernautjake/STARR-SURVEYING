// lib/research/canary-diff.ts
//
// §9.1 (semantic / data-layer) + foundation for §9.3 of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// The strongest breakage signal in the three-layer health-check
// stack: run the live adapter against its canary input, then
// compare the freshly-extracted CanonicalProperty against the
// golden record we captured at registration (§8.5). When the
// adapter starts returning fewer fields, different values, or
// nothing at all, this diff is what trips §9.4's diagnose-and-repair
// agent.
//
// Pure — no DB, no network, no Playwright. The caller is
// responsible for running the adapter and producing the
// `extracted` argument.

import type { CanonicalProperty, CanonicalValue } from './canonical-schema';
import { unwrap } from './canonical-schema';
import { normalizeOwnerName, normalizeParcelId } from './relevance';

/** Golden record we captured at adapter registration. The shape is
 *  intentionally loose — adapter_canaries.expected_fields is a
 *  jsonb column on the §9.2 table (also a future slice), so we
 *  accept any subset of the canonical record plus a captured-at
 *  timestamp. */
export interface CanaryGoldenRecord {
  expected_fields: Partial<CanonicalProperty>;
  captured_at?: string;
  /** Optional: the query input that was used to fetch the canary
   *  (parcel_id, address, etc.). Surfaced in the diff summary so a
   *  human reviewer doesn't have to cross-reference the canary row. */
  query_input?: Record<string, unknown>;
}

export type CanaryDiffSeverity = 'healthy' | 'degraded' | 'broken';

export interface CanaryFieldChange {
  /** Dot-path into the canonical record (e.g. `owner.display_name`,
   *  `legal.text`, `acreage`). */
  path: string;
  was: unknown;
  now: unknown;
  /** Why we flagged this field — useful for the §9.4 repair agent's
   *  prompt and the §9.8 dashboard's hover-detail. */
  reason: 'missing' | 'value_changed' | 'newly_present';
}

export interface CanaryDiff {
  /** Did the adapter produce a canonical record at all? When
   *  false (parcel_id missing or attribution missing), severity is
   *  always 'broken' regardless of the other layers. */
  produced_record: boolean;
  /** Fields present in the canary but missing or null in the
   *  extracted record. */
  missing_fields: string[];
  /** Fields whose normalized values disagree between canary +
   *  extracted. */
  changed_fields: CanaryFieldChange[];
  /** Fields present in the extracted record but not in the canary.
   *  Informational — vendor portals sometimes start returning more
   *  data, which isn't a breakage. */
  new_fields: string[];
  severity: CanaryDiffSeverity;
  /** Human-readable single-line summary for the §9.8 dashboard. */
  summary: string;
}

/** Pure. Compare an extracted record against the canary golden
 *  record and report what changed. */
export function diffAgainstCanary(
  extracted: CanonicalProperty | null | undefined,
  canary: CanaryGoldenRecord,
): CanaryDiff {
  if (!extracted || !extracted.parcel_id) {
    return {
      produced_record: false,
      missing_fields: Object.keys(flatten(canary.expected_fields)),
      changed_fields: [],
      new_fields: [],
      severity: 'broken',
      summary: 'adapter produced no record',
    };
  }

  const expectedFlat = flatten(canary.expected_fields);
  const actualFlat = flatten(extracted);

  const missing: string[] = [];
  const changed: CanaryFieldChange[] = [];
  const newOnes: string[] = [];

  for (const [path, expVal] of Object.entries(expectedFlat)) {
    if (!(path in actualFlat) || actualFlat[path] === undefined || actualFlat[path] === null) {
      missing.push(path);
      continue;
    }
    if (!valuesAgree(path, expVal, actualFlat[path])) {
      changed.push({
        path,
        was: expVal,
        now: actualFlat[path],
        reason: 'value_changed',
      });
    }
  }

  for (const path of Object.keys(actualFlat)) {
    if (!(path in expectedFlat)) newOnes.push(path);
  }

  const severity: CanaryDiffSeverity =
    missing.length === 0 && changed.length === 0
      ? 'healthy'
      : isBreakingPath(missing) || changed.some((c) => isBreakingPath([c.path]))
        ? 'broken'
        : 'degraded';

  return {
    produced_record: true,
    missing_fields: missing,
    changed_fields: changed,
    new_fields: newOnes,
    severity,
    summary: buildSummary(severity, missing, changed, newOnes),
  };
}

// ── Internals ────────────────────────────────────────────────────

/** Critical fields the canonical record can't be useful without.
 *  When any of these disappear or change, severity escalates from
 *  `degraded` to `broken`. Other fields (valuation deltas, extras)
 *  are nice-to-have and only degrade the score. */
const BREAKING_PATHS = new Set([
  'parcel_id',
  'owner.display_name',
  'legal.text',
  'situs_address.formatted',
  'mailing_address.formatted',
]);

function isBreakingPath(paths: string[]): boolean {
  return paths.some((p) => BREAKING_PATHS.has(p));
}

/** Compare two values with a path-aware normalization. parcel_id +
 *  owner display names go through the slice-3 normalizers so the
 *  diff isn't fooled by cosmetic vendor changes ("R0012345" → "R12345"
 *  is NOT a change worth flagging). Other strings use trimmed lower-
 *  case; numbers use small-epsilon comparison; objects fall through
 *  to JSON equality. */
function valuesAgree(path: string, a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  if (typeof a === 'string' && typeof b === 'string') {
    if (path === 'parcel_id') return normalizeParcelId(a) === normalizeParcelId(b);
    if (path === 'owner.display_name') return normalizeOwnerName(a) === normalizeOwnerName(b);
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  if (typeof a === 'number' && typeof b === 'number') {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
    const diff = Math.abs(a - b);
    const scale = Math.max(Math.abs(a), Math.abs(b), 1);
    return diff / scale < 0.005; // 0.5% tolerance handles rounding
  }

  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;

  // Fallback: structural equality.
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Flatten the subset of CanonicalProperty fields the canary cares
 *  about into a dot-pathed map. Wrapped `CanonicalValue<T>` fields
 *  are unwrapped so the canary's bare snapshot compares cleanly
 *  against an adapter that's now using attribution. Arrays/objects
 *  below the documented top-level paths are stringified so we still
 *  catch value changes inside `deed_references[0]` without
 *  exploding the path map. */
const PATHS: ReadonlyArray<keyof CanonicalProperty> = [
  'parcel_id',
  'county_fips',
  'owner',
  'mailing_address',
  'situs_address',
  'legal',
  'acreage',
  'valuation',
  'geometry',
  'deed_references',
  'plat_reference',
];

function flatten(rec: Partial<CanonicalProperty>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PATHS) {
    const raw = rec[k];
    if (raw === undefined || raw === null) continue;
    const v = unwrap(raw as never);
    if (v === undefined || v === null) continue;

    if (k === 'owner' && typeof v === 'object') {
      const o = v as { display_name?: string };
      if (o.display_name) out['owner.display_name'] = o.display_name;
    } else if ((k === 'mailing_address' || k === 'situs_address') && typeof v === 'object') {
      const a = v as { formatted?: string };
      if (a.formatted) out[`${k}.formatted`] = a.formatted;
    } else if (k === 'legal' && typeof v === 'object') {
      const l = v as { text?: string; legal_acreage?: number };
      if (l.text) out['legal.text'] = l.text;
      if (l.legal_acreage != null) out['legal.legal_acreage'] = l.legal_acreage;
    } else if (k === 'valuation' && typeof v === 'object') {
      const val = v as Record<string, unknown>;
      for (const sub of ['market_value', 'land_value', 'improvement_value', 'appraised_value']) {
        if (val[sub] != null) out[`valuation.${sub}`] = val[sub];
      }
    } else {
      out[k as string] = v;
    }
  }
  return out;
}

function buildSummary(
  severity: CanaryDiffSeverity,
  missing: string[],
  changed: CanaryFieldChange[],
  newOnes: string[],
): string {
  if (severity === 'healthy') {
    return newOnes.length > 0
      ? `healthy (+${newOnes.length} new field${newOnes.length === 1 ? '' : 's'})`
      : 'healthy';
  }
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`${missing.length} missing (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''})`);
  if (changed.length > 0) parts.push(`${changed.length} changed (${changed.slice(0, 3).map((c) => c.path).join(', ')}${changed.length > 3 ? '…' : ''})`);
  if (parts.length === 0) parts.push('no field changes');
  return `${severity}: ${parts.join('; ')}`;
}

/** Type-safe re-export so the §9.3 health-check writer can stamp
 *  a typed `CanaryFieldChange[]` straight into the jsonb column. */
export type { CanonicalProperty, CanonicalValue };
