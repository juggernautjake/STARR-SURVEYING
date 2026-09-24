// __tests__/research/identity-backfill.test.ts — a key that does not match the worker's is no key.
//
// Owner, 2026-09-23: the Bell plats have no `identity_key`, so the library can only be asked "do
// you have a plat whose LABEL looks like GLENDALE?" and never "do you have the plat recorded at
// Cabinet D, Slide 19-B?". The catalogue now reads a citation off 98% of sheets, so the second
// question is answerable — if the key built from that citation is bit-for-bit what the worker would
// build from a vendor's search result.
//
// ── THE FAILURE THIS FILE EXISTS TO PREVENT ─────────────────────────────────────────────────────
//
// The backfill script and `worker/src/research/document-identity.ts` are separate builds that
// cannot import each other, so the script carries a copy of the normalisers. A copy that drifts
// does not throw, does not log, and does not fail a test — it produces keys that simply never match
// anything, and the library goes on looking empty. Every case below is run through BOTH and
// compared.
import { describe, it, expect } from 'vitest';
import {
  refFromCatalogue, instrumentFrom, bookPageFrom,
  identityKey as scriptKey,
} from '../../scripts/backfill-identity-keys.mjs';
import { identityKey as workerKey } from '@/worker/src/research/document-identity';

/** Citations taken verbatim from the first 198 catalogued Bell plats. */
const REAL_CITATIONS = [
  'Plat # 46; Instrument No. 2015-16512',
  'Plat #8, Plat Records of Bell County, Texas; Inst# 2018-2679',
  'Vol. 874, Page 443',
  'Cabinet C, Slide 62-H',
  'Instrument #2023-014539',
  'Cabinet D, Slide D1203-D; Inst# 53275',
  'Instrument No. 2020067808',
  'Cabinet D, Slide 19-B',
  'Document No. 2026001899',
  'Instr # 2011-00005489, Cabinet D, Slide 3130',
  'Dedication Vol. 2342, Page 35',
  'Doc # 2014-504',
];

describe('the script and the worker build the same key', () => {
  it('agree on every real citation, with and without a date', () => {
    for (const citation of REAL_CITATIONS) {
      for (const date of [undefined, '2004-11-19', '11/19/2004']) {
        const ref = {
          county: 'Bell',
          instrumentNumber: instrumentFrom(citation),
          ...bookPageFrom(citation),
          recordingDate: date,
        };
        expect(scriptKey(ref), `disagreement on "${citation}" (date ${date ?? 'none'})`).toBe(workerKey(ref));
      }
    }
  });

  it('agree on the shapes that produce no key at all', () => {
    for (const ref of [
      { county: '' },
      { county: 'Bell' },
      { county: 'Bell', instrumentNumber: '53275' },          // not year-stamped, no date
      { county: 'Bell', book: 'D', page: '19-B' },            // book/page always needs a date
    ]) {
      expect(scriptKey(ref)).toBe(workerKey(ref));
      expect(scriptKey(ref)).toBeNull();
    }
  });
});

describe('reading a citation', () => {
  it('takes the instrument number, not the plat number beside it', () => {
    // "Plat # 46; Instrument No. 2015-16512" keyed on 46 would collide with every other plat 46.
    expect(instrumentFrom('Plat # 46; Instrument No. 2015-16512')).toBe('2015-16512');
    expect(instrumentFrom('Plat #8, Plat Records of Bell County, Texas; Inst# 2018-2679')).toBe('2018-2679');
  });

  it('never treats a bare number as an instrument number', () => {
    // A plat number, a sheet number and a lot count are all bare numbers on these sheets.
    expect(instrumentFrom('Plat # 46')).toBeUndefined();
    expect(instrumentFrom('Sheet 2 of 3')).toBeUndefined();
  });

  it('reads a cabinet and slide as book and page', () => {
    // A plat's cabinet/slide IS its citation — the clerk's plat records are a separate series from
    // the deed volumes, and `normaliseBookPage` keeps letters so D-19B survives intact.
    expect(bookPageFrom('Cabinet D, Slide 19-B')).toEqual({ book: 'D', page: '19-B' });
    expect(bookPageFrom('Vol. 874, Page 443')).toEqual({ book: '874', page: '443' });
  });

  it('finds nothing in a citation that carries neither', () => {
    expect(bookPageFrom('Plat Year 2014, Number 84')).toEqual({});
    expect(bookPageFrom(null)).toEqual({});
  });
});

describe('a key is only built from something the reader was sure of', () => {
  const cat = (refConf: string, dateConf: string, value = 'Cabinet D, Slide 19-B', date: string | null = '2004-11-19') => ({
    recording_reference: { value, confidence: refConf, source_text: 'as printed' },
    recorded_date: { value: date, confidence: dateConf, source_text: 'as printed' },
  });

  it('builds one when the citation is high and the date is high', () => {
    expect(refFromCatalogue(cat('high', 'high'), 'bell')).toMatchObject({ book: 'D', page: '19-B', recordingDate: '2004-11-19' });
  });

  it('refuses a citation the reader was only fairly sure of', () => {
    // Same rule as `mayMatchAutomatically` in catalogue-schema.ts. A missing key is the status quo;
    // a WRONG key is new damage, and it points a run at the wrong document confidently.
    expect(refFromCatalogue(cat('medium', 'high'), 'bell')).toBeNull();
    expect(refFromCatalogue(cat('low', 'high'), 'bell')).toBeNull();
  });

  it('drops a doubtful DATE rather than the whole reference', () => {
    // The citation is still worth having: a year-stamped instrument number needs no date at all.
    const ref = refFromCatalogue(cat('high', 'low', 'Instrument No. 2020067808', null), 'bell');
    expect(ref?.recordingDate).toBeUndefined();
    expect(scriptKey(ref!)).toBe('BELL|I:2020067808');
  });

  it('a guessed date never reaches a key', () => {
    // A book/page citation with an unsure date produces no key, because the date is load-bearing
    // there — instrument numbers restart across years.
    const ref = refFromCatalogue(cat('high', 'medium'), 'bell');
    expect(ref?.recordingDate).toBeUndefined();
    expect(scriptKey(ref!)).toBeNull();
  });
});

describe('what the keys are for', () => {
  it('a year-stamped instrument number keys without a date, so two roads to one plat agree', () => {
    // The worker's own comment: plat 1982002520 was on file three times, every row with a null key,
    // because the plat upload carried no date and the clerk sink did.
    expect(scriptKey({ county: 'Bell', instrumentNumber: '2015-16512' })).toBe('BELL|I:201516512');
    expect(scriptKey({ county: 'Bell', instrumentNumber: '2015-16512', recordingDate: '2015-05-06' })).toBe('BELL|I:201516512');
  });

  it('the same citation written two ways produces one key', () => {
    // The whole point: one vendor writes OR/00062/223 and another writes OR 62 223.
    expect(scriptKey({ county: 'Bell', instrumentNumber: 'OR/00062/223', recordingDate: '2004-11-19' }))
      .toBe(scriptKey({ county: 'Bell', instrumentNumber: 'OR 62 223', recordingDate: '11/19/2004' }));
  });

  it('two different documents do not collide', () => {
    expect(scriptKey({ county: 'Bell', book: 'D', page: '19-B', recordingDate: '2004-11-19' }))
      .not.toBe(scriptKey({ county: 'Bell', book: 'D', page: '19-C', recordingDate: '2004-11-19' }));
  });
});
