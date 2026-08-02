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
): HealthCheckRow {
  const missingRequired = result.selectors.filter((s) => s.required && !s.found);
  const missingOptional = result.selectors.filter((s) => !s.required && !s.found);
  const unreachable = result.status === 'down';

  // `broken` is reserved for "we got the page and the thing we depend on is gone" — the signal the
  // repair agent can actually act on, because it has a page to diagnose. An unreachable site gets
  // `error`: there is nothing to diagnose and a proposal built from a timeout would be a guess.
  const status: HealthStatus =
    unreachable ? 'error'
    : missingRequired.length > 0 ? 'broken'
    : missingOptional.length > 0 ? 'degraded'
    : 'healthy';

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
    },
    diff_summary: summarise(status, missingRequired, missingOptional, result),
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
  resolveAdapterId: (result: SiteHealthResult) => Promise<{ id: string; status: string } | null>,
  triggeredBy = 'scheduled',
): Promise<PersistResult> {
  const out: PersistResult = { written: 0, statusChanges: [], unmatched: [], errors: [] };
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

  for (const result of results) {
    const adapter = await resolveAdapterId(result);
    if (!adapter) { out.unmatched.push(result.siteId); continue; }

    const row = toHealthCheck(adapter.id, result, triggeredBy);
    const { error } = await db.from('research_adapter_health_checks').insert(row);
    if (error) { out.errors.push(`${result.siteId}: ${error.message}`); continue; }
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
      if (updErr) out.errors.push(`${result.siteId} status update: ${updErr.message}`);
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

/** Map a monitor site id to a (county, siteType) the registry understands.
 *
 *  The monitor's ids look like `kofile-bell` or `bell-bis` — vendor and county, in either order,
 *  because they grew organically. Parsed rather than renamed: renaming them would break the
 *  WebSocket dashboard that already uses them, and the mapping is one place either way. */
export function parseSiteId(siteId: string, vendor: string): { county: string; siteType: SiteType } | null {
  const parts = siteId.split('-').filter(Boolean);
  if (parts.length === 0) return null;
  const vendorLower = vendor.toLowerCase();
  const countyPart = parts.find((p) => p.toLowerCase() !== vendorLower && !isVendorWord(p));
  if (!countyPart) return null;
  return {
    county: countyPart.charAt(0).toUpperCase() + countyPart.slice(1),
    // Clerk vendors index deeds; everything else in the monitor's list is an appraisal portal.
    siteType: isClerkVendor(vendorLower) ? 'clerk_deeds' : 'appraisal_cad',
  };
}

const VENDOR_WORDS = new Set(['kofile', 'henschen', 'idocket', 'fidlar', 'texasfile', 'bis', 'cad', 'tad', 'hcad', 'tyler', 'publicsearch', 'trueautomation', 'esearch']);
function isVendorWord(part: string): boolean { return VENDOR_WORDS.has(part.toLowerCase()); }
function isClerkVendor(vendor: string): boolean {
  return ['kofile', 'henschen', 'idocket', 'fidlar', 'texasfile', 'publicsearch', 'clerk'].some((v) => vendor.includes(v));
}
