/**
 * Bell County Export Service
 *
 * Exports research results and survey plans as PDF and JSON.
 * The PDF includes all selected screenshots, plats, and the
 * step-by-step field plan.
 */

import type { BellResearchResult, SurveyPlan } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface ExportOptions {
  format: 'pdf' | 'json';
  /** Include all screenshots in PDF */
  includeAllScreenshots?: boolean;
  /** Include raw GIS data in JSON */
  includeRawData?: boolean;
}

// ── Main Exports ─────────────────────────────────────────────────────

/**
 * Export research results as JSON.
 */
export function exportResearchAsJson(
  result: BellResearchResult,
  options?: { includeRawData?: boolean },
): string {
  const data = options?.includeRawData
    ? result
    : {
        ...result,
        screenshots: result.screenshots.map(s => ({
          ...s,
          imageBase64: `[${s.imageBase64.length} chars]`, // Truncate images
        })),
        propertyDetails: {
          ...result.propertyDetails,
          gisData: options?.includeRawData ? result.propertyDetails.gisData : '[omitted]',
        },
      };

  return JSON.stringify(data, null, 2);
}

/**
 * Export survey plan as a structured document (ready for PDF rendering).
 * The actual PDF rendering would happen on the frontend using a library
 * like react-pdf or jsPDF.
 */
export function exportSurveyPlanStructure(
  plan: SurveyPlan,
  research: BellResearchResult,
): SurveyPlanDocument {
  const pages: DocumentPage[] = [];

  // Page 1: Cover / Property Summary
  pages.push({
    type: 'cover',
    title: `Survey Plan: ${research.property.situsAddress}`,
    content: plan.propertySummary,
  });

  // Page 2: Metes & Bounds
  pages.push({
    type: 'text',
    title: 'Legal Description & Metes and Bounds',
    content: plan.metesAndBounds,
  });

  // Page 3: Aerial Image
  if (plan.aerialImage) {
    pages.push({
      type: 'image',
      title: 'Aerial View',
      image: plan.aerialImage,
    });
  }

  // Page 4: Most Recent Plat
  if (plan.platImage) {
    pages.push({
      type: 'image',
      title: 'Most Recent Recorded Plat',
      image: plan.platImage,
    });
  }

  // Page 5: Easement & Encumbrance Summary
  pages.push({
    type: 'text',
    title: 'Easements & Encumbrances',
    content: plan.easementSummary,
  });

  // Page 6+: Field Steps
  pages.push({
    type: 'steps',
    title: 'Step-by-Step Field Plan',
    steps: plan.fieldSteps,
  });

  // Equipment & Time Estimate
  pages.push({
    type: 'text',
    title: 'Equipment & Time Estimate',
    content: `Recommended Equipment:\n${plan.equipment.map(e => `  - ${e}`).join('\n')}\n\nEstimated Field Time: ${plan.estimatedFieldTimeHours.toFixed(1)} hours`,
  });

  // Selected Screenshots
  for (const img of plan.includedScreenshots) {
    pages.push({
      type: 'image',
      title: 'Reference Screenshot',
      image: img,
    });
  }

  return { pages };
}

// ── Types for Document Structure ─────────────────────────────────────

export interface SurveyPlanDocument {
  pages: DocumentPage[];
}

export interface DocumentPage {
  type: 'cover' | 'text' | 'image' | 'steps';
  title: string;
  content?: string;
  image?: string;
  steps?: import('../types/research-result').FieldStep[];
}
