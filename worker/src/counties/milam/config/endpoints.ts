/**
 * Milam County Endpoints — every URL and API endpoint the Milam module needs.
 *
 * When Milam County changes a URL, THIS is the only file to update.
 * No other file in this folder should hardcode URLs.
 *
 * ── HOW THESE WERE FOUND (2026-09-09) ───────────────────────────────────────────────────────────
 *
 * Every host below was driven live before it was written down, because the registry entry this
 * module replaces was wrong on both counts: `services/bis-cad.ts` carried Milam as
 * `esearch.milamcad.org` (does not resolve) with a GIS viewer at `gis.bisclient.com/milamcad/`
 * (HTTP 404). Those two addresses are why the Milam run of 2026-09-02 spent 147 seconds discovering
 * a dead host (infra/dead-host.ts). The app's own table said TrueAutomation `cid=26`, which now
 * answers with an ASP.NET error page. Three registries, three different answers, none of them
 * the site.
 *
 *   Appraisal district  https://esearch.milamad.org         BIS Consultants eSearch v2.0.9734 —
 *                                                            the same vendor and the same version
 *                                                            family as Bell's, so the BIS scraper
 *                                                            drives it with the host swapped.
 *   Parcel map          https://maps.pandai.com/milamad/     ArcGIS Web AppBuilder 2.18 by
 *                                                            Pritchard & Abbott ("pandai"), NOT BIS.
 *                                                            `?find=<propertyId>` deep-links to the
 *                                                            parcel and opens its popup.
 *   Parcel data         https://gisdata.pandai.com/pamaps01/rest/services/Milam/MilamCADPublic
 *                                                            MapServer + FeatureServer. Layer 0 is
 *                                                            parcels JOINED to the appraisal accounts
 *                                                            (owner, legal, acreage, situs, deed
 *                                                            volume/page). Layer 3 is the original
 *                                                            surveys (abstract number + grantee),
 *                                                            layer 5 the subdivisions. `/export`
 *                                                            renders any bbox server-side.
 *   County clerk        https://milam.tx.publicsearch.us     Kofile/GovOS PublicSearch, department
 *                                                            RP (1983 → certified 2026-09-04),
 *                                                            $1/page + $2/document at the cart; the
 *                                                            viewer serves watermarked page images
 *                                                            free. Plats are their own doc group
 *                                                            (PL: PLAT, SURVEY PLAT, REPLAT …).
 *   Historic index      https://kofilequicklinks.com/Milam/  Kofile QuickLink — deed and deed-of-trust
 *                                                            INDEX BOOKS 1874–1982, and a book/
 *                                                            volume/page document viewer for the
 *                                                            volumes the clerk's live index does not
 *                                                            reach. ASP.NET WebForms (postbacks);
 *                                                            the viewer is Viewer.aspx?ImageId=N,
 *                                                            one ImageId per page, tiled TIFF.
 *   No free plat portal.  bellcountytx.com has no Milam equivalent; the clerk's site says nothing
 *                         of one and the county site lists none. Plats come from the clerk's PL
 *                         group (free preview) or TexasFile (paid, $10 flat).
 */

export const MILAM_ENDPOINTS = {
  // ── Milam AD (BIS Consultants eSearch) ─────────────────────────────
  cad: {
    /** eSearch home page (for session cookie acquisition) */
    home: 'https://esearch.milamad.org',
    /** Keyword search results (GET with session token) — same route as Bell's */
    searchResults: 'https://esearch.milamad.org/search/result',
    /** Property detail page. `?year=` is appended by the caller. */
    propertyDetail: (propId: string, ownerId?: string) =>
      `https://esearch.milamad.org/Property/View/${propId}${ownerId ? `?ownerId=${ownerId}` : ''}`,
    /** The district's public site — office, forms, appraisal-roll downloads */
    district: 'https://milamad.org/',
    /** Certified appraisal rolls as ZIP (the whole county, all property types). */
    dataDownloads: 'https://milamad.org/data-downloads/',
  },

  // ── Milam AD parcel map (Pritchard & Abbott ArcGIS) ────────────────
  gis: {
    /** The county's map viewer (Web AppBuilder 2.18, ArcGIS JS 3.34). */
    viewer: 'https://maps.pandai.com/milamad/',
    /**
     * Deep link the appraisal detail page's own "View Map → Interactive Map" button uses. The
     * Search widget takes `find`, queries layer 0 for `DBO.TaxParcels.Name = '<id>'`, zooms to
     * the parcel (LOD 20) and opens its popup. Driven live 2026-09-09 for parcel 13824.
     */
    viewerByPropertyId: (propertyId: string) =>
      `https://maps.pandai.com/milamad/?find=${encodeURIComponent(propertyId)}`,
    /** The ArcGIS Server the viewer draws from. */
    serviceRoot: 'https://gisdata.pandai.com/pamaps01/rest/services/Milam/MilamCADPublic',
    /** MapServer — `/export` renders a bbox; `/layers` lists the schema. */
    mapServer: 'https://gisdata.pandai.com/pamaps01/rest/services/Milam/MilamCADPublic/MapServer',
    /** Layer 0: parcels joined to accounts. The primary query endpoint. */
    parcelLayer: 'https://gisdata.pandai.com/pamaps01/rest/services/Milam/MilamCADPublic/MapServer/0',
    /** Layer 3: original surveys (AbstractName = original grantee, AbstractNumber). 412 polygons. */
    surveyLayer: 'https://gisdata.pandai.com/pamaps01/rest/services/Milam/MilamCADPublic/MapServer/3',
    /** Layer 4: city limits. */
    cityLimitsLayer: 'https://gisdata.pandai.com/pamaps01/rest/services/Milam/MilamCADPublic/MapServer/4',
    /** Layer 5: subdivisions (SubdivisionName, SubdivisionCode = the S-number in the legal). 673 polygons. */
    subdivisionLayer: 'https://gisdata.pandai.com/pamaps01/rest/services/Milam/MilamCADPublic/MapServer/5',
    /** Layer ids by name, for `/export?layers=show:…`. */
    layerIds: { parcels: 0, historyLabels: 1, historyLines: 2, surveys: 3, cityLimits: 4, subdivisions: 5, schoolDistricts: 6, counties: 7 },
    /** Query suffix for ArcGIS REST */
    queryPath: '/query',
    /** Esri World Imagery — the aerial under the county's own basemap gallery; public REST export. */
    worldImageryExport: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export',
  },

  // ── Google Maps (satellite and street view) — same patterns as Bell ─
  googleMaps: {
    place: (address: string, lat: number, lon: number, zoom: number) =>
      `https://www.google.com/maps/place/${address.replace(/ /g, '+')}/@${lat},${lon},${zoom}z/data=!3m1!4b1`,
    satellite: (lat: number, lon: number, zoom: number) =>
      `https://www.google.com/maps/@${lat},${lon},${zoom}z/data=!3m1!1e3`,
  },

  // ── Milam County Clerk (Kofile / GovOS PublicSearch) ───────────────
  clerk: {
    /** PublicSearch home (Playwright SPA) */
    home: 'https://milam.tx.publicsearch.us',
    /** Search results page (SPA, needs Playwright) */
    results: 'https://milam.tx.publicsearch.us/results',
    /** Document viewer page — takes the site's INTERNAL id, not the instrument number */
    document: (internalId: string) =>
      `https://milam.tx.publicsearch.us/doc/${internalId}`,
    /**
     * Volume/page lookup — driven live 2026-09-09: OR/1093/560 from the appraisal deed history
     * resolved to instrument 2009-109100. The appraisal district cites EVERY Milam deed by
     * volume/page and almost none by instrument, so this is the bridge from the CAD to the deed.
     * `recordedDateRange` is what the form sends; without it the SPA returns nothing.
     */
    volumePageSearch: (volume: string, page: string) =>
      `https://milam.tx.publicsearch.us/results?department=RP&searchType=advancedSearch` +
      `&volume=${encodeURIComponent(volume)}&page=${encodeURIComponent(page)}&recordedDateRange=18010101%2C20991231`,
    /** Real-property department code — per county; Milam's is RP ("Property Records"). */
    department: 'RP',
    /** FIPS code for Milam County */
    fipsCode: '48331',
    /** Kofile QuickLink — the 1874–1982 index books and volume/page viewer. */
    quickLink: 'https://kofilequicklinks.com/Milam/',
    /** Per the site's own pricing config (read from `window.__data.configuration.pricing`). */
    pricing: { perPageCents: 100, perDocumentConvenienceCents: 200 },
  },

  // ── FEMA National Flood Hazard Layer — statewide, identical to Bell ──
  fema: {
    mapServer: 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer',
    floodZonesLayer: 28,
    firmPanelsLayer: 3,
  },

  // ── TxDOT Right-of-Way — statewide, identical to Bell ──────────────
  txdot: {
    rowParcels: 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_ROW/FeatureServer/0',
    roadways: 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadways/FeatureServer/0',
  },

  // ── Geocoding ─────────────────────────────────────────────────────
  geocoding: {
    census: 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress',
    nominatim: 'https://nominatim.openstreetmap.org/search',
  },
} as const;

/** Request timeouts (milliseconds) — the Bell values; nothing measured says Milam's hosts differ. */
export const MILAM_TIMEOUTS = {
  httpRequest: 30_000,
  arcgisQuery: 30_000,
  playwrightNavigation: 45_000,
  playwrightAction: 15_000,
  screenshotCapture: 10_000,
} as const;
