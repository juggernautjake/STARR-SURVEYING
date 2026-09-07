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
  /** The TexasFile GUID the discovery pass found for this exact document (2026-09-06). */
  guid?: string;
  /** `'plat'` buys through the PLAT records + `/plat/`; default `'instrument'`. */
  product?: 'instrument' | 'plat';
  /** The plat search key (subdivision or survey name) when `product` is `'plat'`. */
  subdivision?: string;
  /** The subject's lot / block, to pick the right deed among a name search's rows. */
  lot?: string;
  block?: string;
  /** What this run already bought or holds — never chosen again under another want (2026-09-07). */
  excludeInstruments?: string[];
  excludeGuids?: string[];
  /** What the want is FOR — an easement want never buys a deed, a deed want never buys a lien. */
  wantType?: 'deed' | 'easement' | 'plat';
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
      guid: hints.guid,
      product: hints.product,
      subdivision: hints.subdivision,
      lot: hints.lot,
      block: hints.block,
      excludeInstruments: hints.excludeInstruments,
      excludeGuids: hints.excludeGuids,
      wantType: hints.wantType,
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
      // A `search_required` want has no number to name the file by; the document TexasFile actually
      // sold (its instrument, else its GUID) is the stable name — not the placeholder.
      const fileKey = instrumentNumber !== 'search_required' ? instrumentNumber : (buy.instrument ?? buy.guid ?? hints.guid ?? instrumentNumber);
      for (let i = 0; i < buy.pages.length; i++) {
        const filename = `${documentType}_${sanitize(fileKey)}_p${i + 1}_texasfile.jpg`;
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
      await this.fileForReview(county, instrumentNumber, documentType, buy, hints);

      result.status = 'purchased';
      // The instrument TexasFile actually sold — for a `search_required` want this is the first time
      // the document has a real number, and it is what the ledger must be keyed on.
      result.instrumentNumber = buy.instrument ?? instrumentNumber;
      result.vendorRef = buy.guid;
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
    hints: TexasFilePurchaseHints = {},
  ): Promise<void> {
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        this.logger.warn('TexasFile', 'Supabase not configured — purchased pages not filed for Review.');
        return;
      }
      const category = normaliseCategory(documentType);
      const { label, documentLabel, recordingInfo } = describePurchasedDocument(county, instrumentNumber, documentType, buy, hints);
      const pages: ArtifactPageImage[] = buy.pages.map((p, i) => ({
        category,
        label,
        pageNumber: i + 1,
        imageBase64: p.imageBase64,
        sourceUrl: p.url ?? null,
        ...(i === 0
          ? {
              documentLabel,
              recordingInfo,
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

/**
 * How a purchased document is labelled in Review. A `search_required` want used to file as
 * "Deed — Instr. search_required", which is a placeholder shown to a surveyor. The label is built
 * from what is actually known: the instrument TexasFile sold, or for a plat its subdivision and
 * cabinet/slide. Exported for the unit test; pure.
 */
export function describePurchasedDocument(
  county: string,
  instrumentNumber: string,
  documentType: string,
  buy: { instrument?: string; guid?: string },
  hints: TexasFilePurchaseHints,
): { label: string; documentLabel: string; recordingInfo: string } {
  const sold = buy.instrument ?? (instrumentNumber !== 'search_required' ? instrumentNumber : undefined);
  const cabinet = hints.volume ?? hints.book;
  const isPlat = hints.product === 'plat' || documentType.toLowerCase().includes('plat');
  if (isPlat) {
    const where = hints.subdivision
      ? hints.subdivision
      : cabinet && hints.page ? `Cabinet ${cabinet}, Slide ${hints.page}` : (sold ?? buy.guid ?? 'TexasFile');
    const parts = ['Plat records'];
    if (cabinet && hints.page) parts.push(`Cabinet ${cabinet}, Slide ${hints.page}`);
    if (sold) parts.push(`Instrument No. ${sold}`);
    return { label: where, documentLabel: `Plat — ${where} (${county})`, recordingInfo: parts.join(' · ') };
  }
  const ref = sold ?? (cabinet && hints.page ? `Vol. ${cabinet}, Pg. ${hints.page}` : hints.name ? `${hints.name}` : (buy.guid ?? 'TexasFile'));
  const recordingInfo = sold
    ? `Instrument No. ${sold}`
    : cabinet && hints.page ? `Volume ${cabinet}, Page ${hints.page}` : `TexasFile ${buy.guid ?? ''}`.trim();
  return { label: ref, documentLabel: `${titleCase(documentType)} — ${sold ? `Instr. ${sold}` : ref} (${county})`, recordingInfo };
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
