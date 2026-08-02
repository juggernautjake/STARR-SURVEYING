// worker/src/infra/adapter-registry.ts — the worker and the self-healer look at the same list (R8).
//
// ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────────────────────────
//
// Two research systems existed and did not know about each other:
//
//   · The WORKER holds the county knowledge — clerk and CAD adapters, base URLs, which vendor a
//     county runs, which ones are actually implemented. All compiled into TypeScript.
//   · The APP holds the self-healing machinery — `research_site_adapters`, canaries, DOM
//     fingerprints, health checks, change proposals, the §8.3 probe, the §9.8 dashboard.
//
// `grep -rln research_site_adapters worker/src` returned nothing, and the registry table had **0
// rows**. So the self-healer monitored an empty set while the scrapers that actually break were
// compiled into a service that never read it. Every "self-healing adapter" claim was true of
// nothing.
//
// The owner's requirement is plain: *"sense when a website has changed or been updated, then adjust
// and self heal to be able to use the new or updated website."* Sensing needs a subject; adjusting
// needs somewhere to put the fix that is not a deploy. Both are this table.
//
// ── DIRECTION OF TRUTH, AND WHY IT IS THIS WAY ROUND ────────────────────────────────────────────
//
// On boot the worker PUBLISHES its compiled knowledge into the registry (idempotent upsert), then
// READS the registry when resolving an adapter, preferring stored config over the compiled default.
//
// That looks backwards until you consider the failure mode of the alternative. If the registry were
// the only source, a fresh database — or a wiped row — would leave the worker unable to research a
// county it has perfectly good code for. Publishing first means the compiled set is the floor, and
// anything a human or the self-healer has since corrected sits on top of it.
//
// The practical consequence is the one the owner asked for: when a county changes its site, the fix
// is a `config` update on a row — applied by a person from the review queue or proposed by the
// self-healer — and it takes effect on the next resolve. No deploy, no release, no waiting.

import type { ClerkRegistryEntry } from '../adapters/clerk-registry.js';
import { getSupabase } from '../services/pipeline.js';

/** How long a resolved config is reused before the registry is consulted again.
 *
 *  Sixty seconds. A self-healed selector must reach a running worker quickly — the whole point is
 *  that a county's change does not need a deploy — but a per-request read would put every page
 *  fetch behind a database round trip. */
export const REGISTRY_CACHE_TTL_MS = 60_000;

export type SiteType =
  | 'appraisal_cad' | 'clerk_deeds' | 'plat_records' | 'gis_parcels'
  | 'legal_description' | 'flood_fema' | 'survey_glo' | 'misc';

export type AdapterStatus = 'draft' | 'active' | 'degraded' | 'broken' | 'quarantined' | 'retired';

export interface ResolvedAdapter {
  /** Registry row id, when one exists — the handle a health check or proposal attaches to. */
  id: string | null;
  county: string;
  siteType: SiteType;
  baseUrl: string | null;
  status: AdapterStatus;
  /** Vendor family: kofile, henschen, publicsearch_clerk … */
  system: string | null;
  /** Stored overrides — selectors, endpoints, county-specific parameters. Empty for a row that has
   *  never been touched since it was published from code. */
  config: Record<string, unknown>;
  /** Where this answer came from. Recorded because "the registry said so" and "the code said so"
   *  produce identical behaviour until one of them is wrong. */
  source: 'registry' | 'compiled' | 'unknown';
}

/** The compiled facts this module publishes. Deliberately a narrow shape rather than the worker's
 *  own registry types: what the table needs to know is small, and coupling the two would make every
 *  future change to an adapter type a schema conversation. */
export interface CompiledAdapter {
  county: string;
  siteType: SiteType;
  system: string;
  baseUrl: string | null;
  /** Compiled implementation state, mapped to a registry status below. */
  implementation: 'implemented' | 'stub' | 'unavailable';
  notes?: string;
}

/** Map the worker's implementation state onto the registry's lifecycle.
 *
 *  `stub` becomes `draft`, not `active`: the coverage dashboard is customer-facing, and a county
 *  whose adapter is a placeholder must not be shown as one this firm can search. `unavailable`
 *  (a county with no online system at all) also lands on `draft` with a flag in config — it is not
 *  `retired`, which means "we stopped using this", nor `broken`, which means "it worked and does
 *  not". Those distinctions are what a person triaging the review queue reads. */
export function statusForImplementation(impl: CompiledAdapter['implementation']): AdapterStatus {
  return impl === 'implemented' ? 'active' : 'draft';
}

/** Translate the compiled clerk registry into publishable rows. */
export function clerkEntriesToCompiled(entries: readonly ClerkRegistryEntry[]): CompiledAdapter[] {
  return entries.map((e) => ({
    county: e.county,
    siteType: 'clerk_deeds' as const,
    system: e.system,
    baseUrl: e.baseUrl,
    implementation: e.status,
    notes: e.notes,
  }));
}

// ── Publishing ──────────────────────────────────────────────────────────────────────────────────

export interface SyncResult {
  published: number;
  skippedNoCounty: string[];
  errors: string[];
}

/** Publish the compiled adapters into `research_site_adapters`.
 *
 *  Idempotent, and deliberately NON-destructive: it upserts on (county_id, site_type) and writes
 *  only the compiled fields, leaving `config`, `field_map` and `status` alone on rows that already
 *  exist. A self-healed selector is stored in exactly those columns, and a worker restart must not
 *  undo a repair somebody accepted last week. */
export async function publishCompiledAdapters(compiled: CompiledAdapter[]): Promise<SyncResult> {
  const result: SyncResult = { published: 0, skippedNoCounty: [], errors: [] };
  const supabase = await getSupabase();
  if (!supabase) {
    result.errors.push('no Supabase client — adapters not published');
    return result;
  }
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
      upsert: (r: unknown, o?: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };

  const [{ data: counties, error: countyErr }, { data: vendors }] = await Promise.all([
    db.from('research_counties').select('id, name'),
    db.from('research_data_vendors').select('id, vendor_key'),
  ]);
  if (countyErr) {
    result.errors.push(`counties unreadable: ${countyErr.message}`);
    return result;
  }

  const countyId = new Map((counties ?? []).map((c) => [String(c.name).toLowerCase(), String(c.id)]));
  const vendorId = new Map((vendors ?? []).map((v) => [String(v.vendor_key), String(v.id)]));

  const rows: Array<Record<string, unknown>> = [];
  for (const a of compiled) {
    const cid = countyId.get(a.county.toLowerCase());
    if (!cid) { result.skippedNoCounty.push(a.county); continue; }
    rows.push({
      county_id: cid,
      site_type: a.siteType,
      vendor_id: vendorId.get(a.system) ?? null,
      base_url: a.baseUrl ?? '',
      access_method: 'browser_playwright',
      status: statusForImplementation(a.implementation),
      config: {
        source: 'compiled',
        system: a.system,
        implementation: a.implementation,
        ...(a.implementation === 'unavailable' ? { no_online_access: true } : {}),
        ...(a.notes ? { notes: a.notes } : {}),
      },
      created_by: 'worker:compiled-sync',
    });
  }

  if (rows.length === 0) return result;

  // `ignoreDuplicates` so an existing row — which may carry a repair — is left exactly as it is.
  const { error } = await db.from('research_site_adapters')
    .upsert(rows, { onConflict: 'county_id,site_type', ignoreDuplicates: true });
  if (error) {
    result.errors.push(`publish failed: ${error.message}`);
    return result;
  }
  result.published = rows.length;
  return result;
}

// ── Resolving ───────────────────────────────────────────────────────────────────────────────────

interface CacheEntry { at: number; value: ResolvedAdapter }
const cache = new Map<string, CacheEntry>();

function key(county: string, siteType: SiteType): string {
  return `${county.toLowerCase()}|${siteType}`;
}

/** Clear the resolve cache. Called after a repair is applied so the fix takes effect immediately
 *  rather than up to a minute later. */
export function invalidateAdapterCache(county?: string, siteType?: SiteType): void {
  if (county && siteType) cache.delete(key(county, siteType));
  else cache.clear();
}

/** What the worker should use for this county and record type, registry first.
 *
 *  Never throws and never returns null: a registry that is unreachable falls back to the compiled
 *  default, because a database problem must not stop research for a county whose code works. */
export async function resolveAdapter(
  county: string,
  siteType: SiteType,
  compiledFallback?: CompiledAdapter,
  now: () => number = () => Date.now(),
): Promise<ResolvedAdapter> {
  const k = key(county, siteType);
  const hit = cache.get(k);
  if (hit && now() - hit.at < REGISTRY_CACHE_TTL_MS) return hit.value;

  const fallback: ResolvedAdapter = {
    id: null,
    county,
    siteType,
    baseUrl: compiledFallback?.baseUrl ?? null,
    status: compiledFallback ? statusForImplementation(compiledFallback.implementation) : 'draft',
    system: compiledFallback?.system ?? null,
    config: {},
    source: compiledFallback ? 'compiled' : 'unknown',
  };

  try {
    const supabase = await getSupabase();
    if (!supabase) return cacheAnd(k, fallback, now);
    const db = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: unknown) => {
            eq: (c: string, v: unknown) => {
              maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };

    // Joined through the county name rather than an id the worker would have to carry around: the
    // worker's vocabulary is county names, and translating once here beats threading ids through
    // every adapter.
    const { data: countyRow } = await (supabase as unknown as {
      from: (t: string) => { select: (c: string) => { ilike: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { id: string } | null }> } } };
    }).from('research_counties').select('id').ilike('name', county).maybeSingle();

    if (!countyRow?.id) return cacheAnd(k, fallback, now);

    const { data, error } = await db.from('research_site_adapters')
      .select('id, base_url, status, config, vendor_id')
      .eq('county_id', countyRow.id)
      .eq('site_type', siteType)
      .maybeSingle();

    if (error || !data) return cacheAnd(k, fallback, now);

    const config = (data.config as Record<string, unknown>) ?? {};
    const resolved: ResolvedAdapter = {
      id: String(data.id),
      county,
      siteType,
      // A stored base_url wins: that is the single most common thing to change when a county moves
      // its portal, and being able to fix it without a deploy is the point of this file.
      baseUrl: (data.base_url as string) || fallback.baseUrl,
      status: (data.status as AdapterStatus) ?? fallback.status,
      system: (config.system as string) ?? fallback.system,
      config,
      source: 'registry',
    };
    return cacheAnd(k, resolved, now);
  } catch {
    return cacheAnd(k, fallback, now);
  }
}

function cacheAnd(k: string, value: ResolvedAdapter, now: () => number): ResolvedAdapter {
  cache.set(k, { at: now(), value });
  return value;
}
