// worker/src/types/document-harvest.ts
// Phase 2: Document Harvest types — HarvestInput, HarvestedDocumentSet, HarvestResult.
//
// These are the public API types for POST /research/harvest.
// The harvester receives Phase 1 PropertyIdentity output and returns a
// HarvestedDocumentSet containing every free document found for:
//   • The target property
//   • All lots in the same subdivision
//   • All identifiable adjacent properties
//
// Spec §2.1 — Phase 2 Deliverable Types

import type { DocumentType } from '../adapters/clerk-adapter.js';

// ── Harvest request ───────────────────────────────────────────────────────────

/**
 * Body accepted by POST /research/harvest.
 * All fields come directly from the Phase 1 PropertyIdentity output.
 */
export interface HarvestInput {
  projectId: string;
  /** CAD property ID for the target parcel (e.g. "524312") */
  propertyId: string;
  /** Registered owner name from CAD (e.g. "ASH FAMILY TRUST") */
  owner: string;
  /** County name (e.g. "Bell") */
  county: string;
  /** 5-digit FIPS code (e.g. "48027") */
  countyFIPS: string;
  /** Subdivision name when the parcel is part of a platted subdivision */
  subdivisionName?: string;
  /** All property IDs in the same subdivision (from Phase 1) */
  relatedPropertyIds?: string[];
  /** Deed / plat references already found in Phase 1 CAD detail page */
  deedReferences?: Array<{
    instrumentNumber: string;
    type: string;
  }>;
  /**
   * Adjacent property owner names from Phase 1 CAD adjacency data.
   * The harvester will search for and download documents for each named owner.
   */
  adjacentOwners?: string[];
}

// ── Individual harvested document ─────────────────────────────────────────────

/**
 * One recorded document successfully retrieved from a county clerk system.
 * Images are saved to disk at `/tmp/harvest/{projectId}/...`.
 */
export interface HarvestedDocument {
  instrumentNumber: string;
  /** Canonical document type from the ClerkAdapter taxonomy */
  type: DocumentType;
  /** Recording date (ISO-8601 or raw MM/DD/YYYY from clerk) */
  date: string;
  /** Primary grantor / seller name */
  grantor: string;
  /** Primary grantee / buyer name */
  grantee: string;
  /** Total page count */
  pages: number;
  /**
   * Absolute file paths on the worker droplet for each downloaded page image.
   * Pattern: `/tmp/harvest/{projectId}/{category}/{type}_{instrumentNo}_p{N}.png`
   */
  images: string[];
  /** True for all Kofile free-preview images; false only after purchase */
  isWatermarked: boolean;
  /** Which clerk system / adapter returned this document */
  source: string;
  /** Whether an un-watermarked copy can be purchased */
  purchaseAvailable: boolean;
  /** Estimated cost to purchase all pages at the county's per-page rate */
  estimatedPurchasePrice: number;
}

// ── Document groupings ────────────────────────────────────────────────────────

/** Documents found for the primary target property */
export interface TargetDocuments {
  deeds: HarvestedDocument[];
  plats: HarvestedDocument[];
  easements: HarvestedDocument[];
  restrictions: HarvestedDocument[];
  other: HarvestedDocument[];
}

/** Documents found at the subdivision / plat level */
export interface SubdivisionDocuments {
  /** The recorded plat for the subdivision (if found) */
  masterPlat: HarvestedDocument | null;
  restrictiveCovenants: HarvestedDocument[];
  utilityEasements: HarvestedDocument[];
  dedicationDocs: HarvestedDocument[];
}

/**
 * Documents found for one adjacent property owner.
 * The record key is the owner-name slug produced by `ownerNameToSlug()`.
 */
export interface AdjacentDocuments {
  deeds: HarvestedDocument[];
  plats: HarvestedDocument[];
}

/** Complete set of harvested documents across target, subdivision, and adjacents */
export interface HarvestedDocumentSet {
  target: TargetDocuments;
  subdivision: SubdivisionDocuments;
  /** Keyed by owner-name slug (e.g. "rk_gaines", "nordyke") */
  adjacent: Record<string, AdjacentDocuments>;
}

// ── Harvest statistics ────────────────────────────────────────────────────────

export interface DocumentIndex {
  /** Total documents located across all searches */
  totalDocumentsFound: number;
  /** Total individual page images downloaded */
  totalPagesDownloaded: number;
  /** Pages available for purchase (watermarked previews found) */
  totalPagesAvailableForPurchase: number;
  /** Estimated cost in USD to purchase all available pages */
  estimatedPurchaseCost: number;
  /** Clerk system identifiers that returned results */
  sources: string[];
  /** Number of individual searches that failed with an error */
  failedSearches: number;
  /** Total number of individual search calls made */
  searchesPerformed: number;
}

export interface HarvestTiming {
  totalMs: number;
  targetSearchMs: number;
  subdivisionSearchMs: number;
  adjacentSearchMs: number;
}

// ── Top-level harvest result ──────────────────────────────────────────────────

/**
 * Response body from POST /research/harvest.
 * Maps exactly to the JSON shape described in spec §2.1.
 */
export interface HarvestResult {
  status: 'complete' | 'partial' | 'failed';
  documents: HarvestedDocumentSet;
  documentIndex: DocumentIndex;
  timing: HarvestTiming;
  errors: string[];
}
