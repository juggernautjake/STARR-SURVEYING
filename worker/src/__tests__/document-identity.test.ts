// Never pay twice, and never skip a document we do not have (plan S-12).
//
// Every citation format below is real, collected while building the six adapters.

import { describe, it, expect } from 'vitest';
import {
  DocumentIndex,
  compareDocuments,
  identityKey,
  normaliseBookPage,
  normaliseDate,
  normaliseInstrument,
} from '../research/document-identity.js';

describe('the same instrument, cited six different ways', () => {
  it('matches Kofile\'s hyphenated form to a plain one', () => {
    // Kofile prints 2019-3389; another vendor may print 20193389.
    expect(normaliseInstrument('2019-3389')).toBe(normaliseInstrument('20193389'));
  });

  it('strips leading zeros without emptying the value', () => {
    expect(normaliseInstrument('000001')).toBe('1');
    expect(normaliseInstrument('0')).toBe('0');
  });

  it('keeps a trailing letter, because it distinguishes real documents', () => {
    // Bell County GLO grants 000001 and 000001A are different grants. A looser rule merges them.
    expect(normaliseInstrument('000001')).not.toBe(normaliseInstrument('000001A'));
  });

  it('handles the Avenu citation shape', () => {
    expect(normaliseInstrument('OR/00062/223')).toBe('OR62223');
  });

  it('returns empty for nothing, rather than a key that matches everything', () => {
    expect(normaliseInstrument(undefined)).toBe('');
    expect(normaliseInstrument('   ')).toBe('');
  });
});

describe('book and page', () => {
  it('normalises padding away', () => {
    expect(normaliseBookPage('00062', '223')).toBe('62-223');
  });

  it('keeps a LETTERED volume as a string', () => {
    // Robertson's 19th-century volumes are 0000U, 0000R. Number("0000U") is NaN.
    expect(normaliseBookPage('0000U', '271')).toBe('U-271');
    expect(normaliseBookPage('0000U', '271')).not.toBe(normaliseBookPage('0000R', '271'));
  });

  it('returns empty when either half is missing', () => {
    expect(normaliseBookPage('412', undefined)).toBe('');
    expect(normaliseBookPage(undefined, '88')).toBe('');
  });
});

describe('dates', () => {
  it('reads both formats the vendors use', () => {
    expect(normaliseDate('10/24/1974')).toBe('1974-10-24');
    expect(normaliseDate('1974-10-24')).toBe('1974-10-24');
  });

  it('drops a time component', () => {
    expect(normaliseDate('10/23/2025 08:40 AM')).toBe('2025-10-23');
  });

  it('returns empty rather than guessing', () => {
    // Two documents with unreadable dates must not look identical.
    expect(normaliseDate('sometime in 1974')).toBe('');
    expect(normaliseDate(undefined)).toBe('');
  });
});

describe('the identity key', () => {
  it('includes the county, because instrument numbers repeat across counties', () => {
    const bell = identityKey({ county: 'Bell', instrumentNumber: '2325', recordingDate: '10/24/1974' });
    const milam = identityKey({ county: 'Milam', instrumentNumber: '2325', recordingDate: '10/24/1974' });
    expect(bell).not.toBe(milam);
  });

  it('includes the date, because instrument numbers RESTART', () => {
    const a = identityKey({ county: 'Bell', instrumentNumber: '4471', recordingDate: '03/02/1994' });
    const b = identityKey({ county: 'Bell', instrumentNumber: '4471', recordingDate: '03/02/2011' });
    expect(a).not.toBe(b);
  });

  it('falls back to book/page for vendors that publish no instrument number', () => {
    // Avenu publishes none at all.
    const k = identityKey({ county: 'Robertson', book: '0000U', page: '271', recordingDate: '9/13/1871' });
    expect(k).toContain('B:U-271');
  });

  it('refuses to key a reference with no date', () => {
    // Keying on a number that may repeat across years would merge unrelated documents.
    expect(identityKey({ county: 'Bell', instrumentNumber: '2325' })).toBeNull();
  });

  it('refuses to key a reference with no county', () => {
    expect(identityKey({ county: '', instrumentNumber: '2325', recordingDate: '10/24/1974' })).toBeNull();
  });
});

describe('comparing two references', () => {
  const base = { county: 'Bell', instrumentNumber: '2325', recordingDate: '10/24/1974' };

  it('calls two identical citations the same', () => {
    expect(compareDocuments(base, { ...base, vendor: 'other' }).kind).toBe('same');
  });

  it('matches across vendor formatting', () => {
    const kofile = { county: 'Bell', instrumentNumber: '2019-3389', recordingDate: '5/6/2019' };
    const other = { county: 'BELL COUNTY', instrumentNumber: '20193389', recordingDate: '2019-05-06' };
    expect(compareDocuments(kofile, other).kind).toBe('same');
  });

  it('calls different counties different', () => {
    expect(compareDocuments(base, { ...base, county: 'Milam' }).kind).toBe('different');
  });

  it('is UNCERTAIN on same instrument, different date', () => {
    // The restart case — exactly where a careless rule merges two unrelated conveyances.
    const v = compareDocuments(base, { ...base, recordingDate: '03/02/2011' });
    expect(v.kind).toBe('uncertain');
    if (v.kind === 'uncertain') expect(v.reason).toContain('restart');
  });

  it('is UNCERTAIN when one side cannot be identified', () => {
    const v = compareDocuments(base, { county: 'Bell', instrumentNumber: '2325' });
    expect(v.kind).toBe('uncertain');
    if (v.kind === 'uncertain') expect(v.reason).toContain('treat as NOT already held and buy it');
  });
});

describe('the purchase decision fails toward buying', () => {
  const held = { county: 'Bell', instrumentNumber: '2325', recordingDate: '10/24/1974', vendor: 'kofile' };

  it('skips a document we already hold free', () => {
    const ix = new DocumentIndex();
    ix.register(held, 'free');
    const d = ix.decide({ county: 'Bell', instrumentNumber: '2325', recordingDate: '10/24/1974' });
    expect(d.buy).toBe(false);
    expect(d.reason).toContain('Already held from a free source');
  });

  it('skips it even when the paid vendor formats the number differently', () => {
    const ix = new DocumentIndex();
    ix.register({ county: 'Bell', instrumentNumber: '2019-3389', recordingDate: '5/6/2019' }, 'free');
    expect(ix.decide({ county: 'Bell', instrumentNumber: '20193389', recordingDate: '2019-05-06' }).buy).toBe(false);
  });

  it('BUYS when the candidate cannot be identified', () => {
    // A skipped document we do not have is unrecoverable; a duplicate costs a few dollars.
    const ix = new DocumentIndex();
    ix.register(held, 'free');
    const d = ix.decide({ county: 'Bell', instrumentNumber: '2325' });
    expect(d.buy).toBe(true);
    expect(d.underUncertainty).toBe(true);
    expect(d.reason).toContain('unrecoverable');
  });

  it('BUYS on a near miss, and says which document it nearly matched', () => {
    const ix = new DocumentIndex();
    ix.register(held, 'free');
    const d = ix.decide({ county: 'Bell', instrumentNumber: '2325', recordingDate: '03/02/2011' });
    expect(d.buy).toBe(true);
    expect(d.underUncertainty).toBe(true);
    expect(d.matchedKey).toBeDefined();
    expect(d.reason).toContain('rather than risking an omission');
  });

  it('buys a genuinely new document without flagging uncertainty', () => {
    const ix = new DocumentIndex();
    ix.register(held, 'free');
    const d = ix.decide({ county: 'Bell', instrumentNumber: '9999', recordingDate: '01/02/2020' });
    expect(d.buy).toBe(true);
    expect(d.underUncertainty).toBe(false);
  });
});

describe('the index reports what it cannot check', () => {
  it('counts references it could not key', () => {
    // Silently dropping them would mean the duplicate check quietly stops applying.
    const ix = new DocumentIndex();
    expect(ix.register({ county: 'Bell', instrumentNumber: '2325' }, 'free')).toBe(false);
    expect(ix.unkeyableCount).toBe(1);
    expect(ix.describe()).toContain('could NOT be keyed');
    expect(ix.describe()).toContain('will be bought again');
  });

  it('reports the free/paid split', () => {
    const ix = new DocumentIndex();
    ix.register({ county: 'Bell', instrumentNumber: '1', recordingDate: '01/01/2020' }, 'free');
    ix.register({ county: 'Bell', instrumentNumber: '2', recordingDate: '01/01/2020' }, 'paid');
    expect(ix.describe()).toContain('2 document(s) held (1 free, 1 paid)');
  });

  it('lets a free copy supersede a paid one', () => {
    // What matters afterwards is that we hold it and did not pay again.
    const ix = new DocumentIndex();
    const ref = { county: 'Bell', instrumentNumber: '5', recordingDate: '01/01/2020' };
    ix.register(ref, 'paid');
    ix.register(ref, 'free');
    expect(ix.all()[0].cost).toBe('free');
    expect(ix.size).toBe(1);
  });
});
