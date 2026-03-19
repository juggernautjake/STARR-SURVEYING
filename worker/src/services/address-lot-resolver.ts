// worker/src/services/address-lot-resolver.ts
// Address-to-Lot Resolver — Maps a street address to a specific lot within a subdivision plat
//
// Problem: When a user enters "3779 W FM 436 Belton TX", the system needs to determine
// that this address corresponds to Lot 2 (1.861 acres) in the Ash Family Trust subdivision,
// not Lot 1 (2.922 acres) or any other lot.
//
// Solution strategy (multi-layer):
//   Layer 1: GIS situs address lookup — query all parcels in the subdivision and match
//            the one whose situs_num matches the input street number
//   Layer 2: CAD legal description — parse "BLOCK 1, LOT 2" from the legal text
//   Layer 3: Plat acreage cross-reference — match the GIS/CAD acreage to a lot on the plat
//   Layer 4: AI plat annotation — ask Vision AI to identify which lot is at the given address
//
// Each layer is independent. The resolver uses the first definitive match and falls back
// to the next layer if uncertain.

import type { PipelineLogger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Information about the target lot resolved from address matching */
export interface ResolvedLot {
  /** The lot identifier on the plat (e.g., "Lot 2") */
  lotName: string;
  /** The lot number (e.g., "2") */
  lotNumber: string | null | undefined;
  /** The block number (e.g., "1") */
  blockNumber: string | null | undefined;
  /** Acreage from CAD or GIS */
  acreage: number | null | undefined;
  /** Square footage from CAD or GIS */
  sqft: number | null | undefined;
  /** CAD property ID for this specific lot */
  propertyId: string | null | undefined;
  /** Owner name from CAD/GIS */
  ownerName: string | null | undefined;
  /** Which resolution method succeeded */
  resolvedBy: 'gis_situs' | 'cad_legal' | 'plat_acreage' | 'ai_annotation' | 'input';
  /** Confidence in the match (0-100) */
  confidence: number;
  /** All candidate lots considered (for transparency) */
  candidates: LotCandidate[];
}

export interface LotCandidate {
  lotName: string;
  propertyId: string | null;
  acreage: number | null;
  situsAddress: string | null;
  matchScore: number;
  matchReason: string;
}

/** GIS feature data used for address matching */
export interface GisFeatureForMatching {
  propertyId: string | null;
  ownerName: string | null;
  acreage: number | null;
  situsAddress: string | null;
  legalDescription: string | null;
}

/** Plat lot data used for cross-referencing */
export interface PlatLotForMatching {
  lotName: string;
  acreage: number | undefined;
  sqft: number | undefined;
}

// ── Main Resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve which lot in a subdivision corresponds to a given street address.
 *
 * @param inputAddress     The full street address (e.g., "3779 W FM 436 Belton TX 76513")
 * @param gisFeatures      All GIS features found for this subdivision area
 * @param platLots         Lots extracted from the plat image
 * @param cadLotNumber     Lot number parsed from CAD legal description (if available)
 * @param cadBlockNumber   Block number parsed from CAD legal description (if available)
 * @param cadAcreage       Acreage from CAD record
 * @param cadPropertyId    Property ID from CAD
 * @param logger           Pipeline logger
 */
export function resolveAddressToLot(
  inputAddress: string | null | undefined,
  gisFeatures: GisFeatureForMatching[],
  platLots: PlatLotForMatching[],
  cadLotNumber: string | null | undefined,
  cadBlockNumber: string | null | undefined,
  cadAcreage: number | null | undefined,
  cadPropertyId: string | null | undefined,
  logger: PipelineLogger,
): ResolvedLot | null {

  logger.info('AddressLotResolver', `Resolving address "${inputAddress ?? '(none)'}" to lot`);
  logger.info('AddressLotResolver',
    `  Sources: ${gisFeatures.length} GIS features, ${platLots.length} plat lots, ` +
    `CAD lot=${cadLotNumber ?? 'none'} block=${cadBlockNumber ?? 'none'} acreage=${cadAcreage ?? 'none'}`);

  const candidates: LotCandidate[] = [];

  // ── Layer 1: GIS situs address matching ────────────────────────────────
  // The GIS layer has per-parcel situs addresses. Find the one that matches
  // our input street number. This is the most reliable method because Bell
  // CAD assigns unique situs numbers to each lot.
  if (inputAddress && gisFeatures.length > 0) {
    const inputNum = extractStreetNumber(inputAddress);

    if (inputNum) {
      for (const feat of gisFeatures) {
        if (!feat.situsAddress) continue;

        const featNum = extractStreetNumber(feat.situsAddress);
        const score = scoreAddressMatch(inputAddress, feat.situsAddress);

        candidates.push({
          lotName: extractLotFromLegal(feat.legalDescription) ?? `PID-${feat.propertyId}`,
          propertyId: feat.propertyId,
          acreage: feat.acreage,
          situsAddress: feat.situsAddress,
          matchScore: score,
          matchReason: featNum === inputNum
            ? `Exact street number match (${inputNum})`
            : `Street match score: ${score}`,
        });
      }

      // Sort by match score
      candidates.sort((a, b) => b.matchScore - a.matchScore);

      if (candidates.length > 0 && candidates[0].matchScore >= 80) {
        const best = candidates[0];
        const lotNum = extractLotNumber(best.lotName);

        logger.info('AddressLotResolver',
          `  Layer 1 (GIS situs): MATCH — ${best.lotName} at "${best.situsAddress}" ` +
          `(score ${best.matchScore}, PID=${best.propertyId})`);

        // Cross-reference with plat
        const platMatch = findPlatLotByAcreage(platLots, best.acreage);

        return {
          lotName: platMatch?.lotName ?? best.lotName,
          lotNumber: lotNum,
          blockNumber: cadBlockNumber,
          acreage: best.acreage,
          sqft: platMatch?.sqft ?? null,
          propertyId: best.propertyId,
          ownerName: gisFeatures.find(f => f.propertyId === best.propertyId)?.ownerName ?? null,
          resolvedBy: 'gis_situs',
          confidence: best.matchScore,
          candidates,
        };
      }
    }
  }

  // ── Layer 2: CAD legal description ─────────────────────────────────────
  // If the CAD record has a lot/block parsed from the legal description,
  // use that directly.
  if (cadLotNumber) {
    const lotName = `Lot ${cadLotNumber}`;
    const platMatch = findPlatLotByName(platLots, lotName);

    logger.info('AddressLotResolver',
      `  Layer 2 (CAD legal): lot=${cadLotNumber} block=${cadBlockNumber ?? '?'} ` +
      `plat match=${platMatch?.lotName ?? 'none'}`);

    return {
      lotName: platMatch?.lotName ?? lotName,
      lotNumber: cadLotNumber,
      blockNumber: cadBlockNumber,
      acreage: cadAcreage ?? platMatch?.acreage ?? null,
      sqft: platMatch?.sqft ?? null,
      propertyId: cadPropertyId,
      ownerName: null,
      resolvedBy: 'cad_legal',
      confidence: platMatch ? 85 : 70,
      candidates,
    };
  }

  // ── Layer 3: Plat acreage cross-reference ──────────────────────────────
  // Match by acreage when we have a CAD acreage but no lot number.
  // This works because each lot in a subdivision has a unique acreage.
  if (cadAcreage && platLots.length > 0) {
    const platMatch = findPlatLotByAcreage(platLots, cadAcreage);

    if (platMatch) {
      const lotNum = extractLotNumber(platMatch.lotName);

      logger.info('AddressLotResolver',
        `  Layer 3 (acreage match): CAD ${cadAcreage} ac → ${platMatch.lotName} ` +
        `(plat ${platMatch.acreage ?? '?'} ac)`);

      return {
        lotName: platMatch.lotName,
        lotNumber: lotNum,
        blockNumber: cadBlockNumber,
        acreage: cadAcreage,
        sqft: platMatch.sqft ?? null,
        propertyId: cadPropertyId,
        ownerName: null,
        resolvedBy: 'plat_acreage',
        confidence: 75,
        candidates,
      };
    }
  }

  // ── No match found ─────────────────────────────────────────────────────
  if (candidates.length > 0) {
    logger.warn('AddressLotResolver',
      `  No definitive match. Best candidate: ${candidates[0].lotName} (score ${candidates[0].matchScore})`);
  } else {
    logger.warn('AddressLotResolver', '  No candidates found — address-to-lot resolution failed');
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the street number from an address string */
function extractStreetNumber(address: string): string | null {
  const m = address.match(/^\s*(\d+)\b/);
  return m ? m[1] : null;
}

/** Score how well two addresses match (0-100) */
function scoreAddressMatch(inputAddr: string, candidateAddr: string): number {
  const a = normalizeAddress(inputAddr);
  const b = normalizeAddress(candidateAddr);

  let score = 0;

  // Street number match (most critical)
  const numA = extractStreetNumber(a);
  const numB = extractStreetNumber(b);
  if (numA && numB && numA === numB) {
    score += 50;
  } else if (numA && numB) {
    // Close number (e.g., 3779 vs 3777)
    const diff = Math.abs(parseInt(numA) - parseInt(numB));
    if (diff <= 2) score += 20;
    else return 0; // Different street number — not a match
  }

  // Street name words
  const wordsA = extractStreetWords(a);
  const wordsB = extractStreetWords(b);
  const commonWords = wordsA.filter(w => wordsB.includes(w));
  if (wordsA.length > 0) {
    score += Math.round((commonWords.length / wordsA.length) * 30);
  }

  // FM/CR/SH road number match
  const roadNumA = extractRoadNumber(a);
  const roadNumB = extractRoadNumber(b);
  if (roadNumA && roadNumB && roadNumA === roadNumB) {
    score += 20;
  }

  return Math.min(100, score);
}

/** Normalize an address for comparison */
function normalizeAddress(addr: string): string {
  return addr
    .toUpperCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bLANE\b/g, 'LN')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bFARM TO MARKET\b/g, 'FM')
    .replace(/\bFARM MARKET\b/g, 'FM')
    .replace(/\bF M\b/g, 'FM')
    .replace(/\bRANCH ROAD\b/g, 'RR')
    .replace(/\bSTATE HIGHWAY\b/g, 'SH')
    .replace(/\bCOUNTY ROAD\b/g, 'CR')
    .trim();
}

/** Extract street name words, filtering out number, direction, city, state, zip */
function extractStreetWords(addr: string): string[] {
  const parts = addr.split(' ');
  const skip = new Set([
    'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW',
    'NORTH', 'SOUTH', 'EAST', 'WEST',
    'TX', 'TEXAS', 'BELTON', 'KILLEEN', 'TEMPLE', 'SALADO',
    'NOLANVILLE', 'TROY', 'HOLLAND', 'ROGERS', 'MOODY',
    'HARKER', 'HEIGHTS', 'COPPERAS', 'COVE',
  ]);

  return parts.filter(p =>
    p.length > 0 &&
    !/^\d{5}(-\d{4})?$/.test(p) && // zip codes
    !/^\d+$/.test(p) &&             // numbers
    !skip.has(p)
  );
}

/** Extract road number from FM/CR/SH/etc. designation */
function extractRoadNumber(addr: string): string | null {
  const m = addr.match(/\b(?:FM|CR|SH|RR|US|IH|HWY|SPUR|LOOP)\s*(\d+)/);
  return m ? m[1] : null;
}

/** Extract lot name from a legal description string */
function extractLotFromLegal(legal: string | null): string | null {
  if (!legal) return null;
  const upper = legal.toUpperCase();

  // Try "BLOCK X, LOT Y" (Bell CAD standard)
  const blockFirst = upper.match(/BLOCK\s+[\dA-Z]+[,\s]+LOT\s+([\dA-Z]+)/);
  if (blockFirst) return `Lot ${blockFirst[1]}`;

  // Try "LOT Y"
  const lotOnly = upper.match(/\bLOT\s+([\dA-Z]+)/);
  if (lotOnly) return `Lot ${lotOnly[1]}`;

  // Try "RESERVE A"
  const reserve = upper.match(/\bRESERVE\s+([A-Z])/);
  if (reserve) return `Reserve ${reserve[1]}`;

  return null;
}

/** Extract lot number from a lot name like "Lot 2" → "2" */
function extractLotNumber(lotName: string): string | null {
  const m = lotName.match(/\b(?:LOT|Lot)\s+(\d+[A-Z]?)/i);
  return m ? m[1] : null;
}

/** Find the plat lot whose acreage best matches a target acreage */
function findPlatLotByAcreage(
  platLots: PlatLotForMatching[],
  targetAcreage: number | null,
): PlatLotForMatching | null {
  if (!targetAcreage || platLots.length === 0) return null;

  let bestMatch: PlatLotForMatching | null = null;
  let bestDiff = Infinity;

  for (const lot of platLots) {
    if (!lot.acreage) continue;
    const diff = Math.abs(lot.acreage - targetAcreage);
    const pct = diff / Math.max(lot.acreage, targetAcreage);

    // Within 5% is a good acreage match
    if (pct < 0.05 && diff < bestDiff) {
      bestDiff = diff;
      bestMatch = lot;
    }
  }

  return bestMatch;
}

/** Find a plat lot by name (case-insensitive, flexible matching) */
function findPlatLotByName(
  platLots: PlatLotForMatching[],
  targetName: string,
): PlatLotForMatching | null {
  const target = targetName.toUpperCase().replace(/\s+/g, ' ').trim();

  // Exact match
  for (const lot of platLots) {
    if (lot.lotName.toUpperCase().replace(/\s+/g, ' ').trim() === target) {
      return lot;
    }
  }

  // Number-only match (e.g., "Lot 2" matches "LOT 2" or "Lot 02")
  const numMatch = target.match(/\d+/);
  if (numMatch) {
    const num = parseInt(numMatch[0], 10);
    for (const lot of platLots) {
      const lotNum = lot.lotName.match(/\d+/);
      if (lotNum && parseInt(lotNum[0], 10) === num) {
        return lot;
      }
    }
  }

  return null;
}

// ── Validation: Confirm lot matches address ──────────────────────────────────

/**
 * Validate that the resolved property data matches the expected address.
 * Returns a list of warnings if the match is suspect.
 */
export function validateAddressParcelMatch(
  inputAddress: string | null | undefined,
  resolvedPropertyId: string | null | undefined,
  resolvedAcreage: number | null | undefined,
  resolvedSitusAddress: string | null | undefined,
  resolvedLotNumber: string | null | undefined,
  gisFeatures: GisFeatureForMatching[],
  logger: PipelineLogger,
): string[] {
  const warnings: string[] = [];

  if (!inputAddress) return warnings;

  // Check if the resolved situs address matches the input
  if (resolvedSitusAddress) {
    const score = scoreAddressMatch(inputAddress, resolvedSitusAddress);
    if (score < 50) {
      warnings.push(
        `Address mismatch: input "${inputAddress}" does not match resolved situs "${resolvedSitusAddress}" ` +
        `(match score: ${score}/100). The wrong parcel may have been selected.`
      );
      logger.warn('AddressValidation',
        `Address mismatch: "${inputAddress}" vs "${resolvedSitusAddress}" (score=${score})`);
    }
  }

  // Check if there's a better matching parcel in the GIS features
  if (gisFeatures.length > 1) {
    const inputNum = extractStreetNumber(inputAddress);
    if (inputNum) {
      const betterMatch = gisFeatures.find(f => {
        if (!f.situsAddress || f.propertyId === resolvedPropertyId) return false;
        const featNum = extractStreetNumber(f.situsAddress);
        return featNum === inputNum;
      });

      if (betterMatch && betterMatch.propertyId !== resolvedPropertyId) {
        warnings.push(
          `GIS feature ${betterMatch.propertyId} has situs "${betterMatch.situsAddress}" ` +
          `which matches the input street number "${inputNum}" better than the resolved property. ` +
          `Consider verifying the correct lot was selected.`
        );
        logger.warn('AddressValidation',
          `Better situs match exists: PID=${betterMatch.propertyId} at "${betterMatch.situsAddress}"`);
      }
    }
  }

  // Check that lot number is populated for subdivision properties
  if (!resolvedLotNumber && gisFeatures.length > 1) {
    warnings.push(
      'This appears to be a subdivision property but no lot number was resolved. ' +
      'Verify that the correct lot within the subdivision was identified.'
    );
  }

  return warnings;
}
