// worker/src/__tests__/buy-one-offer.test.ts — what one click is allowed to do.
//
// The interesting functions here are three lines each and each one guards real money or fetches the
// wrong document. They are pulled out of `buyOneOffer` precisely so they can be tested without a
// browser, a TexasFile login, or a charge.
import { describe, it, expect } from 'vitest';
import { ceilingFor, productFor, instrumentToSearch } from '../services/buy-one-offer.js';

describe('ceilingFor — the cap on a single click', () => {
  it('allows a little over the estimate, because pages are counted from an index', () => {
    // TexasFile bills per page and its index page count can be one out. A ceiling set exactly at
    // the estimate turns an off-by-one into a refused purchase the operator cannot explain.
    expect(ceilingFor(4)).toBeGreaterThan(4);
    expect(ceilingFor(4)).toBeLessThanOrEqual(6.5);
  });

  it('scales with the estimate rather than adding a flat margin to a large one', () => {
    // +$2 on a $4 document is half again; +$2 on a $40 document is noise. The larger of the two
    // rules applies, so neither end of the range gets the wrong kind of slack.
    expect(ceilingFor(40)).toBe(50);
    expect(ceilingFor(4)).toBe(6);
  });

  // ── THE ONE THAT STOPS A SURPRISE ─────────────────────────────────────────────────────────────
  // A row whose price we do not know renders as "Price at checkout". Without a cap, one click on a
  // 60-page abstract is a $60 charge from a button that never showed a number.
  it('caps an unknown price rather than letting it run', () => {
    expect(ceilingFor(null)).toBe(15);
    expect(ceilingFor(0)).toBe(15);
  });

  it('never returns something falsy, which would read as no ceiling at all', () => {
    for (const estimate of [null, 0, 1, 4, 40, 1000]) {
      expect(ceilingFor(estimate)).toBeGreaterThan(0);
    }
  });
});

describe('productFor — which TexasFile index to buy from', () => {
  it('sends plats to the plat records', () => {
    // A plat has no instrument number. Bought through the instrument index it is searched as a
    // deed, finds nothing, and the buy fails — the bug that made a located plat unbuyable.
    expect(productFor('PLAT')).toBe('plat');
    expect(productFor('Subdivision Plat')).toBe('plat');
  });

  it('sends everything else through instruments', () => {
    expect(productFor('WARRANTY DEED')).toBe('instrument');
    expect(productFor(null)).toBe('instrument');
    expect(productFor('')).toBe('instrument');
  });
});

describe('instrumentToSearch — what to put in the search box', () => {
  it('passes a real instrument number through', () => {
    expect(instrumentToSearch('2019-12345')).toBe('2019-12345');
    expect(instrumentToSearch('V55 P12')).toBe('V55 P12');
  });

  it('turns the REF: placeholder into a search_required marker', () => {
    // `REF:<guid>` is what `recordOffers` writes when a document has no instrument number and no
    // book/page — it exists to satisfy a NOT NULL column. Typed into TexasFile's search box it
    // matches nothing; the GUID is what identifies the document and it is passed separately.
    expect(instrumentToSearch('REF:8f3a-2b91')).toBe('search_required');
  });
});
