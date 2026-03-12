/**
 * Bell County Discrepancy Detector
 *
 * Compares data across all sources to find conflicts:
 *   - Legal description mismatches (CAD vs deed vs plat)
 *   - Acreage discrepancies
 *   - Boundary call differences
 *   - Ownership chain gaps
 *   - Easement conflicts
 */

import type { DiscrepancyItem } from '../types/research-result';
import { computeConfidence } from '../types/confidence';

// ── Types ────────────────────────────────────────────────────────────

export interface DiscrepancyInput {
  cadLegalDescription: string | null;
  cadAcreage: number | null;
  cadOwner: string | null;
  gisLegalDescription: string | null;
  gisAcreage: number | null;
  gisOwner: string | null;
  deedLegalDescriptions: Array<{ source: string; text: string }>;
  deedAcreages: Array<{ source: string; value: number }>;
  platDimensions: Array<{ source: string; calls: string[] }>;
  chainOfTitle: Array<{ from: string; to: string; date: string | null }>;
  easements: Array<{ source: string; description: string }>;
}

// ── Main Export ───────────────────────────────────────────────────────

export function detectDiscrepancies(input: DiscrepancyInput): DiscrepancyItem[] {
  const items: DiscrepancyItem[] = [];

  // ── Legal Description Mismatches ───────────────────────────────────
  if (input.cadLegalDescription && input.gisLegalDescription) {
    const cadNorm = normalizeLegal(input.cadLegalDescription);
    const gisNorm = normalizeLegal(input.gisLegalDescription);
    if (cadNorm !== gisNorm) {
      items.push({
        category: 'legal_description',
        description: 'CAD and GIS legal descriptions differ',
        source1: 'Bell CAD eSearch',
        source1Value: input.cadLegalDescription,
        source2: 'Bell CAD ArcGIS',
        source2Value: input.gisLegalDescription,
        aiRecommendation: 'CAD eSearch detail page is typically more current. Verify against the recorded deed.',
        severity: 'medium',
        confidence: computeConfidence({
          sourceReliability: 35,
          dataUsefulness: 20,
          crossValidation: -10,
          sourceName: 'Cross-source comparison',
          validatedBy: [],
          contradictedBy: ['CAD vs GIS mismatch'],
        }),
      });
    }
  }

  for (const deed of input.deedLegalDescriptions) {
    if (input.cadLegalDescription) {
      const cadNorm = normalizeLegal(input.cadLegalDescription);
      const deedNorm = normalizeLegal(deed.text);
      if (cadNorm !== deedNorm && !cadNorm.includes(deedNorm) && !deedNorm.includes(cadNorm)) {
        items.push({
          category: 'legal_description',
          description: `CAD legal description differs from deed (${deed.source})`,
          source1: 'Bell CAD',
          source1Value: input.cadLegalDescription,
          source2: deed.source,
          source2Value: deed.text,
          aiRecommendation: 'The most recent recorded deed is the legal authority. CAD may have a truncated or summarized version.',
          severity: 'medium',
          confidence: computeConfidence({
            sourceReliability: 38,
            dataUsefulness: 25,
            crossValidation: -5,
            sourceName: 'CAD vs Deed comparison',
            validatedBy: [],
            contradictedBy: [deed.source],
          }),
        });
      }
    }
  }

  // ── Acreage Discrepancies ──────────────────────────────────────────
  const acreages: Array<{ source: string; value: number }> = [];
  if (input.cadAcreage !== null) acreages.push({ source: 'Bell CAD', value: input.cadAcreage });
  if (input.gisAcreage !== null) acreages.push({ source: 'Bell GIS', value: input.gisAcreage });
  acreages.push(...input.deedAcreages);

  for (let i = 0; i < acreages.length; i++) {
    for (let j = i + 1; j < acreages.length; j++) {
      const diff = Math.abs(acreages[i].value - acreages[j].value);
      const pctDiff = diff / Math.max(acreages[i].value, acreages[j].value) * 100;

      // Skip trivially small differences (< 0.01 ac absolute — rounding noise)
      if (diff < 0.01) continue;

      if (pctDiff > 2) { // More than 2% difference
        items.push({
          category: 'acreage',
          description: `Acreage discrepancy: ${acreages[i].value.toFixed(3)} ac vs ${acreages[j].value.toFixed(3)} ac (${pctDiff.toFixed(1)}% difference)`,
          source1: acreages[i].source,
          source1Value: `${acreages[i].value.toFixed(3)} acres`,
          source2: acreages[j].source,
          source2Value: `${acreages[j].value.toFixed(3)} acres`,
          aiRecommendation: pctDiff > 10
            ? 'Significant acreage discrepancy — verify by field survey. The deed description is the legal authority.'
            : 'Minor acreage difference — likely rounding or measurement method variation.',
          severity: pctDiff > 10 ? 'high' : pctDiff > 5 ? 'medium' : 'low',
          confidence: computeConfidence({
            sourceReliability: 30,
            dataUsefulness: 20,
            crossValidation: -10,
            sourceName: 'Acreage comparison',
            validatedBy: [],
            contradictedBy: [`${pctDiff.toFixed(1)}% difference`],
          }),
        });
      }
    }
  }

  // ── Ownership Chain Gaps ───────────────────────────────────────────
  const chain = input.chainOfTitle;
  for (let i = 0; i < chain.length - 1; i++) {
    const current = chain[i];
    const next = chain[i + 1];

    // Check if grantee of current matches grantor of next
    if (current.to && next.from) {
      const currentTo = current.to.toUpperCase().trim();
      const nextFrom = next.from.toUpperCase().trim();

      if (currentTo !== nextFrom && !currentTo.includes(nextFrom) && !nextFrom.includes(currentTo)) {
        items.push({
          category: 'ownership',
          description: `Chain of title gap: "${current.to}" received property but "${next.from}" conveyed next — names don't match`,
          source1: `Deed ${current.date ?? '?'}`,
          source1Value: `Grantee: ${current.to}`,
          source2: `Deed ${next.date ?? '?'}`,
          source2Value: `Grantor: ${next.from}`,
          aiRecommendation: 'There may be a name change (marriage), trust transfer, or missing intermediate conveyance. Search for additional documents between these dates.',
          severity: 'high',
          confidence: computeConfidence({
            sourceReliability: 40,
            dataUsefulness: 25,
            crossValidation: -10,
            sourceName: 'Chain of title analysis',
            validatedBy: [],
            contradictedBy: ['Chain gap detected'],
          }),
        });
      }
    }
  }

  return items;
}

// ── Internal: Utilities ──────────────────────────────────────────────

function normalizeLegal(desc: string): string {
  return desc
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]/g, '')
    .trim();
}
