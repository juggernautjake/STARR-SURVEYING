/**
 * Bell County Endpoints — every URL and API endpoint the system needs.
 *
 * When Bell County changes a URL, THIS is the only file to update.
 * No other file in this folder should hardcode URLs.
 */

export const BELL_ENDPOINTS = {
  // ── Bell CAD (Central Appraisal District) ──────────────────────────
  cad: {
    /** eSearch home page (for session cookie acquisition) */
    home: 'https://esearch.bellcad.org',
    /** Keyword search results (GET with session token) */
    searchResults: 'https://esearch.bellcad.org/search/result',
    /** Property detail page */
    propertyDetail: (propId: string, ownerId?: string) =>
      `https://esearch.bellcad.org/Property/View/${propId}${ownerId ? `?ownerId=${ownerId}` : ''}`,
  },

  // ── Bell CAD GIS (ArcGIS FeatureServer) ────────────────────────────
  gis: {
    /** BIS GIS viewer (reference, not queried directly) */
    viewer: 'https://gis.bisclient.com/bellcad/',
    /**
     * BIS GIS viewer — direct property lookup URL.
     *
     * URL hash params decoded:
     *   data_s = id:dataSource_1-BellCADWebService_7378:{OBJECTID}
     *     → Pre-selects the parcel feature by ArcGIS OBJECTID
     *   widget_27 = search_status:{"searchText":"{PROPERTY_ID}","status":{"configId":"config_1"}}
     *     → Populates the search widget with the property ID and triggers zoom
     *
     * If objectId is provided, the map pre-selects + highlights the parcel.
     * If only propertyId is provided, the search widget finds and zooms to it.
     */
    viewerByPropertyId: (propertyId: string, objectId?: string | number) => {
      const searchPart = `widget_27=search_status:%7B%22searchText%22%3A%22${encodeURIComponent(propertyId)}%22%2C%22status%22%3A%7B%22configId%22%3A%22config_1%22%7D%7D`;
      if (objectId != null) {
        return `https://gis.bisclient.com/bellcad/?page=Page#data_s=id%3AdataSource_1-BellCADWebService_7378%3A${encodeURIComponent(String(objectId))}&${searchPart}`;
      }
      // Without OBJECTID, just use the search widget — it still zooms to the property
      return `https://gis.bisclient.com/bellcad/?page=Page#${searchPart}`;
    },
    /** Direct parcel layer — the primary query endpoint */
    parcelLayer: 'https://utility.arcgis.com/usrsvcs/servers/6efa79e05bde4b98851880b45f63ea52/rest/services/BellCADWebService/FeatureServer/0',
    /** Query suffix for ArcGIS REST */
    queryPath: '/query',
  },

  // ── Google Maps (satellite and street view) ─────────────────────────
  googleMaps: {
    /**
     * Place URL with address, lat/lon center, and zoom level.
     * Pattern from Bell CAD "View Map → Google Maps" link:
     *   /maps/place/718+S+Pearl+St,+Belton,+TX+76513/@31.05,-97.47,17z/data=!3m1!4b1!...
     * Address uses + for spaces (matches Google's URL convention).
     */
    place: (address: string, lat: number, lon: number, zoom: number) =>
      `https://www.google.com/maps/place/${address.replace(/ /g, '+')}/@${lat},${lon},${zoom}z/data=!3m1!4b1`,
    /**
     * Satellite/aerial view centered on lat/lon.
     * Uses data=!3m1!1e3 to force satellite layer.
     */
    satellite: (lat: number, lon: number, zoom: number) =>
      `https://www.google.com/maps/@${lat},${lon},${zoom}z/data=!3m1!1e3`,
  },

  // ── Bell County Clerk (Kofile / GovOS PublicSearch) ────────────────
  clerk: {
    /** PublicSearch home (Playwright SPA) */
    home: 'https://bell.tx.publicsearch.us',
    /** Search results page (SPA, needs Playwright) */
    results: 'https://bell.tx.publicsearch.us/results',
    /** Document viewer page */
    document: (instrumentId: string) =>
      `https://bell.tx.publicsearch.us/doc/${instrumentId}`,
    /** Full-text OCR search (POST) */
    superSearch: 'https://bell.tx.publicsearch.us/supersearch',
    /** FIPS code for Bell County */
    fipsCode: '48027',
  },

  // ── Henschen & Associates (Alternative Clerk) ─────────────────────
  henschen: {
    base: 'https://www.bellcountytx.com/recorder',
    rateLimitRpm: 15,
  },

  // ── FEMA National Flood Hazard Layer ───────────────────────────────
  fema: {
    /** NFHL MapServer */
    mapServer: 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer',
    /** Flood Hazard Areas layer */
    floodZonesLayer: 28,
    /** FIRM Panels layer */
    firmPanelsLayer: 3,
  },

  // ── TxDOT Right-of-Way ────────────────────────────────────────────
  txdot: {
    /** ROW Parcels FeatureServer */
    rowParcels: 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_ROW/FeatureServer/0',
    /** Roadway Centerlines FeatureServer */
    roadways: 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadways/FeatureServer/0',
  },

  // ── Geocoding ─────────────────────────────────────────────────────
  geocoding: {
    /** Census geocoder */
    census: 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress',
    /** Nominatim fallback */
    nominatim: 'https://nominatim.openstreetmap.org/search',
  },
} as const;

/**
 * Rate limits (milliseconds between requests).
 *
 * ── FOUR OF THESE WERE POLICY THAT NOTHING ENFORCED ─────────────────────────────────────────────
 *
 * Measured 2026-09-03. `clerkImageDownload: 6000`, `clerkMaxConcurrent: 3`, `henschenRpm: 15` and
 * `aiCallDelay: 200` had ZERO uses anywhere in the worker. They read as settled policy — "we wait
 * six seconds between clerk image downloads" — and nobody waited six seconds. A constant that
 * states a rule the code does not follow is worse than no constant: it answers the question
 * "are we being polite to this host?" with a confident yes.
 *
 * They were not wired, because they should not be. `infra/politeness.ts` already serialises every
 * request PER HOST and spaces them by a configurable interval with jitter, and the Bell clerk path
 * goes through it transitively — `fetchInstrumentDocument` delegates to `searchByInstrument` and
 * `fetchDocumentImages` in `services/bell-clerk.ts`, and both wrap their navigation in
 * `withPoliteness`. Adding a second delay on top would double-space every request for no reason.
 *
 * The empirical check agrees: the 2026-09-03 run made 224 requests to `bell.tx.publicsearch.us`
 * over 163 minutes — one every 43.7 seconds. Politeness was working. The run's problem was volume,
 * not rate, and that is bounded by `research/budget-gate.ts` now.
 *
 * What remains are the two that are actually applied. Anything added here should be applied at the
 * same time, or it becomes another rule the code does not follow.
 */
export const RATE_LIMITS = {
  /** Between Bell CAD searches. Applied at 3 sites. */
  cadSearch: 2000,
  /** Generic pause between clerk steps. Applied at clerk-scraper.ts:238. */
  defaultDelay: 1000,
} as const;

/** Request timeouts (milliseconds) */
export const TIMEOUTS = {
  httpRequest: 30_000,
  arcgisQuery: 30_000,
  playwrightNavigation: 45_000,
  playwrightAction: 15_000,
  screenshotCapture: 10_000,
  /** AI analysis per-call timeout — vision OCR on large plat images needs time */
  aiAnalysis: 600_000,
  /** AI analysis for deed chain history — recursive lookups take longer */
  aiDeedChain: 300_000,
  /** AI reconciliation — deep merge pass across all image regions */
  aiReconciliation: 600_000,
  /** Maximum total research time — increased to accommodate multi-region image analysis */
  maxResearch: 90 * 60 * 1000,
} as const;
