// worker/src/adapters/clerk-registry.ts — Phase 11 Module F
// County Clerk Adapter Registry — FIPS code to clerk system routing.
// Routes Phase 2 document harvest requests to the correct clerk adapter
// for each of Texas's 254 counties.
//
// Spec §11.7.2 — County Clerk Adapter Build-Out Plan
//
// Texas clerk systems by market share:
//   Kofile/PublicSearch:  ~80 counties  (fully implemented)
//   Henschen & Assoc:     ~40 counties  (stub — pending implementation)
//   iDocket:              ~20 counties  (stub — pending implementation)
//   Fidlar Technologies:  ~15 counties  (stub — pending implementation)
//   TexasFile:            All 254       (aggregator; purchase flow only)
//   Custom (HCAD, etc):   Harris, Dallas, Tarrant, Bexar
//   Manual/Offline:       ~20 rural counties (no online access)

// ── Clerk System Types ───────────────────────────────────────────────────────

export type ClerkSystem =
  | 'kofile'       // Kofile/PublicSearch — fully implemented
  | 'henschen'     // Henschen & Associates — stub
  | 'idocket'      // iDocket — stub
  | 'fidlar'       // Fidlar Technologies — stub
  | 'texasfile'    // TexasFile aggregator (fallback purchase route)
  | 'harris_custom'  // HCAD custom system — stub
  | 'dallas_custom'  // Dallas County custom — stub
  | 'tarrant_custom' // TAD/Tarrant custom — stub
  | 'bexar_custom'   // Bexar County custom — stub
  | 'manual';      // No online access — manual retrieval required

export type ClerkAdapterStatus =
  | 'implemented'    // Adapter built and tested
  | 'stub'           // Placeholder — not yet built
  | 'unavailable';   // No online system exists

export interface ClerkRegistryEntry {
  /** FIPS county code (3-digit, zero-padded) */
  fips: string;
  /** Full county name */
  county: string;
  /** Clerk system vendor */
  system: ClerkSystem;
  /** Implementation status */
  status: ClerkAdapterStatus;
  /** Base URL for the clerk system (may be null for manual/unavailable) */
  baseUrl: string | null;
  /** Notes for operator */
  notes?: string;
}

// ── Texas County → Clerk System Mapping ─────────────────────────────────────
// Source: County-by-county survey of Texas county clerk websites (2025).
// FIPS codes follow ANSI FIPS 48-XXX (Texas = 48).
// NOTE: URLs need live verification — some county sites change frequently.

const CLERK_REGISTRY: ClerkRegistryEntry[] = [
  // ── Kofile/PublicSearch Counties ──────────────────────────────────────────
  // Bell County (home county for STARR RECON v1.0)
  {
    fips: '027',
    county: 'Bell',
    system: 'kofile',
    status: 'implemented',
    baseUrl: 'https://www.bellcountyclerk.org/PublicSearch',
    notes: 'Primary test county. Kofile PublicSearch. Fully tested.',
  },
  {
    fips: '099',
    county: 'Coryell',
    system: 'kofile',
    status: 'stub',
    baseUrl: 'https://www.coryellcounty.org/county-clerk',
    notes: 'Kofile PublicSearch — same adapter as Bell, URL needs verification.',
  },
  {
    fips: '099',
    county: 'Lampasas',
    system: 'kofile',
    status: 'stub',
    baseUrl: null,
    notes: 'URL needs verification.',
  },
  {
    fips: '121',
    county: 'Hood',
    system: 'kofile',
    status: 'stub',
    baseUrl: null,
  },
  {
    fips: '093',
    county: 'Hopkins',
    system: 'kofile',
    status: 'stub',
    baseUrl: null,
  },

  // ── Harris County (HCAD — custom system) ─────────────────────────────────
  {
    fips: '201',
    county: 'Harris',
    system: 'harris_custom',
    status: 'stub',
    baseUrl: 'https://www.harriscountyclerk.org',
    notes:
      'Harris County uses a custom legacy system. ' +
      '4.7M residents (~16% of TX population). ' +
      'Account-number based search. HIGH PRIORITY to implement.',
  },

  // ── Dallas County (custom) ────────────────────────────────────────────────
  {
    fips: '113',
    county: 'Dallas',
    system: 'dallas_custom',
    status: 'stub',
    baseUrl: 'https://www.dallascountyclerk.org',
    notes: 'Dallas County uses its own online portal. Needs custom adapter.',
  },

  // ── Tarrant County (TAD — custom) ────────────────────────────────────────
  {
    fips: '439',
    county: 'Tarrant',
    system: 'tarrant_custom',
    status: 'stub',
    baseUrl: 'https://www.tarrantcounty.com/en/clerk.html',
    notes:
      'Tarrant County uses TAD-adjacent custom system. ' +
      '2.1M residents. HIGH PRIORITY.',
  },

  // ── Bexar County (San Antonio — custom) ──────────────────────────────────
  {
    fips: '029',
    county: 'Bexar',
    system: 'bexar_custom',
    status: 'stub',
    baseUrl: 'https://www.bexar.org/2504/County-Clerk',
    notes: 'Bexar County has a custom web portal. San Antonio metro.',
  },

  // ── Travis County (Austin — TrueAutomation/TCAD area) ───────────────────
  {
    fips: '453',
    county: 'Travis',
    system: 'henschen',
    status: 'stub',
    baseUrl: 'https://deed.traviscountyclerk.org',
    notes:
      'Travis County Clerk uses a custom search portal. ' +
      'May require Henschen adapter or custom scraper.',
  },

  // ── Williamson County ─────────────────────────────────────────────────────
  {
    fips: '491',
    county: 'Williamson',
    system: 'kofile',
    status: 'stub',
    baseUrl: null,
    notes: 'Kofile system. URL needs verification.',
  },

  // ── Hays County ───────────────────────────────────────────────────────────
  {
    fips: '209',
    county: 'Hays',
    system: 'henschen',
    status: 'stub',
    baseUrl: null,
    notes: 'Henschen system. Adapter not yet built.',
  },

  // ── Collin County ─────────────────────────────────────────────────────────
  {
    fips: '085',
    county: 'Collin',
    system: 'idocket',
    status: 'stub',
    baseUrl: 'https://idocket.com/TX/Collin',
    notes: 'iDocket system. Adapter not yet built.',
  },

  // ── Fort Bend County ──────────────────────────────────────────────────────
  {
    fips: '157',
    county: 'Fort Bend',
    system: 'henschen',
    status: 'stub',
    baseUrl: null,
    notes: 'Henschen system. Adapter not yet built.',
  },

  // ── Hidalgo County ────────────────────────────────────────────────────────
  {
    fips: '215',
    county: 'Hidalgo',
    system: 'henschen',
    status: 'stub',
    baseUrl: null,
  },

  // ── El Paso County ────────────────────────────────────────────────────────
  {
    fips: '141',
    county: 'El Paso',
    system: 'henschen',
    status: 'stub',
    baseUrl: null,
  },

  // ── Rural counties with no online access ──────────────────────────────────
  {
    fips: '301',
    county: 'Loving',
    system: 'manual',
    status: 'unavailable',
    baseUrl: null,
    notes:
      'Loving County (smallest county in Texas by population). ' +
      'No online clerk system. Manual retrieval required.',
  },
  {
    fips: '033',
    county: 'Borden',
    system: 'manual',
    status: 'unavailable',
    baseUrl: null,
    notes: 'No online clerk system. Manual retrieval required.',
  },
  {
    fips: '275',
    county: 'King',
    system: 'manual',
    status: 'unavailable',
    baseUrl: null,
    notes: 'No online clerk system. Manual retrieval required.',
  },
];

// ── Registry Functions ───────────────────────────────────────────────────────

/**
 * Look up clerk system info for a Texas county by FIPS code.
 * Falls back to TexasFile aggregator for any unknown county.
 *
 * @param fips 3-digit FIPS code (zero-padded) — e.g., '027' for Bell County
 */
export function getClerkByFIPS(
  fips: string,
): ClerkRegistryEntry & { fallback?: boolean } {
  const normalizedFips = fips.replace(/^48/, '').padStart(3, '0');
  const entry = CLERK_REGISTRY.find((r) => r.fips === normalizedFips);

  if (entry) return entry;

  // Unknown county — fall back to TexasFile aggregator (covers all 254 counties)
  return {
    fips: normalizedFips,
    county: `Unknown (FIPS ${normalizedFips})`,
    system: 'texasfile',
    status: 'stub',
    baseUrl: 'https://www.texasfile.com',
    notes:
      'County not in registry — using TexasFile aggregator as fallback. ' +
      'Add county-specific entry to clerk-registry.ts.',
    fallback: true,
  };
}

/**
 * Look up clerk system info for a Texas county by name.
 * Case-insensitive. Falls back to TexasFile aggregator.
 *
 * @param countyName County name without "County" suffix — e.g., 'Bell', 'Harris'
 */
export function getClerkByCountyName(
  countyName: string,
): ClerkRegistryEntry & { fallback?: boolean } {
  const normalized = countyName
    .replace(/\s*county\s*$/i, '')
    .trim()
    .toLowerCase();

  const entry = CLERK_REGISTRY.find(
    (r) => r.county.toLowerCase() === normalized,
  );

  if (entry) return entry;

  // Not found — fall back to TexasFile
  return {
    fips: '000',
    county: countyName,
    system: 'texasfile',
    status: 'stub',
    baseUrl: 'https://www.texasfile.com',
    notes:
      'County not in registry — using TexasFile aggregator as fallback. ' +
      'Add county-specific entry to clerk-registry.ts.',
    fallback: true,
  };
}

/**
 * Get all registered counties for a given clerk system.
 */
export function getCountiesForSystem(
  system: ClerkSystem,
): ClerkRegistryEntry[] {
  return CLERK_REGISTRY.filter((r) => r.system === system);
}

/**
 * Get a summary of adapter coverage across all registered counties.
 */
export function getAdapterCoverage(): Record<
  ClerkAdapterStatus,
  { count: number; counties: string[] }
> {
  const coverage: Record<
    ClerkAdapterStatus,
    { count: number; counties: string[] }
  > = {
    implemented: { count: 0, counties: [] },
    stub: { count: 0, counties: [] },
    unavailable: { count: 0, counties: [] },
  };

  for (const entry of CLERK_REGISTRY) {
    coverage[entry.status].count++;
    coverage[entry.status].counties.push(entry.county);
  }

  return coverage;
}

/**
 * Returns true if the county requires manual document retrieval.
 */
export function requiresManualRetrieval(countyName: string): boolean {
  const entry = getClerkByCountyName(countyName);
  return entry.system === 'manual' || entry.status === 'unavailable';
}

// ── Export registry for testing ──────────────────────────────────────────────
export { CLERK_REGISTRY };
