// worker/src/services/lot-enumerator.ts — Phase 4 Step 2
// Cross-references CAD records and plat extraction to build a complete lot inventory.
//
// Spec §4.4 — All-Lot Enumeration Engine

import type { CADAdapter, PropertyDetail } from '../adapters/cad-adapter.js';
import type { LotInventoryEntry } from '../types/subdivision.js';

export class LotEnumerator {

  /**
   * Build a complete lot inventory by reconciling CAD property records with
   * plat-extracted lot names.  Every lot that appears in either source is
   * included; matched entries carry both CAD and plat data.
   */
  async enumerateAllLots(
    cadAdapter: CADAdapter,
    subdivisionName: string,
    relatedPropertyIds: string[],
    platLots: { name: string; acreage?: number; sqft?: number }[],
  ): Promise<LotInventoryEntry[]> {
    const inventory: LotInventoryEntry[] = [];

    // ── Step 1: Fetch CAD details for all related property IDs ──────────
    console.log(`[LotEnum] Fetching CAD details for ${relatedPropertyIds.length} related properties...`);
    const cadDetails: PropertyDetail[] = [];

    for (const pid of relatedPropertyIds) {
      try {
        const detail = await cadAdapter.getPropertyDetail(pid);
        cadDetails.push(detail);
      } catch (e) {
        console.warn(`[LotEnum] Failed to get detail for ${pid}:`, e);
      }
    }

    // ── Step 2: Search CAD by subdivision name for any missed lots ──────
    console.log(`[LotEnum] Searching CAD for "${subdivisionName}"...`);
    try {
      const searchResults = await cadAdapter.findSubdivisionLots(subdivisionName);
      for (const sr of searchResults) {
        if (!relatedPropertyIds.includes(sr.propertyId)) {
          try {
            const detail = await cadAdapter.getPropertyDetail(sr.propertyId);
            cadDetails.push(detail);
            console.log(`[LotEnum] Found additional lot from CAD search: ${sr.propertyId} — ${sr.owner}`);
          } catch {
            // skip — property detail not available
          }
        }
      }
    } catch (e) {
      console.warn(`[LotEnum] CAD subdivision search failed:`, e);
    }

    // ── Step 3: Match CAD records to plat lots ──────────────────────────
    const unmatchedCAD = [...cadDetails];
    const unmatchedPlat = [...platLots];

    for (const cadRecord of cadDetails) {
      const bestMatch = this.findBestPlatMatch(cadRecord, unmatchedPlat);

      if (bestMatch) {
        inventory.push({
          lotName: bestMatch.platLot.name,
          cadPropertyId: cadRecord.propertyId,
          cadOwner: cadRecord.owner,
          cadAcreage: cadRecord.acreage,
          platAcreage: bestMatch.platLot.acreage,
          platSqFt: bestMatch.platLot.sqft,
          isOnPlat: true,
          isInCAD: true,
          matchConfidence: bestMatch.confidence,
          status: 'matched',
          improvements: cadRecord.improvements,
        });

        // Remove from unmatched lists
        const cadIdx = unmatchedCAD.indexOf(cadRecord);
        if (cadIdx >= 0) unmatchedCAD.splice(cadIdx, 1);
        const platIdx = unmatchedPlat.indexOf(bestMatch.platLot);
        if (platIdx >= 0) unmatchedPlat.splice(platIdx, 1);
      }
    }

    // ── Step 4: Add unmatched CAD records ───────────────────────────────
    for (const cad of unmatchedCAD) {
      const lotName = this.extractLotNameFromLegal(cad.legalDescription);
      inventory.push({
        lotName: lotName || `CAD-${cad.propertyId}`,
        cadPropertyId: cad.propertyId,
        cadOwner: cad.owner,
        cadAcreage: cad.acreage,
        isOnPlat: false,
        isInCAD: true,
        matchConfidence: 0,
        status: 'cad_only',
        improvements: cad.improvements,
      });
    }

    // ── Step 5: Add unmatched plat lots ─────────────────────────────────
    for (const platLot of unmatchedPlat) {
      inventory.push({
        lotName: platLot.name,
        platAcreage: platLot.acreage,
        platSqFt: platLot.sqft,
        isOnPlat: true,
        isInCAD: false,
        matchConfidence: 0,
        status: 'plat_only',
      });
    }

    // Sort by lot name (lots first, then reserves, then unknowns)
    return inventory.sort((a, b) => this.lotSortKey(a.lotName) - this.lotSortKey(b.lotName));
  }

  private findBestPlatMatch(
    cadRecord: PropertyDetail,
    platLots: { name: string; acreage?: number; sqft?: number }[],
  ): { platLot: typeof platLots[0]; confidence: number } | null {
    const legalUpper = cadRecord.legalDescription.toUpperCase();

    let bestMatch: typeof platLots[0] | null = null;
    let bestConfidence = 0;

    for (const platLot of platLots) {
      let confidence = 0;
      const lotNameUpper = platLot.name.toUpperCase();

      // Match by lot name in legal description
      if (legalUpper.includes(lotNameUpper)) {
        confidence += 60;
      }

      // Match by lot number pattern (e.g. "LOT 3" or "RESERVE A")
      const lotNumMatch = lotNameUpper.match(/(?:LOT|RESERVE)\s+(\d+[A-Z]?|[A-Z])/);
      if (lotNumMatch) {
        const lotRef = lotNumMatch[0];
        if (legalUpper.includes(lotRef)) {
          confidence += 30;
        }
      }

      // Match by acreage (within 5% tolerance)
      if (platLot.acreage && cadRecord.acreage) {
        const diff = Math.abs(platLot.acreage - cadRecord.acreage);
        const pct = diff / Math.max(platLot.acreage, cadRecord.acreage);
        if (pct < 0.01) confidence += 20;
        else if (pct < 0.05) confidence += 10;
        else if (pct < 0.10) confidence += 5;
      }

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = platLot;
      }
    }

    if (bestMatch && bestConfidence >= 50) {
      return { platLot: bestMatch, confidence: Math.min(100, bestConfidence) };
    }
    return null;
  }

  private extractLotNameFromLegal(legalDesc: string): string | null {
    const upper = legalDesc.toUpperCase();
    const match = upper.match(/(LOT\s+\d+[A-Z]?|RESERVE\s+[A-Z]|COMMON\s+AREA\s+[A-Z]?)/);
    return match ? match[1] : null;
  }

  private lotSortKey(name: string): number {
    const upper = name.toUpperCase();
    const lotMatch = upper.match(/LOT\s+(\d+)/);
    if (lotMatch) return parseInt(lotMatch[1]);
    const resMatch = upper.match(/RESERVE\s+([A-Z])/);
    if (resMatch) return 1000 + resMatch[1].charCodeAt(0);
    return 9999;
  }
}
