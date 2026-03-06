// worker/src/services/subdivision-classifier.ts — Phase 4 Step 1
// Detects and classifies subdivision type from legal descriptions and plat data.
//
// Spec §4.3 — Subdivision Detection & Classification

import type { ClerkAdapter } from '../adapters/clerk-adapter.js';
import type {
  SubdivisionClassification,
  SubdivisionClassResult,
  PlatAmendment,
} from '../types/subdivision.js';

export class SubdivisionClassifier {

  classifyFromLegalDescription(
    legalDesc: string,
    platData?: { lots?: { name: string; acreage?: number }[] },
  ): SubdivisionClassResult {
    const upper = legalDesc.toUpperCase().trim();
    const result: SubdivisionClassResult = {
      classification: 'unknown',
      confidence: 0,
      reasoning: '',
      hasReserves: false,
      hasCommonAreas: false,
      isPartOfLargerDevelopment: false,
      amendments: [],
    };

    // Ordered list of patterns — first match wins
    const subdivisionPatterns: {
      pattern: RegExp;
      type: SubdivisionClassification;
    }[] = [
      { pattern: /^(.+?)\s*,?\s*LOT\s+(\d+[A-Z]?)\s*,?\s*(?:BLOCK|BLK)\s+(\d+[A-Z]?)/, type: 'lot_in_subdivision' },
      { pattern: /^(.+?)\s*,?\s*LOT\s+(\d+[A-Z]?)(?:\s*$|\s*,)/, type: 'lot_in_subdivision' },
      { pattern: /REPLAT\s+OF\s+(.+)/i, type: 'replat' },
      { pattern: /AMENDED\s+PLAT\s+OF\s+(.+)/i, type: 'amended_plat' },
      { pattern: /VACATING\s+PLAT/i, type: 'vacating_plat' },
      { pattern: /(\d+[\.\d]*)\s*ACRE\s+ADDITION/i, type: 'original_plat' },
      { pattern: /(.+?)\s*SUBDIVISION/i, type: 'original_plat' },
      { pattern: /(.+?)\s*ESTATES/i, type: 'original_plat' },
      { pattern: /(.+?)\s*HEIGHTS/i, type: 'original_plat' },
      { pattern: /(.+?)\s*PARK\s/i, type: 'original_plat' },
      { pattern: /(.+?)\s*RANCH\s/i, type: 'original_plat' },
      { pattern: /(.+?)\s*PHASE\s+(\d+|[IVX]+)/i, type: 'development_plat' },
      { pattern: /(.+?)\s*SECTION\s+(\d+)/i, type: 'development_plat' },
    ];

    for (const { pattern, type } of subdivisionPatterns) {
      const match = upper.match(pattern);
      if (match) {
        result.classification = type;
        result.subdivisionName = match[1]?.trim();
        result.confidence = 80;
        result.reasoning = `Legal description matches "${type}" pattern: "${match[0]}"`;

        const lotMatch = upper.match(/LOT\s+(\d+[A-Z]?)/);
        if (lotMatch) {
          result.reasoning += `. Lot ${lotMatch[1]} identified.`;
        }
        break;
      }
    }

    // Detect minor plat from lot count
    if (platData?.lots) {
      result.hasReserves = platData.lots.some((l) =>
        /reserve/i.test(l.name),
      );
      result.hasCommonAreas = platData.lots.some((l) =>
        /common\s*area|open\s*space/i.test(l.name),
      );
      result.totalLots = platData.lots.length;

      // Minor plat: 1-4 lots with no prior subdivision classification
      if (
        result.classification === 'original_plat' &&
        result.totalLots <= 4 &&
        !result.hasReserves
      ) {
        result.classification = 'minor_plat';
        result.reasoning += ` Reclassified as minor_plat (${result.totalLots} lots, no reserves).`;
      }
    }

    // Detect phased development
    const phaseMatch = upper.match(/PHASE\s+(\d+|[IVX]+)/i);
    if (phaseMatch) {
      result.isPartOfLargerDevelopment = true;
      result.reasoning += ` Part of phased development (Phase ${phaseMatch[1]}).`;
    }

    // If no pattern matched, check for metes-and-bounds standalone tract
    if (result.classification === 'unknown') {
      const hasBearing = /[NS]\s*\d+[°]/.test(upper);
      const hasAbstract = /ABSTRACT|SURVEY|A-\d+/.test(upper);
      if (hasBearing || hasAbstract) {
        result.classification = 'standalone_tract';
        result.confidence = 60;
        result.reasoning = 'Legal description appears to be metes-and-bounds standalone tract';
      }
    }

    return result;
  }

  /**
   * Search the county clerk for replats, amended plats, and vacating plats
   * referencing this subdivision.
   */
  async searchForAmendments(
    subdivisionName: string,
    clerkAdapter: ClerkAdapter,
  ): Promise<PlatAmendment[]> {
    const amendments: PlatAmendment[] = [];
    const seen = new Set<string>();

    const searchTermGroups = [
      // Replats
      [
        `REPLAT ${subdivisionName}`,
        `REPLAT OF ${subdivisionName}`,
        `${subdivisionName} REPLAT`,
      ],
      // Amended plats
      [
        `AMENDED ${subdivisionName}`,
        `AMENDED PLAT ${subdivisionName}`,
        `${subdivisionName} AMENDED`,
      ],
      // Vacating plats
      [
        `VACATING ${subdivisionName}`,
        `VACATING PLAT ${subdivisionName}`,
      ],
    ];

    const docTypeGroups: Array<Array<'replat' | 'amended_plat' | 'plat' | 'vacating_plat'>> = [
      ['replat', 'amended_plat', 'plat'],
      ['amended_plat', 'plat'],
      ['vacating_plat', 'plat'],
    ];

    for (let g = 0; g < searchTermGroups.length; g++) {
      const terms = searchTermGroups[g];
      const docTypes = docTypeGroups[g];

      for (const term of terms) {
        try {
          const results = await clerkAdapter.searchByGranteeName(term, {
            documentTypes: docTypes,
          });
          for (const r of results) {
            if (!seen.has(r.instrumentNumber)) {
              seen.add(r.instrumentNumber);
              amendments.push({
                instrument: r.instrumentNumber,
                type: r.documentType,
                date: r.recordingDate,
              });
            }
          }
        } catch {
          // continue searching other terms
        }
      }
    }

    // Sort chronologically
    return amendments.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }
}
