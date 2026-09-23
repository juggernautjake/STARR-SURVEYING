// worker/src/research/source-licence.ts — what we may do with a document, by where it came from.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// Owner, 2026-09-23: "Once we own the document, we can do whatever we want with it."
//
// That is how buying a thing works. It is not how buying a LICENCE works, and TexasFile sells a
// licence. Read 2026-09-23 at texasfile.com/about/tos/, their words:
//
//   "Information in or derived from the Website may not be copied, republished, redistributed,
//    transmitted, altered, edited or exploited in any manner for any purpose without notice to and
//    prior written permission from TexasFile."
//
//   "Information obtained from TexasFile may not be resold online or utilized for building title
//    abstract plants."
//
//   "Retrieving information by any automated means is specifically prohibited... bulk downloading
//    images from the Website."
//
//   "The content available through the Website is the property of TexasFile and may be protected by
//    copyrights, trademarks, service marks, patents or other proprietary rights and laws."
//
// So a purchased TexasFile image may be given to the customer it was bought for. Serving it to the
// NEXT customer is redistribution, and "building title abstract plants" is close enough to a
// searchable firm-wide archive of county records that nobody should want to argue it after the
// fact.
//
// ── THE SAME DOCUMENT, DIFFERENT RIGHTS ─────────────────────────────────────────────────────────
//
// None of that attaches to the RECORD. A Bell County plat is a public record: the county publishes
// it for anyone, Texas government records carry no copyright, and a copy obtained FROM THE COUNTY
// may be kept and re-served forever. The restriction is on TexasFile's copy, not on the deed.
//
// Which makes this table a routing instruction rather than a legal opinion. Where a document is
// wanted for the shared library, prefer the county. Where it comes from a vendor, it belongs to the
// job that paid for it. Same document, two provenances, two answers.
//
// ── THE PRECEDENT ──────────────────────────────────────────────────────────────────────────────
//
// `services/imagery-plan.ts` has carried `SOURCE_LICENCE` for imagery since long before this, and
// its test says the rule plainly: it "refuses to guess a redistribution right". There was no
// equivalent for documents, which is how "we own it so we can do what we like" became a plan.
//
// NOT LEGAL ADVICE. It is a written-down reading of published terms, kept next to the code that
// acts on it so that a change in the terms has one place to land.

/** What may be done with a document from this source. */
export type Redistribution =
  /** Public record. Keep it, share it, serve it to anyone. */
  | 'permitted'
  /** Licensed to us for the customer who paid. Never served to a different customer. */
  | 'customer_only'
  /** Not established. Treated as customer_only until someone reads the terms and says otherwise. */
  | 'unknown';

export interface SourceLicence {
  /** How the source is recorded on a document row. */
  key: string;
  displayName: string;
  redistribution: Redistribution;
  /** True when the source's own terms forbid automated/bulk retrieval. */
  bulkRetrievalProhibited: boolean;
  /** Where the reading comes from, so the next person can check it rather than trust it. */
  basis: string;
  reviewedOn: string;
}

export const SOURCE_LICENCES: Record<string, SourceLicence> = {
  // ── Counties: the record itself, from the body that made it ──────────────────────────────────
  county_portal: {
    key: 'county_portal',
    displayName: 'A county clerk or appraisal district website',
    redistribution: 'permitted',
    bulkRetrievalProhibited: false,
    basis:
      'A public record obtained from the governmental body that holds it. Texas government records '
      + 'carry no copyright and the county publishes these for anyone to download. Bell County '
      + 'serves 8,077 subdivision plats without login or charge.',
    reviewedOn: '2026-09-23',
  },

  // ── Vendors: a licensed copy of a public record ──────────────────────────────────────────────
  texasfile: {
    key: 'texasfile',
    displayName: 'TexasFile',
    redistribution: 'customer_only',
    bulkRetrievalProhibited: true,
    basis:
      'texasfile.com/about/tos/ read 2026-09-23: information from the site "may not be copied, '
      + 'republished, redistributed, transmitted, altered, edited or exploited in any manner for any '
      + 'purpose without notice to and prior written permission"; it "may not be resold online or '
      + 'utilized for building title abstract plants"; and "retrieving information by any automated '
      + 'means is specifically prohibited", naming bulk downloading of images. Content is asserted '
      + 'as TexasFile property. A purchase serves the customer it was bought for; the record itself '
      + 'is free to re-obtain from the county.',
    reviewedOn: '2026-09-23',
  },
  kofile: {
    key: 'kofile',
    displayName: 'Kofile / GovOS publicsearch.us',
    redistribution: 'unknown',
    bulkRetrievalProhibited: true,
    basis: 'Terms not yet read. Treated as customer-only until they are.',
    reviewedOn: '2026-09-23',
  },

  // ── Us ───────────────────────────────────────────────────────────────────────────────────────
  derived: {
    key: 'derived',
    displayName: 'Produced by us — a capture, render or export',
    redistribution: 'permitted',
    bulkRetrievalProhibited: false,
    basis: 'Our own work product, about a property we were engaged on.',
    reviewedOn: '2026-09-23',
  },
  customer_upload: {
    key: 'customer_upload',
    displayName: "The customer's own file",
    redistribution: 'customer_only',
    bulkRetrievalProhibited: false,
    basis:
      'Theirs, not ours, and never part of a shared library — owner, 2026-09-23: "We will not save '
      + "anyone's personal files, only those that are found through the research process.\"",
    reviewedOn: '2026-09-23',
  },
};

/**
 * The licence for a source, defaulting to the careful answer.
 *
 * An unrecognised source is `unknown`, not `permitted`. Silence about a licence is not consent to
 * redistribute, and a library that fails open redistributes the first thing it should not.
 */
export function licenceFor(source: string | null | undefined): SourceLicence {
  const key = (source ?? '').trim().toLowerCase();
  return SOURCE_LICENCES[key] ?? {
    key: key || 'unknown',
    displayName: source ? `Unrecognised source: ${source}` : 'Source not recorded',
    redistribution: 'unknown',
    bulkRetrievalProhibited: true,
    basis: 'No licence has been established for this source, so nothing may be assumed about it.',
    reviewedOn: '2026-09-23',
  };
}

/** May a document from this source be served to a customer other than the one it was fetched for? */
export function mayShareFirmWide(source: string | null | undefined): boolean {
  return licenceFor(source).redistribution === 'permitted';
}

/** May we retrieve from this source in bulk, or only one document at a time on demand? */
export function mayRetrieveInBulk(source: string | null | undefined): boolean {
  return !licenceFor(source).bulkRetrievalProhibited;
}

/** One sentence for a log or a UI, so the reason travels with the refusal. */
export function explainLicence(source: string | null | undefined): string {
  const l = licenceFor(source);
  if (l.redistribution === 'permitted') return `${l.displayName}: may be kept and shared.`;
  return `${l.displayName}: held for the job that obtained it, not shared. ${l.basis}`;
}
