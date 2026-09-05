import { describe, it, expect } from 'vitest';
import {
  buildWantList,
  mostRecentDeed,
  parseSubdivisionLot,
  type Want,
} from '../research/acquisition-wantlist.js';

// Plan GATHER_AND_REVIEW_SPLIT G3 — the Gather want-list. The order here IS the spend order (plats
// before deeds, subject before adjoiners), and the "most recent deed" pick decides which deed the
// run pays for, so both are pinned.

const kind = (w: Want) => `${w.target}${w.adjoinerId ? `:${w.adjoinerId}` : ''}/${w.kind}`;

describe('buildWantList — ordering', () => {
  it('puts subject plat, then subject deed, then adjoiner plats, then adjoiner deeds', () => {
    const wants = buildWantList({
      subject: { ownerName: 'SMITH TOMMY' },
      adjoiners: [
        { id: 'A1', ownerName: 'JONES' },
        { id: 'A2', ownerName: 'LEE' },
      ],
    });
    expect(wants.map(kind)).toEqual([
      'subject/plat',
      'subject/recent_deed',
      'adjoiner:A1/plat',
      'adjoiner:A2/plat',
      'adjoiner:A1/recent_deed',
      'adjoiner:A2/recent_deed',
    ]);
    // order is a dense 0..n-1 sequence
    expect(wants.map((w) => w.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('always emits the two subject wants even with no known documents or adjoiners', () => {
    const wants = buildWantList({ subject: {} });
    expect(wants).toHaveLength(2);
    expect(wants.map(kind)).toEqual(['subject/plat', 'subject/recent_deed']);
  });

  it('carries the document category for each want', () => {
    const wants = buildWantList({ subject: {}, adjoiners: [{ id: 'A1' }] });
    expect(wants.find((w) => w.kind === 'plat')!.documentType).toBe('plat');
    expect(wants.find((w) => w.kind === 'recent_deed')!.documentType).toBe('deed');
  });
});

describe('buildWantList — search-key derivation', () => {
  it('uses a known plat citation for the subject plat want', () => {
    const wants = buildWantList({
      subject: {
        knownDocuments: [{ type: 'plat', book: '12', page: '340', instrument: 'PL-1' }],
      },
    });
    const plat = wants.find((w) => w.kind === 'plat')!;
    expect(plat.book).toBe('12');
    expect(plat.page).toBe('340');
    expect(plat.instrument).toBe('PL-1');
  });

  it('derives subdivision + lot from the legal description when no plat citation exists', () => {
    const wants = buildWantList({
      subject: { legalDescription: 'LOT 5, BLOCK 2, OAK HILLS SUBDIVISION' },
    });
    const plat = wants.find((w) => w.kind === 'plat')!;
    expect(plat.lot).toBe('5');
    expect(plat.subdivision).toBe('OAK HILLS');
  });

  it('falls back to the owner name for searching', () => {
    const wants = buildWantList({ subject: { ownerName: 'SMITH TOMMY' } });
    expect(wants.find((w) => w.kind === 'recent_deed')!.name).toBe('SMITH TOMMY');
  });

  it('names adjoiner wants by the adjoiner owner', () => {
    const wants = buildWantList({ subject: {}, adjoiners: [{ id: 'A1', ownerName: 'JONES MARY' }] });
    expect(wants.find((w) => w.adjoinerId === 'A1' && w.kind === 'recent_deed')!.name).toBe('JONES MARY');
  });
});

describe('mostRecentDeed', () => {
  it('picks the newest deed by recording date (ISO and US formats)', () => {
    const docs = [
      { type: 'deed', instrument: 'old', recordingDate: '2001-06-01' },
      { type: 'deed', instrument: 'new', recordingDate: '05/12/2019' },
      { type: 'deed', instrument: 'mid', recordingDate: '2010-01-01' },
      { type: 'plat', instrument: 'plat', recordingDate: '2020-01-01' }, // not a deed
    ];
    expect(mostRecentDeed(docs)!.instrument).toBe('new');
  });

  it('returns null when there is no deed', () => {
    expect(mostRecentDeed([{ type: 'plat' }])).toBeNull();
    expect(mostRecentDeed([])).toBeNull();
    expect(mostRecentDeed(undefined)).toBeNull();
  });

  it('feeds the subject recent-deed want its citation + date', () => {
    const wants = buildWantList({
      subject: {
        knownDocuments: [
          { type: 'deed', book: '9', page: '1', recordingDate: '1999-01-01' },
          { type: 'deed', book: '44', page: '212', recordingDate: '2021-03-03' },
        ],
      },
    });
    const deed = wants.find((w) => w.kind === 'recent_deed')!;
    expect(deed.book).toBe('44');
    expect(deed.page).toBe('212');
    expect(deed.recordingDate).toBe('2021-03-03');
  });
});

describe('parseSubdivisionLot', () => {
  it('reads lot + subdivision from common legal phrasings', () => {
    expect(parseSubdivisionLot('LOT 12, CEDAR RIDGE ADDITION')).toEqual({ lot: '12', subdivision: 'CEDAR RIDGE' });
    expect(parseSubdivisionLot('Lots 3 of RIVER OAKS ESTATES')).toMatchObject({ lot: '3', subdivision: 'RIVER OAKS' });
  });

  it('returns empty for an abstract/metes-and-bounds legal with neither', () => {
    expect(parseSubdivisionLot('A0123 JOHN DOE SURVEY, ACRES 10.0')).not.toHaveProperty('lot');
    expect(parseSubdivisionLot(undefined)).toEqual({});
  });
});
