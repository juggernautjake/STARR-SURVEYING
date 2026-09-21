/**
 * Williamson County Clerk — the search that would not run.
 *
 * Every fixture is a verbatim capture from the live site on 2026-09-21, the session in which the
 * name search was finally made to work: filling "CITY OF ROUND ROCK" and submitting failed three
 * times, selecting the same string from the dropdown returned 162 documents.
 */

import { describe, it, expect } from 'vitest';
import {
  planClerkSearch, parseClerkRow, totalResults, searchRan, suggestUrl, nameFieldSelectors,
  NAME_FIELDS, TEXT_FIELDS, RESULT_ROW_SELECTOR,
} from '../counties/williamson/clerk.js';

describe('the distinction the whole module exists for', () => {
  it('"could not be completed" is NOT "no results"', () => {
    // A scraper that treats them alike reports that a property has no recorded conveyance when the
    // search never ran. This is the sentence the site returns when the chip-list interaction was
    // skipped — captured verbatim.
    const r = searchRan("We're sorry. Your search could not be completed.");
    expect(r.ran).toBe(false);
    expect(r.why).toMatch(/never selected|not .*no results/i);
  });

  it('a page with results ran', () => {
    expect(searchRan('Showing page 1 of 2 for 162 Total Results').ran).toBe(true);
  });

  it('an ordinary empty result ran too', () => {
    // Genuinely zero matches is a fact about the property and must not be confused with a refusal.
    expect(searchRan('Showing page 1 of 1 for 0 Total Results').ran).toBe(true);
  });
});

describe('planning: cheapest and most certain first', () => {
  it('an instrument number needs no browser', () => {
    const p = planClerkSearch({ instrument: '2002019648' });
    expect(p.kind).toBe('instrument');
    expect(p.needsInteraction).toBe(false);
    expect(p.textFields[TEXT_FIELDS.instrument]).toBe('2002019648');
  });

  it('book/page needs no browser — and it is what WCAD gives us', () => {
    // The workhorse for this county. The appraisal district's Sales dataset carries book and page
    // and no instrument number at all.
    const p = planClerkSearch({ book: '630', page: '298' });
    expect(p.kind).toBe('book_page');
    expect(p.needsInteraction).toBe(false);
    expect(p.textFields[TEXT_FIELDS.book]).toBe('630');
    expect(p.textFields[TEXT_FIELDS.page]).toBe('298');
  });

  it('a volume works in place of a book', () => {
    const p = planClerkSearch({ volume: '1539', page: '526' });
    expect(p.kind).toBe('book_page');
    expect(p.textFields[TEXT_FIELDS.volume]).toBe('1539');
  });

  it('REFUSES a page with no book or volume', () => {
    // That is not a citation — it matches page 298 in every book the county has ever recorded.
    const p = planClerkSearch({ page: '298' });
    expect(p.runnable).toBe(false);
    expect(p.why).toMatch(/every book/i);
  });

  it('a name search is last, and says it needs a browser', () => {
    const p = planClerkSearch({ bothNames: 'CITY OF ROUND ROCK' });
    expect(p.kind).toBe('name');
    expect(p.needsInteraction).toBe(true);
    expect(p.nameFields.BothNamesID).toBe('CITY OF ROUND ROCK');
    expect(p.why).toMatch(/selected from the dropdown/i);
  });

  it('an instrument beats a name when both are known', () => {
    const p = planClerkSearch({ instrument: '2002019648', bothNames: 'SMITH JAMES' });
    expect(p.kind).toBe('instrument');
    expect(p.nameFields).toEqual({});
  });

  it('book/page beats a name', () => {
    const p = planClerkSearch({ book: '630', page: '298', grantor: 'EGGER STELLA' });
    expect(p.kind).toBe('book_page');
  });

  it('a date range rides along with any search', () => {
    const p = planClerkSearch({ instrument: '123', recordedFrom: '01/01/1970', recordedTo: '12/31/1980' });
    expect(p.textFields[TEXT_FIELDS.recordedFrom]).toBe('01/01/1970');
    expect(p.textFields[TEXT_FIELDS.recordedTo]).toBe('12/31/1980');
  });

  it('a blank query is refused', () => {
    const p = planClerkSearch({});
    expect(p.runnable).toBe(false);
    expect(p.kind).toBe('none');
    expect(p.why).toMatch(/whole index/i);
  });

  it.each([
    ['empty strings', { instrument: '', bothNames: '' }],
    ['whitespace', { instrument: '   ' }],
    ['nulls', { instrument: null, book: null, page: null, bothNames: null }],
  ])('%s is not a search', (_l, q) => {
    expect(planClerkSearch(q).runnable).toBe(false);
  });
});

describe('the suggestion endpoint', () => {
  it('is built from the field id', () => {
    const u = suggestUrl('BothNamesID', 'CITY OF ROUND ROCK');
    expect(u).toContain('/search/suggest/BothNamesID');
    // `URLSearchParams` writes a space as `+`, and `decodeURIComponent` does not undo that — it
    // only handles `%20`. Third time this has caught a test in this repo today.
    expect(decodeURIComponent(u).split('+').join(' ')).toContain('searchText=CITY OF ROUND ROCK');
    expect(u).toContain('maxValues=1000');
  });

  it('covers all three chip fields', () => {
    expect(NAME_FIELDS).toEqual(['BothNamesID', 'GrantorID', 'GranteeID']);
    for (const f of NAME_FIELDS) expect(suggestUrl(f, 'x')).toContain(`/suggest/${f}`);
  });

  it('the selectors name the holder, which is what actually carries the term', () => {
    const s = nameFieldSelectors('GrantorID');
    expect(s.input).toBe('#field_GrantorID');
    expect(s.list).toBe('#field_GrantorID-aclist');
    expect(s.holder).toBe('#field_GrantorID-holder');
  });
});

/** Verbatim from the live results page, 2026-09-21. */
const ROW = `19764027DRA  •  DEED  •  03/10/1976 12:00 AM
Book/Page
B: DEED B: 630 P: 298
Grantor
EGGER STELLA
Grantee
CITY OF ROUND ROCK
Legal Description
2.591 AC HARRIS W SVY ABST 298`;

describe('reading a result row', () => {
  const r = parseClerkRow(ROW)!;

  it('reads the header', () => {
    expect(r.instrument).toBe('19764027DRA');
    expect(r.documentType).toBe('DEED');
    expect(r.recordedAt).toBe('03/10/1976 12:00 AM');
  });

  it('takes the book NUMBER, not the book TYPE', () => {
    // "B: DEED B: 630 P: 298" — the first B: is the book type and the second is its number.
    // Reading the first gives "DEED" where an integer belongs, and that value survives to a report.
    expect(r.book).toBe('630');
    expect(r.page).toBe('298');
  });

  it('reads the parties and the legal description', () => {
    expect(r.grantors).toEqual(['EGGER STELLA']);
    expect(r.grantees).toEqual(['CITY OF ROUND ROCK']);
    expect(r.legalDescription).toBe('2.591 AC HARRIS W SVY ABST 298');
  });

  it('handles several grantors, which the page labels "Grantor (3)"', () => {
    const multi = `19813628DRA  •  ASSIGNMENT/TRANSFERS  •  04/24/1981 12:00 AM
Book/Page
B: DEED B: 834 P: 417
Grantor (3)
E & T MASONRY CONSTRUCTION COMPANY INCORPORATED
MAYS NELSON
MAYS LOLA MAE
Grantee
CITY OF ROUND ROCK
Legal Description
0.166 AC HARRELL J M SVY ABST 284`;
    const m = parseClerkRow(multi)!;
    expect(m.grantors).toHaveLength(3);
    expect(m.grantors[0]).toContain('E & T MASONRY');
    expect(m.grantees).toEqual(['CITY OF ROUND ROCK']);
  });

  it('treats "SEE INSTRUMENT" as no legal description', () => {
    // What this county writes when the description exists only in the document. Carrying it
    // forward as a legal description would put the words "SEE INSTRUMENT" in a title chain.
    const easement = `19787891DR  •  EASEMENT  •  04/25/1978 12:00 AM
Book/Page
B: DEED B: 708 P: 769
Grantor
SINGLETON ROBERT
Grantee
CITY OF ROUND ROCK
Legal Description
SEE INSTRUMENT`;
    expect(parseClerkRow(easement)!.legalDescription).toBeNull();
  });

  it('returns null for an empty row rather than a shell', () => {
    expect(parseClerkRow('')).toBeNull();
    expect(parseClerkRow('   ')).toBeNull();
  });
});

describe('the result count', () => {
  it('reads the total the county states', () => {
    expect(totalResults('Showing page 1 of 2 for 162 Total Results')).toBe(162);
  });

  it('handles a thousands separator', () => {
    expect(totalResults('Showing page 1 of 90 for 4,482 Total Results')).toBe(4482);
  });

  it('is null when the page does not say', () => {
    expect(totalResults('something else entirely')).toBeNull();
  });
});

describe('the row selector is recorded in one place', () => {
  it('so a Tyler class rename breaks one constant, not the parser', () => {
    expect(RESULT_ROW_SELECTOR).toBe('.ss-search-row');
  });
});
