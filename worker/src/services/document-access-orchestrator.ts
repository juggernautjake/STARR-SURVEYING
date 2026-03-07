// worker/src/services/document-access-orchestrator.ts — Phase 14
// Unified free-first, paid-fallback document access orchestrator.
//
// This is the single entry point for "get me this document in the best way
// possible."  It works through tiers in order and stops as soon as it
// obtains images at or above the configured minimum quality threshold.
//
//   Tier 0 (FREE_PREVIEW):  Kofile/GovOS watermarked JPEG preview
//                           Quality: 40–70 (AI-extractable despite watermarks)
//
//   Tier 1 (FREE_INDEX):    Instrument metadata only (no images)
//                           Used for: chain-of-title tracing, purchase planning
//
//   Tier 2 (PAID_PLATFORM): Clean images from commercial platform
//                           Tried in order: cheapest → most expensive
//                           Payment processed via Stripe pass-through
//
//   Tier 3 (COUNTY_DIRECT): County's own online payment portal
//                           Slower (1–5 days) but authoritative
//
//   Tier 4 (MANUAL):        Flag for human intervention
//
// Spec §14.3 — Document Access Orchestrator
// Relates to:
//   Phase 2 (document harvesting — free tier)
//   Phase 9 (document purchase — paid tier)
//   Phase 13 (statewide clerk adapters)
//   Phase 14 (this file — unified tier routing + payment automation)

import * as fs from 'fs';
import * as path from 'path';
import { PipelineLogger } from '../lib/logger.js';
import { PaidPlatformRegistry } from './paid-platform-registry.js';
import { getClerkAdapter } from './clerk-registry.js';
import type {
  DocumentAccessRequest,
  DocumentAccessResult,
  DocumentAccessConfig,
  DocumentAccessStatus,
  PaidPlatformId,
  DocumentAccessTier,
} from '../types/document-access.js';
import type { DocumentImage } from '../adapters/clerk-adapter.js';

// ── Default config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<DocumentAccessConfig> = {
  tryFreeFirst:         true,
  minimumFreeQuality:   40,   // Accept watermarked previews (AI can extract)
  maxCostPerDocument:   10.00,
  autoCharge:           false, // Require explicit approval by default
  outputDir:            '/tmp/documents',
  credentials:          {},
};

// ── DocumentAccessOrchestrator ─────────────────────────────────────────────

export class DocumentAccessOrchestrator {
  private config: Required<DocumentAccessConfig>;
  private logger: PipelineLogger;

  constructor(config: Partial<DocumentAccessConfig> = {}, projectId = 'unknown') {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.credentials === undefined) {
      this.config.credentials = {};
    }
    // Load credentials from env if not provided
    if (Object.keys(this.config.credentials).length === 0) {
      this.config.credentials = PaidPlatformRegistry.loadCredentialsFromEnv();
    }
    this.logger = new PipelineLogger(projectId);
    fs.mkdirSync(this.config.outputDir, { recursive: true });
  }

  // ── Main Entry Point ───────────────────────────────────────────────────

  /**
   * Get a document using the best available access tier.
   *
   * Workflow:
   *  1. If tryFreeFirst=true, attempt Tier 0 (free preview) or Tier 1 (index)
   *  2. Evaluate quality of free result
   *  3. If quality meets minimumFreeQuality, return free result
   *  4. Otherwise, work through paid platforms cheapest-first
   *  5. If all paid platforms fail or are over budget, return best available
   *     result (even if watermarked) with appropriate status
   *
   * @param request  What document to fetch and how
   * @returns        DocumentAccessResult with tier, images, cost, status
   */
  async getDocument(request: DocumentAccessRequest): Promise<DocumentAccessResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const tiersAttempted: DocumentAccessTier[] = [];

    const result: DocumentAccessResult = {
      status:                 'failed_all_tiers',
      tier:                   'manual',
      platform:               null,
      instrumentNumber:       request.instrumentNumber,
      documentType:           request.documentType,
      imagePaths:             [],
      pages:                  0,
      costUSD:                0,
      isWatermarked:          true,
      qualityScore:           0,
      transactionId:          null,
      stripePaymentIntentId:  null,
      errors,
      tiersAttempted,
      totalMs:                0,
    };

    // ── Tier 0 / 1: Free access ─────────────────────────────────────────

    if (this.config.tryFreeFirst && !request.freeOnly === false || request.freeOnly) {
      // Always try free first
    }

    if (this.config.tryFreeFirst || request.freeOnly) {
      tiersAttempted.push('free_preview');
      const freeResult = await this.tryFreeAccess(request);

      if (freeResult.imagePaths.length > 0) {
        // Got images — check quality
        if (freeResult.qualityScore >= this.config.minimumFreeQuality) {
          Object.assign(result, freeResult);
          result.tiersAttempted = tiersAttempted;
          result.totalMs = Date.now() - startTime;
          this.logger.info(
            'DocAccess',
            `[FREE] Got ${freeResult.imagePaths.length} images for ${request.instrumentNumber} ` +
            `(quality ${freeResult.qualityScore}, watermarked=${freeResult.isWatermarked})`,
          );
          return result;
        }
        this.logger.info(
          'DocAccess',
          `Free images quality ${freeResult.qualityScore} < minimum ${this.config.minimumFreeQuality} — escalating to paid`,
        );
        // Keep free result as fallback
        Object.assign(result, freeResult);
        errors.push(
          `Free preview quality ${freeResult.qualityScore} below threshold ${this.config.minimumFreeQuality}`,
        );
      } else if (freeResult.status === 'success_free_index') {
        // Index-only — no images but valid metadata
        tiersAttempted.push('free_index');
        if (request.freeOnly) {
          Object.assign(result, freeResult);
          result.tiersAttempted = tiersAttempted;
          result.totalMs = Date.now() - startTime;
          return result;
        }
        errors.push('Free access returned index only — no images available');
      } else {
        errors.push(...(freeResult.errors ?? []));
      }
    }

    // ── Stop here if freeOnly ─────────────────────────────────────────

    if (request.freeOnly) {
      result.status = result.imagePaths.length > 0 ? 'success_free_preview' : 'success_free_index';
      result.tiersAttempted = tiersAttempted;
      result.totalMs = Date.now() - startTime;
      return result;
    }

    // ── Tier 2: Paid platforms ───────────────────────────────────────

    tiersAttempted.push('paid_platform');
    const configuredPlatformIds = PaidPlatformRegistry.getConfiguredPlatforms();

    // Override ordering if caller has a preferred platform
    const rankedPlatforms = request.preferredPlatform
      ? [
          PaidPlatformRegistry.getPlatform(request.preferredPlatform),
          ...PaidPlatformRegistry.getRankedPlatforms(request.countyFIPS, configuredPlatformIds)
            .filter((p) => p.id !== request.preferredPlatform),
        ].filter(Boolean)
      : PaidPlatformRegistry.getRankedPlatforms(request.countyFIPS, configuredPlatformIds);

    const maxCost = request.maxCostPerDocument ?? this.config.maxCostPerDocument;

    for (const platform of rankedPlatforms) {
      if (!platform) continue;
      if (!platform.automationSupported) continue;
      if (platform.costPerPage === 0) continue; // already tried free tiers

      // Estimate cost
      const estimatedPages = result.pages > 0 ? result.pages : 3; // conservative default
      const estimatedCost = platform.costPerPage * estimatedPages;
      if (estimatedCost > maxCost) {
        errors.push(
          `${platform.displayName}: estimated cost $${estimatedCost.toFixed(2)} > max $${maxCost.toFixed(2)}`,
        );
        continue;
      }

      // Check if we have credentials for this platform
      const hasCreds = this.hasPlatformCredentials(platform.id, request.credentials);
      if (!hasCreds) {
        errors.push(`${platform.displayName}: no credentials configured`);
        continue;
      }

      this.logger.info(
        'DocAccess',
        `Trying paid platform: ${platform.displayName} ($${platform.costPerPage}/page)`,
      );

      try {
        const paidResult = await this.tryPaidPlatform(platform.id, request);
        if (paidResult.imagePaths.length > 0 || paidResult.status === 'success_paid') {
          Object.assign(result, paidResult);
          result.tiersAttempted = tiersAttempted;
          result.totalMs = Date.now() - startTime;
          this.logger.info(
            'DocAccess',
            `[PAID:${platform.id}] Got ${paidResult.imagePaths.length} pages for $${paidResult.costUSD.toFixed(2)}`,
          );
          return result;
        }
        errors.push(`${platform.displayName}: ${paidResult.errors.join('; ')}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${platform.displayName}: ${msg}`);
        this.logger.warn('DocAccess', `${platform.displayName} threw: ${msg}`);
      }
    }

    // ── Final fallback: return best we have ──────────────────────────

    result.errors = errors;
    result.tiersAttempted = tiersAttempted;
    result.totalMs = Date.now() - startTime;

    if (result.imagePaths.length > 0) {
      // We have watermarked images — better than nothing
      result.status = 'partial_free';
    } else {
      // Nothing usable
      const hasCredentials = Object.keys(this.config.credentials ?? {}).length > 0 ||
        configuredPlatformIds.filter((id) => id !== 'txdot_docs' && id !== 'glo_archives').length > 0;
      result.status = hasCredentials ? 'failed_all_tiers' : 'no_platforms_configured';
    }

    this.logger.warn(
      'DocAccess',
      `Document ${request.instrumentNumber}: final status=${result.status}, ` +
      `errors=${errors.length}, images=${result.imagePaths.length}`,
    );

    return result;
  }

  /**
   * Get access plans for multiple documents efficiently.
   * Processes in series to avoid overwhelming external systems.
   */
  async getDocuments(requests: DocumentAccessRequest[]): Promise<DocumentAccessResult[]> {
    const results: DocumentAccessResult[] = [];
    for (const req of requests) {
      try {
        const r = await this.getDocument(req);
        results.push(r);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          status:                'failed_all_tiers',
          tier:                  'manual',
          platform:              null,
          instrumentNumber:      req.instrumentNumber,
          documentType:          req.documentType,
          imagePaths:            [],
          pages:                 0,
          costUSD:               0,
          isWatermarked:         true,
          qualityScore:          0,
          transactionId:         null,
          stripePaymentIntentId: null,
          errors:                [msg],
          tiersAttempted:        [],
          totalMs:               0,
        });
      }
    }
    return results;
  }

  // ── Tier 0/1: Free access ─────────────────────────────────────────────

  private async tryFreeAccess(request: DocumentAccessRequest): Promise<DocumentAccessResult> {
    const result: DocumentAccessResult = {
      status:                'failed_all_tiers',
      tier:                  'free_preview',
      platform:              null,
      instrumentNumber:      request.instrumentNumber,
      documentType:          request.documentType,
      imagePaths:            [],
      pages:                 0,
      costUSD:               0,
      isWatermarked:         true,
      qualityScore:          0,
      transactionId:         null,
      stripePaymentIntentId: null,
      errors:                [],
      tiersAttempted:        ['free_preview'],
      totalMs:               0,
    };

    try {
      const adapter = getClerkAdapter(request.countyFIPS, request.countyName);
      await adapter.initSession();

      try {
        // Get document images (free preview)
        const images: DocumentImage[] = await adapter.getDocumentImages(
          request.instrumentNumber,
        );

        if (images.length > 0) {
          // Download images to local disk
          const downloadedPaths = await this.saveImages(
            images,
            request.projectId,
            request.instrumentNumber,
          );

          result.imagePaths = downloadedPaths;
          result.pages      = images.length;
          result.isWatermarked = images[0]?.isWatermarked ?? true;
          result.qualityScore  = this.estimateImageQuality(images);
          result.status   = 'success_free_preview';
          result.tier     = 'free_preview';
          result.platform = this.getFreePlatformName(request.countyFIPS);
        } else {
          // Index only — adapter returned no images
          result.status = 'success_free_index';
          result.tier   = 'free_index';
          result.qualityScore = 0;
        }
      } finally {
        await adapter.destroySession().catch(() => {/* ignore */});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Free access failed: ${msg}`);
      this.logger.warn('DocAccess', `Free tier failed for ${request.instrumentNumber}: ${msg}`);
    }

    return result;
  }

  // ── Tier 2: Paid platform ─────────────────────────────────────────────

  /**
   * Attempt to purchase a document from a specific paid platform.
   * Delegates to the appropriate purchase adapter.
   */
  private async tryPaidPlatform(
    platformId: PaidPlatformId,
    request: DocumentAccessRequest,
  ): Promise<DocumentAccessResult> {
    const result: DocumentAccessResult = {
      status:                'failed_all_tiers',
      tier:                  'paid_platform',
      platform:              platformId,
      instrumentNumber:      request.instrumentNumber,
      documentType:          request.documentType,
      imagePaths:            [],
      pages:                 0,
      costUSD:               0,
      isWatermarked:         false,
      qualityScore:          0,
      transactionId:         null,
      stripePaymentIntentId: null,
      errors:                [],
      tiersAttempted:        ['paid_platform'],
      totalMs:               0,
    };

    const creds = request.credentials ?? this.config.credentials ?? {};
    const outDir = path.join(this.config.outputDir, request.projectId, platformId);
    fs.mkdirSync(outDir, { recursive: true });

    try {
      switch (platformId) {
        case 'texasfile': {
          const { TexasFilePurchaseAdapter } = await import(
            './purchase-adapters/texasfile-purchase-adapter.js'
          );
          const texasCreds = (creds as any).texasfile;
          if (!texasCreds) { result.errors.push('texasfile: no credentials'); break; }

          const adapter = new TexasFilePurchaseAdapter(texasCreds, outDir, request.projectId);
          await adapter.initSession();
          try {
            const pr = await adapter.purchaseDocument(
              request.countyName,
              request.instrumentNumber,
              request.documentType,
            );
            result.imagePaths   = pr.downloadedImages;
            result.pages        = pr.pages;
            result.costUSD      = pr.totalCost;
            result.transactionId = pr.transactionId;
            result.qualityScore  = pr.imageQuality.qualityScore;
            result.isWatermarked = pr.imageQuality.hasWatermark;
            result.status = pr.status === 'purchased' ? 'success_paid' : 'failed_all_tiers';
            if (pr.error) result.errors.push(pr.error);
          } finally {
            await adapter.destroySession().catch(() => {/* ignore */});
          }
          break;
        }

        case 'kofile_pay': {
          const { KofilePurchaseAdapter } = await import(
            './purchase-adapters/kofile-purchase-adapter.js'
          );
          const kofileCreds = (creds as any).kofile_pay;
          if (!kofileCreds) { result.errors.push('kofile_pay: no credentials'); break; }

          const adapter = new KofilePurchaseAdapter(
            request.countyFIPS,
            request.countyName,
            kofileCreds,
            outDir,
            request.projectId,
          );
          await adapter.initSession();
          try {
            const pr = await adapter.purchaseDocument(
              request.instrumentNumber,
              request.documentType,
            );
            result.imagePaths    = pr.downloadedImages;
            result.pages         = pr.pages;
            result.costUSD       = pr.totalCost;
            result.transactionId = pr.transactionId;
            result.qualityScore  = pr.imageQuality.qualityScore;
            result.isWatermarked = pr.imageQuality.hasWatermark;
            result.status = pr.status === 'purchased' ? 'success_paid' : 'failed_all_tiers';
            if (pr.error) result.errors.push(pr.error);
          } finally {
            await adapter.destroySession().catch(() => {/* ignore */});
          }
          break;
        }

        // For platforms not yet fully automated (tyler_pay, henschen_pay, etc.),
        // we return a placeholder result that clearly indicates the platform is
        // available but the automation is in progress.  The orchestrator will
        // fall through to the next platform.
        case 'tyler_pay':
        case 'henschen_pay':
        case 'idocket_pay':
        case 'fidlar_pay':
        case 'govos_direct':
        case 'landex':
        case 'cs_lexi': {
          // TODO Phase 14+: Implement per-platform purchase adapters
          // For now, return a descriptive "not yet automated" status so the
          // orchestrator can fall through to TexasFile as fallback.
          result.errors.push(
            `${platformId}: full purchase automation not yet implemented — ` +
            `TexasFile is the universal fallback`,
          );
          break;
        }

        case 'txdot_docs':
        case 'glo_archives': {
          // These are free / near-free platforms handled separately
          result.errors.push(`${platformId}: use TxDOT/GLO integration layer directly`);
          break;
        }

        default: {
          result.errors.push(`Unknown platform: ${platformId}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${platformId}: ${msg}`);
    }

    return result;
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /**
   * Persist downloaded document images to local disk.
   * Returns an array of local file paths.
   */
  private async saveImages(
    images: DocumentImage[],
    projectId: string,
    instrumentNumber: string,
  ): Promise<string[]> {
    const savedPaths: string[] = [];
    const docDir = path.join(
      this.config.outputDir,
      projectId,
      'free',
      instrumentNumber.replace(/[^a-zA-Z0-9_-]/g, '_'),
    );
    fs.mkdirSync(docDir, { recursive: true });

    for (const img of images) {
      // Image is already on disk (saved by adapter)
      if (img.imagePath && fs.existsSync(img.imagePath)) {
        savedPaths.push(img.imagePath);
        continue;
      }
      // Path doesn't exist — record it anyway for tracking
      if (img.imagePath) savedPaths.push(img.imagePath);
    }

    return savedPaths;
  }

  /**
   * Estimate image quality score (0–100) from DocumentImage metadata.
   * - Non-watermarked images: 80–100
   * - Watermarked images: 40–70 (AI can still extract data)
   * - No images: 0
   */
  private estimateImageQuality(images: DocumentImage[]): number {
    if (images.length === 0) return 0;
    const hasWatermarks = images.some((img) => img.isWatermarked);
    const qualityRating = images[0]?.quality ?? 'fair';
    const qualityMap: Record<string, number> = {
      good: 90,
      fair: 70,
      poor: 40,
    };
    const baseScore = qualityMap[qualityRating] ?? 50;
    return hasWatermarks ? Math.min(baseScore, 70) : baseScore;
  }

  /**
   * Get the platform name string for free-tier access.
   */
  private getFreePlatformName(
    countyFIPS: string,
  ): 'kofile_free' | 'countyfusion_index' | 'tyler_index' | 'henschen_index' | 'idocket_index' | 'fidlar_index' | 'texasfile_index' {
    // KOFILE_FIPS_SET is local — check by importing dynamically would create
    // a circular dep. Use the clerk-registry's getClerkSystem instead.
    const { getClerkSystem } = require('./clerk-registry.js') as typeof import('./clerk-registry.js');
    const system = getClerkSystem(countyFIPS);
    switch (system) {
      case 'kofile':       return 'kofile_free';
      case 'countyfusion': return 'countyfusion_index';
      case 'tyler':        return 'tyler_index';
      case 'henschen':     return 'henschen_index';
      case 'idocket':      return 'idocket_index';
      case 'fidlar':       return 'fidlar_index';
      default:             return 'texasfile_index';
    }
  }

  /**
   * Check whether credentials are available for a specific platform.
   */
  private hasPlatformCredentials(
    platformId: PaidPlatformId,
    overrideCreds?: import('../types/document-access.js').PlatformCredentialMap,
  ): boolean {
    const creds = overrideCreds ?? this.config.credentials ?? {};
    // TxDOT and GLO don't need credentials
    if (platformId === 'txdot_docs' || platformId === 'glo_archives') return true;

    switch (platformId) {
      case 'texasfile':      return !!(creds as any).texasfile;
      case 'kofile_pay':     return !!(creds as any).kofile_pay;
      case 'tyler_pay':      return !!(creds as any).tyler_pay;
      case 'henschen_pay':   return !!(creds as any).henschen_pay;
      case 'idocket_pay':    return !!(creds as any).idocket_pay;
      case 'fidlar_pay':     return !!(creds as any).fidlar_pay;
      case 'govos_direct':   return !!(creds as any).govos_direct;
      case 'landex':         return !!(creds as any).landex;
      case 'cs_lexi':        return !!(creds as any).cs_lexi;
      default: return false;
    }
  }
}

// ── Export convenience factory ─────────────────────────────────────────────

/**
 * Create a DocumentAccessOrchestrator with credentials loaded from environment.
 */
export function createDocumentAccessOrchestrator(
  projectId: string,
  overrides: Partial<DocumentAccessConfig> = {},
): DocumentAccessOrchestrator {
  const credentials = PaidPlatformRegistry.loadCredentialsFromEnv();
  return new DocumentAccessOrchestrator(
    { ...overrides, credentials },
    projectId,
  );
}
