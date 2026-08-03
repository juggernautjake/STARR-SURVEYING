// worker/src/research/held-documents.ts — turn a completed free pass into the index that decides
// what the paid pass is allowed to buy (plan S-13/S-14).
//
// S-14's rule is about ORDERING: the free sources run first, and everything they return is
// registered before a single paid source is queried. Filtering afterwards does not work, because by
// then the money is gone. This module is that registration step.
//
// ── THE DISTINCTION THAT DECIDES WHAT MAY BE REGISTERED ─────────────────────────────────────────
//
// "We already have it" and "we already saw it" are not the same thing, and conflating them here
// would produce the exact failure this whole subsystem exists to prevent.
//
// Kofile's free tier returns **watermarked previews**. A watermarked page is not a substitute for
// the document — removing the watermark is the entire reason to buy it. Registering a preview as
// held would make `DocumentIndex.decide()` answer "already held, do not buy", and the run would end
// with a watermarked image standing in for a clean one, no purchase in the ledger, and nothing
// anywhere saying a document is missing. That is a false match: silent, unrecoverable, and
// indistinguishable from success.
//
// So the rule is narrow on purpose: a document is registered as HELD only when we hold a usable
// copy of it — not watermarked, and with at least one page image actually on disk. Everything else
// is counted and reported, never registered.
//
// This errs toward buying a document twice. That is the intended direction: a duplicate costs a few
// dollars and appears in the ledger where someone can see it.

import { DocumentIndex, type SourceCost } from './document-identity.js';
import type { HarvestResult, HarvestedDocument } from '../types/document-harvest.js';

export interface HeldIndexSummary {
  index: DocumentIndex;
  /** Documents registered as genuinely held. */
  registered: number;
  /** Seen, but watermarked — they must NOT prevent a purchase. */
  watermarkedNotHeld: number;
  /** Seen, but no page image was downloaded, so we hold nothing. */
  noImagesNotHeld: number;
  /** Held, but not identifiable (no date, or no instrument and no book/page). */
  unkeyable: number;
  /** A sentence a run can put in its report. */
  summary: string;
}

/** Every document in a harvest result, flattened. */
export function allHarvestedDocuments(result: HarvestResult): HarvestedDocument[] {
  const docs: HarvestedDocument[] = [];
  const t = result.documents?.target;
  if (t) docs.push(...t.deeds, ...t.plats, ...t.easements, ...t.restrictions, ...t.other);

  const s = result.documents?.subdivision;
  if (s) {
    if (s.masterPlat) docs.push(s.masterPlat);
    docs.push(...s.restrictiveCovenants, ...s.utilityEasements, ...s.dedicationDocs);
  }

  for (const adj of Object.values(result.documents?.adjacent ?? {})) {
    docs.push(...adj.deeds, ...adj.plats);
  }
  return docs;
}

/** Do we actually hold a usable copy of this document, or did we merely see it?
 *
 *  Exported because the answer is a rule, not an implementation detail, and because a test that
 *  cannot state the rule cannot defend it. */
export function isUsableCopy(doc: HarvestedDocument): boolean {
  return doc.isWatermarked === false && (doc.images?.length ?? 0) > 0;
}

/** Build the index the purchase step consults, from what the free pass actually brought back.
 *
 *  `cost` is 'free' for a harvest pass. It is a parameter rather than a constant because the same
 *  registration runs over documents recovered from the firm's library, which were paid for once. */
export function buildHeldIndexFromHarvest(
  result: HarvestResult,
  county: string,
  cost: SourceCost = 'free',
): HeldIndexSummary {
  const index = new DocumentIndex();
  let registered = 0;
  let watermarkedNotHeld = 0;
  let noImagesNotHeld = 0;
  let unkeyable = 0;

  for (const doc of allHarvestedDocuments(result)) {
    if (doc.isWatermarked !== false) {
      watermarkedNotHeld += 1;
      continue;
    }
    if ((doc.images?.length ?? 0) === 0) {
      noImagesNotHeld += 1;
      continue;
    }

    const ok = index.register(
      {
        county,
        instrumentNumber: doc.instrumentNumber,
        recordingDate: doc.date,
        vendor: doc.source,
      },
      cost,
    );
    if (ok) registered += 1;
    else unkeyable += 1;
  }

  const parts = [`${registered} document(s) registered as held from the ${cost} pass.`];
  if (watermarkedNotHeld > 0) {
    parts.push(
      `${watermarkedNotHeld} were watermarked previews — seen, NOT held, and deliberately allowed to ` +
        `be bought, because removing the watermark is the point of buying them.`,
    );
  }
  if (noImagesNotHeld > 0) {
    parts.push(`${noImagesNotHeld} had no downloaded page image, so nothing is held for them.`);
  }
  if (unkeyable > 0) {
    parts.push(
      `${unkeyable} could not be identified (no readable recording date, or no instrument and no ` +
        `book/page) and so cannot prevent a duplicate purchase.`,
    );
  }

  return { index, registered, watermarkedNotHeld, noImagesNotHeld, unkeyable, summary: parts.join(' ') };
}
