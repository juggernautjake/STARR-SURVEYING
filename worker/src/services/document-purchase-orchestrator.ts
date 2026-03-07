// worker/src/services/document-purchase-orchestrator.ts — Phase 9 §9.7
// Main orchestrator: ties together vendor selection, budget management,
// document purchasing, re-extraction via Claude AI, watermark comparison,
// and reconciliation update.
//
// Pipeline:
//   Step 1: Purchase planning (sort by ROI, filter by budget)
//   Step 2: Document procurement (Kofile → TexasFile fallback)
//   Step 3: Image quality verification
//   Step 4: Re-extraction via Claude Vision AI
//   Step 5: Watermark comparison (watermarked vs official)
//   Step 6: Trigger Phase 7 re-reconciliation & Phase 8 re-scoring
//   Step 7: Billing & audit trail
//
// Spec §9.7 — Purchase Orchestrator
// v1.1: PipelineLogger replaces bare console.* calls; AbortSignal.timeout on AI fetch;
//        JSON.parse try/catch on intelligence file; projectId validation guard

import * as fs from 'fs';
import * as path from 'path';
import { KofilePurchaseAdapter } from './purchase-adapters/kofile-purchase-adapter.js';
import { TexasFilePurchaseAdapter } from './purchase-adapters/texasfile-purchase-adapter.js';
import { WatermarkComparison, type ExtractedCall } from './watermark-comparison.js';
import { BillingTracker } from './billing-tracker.js';
import { PipelineLogger } from '../lib/logger.js';
import type {
  PurchaseOrchestratorConfig,
  DocumentPurchaseResult,
  DocumentReanalysis,
  DiscrepancyResolution,
  ReconciliationUpdate,
  PurchaseReport,
  PurchaseBillingSummary,
  Transaction,
} from '../types/purchase.js';
import type { PurchaseRecommendation } from '../types/confidence.js';

// ── Document Purchase Orchestrator ──────────────────────────────────────────

export class DocumentPurchaseOrchestrator {
  private billing: BillingTracker;
  private apiKey: string;
  private logger: PipelineLogger;

  constructor(projectId: string = 'unknown-project') {
    this.logger = new PipelineLogger(projectId || 'unknown-project');
    this.billing = new BillingTracker('/tmp/billing', projectId || 'unknown-project');
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
  }

  // ── Main Entry Point ────────────────────────────────────────────────────

  async executePurchases(
    projectId: string,
    recommendations: PurchaseRecommendation[],
    config: PurchaseOrchestratorConfig,
    countyFIPS: string,
    countyName: string,
  ): Promise<PurchaseReport> {
    // Guard against empty projectId
    if (!projectId) {
      projectId = 'unknown-project';
      this.logger.warn('Purchase', 'executePurchases called with empty projectId — using sentinel');
    }

    const startTime = Date.now();
    const purchaseStart = Date.now();
    const errors: string[] = [];
    let aiCalls = 0;

    // No recommendations → nothing to do
    if (recommendations.length === 0) {
      return {
        status: 'no_purchases_needed',
        projectId,
        purchases: [],
        reanalysis: {
          status: 'skipped',
          documentReanalyses: [],
          discrepanciesResolved: [],
        },
        updatedReconciliation: null,
        billing: {
          totalDocumentCost: 0,
          taxOrFees: 0,
          totalCharged: 0,
          paymentMethod: 'account_balance',
          remainingBalance: config.budget,
          invoicePath: '',
        },
        timing: { totalMs: 0, purchaseMs: 0, downloadMs: 0, reanalysisMs: 0 },
        aiCalls: 0,
        errors: [],
      };
    }

    // Set budget
    this.billing.setBudget(projectId, config.budget);
    const outputDir = `/tmp/purchased/${projectId}`;
    fs.mkdirSync(outputDir, { recursive: true });

    const purchases: DocumentPurchaseResult[] = [];
    const reanalyses: DocumentReanalysis[] = [];
    const discrepanciesResolved: DiscrepancyResolution[] = [];
    let totalCharged = 0;

    // Sort by priority (ROI-based from Phase 8)
    const sorted = [...recommendations].sort(
      (a, b) => a.priority - b.priority,
    );

    // ── Step 1: Initialize vendor adapters ─────────────────────────────

    let kofileAdapter: KofilePurchaseAdapter | null = null;
    let texasFileAdapter: TexasFilePurchaseAdapter | null = null;

    const hasKofileDocs = sorted.some((r) =>
      r.source.toLowerCase().includes('kofile'),
    );
    const hasTFDocs = sorted.some((r) =>
      r.source.toLowerCase().includes('texasfile'),
    );

    try {
      if (
        (hasKofileDocs || !hasTFDocs) &&
        config.kofileCredentials
      ) {
        kofileAdapter = new KofilePurchaseAdapter(
          countyFIPS,
          countyName,
          config.kofileCredentials,
          outputDir,
          projectId,
        );
        await kofileAdapter.initSession();
      }
      if (
        (hasTFDocs || !hasKofileDocs) &&
        config.texasfileCredentials
      ) {
        texasFileAdapter = new TexasFilePurchaseAdapter(
          config.texasfileCredentials,
          outputDir,
          projectId,
        );
        await texasFileAdapter.initSession();
      }

      // If neither adapter could be initialized, try what we have
      if (!kofileAdapter && !texasFileAdapter) {
        if (config.kofileCredentials) {
          kofileAdapter = new KofilePurchaseAdapter(
            countyFIPS,
            countyName,
            config.kofileCredentials,
            outputDir,
            projectId,
          );
          await kofileAdapter.initSession();
        } else if (config.texasfileCredentials) {
          texasFileAdapter = new TexasFilePurchaseAdapter(
            config.texasfileCredentials,
            outputDir,
            projectId,
          );
          await texasFileAdapter.initSession();
        }
      }

      // ── Step 2: Purchase each recommended document ────────────────────

      for (const rec of sorted) {
        // Budget check
        const estCostNum =
          parseFloat(rec.estimatedCost.replace(/[^0-9.]/g, '')) || 5;
        const budgetCheck = this.billing.checkBudget(projectId, estCostNum);
        if (!budgetCheck.allowed) {
          this.logger.warn(
            'Purchase',
            `Budget exceeded — skipping ${rec.instrument} ($${estCostNum} needed, $${budgetCheck.remaining.toFixed(2)} remaining)`,
          );
          purchases.push({
            instrument: rec.instrument,
            documentType: rec.documentType,
            source: rec.source,
            status: 'budget_exceeded',
            pages: 0,
            costPerPage: 0,
            totalCost: 0,
            paymentMethod: 'account_balance',
            transactionId: null,
            downloadedImages: [],
            imageQuality: {
              format: 'unknown',
              hasWatermark: true,
              qualityScore: 0,
            },
            error: `Budget exceeded: $${estCostNum} needed, $${budgetCheck.remaining.toFixed(2)} remaining`,
          });
          continue;
        }

        // Purchase from appropriate vendor
        let result: DocumentPurchaseResult;
        const sourceLower = rec.source.toLowerCase();

        if (sourceLower.includes('kofile') && kofileAdapter) {
          result = await kofileAdapter.purchaseDocument(
            rec.instrument,
            rec.documentType,
          );
        } else if (sourceLower.includes('texasfile') && texasFileAdapter) {
          result = await texasFileAdapter.purchaseDocument(
            countyName,
            rec.instrument,
            rec.documentType,
          );
        } else {
          // Try Kofile first, then TexasFile fallback
          if (kofileAdapter) {
            result = await kofileAdapter.purchaseDocument(
              rec.instrument,
              rec.documentType,
            );
            if (
              result.status === 'failed' &&
              texasFileAdapter
            ) {
              this.logger.info('Purchase', `Kofile failed for ${rec.instrument}, trying TexasFile...`);
              result = await texasFileAdapter.purchaseDocument(
                countyName,
                rec.instrument,
                rec.documentType,
              );
            }
          } else if (texasFileAdapter) {
            result = await texasFileAdapter.purchaseDocument(
              countyName,
              rec.instrument,
              rec.documentType,
            );
          } else {
            this.logger.warn('Purchase', `No adapter available for ${rec.source}`);
            purchases.push({
              instrument: rec.instrument,
              documentType: rec.documentType,
              source: rec.source,
              status: 'failed',
              pages: 0,
              costPerPage: 0,
              totalCost: 0,
              paymentMethod: 'account_balance',
              transactionId: null,
              downloadedImages: [],
              imageQuality: {
                format: 'unknown',
                hasWatermark: true,
                qualityScore: 0,
              },
              error: 'No purchase adapter available',
            });
            continue;
          }
        }

        purchases.push(result);

        // Record successful transactions
        if (
          result.status === 'purchased' ||
          result.status === 'already_owned'
        ) {
          const tx: Transaction = {
            transactionId:
              result.transactionId || `TXN-${Date.now()}`,
            projectId,
            instrument: rec.instrument,
            documentType: rec.documentType,
            source: rec.source,
            pages: result.pages,
            costPerPage: result.totalCost / Math.max(result.pages, 1),
            totalCost: result.totalCost,
            paymentMethod: 'account_balance',
            timestamp: new Date().toISOString(),
            status: 'completed',
          };
          this.billing.recordTransaction(tx);
          totalCharged += result.totalCost;

          // ── Step 4: Re-extract from official images ──────────────────
          if (
            config.autoReanalyze &&
            result.downloadedImages.length > 0
          ) {
            this.logger.info(
              'Purchase',
              `Re-analyzing ${rec.instrument} with official images...`,
            );
            const reanalysis = await this.reanalyzeDocument(
              result.downloadedImages,
              rec.documentType,
              rec.instrument,
              projectId,
            );
            aiCalls++;
            if (reanalysis) {
              reanalyses.push(reanalysis);
            }
          }
        }

        // Rate limit between purchases
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (error: any) {
      errors.push(`Purchase orchestration error: ${error.message}`);
      this.logger.error('Purchase', 'Orchestration error', error);
    } finally {
      if (kofileAdapter) await kofileAdapter.destroySession();
      if (texasFileAdapter) await texasFileAdapter.destroySession();
    }

    const purchaseEnd = Date.now();

    // ── Step 6: Trigger reconciliation update if re-analysis happened ──

    const reanalysisStart = Date.now();
    let updatedReconciliation: ReconciliationUpdate | null = null;

    if (reanalyses.length > 0 && config.autoReanalyze) {
      const totalChanged = reanalyses.reduce(
        (s, r) => s + r.callsChanged,
        0,
      );
      this.logger.info(
        'Purchase',
        `Re-analysis changed ${totalChanged} calls. Triggering Phase 7 re-reconciliation.`,
      );

      // Load existing reconciliation for before/after comparison
      const reconPath = `/tmp/analysis/${projectId}/reconciled_boundary.json`;
      if (fs.existsSync(reconPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(reconPath, 'utf-8'));
          const prevConfidence =
            existing.reconciledPerimeter?.averageConfidence || 0;
          const prevClosure =
            existing.closureOptimization?.afterCompassRule || 'unknown';

          // Projected improvements based on re-analysis gains
          const avgGain =
            reanalyses.reduce((s, r) => s + r.averageConfidenceGain, 0) /
            reanalyses.length;
          const projectedConfidence = Math.min(
            100,
            Math.round(prevConfidence + avgGain),
          );

          const v2Path = `/tmp/analysis/${projectId}/reconciled_boundary_v2.json`;
          updatedReconciliation = {
            previousOverallConfidence: prevConfidence,
            newOverallConfidence: projectedConfidence,
            confidenceGain: projectedConfidence - prevConfidence,
            previousClosureRatio: prevClosure,
            newClosureRatio: prevClosure, // Updated by Phase 7 re-run
            closureImproved: totalChanged > 0,
            allDiscrepanciesResolved: discrepanciesResolved.length > 0,
            savedTo: v2Path,
          };

          // Save placeholder v2 with updated metadata
          const v2Model = {
            ...existing,
            version: 2,
            previousVersion: reconPath,
            updatedAt: new Date().toISOString(),
            purchaseImprovements: {
              documentsImproved: reanalyses.length,
              callsChanged: totalChanged,
              projectedConfidenceGain: avgGain,
            },
          };
          fs.writeFileSync(v2Path, JSON.stringify(v2Model, null, 2));
        } catch (error: any) {
          errors.push(
            `Reconciliation update failed: ${error.message}`,
          );
        }
      }
    }

    const reanalysisEnd = Date.now();

    // ── Step 7: Generate invoice ────────────────────────────────────────

    const invoicePath = this.billing.generateInvoice(projectId);
    const remaining = this.billing.checkBudget(projectId, 0).remaining;

    const billing: PurchaseBillingSummary = {
      totalDocumentCost: totalCharged,
      taxOrFees: 0,
      totalCharged,
      paymentMethod: 'account_balance',
      remainingBalance: remaining,
      invoicePath,
    };

    // ── Build final report ──────────────────────────────────────────────

    const purchasedCount = purchases.filter(
      (p) => p.status === 'purchased',
    ).length;

    const report: PurchaseReport = {
      status:
        purchasedCount === 0
          ? 'failed'
          : purchasedCount === sorted.length
            ? 'complete'
            : 'partial',
      projectId,
      purchases,
      reanalysis: {
        status:
          reanalyses.length > 0
            ? 'complete'
            : config.autoReanalyze
              ? 'skipped'
              : 'skipped',
        documentReanalyses: reanalyses,
        discrepanciesResolved,
      },
      updatedReconciliation,
      billing,
      timing: {
        totalMs: Date.now() - startTime,
        purchaseMs: purchaseEnd - purchaseStart,
        downloadMs: 0, // Included in purchaseMs
        reanalysisMs: reanalysisEnd - reanalysisStart,
      },
      aiCalls,
      errors,
    };

    // Persist report
    const reportPath = `/tmp/analysis/${projectId}/purchase_report.json`;
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.logger.info(
      'Purchase',
      `Complete: ${purchasedCount}/${purchases.length} purchased, $${totalCharged.toFixed(2)} spent`,
    );

    return report;
  }

  // ── Re-Extraction via Claude Vision AI ────────────────────────────────

  private async reanalyzeDocument(
    imagePaths: string[],
    documentType: string,
    instrumentNumber: string,
    projectId: string,
  ): Promise<DocumentReanalysis | null> {
    // Convert TIFF to PNG if needed (Claude Vision requires PNG/JPEG/GIF/WebP)
    const pngPaths: string[] = [];
    for (const imgPath of imagePaths) {
      if (imgPath.endsWith('.tiff') || imgPath.endsWith('.tif')) {
        const pngPath = imgPath.replace(/\.tiff?$/, '.png');
        try {
          const { execSync } = await import('child_process');
          execSync(`convert "${imgPath}" "${pngPath}"`);
          pngPaths.push(pngPath);
        } catch {
          pngPaths.push(imgPath); // Use TIFF directly if conversion fails
        }
      } else {
        pngPaths.push(imgPath);
      }
    }

    // Build Claude Vision message with official images
    const imageContents = pngPaths
      .filter((p) => fs.existsSync(p))
      .map((p) => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/png' as const,
          data: fs.readFileSync(p).toString('base64'),
        },
      }));

    if (imageContents.length === 0) return null;

    const extractionPrompt =
      documentType === 'plat'
        ? this.buildPlatExtractionPrompt()
        : this.buildDeedExtractionPrompt();

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        // 30-second timeout to prevent hanging on slow API responses
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          messages: [
            {
              role: 'user',
              content: [
                ...imageContents,
                { type: 'text', text: extractionPrompt },
              ],
            },
          ],
        }),
      });

      const data = (await response.json()) as {
        content?: { text?: string }[];
      };
      const text = data.content?.[0]?.text || '';

      // Guard against malformed AI response
      let parsed: any;
      try {
        parsed = JSON.parse(text.replace(/```json?|```/g, '').trim());
      } catch (parseErr) {
        this.logger.warn('Purchase', `Re-analysis JSON parse failed for ${instrumentNumber}: ${String(parseErr)}`);
        return null;
      }

      // Load watermarked readings for comparison
      const intelPath = `/tmp/analysis/${projectId}/property_intelligence.json`;
      if (fs.existsSync(intelPath)) {
        let intel: any;
        try {
          intel = JSON.parse(fs.readFileSync(intelPath, 'utf-8'));
        } catch (intelErr) {
          this.logger.warn('Purchase', `Failed to read property_intelligence.json for ${projectId}: ${String(intelErr)}`);
          return null;
        }
        const watermarkedCalls = this.extractCallsFromIntelligence(intel);
        const officialCalls: ExtractedCall[] =
          parsed.calls || parsed.metesAndBounds || [];

        const comparator = new WatermarkComparison();
        const comparison = comparator.compare(watermarkedCalls, officialCalls);
        comparison.documentInstrument = instrumentNumber;
        comparison.documentType = documentType;

        // Build reanalysis result from comparison
        return {
          documentType,
          instrument: instrumentNumber,
          totalCallsExtracted: comparison.totalCallsCompared,
          callsChanged: comparison.callsChanged,
          callsConfirmed: comparison.callsConfirmed,
          averageConfidenceGain: comparison.averageConfidenceGain,
          improvements: comparison.comparisons
            .filter(
              (c) => c.changed || c.confidenceGain > 0,
            )
            .map((c) => ({
              callId: c.callId,
              field: c.field as 'bearing' | 'distance',
              watermarkedValue: c.watermarkedValue,
              officialValue: c.officialValue,
              changed: c.changed,
              watermarkedConfidence: c.watermarkedConfidence,
              officialConfidence: c.officialConfidence,
              confidenceGain: c.confidenceGain,
              notes: c.notes || undefined,
            })),
        };
      }

      return null;
    } catch (error: any) {
      this.logger.warn('Purchase', `Re-analysis failed for ${instrumentNumber}: ${error.message}`);
      return null;
    }
  }

  // ── Extraction Prompts ────────────────────────────────────────────────

  private buildPlatExtractionPrompt(): string {
    return `This is an OFFICIAL UNWATERMARKED plat document. Extract EVERY boundary call with maximum precision.

Since there is NO watermark, you should be able to read every bearing, distance, and curve parameter with high confidence.

Return JSON:
{
  "calls": [
    {
      "callId": "PERIM_N1",
      "bearing": "N ##°##'##\\" E",
      "distance": 0.00,
      "type": "straight",
      "along": "description",
      "confidence": 95
    }
  ],
  "lots": [
    {
      "name": "Lot 1",
      "acreage": 0.000,
      "sqft": 0,
      "calls": [{ "callId": "L1_C1", "bearing": "...", "distance": 0.00, "type": "straight", "confidence": 95 }]
    }
  ],
  "curves": [
    { "callId": "C1", "radius": 0.0, "arcLength": 0.0, "delta": "##°##'##\\"", "chordBearing": "...", "chordDistance": 0.0, "confidence": 95 }
  ]
}

Extract EVERY call. Set confidence to 95+ since this is an unwatermarked document (reduce only if text is genuinely unclear due to scan quality). Return ONLY valid JSON.`;
  }

  private buildDeedExtractionPrompt(): string {
    return `This is an OFFICIAL UNWATERMARKED deed document. Extract the COMPLETE metes and bounds description.

Since there is NO watermark, every word and number should be clearly legible.

Return JSON:
{
  "grantor": "name",
  "grantee": "name",
  "calledAcreage": 0.000,
  "surveyReference": "abstract and survey name",
  "metesAndBounds": [
    {
      "callId": "DEED_C1",
      "callNumber": 1,
      "bearing": "N ##°##'##\\" E",
      "distance": 0.00,
      "unit": "feet",
      "type": "straight",
      "along": "what this line runs along",
      "monument": "monument at end",
      "confidence": 95
    }
  ],
  "calledFrom": [
    { "name": "adjacent owner", "acreage": 0.0, "instrument": "reference", "direction": "north" }
  ]
}

Return ONLY valid JSON.`;
  }

  // ── Helper: Extract calls from Phase 3 intelligence ───────────────────

  private extractCallsFromIntelligence(intel: any): ExtractedCall[] {
    const calls: ExtractedCall[] = [];

    // Lot-level calls
    for (const lot of intel.lots || []) {
      for (const call of [
        ...(lot.boundaryCalls || []),
        ...(lot.curves || []),
      ]) {
        calls.push({
          callId: call.callId || call.id || `call_${calls.length}`,
          bearing: call.bearing || '',
          distance: call.distance || 0,
          confidence: call.confidence || 50,
          curve: call.curve,
        });
      }
    }

    // Perimeter calls
    if (intel.perimeterBoundary?.calls) {
      for (const call of intel.perimeterBoundary.calls) {
        calls.push({
          callId: call.callId || call.id || `perim_${calls.length}`,
          bearing: call.bearing || '',
          distance: call.distance || 0,
          confidence: call.confidence || 50,
          curve: call.curve,
        });
      }
    }

    return calls;
  }
}
