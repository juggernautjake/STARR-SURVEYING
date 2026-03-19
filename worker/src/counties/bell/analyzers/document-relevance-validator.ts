// worker/src/counties/bell/analyzers/document-relevance-validator.ts
// Validates whether retrieved deeds and plats actually relate to the target property.
//
// The clerk search can return documents for unrelated properties when:
//   - Owner has common name and multiple properties
//   - Subdivision has many lots and search returns docs for wrong lot
//   - Historical deed chain traces a split or merge to different parcels
//   - Different survey/abstract in the same area shares a boundary or owner
//
// This validator uses heuristic + AI checks to flag or remove unrelated documents.
// Key signals (in order of importance):
//   1. Survey/abstract match (strongest — different abstract = almost certainly wrong)
//   2. Acreage consistency (3x+ difference = almost certainly wrong)
//   3. Subdivision name match
//   4. Lot/block match
//   5. Owner name in grantor/grantee
//   6. Legal description word overlap

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
  /** Abstract number from GIS or legal description (e.g., "12", "488") */
  abstractNumber: string | null;
  /** Survey name from legal description (e.g., "A. Manchaca", "Garrett & Hardcastle") */
  surveyName: string | null;
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
  onProgress(`Target: owner="${property.ownerName}", acreage=${property.acreage}, abstract=${property.abstractNumber ?? 'unknown'}, survey="${property.surveyName ?? 'unknown'}", subdivision="${property.subdivisionName ?? 'unknown'}", lot=${property.lotNumber ?? 'unknown'}`);

  for (const deed of deeds) {
    const deedLabel = deed.instrumentNumber ?? deed.documentType;

    // Step 1: Quick heuristic check
    const heuristic = heuristicRelevanceCheck(deed, property);

    // Log every deed's score for transparency
    onProgress(`  Deed ${deedLabel}: heuristic=${heuristic.score}/100 — ${heuristic.reasoning}`);

    if (heuristic.score >= 70) {
      // High confidence match — keep without AI check
      relevant.push(deed);
      onProgress(`  ✓ Deed ${deedLabel}: KEPT (high confidence ${heuristic.score}/100)`);
      continue;
    }

    if (heuristic.score <= 10) {
      // Very low score — almost certainly unrelated, skip AI to save cost
      const warning = `REMOVED: Deed ${deedLabel} — clearly unrelated (${heuristic.score}/100): ${heuristic.reasoning}`;
      warnings.push(warning);
      onProgress(`  ✗ ${warning}`);
      continue;
    }

    // Step 2: AI relevance check for uncertain documents (score 11-69)
    if (anthropicApiKey && (deed.aiSummary || deed.legalDescription)) {
      try {
        const aiResult = await aiRelevanceCheck(deed, property, anthropicApiKey);
        accumulateUsage(usage, aiResult.usage);

        onProgress(`  Deed ${deedLabel}: AI score=${aiResult.result.score}/100 — ${aiResult.result.reasoning}`);

        if (aiResult.result.keep) {
          relevant.push(deed);
          if (aiResult.result.score < 50) {
            const warning = `Deed ${deedLabel}: low relevance (AI ${aiResult.result.score}/100) but kept — ${aiResult.result.reasoning}`;
            warnings.push(warning);
          }
          onProgress(`  ✓ Deed ${deedLabel}: KEPT (AI ${aiResult.result.score}/100)`);
        } else {
          const warning = `REMOVED: Deed ${deedLabel} — AI determined unrelated (${aiResult.result.score}/100): ${aiResult.result.reasoning}`;
          warnings.push(warning);
          onProgress(`  ✗ ${warning}`);
        }
      } catch (err) {
        // On AI failure, fall back to heuristic
        const msg = err instanceof Error ? err.message : String(err);
        onProgress(`  ⚠ AI check failed for ${deedLabel}: ${msg.slice(0, 100)}`);
        if (heuristic.score >= 25) {
          relevant.push(deed);
          warnings.push(`AI check failed for ${deedLabel} — kept based on heuristic (${heuristic.score}/100)`);
        } else {
          warnings.push(`AI check failed, removed: ${deedLabel} (heuristic ${heuristic.score}/100)`);
        }
      }
    } else {
      // No AI available — use heuristic threshold
      if (heuristic.score >= 25) {
        relevant.push(deed);
        if (heuristic.score < 50) {
          warnings.push(`Low relevance (heuristic ${heuristic.score}/100): ${deedLabel} — ${heuristic.reasoning}`);
        }
      } else {
        warnings.push(`REMOVED (heuristic ${heuristic.score}/100): ${deedLabel} — ${heuristic.reasoning}`);
        onProgress(`  ✗ REMOVED: ${deedLabel} (heuristic ${heuristic.score}/100)`);
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
 * Validate plat records for relevance (checks subdivision name, abstract, owner, acreage).
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

    onProgress(`  Plat "${plat.name}": score=${score.score}/100 — ${score.reasoning}`);

    if (score.keep) {
      relevant.push(plat);
      if (score.score < 40) {
        warnings.push(`Low plat relevance (${score.score}/100): ${plat.name} — ${score.reasoning}`);
        onProgress(`  ⚠ Low plat relevance: ${plat.name} — ${score.reasoning}`);
      } else {
        onProgress(`  ✓ Plat "${plat.name}": KEPT (${score.score}/100)`);
      }
    } else {
      warnings.push(`REMOVED plat: ${plat.name} — ${score.reasoning}`);
      onProgress(`  ✗ Removed unrelated plat: ${plat.name} (${score.score}/100) — ${score.reasoning}`);
    }
  }

  return { relevant, warnings };
}

// ── Pre-Filter (Before AI Analysis) ──────────────────────────────────

/**
 * Lightweight pre-filter that removes clearly irrelevant documents BEFORE
 * they are sent to AI analysis. This prevents the AI from seeing (and
 * incorporating into its narrative) documents that obviously belong to
 * a different property.
 *
 * Uses only clerk metadata (legal description, grantor/grantee, doc type)
 * — does NOT require aiSummary, which isn't available yet at this stage.
 *
 * Only removes documents with very strong negative signals (abstract
 * mismatch + survey mismatch). Uncertain documents are kept for the
 * full post-AI validation to handle.
 */
export function preFilterIrrelevantDocuments<T extends {
  instrumentNumber?: string | null;
  documentType?: string;
  legalDescription?: string | null;
  grantor?: string | null;
  grantee?: string | null;
}>(
  documents: T[],
  property: PropertyIdentifiers,
  onProgress: (msg: string) => void,
): { kept: T[]; removed: T[]; warnings: string[] } {
  if (documents.length === 0) return { kept: [], removed: [], warnings: [] };
  if (!property.abstractNumber && !property.surveyName && !property.subdivisionName) {
    // Without strong identifiers we can't pre-filter safely
    onProgress('Pre-filter: skipped (no abstract/survey/subdivision identifiers available)');
    return { kept: [...documents], removed: [], warnings: [] };
  }

  const kept: T[] = [];
  const removed: T[] = [];
  const warnings: string[] = [];

  for (const doc of documents) {
    const label = (doc as { instrumentNumber?: string | null }).instrumentNumber ?? (doc as { documentType?: string }).documentType ?? 'unknown';
    const legalText = ((doc as { legalDescription?: string | null }).legalDescription ?? '').toUpperCase();

    // Only pre-filter if we can check the legal description
    if (!legalText || legalText.length < 20) {
      kept.push(doc);
      continue;
    }

    // Check for abstract mismatch (strongest disqualifier)
    let abstractMismatch = false;
    let surveyMismatch = false;

    if (property.abstractNumber) {
      const docAbstract = extractAbstractNumber(legalText);
      if (docAbstract) {
        if (normalizeAbstract(docAbstract) !== normalizeAbstract(property.abstractNumber)) {
          abstractMismatch = true;
        }
      }
    }

    if (property.surveyName) {
      const docSurvey = extractSurveyName(legalText);
      if (docSurvey) {
        const propSurvey = property.surveyName.toUpperCase();
        const docSurveyUpper = docSurvey.toUpperCase();
        if (!docSurveyUpper.includes(propSurvey) && !propSurvey.includes(docSurveyUpper)) {
          surveyMismatch = true;
        }
      }
    }

    // Only remove if BOTH abstract AND survey are different (very high confidence)
    // or if abstract is different AND there's a clear different subdivision
    if (abstractMismatch && surveyMismatch) {
      const docAbstract = extractAbstractNumber(legalText);
      const docSurvey = extractSurveyName(legalText);
      const reason = `PRE-FILTER REMOVED: ${label} — different abstract (${docAbstract} vs ${property.abstractNumber}) AND different survey ("${docSurvey}" vs "${property.surveyName}")`;
      warnings.push(reason);
      onProgress(`  ✗ ${reason}`);
      removed.push(doc);
      continue;
    }

    if (abstractMismatch && property.subdivisionName) {
      const docSubdiv = extractSubdivisionFromText(legalText);
      if (docSubdiv) {
        const propSubdiv = property.subdivisionName.toUpperCase();
        if (!docSubdiv.includes(propSubdiv) && !propSubdiv.includes(docSubdiv)) {
          const docAbstract = extractAbstractNumber(legalText);
          const reason = `PRE-FILTER REMOVED: ${label} — different abstract (${docAbstract} vs ${property.abstractNumber}) AND different subdivision ("${docSubdiv}" vs "${property.subdivisionName}")`;
          warnings.push(reason);
          onProgress(`  ✗ ${reason}`);
          removed.push(doc);
          continue;
        }
      }
    }

    kept.push(doc);
  }

  if (removed.length > 0) {
    onProgress(`Pre-filter: removed ${removed.length} clearly unrelated document(s), keeping ${kept.length} for AI analysis`);
  }

  return { kept, removed, warnings };
}

// ── Heuristic Checks ─────────────────────────────────────────────────

function heuristicRelevanceCheck(deed: DeedRecord, property: PropertyIdentifiers): RelevanceResult {
  let score = 0;
  const reasons: string[] = [];

  const ownerUpper = (property.ownerName ?? '').toUpperCase();
  const legalUpper = (property.legalDescription ?? '').toUpperCase();
  const deedText = ((deed.legalDescription ?? '') + ' ' + (deed.aiSummary ?? '')).toUpperCase();
  const grantorUpper = (deed.grantor ?? '').toUpperCase();
  const granteeUpper = (deed.grantee ?? '').toUpperCase();

  // ── Check 1: Survey/Abstract match (STRONGEST signal) ──────────
  // Different survey abstracts = almost certainly different property
  if (property.abstractNumber || property.surveyName) {
    const deedAbstract = extractAbstractNumber(deedText);
    const deedSurvey = extractSurveyName(deedText);

    if (property.abstractNumber && deedAbstract) {
      if (normalizeAbstract(deedAbstract) === normalizeAbstract(property.abstractNumber)) {
        score += 30;
        reasons.push(`abstract matches (${deedAbstract})`);
      } else {
        score -= 30;
        reasons.push(`DIFFERENT ABSTRACT: deed=${deedAbstract} vs property=${property.abstractNumber}`);
      }
    }

    if (property.surveyName && deedSurvey) {
      const propSurvey = property.surveyName.toUpperCase();
      const deedSurveyUpper = deedSurvey.toUpperCase();
      if (deedSurveyUpper.includes(propSurvey) || propSurvey.includes(deedSurveyUpper)) {
        score += 15;
        reasons.push(`survey name matches ("${deedSurvey}")`);
      } else {
        score -= 20;
        reasons.push(`DIFFERENT SURVEY: deed="${deedSurvey}" vs property="${property.surveyName}"`);
      }
    }
  }

  // ── Check 2: Acreage match (STRONG signal) ─────────────────────
  if (property.acreage && deedText) {
    const acreageMatches = [...deedText.matchAll(/(\d+\.?\d*)\s*(?:ACRE|AC\b)/gi)];
    if (acreageMatches.length > 0) {
      // Check ALL acreage values found in the deed
      let bestMatch = false;
      let worstMismatch = false;
      for (const m of acreageMatches) {
        const deedAcreage = parseFloat(m[1]);
        if (deedAcreage < 0.01) continue; // skip noise
        const tolerance = Math.max(property.acreage * 0.20, 0.5); // 20% or 0.5ac
        if (Math.abs(deedAcreage - property.acreage) <= tolerance) {
          bestMatch = true;
        } else if (deedAcreage > property.acreage * 2.5 || deedAcreage < property.acreage * 0.1) {
          worstMismatch = true;
        }
      }

      if (bestMatch) {
        score += 15;
        reasons.push(`acreage consistent with ${property.acreage}ac`);
      } else if (worstMismatch) {
        const vals = acreageMatches.map(m => parseFloat(m[1])).filter(v => v > 0.01);
        score -= 25;
        reasons.push(`ACREAGE MISMATCH: deed mentions ${vals.join(', ')}ac vs property ${property.acreage}ac`);
      }
    }
  }

  // ── Check 3: Subdivision name match ────────────────────────────
  if (property.subdivisionName && deedText) {
    const subName = property.subdivisionName.toUpperCase();
    if (deedText.includes(subName)) {
      score += 20;
      reasons.push('subdivision name matches');
    } else {
      // Check if deed mentions a DIFFERENT subdivision
      const deedSubdiv = extractSubdivisionFromText(deedText);
      if (deedSubdiv && !deedSubdiv.includes(subName) && !subName.includes(deedSubdiv)) {
        score -= 15;
        reasons.push(`different subdivision: deed="${deedSubdiv}" vs property="${property.subdivisionName}"`);
      }
    }
  }

  // ── Check 4: Owner name in grantor/grantee ─────────────────────
  if (ownerUpper && (containsName(grantorUpper, ownerUpper) || containsName(granteeUpper, ownerUpper))) {
    score += 20;
    reasons.push('owner name matches grantor/grantee');
  }

  // ── Check 5: Lot/block match ───────────────────────────────────
  if (property.lotNumber && deedText) {
    const lotPattern = new RegExp(`\\bLOT\\s+0*${escapeRegex(property.lotNumber)}\\b`, 'i');
    if (lotPattern.test(deedText)) {
      score += 15;
      reasons.push('lot number matches');
    }
  }
  if (property.blockNumber && deedText) {
    const blockPattern = new RegExp(`\\bBLOCK\\s+0*${escapeRegex(property.blockNumber)}\\b`, 'i');
    if (blockPattern.test(deedText)) {
      score += 10;
      reasons.push('block number matches');
    }
  }

  // ── Check 6: Legal description word overlap ────────────────────
  if (legalUpper && deedText) {
    const legalOverlap = computeLegalOverlap(legalUpper, deedText);
    if (legalOverlap > 0.5) {
      score += 15;
      reasons.push(`high legal description overlap (${Math.round(legalOverlap * 100)}%)`);
    } else if (legalOverlap > 0.25) {
      score += 5;
      reasons.push(`partial legal overlap (${Math.round(legalOverlap * 100)}%)`);
    }
  }

  // ── Check 7: Address in deed text ──────────────────────────────
  if (property.situsAddress && deedText) {
    const streetNum = property.situsAddress.match(/^(\d+)/)?.[1];
    if (streetNum && deedText.includes(streetNum)) {
      score += 5;
      reasons.push('street number found in deed');
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasoning: reasons.length > 0 ? reasons.join('; ') : 'no matching identifiers found',
    keep: score >= 20,
  };
}

function scorePlatRelevance(
  plat: { name: string; aiAnalysis?: { narrative?: string; lotDimensions?: string[] } | null },
  property: PropertyIdentifiers,
): RelevanceResult {
  // Start at 30 (neutral-low) — plats need positive signals to pass
  let score = 30;
  const reasons: string[] = [];
  const platName = plat.name.toUpperCase();
  const narrative = (plat.aiAnalysis?.narrative ?? '').toUpperCase();
  const allPlatText = platName + ' ' + narrative + ' ' + (plat.aiAnalysis?.lotDimensions?.join(' ') ?? '');

  // ── Check 1: Subdivision name match (STRONGEST for plats) ──────
  if (property.subdivisionName) {
    const subName = property.subdivisionName.toUpperCase();
    // Check for exact or partial match (handle "Ash Family Trust Addition" vs "Ash Family Trust 12.358 Acre Addition")
    const subWords = subName.split(/\s+/).filter(w => w.length > 2);
    const matchCount = subWords.filter(w => platName.includes(w)).length;
    const matchRatio = subWords.length > 0 ? matchCount / subWords.length : 0;

    if (platName.includes(subName) || subName.includes(platName.replace(/\s+PH(ASE)?\s*\d+/i, '').trim())) {
      score += 40;
      reasons.push('subdivision name matches');
    } else if (matchRatio >= 0.5) {
      score += 20;
      reasons.push(`partial subdivision match (${matchCount}/${subWords.length} words)`);
    } else {
      score -= 30;
      reasons.push(`plat "${plat.name}" does NOT match subdivision "${property.subdivisionName}"`);
    }
  }

  // ── Check 2: Abstract/survey match ─────────────────────────────
  if (property.abstractNumber) {
    const platAbstract = extractAbstractNumber(allPlatText);
    if (platAbstract) {
      if (normalizeAbstract(platAbstract) === normalizeAbstract(property.abstractNumber)) {
        score += 20;
        reasons.push(`abstract matches (${platAbstract})`);
      } else {
        score -= 25;
        reasons.push(`DIFFERENT ABSTRACT: plat=${platAbstract} vs property=${property.abstractNumber}`);
      }
    }
  }
  if (property.surveyName) {
    const platSurvey = extractSurveyName(allPlatText);
    if (platSurvey) {
      const propSurvey = property.surveyName.toUpperCase();
      const platSurveyUpper = platSurvey.toUpperCase();
      if (platSurveyUpper.includes(propSurvey) || propSurvey.includes(platSurveyUpper)) {
        score += 15;
        reasons.push(`survey name matches`);
      } else {
        score -= 20;
        reasons.push(`DIFFERENT SURVEY: plat="${platSurvey}" vs property="${property.surveyName}"`);
      }
    }
  }

  // ── Check 3: Owner name in plat narrative ──────────────────────
  if (property.ownerName && narrative) {
    if (containsName(narrative, property.ownerName.toUpperCase())) {
      score += 15;
      reasons.push('owner name found in plat narrative');
    }
  }

  // ── Check 4: Lot number in plat dimensions ─────────────────────
  if (property.lotNumber && plat.aiAnalysis?.lotDimensions) {
    const lotPattern = new RegExp(`\\bLot\\s+0*${escapeRegex(property.lotNumber)}\\b`, 'i');
    const hasLot = plat.aiAnalysis.lotDimensions.some(d => lotPattern.test(d));
    if (hasLot) {
      score += 15;
      reasons.push('target lot found in plat lot dimensions');
    }
  }

  // ── Check 5: Acreage consistency ───────────────────────────────
  if (property.acreage) {
    const acreageMatches = [...allPlatText.matchAll(/(\d+\.?\d*)\s*(?:ACRE|AC\b)/gi)];
    const values = acreageMatches.map(m => parseFloat(m[1])).filter(v => v > 0.01);
    if (values.length > 0) {
      // Check if any acreage in the plat is close to the property acreage
      const anyClose = values.some(v => Math.abs(v - property.acreage!) <= Math.max(property.acreage! * 0.25, 1));
      if (anyClose) {
        score += 10;
        reasons.push('acreage consistent');
      } else {
        const allFarOff = values.every(v => v > property.acreage! * 3 || v < property.acreage! * 0.1);
        if (allFarOff) {
          score -= 15;
          reasons.push(`acreage mismatch: plat mentions ${values.join(', ')}ac vs property ${property.acreage}ac`);
        }
      }
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasoning: reasons.length > 0 ? reasons.join('; ') : 'no specific matching criteria',
    keep: score >= 25,
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

  const prompt = `You are a property title researcher in Bell County, Texas. Determine if this deed document is related to the target property.

CRITICAL: The most important check is whether the deed references the SAME SURVEY and ABSTRACT NUMBER as the target property. If the deed references a completely different survey (e.g., "A. Manchaca Survey" vs "Garrett & Hardcastle Survey") or a different abstract number, it is almost certainly for a DIFFERENT property and should be marked as unrelated.

TARGET PROPERTY:
- Owner: ${property.ownerName ?? 'unknown'}
- Legal Description: ${property.legalDescription ?? 'unknown'}
- Acreage: ${property.acreage ?? 'unknown'}
- Lot: ${property.lotNumber ?? 'unknown'}, Block: ${property.blockNumber ?? 'unknown'}
- Subdivision: ${property.subdivisionName ?? 'unknown'}
- Address: ${property.situsAddress ?? 'unknown'}
- Abstract Number: ${property.abstractNumber ?? 'unknown'}
- Survey Name: ${property.surveyName ?? 'unknown'}

DEED DOCUMENT:
- Type: ${deed.documentType}
- Instrument: ${deed.instrumentNumber ?? 'unknown'}
- Grantor: ${deed.grantor ?? 'unknown'}
- Grantee: ${deed.grantee ?? 'unknown'}
- Date: ${deed.recordingDate ?? 'unknown'}
- Legal Description: ${deed.legalDescription ?? 'none'}
- AI Summary: ${(deed.aiSummary ?? 'none').slice(0, 800)}

DECISION CRITERIA (in order of importance):
1. SURVEY/ABSTRACT: Does the deed reference the same survey and abstract number? Different abstract = almost certainly wrong property.
2. ACREAGE: Is the acreage consistent? A 46-acre deed for a 12-acre property is likely wrong.
3. SUBDIVISION: Does it reference the same subdivision or addition?
4. LOT/BLOCK: Does it reference the same lot and block?
5. NAMES: Do the grantor/grantee names connect to the property's chain of title?
6. Could this be a PARENT TRACT that was later subdivided to create the target property? (In that case, keep=true)

Be STRICT: if the deed clearly describes a different property (different survey, wildly different acreage, different subdivision), mark keep=false even if the owner name matches.

Respond in JSON:
{
  "score": <0-100, where 100=definitely same property, 0=definitely different>,
  "reasoning": "<brief explanation focusing on which signals match or mismatch>",
  "keep": <true if related to target property, false if clearly unrelated>
}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
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

// ── Extract Abstract/Survey from Text ────────────────────────────────

/**
 * Extract abstract number from text.
 * Handles patterns like:
 *   "Abstract No. 12", "Abstract Number 488", "A-12", "ABST. 488"
 */
function extractAbstractNumber(text: string): string | null {
  const patterns = [
    /ABST(?:RACT)?[\s.]*(?:NO|NUMBER|#)?[\s.]*(\d+)/i,
    /\bA-(\d+)\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Extract survey name from text.
 * Handles patterns like:
 *   "A. Manchaca Survey", "Garrett & Hardcastle Survey", "John Smith Survey"
 */
function extractSurveyName(text: string): string | null {
  // Match "X Survey" patterns — name can include initials, &, etc.
  const m = text.match(/([A-Z][A-Za-z.]+(?:\s+(?:&|AND)\s+[A-Z][A-Za-z.]+)?(?:\s+[A-Z][A-Za-z.]+)*)\s+SURVEY/i);
  if (m) return m[1].trim();
  return null;
}

/** Normalize abstract number for comparison (strip leading zeros, etc.) */
function normalizeAbstract(abs: string): string {
  return abs.replace(/^0+/, '') || '0';
}

/**
 * Extract abstract number and survey name from a legal description.
 * Exported so orchestrator can use it to populate PropertyIdentifiers.
 */
export function extractAbstractAndSurvey(legalDescription: string): { abstractNumber: string | null; surveyName: string | null } {
  const upper = legalDescription.toUpperCase();
  return {
    abstractNumber: extractAbstractNumber(upper),
    surveyName: extractSurveyName(upper),
  };
}

/** Extract subdivision/addition name from free text */
function extractSubdivisionFromText(text: string): string | null {
  // Match "XXX Addition", "XXX Subdivision", "XXX Estates", "XXX Phase N"
  const m = text.match(/([A-Z][A-Z\s&.']+?)\s+(?:ADDITION|SUBDIVISION|ESTATES|SUBD?\.?|ADD\.?)\b/i);
  if (m) return m[1].trim();
  return null;
}

// ── String Helpers ───────────────────────────────────────────────────

/** Check if a name (possibly "LAST, FIRST" format) appears in text */
function containsName(text: string, name: string): boolean {
  if (!name || !text) return false;
  const nameUpper = name.toUpperCase();
  const textUpper = text.toUpperCase();
  // Direct substring
  if (textUpper.includes(nameUpper)) return true;
  // Try last name only (first significant word)
  const parts = nameUpper.split(/[,\s]+/).filter(p => p.length > 2);
  if (parts.length > 0 && textUpper.includes(parts[0])) return true;
  // Try reversed "FIRST LAST" → "LAST, FIRST"
  if (parts.length >= 2) {
    const reversed = `${parts[parts.length - 1]}, ${parts[0]}`;
    if (textUpper.includes(reversed)) return true;
  }
  return false;
}

/** Compute overlap ratio of significant words between two legal descriptions */
function computeLegalOverlap(legal1: string, legal2: string): number {
  const stopWords = new Set(['THE', 'OF', 'AND', 'IN', 'TO', 'A', 'AN', 'AT', 'FOR', 'ON', 'IS', 'BY', 'AS', 'OR',
    'BEING', 'SAID', 'COUNTY', 'STATE', 'TEXAS', 'BELL', 'RECORDED', 'VOLUME', 'PAGE', 'DEED', 'RECORDS']);
  const words1 = new Set(legal1.toUpperCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));
  const words2 = new Set(legal2.toUpperCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));

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
