// __tests__/research/offers.test.ts — the priced list of what the run did not buy.
//
// Owner, 2026-09-21: "we will list them when the research run is done, and next to them we will
// have a purchase button."
//
// Most of what is asserted here is about not lying to somebody who is about to spend money.
import { describe, it, expect } from 'vitest';
import {
  toOffer, offerLabel, isBuyable, vendorName, documentTypeLabel,
  offersTotalUsd, offersHeadline, sortOffers, pathBelongsToProject, reasonLine, offerPriceUsd,
  LISTABLE_STATUSES, type OfferRow, type Offer,
} from '@/lib/research/offers';

const ROW: OfferRow = {
  id: 'o-1',
  instrument_raw: '2019-12345',
  document_type: 'WARRANTY DEED',
  platform_id: 'texasfile',
  cost_usd: 4,
  vendor_ref: 'guid-1',
  preview_path: null,
  offered_at: '2026-09-21T10:00:00Z',
  failure_reason: 'Found behind a paywall; offered rather than bought.',
  county_fips: '48491',
};

describe('what an offer says it is', () => {
  it('shows the instrument number the county uses', () => {
    expect(toOffer(ROW).label).toBe('2019-12345');
  });

  it('never shows the REF: handle, which is not a description', () => {
    // `REF:<guid>` exists so `instrument_raw` (NOT NULL) has something true in it for a document
    // with no instrument number and no book/page. It is an implementation detail with a colon in
    // it, and a surveyor reading "REF:8f3a-…" beside a $10 button learns nothing about the document.
    const label = offerLabel({ instrument_raw: 'REF:8f3a-2b91', document_type: 'PLAT' });
    expect(label).toBe('Plat (no instrument number)');
    expect(label).not.toContain('8f3a');
  });

  it('title-cases the vendor index\'s shouting', () => {
    expect(documentTypeLabel('WARRANTY DEED')).toBe('Warranty Deed');
    expect(documentTypeLabel('  ')).toBeNull();
  });

  it('names the vendor in words a person uses', () => {
    expect(vendorName('texasfile')).toBe('TexasFile');
    expect(vendorName('county_direct')).toBe('the county');
    expect(vendorName(null)).toBe('the vendor');
  });
});

describe('the price', () => {
  it('reads a real price as a real price', () => {
    expect(toOffer({ ...ROW, cost_usd: 10.5 }).priceUsd).toBe(10.5);
  });

  // ── THE ONE THAT WOULD BE A LIE ───────────────────────────────────────────────────────────────
  // The worker stores 0 for "the vendor prices per page and we do not know the page count yet".
  // Rendered as $0.00 next to a purchase button that charges real money, that is a lie with a
  // price tag on it. Null means the UI says "price at checkout", which is the truth.
  it('reads 0 as unknown, never as free', () => {
    expect(toOffer({ ...ROW, cost_usd: 0 }).priceUsd).toBeNull();
    expect(toOffer({ ...ROW, cost_usd: null }).priceUsd).toBeNull();
    expect(toOffer({ ...ROW, cost_usd: 'not a number' }).priceUsd).toBeNull();
  });

  it('totals the list only when every price on it is known', () => {
    const known = [toOffer(ROW), toOffer({ ...ROW, id: 'o-2', cost_usd: 6 })];
    expect(offersTotalUsd(known)).toBe(10);
    const partly = [...known, toOffer({ ...ROW, id: 'o-3', cost_usd: 0 })];
    // A total that quietly omits the unpriced one understates what the list costs.
    expect(offersTotalUsd(partly)).toBeNull();
    expect(offersTotalUsd([])).toBeNull();
  });
});

describe('whether the button can actually buy it', () => {
  it('needs the vendor\'s own id', () => {
    // Without the GUID, "buy this" means re-running the search and taking the first hit — which for
    // a common surname or a subdivision with fifty plats is a DIFFERENT document with the same
    // label. Charging somebody for the wrong deed is worse than saying we cannot fetch this one.
    expect(isBuyable({ vendor_ref: 'guid-1', platform_id: 'texasfile' })).toBe(true);
    expect(isBuyable({ vendor_ref: null, platform_id: 'texasfile' })).toBe(false);
    expect(isBuyable({ vendor_ref: '   ', platform_id: 'texasfile' })).toBe(false);
  });

  it('is false for a vendor we have no automated buy for, GUID or not', () => {
    expect(isBuyable({ vendor_ref: 'guid-1', platform_id: 'county_direct' })).toBe(false);
  });
});

describe('the sentence above the list', () => {
  const buyable = toOffer(ROW);
  const notBuyable = toOffer({ ...ROW, id: 'o-2', vendor_ref: null, cost_usd: 6 });

  it('is an offer, not an apology', () => {
    const line = offersHeadline([buyable])!;
    expect(line).toContain('Nothing was bought');
    expect(line).toContain('Buy the ones you want');
    // The run did exactly what it was told. A reader shown their own limit in the language of
    // failure learns to distrust a limit they set themselves.
    expect(line).not.toMatch(/fail|error|could not|unable/i);
  });

  it('says how many have to be bought elsewhere, rather than offering a dead button', () => {
    expect(offersHeadline([buyable, notBuyable])).toContain('1 of them have to be bought');
    expect(offersHeadline([notBuyable])).toContain('None can be fetched automatically');
  });

  it('is nothing at all when there is nothing on offer', () => {
    expect(offersHeadline([])).toBeNull();
  });
});

describe('the order', () => {
  it('puts what we can buy first, then cheapest', () => {
    const offers: Offer[] = [
      toOffer({ ...ROW, id: 'dear', cost_usd: 30 }),
      toOffer({ ...ROW, id: 'elsewhere', vendor_ref: null, cost_usd: 1 }),
      toOffer({ ...ROW, id: 'cheap', cost_usd: 2 }),
    ];
    expect(sortOffers(offers).map((o) => o.id)).toEqual(['cheap', 'dear', 'elsewhere']);
  });

  it('does not mutate the list it was given', () => {
    const offers = [toOffer({ ...ROW, id: 'b', cost_usd: 9 }), toOffer({ ...ROW, id: 'a', cost_usd: 1 })];
    sortOffers(offers);
    expect(offers.map((o) => o.id)).toEqual(['b', 'a']);
  });
});

// ── THE PREVIEW PATH GUARD ──────────────────────────────────────────────────────────────────────
//
// The preview route signs a URL into the PRIVATE research-documents bucket, and it takes the path
// from a query string. This function is the only thing standing between "a thumbnail for this
// project" and "any object in the bucket, for any signed-in user". It lives in lib rather than
// beside the route because a Next route file may export only its handlers — an unexported security
// check is one with no test on it, which is how it ends up wrong.
describe('pathBelongsToProject', () => {
  const P = 'proj-123';

  it('allows the project its own artifact paths', () => {
    expect(pathBelongsToProject(`${P}/artifacts/deed/deed_x_page1.png`, P)).toBe(true);
  });

  it('refuses another project folder', () => {
    expect(pathBelongsToProject('proj-999/artifacts/deed/secret.png', P)).toBe(false);
    // The prefix must be a whole segment: `proj-1234` must not pass as `proj-123`.
    expect(pathBelongsToProject('proj-1234/artifacts/a.png', P)).toBe(false);
  });

  it('refuses traversal outright rather than normalising it', () => {
    // A check that repairs its input is a check somebody eventually outwits.
    expect(pathBelongsToProject(`${P}/../proj-999/a.png`, P)).toBe(false);
    expect(pathBelongsToProject(`${P}/artifacts/../../x.png`, P)).toBe(false);
  });

  it('refuses absolute paths and empties', () => {
    expect(pathBelongsToProject(`/${P}/a.png`, P)).toBe(false);
    expect(pathBelongsToProject('', P)).toBe(false);
    expect(pathBelongsToProject('   ', P)).toBe(false);
  });

  it('refuses everything when the project id is missing, rather than allowing everything', () => {
    // The failure mode worth naming: an empty project id makes the required prefix a bare "/",
    // and every path in the bucket is then one normalisation away from matching. An absent
    // project must deny, not admit.
    expect(pathBelongsToProject('anything/at/all.png', '')).toBe(false);
  });
});

// ── THREE STATUSES, ONE LIST ────────────────────────────────────────────────────────────────────
//
// `offered`, `budget_exceeded` and `paid_disabled` all mean "the run found it and did not buy it".
// They were two lists in the code — this one read `offered`, and the analyze route built a parallel
// array from the other two that no UI ever rendered — so a run that hit its ceiling showed nothing.
describe('the statuses that belong on the list', () => {
  it('names all three, so the query and the shaping cannot drift apart', () => {
    expect([...LISTABLE_STATUSES]).toEqual(['offered', 'budget_exceeded', 'paid_disabled']);
  });

  it('a budget row is listed, priced from its page count, and not buyable', () => {
    // `recordSkippedPurchases` writes cost_usd: 0 and the pages it counted; TexasFile bills $1 a
    // page. Taking the price from `pages` is the difference between "$3.00" and "Price at checkout".
    const o = toOffer({
      ...ROW, id: 'b-1', status: 'budget_exceeded', cost_usd: 0, pages: 3, vendor_ref: null,
      failure_reason: 'Budget reached',
    });
    expect(o.priceUsd).toBe(3);
    expect(o.buyable).toBe(false);
    expect(o.note).toContain('reached its document budget');
  });

  it('does not call the operator\u2019s own budget a failure', () => {
    const line = reasonLine('budget_exceeded', false, 'TexasFile')!;
    // The run had permission, found it, and stopped at a number the operator chose. A reader told
    // "failed" distrusts their own limit; told the truth, they raise it or buy the one they want.
    expect(line).not.toMatch(/fail|error|unable|could not/i);
    expect(line).toContain('TexasFile');
  });

  it('says why a paid_disabled row is not in the file', () => {
    expect(reasonLine('paid_disabled', false, 'TexasFile')).toContain('switched off');
  });

  it('adds no note to a buyable offer, whose price and button already say it', () => {
    expect(reasonLine('offered', true, 'TexasFile')).toBeNull();
  });

  it('keeps the run\u2019s own words on a buyable offer rather than replacing them', () => {
    const o = toOffer({ ...ROW, status: 'offered', failure_reason: 'Found on the plat index' });
    expect(o.note).toBe('Found on the plat index');
  });
});

describe('offerPriceUsd', () => {
  it('prefers what the run actually priced', () => {
    expect(offerPriceUsd({ cost_usd: 7.5, pages: 99 })).toBe(7.5);
  });

  it('falls back to the page count at a dollar a page', () => {
    expect(offerPriceUsd({ cost_usd: 0, pages: 4 })).toBe(4);
  });

  it('is null when neither is known — never 0', () => {
    expect(offerPriceUsd({ cost_usd: 0, pages: 0 })).toBeNull();
    expect(offerPriceUsd({ cost_usd: null, pages: null })).toBeNull();
  });
});
