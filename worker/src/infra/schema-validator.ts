// worker/src/infra/schema-validator.ts — Phase 13 Module E
// Zod-based schema validation for every phase boundary in the STARR RECON
// pipeline.  Each phase output JSON is validated before the next phase
// starts.  Schema violations produce clear, actionable error messages rather
// than downstream runtime crashes.
//
// Spec §13.5 — Phase-Boundary Schema Validation
//
// Usage:
//   import { validatePhaseOutput, PhaseSchemas } from './schema-validator.js';
//   validatePhaseOutput('discovery', rawJson);      // throws ZodError if invalid
//   const result = safeParse('discovery', rawJson); // returns { success, data, error }

import { z } from 'zod';

// ── Re-usable atomic schemas ─────────────────────────────────────────────────

const BearingSchema = z
  .string()
  .regex(
    /^[NS]\s*\d{1,2}°(?:\d{1,2}[''′](?:\d{1,2}["″])?)?(?:\s*\d{1,2}°(?:\d{1,2}[''′](?:\d{1,2}["″])?)?)?[\s°]\s*[EW]$/i,
    'Bearing must be in format N 45°30\'00" E',
  );

const DistanceSchema = z.number().positive('Distance must be positive');

const ConfidenceScoreSchema = z.number().min(0).max(100);
const ConfidenceGradeSchema = z.enum(['A', 'B', 'C', 'D', 'F']);

const LatLonSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const ISODateSchema = z.string().datetime({ message: 'Must be ISO 8601 datetime' });

// ── Phase 1 — Discovery ──────────────────────────────────────────────────────

export const DiscoverySchema = z.object({
  propertyId: z.string().min(1, 'propertyId is required'),
  address: z.string().min(1, 'address is required'),
  countyFips: z.string().regex(/^\d{5}$/, 'countyFips must be 5-digit FIPS'),
  countyName: z.string().min(1),
  legalDescription: z.string().optional(),
  subdivision: z.string().optional(),
  platBook: z.string().optional(),
  platPage: z.string().optional(),
  abstract: z.string().optional(),
  survey: z.string().optional(),
  acreage: z.number().nonnegative().optional(),
  owner: z.string().optional(),
  geocodedLocation: LatLonSchema.optional(),
  cadVendor: z.string().optional(),
  discoveredAt: ISODateSchema.optional(),
}).passthrough();

// ── Phase 2 — Document Harvest ───────────────────────────────────────────────

const HarvestDocSchema = z.object({
  documentId: z.string().min(1),
  type: z.enum(['plat', 'deed', 'easement', 'survey', 'other']),
  instrumentNumber: z.string().optional(),
  imageUrl: z.string().url().optional(),
  localPath: z.string().optional(),
  pageCount: z.number().int().positive().optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
}).passthrough();

export const HarvestSchema = z.object({
  projectId: z.string().min(1),
  propertyId: z.string().min(1),
  documents: z.array(HarvestDocSchema).min(0),
  harvestedAt: ISODateSchema.optional(),
}).passthrough();

// ── Phase 3 — AI Extraction / Property Intelligence ──────────────────────────

const BoundaryCallSchema = z.object({
  callIndex: z.number().int().nonnegative(),
  bearing: BearingSchema.optional(),
  distance: DistanceSchema.optional(),
  isCurve: z.boolean().optional(),
  source: z.string().optional(),
  rawText: z.string().optional(),
}).passthrough();

export const PropertyIntelligenceSchema = z.object({
  projectId: z.string().min(1),
  propertyType: z.enum(['lot', 'subdivision', 'tract', 'acreage', 'unknown']).optional(),
  boundaryCalls: z.array(BoundaryCallSchema).min(0),
  subdivisionName: z.string().optional(),
  lotNumber: z.string().optional(),
  blockNumber: z.string().optional(),
  analyzedAt: ISODateSchema.optional(),
}).passthrough();

// ── Phase 4 — Subdivision Intelligence ──────────────────────────────────────

export const SubdivisionSchema = z.object({
  projectId: z.string().min(1),
  isSubdivision: z.boolean(),
  subdivisionName: z.string().optional(),
  platRecordedDate: z.string().optional(),
  totalLots: z.number().int().nonnegative().optional(),
  lots: z.array(z.object({
    lotNumber: z.string(),
    blockNumber: z.string().optional(),
    acreage: z.number().nonnegative().optional(),
  }).passthrough()).optional(),
  areaReconciled: z.boolean().optional(),
  closureError: z.number().nonnegative().optional(),
}).passthrough();

// ── Phase 5 — Adjacent Research ──────────────────────────────────────────────

export const AdjacentResearchSchema = z.object({
  projectId: z.string().min(1),
  adjacentProperties: z.array(z.object({
    propertyId: z.string(),
    address: z.string(),
    sharedBoundaryDirection: z.string().optional(),
    researchStatus: z.enum(['complete', 'partial', 'not_found', 'failed']),
    crossValidationResult: z.object({
      matchStatus: z.enum(['confirmed', 'discrepancy', 'unverified']),
      matchScore: z.number().min(0).max(1).optional(),
    }).passthrough().optional(),
  }).passthrough()),
  adjacentCount: z.number().int().nonnegative(),
}).passthrough();

// ── Phase 6 — TxDOT ROW ──────────────────────────────────────────────────────

export const ROWSchema = z.object({
  projectId: z.string().min(1),
  adjacentRoads: z.array(z.object({
    roadName: z.string(),
    roadType: z.string(),
    rowWidthFt: z.number().nonnegative().optional(),
    rowSource: z.enum(['txdot', 'rpam', 'county', 'estimated', 'unknown']).optional(),
    geometry: z.any().optional(),
  }).passthrough()).optional(),
}).passthrough();

// ── Phase 7 — Geometric Reconciliation ───────────────────────────────────────

const ReconciledCallSchema = z.object({
  callIndex: z.number().int().nonnegative(),
  bearing: BearingSchema.optional(),
  distance: DistanceSchema.optional(),
  consensusMethod: z.enum(['weighted', 'authoritative', 'single_source', 'unresolved']).optional(),
  sourceCount: z.number().int().nonnegative().optional(),
}).passthrough();

export const ReconciliationSchema = z.object({
  projectId: z.string().min(1),
  reconciledBoundary: z.array(ReconciledCallSchema),
  closureError: z.number().nonnegative().optional(),
  closureRatio: z.number().nonnegative().optional(),
  compassRuleApplied: z.boolean().optional(),
  reconcileAt: ISODateSchema.optional(),
}).passthrough();

// ── Phase 8 — Confidence Scoring ─────────────────────────────────────────────

export const ConfidenceSchema = z.object({
  projectId: z.string().min(1),
  overallConfidence: z.object({
    score: ConfidenceScoreSchema,
    grade: ConfidenceGradeSchema,
  }).passthrough(),
  callScores: z.array(z.object({
    callIndex: z.number().int().nonnegative(),
    score: ConfidenceScoreSchema,
    grade: ConfidenceGradeSchema,
  }).passthrough()),
  discrepancies: z.array(z.object({
    callIndex: z.number().int().nonnegative(),
    severity: z.enum(['critical', 'major', 'minor']),
    description: z.string(),
  }).passthrough()),
  scoredAt: ISODateSchema.optional(),
}).passthrough();

// ── Phase 9 — Document Purchase ───────────────────────────────────────────────

export const PurchaseSchema = z.object({
  projectId: z.string().min(1),
  purchases: z.array(z.object({
    documentId: z.string(),
    source: z.string(),
    status: z.enum(['purchased', 'failed', 'skipped']),
    cost: z.number().nonnegative(),
  }).passthrough()),
  totalCharged: z.number().nonnegative(),
  reanalysisTriggered: z.boolean().optional(),
}).passthrough();

// ── Phase 10 — Reports ────────────────────────────────────────────────────────

export const ReportSchema = z.object({
  projectId: z.string().min(1),
  reportType: z.enum(['full', 'boundary_only', 'summary']).optional(),
  outputs: z.array(z.object({
    format: z.enum(['pdf', 'svg', 'dxf', 'png', 'csv', 'rw5', 'jobxml']),
    filePath: z.string().optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
  }).passthrough()),
  generatedAt: ISODateSchema.optional(),
}).passthrough();

// ── Phase 13 — Topographic / Tax Enrichment ──────────────────────────────────

export const TopoEnrichmentSchema = z.object({
  projectId: z.string().min(1),
  elevation: z.object({
    elevation_ft: z.number(),
    data_source: z.string(),
  }).passthrough().nullable(),
  contourCount: z.number().int().nonnegative(),
  waterFeatureCount: z.number().int().nonnegative(),
  slope_pct: z.number().nullable(),
  queried_at: ISODateSchema.optional(),
}).passthrough();

export const TaxEnrichmentSchema = z.object({
  projectId: z.string().min(1),
  county_fips: z.string().regex(/^\d{5}$/),
  combined_rate: z.number().nonnegative(),
  taxing_units: z.array(z.object({
    unit_name: z.string(),
    unit_type: z.string(),
    tax_rate: z.number().nonnegative(),
  }).passthrough()),
  tax_year: z.number().int(),
  queried_at: ISODateSchema.optional(),
}).passthrough();

// ── Phase registry ────────────────────────────────────────────────────────────

export const PhaseSchemas = {
  discovery:            DiscoverySchema,
  harvest:              HarvestSchema,
  property_intelligence: PropertyIntelligenceSchema,
  subdivision:          SubdivisionSchema,
  adjacent:             AdjacentResearchSchema,
  row:                  ROWSchema,
  reconciliation:       ReconciliationSchema,
  confidence:           ConfidenceSchema,
  purchase:             PurchaseSchema,
  report:               ReportSchema,
  topo:                 TopoEnrichmentSchema,
  tax:                  TaxEnrichmentSchema,
} as const;

export type PhaseName = keyof typeof PhaseSchemas;

// ── Validation API ────────────────────────────────────────────────────────────

/**
 * Validate phase output data against the registered schema.
 * Throws a ZodError (with human-readable message) if invalid.
 */
export function validatePhaseOutput(
  phase: PhaseName,
  data: unknown,
): void {
  const schema = PhaseSchemas[phase];
  schema.parse(data);
}

/**
 * Safe parse — returns { success: true, data } or { success: false, error }.
 * Never throws.
 */
export function safeParse<P extends PhaseName>(
  phase: P,
  data: unknown,
): { success: true; data: z.infer<(typeof PhaseSchemas)[P]> } | { success: false; error: z.ZodError } {
  const schema = PhaseSchemas[phase];
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as z.infer<(typeof PhaseSchemas)[P]> };
  }
  return { success: false, error: result.error };
}

/**
 * Format a ZodError into a human-readable string for logging.
 * Works with both Zod v3 (.errors) and Zod v4 (.issues).
 */
export function formatZodError(err: z.ZodError): string {
  // Zod v4 uses .issues; Zod v3 used .errors
  type ErrItem = { path: (string | number)[]; message: string };
  const items: ErrItem[] =
    ((err as unknown as { issues?: ErrItem[]; errors?: ErrItem[] }).issues
    ?? (err as unknown as { errors?: ErrItem[] }).errors)
    ?? [];
  return items
    .map(e => `  [${e.path.join('.')}] ${e.message}`)
    .join('\n');
}

/**
 * Validate and return typed data, or return null + log errors.
 * Useful for non-fatal validation in pipeline runners.
 */
export function validateOrNull<P extends PhaseName>(
  phase: P,
  data: unknown,
  onError?: (msg: string) => void,
): z.infer<(typeof PhaseSchemas)[P]> | null {
  const result = safeParse(phase, data);
  if (result.success) return result.data;
  const msg = `Phase '${phase}' schema validation failed:\n${formatZodError(result.error)}`;
  if (onError) onError(msg);
  return null;
}
