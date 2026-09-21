/**
 * Williamson County's cities, with their taxing-entity codes.
 *
 * ── WHERE THIS CAME FROM ────────────────────────────────────────────────────────────────────────
 *
 * Not a list somebody typed from memory. Read on 2026-09-21 from the county's own annexation
 * dataset — `data.wcad.org/resource/iwdk-wcuk.json`, grouped by `entityname, entitycode` — so it
 * is exactly the set of cities WCAD itself bills for, spelled the way WCAD spells them.
 *
 * Austin appears because Austin crosses the county line; a Williamson address in Austin is
 * ordinary, not an error.
 *
 * The codes are the ones that show on a property's "Entities & Exemptions" panel (CRR for Round
 * Rock, CGT for Georgetown), which is what lets a run tie a parcel to a city without matching on
 * the situs string.
 */

export interface WilliamsonCity {
  name: string;
  /** Taxing entity code as the appraisal district writes it. */
  code: string;
}

export const WILLIAMSON_CITY_ENTITIES: readonly WilliamsonCity[] = [
  { name: 'AUSTIN',        code: 'CAU' },
  { name: 'BARTLETT',      code: 'CBA' },
  { name: 'CEDAR PARK',    code: 'CCP' },
  { name: 'COUPLAND',      code: 'CCO' },
  { name: 'FLORENCE',      code: 'CFL' },
  { name: 'GEORGETOWN',    code: 'CGT' },
  { name: 'GRANGER',       code: 'CGR' },
  { name: 'HUTTO',         code: 'CHU' },
  { name: 'JARRELL',       code: 'CJA' },
  { name: 'LEANDER',       code: 'CLE' },
  { name: 'LIBERTY HILL',  code: 'CLH' },
  { name: 'PFLUGERVILLE',  code: 'CPF' },
  { name: 'ROUND ROCK',    code: 'CRR' },
  { name: 'TAYLOR',        code: 'CTA' },
  { name: 'THORNDALE',     code: 'CTD' },
  { name: 'THRALL',        code: 'CTH' },
  { name: 'WEIR',          code: 'CWE' },
];

/**
 * Just the names, for address detection and for stripping a city off a street search.
 *
 * Two unincorporated places are appended that the annexation dataset cannot contain — it lists
 * CITIES, and these have no city government to annex anything. Both appear in mailing addresses
 * across the county and an address parser that has never heard of them will treat the place name
 * as part of the street.
 */
export const WILLIAMSON_COUNTY_CITIES: readonly string[] = [
  ...WILLIAMSON_CITY_ENTITIES.map((c) => c.name),
  'ANDICE',
  'WALBURG',
];

/** The entity code for a city, or null. Case-insensitive; trims. */
export function williamsonCityCode(name: string | null | undefined): string | null {
  const n = (name ?? '').trim().toUpperCase();
  if (!n) return null;
  return WILLIAMSON_CITY_ENTITIES.find((c) => c.name === n)?.code ?? null;
}

/** Is this a place inside Williamson County? */
export function isWilliamsonCity(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toUpperCase();
  return n.length > 0 && WILLIAMSON_COUNTY_CITIES.includes(n);
}
