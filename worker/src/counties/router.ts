/**
 * County Router — Unified Entry Point
 *
 * This is the single entry point for ALL property research in Texas.
 * The user provides property information (address, county, etc.),
 * and this router determines which county-specific code to execute.
 *
 * Flow:
 *   1. User submits property info (any Texas county)
 *   2. Router normalizes the county name
 *   3. If county has dedicated code (e.g., Bell) → route to that module
 *   4. Otherwise → fall back to the generic pipeline (pipeline.ts)
 *
 * Adding a new county:
 *   1. Create worker/src/counties/{county-name}/ folder
 *   2. Implement the orchestrator following Bell County's pattern
 *   3. Add a case to the switch statement below
 *   4. Add the county name to COUNTY_SPECIFIC_MODULES
 */

import type { PipelineInput, PipelineResult } from '../types/index.js';
import type { BellResearchResult } from './bell/types/research-result';

// ── Unified Input ───────────────────────────────────────────────────

export interface CountyResearchInput {
  /** County name (e.g., "Bell", "Williamson", "Travis") */
  county: string;
  /** State (defaults to "TX") */
  state?: string;
  /** Supabase project ID */
  projectId: string;
  /** Property address */
  address?: string;
  /** CAD property ID */
  propertyId?: string;
  /** Owner name */
  ownerName?: string;
  /** Instrument number */
  instrumentNumber?: string;
  /** Survey type */
  surveyType?: string;
  /** Job purpose */
  jobPurpose?: string;
  /** Special instructions */
  specialInstructions?: string;
  /** Uploaded files */
  uploadedFiles?: Array<{ name: string; mimeType: string; content: string; isUrl?: boolean; description?: string }>;
  /** Research adjacent properties */
  includeAdjacentProperties?: boolean;
  /** Max research time (minutes) */
  maxResearchTimeMinutes?: number;
}

// ── Unified Progress ────────────────────────────────────────────────

export interface CountyResearchProgress {
  phase: string;
  message: string;
  timestamp: string;
  pct?: number;
}

// ── Unified Result ──────────────────────────────────────────────────
//
// Discriminated union: the frontend checks `resultType` to know
// which shape of data it received.

export interface CountySpecificResult {
  resultType: 'county-specific';
  county: string;
  /** The full county-specific result (e.g., BellResearchResult) */
  data: BellResearchResult; // Union with other county result types as they're added
}

export interface GenericPipelineResult {
  resultType: 'generic-pipeline';
  county: string;
  /** The generic pipeline result */
  data: PipelineResult;
}

export type UnifiedResearchResult = CountySpecificResult | GenericPipelineResult;

// ── County Module Registry ──────────────────────────────────────────

/**
 * Counties with dedicated research modules.
 * These get full county-specific scraping, analysis, and reporting.
 */
const COUNTY_SPECIFIC_MODULES = ['bell'] as const;

export function hasCountySpecificModule(county: string): boolean {
  return COUNTY_SPECIFIC_MODULES.includes(
    county.toLowerCase().trim() as typeof COUNTY_SPECIFIC_MODULES[number],
  );
}

export function getCountiesWithModules(): string[] {
  return [...COUNTY_SPECIFIC_MODULES];
}

// ── Router ──────────────────────────────────────────────────────────

/**
 * Route a research request to the correct county module.
 *
 * This is the ONLY function that should be called to start property research.
 * It handles both county-specific and generic pipeline execution.
 *
 * @param input - User-provided property information (any Texas county)
 * @param onProgress - Real-time progress callback (drives the UI log)
 * @returns Unified result with discriminated `resultType` field
 */
export async function runCountyResearch(
  input: CountyResearchInput,
  onProgress: (p: CountyResearchProgress) => void,
): Promise<UnifiedResearchResult> {
  const county = input.county.toLowerCase().trim();

  switch (county) {
    // ── Bell County — Full dedicated module ────────────────────────
    case 'bell': {
      onProgress({
        phase: 'Router',
        message: `Routing to Bell County dedicated research module`,
        timestamp: new Date().toISOString(),
      });

      const { runBellCountyResearch } = await import('./bell/index.js');
      const result = await runBellCountyResearch(
        {
          projectId: input.projectId,
          address: input.address,
          propertyId: input.propertyId,
          ownerName: input.ownerName,
          instrumentNumber: input.instrumentNumber,
          surveyType: input.surveyType as import('./bell/types/research-input').SurveyType | undefined,
          jobPurpose: input.jobPurpose,
          specialInstructions: input.specialInstructions,
          uploadedFiles: input.uploadedFiles,
          includeAdjacentProperties: input.includeAdjacentProperties,
          maxResearchTimeMinutes: input.maxResearchTimeMinutes,
        },
        onProgress,
      );

      return {
        resultType: 'county-specific',
        county: 'Bell',
        data: result,
      };
    }

    // ── Future Counties ─────────────────────────────────────────────
    // case 'williamson': { ... }
    // case 'travis': { ... }

    // ── All Other Counties — Generic Pipeline ───────────────────────
    default: {
      onProgress({
        phase: 'Router',
        message: `No dedicated module for ${input.county} — using generic pipeline`,
        timestamp: new Date().toISOString(),
      });

      const { runPipeline } = await import('../services/pipeline.js');

      // Adapt CountyResearchInput → PipelineInput
      const pipelineInput: PipelineInput = {
        projectId: input.projectId,
        address: input.address ?? '',
        county: input.county,
        state: input.state ?? 'TX',
        propertyId: input.propertyId,
        ownerName: input.ownerName,
        // Convert uploaded files to the generic UserFile format
        userFiles: input.uploadedFiles?.map(f => ({
          filename: f.name,
          mimeType: f.mimeType,
          data: f.content,
          size: f.content.length,
          description: f.description,
        })),
      };

      // Bridge progress: convert PipelineLogger events to CountyResearchProgress
      // The generic pipeline uses its own internal logging, so we emit stage
      // transitions via the onProgress callback by wrapping the pipeline call.
      const result = await runPipeline(pipelineInput);

      return {
        resultType: 'generic-pipeline',
        county: input.county,
        data: result,
      };
    }
  }
}
