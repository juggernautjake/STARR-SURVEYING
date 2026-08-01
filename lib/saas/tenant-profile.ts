// lib/saas/tenant-profile.ts — the firm a request is acting for, as data (audit §3c.3, item 8h).
//
// §3c.3: *"'Make it work for Starr' and 'make it sellable' pull in opposite directions exactly once:
// when a hard-coded Starr assumption is cheaper than a configurable one."*
//
// `scripts/audit-starr-assumptions.mjs` measures how often that has happened: **101 files, 293
// references** on surfaces a customer firm would expect to say *their* name. This is where those
// values come from instead.
//
// ── IT IS NOT A NEW STORE ───────────────────────────────────────────────────────────────────────
//
// The `organizations` table already has `name`, `state`, `phone`, `logo_url`, `brand_color`,
// `domain_restriction`, `primary_admin_email` and `billing_contact_email`. Measured before touching
// anything: `phone`, `domain_restriction`, `logo_url` and `brand_color` were all NULL in production
// while the same facts sat spelled out in TypeScript in a hundred files — the packaging defect §3c.1
// found, in a different costume: declared and not applied.
//
// So this module adds no table. It reads the row that already exists, and `seeds/519_tenant_profile.sql`
// fills in the values that were only ever in the source.
//
// The type, the blank and the derivations live in `tenant-profile-shape.ts` because the client-side
// hook needs them and this module imports the service-role client. Re-exported here so server callers
// have one import.

import { supabaseUnscoped } from '@/lib/supabase';
import { EMPTY_PROFILE, profileFromRow, type OrgRow, type TenantProfile } from './tenant-profile-shape';

export {
  EMPTY_PROFILE,
  isInternalEmail,
  profileFromRow,
  toE164,
  type TenantProfile,
} from './tenant-profile-shape';

// Cached per org for the process lifetime with a short TTL. This is read on outbound email, PDF
// generation and every sign-in; re-querying an almost-never-changing row on each is a cost with no
// benefit. A minute of staleness on a firm's phone number is not a defect.
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; profile: TenantProfile }>();

/** Clears the cache. For tests, and for the settings screen to call after a save so the change is
 *  visible immediately rather than within the minute. */
export function clearTenantProfileCache(): void {
  cache.clear();
}

/** The profile for an org, or `EMPTY_PROFILE` when there is no org or the row cannot be read.
 *
 *  Uses the UNSCOPED client on purpose: this is often called while establishing what the request's
 *  tenant *is*, and scoping the lookup to the tenant it is trying to resolve is circular. It reads
 *  exactly one row, addressed by primary key, so there is nothing to leak. */
export async function getTenantProfile(orgId: string | null | undefined): Promise<TenantProfile> {
  if (!orgId) return EMPTY_PROFILE;

  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.profile;

  const { data, error } = await supabaseUnscoped
    .from('organizations')
    .select('id, name, state, phone, logo_url, brand_color, domain_restriction, primary_admin_email, billing_contact_email, address_line1, address_line2, website')
    .eq('id', orgId)
    .maybeSingle();

  if (error) {
    // Named, not swallowed. §1.1b is the whole reason: three routes reported "nothing found" for
    // years because they dropped `error`, and a profile that silently comes back blank would put a
    // nameless invoice in front of a customer with no trace of why.
    console.error('[tenant-profile] could not read organizations row', orgId, error.message);
    return EMPTY_PROFILE;
  }

  const profile = profileFromRow(data as OrgRow | null);
  cache.set(orgId, { at: Date.now(), profile });
  return profile;
}

// ── Counties the firm works in ────────────────────────────────────────────────────────────────────
//
// The audit counts 106 references to a single county hard-coded in the research pipeline, and §3c.3
// names the sharpest: lot verification "returns a 400 for any other county". The county CATALOGUE is
// shared reference data (all 254 Texas counties); what is per-tenant is which of them a firm covers
// and which it defaults to. `seeds/519_tenant_profile.sql` creates `org_counties` for exactly that.

export interface CountyCoverage {
  /** Lowercase key matching the research pipeline's own, e.g. 'bell'. */
  slug: string;
  isDefault: boolean;
}

const countyCache = new Map<string, { at: number; counties: CountyCoverage[] }>();

export function clearCountyCoverageCache(): void {
  countyCache.clear();
}

/** Which counties this firm works in. **Empty is a real answer** and means the firm has not said —
 *  callers must report that rather than falling back to somebody else's county, which is the exact
 *  shape of the bug this replaces. */
export async function getCountyCoverage(orgId: string | null | undefined): Promise<CountyCoverage[]> {
  if (!orgId) return [];
  const hit = countyCache.get(orgId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.counties;

  const { data, error } = await supabaseUnscoped
    .from('org_counties')
    .select('county_slug, is_default')
    .eq('org_id', orgId)
    .order('county_slug');

  if (error) {
    console.error('[tenant-profile] could not read org_counties', orgId, error.message);
    return [];
  }
  const rows = (data ?? []) as Array<{ county_slug: string; is_default: boolean }>;
  const counties = rows.map((r) => ({ slug: r.county_slug, isDefault: r.is_default }));
  countyCache.set(orgId, { at: Date.now(), counties });
  return counties;
}

/** The county to assume when the caller did not name one, or null when the firm has not chosen.
 *
 *  Null rather than a fallback: assuming a county the firm does not work in produces research about
 *  the wrong piece of land, which is worse than an error message and much harder to notice. */
export async function getDefaultCounty(orgId: string | null | undefined): Promise<string | null> {
  const counties = await getCountyCoverage(orgId);
  return counties.find((c) => c.isDefault)?.slug ?? null;
}

/** Does this firm work in this county? Used where the pipeline used to compare against one name. */
export async function coversCounty(orgId: string | null | undefined, county: string): Promise<boolean> {
  const slug = county.trim().toLowerCase().replace(/\s+county$/, '');
  return (await getCountyCoverage(orgId)).some((c) => c.slug === slug);
}
