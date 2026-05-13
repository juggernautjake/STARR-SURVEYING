// worker/src/services/ai-context-analyzer.ts
// Pipeline C — Property Context & Discrepancy Analysis for STARR RECON Phase 3.
//
// The "big brain" final analysis step. Examines ALL extracted data and makes
// intelligent determinations about:
//   - Property type (subdivision / standalone / lot-in-subdivision)
//   - Historical context and datum considerations
//   - Data quality and biggest gaps
//   - Specific purchase recommendations ranked by confidence-gain-per-dollar
//   - Discrepancies from reconciliation conflicts + area mismatches
//
// Builds on patterns from property-validation-pipeline.ts (synthesis prompt
// structure and cross-validation logic) but uses Phase 3 data shapes.
//
// Spec: docs/planning/in-progress/STARR_RECON/PHASE_03_EXTRACTION.md §7

import Anthropic from '@anthropic-ai/sdk';
import {
  computeConfidenceSummary,
  toConfidenceSymbol,
} from '../models/property-intelligence.js';
import type {
  PropertyIntelligence,
  Discrepancy,
  P3BoundaryCall,
  LotData,
} from '../models/property-intelligence.js';
import type { PlatAnalysisResult } from './ai-plat-analyzer.js';
import type { DeedAnalysisResult } from './ai-deed-analyzer.js';
import type { HarvestResult } from '../types/document-harvest.js';
import type { PipelineLogger } from '../lib/logger.js';
import type { ReconciliationResult } from './geo-reconcile.js';

// ── Constants ─────────────────────────────────────────────────────────────

const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-6';

/** Maximum characters of the raw AI response to include in error log previews. */
const MAX_ERROR_PREVIEW_LENGTH = 500;

// ── Context analysis prompt ───────────────────────────────────────────────

const CONTEXT_ANALYSIS_PROMPT = `You are a senior licensed Texas Professional Land Surveyor (RPLS) and title researcher. Analyze this property's extracted data and provide expert context.

=== PROPERTY DATA ===
Lots found: {TOTAL_LOTS}
Lot names: {LOT_NAMES}
Adjacent owners: {ADJACENT_OWNERS}
Roads: {ROADS}
Total boundary calls extracted: {TOTAL_CALLS}
Confirmed calls (✓): {CONFIRMED}
Deduced calls (~): {DEDUCED}
Unconfirmed calls (?): {UNCONFIRMED}
Discrepancy calls (✗): {DISCREPANCY}
Critical calls (✗✗): {CRITICAL}

=== DEED INFORMATION ===
{DEED_SUMMARY}

=== DOCUMENTS AVAILABLE ===
{HARVEST_SUMMARY}

=== RECONCILIATION CONFLICTS ===
{CONFLICTS}

Return ONLY valid JSON (no markdown fences):
{
  "propertyType": "subdivision" | "standalone_tract" | "lot_in_subdivision" | "unknown",
  "propertyTypeReasoning": "brief explanation",
  "redFlags": ["list of concerns"],
  "historicalContext": "description of development history and any datum/unit considerations",
  "adjacentPropertyPriority": ["owner names ranked by research value, most important first"],
  "dataQualityNotes": "overall assessment of the document quality",
  "biggestGap": "single sentence describing the most significant data gap",
  "recommendedAction": "single sentence recommended next action for the surveyor",
  "documentRecommendations": [
    {
      "document": "description of the specific document needed",
      "source": "County Clerk | TexasFile | TxDOT RPAM | FEMA | Other",
      "estimatedPrice": 5.00,
      "confidenceImpact": "64% → 90%+",
      "priority": "high" | "medium" | "low",
      "reasoning": "why this document matters for boundary resolution"
    }
  ],
  "discrepancies": [
    {
      "id": "DISC-001",
      "severity": "critical" | "moderate" | "minor" | "informational",
      "category": "bearing_conflict" | "distance_conflict" | "area_conflict" | "datum_shift" | "missing_data" | "road_geometry" | "monument_conflict" | "other",
      "description": "what is wrong",
      "affectedCalls": ["callId1", "callId2"],
      "affectedLots": ["lotId1"],
      "readings": [
        { "source": "source name", "value": "the conflicting value" }
      ],
      "likelyCorrect": "best determination if available or null",
      "basis": "reasoning for the best determination or null",
      "resolution": "what action to take to resolve this"
    }
  ]
}`;

// ── Public interfaces ─────────────────────────────────────────────────────

export interface ContextAnalysisResult {
  propertyType: PropertyIntelligence['property']['propertyType'];
  propertyTypeReasoning: string;
  discrepancies: Discrepancy[];
  adjacentPropertyPriority: string[];
  historicalContext: string;
  redFlags: string[];
  dataQualityNotes: string;
  biggestGap: string;
  recommendedAction: string;
  confidenceSummary: PropertyIntelligence['confidenceSummary'];
  totalApiCalls: number;
}

// ── AIContextAnalyzer class ───────────────────────────────────────────────

export class AIContextAnalyzer {
  constructor(
    private apiKey: string,
    private logger: PipelineLogger,
  ) {}

  /**
   * Run the context analysis pass. Takes all Phase 3 pipeline outputs and
   * produces a structured ContextAnalysisResult with discrepancies,
   * property type determination, and document recommendations.
   */
  async analyzeContext(
    platResult: PlatAnalysisResult,
    deedResults: DeedAnalysisResult[],
    harvestSummary: HarvestResult,
    // Optional: supply reconciliation results to seed discrepancy list
    reconciliationResult?: ReconciliationResult | null,
  ): Promise<ContextAnalysisResult> {
    const startTime = Date.now();
    this.logger.info('AIContextAnalyzer', `Starting context analysis`);

    // ── Gather all calls for confidence scoring ───────────────────────────
    const allLots:  LotData[]        = platResult.lots;
    const perimCalls: P3BoundaryCall[] = platResult.perimeterCalls;

    // Compute base confidence from symbolic counts
    const baseConfidence = computeConfidenceSummary(allLots, perimCalls);

    // ── Build seed discrepancies from reconciliation conflicts ─────────────
    const seedDiscrepancies = this.buildSeedDiscrepancies(reconciliationResult);

    // ── Build context prompt ───────────────────────────────────────────────
    const prompt = this.buildContextPrompt(
      platResult,
      deedResults,
      harvestSummary,
      baseConfidence,
      reconciliationResult,
    );

    // ── Run AI context analysis ────────────────────────────────────────────
    const tracker = this.logger.startAttempt({
      layer:  'AIContextAnalyzer',
      source: 'Claude',
      method: 'context-analysis',
      input:  `${allLots.length} lots, ${perimCalls.length} perimeter calls`,
    });

    let aiResult: Awaited<ReturnType<typeof this.callContextAI>> | null = null;
    try {
      aiResult = await this.callContextAI(prompt);
      tracker({ status: 'success', dataPointsFound: aiResult.discrepancies.length });
    } catch (err) {
      tracker({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
      this.logger.error('AIContextAnalyzer', 'Context AI call failed', err);
      // Use fallback values
      aiResult = this.fallbackContextResult();
    }

    // ── Merge seed discrepancies with AI-found discrepancies ──────────────
    const allDiscrepancies = this.mergeDiscrepancies(seedDiscrepancies, aiResult.discrepancies);

    // ── Assemble final confidence summary ─────────────────────────────────
    const confidenceSummary: PropertyIntelligence['confidenceSummary'] = {
      ...baseConfidence,
      biggestGap:        aiResult.biggestGap,
      recommendedAction: aiResult.recommendedAction,
      documentRecommendations: aiResult.documentRecommendations,
    };

    const durationMs = Date.now() - startTime;
    this.logger.info(
      'AIContextAnalyzer',
      `Context analysis complete: type=${aiResult.propertyType}, ` +
      `${allDiscrepancies.length} discrepancies, ` +
      `confidence=${confidenceSummary.overall}% (${confidenceSummary.rating}), ` +
      `${durationMs}ms`,
    );

    return {
      propertyType:             aiResult.propertyType,
      propertyTypeReasoning:    aiResult.propertyTypeReasoning,
      discrepancies:            allDiscrepancies,
      adjacentPropertyPriority: aiResult.adjacentPropertyPriority,
      historicalContext:         aiResult.historicalContext,
      redFlags:                  aiResult.redFlags,
      dataQualityNotes:          aiResult.dataQualityNotes,
      biggestGap:                aiResult.biggestGap,
      recommendedAction:         aiResult.recommendedAction,
      confidenceSummary,
      totalApiCalls:             1,
    };
  }

  // ── Private: build context prompt ─────────────────────────────────────

  private buildContextPrompt(
    platResult: PlatAnalysisResult,
    deedResults: DeedAnalysisResult[],
    harvest: HarvestResult,
    confidence: ReturnType<typeof computeConfidenceSummary>,
    recon: ReconciliationResult | null | undefined,
  ): string {
    const lotNames = platResult.lots.map(l => l.name).join(', ') || 'None extracted';
    const adjOwners = platResult.adjacentOwners.map(a => `${a.name} (${a.direction})`).join(', ') || 'None extracted';
    const roads = platResult.roads.map(r => r.name).join(', ') || 'None found';

    // Deed summary
    const deedLines: string[] = [];
    for (const d of deedResults) {
      deedLines.push(
        `  - ${d.grantor || '(unknown grantor)'} → ${d.grantee || '(unknown grantee)'} ` +
        `[${d.instrumentNumber ?? 'no inst#'}] ${d.deedDate ?? 'date unknown'} ` +
        `${d.calledAcreage ? `(${d.calledAcreage} ac)` : ''}`,
      );
    }
    const deedSummary = deedLines.join('\n') || '  No deed data extracted';

    // Harvest summary
    const totalDocs =
      harvest.documents.target.deeds.length +
      harvest.documents.target.plats.length +
      harvest.documents.target.easements.length +
      harvest.documents.target.restrictions.length;
    const harvestSummary =
      `${totalDocs} documents available: ` +
      `${harvest.documents.target.plats.length} plats, ` +
      `${harvest.documents.target.deeds.length} deeds, ` +
      `${harvest.documents.target.easements.length} easements, ` +
      `${harvest.documents.target.restrictions.length} restrictions. ` +
      `${harvest.documentIndex.totalPagesAvailableForPurchase} pages available for purchase ` +
      `(est. $${harvest.documentIndex.estimatedPurchaseCost.toFixed(2)}).`;

    // Reconciliation conflicts
    const conflictLines: string[] = [];
    if (recon?.bearingConflicts && recon.bearingConflicts.length > 0) {
      for (const c of recon.bearingConflicts.slice(0, 10)) {
        conflictLines.push(`  Seq ${c.sequence} [${c.severity}]: ${c.description}`);
        if (c.candidates.length > 0) conflictLines.push(`    Candidates: ${c.candidates.join(', ')}`);
      }
    } else {
      conflictLines.push('  No bearing conflicts detected');
    }

    return CONTEXT_ANALYSIS_PROMPT
      .replace('{TOTAL_LOTS}',      String(platResult.lots.length))
      .replace('{LOT_NAMES}',       lotNames)
      .replace('{ADJACENT_OWNERS}', adjOwners)
      .replace('{ROADS}',           roads)
      .replace('{TOTAL_CALLS}',     String(confidence.totalCalls))
      .replace('{CONFIRMED}',       String(confidence.confirmedCalls))
      .replace('{DEDUCED}',         String(confidence.deducedCalls))
      .replace('{UNCONFIRMED}',     String(confidence.unconfirmedCalls))
      .replace('{DISCREPANCY}',     String(confidence.discrepancyCalls))
      .replace('{CRITICAL}',        String(confidence.criticalCalls))
      .replace('{DEED_SUMMARY}',    deedSummary)
      .replace('{HARVEST_SUMMARY}', harvestSummary)
      .replace('{CONFLICTS}',       conflictLines.join('\n'));
  }

  // ── Private: call Claude for context analysis ──────────────────────────

  private async callContextAI(prompt: string): Promise<{
    propertyType: PropertyIntelligence['property']['propertyType'];
    propertyTypeReasoning: string;
    redFlags: string[];
    historicalContext: string;
    adjacentPropertyPriority: string[];
    dataQualityNotes: string;
    biggestGap: string;
    recommendedAction: string;
    documentRecommendations: PropertyIntelligence['confidenceSummary']['documentRecommendations'];
    discrepancies: Discrepancy[];
  }> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const response = await client.messages.create({
      model:      AI_MODEL,
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(c => c.type === 'text');
    // Log a warning if the model returned no text block (e.g. stop_reason=tool_use)
    if (!textBlock || textBlock.type !== 'text') {
      this.logger.warn(
        'AIContextAnalyzer',
        `AI returned no text block (stop_reason: ${response.stop_reason ?? 'unknown'}) — using fallback values`,
      );
      return this.fallbackContextResult();
    }
    const raw = textBlock.text;

    // Strip markdown fences
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch (parseErr) {
      // Log the raw response (truncated) for troubleshooting
      const preview = cleaned.length > MAX_ERROR_PREVIEW_LENGTH ? `${cleaned.slice(0, MAX_ERROR_PREVIEW_LENGTH)}…` : cleaned;
      this.logger.warn(
        'AIContextAnalyzer',
        `AI response JSON parse error (${parseErr instanceof Error ? parseErr.message : String(parseErr)}) — using fallback values. Raw preview: ${preview}`,
      );
      return this.fallbackContextResult();
    }

    return {
      propertyType:             this.parsePropertyType(parsed.propertyType),
      propertyTypeReasoning:    this.safeStr(parsed.propertyTypeReasoning) ?? '',
      redFlags:                 this.parseStringArray(parsed.redFlags),
      historicalContext:         this.safeStr(parsed.historicalContext) ?? '',
      adjacentPropertyPriority: this.parseStringArray(parsed.adjacentPropertyPriority),
      dataQualityNotes:          this.safeStr(parsed.dataQualityNotes) ?? '',
      biggestGap:                this.safeStr(parsed.biggestGap) ?? '',
      recommendedAction:         this.safeStr(parsed.recommendedAction) ?? '',
      documentRecommendations:   this.parseDocRecommendations(parsed.documentRecommendations),
      discrepancies:             this.parseDiscrepancies(parsed.discrepancies),
    };
  }

  // ── Private: build seed discrepancies from reconciliation conflicts ─────

  private buildSeedDiscrepancies(
    recon: ReconciliationResult | null | undefined,
  ): Discrepancy[] {
    if (!recon?.bearingConflicts || recon.bearingConflicts.length === 0) return [];

    return recon.bearingConflicts.map((c, i) => {
      const id = `DISC-${String(i + 1).padStart(3, '0')}`;
      const severity: Discrepancy['severity'] =
        c.severity === 'critical' ? 'critical' :
        c.severity === 'high'     ? 'moderate' :
        c.severity === 'medium'   ? 'moderate' : 'minor';

      return {
        id,
        severity,
        category:       'bearing_conflict' as const,
        description:    c.description,
        affectedCalls:  [],  // Will be linked by AIDocumentAnalyzer
        affectedLots:   [],
        readings:        c.candidates.map(v => ({ source: 'plat', value: v })),
        likelyCorrect:  recon.recommendations.find(r => r.sequence === c.sequence)?.recommendedValue,
        basis:          recon.recommendations.find(r => r.sequence === c.sequence)?.reasoning,
        resolution:     'Verify bearing by measuring geometric angle on original plat drawing or purchasing clean copy',
      };
    });
  }

  // ── Private: merge discrepancy lists (no duplicates) ──────────────────

  private mergeDiscrepancies(seed: Discrepancy[], ai: Discrepancy[]): Discrepancy[] {
    // Re-number all IDs to be sequential and non-conflicting
    const all = [...seed, ...ai];
    return all.map((d, i) => ({
      ...d,
      id: `DISC-${String(i + 1).padStart(3, '0')}`,
    }));
  }

  // ── Private: fallback values when AI call fails ────────────────────────

  private fallbackContextResult() {
    return {
      propertyType:             'unknown' as const,
      propertyTypeReasoning:    'Context analysis unavailable — AI call failed',
      redFlags:                  [] as string[],
      historicalContext:         '',
      adjacentPropertyPriority:  [] as string[],
      dataQualityNotes:          'Context analysis unavailable',
      biggestGap:                'AI context analysis failed — manual review required',
      recommendedAction:         'Review extracted data manually; retry context analysis',
      documentRecommendations:   [] as PropertyIntelligence['confidenceSummary']['documentRecommendations'],
      discrepancies:             [] as Discrepancy[],
    };
  }

  // ── Private: type-safe parsers ────────────────────────────────────────

  private parsePropertyType(val: unknown): PropertyIntelligence['property']['propertyType'] {
    const valid = ['subdivision', 'standalone_tract', 'lot_in_subdivision', 'unknown'] as const;
    if (typeof val === 'string' && (valid as readonly string[]).includes(val)) {
      return val as PropertyIntelligence['property']['propertyType'];
    }
    return 'unknown';
  }

  private parseStringArray(val: unknown): string[] {
    if (!Array.isArray(val)) return [];
    return val.filter(s => typeof s === 'string' && s.trim().length > 0) as string[];
  }

  private safeStr(val: unknown): string | undefined {
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    return undefined;
  }

  private parseDocRecommendations(
    val: unknown,
  ): PropertyIntelligence['confidenceSummary']['documentRecommendations'] {
    if (!Array.isArray(val)) return [];
    return val.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const obj = item as Record<string, unknown>;
      const document = this.safeStr(obj.document);
      const source   = this.safeStr(obj.source);
      if (!document) return [];
      const priority = obj.priority === 'high' ? 'high' :
                       obj.priority === 'low'  ? 'low'  : 'medium';
      return [{
        document,
        source:            source ?? 'County Clerk',
        estimatedPrice:    typeof obj.estimatedPrice === 'number' ? obj.estimatedPrice : 5.0,
        confidenceImpact:  this.safeStr(obj.confidenceImpact) ?? 'unknown',
        priority,
      }];
    });
  }

  private parseDiscrepancies(val: unknown): Discrepancy[] {
    if (!Array.isArray(val)) return [];
    return val.flatMap((item, i) => {
      if (!item || typeof item !== 'object') return [];
      const obj = item as Record<string, unknown>;

      const severities = ['critical', 'moderate', 'minor', 'informational'] as const;
      const categories = ['bearing_conflict', 'distance_conflict', 'area_conflict', 'datum_shift', 'missing_data', 'road_geometry', 'monument_conflict', 'other'] as const;

      const severity = (severities as readonly string[]).includes(obj.severity as string)
        ? obj.severity as Discrepancy['severity']
        : 'informational';
      const category = (categories as readonly string[]).includes(obj.category as string)
        ? obj.category as Discrepancy['category']
        : 'other';

      const description = this.safeStr(obj.description);
      if (!description) return [];

      return [{
        id:             this.safeStr(obj.id) ?? `AI-DISC-${i + 1}`,
        severity,
        category,
        description,
        affectedCalls:  this.parseStringArray(obj.affectedCalls),
        affectedLots:   this.parseStringArray(obj.affectedLots),
        readings:       this.parseReadings(obj.readings),
        likelyCorrect:  this.safeStr(obj.likelyCorrect),
        basis:          this.safeStr(obj.basis),
        resolution:     this.safeStr(obj.resolution) ?? 'Manual review required',
      }];
    });
  }

  private parseReadings(val: unknown): Discrepancy['readings'] {
    if (!Array.isArray(val)) return [];
    return val.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const obj = item as Record<string, unknown>;
      const source = this.safeStr(obj.source);
      const value  = this.safeStr(obj.value);
      if (!source || !value) return [];
      return [{ source, value }];
    });
  }
}
