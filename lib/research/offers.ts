// lib/research/offers.ts — a priced list of what the run found and did not buy.
//
// Owner, 2026-09-21: "we will find all of the relevant items that can be purchased, and we will
// list them when the research run is done, and next to them we will have a purchase button. We
// should take a screenshot of the first page of the document if we can and use it as a thumbnail."
//
// ── AN OFFER IS A FINDING, NOT A FAILURE ────────────────────────────────────────────────────────
//
// This is the point `deferred-purchases.ts` was written to make, and it is why that module is gone:
// it said the same thing for a summary sentence nothing rendered, while the rows themselves were
// shaped somewhere else. The shaping is where the meaning gets lost, so it belongs here. A deferred
// document is something the run LEARNED. The county has it, we located it, we know what it costs, and the only
// reason it is not in the file is that nobody has asked for it yet. Rendered beside genuine
// retrieval failures it reads as four things that went wrong; rendered as a list with prices and a
// button it reads as four things you can have.
//
// So nothing here returns an error shape, and the status a UI receives is never 'failed'.
//
// ── PURE, BECAUSE THE ROUTE IS NOT ──────────────────────────────────────────────────────────────
//
// The route reads the table and the page renders. Everything in between — what a row means, what it
// is worth, whether it can still be bought — is here, where it can be tested without a database.

// ── THREE STATUSES, ONE LIST (2026-09-22) ───────────────────────────────────────────────────────
//
// "It should list other found documents that can be purchased, but it should not purchase them
//  unless the user wants to after the run is complete."
//
// Three different rows mean that, written by three different code paths at three different moments:
//
//   offered          the run found it and deliberately did not buy — the normal case now
//   budget_exceeded  the run WANTED to buy and ran out of money
//   paid_disabled    paid documents were switched off for that run
//
// They are one list to a surveyor, who is asking "what else is out there" and does not care which
// internal gate stopped the spending. They were two lists in the code: this panel read `offered`,
// and the analyze route built a parallel `deferredPurchases` array from the other two which no UI
// has ever rendered. A run that hit its ceiling therefore showed nothing at all.
//
// The difference that DOES survive is `buyable`: only `offered` rows carry a vendor reference,
// because only `recordOffers` writes one. The other two are listed with their price and a note
// saying where to get them.
export const LISTABLE_STATUSES = ['offered', 'budget_exceeded', 'paid_disabled'] as const;
export type ListableStatus = (typeof LISTABLE_STATUSES)[number];

/** A row of `research_document_purchases` as the offers route selects it. */
export interface OfferRow {
  id: string;
  instrument_raw: string | null;
  document_type: string | null;
  platform_id: string | null;
  cost_usd: number | string | null;
  /** TexasFile bills per page; a skip row carries a page count where it carries no `cost_usd`. */
  pages?: number | string | null;
  vendor_ref: string | null;
  preview_path: string | null;
  offered_at: string | null;
  failure_reason: string | null;
  county_fips: string | null;
  status?: string | null;
}

/** One document on offer, in the shape the page renders. */
export interface Offer {
  id: string;
  /** What the county calls it, or the best handle we have. Never empty. */
  label: string;
  /** 'Plat', 'Deed'… Title case, for a badge. Null when the vendor did not say. */
  documentType: string | null;
  /** Where it would be bought: 'TexasFile', 'Kofile'… */
  vendor: string;
  /** USD. Null when the vendor prices per page and the page count is not known yet — which is
   *  common, and must read as "we do not know" rather than as "free". */
  priceUsd: number | null;
  /** Storage path of the free first-page preview, when one has been fetched. */
  previewPath: string | null;
  /** Whether a purchase button can actually buy THIS document. */
  buyable: boolean;
  /** Why it was not bought, in the run's own words. */
  note: string | null;
  offeredAt: string | null;
}

/**
 * Why this one is not in the file already, in a sentence a surveyor reads once.
 *
 * `budget_exceeded` is the one that must not read as a fault. The run had permission, found the
 * document, and stopped at a number the operator chose. Told "failed", they distrust their own
 * limit; told "the run reached its budget", they either raise it or buy the one they want.
 */
export function reasonLine(status: string | null | undefined, buyable: boolean, vendor: string): string | null {
  switch ((status ?? '').trim()) {
    case 'budget_exceeded':
      return `The run reached its document budget before this one. Buy it on ${vendor}.`;
    case 'paid_disabled':
      return `Paid documents were switched off for that run. Buy it on ${vendor}.`;
    case 'offered':
      return buyable ? null : `We do not hold ${vendor}’s own id for this one, so buy it there directly.`;
    default:
      return null;
  }
}

const VENDOR_NAMES: Record<string, string> = {
  texasfile: 'TexasFile',
  kofile: 'Kofile',
  kofile_pay: 'Kofile',
  tyler_pay: 'Tyler',
  county_direct: 'the county',
  county_direct_pay: 'the county',
};

export function vendorName(platformId: string | null | undefined): string {
  const key = (platformId ?? '').trim().toLowerCase();
  return VENDOR_NAMES[key] ?? (key ? key.replace(/_/g, ' ') : 'the vendor');
}

/** 'PLAT' → 'Plat'; 'WARRANTY DEED' → 'Warranty Deed'. The vendor indexes shout. */
export function documentTypeLabel(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Can a purchase button buy this?
 *
 * Only with the vendor's own id. Without it, "buy this" means re-running the search and taking
 * whatever comes back first — which, for a common surname or a subdivision with fifty plats, is a
 * different document with the same label. Charging somebody for the wrong deed is worse than
 * telling them we cannot fetch this one automatically.
 *
 * `REF:`-prefixed instruments are the ones that had nothing BUT a vendor id, so they are buyable by
 * definition; the prefix exists so the label does not read as a county reference.
 */
export function isBuyable(row: Pick<OfferRow, 'vendor_ref' | 'platform_id'>): boolean {
  return Boolean((row.vendor_ref ?? '').trim()) && vendorName(row.platform_id) === 'TexasFile';
}

/** The label a person reads. `REF:<guid>` is an internal handle and must never be shown as one. */
export function offerLabel(row: Pick<OfferRow, 'instrument_raw' | 'document_type'>): string {
  const raw = (row.instrument_raw ?? '').trim();
  if (raw && !raw.startsWith('REF:')) return raw;
  const type = documentTypeLabel(row.document_type);
  // A document we can buy but cannot name. The type plus "on file with the vendor" is honest;
  // showing the GUID is not a description, it is an implementation detail with a colon in it.
  return type ? `${type} (no instrument number)` : 'Document (no instrument number)';
}

/**
 * What the row says this costs.
 *
 * `cost_usd` where the run priced it, else the page count — TexasFile bills $1 a page, and a skip
 * row written by `recordSkippedPurchases` carries `cost_usd: 0` with the pages it counted. Neither
 * present means we genuinely do not know, which is null and never 0.
 */
export function offerPriceUsd(row: Pick<OfferRow, 'cost_usd' | 'pages'>): number | null {
  const cost = Number(row.cost_usd);
  if (Number.isFinite(cost) && cost > 0) return Number(cost.toFixed(2));
  const pages = Number(row.pages);
  if (Number.isFinite(pages) && pages > 0) return Number(pages.toFixed(2));
  return null;
}

export function toOffer(row: OfferRow): Offer {
  const vendor = vendorName(row.platform_id);
  const buyable = isBuyable(row);
  // The run's own words where it left any, else the sentence for this status. `recordSkippedPurchases`
  // writes a generic reason shared by every row it files, which says nothing about THIS document.
  const written = (row.failure_reason ?? '').trim();
  const status = (row.status ?? 'offered').trim();
  const note = status === 'offered' && written
    ? written
    : reasonLine(status, buyable, vendor) ?? written ?? null;
  return {
    id: row.id,
    label: offerLabel(row),
    documentType: documentTypeLabel(row.document_type),
    vendor,
    // 0 is how the worker stores "priced per page, count unknown" — it is not a free document, and
    // rendering it as $0.00 beside a purchase button would be a lie with a price tag on it.
    priceUsd: offerPriceUsd(row),
    previewPath: (row.preview_path ?? '').trim() || null,
    buyable,
    note: note || null,
    offeredAt: row.offered_at,
  };
}

/** What the whole list would cost, when every offer on it carries a price. */
export function offersTotalUsd(offers: readonly Offer[]): number | null {
  if (offers.length === 0) return null;
  if (offers.some((o) => o.priceUsd === null)) return null;
  return Number(offers.reduce((s, o) => s + (o.priceUsd ?? 0), 0).toFixed(2));
}

/**
 * One sentence introducing the list.
 *
 * An offer is a finding, so this is written as an offer. A reader shown their own budget limit in
 * the language of failure learns to distrust a limit they set themselves.
 */
export function offersHeadline(offers: readonly Offer[]): string | null {
  if (offers.length === 0) return null;
  const n = offers.length === 1 ? '1 document' : `${offers.length} documents`;
  const total = offersTotalUsd(offers);
  const price = total === null ? '' : `, about $${total.toFixed(2)} for all of them`;
  const buyable = offers.filter((o) => o.buyable).length;
  const caveat = buyable === offers.length
    ? ''
    : buyable === 0
      ? ' None can be fetched automatically — each has to be bought on the vendor’s own site.'
      : ` ${offers.length - buyable} of them have to be bought on the vendor’s own site.`;
  return `${n} were found behind a paywall${price}. Nothing was bought. Buy the ones you want.${caveat}`;
}

/** Most useful first: what we can actually buy, dearest last so a cheap plat is not buried. */
export function sortOffers(offers: readonly Offer[]): Offer[] {
  return [...offers].sort((a, b) => {
    if (a.buyable !== b.buyable) return a.buyable ? -1 : 1;
    if ((a.priceUsd ?? Infinity) !== (b.priceUsd ?? Infinity)) {
      return (a.priceUsd ?? Infinity) - (b.priceUsd ?? Infinity);
    }
    return a.label.localeCompare(b.label);
  });
}

/**
 * Is this storage path inside this project's own folder?
 *
 * Every artifact path `uploadDocumentIncremental` writes begins `${projectId}/`. The preview route
 * takes its path from a query string — which is to say, from the browser, which can say anything.
 * Without this check that route signs a URL for ANY object in the private documents bucket to any
 * signed-in user, every other project's documents included. It is not defence in depth; it is the
 * whole of the defence.
 *
 * Traversal is refused rather than normalised away: a path with `..` in it is not a typo to be
 * forgiven, and a check that repairs its input is a check somebody eventually outwits.
 *
 * It lives here rather than beside the route because a Next route file may export only its
 * handlers and a fixed set of config names — an exported helper there is a build error, and an
 * unexported one is a security check with no test on it.
 */
export function pathBelongsToProject(path: string, projectId: string): boolean {
  const p = (path ?? '').trim();
  if (!p || p.includes('..') || p.startsWith('/')) return false;
  if (!projectId) return false;
  return p.startsWith(`${projectId}/`);
}
