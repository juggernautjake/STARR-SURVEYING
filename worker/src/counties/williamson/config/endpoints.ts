/**
 * Williamson County — every endpoint, driven by hand on 2026-09-21.
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────────────────────────
 *
 * Because the previous configuration pointed at a host that has never existed. `bis-cad.ts` had
 * Williamson on `esearch.wilcotx.gov`, which returns NXDOMAIN from public DNS — not blocked, not
 * geo-fenced, simply not a hostname. Job 26144's run spent 33 seconds failing against it twice,
 * once by direct fetch and once through the Browserbase tunnel, and reported "Cannot reach" both
 * times. A proxy cannot tunnel to a host that does not resolve either, so the two errors looked
 * like a network problem and were a typo.
 *
 * The district is WCAD, on wcad.org, and it is not a BIS county — `search.wcad.org` serves True
 * Automation / Tyler PublicAccess on DNN. Everything below was called and its answer read; the
 * full write-up is docs/research/williamson-county-discovery-2026-09-21.md.
 */

export const WILLIAMSON_ENDPOINTS = {
  /** 48491. */
  fipsCode: '48491',

  cad: {
    vendor: 'true_automation' as const,
    home: 'https://search.wcad.org/',
    /**
     * Free-text property search. JSON, no auth, no cookie, no referer check — measured at 200 in
     * 0.164s on 2026-09-21.
     *
     * This one call replaces the whole Stage 1 address-variant dance: it answered "1007 CUSHING"
     * — a partial, with the street type missing — with the single correct parcel. Nothing has to
     * be spelled right for it to work, which is the opposite of every CAD search this codebase
     * has had to fight.
     *
     *   f  = free text: name, address or property id, in any combination
     *   pn = page number, 1-based
     *   st = sort field, `4` as the site itself sends
     *   so = sort direction
     *   pt = property types — RP real, PP personal, MH mobile home, NR
     *   ty = tax year
     */
    quickSearch: 'https://search.wcad.org/ProxyT/Search/Properties/quick/',

    /** Server-rendered detail. Read by label; there is no JSON behind it. */
    detail: 'https://search.wcad.org/Property-Detail',

    /** `/{quickRefId}/primaryimage/{taxYear}` — the property photograph. */
    primaryImage: 'https://search.wcad.org/ProxyT/properties',

    /**
     * `/{quickRefId}/{improvementId}/sketch/{taxYear}` — a dimensioned outline of the improvement.
     * Directly useful to a surveyor and with no equivalent in the Bell profile. Returned 500 on
     * the exempt city parcel it was found on; untested against an ordinary residence.
     */
    sketch: 'https://search.wcad.org/ProxyT/properties',

    /**
     * The tax year the search defaults to. WCAD was already serving 2027 on 2026-09-21 — appraisal
     * districts run a year ahead — so hardcoding "this year" would ask for a year that has no
     * values yet.
     */
    defaultTaxYear: 2027,
  },

  /**
   * ── THE OPEN DATA PORTAL ──────────────────────────────────────────────────────────────────────
   *
   * A Socrata instance with 97 public datasets and a full SODA API: JSON, `$where`, `$select`,
   * `$group`, `$limit`, no key needed. This is the largest single find in the county and it
   * removes the need for ArcGIS entirely for most questions.
   */
  data: {
    host: 'https://data.wcad.org',
    resource: 'https://data.wcad.org/resource',
    catalog: 'https://data.wcad.org/api/catalog/v1',
    datasets: {
      /** parcelid, siteaddress, ownernme1, cnvyname, bldgarea, resyrblt, lndvalue, usedscrp … */
      parcels: 'an3x-cnmw',
      /** name, scode, type, acres, numberlots, filedate, geometry — the plat index, with polygons. */
      subdivisions: 'em3v-vwsk',
      /** propertyid, book, page, deeddate, instrumenttypecode — THE CLERK BRIDGE. See below. */
      salesCertified: '2k72-e257',
      salesPreliminary: '8p3y-6p23',
      salesExport: 'pvyy-mm8r',
      owner: 'bbia-wsxs',
      propertyExport: 'ij43-xknu',
      propertyCertified: 'ai3c-c9pf',
      propertyPreliminary: '553d-hn26',
      landExport: '2ckt-cqwj',
      improvementExport: '4d8i-sgri',
      propertyCharacteristics: 'cvyp-ab5t',
      exemptions: 'nbn7-h4pp',
      buildingPermits: 'fqhf-gyjx',
      /** entityname, entitycode, annexacres, ordinancedate, geometry — city limits and annexations. */
      cities: 'iwdk-wcuk',
      countyBoundary: 'mnjq-32wk',
      mud: 'vgnm-5xkr',
      esd: '636c-i7s2',
      /**
       * LOOKS like a deed index and is NOT. Grouping its types returns System Value Notice (8.9M),
       * MV IMP PHOTO (2.2M), protest PDFs, homestead applications — the appraisal district's own
       * workflow archive. It holds 108 rows for one ordinary parcel, so wiring it up as a deed
       * source would report "108 documents found" about a property whose deeds are all elsewhere.
       * Recorded so nobody makes that mistake; useful only for protest history.
       */
      documentInfo: 'hfe8-ht8p',
    },
  },

  clerk: {
    vendor: 'tyler_eagle' as const,
    version: '2024.1.33',
    home: 'https://williamsoncountytx-web.tylerhost.net/williamsonweb/',
    /** A single "I Accept" button. Nothing works until it is clicked; acceptance rides the session. */
    disclaimer: 'https://williamsoncountytx-web.tylerhost.net/williamsonweb/user/disclaimer',
    search: 'https://williamsoncountytx-web.tylerhost.net/williamsonweb/search/DOCSEARCH149S1',
    searchPost: 'https://williamsoncountytx-web.tylerhost.net/williamsonweb/searchPost/DOCSEARCH149S1',

    /** Field ids read off the live form. */
    fields: {
      bothNames: 'field_BothNamesID',
      grantor: 'field_GrantorID',
      grantee: 'field_GranteeID',
      recordedFrom: 'field_RecDateID_DOT_StartDate',
      recordedTo: 'field_RecDateID_DOT_EndDate',
      instrument: 'field_DocNumID',
      book: 'field_BookVolPageID_DOT_Book',
      volume: 'field_BookVolPageID_DOT_Volume',
      page: 'field_BookVolPageID_DOT_Page',
      documentTypes: 'field_selfservice_documentTypes',
      advancedNames: 'field_UseAdvancedSearch',
    },

    /**
     * An `<a>`, not a submit input. Calling `form.submit()` directly bypasses the page's own
     * handler and returns "An error has occurred" with a support GUID — verified by doing it.
     */
    searchButton: '#searchButton',
    acceptButton: 'I Accept',

    /**
     * What acceptance actually IS: a cookie the server sets on the POST behind "I Accept",
     * alongside the JSESSIONID that was already there. Observed live on 2026-09-21.
     *
     * Worth naming because the page gives no other reliable signal. The button is a jQuery Mobile
     * submit, so the transition runs through a hash change that no load state waits on — code that
     * waits for the page instead of for this cookie proceeds before acceptance lands and gets
     * bounced back to the gate with a 200.
     */
    acceptCookie: 'disclaimerAccepted',

    /** Stated by the site: "indexed from Dec 8, 1838 through Sep 14, 2026". */
    indexedFrom: '1838-12-08',

    /** `[2016073774 2016073800]` — square brackets, exactly one space. */
    instrumentRangeSyntax: '[<from> <to>]',
  },
} as const;

/**
 * ── THE RULE THAT BREAKS A NAIVE SCRAPER ────────────────────────────────────────────────────────
 *
 * Quoted from the clerk's own search page:
 *
 *   "In the Both Names field, Grantor field or Grantee field, the searcher needs to either tab out
 *    of the field or click on a name in the drop down after you search on the name."
 *
 * A name typed and submitted without that interaction returns **"We're sorry. Your search could not
 * be completed."** — which is not the same sentence as "no results", and a scraper that does not
 * distinguish them will report that a property has no recorded conveyance when the search never
 * ran. Confirmed by doing exactly that on 2026-09-21.
 *
 * The instrument and book/page fields need no such interaction: a plain fill and a click on
 * `#searchButton` returns results. Proven with instrument 2002019648, which came back as a RELEASE
 * dated 2002-03-12 with grantor, grantee and the legal description "18.308 AC GARCIA M SVY ABST 246".
 */
export const WILLIAMSON_CLERK_NAME_RULE =
  'Name fields require tabbing out or picking from the autocomplete. A plain fill returns "Your ' +
  'search could not be completed", which is NOT "no results".';

/**
 * ── THE BRIDGE FROM THE DISTRICT TO THE CLERK ───────────────────────────────────────────────────
 *
 * Bell cites deeds by instrument number. Williamson's appraisal data cites them by BOOK and PAGE —
 * the Sales datasets carry `book`, `page` and `deeddate` and no instrument number at all. A sample
 * row: book 1539, page 526, deeded 1987-06-05.
 *
 * So the reliable route into this clerk is:
 *
 *     quick search → property id → Sales dataset → book/page → clerk book/page search
 *
 * with the name search as the FALLBACK rather than the first attempt. That is the reverse of Bell,
 * and a Bell-shaped run would find no deeds here even against a perfectly healthy clerk.
 */
export const WILLIAMSON_CLERK_BRIDGE = 'volume_page' as const;

/**
 * ── WHERE THE ACTUAL DOCUMENTS COME FROM ────────────────────────────────────────────────────────
 *
 * Driven and verified 2026-09-21. Four questions, four answers.
 *
 * **Deeds — the free index.** The Tyler Eagle clerk above. Indexed 1838→2026, free to search, and
 * it returns grantor, grantee, legal description, book/page and document type. Images cost money at
 * the counter; the INDEX is free and is most of what a run needs.
 *
 * **Deeds — the paid images.** TexasFile, `/search/texas/williamson-county/county-clerk-records/`.
 * Full index 1848-09-14 → 2026-09-11. The existing `texasfile-buy.ts` already drives this form, and
 * its own header records the fact that matters here: *"Bell's own INSTRUMENT NUMBER returns empty
 * on TexasFile — name and book/vol/page are the [ones that work]"*. Williamson's appraisal data
 * cites deeds by BOOK AND PAGE, so this county lands on TexasFile's strongest search rather than
 * its weakest. The chain is: WCAD property id → Sales dataset → book/page → TexasFile bvp search →
 * buy. Nothing new has to be built for it.
 *
 * **Plats.** No free repository — Bell's county-portal PDF index has no Williamson equivalent, and
 * `PLAT_REPO_REGISTRY` correctly has no entry. TexasFile does carry them:
 * `/search/texas/williamson-county/plat-records/`, plat maps 1854-02-18 → 2026-09-11, searchable by
 * subdivision name, volume/cabinet, page/slide or file number. See `adapters/texasfile-plats.ts`.
 * The subdivision name comes free from the WCAD legal description and the county's own Subdivisions
 * dataset, so the search is always well-formed by the time it runs.
 *
 * **Kofile — NOT a source here, and this is worth stating plainly.** `williamson.tx.publicsearch.us`
 * exists and answers 200, and on 2026-09-21 its department selector was driven: the ONLY department
 * is *Commissioners Court*. There are no land records on it at all. A deed search there returns an
 * empty page, which reads as "this property has no deeds" — a reachable portal for the wrong index,
 * which is worse than no portal. It is excluded from `services/clerk-registry.ts` and was removed
 * from `bell-clerk.ts`'s KOFILE_CONFIGS for the same reason.
 */
export const WILLIAMSON_DOCUMENTS = {
  /** Free to search, images at the counter. */
  clerkIndex: {
    source: 'tyler_eagle',
    url: 'https://williamsoncountytx-web.tylerhost.net/williamsonweb/search/DOCSEARCH149S1',
    free: true,
    coverage: { from: '1838-12-08', to: '2026-09-14' },
  },
  /** Paid images, and the search this county is best served by. */
  deedImages: {
    source: 'texasfile',
    url: 'https://www.texasfile.com/search/texas/williamson-county/county-clerk-records/',
    free: false,
    searchBy: ['name', 'book/volume/page', 'legal (subdivision, lot, block, survey, abstract)'],
    coverage: { from: '1848-09-14', to: '2026-09-11' },
  },
  plats: {
    source: 'texasfile',
    url: 'https://www.texasfile.com/search/texas/williamson-county/plat-records/',
    free: false,
    searchBy: ['subdivision name', 'volume/cabinet', 'page/slide/sleeve', 'file number'],
    coverage: { from: '1854-02-18', to: '2026-09-11' },
  },
  /** Recorded so nobody wires it up. See the block above. */
  kofile: {
    source: 'kofile',
    url: 'https://williamson.tx.publicsearch.us/',
    usable: false,
    why: 'Only department is Commissioners Court — no land records. Verified 2026-09-21.',
  },
  /** The office, for anything that has to be ordered by hand. */
  clerkOffice: {
    name: 'Williamson County Clerk — Nancy E. Rister',
    // Two addresses appear on two official sites; both are recorded rather than one being guessed
    // at as canonical.
    addresses: [
      '405 Martin Luther King St., Georgetown, TX 78626-4901',
      '1848 Texas Trail, Georgetown, TX 78626',
    ],
    phone: '(512) 943-1515',
    email: 'nrister@wilco.org',
  },
} as const;

/** Name formats the clerk states on its own page. */
export const WILLIAMSON_NAME_FORMAT = {
  individual: 'Last First — "Smith James". Broader: last name plus first initial.',
  organisation: 'As spelled — "Texas Bank".',
} as const;
