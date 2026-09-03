// worker/src/research/county-key.ts — one way to turn a county name into a config key.
//
// ── SIX COUNTIES WERE UNREACHABLE BECAUSE OF A SPACE ────────────────────────────────────────────
//
// Every config table in this worker is keyed in snake_case — `fort_bend`, `tom_green`, `van_zandt`,
// `san_saba`, `palo_pinto`, `san_jacinto` — and every lookup was written as:
//
//     BIS_CONFIGS[county.toLowerCase()]          (bis-cad.ts:2375, pipeline.ts:344, :566)
//     KOFILE_CONFIGS[county.toLowerCase()]       (bell-clerk.ts:957, :1039, :2038)
//
// `"Fort Bend".toLowerCase()` is `"fort bend"`, with a space. The key is `fort_bend`. It has never
// once matched. Six counties with fully configured appraisal districts and clerk portals returned
// "no config for this county" — a finding about our table, reported as a finding about the county.
//
// Found by an eight-lens platform audit on 2026-09-03 and confirmed here with a control: `Bell`, a
// single-word county, matches — which proves the lookup works and the multi-word misses are real.
//
// ── AND ONE THE AUDIT DID NOT MENTION ───────────────────────────────────────────────────────────
//
// `"Bell County"` misses too. So does `"bell county"`. The raw lookup never strips the word
// "County", and `CountyNote` in the create form suggests canonical names that operators reasonably
// type with it. A single-word county entered the way people write it fails exactly like a
// multi-word one.
//
// ── WHY A HELPER AND NOT resolveCounty EVERYWHERE ───────────────────────────────────────────────
//
// `lib/county-fips.ts` already does this normalisation correctly, and `cad-registry.ts` already
// uses it — the run-path tables simply never did. But `resolveCounty` returns a full `CountyRecord`
// and returns null for anything not in the 254-county list, so swapping it in at a raw index lookup
// changes two behaviours at once. This does the one thing the call sites need, using the same rule,
// so a name that resolves for the registry also resolves for the run.

/**
 * The lookup key for a county name.
 *
 * Same normalisation as `resolveCounty`: lowercase, drop a trailing " County", collapse spaces and
 * hyphens to a single underscore. A key that is already normalised passes through unchanged, so
 * this is safe to apply to values that came from a config table rather than from a person.
 */
export function countyKey(county: string | null | undefined): string {
  return (county ?? '')
    .toLowerCase()
    .replace(/\s+county\s*$/i, '')
    .trim()
    .replace(/[\s-]+/g, '_');
}

/**
 * Look a county up in a snake_case-keyed config table.
 *
 * Exists so the fix is one call rather than six copies of the same expression — six copies being
 * how the raw `.toLowerCase()` came to be repeated at six sites in the first place.
 */
export function lookupByCounty<T>(table: Record<string, T>, county: string | null | undefined): T | undefined {
  const key = countyKey(county);
  return key ? table[key] : undefined;
}
