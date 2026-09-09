/**
 * Milam County — the curated profile (see `counties/profile.ts`).
 *
 * Everything here was driven live on 2026-09-09; the plan is
 * `docs/planning/completed/MILAM_COUNTY_ADAPTER_2026-09-09.md`.
 */

import type { CountyProfile } from '../profile.js';
import { MILAM_ENDPOINTS } from './config/endpoints.js';
import { MILAM_CITIES } from './scrapers/gis-scraper.js';

export const MILAM_PROFILE: CountyProfile = {
  name: 'Milam',
  key: 'milam',
  fips: MILAM_ENDPOINTS.clerk.fipsCode,
  tier: 'curated',
  module: { load: async () => (await import('./index.js')).runMilamCountyResearch },
  towns: [...MILAM_CITIES],
  sites: [
    { role: 'appraisal', vendor: 'bis', url: MILAM_ENDPOINTS.cad.home, egress: 'direct', verifiedAt: '2026-09-09', notes: 'BIS eSearch v2.0.9734. JSON results API; the HTML route carries no rows. Every deed cited by VOLUME/PAGE, none by instrument.' },
    { role: 'parcel_map', vendor: 'pandai_arcgis', url: MILAM_ENDPOINTS.gis.viewer, egress: 'direct', verifiedAt: '2026-09-09', notes: 'ArcGIS Web AppBuilder 2.18 (Pritchard & Abbott). `?find=<propertyId>` frames the parcel; the Basemap Gallery holds the county\'s EagleView 2014–2025 aerials.' },
    { role: 'parcel_data', vendor: 'arcgis', url: MILAM_ENDPOINTS.gis.parcelLayer, egress: 'direct', verifiedAt: '2026-09-09', notes: 'MapServer layer 0 parcels joined to accounts; layer 3 original surveys; layer 5 subdivisions; /export renders any box.' },
    { role: 'clerk', vendor: 'kofile', url: MILAM_ENDPOINTS.clerk.home, egress: 'direct', verifiedAt: '2026-09-09', notes: 'Kofile PublicSearch, department RP, 1983 → certified 2026-09-04; plats in group PL; volume/page resolved through the advanced search; free watermarked page images.' },
    { role: 'historic_index', vendor: 'quicklink', url: MILAM_ENDPOINTS.clerk.quickLink, egress: 'direct', verifiedAt: '2026-09-09', notes: 'Deed / deed-of-trust index books 1874–1982 and a book/volume/page viewer. Playbook only; not automated.' },
    { role: 'tax', vendor: 'bis', url: MILAM_ENDPOINTS.cad.home, egress: 'direct', verifiedAt: '2026-09-09', notes: 'Valuation history and improvements from the appraisal detail page.' },
  ],
  capabilities: {
    freePlatRepository: false,
    gisParcelLayer: true,
    surveyLayer: true,
    historicIndex: true,
    clerkFreePreview: true,
    clerkBridge: 'volume_page',
  },
  recipe: [
    'Identify the parcel: BIS eSearch (JSON API) and the Pritchard & Abbott parcel layer in parallel; the layer also names the original survey and the subdivision at the parcel.',
    'Drawings first: the clerk\'s PL group by subdivision name (no free repository exists), then TexasFile plats.',
    'Overhead views: six rendered frames (county lines over imagery, subject outlined) and the county viewer at three zooms plus EagleView 2025 with and without lines.',
    'Deeds: each volume/page from the appraisal history resolved at the clerk\'s advanced search, then by owner, then by subdivision.',
    'FEMA flood zone, TxDOT right-of-way, the tax block, then AI reading unless this is a gather run.',
  ],
  golden: [
    {
      propertyId: '13824',
      address: '309 N Travis, Cameron, TX 76520',
      expect: {
        owner_name: 'WANBOB LC',
        legal_description: 'S09200 FREEMAN BLK 1 W PT OF',
        acreage: 0.4577,
        geo_id: 'S09200-001-01-00',
        survey_name: 'Daniel Monroe',
        abstract_number: '38',
        subdivision_name: 'FREEMAN',
        deed_volume: '1093',
        deed_page: '560',
        instrument_number: '2009-109100',
      },
      verifiedAt: '2026-09-09',
      notes: 'CAD, GIS, tax, rendered maps, viewer and the clerk (6 deed pages) all driven live on this parcel.',
    },
    {
      propertyId: '10421',
      address: '600 W Main, Buckholts, TX 76518',
      expect: {
        owner_name: 'NARVAEZ MARGARITA',
        legal_description: 'A0430 DE PENA, J.A.,.465 ACRES',
        abstract_number: '430',
        survey_name: 'J A DE PENA',
      },
      verifiedAt: '2026-09-09',
      notes: 'An abstract tract, not a lot — the control for the survey layer and the subdivision layer answering "none".',
    },
  ],
  statement: 'Milam is curated: every site driven by hand on 2026-09-09, a dedicated run, two golden parcels on file (one town lot, one abstract tract).',
};
