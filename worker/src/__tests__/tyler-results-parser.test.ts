// Cards, not table rows (plan R39).
//
// Fixtures verbatim from McLennan on 2026-08-02: Either Name contains "SMITH JAMES", recorded
// 01/01/2025–12/31/2025, which the portal answered with "Showing page 1 of 1 for 14 Total Results".

import { describe, it, expect } from 'vitest';
import {
  describeParse,
  parseBanner,
  parseCard,
  parseResults,
  recordingDate,
  splitHeading,
  splitParties,
  type TylerCard,
} from '../adapters/tyler-results-parser.js';

const BANNER_TEXT = 'Showing page 1 of 1 for 14 Total Results Official Public Record Search and Copies Either Name contains SMITH JAMES*';

const CARD_LIEN: TylerCard = {
  heading: '2025032532  •  RELEASE STATE TAX LIEN',
  fields: { 'Recording Date': '10/23/2025 08:40 AM', Grantor: 'TEXAS STATE OF', Grantee: 'SMITH JAMES', 'Legal Description': '' },
  documentHref: '/web/document/DOC516S3422?search=DOCSEARCH402S1',
};

const CARD_DOT: TylerCard = {
  heading: '2025028512  •  DEED OF TRUST',
  fields: {
    'Recording Date': '09/17/2025 01:33 PM',
    'Grantor (2)': 'SMITH JAMES T\nSMITH MICHELLE P',
    'Grantee (3)': 'VALLEY WEST CORPORATION\nVALLEY WEST MORTGAGE DBA\nMORTGAGE ELECTRONIC REGISTR...',
    'Legal Description': 'Subdivision: FARWELL HEIGHTS ADDITION Lot: 13 Block: 17 2605 SUMMER AVE',
  },
  documentHref: '/web/document/DOC516S3401?search=DOCSEARCH402S1',
};

const CARD_SURVEY: TylerCard = {
  heading: '2025025692  •  RELEASE',
  fields: {
    'Recording Date': '08/25/2025 08:32 AM',
    Grantor: 'FIRST NATIONAL BANK OF MCGREGOR',
    Grantee: 'SMITH JAMES CLAYTON JR',
    'Legal Description': 'Survey Name: N D HAMMIL Acres: 0.40',
  },
};

describe('the heading splits into instrument and type', () => {
  it('splits on the bullet, not on whitespace', () => {
    // The separator is a bullet between non-breaking spaces. Splitting on the first space would
    // cut the instrument number and leave "•" heading the document type.
    expect(splitHeading(CARD_DOT.heading)).toEqual({ instrumentNumber: '2025028512', documentType: 'DEED OF TRUST' });
  });

  it('keeps a multi-word document type whole', () => {
    expect(splitHeading(CARD_LIEN.heading).documentType).toBe('RELEASE STATE TAX LIEN');
  });

  it('survives a heading with no bullet', () => {
    expect(splitHeading('2025000001')).toEqual({ instrumentNumber: '2025000001', documentType: '' });
  });
});

describe('parties', () => {
  it('splits stacked parties one per line', () => {
    expect(splitParties('SMITH JAMES T\nSMITH MICHELLE P')).toEqual(['SMITH JAMES T', 'SMITH MICHELLE P']);
  });

  it('does not split a single name on its comma', () => {
    // "SMITH, JAMES T" is one person; splitting on the comma makes two grantors and breaks the chain.
    expect(splitParties('SMITH, JAMES T')).toEqual(['SMITH, JAMES T']);
  });

  it('reads a labelled count field, not just "Grantor"', () => {
    // Tyler labels the column "Grantor (2)" when there are two.
    const row = parseCard(CARD_DOT)!;
    expect(row.grantors).toEqual(['SMITH JAMES T', 'SMITH MICHELLE P']);
    expect(row.grantees).toHaveLength(3);
  });
});

describe('the fields a surveyor actually needs', () => {
  it('keeps subdivision, lot and block', () => {
    expect(parseCard(CARD_DOT)!.legalDescription).toBe('Subdivision: FARWELL HEIGHTS ADDITION Lot: 13 Block: 17 2605 SUMMER AVE');
  });

  it('keeps survey name and acreage', () => {
    // This is why McLennan is worth having: the index itself carries the survey and the acres.
    expect(parseCard(CARD_SURVEY)!.legalDescription).toBe('Survey Name: N D HAMMIL Acres: 0.40');
  });

  it('leaves an absent legal description undefined rather than empty-string', () => {
    expect(parseCard(CARD_LIEN)!.legalDescription).toBeUndefined();
  });

  it('captures the document id needed to fetch the image', () => {
    expect(parseCard(CARD_LIEN)!.documentId).toBe('DOC516S3422');
  });

  it('drops the time from the recording date', () => {
    // Chains are ordered by day; keeping " 08:40 AM" invites string comparisons that sort wrong.
    expect(recordingDate('10/23/2025 08:40 AM')).toBe('10/23/2025');
    expect(parseCard(CARD_LIEN)!.recordingDate).toBe('10/23/2025');
  });
});

describe('the results banner', () => {
  it('reads page, pages and total', () => {
    expect(parseBanner(BANNER_TEXT)).toEqual({ page: 1, pages: 1, total: 14 });
  });

  it('handles a thousands separator', () => {
    expect(parseBanner('Showing page 2 of 40 for 1,234 Total Results')?.total).toBe(1234);
  });

  it('returns null when there is no banner', () => {
    expect(parseBanner('Some other page')).toBeNull();
  });
});

describe('dropped documents are reported, not swallowed', () => {
  it('flags a mismatch between the portal\'s count and what parsed', () => {
    // Silently returning fewer documents than the county reported is how a chain loses a link.
    const report = parseResults([CARD_LIEN, CARD_DOT], BANNER_TEXT); // banner says 14, we parsed 2
    expect(report.countMismatch).toBe(true);
    expect(describeParse(report, 'McLennan')).toContain('MISMATCH');
    expect(describeParse(report, 'McLennan')).toContain('incomplete, not as the full answer');
  });

  it('does not flag a mismatch when the counts agree', () => {
    const banner = 'Showing page 1 of 1 for 2 Total Results';
    expect(parseResults([CARD_LIEN, CARD_DOT], banner).countMismatch).toBe(false);
  });

  it('does not flag a mismatch across multiple pages', () => {
    // Page 1 of 40 legitimately holds fewer rows than the total.
    expect(parseResults([CARD_LIEN], 'Showing page 1 of 40 for 800 Total Results').countMismatch).toBe(false);
  });

  it('skips template and spacer cards without counting them as documents', () => {
    const spacer: TylerCard = { heading: '', fields: {} };
    const report = parseResults([CARD_LIEN, spacer], 'Showing page 1 of 1 for 1 Total Results');
    expect(report.rows).toHaveLength(1);
    expect(report.cardsSeen).toBe(2);
  });

  it('says so when there is no banner at all', () => {
    expect(describeParse(parseResults([CARD_LIEN], 'nothing here'), 'McLennan')).toContain('NO results banner');
  });
});
