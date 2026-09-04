// worker/src/infra/health-persistence.ts — what the monitor sensed, written down (plan R9).
//
// ── THE LINK THAT WAS MISSING ───────────────────────────────────────────────────────────────────
//
// Owner: *"the system needs to be able to check and sense when a website has changed or been
// updated. Then it needs to adjust and self heal."*
//
// Both halves already existed, and neither could reach the other:
//
//   SENSE   `SiteHealthMonitor` opens every county portal in Chromium on a 30-minute timer and
//           validates that the selectors an adapter depends on are still present. It has worked
//           this whole time — its results go to memory and a WebSocket, and vanish on restart.
//   ADJUST  The app's self-heal pipeline reads `research_adapter_health_checks`, diagnoses the
//           break, proposes a new config, and offers it for review. It has never seen a row:
//           the table is empty because nothing writes to it.
//
// So a county could change its site, the monitor would notice within half an hour, log a line —
// and the repair machinery would never learn of it. This module is the write.
//
// ── WHY THE STATUS MAPPING IS NOT ONE-TO-ONE ────────────────────────────────────────────────────
//
// The monitor answers "can I reach this and are the selectors there". The registry's vocabulary is
// about the ADAPTER's fitness. A site that is unreachable once is not a broken adapter — county
// portals go down for maintenance on weeknights — so a single failure is recorded as a failed check
// while the adapter's own status is only moved on repeated failure. The rollup that decides what to
// show a customer (`lib/research/dashboard-rollup.ts`) already reasons over the run of checks; its
// input is what this produces.

import type { SelectorCheckResult, SiteHealthResult } from './site-health-monitor.js';
import { getSupabase } from '../services/pipeline.js';
import { invalidateAdapterCache, type SiteType } from './adapter-registry.js';
import { toSemanticLayer, type CanaryEvaluation } from './canary.js';

/** The registry's health vocabulary (seed 371). */
export type HealthStatus = 'healthy' | 'degraded' | 'broken' | 'no_record' | 'error';

export interface HealthCheckRow {
  adapter_id: string;
  ran_at: string;
  triggered_by: string;
  status: HealthStatus;
  layer_results: Record<string, unknown>;
  diff_summary: string | null;
  http_status: number | null;
  error_message: string | null;
  duration_ms: number;
}

/** Translate one monitor result into the registry's terms.
 *
 *  Pure, so the judgement — which is the part that matters — is testable without a browser or a
 *  database. */
export function toHealthCheck(
  adapterId: string,
  result: SiteHealthResult,
  triggeredBy = 'scheduled',
  /** The canary outcome, when one ran (plan R9 semantic layer). Structural alone cannot catch a
   *  site that keeps every selector and returns the wrong property. */
  canary?: CanaryEvaluation,
): HealthCheckRow {
  const missingRequired = result.selectors.filter((s) => s.required && !s.found);
  const missingOptional = result.selectors.filter((s) => !s.required && !s.found);
  const unreachable = result.status === 'down';

  // `broken` is reserved for "we got the page and the thing we depend on is gone" — the signal the
  // repair agent can actually act on, because it has a page to diagnose. An unreachable site gets
  // `error`: there is nothing to diagnose and a proposal built from a timeout would be a guess.
  let status: HealthStatus =
    unreachable ? 'error'
    : missingRequired.length > 0 ? 'broken'
    : missingOptional.length > 0 ? 'degraded'
    : 'healthy';

  // The semantic layer can only make the verdict WORSE, never better. A page whose selectors are
  // all present but which returns the wrong property is broken however healthy it looks, and a
  // passing canary does not excuse a missing required element — the canary exercises one property,
  // and the element may matter for every other one.
  if (canary) {
    if (canary.verdict === 'no_record' && status !== 'error') status = 'no_record';
    else if (canary.verdict === 'fail' && status !== 'error') status = 'broken';
    else if (canary.verdict === 'drift' && status === 'healthy') status = 'degraded';
  }

  return {
    adapter_id: adapterId,
    ran_at: result.checkedAt,
    triggered_by: triggeredBy,
    status,
    layer_results: {
      // The §9.1 structural layer. Named the way the app's rollup and the repair agent expect, so
      // this is an input to those rather than a second shape they would have to learn.
      structural: {
        severity: status === 'healthy' ? 'none' : status === 'degraded' ? 'minor' : 'major',
        selectors_checked: result.selectors.length,
        selectors_found: result.selectors.filter((s) => s.found).length,
        missing_required: missingRequired.map((s) => s.selector),
        missing_optional: missingOptional.map((s) => s.selector),
      },
      probe: { vendor: result.vendor, url: result.url, site_id: result.siteId },
      alerts: result.alerts ?? [],
      ...(canary ? { semantic: toSemanticLayer(canary) } : {}),
    },
    // The canary's sentence wins when it is the thing that failed: "all 4 selectors present" is
    // true and useless next to "the canary property no longer returns its known values".
    diff_summary: canary && canary.verdict !== 'pass'
      ? canary.summary
      : summarise(status, missingRequired, missingOptional, result),
    http_status: null,
    error_message: unreachable ? (result.alerts?.[0]?.message ?? 'site unreachable') : null,
    duration_ms: Math.round(result.latencyMs),
  };
}

/** One line a person can act on. It names the selector, because "structure changed" sends somebody
 *  to read a diff and "the results table selector is gone" sends them to the page. */
function summarise(
  status: HealthStatus,
  missingRequired: SelectorCheckResult[],
  missingOptional: SelectorCheckResult[],
  result: SiteHealthResult,
): string {
  if (status === 'error') return `${result.name} did not respond (${Math.round(result.latencyMs)}ms).`;
  if (status === 'broken') {
    const names = missingRequired.map((s) => s.label || s.selector).join(', ');
    return `${result.name}: required element(s) gone — ${names}. The site's structure changed.`;
  }
  if (status === 'degraded') {
    const names = missingOptional.map((s) => s.label || s.selector).join(', ');
    return `${result.name}: optional element(s) gone — ${names}. Still usable, worth a look.`;
  }
  return `${result.name}: all ${result.selectors.length} selector(s) present.`;
}

/** How many consecutive failures before the ADAPTER (not just the check) is marked degraded/broken.
 *
 *  Two. County portals go down for maintenance on weeknights, and flipping a customer-facing
 *  coverage claim on one timeout would make the dashboard cry wolf. Two consecutive misses at a
 *  30-minute cadence is an hour of being wrong — acceptable — and is a real signal rather than
 *  noise. */
export const FAILURES_BEFORE_STATUS_CHANGE = 2;

export interface PersistResult {
  written: number;
  statusChanges: Array<{ adapterId: string; from: string; to: string }>;
  unmatched: string[];
  errors: string[];
}

/** Write a batch of monitor results against the registry.
 *
 *  Results whose site cannot be matched to a registered adapter are REPORTED, not dropped: the
 *  monitor probes things the registry does not know about yet, and that gap is exactly what R8b
 *  closes. Silently discarding them would hide it. */
export async function persistHealthResults(
  results: SiteHealthResult[],
  // Only the id and vendor are needed to find the registry row; typed that narrowly so the same
  // resolver serves the run-derived path below.
  resolveAdapterId: (site: { siteId: string; vendor: string }) => Promise<{ id: string; status: string } | null>,
  triggeredBy = 'scheduled',
): Promise<PersistResult> {
  return persistHealthRows(
    results.map((result) => ({
      siteId: result.siteId,
      vendor: result.vendor,
      build: (adapterId: string) => toHealthCheck(adapterId, result, triggeredBy),
    })),
    resolveAdapterId,
  );
}

// ── RUN-DERIVED HEALTH (plan B*5b) ──────────────────────────────────────────────────────────────
//
// > "The system should be able to determine if the sources are reliable or are healthy or if our
// >  system needs to be adjusted to be even better."
//
// Until 2026-09-03 the only writer of `research_adapter_health_checks` was the six-hourly Chromium
// probe, scoped to Bell, checking that selectors were present. No research run ever wrote a
// health signal — the strongest evidence there is (a real search, against a real parcel, with a
// known outcome) was held in memory and pruned in ten minutes. Found by the 2026-09-03 audit
// (health-selfheal H1, api-routes C2).
//
// The judgement B*5b asked for is in the mapping:
//   found        → healthy    the site answered and the parcel had records
//   empty        → no_record  the site answered 200 and had nothing for THIS parcel — which is
//                             sometimes a broken selector and sometimes a tract with no recorded
//                             deeds. It is recorded, it is visible on the coverage page, and it
//                             does NOT count toward flipping the adapter to broken; only a run of
//                             `error`s does. A county with no deeds must not be quarantined.
//   unreachable  → error      the host did not answer; the dead-host circuit already tripped
//   error        → error      the site answered but the adapter could not use the answer
//
// Two consecutive `error`s from real runs mark the adapter broken (same ratchet as the probe);
// one `healthy` from a real run clears it.

// ── 'aborted' is a fact about OUR run, not about the site ─────────────────────────────────────────
//
// A source scrape that WE stopped — the run hit its ceiling, or the operator cancelled — is not the
// site failing. Recording it as 'error' let our own budget mark an adapter `broken`: on 2026-09-04
// the Bell clerk was demonstrably working (it found documents) while its adapter read `broken`,
// because runs that were stopped mid-scrape counted against it. 'aborted' maps to `no_record`, the
// same never-quarantines bucket as an empty answer, so a run we cut short never darkens a live site.
export type RunSourceOutcomeKind = 'found' | 'empty' | 'unreachable' | 'error' | 'aborted';

export interface RunSourceOutcome {
  /** The probe-shaped id the registry resolver understands: `cad-<fips>-<vendor>`, `clerk-<fips>-<vendor>`. */
  siteId: string;
  vendor: string;
  name: string;
  url: string;
  outcome: RunSourceOutcomeKind;
  /** One sentence: what the run asked and what came back. */
  detail: string;
  durationMs: number;
  /** The project the outcome came from, so a coverage reader can open the run. */
  projectId: string;
  httpStatus?: number | null;
}

export function toRunHealthCheck(adapterId: string, o: RunSourceOutcome, ranAt = new Date().toISOString()): HealthCheckRow {
  const status: HealthStatus =
    o.outcome === 'found' ? 'healthy'
    : o.outcome === 'empty' || o.outcome === 'aborted' ? 'no_record'
    : 'error';
  return {
    adapter_id: adapterId,
    ran_at: ranAt,
    triggered_by: 'run',
    status,
    layer_results: {
      run: { outcome: o.outcome, project_id: o.projectId, detail: o.detail },
      probe: { vendor: o.vendor, url: o.url, site_id: o.siteId },
      alerts: [],
    },
    diff_summary: `${o.name} (research run): ${o.detail}`,
    http_status: o.httpStatus ?? null,
    error_message: status === 'error' ? o.detail : null,
    duration_ms: Math.round(o.durationMs),
  };
}

export async function persistRunOutcomes(
  outcomes: RunSourceOutcome[],
  resolveAdapterId: (site: { siteId: string; vendor: string }) => Promise<{ id: string; status: string } | null>,
): Promise<PersistResult> {
  return persistHealthRows(
    outcomes.map((o) => ({ siteId: o.siteId, vendor: o.vendor, build: (adapterId: string) => toRunHealthCheck(adapterId, o) })),
    resolveAdapterId,
  );
}

/** The one write path: insert the check, then move the ADAPTER's status only on a run of failures. */
async function persistHealthRows(
  items: Array<{ siteId: string; vendor: string; build: (adapterId: string) => HealthCheckRow }>,
  resolveAdapterId: (site: { siteId: string; vendor: string }) => Promise<{ id: string; status: string } | null>,
): Promise<PersistResult> {
  const out: PersistResult = { written: 0, statusChanges: [], unmatched: [], errors: [] };
  if (items.length === 0) return out;
  const supabase = await getSupabase();
  if (!supabase) {
    out.errors.push('no Supabase client — health results not persisted');
    return out;
  }
  const db = supabase as unknown as {
    from: (t: string) => {
      insert: (r: unknown) => Promise<{ error: { message: string } | null }>;
      update: (r: unknown) => { eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }> };
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          order: (c: string, o: unknown) => { limit: (n: number) => Promise<{ data: Array<{ status: string }> | null }> };
        };
      };
    };
  };

  for (const item of items) {
    const adapter = await resolveAdapterId(item);
    if (!adapter) { out.unmatched.push(item.siteId); continue; }

    const row = item.build(adapter.id);
    const { error } = await db.from('research_adapter_health_checks').insert(row);
    if (error) { out.errors.push(`${item.siteId}: ${error.message}`); continue; }
    out.written++;

    // Move the adapter's own status only on a RUN of failures — see the constant above.
    const { data: recent } = await db.from('research_adapter_health_checks')
      .select('status')
      .eq('adapter_id', adapter.id)
      .order('ran_at', { ascending: false })
      .limit(FAILURES_BEFORE_STATUS_CHANGE);

    const lastN = (recent ?? []).map((r) => r.status);
    const allBad = lastN.length >= FAILURES_BEFORE_STATUS_CHANGE && lastN.every((s) => s === 'broken' || s === 'error');
    const nowHealthy = row.status === 'healthy';

    let next: string | null = null;
    if (allBad && adapter.status === 'active') next = 'broken';
    // Recovery is immediate: one good check is enough to stop telling a customer a county is
    // unavailable. Being wrong in that direction costs a needless "we can't search there".
    else if (nowHealthy && (adapter.status === 'broken' || adapter.status === 'degraded')) next = 'active';

    if (next) {
      const { error: updErr } = await db.from('research_site_adapters')
        .update({ status: next, last_verified_at: nowHealthy ? row.ran_at : undefined })
        .eq('id', adapter.id);
      if (updErr) out.errors.push(`${item.siteId} status update: ${updErr.message}`);
      else {
        out.statusChanges.push({ adapterId: adapter.id, from: adapter.status, to: next });
        // A repaired or newly-broken adapter must not be served from a stale cache for a minute.
        invalidateAdapterCache();
      }
    } else if (nowHealthy) {
      await db.from('research_site_adapters')
        .update({ last_verified_at: row.ran_at })
        .eq('id', adapter.id);
    }
  }

  return out;
}

export interface ParsedSiteId {
  /** Five-digit FIPS when the id carried one. The exact key, and the one to prefer. */
  fips: string | null;
  /** County name when the id carried one instead of a FIPS. */
  county: string | null;
  siteType: SiteType;
  /** TexasFile and friends belong to no county row. Not a parse failure — a different shape. */
  statewide: boolean;
}

/** Map a monitor site id to something the registry can look up.
 *
 *  ── THIS PARSED AN ID FORMAT NOTHING PRODUCES ─────────────────────────────────────────────────
 *
 *  The doc comment here used to say the ids "look like `kofile-bell` or `bell-bis`". They do not,
 *  and they never did. `buildCheckList` — the only thing that makes them — emits exactly three
 *  shapes, and this function resolved all three wrongly:
 *
 *    `cad-48027-bis`       → county "48027", then looked up with `.ilike('name', '48027')`
 *    `clerk-kofile-bell`   → county "Clerk"   ("clerk" was not in the vendor-word list)
 *    `clerk-texasfile`     → county "Clerk"
 *
 *  Every probe therefore missed its adapter and was counted as unmatched, so the health table the
 *  self-heal pipeline reads stayed empty — the exact gap this module was written to close, left
 *  open by the one function standing between the two halves.
 *
 *  The formats in the old comment DO parse correctly, which is why the test covering them passed
 *  while production resolved nothing. They are still accepted here: they cost one branch, and the
 *  WebSocket dashboard's ids are not this function's to change.
 *
 *  A FIPS is returned as a FIPS rather than being turned into a name. `research_counties` has a
 *  unique `fips` column; matching on it is exact, and matching on a name is a case-insensitive
 *  string comparison against free text. */
export function parseSiteId(siteId: string, vendor: string): ParsedSiteId | null {
  const parts = siteId.split('-').filter(Boolean);
  if (parts.length === 0) return null;
  const vendorLower = vendor.toLowerCase();
  const siteType: SiteType = isClerkVendor(vendorLower) ? 'clerk_deeds' : 'appraisal_cad';

  // A five-digit FIPS anywhere in the id wins outright — it is unambiguous where a name is not.
  const fipsPart = parts.find((p) => /^\d{5}$/.test(p));
  if (fipsPart) return { fips: fipsPart, county: null, siteType, statewide: false };

  const countyPart = parts.find((p) => p.toLowerCase() !== vendorLower && !isVendorWord(p));
  if (!countyPart) {
    // No county token left. For a statewide source that is the correct answer rather than a
    // failure: TexasFile covers all 254 counties and has no row in `research_counties` to match.
    // Saying so lets the caller record the check against the vendor instead of discarding it.
    if (isStatewideVendor(vendorLower)) return { fips: null, county: null, siteType, statewide: true };
    return null;
  }
  return {
    fips: null,
    county: countyPart.charAt(0).toUpperCase() + countyPart.slice(1),
    siteType,
    statewide: false,
  };
}

// `clerk` and `county` are structural words in the monitor's ids, not counties. Their absence from
// this list is what made every clerk probe resolve to a county named "Clerk".
const VENDOR_WORDS = new Set(['kofile', 'henschen', 'idocket', 'fidlar', 'texasfile', 'bis', 'cad', 'tad', 'hcad', 'tyler', 'publicsearch', 'trueautomation', 'esearch', 'clerk', 'county', 'gis', 'portal']);

/** Sources that serve the whole state and so belong to no county row. */
function isStatewideVendor(vendor: string): boolean {
  return ['texasfile', 'titlepoint', 'datatree'].some((v) => vendor.includes(v));
}
function isVendorWord(part: string): boolean { return VENDOR_WORDS.has(part.toLowerCase()); }
function isClerkVendor(vendor: string): boolean {
  return ['kofile', 'henschen', 'idocket', 'fidlar', 'texasfile', 'publicsearch', 'clerk'].some((v) => vendor.includes(v));
}
