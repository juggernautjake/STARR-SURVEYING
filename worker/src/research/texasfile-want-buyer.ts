// worker/src/research/texasfile-want-buyer.ts — turn a Want into a TexasFile purchase (plan G4)
//
// The gather engine (`gather-orchestrator.ts`) takes an injected `buyFromTexasFile(want, maxUsd)`.
// This builds the real one: it maps a `Want`'s search keys onto the TexasFile purchase adapter
// (`purchaseDocument`, which already searches by name / book-vol-page, buys via the purchase API, and
// files the pages into `research_documents` for Review — slice G1), and maps the adapter's
// `DocumentPurchaseResult` back to the engine's `TexasBuyResult`.
//
// The adapter call is INJECTED (`opts.purchase`) so the two pure mappings — Want → purchase args,
// and result → buy-result — are unit-tested without a live browser; the default wires the real
// `TexasFilePurchaseAdapter`.

import type { DocumentPurchaseResult, TexasFileCredentials } from '../types/purchase.js';
import { TexasFilePurchaseAdapter, type TexasFilePurchaseHints } from '../services/purchase-adapters/texasfile-purchase-adapter.js';
import type { Want } from './acquisition-wantlist.js';
import type { TexasBuyResult } from './gather-orchestrator.js';

export type PurchaseFn = (
  county: string,
  instrumentNumber: string,
  documentType: string,
  hints: TexasFilePurchaseHints,
) => Promise<DocumentPurchaseResult>;

/** Map a want + the remaining earmark onto the adapter's `purchaseDocument` arguments. */
export function purchaseArgsForWant(
  county: string,
  want: Want,
  maxUsd: number,
): [string, string, string, TexasFilePurchaseHints] {
  return [
    county,
    want.instrument ?? '',
    want.documentType,
    { book: want.book, volume: want.book, page: want.page, name: want.name, maxUsd },
  ];
}

/** Map the adapter's purchase result onto the gather engine's buy result. */
export function buyResultFromPurchase(r: DocumentPurchaseResult): TexasBuyResult {
  if (r.status === 'purchased') {
    return { bought: true, costUsd: r.totalCost ?? r.pages ?? 0, ref: r.transactionId ?? null };
  }
  // 'budget_exceeded' → the engine treats it as a budget skip; everything else is a not-found /
  // technical miss the engine records as `missing`.
  return {
    bought: false,
    costUsd: 0,
    reason: r.status === 'budget_exceeded' ? 'budget' : (r.error ?? r.status ?? 'not found'),
  };
}

export interface TexasFileWantBuyerOptions {
  county: string;
  projectId: string;
  /** Where the adapter writes page images on the worker; defaults to the project's purchase dir. */
  outputDir?: string;
  /** Injected for tests; defaults to a real TexasFilePurchaseAdapter. */
  purchase?: PurchaseFn;
}

/** Build the `buyFromTexasFile` effect the gather engine calls for each gap. */
export function makeTexasFileWantBuyer(
  opts: TexasFileWantBuyerOptions,
): (want: Want, maxUsd: number) => Promise<TexasBuyResult> {
  const purchase: PurchaseFn = opts.purchase ?? defaultPurchase(opts);
  return async (want, maxUsd) => {
    const [county, instrument, documentType, hints] = purchaseArgsForWant(opts.county, want, maxUsd);
    const result = await purchase(county, instrument, documentType, hints);
    return buyResultFromPurchase(result);
  };
}

function defaultPurchase(opts: TexasFileWantBuyerOptions): PurchaseFn {
  const credentials: TexasFileCredentials = {
    username: process.env.TEXASFILE_USERNAME ?? '',
    password: process.env.TEXASFILE_PASSWORD ?? '',
    accountType: 'pay_per_page',
  };
  const outputDir = opts.outputDir ?? `/tmp/purchased/${opts.projectId}`;
  const adapter = new TexasFilePurchaseAdapter(credentials, outputDir, opts.projectId);
  return (county, instrument, documentType, hints) =>
    adapter.purchaseDocument(county, instrument, documentType, hints);
}
