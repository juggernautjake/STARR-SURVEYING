/**
 * County Router
 *
 * Routes property research requests to the correct county-specific module.
 * Each county has its own folder with isolated code, config, and scraping logic.
 *
 * When a property is in Bell County, it uses the Bell County code exclusively.
 * When other counties are implemented, they get their own folder and entry here.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface CountyResearchInput {
  /** County name (e.g., "Bell", "Williamson", "Travis") */
  county: string;
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

export interface CountyResearchProgress {
  phase: string;
  message: string;
  timestamp: string;
  pct?: number;
}

// ── Supported Counties ───────────────────────────────────────────────

const SUPPORTED_COUNTIES = ['bell'] as const;

export function isSupportedCounty(county: string): boolean {
  return SUPPORTED_COUNTIES.includes(county.toLowerCase() as typeof SUPPORTED_COUNTIES[number]);
}

export function getSupportedCounties(): string[] {
  return [...SUPPORTED_COUNTIES];
}

// ── Router ───────────────────────────────────────────────────────────

/**
 * Route a research request to the correct county module.
 *
 * Uses dynamic imports so only the requested county's code is loaded.
 */
export async function runCountyResearch(
  input: CountyResearchInput,
  onProgress: (p: CountyResearchProgress) => void,
): Promise<unknown> {
  const county = input.county.toLowerCase().trim();

  switch (county) {
    case 'bell': {
      const { runBellCountyResearch } = await import('./bell');
      return runBellCountyResearch(
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
    }

    // ── Future Counties ────────────────────────────────────────────
    // case 'williamson':
    //   const { runWilliamsonCountyResearch } = await import('./williamson');
    //   return runWilliamsonCountyResearch(input, onProgress);
    //
    // case 'travis':
    //   const { runTravisCountyResearch } = await import('./travis');
    //   return runTravisCountyResearch(input, onProgress);

    default:
      throw new Error(
        `County "${input.county}" is not yet supported. ` +
        `Currently supported: ${SUPPORTED_COUNTIES.join(', ')}. ` +
        `Each county requires its own scraping module due to differences in ` +
        `CAD systems, clerk platforms, and URL structures.`,
      );
  }
}
