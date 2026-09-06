import { describe, it, expect } from 'vitest';
import { classifyDocType, splitBookVolPage, texasFileResultToManifest, clerkDocToManifest } from '../research/live-source-adapters.js';
import type { TexasFileResult } from '../services/texasfile-buy.js';

// Plan A7.2 — map a live TexasFile search result into the engine's ManifestEntry so the cross-source
// matcher can line it up against the free clerk's copy and the decider can price it ($1/page).

describe('classifyDocType', () => {
  it('recognises plats/surveys, deeds, easements, restrictions', () => {
    expect(classifyDocType('Subdivision Plat')).toBe('plat');
    expect(classifyDocType('MAP OF SURVEY')).toBe('plat');
    expect(classifyDocType('Warranty Deed')).toBe('deed');
    expect(classifyDocType('Deed of Trust')).toBe('deed');
    expect(classifyDocType('Right-of-Way Easement')).toBe('easement');
    expect(classifyDocType('Restrictive Covenant')).toBe('restriction');
    expect(classifyDocType('Affidavit')).toBe('other');
    expect(classifyDocType(null)).toBe('other');
  });
});

describe('splitBookVolPage', () => {
  it('pulls a book/volume and page out of the free-text field', () => {
    expect(splitBookVolPage('Vol 5456 Pg 704')).toEqual({ book: '5456', page: '704' });
    expect(splitBookVolPage('9251/668')).toEqual({ book: '9251', page: '668' });
    expect(splitBookVolPage('5456')).toEqual({ book: '5456' });
    expect(splitBookVolPage(null)).toEqual({});
  });
});

describe('texasFileResultToManifest', () => {
  const base: TexasFileResult = { guid: 'ABC-123', instrument: '2020-1234', bookVolPage: 'Vol 5456 Pg 704', pages: 3, type: 'Warranty Deed', date: '2020-05-05', text: '' } as TexasFileResult;

  it('maps identifiers, prices at $1/page, and keeps the GUID for the buy', () => {
    const m = texasFileResultToManifest(base, 'Bell');
    expect(m.sourceId).toBe('texasfile');
    expect(m.kind).toBe('paid');
    expect(m.docType).toBe('deed');
    expect(m.instrument).toBe('2020-1234');
    expect(m.book).toBe('5456');
    expect(m.page).toBe('704');
    expect(m.pageCount).toBe(3);
    expect(m.unitCostUsd).toBe(3);        // $1/page
    expect(m.previewRef).toBe('ABC-123');
    expect(m.canPurchase).toBe(true);
    expect(m.canFreeCapture).toBe(false);
  });

  it('a page-less result still costs at least $1', () => {
    const m = texasFileResultToManifest({ ...base, pages: null } as TexasFileResult, 'Bell');
    expect(m.unitCostUsd).toBe(1);
  });
});

// Plan A7.3 — free county-clerk document -> free ManifestEntry (names + date carried for matching).

describe('clerkDocToManifest', () => {
  it('maps a free clerk deed, carrying grantor/grantee + date for cross-source matching', () => {
    const m = clerkDocToManifest(
      { instrumentNumber: '2004034968', recordingDate: '2004-08-01', grantors: 'FERRELL GEORGE W', grantees: 'EVERS JONATHAN', documentType: 'Deed', pages: 3, url: 'https://clerk/doc/2004034968' },
      'kofile', 'Bell',
    );
    expect(m.sourceId).toBe('kofile');
    expect(m.kind).toBe('free');
    expect(m.docType).toBe('deed');
    expect(m.instrument).toBe('2004034968');
    expect(m.grantor).toBe('FERRELL GEORGE W');
    expect(m.grantee).toBe('EVERS JONATHAN');
    expect(m.unitCostUsd).toBe(0);
    expect(m.canFreeCapture).toBe(true);
    expect(m.canPurchase).toBe(false);
    expect(m.previewRef).toBe('https://clerk/doc/2004034968');
  });

  it('falls back to volume when no book, and tolerates missing fields', () => {
    const m = clerkDocToManifest({ volume: '5456', page: '704', documentType: 'Plat' }, 'kofile', 'Bell');
    expect(m.book).toBe('5456');
    expect(m.page).toBe('704');
    expect(m.docType).toBe('plat');
    expect(m.instrument).toBeUndefined();
  });
});
