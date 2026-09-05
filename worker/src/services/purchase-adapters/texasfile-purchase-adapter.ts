// worker/src/services/purchase-adapters/texasfile-purchase-adapter.ts — Phase 9 §9.4
// TexasFile statewide document purchase adapter.
// Provides access to documents from all 254 Texas counties at $1/page.
//
// ── 2026-09-05 REWRITE (plan GATHER_AND_REVIEW_SPLIT, slice G1) ──────────────────────────────────
//
// The original body drove the OLD Django TexasFile site — `/login`, `input[name="username"]`,
// `/search/{slug}`, download links — which TexasFile has since replaced with a React SPA. It never
// completed a purchase (`research_document_purchases` stayed at 0 rows), and even if it had, it saved
// files only to `/tmp`, so nothing reached the Review stage.
//
// This adapter is now a thin seam over `texasfile-buy.ts` — the module mapped live against the
// current site (login modal → search by name / book-vol-page → purchase API → download page images).
// `purchaseDocument` delegates to `buyDocument`, files the returned page images into
// `research_documents` so they appear in Review immediately, and writes them to `outputDir` as well
// so the orchestrator's existing `downloadedImages` contract (dedupe, ledger `storagePaths`,
// re-analysis) is unchanged. The class shell (`initSession`/`destroySession`) is kept because both
// orchestrators call them around `purchaseDocument`; `buyDocument` self-acquires and releases its own
// browser per call, so they are now no-ops.

import * as fs from 'fs';
import * as path from 'path';
import type {
  DocumentPurchaseResult,
  TexasFileCredentials,
} from '../../types/purchase.js';
import { PipelineLogger } from '../../lib/logger.js';
import { buyDocument, type TexasFileBuyInput } from '../texasfile-buy.js';
import { uploadDocumentIncremental, type ArtifactPageImage } from '../artifact-uploader.js';
import { getSupabase } from '../pipeline.js';

/** Extra, optional search hints the orchestrator can pass through from a recommendation. TexasFile's
 *  own instrument-number search returns EMPTY for many counties (Bell included), so book/vol/page and
 *  grantor/grantee name are the reliable keys — the recommendation carries `book`/`page`. */
export interface TexasFilePurchaseHints {
  book?: string;
  volume?: string;
  page?: string;
  name?: string;
  /** Per-document cost ceiling in dollars ($1/page). The buy is refused above it. */
  maxUsd?: number;
}

// ── TexasFile Purchase Adapter ──────────────────────────────────────────────

export class TexasFilePurchaseAdapter {
  private credentials: TexasFileCredentials;
  private outputDir: string;
  private projectId: string;
  private logger: PipelineLogger;

  constructor(
    credentials: TexasFileCredentials,
    outputDir: string,
    projectId: string = 'texasfile',
  ) {
    this.credentials = credentials;
    this.outputDir = outputDir;
    this.projectId = projectId;
    this.logger = new PipelineLogger(projectId);
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // ── Session Management ──────────────────────────────────────────────────
  //
  // Kept for call-site compatibility (both orchestrators bracket `purchaseDocument` with these).
  // `buyDocument` opens and closes its own browser per call, so there is no shared session to manage.

  async initSession(): Promise<void> {
    if (!this.credentials?.username || !this.credentials?.password) {
      this.logger.warn('TexasFile', 'No credentials — purchases will be refused.');
    }
  }

  async destroySession(): Promise<void> {
    /* no shared session — buyDocument releases its own browser lease */
  }

  // ── Purchase Flow ───────────────────────────────────────────────────────

  async purchaseDocument(
    county: string,
    instrumentNumber: string,
    documentType: string,
    hints: TexasFilePurchaseHints = {},
  ): Promise<DocumentPurchaseResult> {
    const result: DocumentPurchaseResult = {
      instrument: instrumentNumber,
      documentType,
      source: `texasfile:${county}`,
      status: 'failed',
      pages: 0,
      costPerPage: 1.0,
      totalCost: 0,
      paymentMethod: 'texasfile_wallet',
      transactionId: null,
      downloadedImages: [],
      imageQuality: { format: 'unknown', hasWatermark: true, qualityScore: 0 },
      vendor: 'texasfile',
    };

    // The credentials `buyDocument` reads come from the environment; surface a missing-config refusal
    // rather than letting the buy fail opaquely on a login it can't perform.
    if (!process.env.TEXASFILE_USERNAME || !process.env.TEXASFILE_PASSWORD) {
      result.status = 'failed';
      result.error = 'TexasFile credentials not configured (TEXASFILE_USERNAME/PASSWORD)';
      return result;
    }

    const input: TexasFileBuyInput = {
      county,
      instrumentNumber,
      book: hints.book,
      volume: hints.volume ?? hints.book,
      page: hints.page,
      name: hints.name,
      maxUsd: hints.maxUsd,
    };

    try {
      const buy = await buyDocument(input, this.logger);
      if (!buy.ok) {
        // "no results" is a genuine not-available, distinct from a purchase/technical failure — the
        // orchestrator's fallback logic reads `status` to decide whether to try another vendor.
        result.status = /no TexasFile results|over the \$/.test(buy.reason) ? 'not_available' : 'failed';
        result.error = buy.reason;
        result.pages = buy.pageCount ?? 0;
        return result;
      }

      // 1. Write each page to the worker's outputDir — the `downloadedImages` contract every
      //    downstream consumer already reads (ledger storagePaths, re-analysis, billing).
      const diskPaths: string[] = [];
      for (let i = 0; i < buy.pages.length; i++) {
        const filename = `${documentType}_${sanitize(instrumentNumber)}_p${i + 1}_texasfile.jpg`;
        const filePath = path.join(this.outputDir, filename);
        try {
          fs.writeFileSync(filePath, Buffer.from(buy.pages[i].imageBase64, 'base64'));
          diskPaths.push(filePath);
        } catch (e) {
          this.logger.warn('TexasFile', `Could not write ${filename}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // 2. File into research_documents so the document shows in Review immediately. This is the step
      //    the old adapter never did — a purchased page that lives only in /tmp is invisible to the
      //    app. Failure here does not fail the purchase (the money is already spent); it is logged.
      await this.fileForReview(county, instrumentNumber, documentType, buy);

      result.status = 'purchased';
      result.pages = buy.pageCount ?? buy.pages.length;
      result.costPerPage = 1.0;
      result.totalCost = buy.costUsd ?? buy.pages.length;
      result.transactionId = buy.purchaseId ? `TF-${buy.purchaseId}` : `TF-${instrumentNumber}`;
      result.downloadedImages = diskPaths;
      result.imageQuality = { format: 'JPEG', hasWatermark: false, qualityScore: 90 };
      this.logger.info(
        'TexasFile',
        `Purchased ${result.pages} page(s) for ${instrumentNumber} ($${result.totalCost}) — balance ${buy.balanceAfter ?? '?'}.`,
      );
      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      this.logger.error('TexasFile', `Purchase failed: ${result.error}`, error instanceof Error ? error : undefined);
      return result;
    }
  }

  /** Upload the purchased page images into `research_documents` so they render in the Review stage. */
  private async fileForReview(
    county: string,
    instrumentNumber: string,
    documentType: string,
    buy: Awaited<ReturnType<typeof buyDocument>>,
  ): Promise<void> {
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        this.logger.warn('TexasFile', 'Supabase not configured — purchased pages not filed for Review.');
        return;
      }
      const category = normaliseCategory(documentType);
      const pages: ArtifactPageImage[] = buy.pages.map((p, i) => ({
        category,
        label: instrumentNumber,
        pageNumber: i + 1,
        imageBase64: p.imageBase64,
        sourceUrl: p.url ?? null,
        ...(i === 0
          ? {
              documentLabel: `${titleCase(documentType)} — Instr. ${instrumentNumber} (${county})`,
              recordingInfo: `Instrument No. ${instrumentNumber}`,
              documentType: category,
            }
          : {}),
      }));
      const res = await uploadDocumentIncremental(supabase as never, this.projectId, pages);
      if (!res.ok) {
        this.logger.warn('TexasFile', `Filed 0 pages for Review: ${res.error ?? 'unknown error'}`);
      }
    } catch (e) {
      this.logger.warn('TexasFile', `Could not file purchased pages for Review: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

/** Recommendation document types map onto the artifact categories the Review viewer groups by. */
function normaliseCategory(documentType: string): string {
  const t = documentType.toLowerCase();
  if (t.includes('plat') || t.includes('drawing') || t.includes('map')) return 'plat';
  if (t.includes('easement')) return 'easement';
  if (t.includes('restriction')) return 'restriction';
  if (t.includes('deed')) return 'deed';
  return t || 'deed';
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
