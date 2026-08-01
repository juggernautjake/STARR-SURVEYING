// lib/research/county-support.ts — which counties the pipeline can actually research, and which the
// firm actually works in. Two different questions (audit §3c.3, item 8h).
//
// The audit counts **106 references to a single county** hard-coded across the research pipeline, and
// names the sharpest: lot verification *"returns a 400 for any other county"*. Reading those 106 as one
// problem is the trap — they are two, and the fix for each is the opposite of the fix for the other.
//
// ── CAPABILITY vs COVERAGE ───────────────────────────────────────────────────────────────────────
//
//   CAPABILITY — "can this software read that county's records?" Bell CAD's ArcGIS endpoint serves
//     Bell County parcels and nothing else. That is a fact about a vendor's server, not about Starr.
//     Making it configurable would let a firm point it at a Travis County parcel and get back a
//     confident answer about the wrong piece of land — silent, plausible, wrong. **These guards must
//     stay**, and the ones in `bell-cad-gis/route.ts` are correct exactly as written.
//
//   COVERAGE — "does this firm work in that county?" Purely per-tenant, lives in `org_counties`
//     (seed 519), and has nothing to do with what the scrapers can reach.
//
// The 400 in `verify-lot` was written as a COVERAGE statement ("only supported for Bell County") when
// what it means is a CAPABILITY one ("no adapter exists for that county yet"). It reads to a user as
// "this product is for Bell County firms", which is exactly the impression that makes it unsellable —
// and it is not even what the code does. Same behaviour, honest sentence, one place to change when the
// second adapter lands.
//
// Kept in sync with `worker/src/counties/router.ts` COUNTY_SPECIFIC_MODULES, which is the list that
// actually decides at run time. A test asserts the two agree, because a county that this file claims
// is supported and the worker cannot handle is worse than one that is simply missing.

/** Counties with a working research adapter. Grow this when an adapter ships, never for a customer. */
export const SUPPORTED_COUNTIES = ['bell'] as const;

export type SupportedCounty = (typeof SUPPORTED_COUNTIES)[number];

/** "Bell County" / "BELL" / " bell " → "bell". The pipeline's own key format. */
export function countyKey(county: string | null | undefined): string {
  return (county ?? '').toLowerCase().replace(/\s+county$/i, '').trim();
}

/** Can the pipeline research this county at all? */
export function isCountySupported(county: string | null | undefined): boolean {
  const key = countyKey(county);
  return (SUPPORTED_COUNTIES as readonly string[]).includes(key);
}

/** The message a user should see when their county has no adapter.
 *
 *  Names the county they asked for and the ones that work, rather than implying the product is
 *  regional. `covered` is the firm's own county list when we have it — a firm that works in six
 *  counties should be told which of the six it can research today, not shown a global list that means
 *  nothing to them. */
export function unsupportedCountyMessage(county: string | null | undefined, covered?: readonly string[]): string {
  const asked = (county ?? '').trim() || 'this project';
  const usable = (covered?.length ? covered.filter(isCountySupported) : [...SUPPORTED_COUNTIES])
    .map((c) => c.replace(/\b\w/g, (m) => m.toUpperCase()));
  const list = usable.length
    ? `Automated research currently works in: ${usable.join(', ')}.`
    : 'No county in your coverage list has an automated research adapter yet.';
  return `Automated lot verification does not yet have a records adapter for ${asked}. ${list} ` +
    'Everything else on the project still works — this step is the only one that needs county-specific access.';
}
