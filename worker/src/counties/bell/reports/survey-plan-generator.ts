/**
 * Bell County Survey Plan Generator
 *
 * Generates a comprehensive survey field plan from the research results.
 * Uses AI to create step-by-step field instructions based on the
 * specific property, its boundaries, and the survey type.
 */

import type { BellResearchResult, SurveyPlan, FieldStep, PlatLayer } from '../types/research-result.js';
import type { SurveyType } from '../types/research-input.js';

// ── Types ────────────────────────────────────────────────────────────

export interface SurveyPlanInput {
  research: BellResearchResult;
  surveyType: SurveyType;
  jobPurpose: string;
  specialInstructions?: string;
  /** Which screenshots to include in the final document */
  includedScreenshotIds?: string[];
  /** Which plat layers to enable in the drawing */
  enabledLayers?: string[];
}

export interface SurveyPlanProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Generate a complete survey plan from research results.
 */
export async function generateSurveyPlan(
  input: SurveyPlanInput,
  anthropicApiKey: string,
  onProgress: (p: SurveyPlanProgress) => void,
): Promise<SurveyPlan> {
  const progress = (msg: string) => {
    onProgress({ phase: 'Survey Plan', message: msg, timestamp: new Date().toISOString() });
  };

  const { research } = input;

  progress('Generating property summary...');
  const propertySummary = buildPropertySummary(research);

  progress('Building metes and bounds description...');
  const metesAndBounds = buildMetesAndBounds(research);

  progress('Generating step-by-step field plan...');
  const fieldSteps = await generateFieldSteps(input, anthropicApiKey);

  progress('Building plat layers...');
  const platLayers = buildPlatLayers(input);

  progress('Compiling survey plan...');

  const aerial = findAerialScreenshot(research);
  const platImage = findPlatImage(research);
  const equipment = getRecommendedEquipment(input.surveyType);
  const estimatedHours = estimateFieldTime(research, input.surveyType);
  const includedScreenshots = (input.includedScreenshotIds ?? [])
    .map(id => research.screenshots.find(s => s.capturedAt === id)?.imageBase64)
    .filter((s): s is string => !!s);

  // Log survey plan assembly for audit
  console.log(`[survey-plan] Plan generated for ${research.property.situsAddress ?? research.property.propertyId}:`);
  console.log(`[survey-plan]   summary=${propertySummary.length} chars, M&B=${metesAndBounds.length} chars`);
  console.log(`[survey-plan]   field steps=${fieldSteps.length}, equipment=${equipment.length} item(s), est=${estimatedHours.toFixed(1)}hr`);
  console.log(`[survey-plan]   aerial=${aerial ? 'yes' : 'no'}, plat=${platImage ? 'yes' : 'no'}, layers=${platLayers.length}, screenshots=${includedScreenshots.length}`);

  return {
    propertySummary,
    metesAndBounds,
    aerialImage: aerial,
    platImage,
    platLayers,
    easementSummary: research.easementsAndEncumbrances.summary,
    fieldSteps,
    equipment,
    estimatedFieldTimeHours: estimatedHours,
    includedScreenshots,
  };
}

// ── Internal: Property Summary ───────────────────────────────────────

function buildPropertySummary(research: BellResearchResult): string {
  const p = research.property;
  const lines: string[] = [];

  lines.push(`Property Address: ${p.situsAddress}`);
  lines.push(`Owner: ${p.ownerName}`);
  lines.push(`Bell CAD Property ID: ${p.propertyId}`);
  if (p.acreage) lines.push(`Acreage: ${p.acreage.toFixed(3)} acres`);
  lines.push(`Legal Description: ${p.legalDescription}`);
  if (p.mapId) lines.push(`Map ID: ${p.mapId}`);
  if (research.property.lat && research.property.lon) {
    lines.push(`Coordinates: ${research.property.lat.toFixed(6)}, ${research.property.lon.toFixed(6)}`);
  }

  if (research.easementsAndEncumbrances.fema) {
    const fema = research.easementsAndEncumbrances.fema;
    lines.push(`FEMA Flood Zone: ${fema.floodZone}${fema.inSFHA ? ' (SFHA)' : ''}`);
  }

  return lines.join('\n');
}

// ── Internal: Metes & Bounds ─────────────────────────────────────────

function buildMetesAndBounds(research: BellResearchResult): string {
  // Pull from deed analysis if available
  if (research.deedsAndRecords.records.length > 0) {
    const mostRecent = research.deedsAndRecords.records[0];
    if (mostRecent.legalDescription) {
      return mostRecent.legalDescription;
    }
  }

  // Fall back to CAD legal description
  return research.property.legalDescription || 'Metes and bounds not available from research.';
}

// ── Internal: Field Steps ────────────────────────────────────────────

async function generateFieldSteps(
  input: SurveyPlanInput,
  apiKey: string,
): Promise<FieldStep[]> {
  if (!apiKey) return getDefaultFieldSteps(input);

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const property = input.research.property;
    const plats = input.research.plats;
    const easements = input.research.easementsAndEncumbrances;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are creating a step-by-step field survey plan for a property surveyor in Bell County, Texas.

Property: ${property.situsAddress}
Owner: ${property.ownerName}
Acreage: ${property.acreage ?? 'unknown'}
Legal Description: ${property.legalDescription}
Survey Type: ${input.surveyType}
Purpose: ${input.jobPurpose}
${input.specialInstructions ? `Special Instructions: ${input.specialInstructions}` : ''}
Coordinates: ${property.lat.toFixed(6)}, ${property.lon.toFixed(6)}

${plats.summary ? `Plat Info: ${plats.summary}` : ''}
${easements.summary ? `Easements: ${easements.summary}` : ''}

Generate a JSON array of field steps. Each step should be practical and specific to THIS property:

[
  {
    "stepNumber": 1,
    "title": "Arrive and orient",
    "description": "Drive to property and locate the most accessible corner...",
    "lookFor": ["Iron rod", "Fence corner", "Survey marker"],
    "measurements": ["Set up on found monument", "Take GPS reading"],
    "calculations": ["Note magnetic declination for area (~4° E)"]
  }
]

Include steps for:
- Finding the starting point
- Each property corner/POB
- Key boundary lines
- Easement locations
- Improvements to shoot
- Traverse closure
- Final checks

Make it specific to ${input.surveyType} surveys. Be practical and actionable.`,
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined;
    if (textBlock) {
      const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
          console.warn(`[survey-plan-generator] JSON parse failed for field steps: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
        }
      }
    }
  } catch (err) {
    console.warn(`[survey-plan-generator] AI field steps generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return getDefaultFieldSteps(input);
}

function getDefaultFieldSteps(input: SurveyPlanInput): FieldStep[] {
  return [
    {
      stepNumber: 1,
      title: 'Arrive and orient',
      description: `Drive to ${input.research.property.situsAddress}. Locate the most accessible property corner.`,
      lookFor: ['Iron rods', 'Fence corners', 'Survey markers', 'Concrete monuments'],
      measurements: ['Set up total station or GPS on found monument'],
      calculations: ['Check magnetic declination for Bell County (~4° East)'],
    },
    {
      stepNumber: 2,
      title: 'Establish control',
      description: 'Set up on the first found monument. Backsight to a second known point.',
      lookFor: ['Second monument or reference point'],
      measurements: ['Take GPS reading on setup point', 'Take backsight reading'],
      calculations: ['Verify coordinates against CAD/GIS data'],
    },
    {
      stepNumber: 3,
      title: 'Traverse property boundary',
      description: 'Follow the boundary lines, shooting each corner and any found monuments.',
      lookFor: ['Corners', 'Monuments', 'Boundary evidence', 'Fences', 'Improvements near boundary'],
      measurements: ['Shoot each corner point', 'Note any encroachments'],
      calculations: ['Compare field bearings to record bearings'],
    },
    {
      stepNumber: 4,
      title: 'Shoot improvements',
      description: 'Locate all visible improvements within the property.',
      lookFor: ['Buildings', 'Driveways', 'Utilities', 'Wells', 'Septic'],
      measurements: ['Corners of all structures', 'Utility locations'],
      calculations: ['Measure setbacks from boundary lines'],
    },
    {
      stepNumber: 5,
      title: 'Close traverse and verify',
      description: 'Return to starting point. Check closure.',
      lookFor: ['Starting monument'],
      measurements: ['Close shot back to POB'],
      calculations: ['Calculate closure ratio', 'Verify against legal description'],
    },
  ];
}

// ── Internal: Plat Layers ────────────────────────────────────────────

function buildPlatLayers(input: SurveyPlanInput): PlatLayer[] {
  const allLayers: PlatLayer[] = [
    { name: 'property-boundary', description: 'Property boundary with bearings & distances', enabled: true, drawingData: '' },
    { name: 'easements', description: 'Easements (utility, drainage, ROW)', enabled: true, drawingData: '' },
    { name: 'improvements', description: 'Improvements (buildings, driveways)', enabled: true, drawingData: '' },
    { name: 'flood-zones', description: 'FEMA flood zone boundaries', enabled: false, drawingData: '' },
    { name: 'adjacent-lots', description: 'Adjacent lot lines and owners', enabled: false, drawingData: '' },
    { name: 'monuments', description: 'Found and called monuments', enabled: true, drawingData: '' },
    { name: 'row-lines', description: 'Right-of-way lines', enabled: true, drawingData: '' },
    { name: 'contours', description: 'Elevation contours (if topo survey)', enabled: input.surveyType === 'topographic', drawingData: '' },
  ];

  // Enable/disable based on user selection
  if (input.enabledLayers) {
    for (const layer of allLayers) {
      layer.enabled = input.enabledLayers.includes(layer.name);
    }
  }

  return allLayers;
}

// ── Internal: Helpers ────────────────────────────────────────────────

function findAerialScreenshot(research: BellResearchResult): string | null {
  const aerial = research.screenshots.find(s =>
    s.source.toLowerCase().includes('gis') || s.description.toLowerCase().includes('aerial'),
  );
  return aerial?.imageBase64 ?? null;
}

function findPlatImage(research: BellResearchResult): string | null {
  if (research.plats.plats.length > 0 && research.plats.plats[0].images.length > 0) {
    return research.plats.plats[0].images[0];
  }
  return null;
}

function getRecommendedEquipment(surveyType: SurveyType): string[] {
  const base = ['Total Station or GPS RTK', 'Tripod', 'Prism/Rod', 'Field Book', 'Lath and Ribbon', 'Iron Rods/Caps'];

  switch (surveyType) {
    case 'boundary':
      return [...base, 'Metal Detector', 'Machete/Brush Cutter'];
    case 'alta':
      return [...base, 'Metal Detector', 'Machete/Brush Cutter', 'Digital Level', 'Camera'];
    case 'topographic':
      return [...base, 'Digital Level', 'GPS RTK (recommended)', 'Camera'];
    case 'construction':
      return [...base, 'Stakes', 'Nails', 'Spray Paint', 'Offset Tape'];
    default:
      return base;
  }
}

function estimateFieldTime(research: BellResearchResult, surveyType: SurveyType): number {
  const acres = research.property.acreage ?? 1;
  const baseHours = Math.max(2, acres * 0.5); // ~30 min per acre base

  switch (surveyType) {
    case 'alta':
      return baseHours * 2; // ALTA takes roughly double
    case 'topographic':
      return baseHours * 1.5;
    case 'boundary':
      return baseHours;
    default:
      return baseHours;
  }
}
