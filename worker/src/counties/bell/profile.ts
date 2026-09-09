/**
 * Bell County — the curated profile (see `counties/profile.ts`).
 *
 * Sites and facts as the Bell module has driven them since 2026-03; the golden parcel's answer was
 * read off the live appraisal page on 2026-09-09.
 */

import type { CountyProfile } from '../profile.js';
import { BELL_ENDPOINTS } from './config/endpoints.js';
import { BELL_COUNTY_CITIES } from './config/towns.js';

export const BELL_PROFILE: CountyProfile = {
  name: 'Bell',
  key: 'bell',
  fips: BELL_ENDPOINTS.clerk.fipsCode,
  tier: 'curated',
  module: { load: async () => (await import('./index.js')).runBellCountyResearch },
  towns: BELL_COUNTY_CITIES.map((c) => c.toUpperCase()),
  sites: [
    { role: 'appraisal', vendor: 'bis', url: BELL_ENDPOINTS.cad.home, egress: 'direct', verifiedAt: '2026-09-09', notes: 'BIS eSearch. Search through the JSON results API; the detail page read by its labels; deeds cited by instrument (twelve digits) and, before the 1990s, by volume/page.' },
    { role: 'parcel_map', vendor: 'bis_gis', url: BELL_ENDPOINTS.gis.viewer, egress: 'direct', verifiedAt: '2026-09-06', notes: 'ArcGIS Experience Builder; photographed at several zooms with layer toggles.' },
    { role: 'parcel_data', vendor: 'arcgis', url: BELL_ENDPOINTS.gis.parcelLayer, egress: 'direct', verifiedAt: '2026-09-06', notes: 'FeatureServer layer 0 — parcels with owner, legal, acreage, situs, instrument.' },
    { role: 'clerk', vendor: 'kofile', url: BELL_ENDPOINTS.clerk.home, egress: 'direct', verifiedAt: '2026-09-08', notes: 'Kofile PublicSearch, department RP; free watermarked page images in the viewer.' },
    { role: 'plats', vendor: 'county_portal', url: 'https://www.bellcountytx.com/county_government/county_clerk/a.php', egress: 'app-relay', verifiedAt: '2026-09-08', notes: 'The free plat repository — unwatermarked PDFs by subdivision name. Blocks datacentre addresses; index read through the app relay, PDF fetched by a residential Browserbase session.' },
    { role: 'historic_index', vendor: 'henschen', url: BELL_ENDPOINTS.henschen.base, notes: 'Henschen & Associates — recorded as an alternative clerk source; not used by a run.' },
  ],
  capabilities: {
    freePlatRepository: true,
    gisParcelLayer: true,
    surveyLayer: false,
    historicIndex: false,
    clerkFreePreview: true,
    clerkBridge: 'instrument',
  },
  recipe: [
    'Identify the parcel: BIS eSearch and the ArcGIS parcel layer in parallel, geocoded by Census, Nominatim, then Google.',
    'Drawings first: the free plat repository by subdivision name, then the clerk\'s plat records, before any deed is opened.',
    'Overhead views: the BIS viewer at three zooms with and without lines; Google satellite and place frames.',
    'Deeds: the clerk by the CAD\'s instrument numbers, then by owner, then by subdivision; historical volume/page references followed one level.',
    'FEMA flood zone, TxDOT right-of-way, the tax block, then AI reading unless this is a gather run.',
  ],
  golden: [
    {
      propertyId: '405',
      address: '818 S Main St, Temple, TX 76504',
      expect: {
        owner_name: 'LOPEZ, JUAN & FELIPA MARTINEZ',
        legal_description: 'W S CHAPMAN ADDITION, BLOCK 006, LOT PT 4, (S 75\' OF 4)',
        acreage: 0.19,
        instrument_number: '200800046957',
        map_id: '35C03',
      },
      verifiedAt: '2026-09-09',
      notes: 'Read from the live appraisal detail page. Expect from the appraisal source; the clerk should find 200800046957 (warranty deed, 2009).',
    },
  ],
  statement: 'Bell is curated: every site driven by hand, a dedicated run, one golden parcel on file. Owner-supplied surveyed parcels would make the drill meaningful to the foot.',
};
