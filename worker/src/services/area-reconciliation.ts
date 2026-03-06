// worker/src/services/area-reconciliation.ts — Phase 4 Step 8
// Verifies that individual lot areas sum to the total subdivision area,
// accounting for road dedications and common areas.
//
// Spec §4.7 — Area Reconciliation Engine

import type { AreaReconciliationResult } from '../types/subdivision.js';

const SQ_FT_PER_ACRE = 43560;

export function reconcileAreas(
  statedTotalAcreage: number,
  lots: { name: string; sqft?: number; acreage?: number; lotType: string }[],
  roadDedications?: { name: string; estimatedSqFt: number }[],
): AreaReconciliationResult {
  const statedTotalSqFt = statedTotalAcreage * SQ_FT_PER_ACRE;
  const breakdown: AreaReconciliationResult['breakdown'] = [];
  const notes: string[] = [];

  let lotSum = 0;
  let reserveSum = 0;
  let commonSum = 0;
  let roadSum = 0;

  for (const lot of lots) {
    const sqft = lot.sqft || (lot.acreage ? lot.acreage * SQ_FT_PER_ACRE : 0);
    const acreage = lot.acreage || (lot.sqft ? lot.sqft / SQ_FT_PER_ACRE : 0);

    let type: 'lot' | 'reserve' | 'common_area' | 'road_dedication' | 'other';
    if (/reserve/i.test(lot.name) || lot.lotType === 'reserve') {
      type = 'reserve';
      reserveSum += sqft;
    } else if (/common/i.test(lot.name) || lot.lotType === 'common_area') {
      type = 'common_area';
      commonSum += sqft;
    } else {
      type = 'lot';
      lotSum += sqft;
    }

    breakdown.push({
      name: lot.name,
      type,
      sqft,
      acreage,
      source: lot.sqft ? 'plat' : 'cad',
    });
  }

  if (roadDedications) {
    for (const rd of roadDedications) {
      roadSum += rd.estimatedSqFt;
      breakdown.push({
        name: rd.name,
        type: 'road_dedication',
        sqft: rd.estimatedSqFt,
        acreage: rd.estimatedSqFt / SQ_FT_PER_ACRE,
        source: 'computed',
      });
    }
  }

  const computedTotal = lotSum + reserveSum + commonSum + roadSum;
  const unaccounted = statedTotalSqFt - computedTotal;
  const unaccountedPct =
    statedTotalSqFt > 0
      ? (Math.abs(unaccounted) / statedTotalSqFt) * 100
      : 0;

  let status: AreaReconciliationResult['status'];
  if (unaccountedPct < 0.1) status = 'excellent';
  else if (unaccountedPct < 1.0) status = 'acceptable';
  else if (unaccountedPct < 5.0) status = 'marginal';
  else status = 'discrepancy';

  if (unaccountedPct > 1.0 && roadSum === 0) {
    notes.push(
      `Unaccounted area (${unaccounted.toFixed(0)} sq ft / ${unaccountedPct.toFixed(1)}%) ` +
      `may represent road dedications not yet computed`,
    );
  }
  if (unaccountedPct > 5.0) {
    notes.push(
      `SIGNIFICANT area discrepancy: ${unaccountedPct.toFixed(1)}% unaccounted. ` +
      `Possible missing lots, reserves, or computation errors`,
    );
  }

  return {
    statedTotalAcreage,
    statedTotalSqFt,
    computedLotSumSqFt: computedTotal,
    computedLotSumAcreage: computedTotal / SQ_FT_PER_ACRE,
    roadDedicationSqFt: roadSum,
    commonAreaSqFt: commonSum,
    reserveSqFt: reserveSum,
    unaccountedSqFt: unaccounted,
    unaccountedPct,
    status,
    breakdown,
    notes,
  };
}
