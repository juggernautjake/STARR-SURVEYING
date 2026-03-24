/**
 * Bell County Report Builder
 *
 * Converts a BellResearchResult into the toggle sections for the UI.
 * Provides helper functions for formatting and summarizing data.
 */

import type { BellResearchResult, ToggleSection } from '../types/research-result.js';

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Build the list of toggle sections with metadata for the UI.
 */
export function buildToggleSections(result: BellResearchResult): ToggleSection[] {
  const sections = [
    {
      id: 'deeds-and-records',
      title: 'Deeds & Records Analysis',
      hasData: result.deedsAndRecords.records.length > 0,
      itemCount: result.deedsAndRecords.records.length,
      confidence: result.deedsAndRecords.confidence,
    },
    {
      id: 'plats',
      title: 'Plat Summary',
      hasData: result.plats.plats.length > 0,
      itemCount: result.plats.plats.length,
      confidence: result.plats.confidence,
    },
    {
      id: 'easements',
      title: 'Easements, FEMA & TxDOT',
      hasData: result.easementsAndEncumbrances.fema !== null
            || result.easementsAndEncumbrances.txdot !== null
            || result.easementsAndEncumbrances.easements.length > 0,
      itemCount: result.easementsAndEncumbrances.easements.length
              + (result.easementsAndEncumbrances.fema ? 1 : 0)
              + (result.easementsAndEncumbrances.txdot ? 1 : 0),
      confidence: result.easementsAndEncumbrances.confidence,
    },
    {
      id: 'property-details',
      title: 'Property Details (CAD/GIS)',
      hasData: !!result.property.propertyId,
      itemCount: Object.keys(result.propertyDetails.cadData).length
              + Object.keys(result.propertyDetails.gisData).length,
      confidence: result.propertyDetails.confidence,
    },
    {
      id: 'researched-links',
      title: 'All Researched Links',
      hasData: result.researchedLinks.length > 0,
      itemCount: result.researchedLinks.length,
      confidence: result.overallConfidence,
    },
    {
      id: 'discrepancies',
      title: 'Discrepancies & Confidence',
      hasData: result.discrepancies.length > 0,
      itemCount: result.discrepancies.length,
      confidence: result.overallConfidence,
    },
    {
      id: 'adjacent-properties',
      title: 'Adjacent Properties',
      hasData: result.adjacentProperties.length > 0,
      itemCount: result.adjacentProperties.length,
      confidence: result.overallConfidence,
    },
    {
      id: 'site-intelligence',
      title: 'AI System Improvement Notes',
      hasData: result.siteIntelligence.length > 0,
      itemCount: result.siteIntelligence.length,
      confidence: result.overallConfidence,
    },
  ];

  // Log section inclusion/exclusion for audit trail
  const included = sections.filter(s => s.hasData);
  const excluded = sections.filter(s => !s.hasData);
  console.log(`[report-builder] Toggle sections: ${included.length}/${sections.length} have data`);
  for (const s of included) {
    console.log(`[report-builder]   ✓ ${s.title}: ${s.itemCount} item(s), confidence=${s.confidence.tier}(${s.confidence.score})`);
  }
  for (const s of excluded) {
    console.log(`[report-builder]   ✗ ${s.title}: no data`);
  }

  return sections;
}

/**
 * Generate a human-readable summary of the entire research.
 */
export function generateResearchSummary(result: BellResearchResult): string {
  const lines: string[] = [];

  lines.push(`Property: ${result.property.situsAddress || result.property.propertyId}`);
  lines.push(`Owner: ${result.property.ownerName || 'Unknown'}`);

  if (result.property.acreage) {
    lines.push(`Acreage: ${result.property.acreage.toFixed(3)} ac`);
  }

  lines.push(`Research duration: ${formatDuration(result.durationMs)}`);
  lines.push(`Documents found: ${result.deedsAndRecords.records.length}`);
  lines.push(`Plats found: ${result.plats.plats.length}`);
  lines.push(`Links researched: ${result.researchedLinks.length}`);
  lines.push(`Screenshots captured: ${result.screenshots.length}`);
  lines.push(`Discrepancies detected: ${result.discrepancies.length}`);
  lines.push(`Errors: ${result.errors.length} (${result.errors.filter(e => e.recovered).length} recovered)`);
  lines.push(`Overall confidence: ${result.overallConfidence.tier} (${result.overallConfidence.score}/100)`);

  return lines.join('\n');
}

// ── Internal: Formatting ─────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
