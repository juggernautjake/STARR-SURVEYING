// worker/src/services/buy-one-offer.ts — a person pressed the purchase button.
//
// Owner, 2026-09-21: "if the researcher clicks the purchase button, the worker will go and purchase
// the document, download it, and add it to the list of viewable documents."
//
// ── THE ONLY PLACE A DOCUMENT IS BOUGHT ON PURPOSE ──────────────────────────────────────────────
//
// A run does not buy. `DocumentPurchaseOrchestrator.executePurchases` refuses to spend unless
// `operatorApproved` is set, and nothing in the run sets it. This is the other side of that gate:
// one document, named by the operator, bought because they clicked it.
//
// It goes straight to the TexasFile adapter rather than through the orchestrator, and that is
// deliberate. The orchestrator exists to decide — rank recommendations, check the library, weigh a
// budget, re-analyse afterwards. Every one of those decisions has already been made by the person
// who looked at the price and the first page and pressed the button. Routing one click through a
// planner would mean the planner could decline it, reorder it, or buy something else instead, which
// is precisely the behaviour that made a run buy a $10 plat nobody asked for.
//
// ── WHAT IT REFUSES ─────────────────────────────────────────────────────────────────────────────
//
// `buyDocument` searches and then picks; given a GUID that is not among the rows it comes back, it
// logs a warning and BUYS THE BEST MATCH INSTEAD. That is right for a run filling a gap and wrong
// for a click on a named row — somebody who pressed "buy" beside a 1979 plat has not agreed to buy
// a 2004 deed. The money is gone by the time we can see it, so this cannot prevent the charge; what
// it can do is say plainly that a different document arrived, and leave the offer standing, because
// the offer was not fulfilled.

import type { PipelineLogger } from '../lib/logger.js';
import { recordPurchase, countyKey } from './purchase-ledger.js';
import { getSupabase } from './pipeline.js';

export interface OfferToBuy {
  id: string;
  projectId: string;
  /** The vendor's own id. Required — without it there is nothing to buy precisely. */
  vendorRef: string;
  instrumentRaw: string;
  documentType: string | null;
  countyFips: string;
  countyName: string;
  platformId: string;
  /** What the offer said it would cost. The ceiling this buy is allowed to reach. */
  estimatedUsd: number | null;
}

export interface BuyOneResult {
  ok: boolean;
  /** For the operator, in plain words. Always set. */
  message: string;
  /** True when the vendor sold us a document other than the one that was clicked. */
  mismatched?: boolean;
  instrument?: string;
  pages?: number;
  costUsd?: number;
}

/** The ceiling for a single click.
 *
 *  The offer's own estimate plus a little, because TexasFile prices per page and a page count can
 *  be one out. Where the estimate is unknown (the common case — the vendor does not publish a page
 *  count in its index), a flat cap stands in. Without a cap, one click on a 60-page abstract is a
 *  $60 charge from a button that said "Price at checkout". */
export function ceilingFor(estimatedUsd: number | null): number {
  if (estimatedUsd !== null && estimatedUsd > 0) return Math.max(estimatedUsd + 2, estimatedUsd * 1.25);
  return 15;
}

/** `'PLAT'` buys through TexasFile's plat records; everything else through instruments. */
export function productFor(documentType: string | null | undefined): 'instrument' | 'plat' {
  return /plat/i.test(documentType ?? '') ? 'plat' : 'instrument';
}

/** `REF:<guid>` is the placeholder `recordOffers` writes when a document has no instrument number
 *  and no book/page. It is not something to search for — the GUID is, and it is passed separately. */
export function instrumentToSearch(instrumentRaw: string): string {
  return instrumentRaw.startsWith('REF:') ? 'search_required' : instrumentRaw;
}

/**
 * Buy one offered document, file it, and resolve the offer.
 *
 * Never throws. The caller is an HTTP handler with a person waiting on the other end, and a stack
 * trace is not an answer to "did I just spend ten dollars".
 */
export async function buyOneOffer(offer: OfferToBuy, log: PipelineLogger): Promise<BuyOneResult> {
  const { TexasFilePurchaseAdapter } = await import('./purchase-adapters/texasfile-purchase-adapter.js');
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');

  const outputDir = path.join(os.tmpdir(), 'starr-purchases', offer.projectId);
  try { fs.mkdirSync(outputDir, { recursive: true }); } catch { /* the adapter makes it too */ }

  if (!process.env.TEXASFILE_USERNAME || !process.env.TEXASFILE_PASSWORD) {
    return { ok: false, message: 'No TexasFile login is configured on the worker, so nothing can be bought.' };
  }

  const adapter = new TexasFilePurchaseAdapter(
    {
      username: process.env.TEXASFILE_USERNAME,
      password: process.env.TEXASFILE_PASSWORD,
      accountType: 'pay_per_page',
    },
    outputDir,
    offer.projectId,
  );
  let result;
  try {
    result = await adapter.purchaseDocument(
      offer.countyName,
      instrumentToSearch(offer.instrumentRaw),
      offer.documentType ?? 'deed',
      {
        guid: offer.vendorRef,
        product: productFor(offer.documentType),
        maxUsd: ceilingFor(offer.estimatedUsd),
      },
    );
  } catch (e) {
    return { ok: false, message: `The purchase could not be attempted: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (result.status !== 'purchased') {
    return {
      ok: false,
      message: result.error
        ? `TexasFile did not sell it: ${result.error}`
        : 'TexasFile did not sell it, and gave no reason.',
    };
  }

  const instrument = result.instrumentNumber ?? offer.instrumentRaw;
  const costUsd = Number(result.totalCost) || 0;
  const pages = Number(result.pages) || 0;

  // The document is filed either way — the adapter's `fileForReview` has already put it in
  // `research_documents`, and the money has already moved. The ledger row records that.
  const ledger = await recordPurchase({
    projectId: offer.projectId,
    countyFips: offer.countyFips,
    instrument,
    documentType: offer.documentType,
    platformId: offer.platformId || 'texasfile',
    pages,
    costUsd,
    transactionId: result.transactionId,
    storagePaths: result.downloadedImages,
    receipt: { boughtBy: 'operator', offerId: offer.id, vendorRef: result.vendorRef ?? offer.vendorRef },
  });
  if (!ledger.saved && !ledger.duplicateOf) {
    log.warn('Purchase', `Bought ${instrument} but could not write the ledger row: ${ledger.error ?? 'unknown'}`);
  }

  // Did we get the document that was clicked?
  const got = (result.vendorRef ?? '').trim();
  const wanted = offer.vendorRef.trim();
  const mismatched = Boolean(got) && got !== wanted;

  if (mismatched) {
    // The offer stands. Somebody pressed buy beside one document and a different one arrived; the
    // row they clicked is still unbought, and removing it would hide that.
    log.warn('Purchase',
      `The operator asked for ${wanted} and TexasFile sold ${got} (${instrument}). The offer is left standing.`);
    return {
      ok: true,
      mismatched: true,
      instrument,
      pages,
      costUsd,
      message: `TexasFile sold a different document — ${instrument}, ${pages} page(s), $${costUsd.toFixed(2)}. `
        + 'It is in the documents list. The one you asked for is still on offer.',
    };
  }

  await resolveOffer(offer.id, log);

  return {
    ok: true,
    instrument,
    pages,
    costUsd,
    message: `Bought ${instrument} — ${pages} page(s), $${costUsd.toFixed(2)}. It is in the documents list.`,
  };
}

/**
 * The offer has become a purchase, so the offer row goes.
 *
 * Deleted rather than updated, because seed 531 makes a COMPLETED purchase unique firm-wide on
 * (county, instrument): flipping this row's status to 'completed' would collide with the row
 * `recordPurchase` just wrote. The completed row IS the record of what became of this document, and
 * it carries the offer's id in its receipt, so the trail survives the delete.
 */
async function resolveOffer(offerId: string, log: PipelineLogger): Promise<void> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return;
    const { error } = await (supabase as unknown as {
      from: (t: string) => { delete: () => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } };
    }).from('research_document_purchases').delete().eq('id', offerId);
    if (error) {
      // Cosmetic next to a document that is bought and filed: the worst case is the offer shows
      // again and a second click finds TexasFile already owns it, which costs nothing.
      log.warn('Purchase', `Bought it, but the offer row ${offerId} is still listed: ${error.message}`);
    }
  } catch (e) {
    log.warn('Purchase', `Bought it, but the offer row ${offerId} is still listed: ${String(e)}`);
  }
}

/** Re-export so the HTTP handler can normalise a county without importing the ledger too. */
export { countyKey };
