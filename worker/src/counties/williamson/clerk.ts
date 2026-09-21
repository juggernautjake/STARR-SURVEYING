/**
 * Williamson County Clerk — Tyler Self-Service 2024.1.33.
 *
 * Driven end to end on 2026-09-21. A name search now works; see the recipe below for the exact
 * reason it did not before.
 *
 * ── THE INTERACTION THAT HAD TO BE WORKED OUT ───────────────────────────────────────────────────
 *
 * The site states the rule on its own search page and it is easy to read past:
 *
 *   "In the Both Names field, Grantor field or Grantee field, the searcher needs to either tab out
 *    of the field or click on a name in the drop down after you search on the name."
 *
 * What that sentence does not say is WHY, and the why is what defeats a scraper. These are not text
 * inputs. They are **chip lists** — `cblist-input-list` — and the visible box is a filter over the
 * county's indexed names, not the search term itself. Typing puts characters in the filter; it puts
 * nothing in the search. The value only becomes a search term when a name is SELECTED out of the
 * suggestion list and added to the holder.
 *
 * So a fill-and-submit does not return "no results". It returns **"We're sorry. Your search could
 * not be completed."** — a different sentence about a different thing, and a scraper that treats
 * them alike reports that a property has no recorded conveyance when the search never ran.
 *
 * Proven: filling "CITY OF ROUND ROCK" and submitting failed three times. Selecting the same string
 * from the dropdown and submitting returned **162 documents**, the oldest a 1976 deed from EGGER
 * STELLA with legal description "2.591 AC HARRIS W SVY ABST 298".
 *
 * ── THE RECIPE ──────────────────────────────────────────────────────────────────────────────────
 *
 *   1. GET  /user/disclaimer  → click "I Accept". Acceptance rides the session; nothing works
 *      before it.
 *   2. GET  /search/DOCSEARCH149S1
 *   3. Type into `#field_BothNamesID` ONE CHARACTER AT A TIME. A `fill()` sets the value without
 *      firing the key handlers, so the suggestion request never goes out.
 *   4. The page POSTs to `/search/suggest/{fieldId}?searchText=…&maxValues=1000`.
 *   5. The dropdown `#field_{fieldId}-aclist` populates.
 *   6. Click an item. It becomes a chip in `#field_{fieldId}-holder` — THIS is the search term.
 *   7. Click `#searchButton` (an <a>, not a submit input — `form.submit()` bypasses the page's own
 *      handler and returns an error page with a support GUID).
 *   8. Rows render as `.ss-search-row`.
 *
 * Instrument number and book/page need NONE of this: they are plain text inputs, and a fill plus a
 * click on `#searchButton` works. That is why the run order for this county puts book/page first —
 * see `WILLIAMSON_CLERK_BRIDGE`.
 */

import { WILLIAMSON_ENDPOINTS } from './config/endpoints.js';

/** The chip-list fields. Each needs the select-from-dropdown interaction above. */
export const NAME_FIELDS = ['BothNamesID', 'GrantorID', 'GranteeID'] as const;
export type NameField = (typeof NAME_FIELDS)[number];

/**
 * Plain text inputs — fill and submit.
 *
 * ── THE BOOK FIELD IS NOT THE BOOK NUMBER ───────────────────────────────────────────────────────
 *
 * The form's three boxes are labelled Book, Volume and Page, and the obvious reading — that a
 * citation like "1236/435" goes in Book and Page — is WRONG and fails silently. Proven on
 * 2026-09-21 with each search in its own session:
 *
 *     Book 1236  Page 435   →  0 rows
 *     Volume 1236 Page 435  →  1 row: 1985032996 DEED 08/29/1985, SOUTH CK 16
 *     Book 2661  Page 944   →  0 rows
 *     Volume 2661 Page 944  →  1 row: 1995001014 DEED 01/06/1995
 *
 * `Book` holds the book TYPE — the `OR`, `DEED` or `NONE` code that `parseClerkRow` already reads
 * off the first `B:` in a result row. The NUMBER lives in `Volume`. A number put in `Book` matches
 * nothing, returns no error, and reads exactly like a property with no recorded conveyance.
 *
 * (The first probe made Book 2661/944 look like it worked. It did not: the criteria from the
 * previous search were still on the session, so Volume was already 2661. Every search here gets a
 * fresh context for that reason.)
 */
export const TEXT_FIELDS = {
  instrument: 'field_DocNumID',
  /** The book TYPE code — `OR`, `DEED`, `NONE`. Never a number. */
  bookType: 'field_BookVolPageID_DOT_Book',
  /** The book NUMBER, whatever the form calls it. This is what a citation's first half means. */
  volume: 'field_BookVolPageID_DOT_Volume',
  page: 'field_BookVolPageID_DOT_Page',
  recordedFrom: 'field_RecDateID_DOT_StartDate',
  recordedTo: 'field_RecDateID_DOT_EndDate',
} as const;

/** The suggestion endpoint the chip list calls. POST, despite reading like a GET. */
export function suggestUrl(field: NameField, searchText: string, maxValues = 1000): string {
  const base = WILLIAMSON_ENDPOINTS.clerk.home.replace(/\/$/, '');
  const u = new URL(`${base}/search/suggest/${field}`);
  u.searchParams.set('searchText', searchText);
  u.searchParams.set('maxValues', String(maxValues));
  return u.toString();
}

/** DOM ids the driver needs, derived rather than written out four times. */
export function nameFieldSelectors(field: NameField) {
  return {
    input: `#field_${field}`,
    /** The suggestion dropdown. */
    list: `#field_${field}-aclist`,
    /** Where a selected name lands. A chip here IS the search term. */
    holder: `#field_${field}-holder`,
  };
}

// ── WHAT A SEARCH IS ────────────────────────────────────────────────────────────────────────────

export interface ClerkQuery {
  /** Chip-list search — needs the dropdown interaction. */
  bothNames?: string | null;
  grantor?: string | null;
  grantee?: string | null;
  /** Plain fields. */
  instrument?: string | null;
  book?: string | null;
  volume?: string | null;
  page?: string | null;
  recordedFrom?: string | null;
  recordedTo?: string | null;
}

export type ClerkSearchKind = 'instrument' | 'book_page' | 'name' | 'none';

export interface ClerkSearchPlan {
  kind: ClerkSearchKind;
  /** True when the plan needs a browser and the dropdown dance. */
  needsInteraction: boolean;
  /** Plain field id → value, safe to fill directly. */
  textFields: Record<string, string>;
  /** Chip field → the text to type and then select. */
  nameFields: Partial<Record<NameField, string>>;
  description: string;
  runnable: boolean;
  why: string;
}

const clean = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Decide how to search, cheapest and most certain first.
 *
 * The order is the point and it is the reverse of Bell's:
 *
 *   1. **Instrument number** — one document, a plain fill, no interaction. Rare here, because
 *      WCAD does not publish instrument numbers, but a deed that cites one gets the direct route.
 *   2. **Book/page** — a plain fill, no interaction, and it is what the appraisal district's Sales
 *      dataset actually gives us. This is the workhorse for Williamson.
 *   3. **Name** — needs a browser and the dropdown dance. Last, because it is the most expensive
 *      and the least precise: "CITY OF ROUND ROCK" returns 162 documents.
 */
export function planClerkSearch(q: ClerkQuery): ClerkSearchPlan {
  const textFields: Record<string, string> = {};
  const nameFields: Partial<Record<NameField, string>> = {};

  const from = clean(q.recordedFrom);
  const to = clean(q.recordedTo);
  if (from) textFields[TEXT_FIELDS.recordedFrom] = from;
  if (to) textFields[TEXT_FIELDS.recordedTo] = to;

  const instrument = clean(q.instrument);
  if (instrument) {
    textFields[TEXT_FIELDS.instrument] = instrument;
    return {
      kind: 'instrument', needsInteraction: false, textFields, nameFields,
      description: `instrument ${instrument}`,
      runnable: true,
      why: 'an instrument number names one document and needs no dropdown interaction',
    };
  }

  const book = clean(q.book);
  const volume = clean(q.volume);
  const page = clean(q.page);
  if ((book || volume) && page) {
    // Both callers' "book" and "volume" mean the same thing — the number before the slash — and
    // that number goes in the VOLUME box whichever name it arrived under. See TEXT_FIELDS.
    const number = volume || book;
    textFields[TEXT_FIELDS.volume] = number;

    // A non-numeric book is a TYPE code (`OR`, `DEED`), which is the one thing the Book box does
    // take. It narrows an otherwise ambiguous citation rather than voiding it.
    if (book && !/^\d+$/.test(book) && book !== number) textFields[TEXT_FIELDS.bookType] = book;

    textFields[TEXT_FIELDS.page] = page;
    return {
      kind: 'book_page', needsInteraction: false, textFields, nameFields,
      description: `book/volume ${number} page ${page}`,
      runnable: true,
      why: "book/page is a plain fill, and it is what WCAD's Sales dataset gives us — the workhorse for this county",
    };
  }

  // A page with no book or volume is not a citation. Sending it alone matches page N of every book
  // the county has ever recorded.
  if (page && !book && !volume) {
    return {
      kind: 'none', needsInteraction: false, textFields: {}, nameFields: {},
      description: 'a page with no book or volume',
      runnable: false,
      why: 'a page number alone matches that page in every book the county has recorded',
    };
  }

  const both = clean(q.bothNames);
  const grantor = clean(q.grantor);
  const grantee = clean(q.grantee);
  if (both) nameFields.BothNamesID = both;
  if (grantor) nameFields.GrantorID = grantor;
  if (grantee) nameFields.GranteeID = grantee;

  if (Object.keys(nameFields).length > 0) {
    return {
      kind: 'name', needsInteraction: true, textFields, nameFields,
      description: `name ${[both, grantor, grantee].filter(Boolean).join(' / ')}`,
      runnable: true,
      why: 'a name search needs a browser: the field is a filter over indexed names and the term ' +
        'only counts once it is selected from the dropdown',
    };
  }

  return {
    kind: 'none', needsInteraction: false, textFields: {}, nameFields: {},
    description: 'nothing to search on',
    runnable: false,
    why: 'no instrument, no book/page and no name — a blank search returns the whole index',
  };
}

// ── READING THE RESULTS ─────────────────────────────────────────────────────────────────────────

export interface ClerkRecord {
  instrument: string | null;
  documentType: string | null;
  recordedAt: string | null;
  book: string | null;
  page: string | null;
  grantors: string[];
  grantees: string[];
  legalDescription: string | null;
}

/** Rows render as `.ss-search-row`; each is one document. */
export const RESULT_ROW_SELECTOR = '.ss-search-row';

/**
 * Parse one rendered result row's text.
 *
 * Reads the TEXT rather than the DOM so it can be tested against a captured row, and so a class
 * rename on Tyler's side breaks one selector constant instead of the whole parser.
 *
 * A real row, verbatim from 2026-09-21:
 *
 *     19764027DRA  •  DEED  •  03/10/1976 12:00 AM
 *     Book/Page
 *     B: DEED B: 630 P: 298
 *     Grantor
 *     EGGER STELLA
 *     Grantee
 *     CITY OF ROUND ROCK
 *     Legal Description
 *     2.591 AC HARRIS W SVY ABST 298
 *
 * Note the book line's shape: `B: DEED B: 630 P: 298` — the first `B:` is the book TYPE (DEED) and
 * the second is its NUMBER. Reading the first one as the number gives "DEED" where an integer
 * belongs, which is the kind of value that survives all the way to a report.
 */
export function parseClerkRow(rowText: string): ClerkRecord | null {
  const lines = String(rowText ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // Header: "19764027DRA  •  DEED  •  03/10/1976 12:00 AM"
  const header = lines.find((l) => l.includes('•')) ?? '';
  const parts = header.split('•').map((p) => p.trim());

  const after = (label: string): string[] => {
    const i = lines.findIndex((l) => l.toLowerCase() === label.toLowerCase()
      || l.toLowerCase().startsWith(`${label.toLowerCase()} (`));
    if (i === -1) return [];
    const out: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const l = lines[j]!;
      // Stop at the next label.
      if (/^(Book\/Page|Grantor|Grantee|Legal Description)\b/i.test(l)) break;
      out.push(l);
    }
    return out;
  };

  const bookLine = after('Book/Page')[0] ?? '';
  // `B: DEED B: 630 P: 298` — take the LAST `B:` for the number, and only when it is numeric.
  const bookMatches = [...bookLine.matchAll(/B:\s*([^\s]+)/g)].map((m) => m[1]!);
  const bookNumber = bookMatches.reverse().find((b) => /^\d+$/.test(b)) ?? null;
  const pageMatch = /P:\s*(\d+)/.exec(bookLine);

  const instrument = parts[0] && parts[0].length > 2 ? parts[0] : null;
  const legal = after('Legal Description')[0] ?? null;

  return {
    instrument,
    documentType: parts[1] ?? null,
    recordedAt: parts[2] ?? null,
    book: bookNumber,
    page: pageMatch ? pageMatch[1]! : null,
    grantors: after('Grantor'),
    grantees: after('Grantee'),
    // "SEE INSTRUMENT" is what this county writes when the description is only in the document
    // itself. It is not a legal description and must not be treated as one.
    legalDescription: legal && !/^SEE INSTRUMENT$/i.test(legal) ? legal : null,
  };
}

/** How many documents the county says matched: "Showing page 1 of 2 for 162 Total Results". */
export function totalResults(pageText: string): number | null {
  const m = /for\s+([\d,]+)\s+Total Results/i.exec(String(pageText ?? ''));
  return m ? Number(m[1]!.replace(new RegExp(',', 'g'), '')) : null;
}

/**
 * Did the search actually run?
 *
 * The distinction this whole module exists for. "Your search could not be completed" means the
 * chip-list interaction was skipped — the search never happened. Zero results means it did and the
 * county has nothing. Only one of those is a fact about the property.
 */
export function searchRan(pageText: string): { ran: boolean; why: string } {
  const t = String(pageText ?? '');
  if (/could not be completed/i.test(t)) {
    return {
      ran: false,
      why: 'The clerk refused the search — a name was typed but never selected from the dropdown, ' +
        'so no search term was submitted. This is NOT "no results".',
    };
  }
  return { ran: true, why: 'the search ran' };
}
