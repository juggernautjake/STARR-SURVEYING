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
import { EdocTecClerkAdapter } from '../adapters/edoctec-clerk-adapter.js';
import { TylerEagleAdapter } from '../adapters/tyler-eagle-adapter.js';
import { TYLER_EAGLE_PORTALS } from '../adapters/tyler-eagle-discovery.js';
import { USLandRecordsAdapter } from '../adapters/uslandrecords-adapter.js';
import { USLR_COUNTIES } from '../adapters/uslandrecords-discovery.js';
import { AumentumClerkAdapter, AUMENTUM_COUNTIES } from '../adapters/aumentum-clerk-adapter.js';
import { IDocMarketAdapter } from '../adapters/idocmarket-adapter.js';
import type { ClerkAdapter } from '../adapters/clerk-adapter.js';

// ── Kofile FIPS set ───────────────────────────────────────────────────────────
//
// The old header cited a vendor marketing page from 2024 and said the unlisted counties "follow the
// default subdomain pattern automatically". They do not — that assumption is what put 32 counties
// with no portal into this list. See the doc comment below.

/** Counties with a VERIFIED Kofile portal — every subdomain below returned 200 on 2026-08-02.
 *
 *  This list used to hold 53 counties, taken from a vendor marketing page in 2024. Probing every
 *  one showed **32 of them have no reachable portal at all**. Research for those counties routed
 *  to a dead domain, and the failure surfaced as "no records found" — a statement about the
 *  property rather than about our routing, which is the worst shape a failure can take here.
 *
 *  Removing them is not a loss of coverage: TexasFile is the universal fallback and serves all
 *  254 Texas counties, so an unverified county now reaches a working adapter instead of a dead
 *  one.
 *
 *  Exported so the paid-platform registry shares it rather than keeping a copy — the two had
 *  already drifted six counties apart (plan R37).
 *
 *  A county belongs here because its portal ANSWERED, not because a vendor page listed it.
 *  Re-probe before adding one. */
export const KOFILE_FIPS_SET = new Set<string>([
  '48027',  // Bell
  '48029',  // Bexar
  '48041',  // Brazos
  '48083',  // Coleman
  '48085',  // Collin
  '48121',  // Denton
  '48185',  // Grimes
  '48251',  // Johnson
  '48259',  // Kendall
  '48289',  // Leon
  '48313',  // Madison
  '48325',  // Medina
  '48331',  // Milam
  '48339',  // Montgomery
  '48347',  // Nacogdoches
  '48355',  // Nueces
  '48375',  // Potter
  '48439',  // Tarrant
  '48453',  // Travis
  '48471',  // Walker
  // Williamson (48491) is deliberately ABSENT (plan R38/R39). Its Kofile portal answers 200 but
  // exposes ONLY Commissioners Court — no land records at all — so every deed search there returned
  // an empty page, which reads as "this property has no deeds". Its land records are on Tyler Eagle
  // and it routes there instead. A reachable portal for the WRONG index is worse than no portal.
]);


// ── Which adapters have been PROVEN to reach their sites ─────────────────────
//
// Every base URL in the Tyler, Henschen, iDocket and Fidlar registries was probed on 2026-08-02.
// **All 54 of them are unreachable.** Not some — all:
//
//   Henschen    <county>.co.texas.us          — a domain pattern that does not exist
//   iDocket     idocket.com/TX/<County>       — 404 on every county
//   Fidlar      <county>.fidlar.com           — unreachable
//   Tyler       deed.dallascounty.org …       — dead, though dallascounty.org itself answers
//
// So those four adapters route research to domains that are not there, and the failure surfaces as
// "no records found" — a statement about the property rather than about our routing.
//
// The county LISTS are kept, because knowing that Hays is a Henschen county is real knowledge worth
// preserving; what is not kept is the pretence that we can reach it. Until an adapter's URLs are
// rediscovered and proven, its counties fall through to TexasFile, which answered 200 and serves all
// 254 Texas counties.
//
// Move a vendor into this set only after probing its base URLs — the same rule the Kofile list now
// carries, and for the same reason.
const PROVEN_VENDORS = new Set<ClerkSystem>(['kofile', 'texasfile', 'edoctec', 'tyler', 'uslandrecords', 'aumentum', 'idocmarket']);

/** iDocMarket — Bosque only inside the ring, driven 2026-08-02 (plan R39).
 *
 *  Bosque ALSO has a free historical portal (Kofile QuickLink, 1847–1905) with no adapter. This set
 *  covers the modern index; bosqueGapWarning() covers the century between them. */
export const IDOCMARKET_FIPS_SET = new Set<string>(['48035']);

/** Harris Recording Solutions / Aumentum Recorder — Bastrop, driven 2026-08-02 (plan R39).
 *
 *  Derived from AUMENTUM_COUNTIES so the routing table cannot drift from the URL table. */
export const AUMENTUM_FIPS_SET = new Set<string>(Object.values(AUMENTUM_COUNTIES).map((c) => c.fips));

/** Avenu/Neumo "20/20 Perfect Vision" — Falls and Robertson, driven end to end 2026-08-02 (R39).
 *
 *  Derived from USLR_COUNTIES so the routing table cannot drift from the URL table. */
export const USLR_FIPS_SET = new Set<string>(Object.values(USLR_COUNTIES).map((c) => c.fips));

/** Tyler Eagle Self-Service portals, driven end to end on 2026-08-02 (plan R39).
 *
 *  Derived from TYLER_EAGLE_PORTALS so the routing table and the URL table cannot drift apart —
 *  the Kofile registry and the paid-platform registry each kept their own copy of a county list
 *  once, and they disagreed.
 *
 *  NOTE this is deliberately NOT the old `TYLER_FIPS_SET`. That set belongs to TylerClerkAdapter,
 *  whose base URLs were all probed dead; marking `tyler` proven must not resurrect it. */
export const TYLER_EAGLE_FIPS_SET = new Set<string>(Object.values(TYLER_EAGLE_PORTALS).map((p) => p.fips));

/** eDocTec — found 2026-08-02, and the only vendor here whose every listed county was driven end to
 *  end before it was listed (plan R39).
 *
 *  Both are inside the 80-mile ring and both were on the owner's list: Coryell is Gatesville and
 *  Copperas Cove, Lampasas is Lampasas. Both are fully open — no login, no paywall — and were
 *  current to within two days of the search.
 *
 *  Before this, both routed to TexasFile, which is a paywall we have no credentials for. */
export const EDOCTEC_FIPS_SET = new Set<string>([
  '48099', // Coryell  — 12,705 documents / 20,267 party records; searched live
  '48281', // Lampasas — searched live, same schema
]);

/** Is this vendor's adapter known to reach its sites?
 *
 *  Kept as a function rather than inlined so the reason is in one place and a future probe can flip
 *  a vendor back on by editing one line. */
export function isVendorProven(system: ClerkSystem): boolean {
  return PROVEN_VENDORS.has(system);
}

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

  // Priority 2: eDocTec — ahead of every unproven vendor because these two counties were driven.
  if (EDOCTEC_FIPS_SET.has(countyFIPS) && isVendorProven('edoctec')) {
    return new EdocTecClerkAdapter(countyFIPS, countyName);
  }

  // Priority 2b: Avenu/Neumo 20/20 — Falls and Robertson, both driven (R39).
  if (USLR_FIPS_SET.has(countyFIPS) && isVendorProven('uslandrecords')) {
    return new USLandRecordsAdapter(countyFIPS, countyName);
  }

  // Priority 2c: Harris/Aumentum — Bastrop, driven (R39).
  if (AUMENTUM_FIPS_SET.has(countyFIPS) && isVendorProven('aumentum')) {
    return new AumentumClerkAdapter(countyFIPS, countyName);
  }

  // Priority 2d: iDocMarket — Bosque, driven (R39).
  //
  // Bosque has TWO free portals and this adapter covers only the modern one (2012→). Its historical
  // index (Kofile QuickLink, 1847–1905) has no adapter, and the century between them is in neither.
  // `bosqueGapWarning()` fires on any search reaching into that hole, so the gap is stated rather
  // than silently answered with nothing.
  if (IDOCMARKET_FIPS_SET.has(countyFIPS) && isVendorProven('idocmarket')) {
    return new IDocMarketAdapter(countyFIPS, countyName);
  }

  // Priority 3: CountyFusion/Cott Systems (~40+ counties, index-only)
  if (COUNTYFUSION_FIPS_SET.has(countyFIPS) && isVendorProven('countyfusion')) {
    return new CountyFusionAdapter(countyFIPS, countyName);
  }

  // Priority 3: Tyler Eagle Self-Service — the NINE counties whose portals were driven (R39).
  //
  // This supersedes TylerClerkAdapter, whose base URLs were all probed dead in R38. Routing by the
  // old adapter's FIPS set would send these counties to hosts that do not resolve, so that set is
  // deliberately NOT consulted here: `tyler` being proven means the Eagle portals work, not that
  // the old Odyssey URLs came back.
  if (TYLER_EAGLE_FIPS_SET.has(countyFIPS) && isVendorProven('tyler')) {
    return new TylerEagleAdapter(countyFIPS, countyName);
  }

  // Priority 4: Henschen & Associates (~40 Hill Country / Central TX counties)
  if (HENSCHEN_FIPS_SET.has(countyFIPS) && isVendorProven('henschen')) {
    return new HenschenClerkAdapter(countyFIPS, countyName);
  }

  // Priority 5: iDocket (~20 counties — React SPA)
  if (IDOCKET_FIPS_SET.has(countyFIPS) && isVendorProven('idocket')) {
    return new IDocketClerkAdapter(countyFIPS, countyName);
  }

  // Priority 6: Fidlar Technologies / Laredo (~15 East TX + Panhandle counties)
  if (FIDLAR_FIPS_SET.has(countyFIPS) && isVendorProven('fidlar')) {
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
  if (EDOCTEC_FIPS_SET.has(countyFIPS) && isVendorProven('edoctec')) return 'edoctec';
  if (USLR_FIPS_SET.has(countyFIPS) && isVendorProven('uslandrecords')) return 'uslandrecords';
  if (AUMENTUM_FIPS_SET.has(countyFIPS) && isVendorProven('aumentum')) return 'aumentum';
  if (IDOCMARKET_FIPS_SET.has(countyFIPS) && isVendorProven('idocmarket')) return 'idocmarket';
  if (COUNTYFUSION_FIPS_SET.has(countyFIPS) && isVendorProven('countyfusion')) return 'countyfusion';
  if (TYLER_EAGLE_FIPS_SET.has(countyFIPS) && isVendorProven('tyler')) return 'tyler';
  if (HENSCHEN_FIPS_SET.has(countyFIPS) && isVendorProven('henschen')) return 'henschen';
  if (IDOCKET_FIPS_SET.has(countyFIPS) && isVendorProven('idocket')) return 'idocket';
  if (FIDLAR_FIPS_SET.has(countyFIPS) && isVendorProven('fidlar')) return 'fidlar';
  return 'texasfile';
}

export type ClerkSystem =
  | 'kofile' | 'edoctec' | 'uslandrecords' | 'aumentum' | 'idocmarket' | 'countyfusion' | 'tyler'
  | 'henschen' | 'idocket' | 'fidlar' | 'texasfile';

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
    edoctec:      EDOCTEC_FIPS_SET.size,
    uslandrecords: USLR_FIPS_SET.size,
    aumentum:     AUMENTUM_FIPS_SET.size,
    idocmarket:   IDOCMARKET_FIPS_SET.size,
    countyfusion: COUNTYFUSION_FIPS_SET.size,
    tyler:        TYLER_EAGLE_FIPS_SET.size,
    henschen:     HENSCHEN_FIPS_SET.size,
    idocket:      IDOCKET_FIPS_SET.size,
    fidlar:       FIDLAR_FIPS_SET.size,
    // TexasFile covers all 254; show the remainder not covered by named systems
    texasfile: Math.max(
      0,
      254 - KOFILE_FIPS_SET.size - EDOCTEC_FIPS_SET.size - USLR_FIPS_SET.size - AUMENTUM_FIPS_SET.size - IDOCMARKET_FIPS_SET.size - COUNTYFUSION_FIPS_SET.size - TYLER_EAGLE_FIPS_SET.size
        - HENSCHEN_FIPS_SET.size - IDOCKET_FIPS_SET.size - FIDLAR_FIPS_SET.size,
    ),
  };
}
