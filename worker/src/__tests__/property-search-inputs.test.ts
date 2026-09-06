import { describe, it, expect } from 'vitest';
import { documentRelevance, type PropertySearchInputs, type DocIdentifiers } from '../research/property-search-inputs.js';

// Plan H1 — property id + address are the MAIN keys; instrument/name/volume-page/cabinet are
// supplemental (grain of salt). A doc matching the right id/address is relevant regardless of the rest;
// supplemental info never rejects a document.

const inputs: PropertySearchInputs = {
  county: 'Bell',
  propertyId: '64567',
  address: '1401 North East Street, Belton, TX 76513',
  instrumentNumbers: ['2020-1234'],
  ownerNames: ['George W. Ferrell', 'Evers'],
  volumePages: [{ volume: '5456', page: '704' }],
  cabinetSlides: [{ cabinet: 'A', slide: '166-APR' }],
};

function doc(p: Partial<DocIdentifiers>): DocIdentifiers { return p; }

describe('documentRelevance', () => {
  it('a document with the correct property ID is relevant even with no other fields', () => {
    const r = documentRelevance(doc({ propertyId: '64567' }), inputs);
    expect(r.relevant).toBe(true);
    expect(r.mainMatches).toContain('propertyId');
  });

  it('a document at the correct address is relevant (tolerant of St vs Street + city/zip noise)', () => {
    const r = documentRelevance(doc({ address: '1401 NE St, Belton' }), inputs);
    expect(r.relevant).toBe(true);
    expect(r.mainMatches).toContain('address');
  });

  it('an exact supplemental identifier (volume/page) makes a document relevant on its own', () => {
    const r = documentRelevance(doc({ volume: '5456', page: '704' }), inputs);
    expect(r.relevant).toBe(true);
    expect(r.supplementalMatches).toContain('volumePage');
  });

  it('a plat cabinet/slide matches even with a suffix on the slide', () => {
    const r = documentRelevance(doc({ cabinet: 'A', slide: '166' }), inputs);
    expect(r.relevant).toBe(true);
    expect(r.supplementalMatches).toContain('cabinetSlide');
  });

  it('a NAME match alone does not make an unrelated document relevant (supplemental only adds confidence)', () => {
    const r = documentRelevance(doc({ ownerNames: ['George W. Ferrell'] }), inputs);
    expect(r.supplementalMatches).toContain('name');
    expect(r.relevant).toBe(false); // no id/address/instrument/vol-page/cabinet → not relevant on a name alone
  });

  it('does NOT reject a property-ID match just because the supplemental info does not line up', () => {
    const r = documentRelevance(doc({ propertyId: '64567', ownerNames: ['SOMEONE ELSE'], volume: '9999', page: '1' }), inputs);
    expect(r.relevant).toBe(true);   // grain of salt: mismatched supplemental never vetoes
    expect(r.mainMatches).toContain('propertyId');
  });

  it('a document tied to none of the keys is not relevant', () => {
    const r = documentRelevance(doc({ propertyId: '99999', instrument: '0000' }), inputs);
    expect(r.relevant).toBe(false);
  });

  it('id + address + instrument stack to the highest confidence', () => {
    const strong = documentRelevance(doc({ propertyId: '64567', address: '1401 North East Street, Belton, TX 76513', instrument: '2020-1234' }), inputs);
    const weak = documentRelevance(doc({ propertyId: '64567' }), inputs);
    expect(strong.confidence).toBeGreaterThan(weak.confidence);
    expect(strong.confidence).toBeGreaterThanOrEqual(0.9);
  });
});
