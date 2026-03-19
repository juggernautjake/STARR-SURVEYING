// worker/src/counties/bell/analyzers/document-relevance-validator.ts
// Validates whether retrieved deeds and plats actually relate to the target property.
//
// The clerk search can return documents for unrelated properties when:
//   - Owner has common name and multiple properties
//   - Subdivision has many lots and search returns docs for wrong lot
//   - Historical deed chain traces a split or merge to different parcels
//
// This validator uses AI + heuristic checks to flag or remove unrelated documents.

import type { DeedRecord } from '../types/research-result.js';
import { accumulateUsage, buildUsageFromTokens, zeroUsage } from './ai-cost-helpers.js';
import type { AiUsageSummary } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface PropertyIdentifiers {
  ownerName: string | null;
  legalDescription: string | null;
  acreage: number | null;
  lotNumber: string | null;
  blockNumber: string | null;
  subdivisionName: string | null;
  situsAddress: string | null;
}

export interface RelevanceResult {
  /** 0-100, where 100 = definitely related, 0 = definitely unrelated */
  score: number;
  /** Human-readable reason for the score */
  reasoning: string;
  /** Whether the document should be kept in the analysis */
  keep: boolean;
}

export interface ValidationSummary {
  total: number;
  kept: number;
  removed: number;
  warnings: string[];
  aiUsage: AiUsageSummary;
}

// ── Main Validator ───────────────────────────────────────────────────

/**
 * Validate deed records for relevance to the target property.
 * Returns the filtered list of relevant deeds and a summary of what was removed.
 */
export async function validateDeedRelevance(
  deeds: DeedRecord[],
  property: PropertyIdentifiers,
  anthropicApiKey: string,
  onProgress: (msg: string) => void,
): Promise<{ relevant: DeedRecord[]; summary: ValidationSummary }> {
  const usage = zeroUsage();
  const warnings: string[] = [];
  const relevant: DeedRecord[] = [];

  if (deeds.length === 0) {
    return { relevant, summary: { total: 0, kept: 0, removed: 0, warnings: [], aiUsage: usage } };
  }

  onProgress(`Validating relevance of ${deeds.length} deed(s) to target property...`);

  for (const deed of deeds) {
    // Step 1: Quick heuristic check
    const heuristic = heuristicRelevanceCheck(deed, property);

    if (heuristic.score >= 70) {
      // High confidence match — keep without AI check
      relevant.push(deed);
      continue;
    }

    if (heuristic.score <= 15) {
      // Very low confidence — flag but still use AI to confirm
      onProgress(`⚠ Low relevance (${heuristic.score}/100): ${deed.instrumentNumber ?? deed.documentType} — ${heuristic.reasoning}`);
    }

    // Step 2: AI relevance check for uncertain documents
    if (anthropicApiKey && deed.aiSummary) {
      try {
        const aiResult = await aiRelevanceCheck(deed, property, anthropicApiKey);
        accumulateUsage(usage, aiResult.usage);

        if (aiResult.result.keep) {
          relevant.push(deed);
          if (aiResult.result.score < 50) {
            const warning = `Deed ${deed.instrumentNumber ?? deed.documentType}: low relevance (${aiResult.result.score}/100) but kept — ${aiResult.result.reasoning}`;
            warnings.push(warning);
            onProgress(`⚠ ${warning}`);
          }
        } else {
          const warning = `REMOVED: Deed ${deed.instrumentNumber ?? deed.documentType} — unrelated to target property (${aiResult.result.score}/100): ${aiResult.result.reasoning}`;
          warnings.push(warning);
          onProgress(`✗ ${warning}`);
        }
      } catch (err) {
        // On AI failure, fall back to heuristic
        if (heuristic.score >= 30) {
          relevant.push(deed);
          warnings.push(`AI check failed for ${deed.instrumentNumber ?? deed.documentType} — kept based on heuristic (${heuristic.score}/100)`);
        } else {
          warnings.push(`AI check failed, removed: ${deed.instrumentNumber ?? deed.documentType} (heuristic ${heuristic.score}/100)`);
        }
      }
    } else {
      // No AI available — use heuristic threshold
      if (heuristic.score >= 30) {
        relevant.push(deed);
        if (heuristic.score < 50) {
          warnings.push(`Low relevance (heuristic ${heuristic.score}/100): ${deed.instrumentNumber ?? deed.documentType} — ${heuristic.reasoning}`);
        }
      } else {
        warnings.push(`REMOVED (heuristic ${heuristic.score}/100): ${deed.instrumentNumber ?? deed.documentType} — ${heuristic.reasoning}`);
      }
    }
  }

  const removed = deeds.length - relevant.length;
  if (removed > 0) {
    onProgress(`✓ Relevance check: kept ${relevant.length} of ${deeds.length} deed(s), removed ${removed} unrelated`);
  } else {
    onProgress(`✓ Relevance check: all ${deeds.length} deed(s) appear related to target property`);
  }

  return {
    relevant,
    summary: {
      total: deeds.length,
      kept: relevant.length,
      removed,
      warnings,
      aiUsage: usage,
    },
  };
}

/**
 * Validate plat records for relevance (lighter check since plats are subdivision-level).
 * Returns filtered plats and warnings.
 */
export function validatePlatRelevance<T extends { name: string; instrumentNumber?: string | null; aiAnalysis?: { narrative?: string; lotDimensions?: string[] } | null }>(
  plats: T[],
  property: PropertyIdentifiers,
  onProgress: (msg: string) => void,
): { relevant: T[]; warnings: string[] } {
  const warnings: string[] = [];
  const relevant: T[] = [];

  for (const plat of plats) {
    const score = scorePlatRelevance(plat, property);

    if (score.keep) {
      relevant.push(plat);
      if (score.score < 50) {
        warnings.push(`Low plat relevance (${score.score}/100): ${plat.name} — ${score.reasoning}`);
        onProgress(`⚠ Low plat relevance: ${plat.name} — ${score.reasoning}`);
      }
    } else {
      warnings.push(`REMOVED plat: ${plat.name} — ${score.reasoning}`);
      onProgress(`✗ Removed unrelated plat: ${plat.name} — ${score.reasoning}`);
    }
  }

  return { relevant, warnings };
}

// ── Heuristic Checks ─────────────────────────────────────────────────

function heuristicRelevanceCheck(deed: DeedRecord, property: PropertyIdentifiers): RelevanceResult {
  let score = 0;
  const reasons: string[] = [];

  const ownerUpper = (property.ownerName ?? '').toUpperCase();
  const legalUpper = (property.legalDescription ?? '').toUpperCase();
  const deedLegalUpper = (deed.legalDescription ?? deed.aiSummary ?? '').toUpperCase();
  const grantorUpper = (deed.grantor ?? '').toUpperCase();
  const granteeUpper = (deed.grantee ?? '').toUpperCase();

  // Check 1: Owner name appears in grantor or grantee (+30)
  if (ownerUpper && (containsName(grantorUpper, ownerUpper) || containsName(granteeUpper, ownerUpper))) {
    score += 30;
    reasons.push('owner name matches grantor/grantee');
  }

  // Check 2: Legal description overlap (+25)
  if (legalUpper && deedLegalUpper) {
    const legalOverlap = computeLegalOverlap(legalUpper, deedLegalUpper);
    if (legalOverlap > 0.4) {
      score += 25;
      reasons.push(`legal description overlap ${Math.round(legalOverlap * 100)}%`);
    } else if (legalOverlap > 0.2) {
      score += 10;
      reasons.push(`partial legal description overlap ${Math.round(legalOverlap * 100)}%`);
    }
  }

  // Check 3: Lot/block match (+20)
  if (property.lotNumber && deedLegalUpper) {
    const lotPattern = new RegExp(`\\bLOT\\s+0*${escapeRegex(property.lotNumber)}\\b`, 'i');
    if (lotPattern.test(deedLegalUpper)) {
      score += 20;
      reasons.push('lot number matches');
    }
  }
  if (property.blockNumber && deedLegalUpper) {
    const blockPattern = new RegExp(`\\bBLOCK\\s+0*${escapeRegex(property.blockNumber)}\\b`, 'i');
    if (blockPattern.test(deedLegalUpper)) {
      score += 10;
      reasons.push('block number matches');
    }
  }

  // Check 4: Subdivision name match (+15)
  if (property.subdivisionName && deedLegalUpper) {
    const subName = property.subdivisionName.toUpperCase();
    if (deedLegalUpper.includes(subName) || legalUpper.includes(subName)) {
      score += 15;
      reasons.push('subdivision name matches');
    }
  }

  // Check 5: Acreage in range (+10)
  if (property.acreage && deedLegalUpper) {
    const acreageMatch = deedLegalUpper.match(/(\d+\.?\d*)\s*(?:ACRE|AC)/);
    if (acreageMatch) {
      const deedAcreage = parseFloat(acreageMatch[1]);
      const tolerance = Math.max(property.acreage * 0.15, 0.5); // 15% or 0.5ac
      if (Math.abs(deedAcreage - property.acreage) <= tolerance) {
        score += 10;
        reasons.push(`acreage matches (${deedAcreage} vs ${property.acreage})`);
      } else if (deedAcreage > property.acreage * 3 || deedAcreage < property.acreage * 0.1) {
        score -= 15;
        reasons.push(`acreage mismatch (deed: ${deedAcreage}ac vs property: ${property.acreage}ac)`);
      }
    }
  }

  // Check 6: Address in deed text (+10)
  if (property.situsAddress && deedLegalUpper) {
    const streetNum = property.situsAddress.match(/^(\d+)/)?.[1];
    if (streetNum && deedLegalUpper.includes(streetNum)) {
      score += 10;
      reasons.push('street number found in deed');
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasoning: reasons.length > 0 ? reasons.join('; ') : 'no matching identifiers found',
    keep: score >= 25,
  };
}

function scorePlatRelevance(
  plat: { name: string; aiAnalysis?: { narrative?: string; lotDimensions?: string[] } | null },
  property: PropertyIdentifiers,
): RelevanceResult {
  let score = 50; // Default: plats are generally more likely to be relevant
  const reasons: string[] = [];
  const platName = plat.name.toUpperCase();

  // Check subdivision name match
  if (property.subdivisionName) {
    const subName = property.subdivisionName.toUpperCase();
    if (platName.includes(subName) || subName.includes(platName.replace(/\s+PH(ASE)?\s*\d+/i, '').trim())) {
      score += 30;
      reasons.push('subdivision name matches');
    } else {
      score -= 20;
      reasons.push(`plat "${plat.name}" doesn't match subdivision "${property.subdivisionName}"`);
    }
  }

  // Check lot number in plat analysis
  if (property.lotNumber && plat.aiAnalysis?.lotDimensions) {
    const lotPattern = new RegExp(`\\bLot\\s+0*${escapeRegex(property.lotNumber)}\\b`, 'i');
    const hasLot = plat.aiAnalysis.lotDimensions.some(d => lotPattern.test(d));
    if (hasLot) {
      score += 20;
      reasons.push('target lot found in plat lot dimensions');
    }
  }

  // Check acreage in plat
  if (property.acreage && plat.aiAnalysis?.lotDimensions) {
    const acreStr = property.acreage.toFixed(2);
    const hasAcreage = plat.aiAnalysis.lotDimensions.some(d => d.includes(acreStr));
    if (hasAcreage) {
      score += 10;
      reasons.push('target acreage found in plat');
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasoning: reasons.length > 0 ? reasons.join('; ') : 'no specific matching criteria',
    keep: score >= 30,
  };
}

// ── AI Relevance Check ───────────────────────────────────────────────

async function aiRelevanceCheck(
  deed: DeedRecord,
  property: PropertyIdentifiers,
  apiKey: string,
): Promise<{ result: RelevanceResult; usage: Partial<AiUsageSummary> }> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const prompt = `You are a property title researcher. Determine if this deed document is related to the target property.

TARGET PROPERTY:
- Owner: ${property.ownerName ?? 'unknown'}
- Legal Description: ${property.legalDescription ?? 'unknown'}
- Acreage: ${property.acreage ?? 'unknown'}
- Lot: ${property.lotNumber ?? 'unknown'}, Block: ${property.blockNumber ?? 'unknown'}
- Subdivision: ${property.subdivisionName ?? 'unknown'}
- Address: ${property.situsAddress ?? 'unknown'}

DEED DOCUMENT:
- Type: ${deed.documentType}
- Instrument: ${deed.instrumentNumber ?? 'unknown'}
- Grantor: ${deed.grantor ?? 'unknown'}
- Grantee: ${deed.grantee ?? 'unknown'}
- Date: ${deed.recordingDate ?? 'unknown'}
- Legal Description: ${deed.legalDescription ?? 'none'}
- AI Summary: ${deed.aiSummary ?? 'none'}

Does this deed relate to the target property? Consider:
1. Do the grantor/grantee names match or relate to the owner?
2. Does the legal description reference the same lot/block/subdivision?
3. Is the acreage consistent (within 15%)?
4. Could this be a prior deed in the property's chain of title?
5. Is this for a completely different parcel that happens to share an owner name?

Respond in JSON:
{
  "score": <0-100, where 100=definitely same property>,
  "reasoning": "<brief explanation>",
  "keep": <true if likely related, false if clearly unrelated>
}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find((c: { type: string }) => c.type === 'text');
  const responseText = text && 'text' in text ? (text as { text: string }).text : '';

  const callUsage = buildUsageFromTokens(
    response.usage?.input_tokens ?? 0,
    response.usage?.output_tokens ?? 0,
  );

  // Parse AI response
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { score?: number; reasoning?: string; keep?: boolean };
      return {
        result: {
          score: parsed.score ?? 50,
          reasoning: parsed.reasoning ?? 'AI analysis',
          keep: parsed.keep ?? true,
        },
        usage: callUsage,
      };
    }
  } catch { /* fall through */ }

  // Default if AI response unparseable
  return {
    result: { score: 50, reasoning: 'AI response unparseable — keeping by default', keep: true },
    usage: callUsage,
  };
}

// ── String Helpers ───────────────────────────────────────────────────

/** Check if a name (possibly "LAST, FIRST" format) appears in text */
function containsName(text: string, name: string): boolean {
  if (!name || !text) return false;
  // Direct substring
  if (text.includes(name)) return true;
  // Try last name only (first significant word)
  const parts = name.split(/[,\s]+/).filter(p => p.length > 2);
  if (parts.length > 0 && text.includes(parts[0])) return true;
  // Try reversed "FIRST LAST" → "LAST, FIRST"
  if (parts.length >= 2) {
    const reversed = `${parts[parts.length - 1]}, ${parts[0]}`;
    if (text.includes(reversed)) return true;
  }
  return false;
}

/** Compute overlap ratio of significant words between two legal descriptions */
function computeLegalOverlap(legal1: string, legal2: string): number {
  const stopWords = new Set(['THE', 'OF', 'AND', 'IN', 'TO', 'A', 'AN', 'AT', 'FOR', 'ON', 'IS', 'BY', 'AS', 'OR']);
  const words1 = new Set(legal1.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));
  const words2 = new Set(legal2.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));

  if (words1.size === 0 || words2.size === 0) return 0;

  let overlap = 0;
  for (const w of words1) {
    if (words2.has(w)) overlap++;
  }

  return overlap / Math.min(words1.size, words2.size);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
