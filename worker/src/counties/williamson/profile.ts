/**
 * Williamson County — the curated profile (see `counties/profile.ts`).
 *
 * Every site below was driven by hand on 2026-09-21 and its answer read. The session is written up
 * in docs/research/williamson-county-discovery-2026-09-21.md.
 *
 * ── WHY THIS IS CURATED WITHOUT A DEDICATED MODULE ──────────────────────────────────────────────
 *
 * `module` is optional on a CountyProfile and the router treats its absence correctly: a curated
 * profile with no loader falls through to the generic pipeline, but with these facts rather than
 * the ones `deriveProfile` would have invented.
 *
 * That matters more than a dedicated runner would, because what the derived profile invented was
 * wrong in three ways at once. It called Williamson a BIS county (it runs True Automation), it
 * pointed at `esearch.wilcotx.gov` (a hostname that returns NXDOMAIN), and it announced a Tyler
 * Eagle clerk while the pipeline searched a Kofile portal that holds only Commissioners Court
 * minutes. A run "using the vendor's shapes" was using three different counties' worth of wrong.
 *
 * A dedicated module is worth writing once there is a golden parcel to regress it against. Curating
 * the facts first is the cheaper half and it is the half that was broken.
 */

import type { CountyProfile } from '../profile.js';
import { WILLIAMSON_ENDPOINTS, WILLIAMSON_CLERK_BRIDGE } from './config/endpoints.js';
import { WILLIAMSON_COUNTY_CITIES } from './config/towns.js';

export const WILLIAMSON_PROFILE: CountyProfile = {
  name: 'Williamson',
  key: 'williamson',
  fips: WILLIAMSON_ENDPOINTS.fipsCode,
  tier: 'curated',
  towns: [...WILLIAMSON_COUNTY_CITIES],
  sites: [
    {
      role: 'appraisal',
      vendor: 'true_automation',
      url: WILLIAMSON_ENDPOINTS.cad.home,
      egress: 'direct',
      verifiedAt: '2026-09-21',
      notes:
        'True Automation / Tyler PublicAccess on DNN — NOT BIS, which is what the derived profile ' +
        'claimed. Free-text JSON search at /ProxyT/Search/Properties/quick/ answers a partial ' +
        'address in 164ms with no auth; detail is server-rendered and read by label. Tax year runs ' +
        'a year ahead (2027 as of this writing).',
    },
    {
      role: 'parcel_data',
      vendor: 'socrata',
      url: `${WILLIAMSON_ENDPOINTS.data.resource}/${WILLIAMSON_ENDPOINTS.data.datasets.parcels}.json`,
      egress: 'direct',
      verifiedAt: '2026-09-21',
      notes:
        'data.wcad.org is a Socrata portal with 97 public datasets and a full SODA API — no key. ' +
        'Parcels, Sales (book/page + deed date), Subdivisions (with geometry), Owner, Land, ' +
        'Improvement, Exemptions, Building Permits, MUD, ESD, Cities. This removes the need for ' +
        'ArcGIS for most questions.',
    },
    {
      role: 'plats',
      vendor: 'socrata',
      url: `${WILLIAMSON_ENDPOINTS.data.resource}/${WILLIAMSON_ENDPOINTS.data.datasets.subdivisions}.json`,
      egress: 'direct',
      verifiedAt: '2026-09-21',
      notes:
        'The subdivision index, WITH polygons — name, code, type, acres, lot count, file date. Not ' +
        'a plat PDF repository like Bell\'s, so it locates and bounds a subdivision but does not ' +
        'hand over the recorded plat; that still comes from the clerk.',
    },
    {
      role: 'clerk',
      vendor: 'tyler_eagle',
      url: WILLIAMSON_ENDPOINTS.clerk.home,
      egress: 'direct',
      verifiedAt: '2026-09-21',
      notes:
        'Tyler Self-Service 2024.1.33, indexed Dec 8 1838 through Sep 14 2026. An "I Accept" gate ' +
        'first. Instrument and book/page searches work with a plain fill and a click on ' +
        '#searchButton — proven with instrument 2002019648. The NAME fields do not: the page ' +
        'requires tabbing out or picking from the autocomplete, and a plain fill returns "Your ' +
        'search could not be completed", which is not the same sentence as "no results".',
    },
    {
      role: 'parcel_map',
      vendor: 'arcgis_experience',
      url: 'https://experience.arcgis.com/experience/98d2c1d229244fdabe86b6bd9eb3fcae/page/Market-Sales/',
      egress: 'direct',
      verifiedAt: '2026-09-21',
      notes:
        'Public Experience Builder app keyed ?pin=<quickRefId>. WCAD\'s own gisweb.wcad.org has an ' +
        'EXPIRED TLS CERTIFICATE and its ArcGIS Online org is not public, so no parcel ' +
        'FeatureServer was found — the Socrata datasets cover the gap.',
    },
    {
      role: 'plats',
      vendor: 'texasfile',
      url: 'https://www.texasfile.com/search/texas/williamson-county/plat-records/',
      egress: 'direct',
      verifiedAt: '2026-09-21',
      notes:
        'PAID plats, since the county has no free repository. Plat maps 1854-02-18 to 2026-09-11, ' +
        'searchable by subdivision name — which the WCAD legal description and the county’s own ' +
        'Subdivisions dataset both supply, so the search is well-formed by the time it runs. ' +
        'Driven by adapters/texasfile-plats.ts.',
    },
    {
      role: 'historic_index',
      vendor: 'texasfile',
      url: 'https://www.texasfile.com/search/texas/williamson-county/county-clerk-records/',
      egress: 'direct',
      verifiedAt: '2026-09-21',
      notes:
        'Deed images, full index 1848-09-14 to 2026-09-11. This county lands on TexasFile’s ' +
        'STRONGEST search rather than its weakest: texasfile-buy.ts records that instrument numbers ' +
        'return empty there while book/vol/page works, and WCAD cites deeds by book and page. The ' +
        'chain is property id → Sales dataset → book/page → TexasFile → buy.',
    },
    {
      role: 'tax',
      vendor: 'county_portal',
      url: 'https://tax.wilco.org/',
      notes: 'Williamson County Tax Assessor-Collector. Recorded, not yet driven.',
    },
  ],
  capabilities: {
    // Not in Bell's sense. The subdivision index locates and bounds a plat but does not serve the
    // recorded PDF; claiming true would make a run promise a drawing it cannot fetch.
    freePlatRepository: false,
    // No public FeatureServer found. Parcel ATTRIBUTES come from Socrata; polygons exist for
    // subdivisions but not, so far, for individual parcels.
    gisParcelLayer: false,
    surveyLayer: false,
    historicIndex: false,
    clerkFreePreview: false,
    // Book/page, not instrument. The Sales datasets carry no instrument number at all, so a
    // Bell-shaped run would find no deeds here against a perfectly healthy clerk.
    clerkBridge: WILLIAMSON_CLERK_BRIDGE,
  },
  recipe: [
    'Identify the parcel: the WCAD free-text search, tried as the operator typed it, then with the street type dropped, then with a geocoder’s correction if there is one. It tolerates a MISSING street type but not a wrong one — "1007 Cushing Dirve" returns nothing, "1007 Cushing" returns the parcel.',
    'Read the detail page by label for legal description, account, map number, acreage, improvement size and year built.',
    'Pull the subdivision out of the legal description and look it up in the Socrata subdivision index for its code, lot count, file date and polygon — unless the description is metes and bounds, in which case skip it.',
    'Deeds, free: take book/page from the Socrata Sales dataset and search the Tyler clerk by book/page. Use the name search only as a fallback, and only with the autocomplete interaction the page requires.',
    'Deeds, paid images: the same book/page against TexasFile, which is this county’s strongest search — instrument numbers return empty there, book/vol/page does not.',
    'Plats: there is no free repository. Search TexasFile plat records by the subdivision name taken from the legal description. Skip entirely for a metes-and-bounds parcel.',
    'Overhead views: Google satellite, plus the ArcGIS Experience app keyed by the property id.',
    'FEMA flood zone, the tax block, then AI reading unless this is a gather run.',
  ],
  golden: [
    {
      propertyId: 'R075105',
      address: '1007 Cushing Dr, Round Rock, TX 78664',
      expect: {
        owner_name: 'CITY OF ROUND ROCK',
        legal_description: 'VILLAGE GREEN (EXEMPT), LOT 1, ACRES 2.82',
        account: 'R-16-5591-EX00-0001',
        map_number: '3-5927',
        acreage: 2.82,
        year_built: 2002,
      },
      verifiedAt: '2026-09-21',
      notes:
        'Read off the live detail page. A WEAK fixture and knowingly so: exempt city property, so ' +
        'no market value, no photo, no sketch, and its sales history is not representative. It is ' +
        'here because it is the parcel the failing run was about and every field above was ' +
        'verified. Replace it with an ordinary homesteaded parcel that has a real sale and a ' +
        'recorded deed — that drill would be worth something.',
    },
  ],
  statement:
    'Williamson is curated as of 2026-09-21: the appraisal search, the open-data portal and the ' +
    'clerk were each driven by hand. The previous configuration pointed at a hostname that does ' +
    'not exist and named the wrong vendor. No dedicated module yet, and the golden parcel is ' +
    'exempt city property rather than an ordinary residence.',
};
