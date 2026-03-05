// worker/src/types/property-discovery.ts
// Phase 1: PropertyIdentity — the rich property descriptor returned by POST /research/discover.
// Superset of PropertyIdResult with subdivision data, deed references, FIPS, and assessed value.
//
// Spec §1.1 — Phase 1 Deliverable

// ── Supporting Types ──────────────────────────────────────────────────────────

/** A recorded document reference extracted from CAD or clerk records */
export interface DeedReference {
  instrumentNumber: string;
  type: 'deed' | 'plat' | 'easement' | 'lien' | 'other';
  /** Recording date (ISO 8601 date string, e.g. "2023-04-12") */
  date: string | null;
  /** Grantor party names (seller / old owner) */
  grantors?: string[];
  /** Grantee party names (buyer / new owner) */
  grantees?: string[];
  /** Which data source produced this reference */
  source: 'cad' | 'clerk' | 'deed_text';
}

/**
 * Taxonomy of Texas CAD system vendors.
 * Used to route property searches to the correct adapter.
 */
export type CadSystemName =
  | 'bis_consultants'   // BIS eSearch — ~130 Texas counties
  | 'trueautomation'    // TrueAutomation / PropAccess — ~17+ counties
  | 'hcad'              // Harris County Appraisal District (custom portal)
  | 'tad'               // Tarrant Appraisal District (custom portal)
  | 'capitol_appraisal' // Capitol Appraisal Group — ~20 rural counties
  | 'pritchard_abbott'  // Pritchard & Abbott — ~30 mid-size counties
  | 'texasfile_fallback'// TexasFile universal fallback for unknown counties
  | 'unknown';

// ── Core PropertyIdentity ─────────────────────────────────────────────────────

/**
 * Rich property descriptor produced by the PropertyDiscoveryEngine.
 * This is the Phase 1 deliverable — a single object that captures everything
 * the pipeline knows about a property after Steps 1-5.
 *
 * Maps to the JSON response shape in spec §1.1.
 */
export interface PropertyIdentity {
  // ── Core Identifiers ────────────────────────────────────────────────────────
  /** CAD account / property ID (e.g. "524312") */
  propertyId: string;
  /** CAD geographic ID / GEO ID (e.g. "02135-00524312") */
  geoId: string | null;
  /** 5-digit FIPS code for the county (e.g. "48027" = Bell County, TX) */
  countyFIPS: string;

  // ── Owner ────────────────────────────────────────────────────────────────────
  owner: string | null;
  /** Mailing address of the property owner (from CAD records) */
  ownerAddress: string | null;

  // ── Legal Description ────────────────────────────────────────────────────────
  legalDescription: string | null;
  /** Abstract / survey line (e.g. "WILLIAM HARTRICK SURVEY, A-488") */
  abstractSurvey: string | null;

  // ── Acreage & Value ──────────────────────────────────────────────────────────
  acreage: number | null;
  /** CAD assessed value in USD (may lag market value) */
  assessedValue: number | null;
  taxYear: number | null;
  propertyType: string | null;

  // ── Location ─────────────────────────────────────────────────────────────────
  county: string;
  state: string;
  situsAddress: string | null;

  // ── CAD System ───────────────────────────────────────────────────────────────
  cadSystem: CadSystemName;

  // ── Subdivision ───────────────────────────────────────────────────────────────
  /** True when the legal description indicates a subdivision lot */
  isSubdivision: boolean;
  /** Name of the subdivision (extracted from legal description) */
  subdivisionName: string | null;
  /** Total number of lots in the subdivision (discoverable via CAD search) */
  totalLots: number | null;
  /** Lot number for this parcel (e.g. "1" from "LOT 1, ASH FAMILY TRUST …") */
  lotNumber: string | null;
  /** Block designation (e.g. "A" from "LOT 3, BLOCK A, …") */
  blockNumber: string | null;

  // ── Related Parcels ───────────────────────────────────────────────────────────
  /** All property IDs in the same subdivision (from CAD search by subdivision name) */
  relatedPropertyIds: string[];
  /** Adjacent owner names from CAD or plat (populated in Phase 2+ by adjacent research) */
  adjacentOwners: string[];

  // ── Document References ───────────────────────────────────────────────────────
  /** Deed / plat / easement references found in the CAD detail page */
  deedReferences: DeedReference[];
}

// ── Discovery Engine I/O ──────────────────────────────────────────────────────

/** One data source consulted during discovery, with outcome metadata */
export interface DiscoverySource {
  name: string;
  url: string;
  method: string;
  success: boolean;
  error?: string;
}

/** Complete response from POST /research/discover */
export interface DiscoveryResult {
  status: 'complete' | 'partial' | 'failed';
  property: PropertyIdentity | null;
  sources: DiscoverySource[];
  timing: {
    totalMs: number;
    stage1_geocode:       number;
    stage2_cad_detect:    number;
    stage3_cad_search:    number;
    stage4_detail_enrich: number;
    stage5_validate:      number;
  };
  errors: string[];
}
