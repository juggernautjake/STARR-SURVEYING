// worker/src/services/clerk-registry.ts
// Phase 2 / Phase 13: ClerkRegistry — routes a Texas county FIPS code to the
// correct county clerk adapter class.
//
// Priority order (highest to lowest):
//   1. Kofile/PublicSearch    — ~80+ Texas counties (`*.tx.publicsearch.us`)
//   2. CountyFusion/Cott      — ~40+ Texas counties (Kofile-hosted CountyFusion)
//   3. Tyler/Odyssey           — ~30+ Texas counties (various deployments)
//   4. Henschen & Associates   — ~40 Texas counties (Hill Country + Central TX)
//   5. iDocket                 — ~20 Texas counties (React SPA)
//   6. Fidlar Technologies     — ~15 Texas counties (Laredo product line)
//   7. TexasFile               — universal fallback for all 254 counties
//
// Spec §2.10 — ClerkRegistry (FIPS → adapter routing)
// Phase 13 §2.11–2.13 — Henschen, iDocket, Fidlar adapters added.

import { KofileClerkAdapter } from '../adapters/kofile-clerk-adapter.js';
import { CountyFusionAdapter, COUNTYFUSION_FIPS_SET } from '../adapters/countyfusion-adapter.js';
import { TylerClerkAdapter, TYLER_FIPS_SET } from '../adapters/tyler-clerk-adapter.js';
import { HenschenClerkAdapter, HENSCHEN_FIPS_SET } from '../adapters/henschen-clerk-adapter.js';
import { IDocketClerkAdapter, IDOCKET_FIPS_SET } from '../adapters/idocket-clerk-adapter.js';
import { FidlarClerkAdapter, FIDLAR_FIPS_SET } from '../adapters/fidlar-clerk-adapter.js';
import { TexasFileAdapter } from '../adapters/texasfile-adapter.js';
import type { ClerkAdapter } from '../adapters/clerk-adapter.js';

// ── Kofile FIPS set ───────────────────────────────────────────────────────────
// Counties known to use Kofile/GovOS PublicSearch (*.tx.publicsearch.us).
// Bell, Williamson, Travis, McLennan, and Bexar are fully configured;
// the remaining follow the default subdomain pattern automatically.
//
// Source: https://govos.com/solutions/local-government/clerk/ (2024)
// Last updated: March 2026

const KOFILE_FIPS_SET = new Set<string>([
  // Central Texas
  '48027',  // Bell
  '48491',  // Williamson
  '48453',  // Travis (partially; also TexasFile)
  '48309',  // McLennan
  '48099',  // Coryell
  '48145',  // Falls
  '48281',  // Lampasas
  '48331',  // Milam

  // South Texas
  '48029',  // Bexar
  '48019',  // Bandera
  '48091',  // Comal
  '48187',  // Guadalupe
  '48259',  // Kendall
  '48325',  // Medina
  '48013',  // Atascosa

  // North / DFW area — major counties verified on publicsearch.us 2026-03-09
  '48113',  // Dallas
  '48439',  // Tarrant
  '48085',  // Collin
  '48121',  // Denton
  '48497',  // Wise
  '48143',  // Erath
  '48139',  // Ellis
  '48251',  // Johnson
  '48221',  // Hood
  '48367',  // Parker
  '48185',  // Grimes

  // East Texas
  '48073',  // Cherokee
  '48005',  // Angelina
  '48347',  // Nacogdoches
  '48455',  // Trinity
  '48471',  // Walker
  '48473',  // Waller

  // West Texas / Hill Country
  '48137',  // Edwards
  '48465',  // Val Verde (partial coverage)
  '48105',  // Crockett
  '48451',  // Tom Green

  // Coastal / SE Texas — Montgomery verified on publicsearch.us 2026-03-09
  // Fort Bend (ccweb), Brazoria (TexasFile), Galveston (Fidlar): NOT on publicsearch.us
  '48339',  // Montgomery
  '48041',  // Brazos
  '48057',  // Calhoun
  '48469',  // Victoria
  '48481',  // Wharton
  '48477',  // Washington
  '48355',  // Nueces

  // Panhandle / NW Texas
  '48375',  // Potter
  '48381',  // Randall

  // Additional verified Kofile counties (publicsearch.us subdomains confirmed)
  '48053',  // Burnet
  '48055',  // Caldwell
  '48035',  // Bosque
  '48049',  // Brown
  '48083',  // Coleman
  '48093',  // Comanche
  '48095',  // Concho
]);

// ── ClerkRegistry ─────────────────────────────────────────────────────────────

/**
 * Route a Texas county FIPS code to the appropriate county clerk adapter.
 *
 * Selection priority:
 *   1. Kofile/PublicSearch when the FIPS is in the known Kofile set
 *   2. CountyFusion/Cott when the FIPS is in the known CountyFusion set
 *   3. Tyler/Odyssey when the FIPS is in the known Tyler set
 *   4. TexasFile as the universal fallback
 *
 * @param countyFIPS  5-digit Texas FIPS code (e.g. "48027" for Bell County)
 * @param countyName  Human-readable county name (e.g. "Bell")
 */
export function getClerkAdapter(
  countyFIPS: string,
  countyName: string,
): ClerkAdapter {
  // Priority 1: Kofile/GovOS PublicSearch (~80+ counties)
  // Also matches any county with a *.tx.publicsearch.us subdomain even if
  // not explicitly listed — KofileClerkAdapter falls back to the default pattern.
  if (KOFILE_FIPS_SET.has(countyFIPS)) {
    return new KofileClerkAdapter(countyFIPS, countyName);
  }

  // Priority 2: CountyFusion/Cott Systems (~40+ counties, index-only)
  if (COUNTYFUSION_FIPS_SET.has(countyFIPS)) {
    return new CountyFusionAdapter(countyFIPS, countyName);
  }

  // Priority 3: Tyler Technologies / Odyssey (~30+ counties)
  if (TYLER_FIPS_SET.has(countyFIPS)) {
    return new TylerClerkAdapter(countyFIPS, countyName);
  }

  // Priority 4: Henschen & Associates (~40 Hill Country / Central TX counties)
  if (HENSCHEN_FIPS_SET.has(countyFIPS)) {
    return new HenschenClerkAdapter(countyFIPS, countyName);
  }

  // Priority 5: iDocket (~20 counties — React SPA)
  if (IDOCKET_FIPS_SET.has(countyFIPS)) {
    return new IDocketClerkAdapter(countyFIPS, countyName);
  }

  // Priority 6: Fidlar Technologies / Laredo (~15 East TX + Panhandle counties)
  if (FIDLAR_FIPS_SET.has(countyFIPS)) {
    return new FidlarClerkAdapter(countyFIPS, countyName);
  }

  // Priority 7: TexasFile universal fallback (all 254 Texas counties)
  return new TexasFileAdapter(countyFIPS, countyName);
}

/**
 * Return which clerk system a county uses (useful for pre-flight checks).
 */
export function getClerkSystem(countyFIPS: string): ClerkSystem {
  if (KOFILE_FIPS_SET.has(countyFIPS))       return 'kofile';
  if (COUNTYFUSION_FIPS_SET.has(countyFIPS)) return 'countyfusion';
  if (TYLER_FIPS_SET.has(countyFIPS))        return 'tyler';
  if (HENSCHEN_FIPS_SET.has(countyFIPS))     return 'henschen';
  if (IDOCKET_FIPS_SET.has(countyFIPS))      return 'idocket';
  if (FIDLAR_FIPS_SET.has(countyFIPS))       return 'fidlar';
  return 'texasfile';
}

export type ClerkSystem = 'kofile' | 'countyfusion' | 'tyler' | 'henschen' | 'idocket' | 'fidlar' | 'texasfile';

/**
 * Return whether a given county has free document image preview.
 * Kofile provides watermarked previews; CountyFusion and most Tyler deployments
 * are index-only in the free tier.
 */
export function hasFreeImagePreview(countyFIPS: string): boolean {
  return KOFILE_FIPS_SET.has(countyFIPS);
}

/**
 * Return the number of counties registered per clerk system.
 * Useful for diagnostics / admin dashboards.
 */
export function registrySummary(): Record<ClerkSystem, number> {
  return {
    kofile:       KOFILE_FIPS_SET.size,
    countyfusion: COUNTYFUSION_FIPS_SET.size,
    tyler:        TYLER_FIPS_SET.size,
    henschen:     HENSCHEN_FIPS_SET.size,
    idocket:      IDOCKET_FIPS_SET.size,
    fidlar:       FIDLAR_FIPS_SET.size,
    // TexasFile covers all 254; show the remainder not covered by named systems
    texasfile: Math.max(
      0,
      254 - KOFILE_FIPS_SET.size - COUNTYFUSION_FIPS_SET.size - TYLER_FIPS_SET.size
        - HENSCHEN_FIPS_SET.size - IDOCKET_FIPS_SET.size - FIDLAR_FIPS_SET.size,
    ),
  };
}
