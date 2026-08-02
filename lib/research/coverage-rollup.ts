// lib/research/coverage-rollup.ts — what we can actually read, not what we meant to (plan R11).
//
// ── TWO DIFFERENT CLAIMS, SHOWN AS ONE ──────────────────────────────────────────────────────────
//
// `/admin/research/coverage` renders the worker's compiled clerk registry: 22 counties, each with
// the vendor it runs and whether an adapter was written. That is a map of INTENT — what somebody
// planned to support — and it is rendered identically whether the adapter has ever successfully
// read a page or not.
//
// Since R8/R9 there is a second, harder fact available: `research_site_adapters` carries a measured
// status, and `research_adapter_health_checks` says when it was last proven. A county can be green
// on the intent map and broken in reality, and the gap between them is exactly what the self-healing
// work exists to close.
//
// This module computes the second claim and keeps it separate from the first, because collapsing
// them is how a firm promises a customer a county it cannot search.
//
// ── THE DISTINCTION THAT MATTERS MOST IS "VERIFIED" vs "CLAIMED" ────────────────────────────────
//
// An adapter marked `active` that has never passed a health check is a claim nobody has tested. It
// is not the same as one that passed twenty minutes ago, and a coverage dashboard that shows them
// identically is worse than one that shows nothing — it converts an unknown into a promise.

export type CoverageLevel = 'full' | 'partial' | 'requested' | 'none';

/** The registry's adapter lifecycle. */
export type AdapterStatus = 'draft' | 'active' | 'degraded' | 'broken' | 'quarantined' | 'retired';

export interface AdapterRow {
  countyName: string;
  siteType: string;
  status: AdapterStatus;
  system: string | null;
  /** Last time a health check PASSED. Null when one has never passed. */
  lastVerifiedAt: string | null;
  /** Most recent health check outcome, whatever it was. */
  lastCheckStatus?: 'healthy' | 'degraded' | 'broken' | 'no_record' | 'error' | null;
  lastCheckAt?: string | null;
}

export type SiteState =
  /** Proven: an adapter exists, is active, and a check has passed. */
  | 'verified'
  /** Claimed: active, but nothing has ever proven it. */
  | 'unverified'
  /** Known to be failing right now. */
  | 'failing'
  /** Registered but not built out — a stub, a placeholder. */
  | 'planned'
  /** Nothing registered at all. */
  | 'absent';

export interface SiteCoverage {
  siteType: string;
  state: SiteState;
  system: string | null;
  lastVerifiedAt: string | null;
  /** Why it is in this state, in words a person can act on. */
  note: string;
}

export interface CountyCoverage {
  county: string;
  level: CoverageLevel;
  sites: SiteCoverage[];
  /** One sentence for the county row. */
  summary: string;
  /** True when nothing here has ever been proven — the case a dashboard must not dress up. */
  everVerified: boolean;
}

/** The record types a county needs before research is genuinely "covered".
 *
 *  Deeds and the appraisal district. A plat index is often inside one of those, and the other site
 *  types (flood, GLO) are statewide sources rather than per-county coverage. */
export const CORE_SITE_TYPES = ['clerk_deeds', 'appraisal_cad'] as const;

function stateFor(row: AdapterRow | undefined): SiteState {
  if (!row) return 'absent';
  if (row.status === 'broken' || row.status === 'quarantined') return 'failing';
  if (row.status === 'degraded') return 'failing';
  if (row.status === 'draft' || row.status === 'retired') return 'planned';
  // active:
  return row.lastVerifiedAt ? 'verified' : 'unverified';
}

function noteFor(state: SiteState, row: AdapterRow | undefined): string {
  switch (state) {
    case 'verified':
      return `Last proven ${friendlyDate(row?.lastVerifiedAt)}.`;
    case 'unverified':
      // The honest sentence. Not "available", which would make an untested claim look like a fact.
      return 'Registered and believed to work, but no health check has ever passed against it.';
    case 'failing':
      return row?.lastCheckStatus === 'error'
        ? 'The portal did not respond on the last check.'
        : 'The last check found the page changed — a repair is needed.';
    case 'planned':
      return 'Registered as a placeholder; the adapter is not built out yet.';
    case 'absent':
    default:
      return 'No adapter registered for this county.';
  }
}

function friendlyDate(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : 'never';
}

/** Roll one county's adapters into a coverage claim. */
export function rollupCounty(county: string, rows: AdapterRow[]): CountyCoverage {
  const sites: SiteCoverage[] = CORE_SITE_TYPES.map((siteType) => {
    const row = rows.find((r) => r.siteType === siteType);
    const state = stateFor(row);
    return {
      siteType,
      state,
      system: row?.system ?? null,
      lastVerifiedAt: row?.lastVerifiedAt ?? null,
      note: noteFor(state, row),
    };
  });

  const verified = sites.filter((s) => s.state === 'verified').length;
  const failing = sites.filter((s) => s.state === 'failing').length;
  const present = sites.filter((s) => s.state !== 'absent').length;

  // `full` requires every core record type PROVEN. An unverified adapter never reaches `full`,
  // because the whole point of this rollup is that a customer-facing claim rests on evidence.
  const level: CoverageLevel =
    verified === CORE_SITE_TYPES.length ? 'full'
    : verified > 0 ? 'partial'
    : present > 0 ? 'requested'
    : 'none';

  return {
    county,
    level,
    sites,
    everVerified: verified > 0,
    summary: summarise(county, level, verified, failing, present),
  };
}

function summarise(county: string, level: CoverageLevel, verified: number, failing: number, present: number): string {
  if (level === 'full') return `${county}: deeds and appraisal records both proven working.`;
  if (level === 'partial') {
    const missing = CORE_SITE_TYPES.length - verified;
    return failing > 0
      ? `${county}: ${verified} of ${CORE_SITE_TYPES.length} record types proven; ${failing} currently failing.`
      : `${county}: ${verified} of ${CORE_SITE_TYPES.length} record types proven, ${missing} unproven.`;
  }
  if (level === 'requested') {
    return failing > 0
      ? `${county}: adapters registered but currently failing — nothing proven.`
      : `${county}: adapters registered, none proven yet.`;
  }
  return `${county}: nothing registered — a run here falls back to generic search.`;
}

/** Roll the whole state up, county by county. */
export function rollupCoverage(rows: AdapterRow[]): CountyCoverage[] {
  const byCounty = new Map<string, AdapterRow[]>();
  for (const row of rows) {
    const list = byCounty.get(row.countyName) ?? [];
    list.push(row);
    byCounty.set(row.countyName, list);
  }
  return [...byCounty.entries()]
    .map(([county, rs]) => rollupCounty(county, rs))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.county.localeCompare(b.county));
}

const LEVEL_ORDER: Record<CoverageLevel, number> = { full: 0, partial: 1, requested: 2, none: 3 };

export interface CoverageTotals {
  counties: number;
  full: number;
  partial: number;
  requested: number;
  none: number;
  /** Counties where nothing has ever been proven. The number that matters most, and the one an
   *  intent-only map cannot produce at all. */
  neverVerified: number;
}

export function coverageTotals(counties: CountyCoverage[]): CoverageTotals {
  return {
    counties: counties.length,
    full: counties.filter((c) => c.level === 'full').length,
    partial: counties.filter((c) => c.level === 'partial').length,
    requested: counties.filter((c) => c.level === 'requested').length,
    none: counties.filter((c) => c.level === 'none').length,
    neverVerified: counties.filter((c) => !c.everVerified).length,
  };
}

/** The headline a person reads first. Deliberately leads with what is PROVEN, because a coverage
 *  page that leads with what is registered is an intent map wearing a measurement's clothes. */
export function coverageHeadline(totals: CoverageTotals): string {
  if (totals.counties === 0) {
    return 'No county adapters are registered yet, so nothing here has been measured.';
  }
  if (totals.full === 0 && totals.partial === 0) {
    return `${totals.counties} counties are registered and none has been proven to work yet — run a health check to find out where we actually stand.`;
  }
  return `${totals.full} county(ies) fully proven, ${totals.partial} partly. ${totals.neverVerified} of ${totals.counties} registered counties have never passed a check.`;
}
