/**
 * Milam County — the module the shared orchestrator runs.
 *
 * See `counties/county-module.ts` for the shape and `config/endpoints.ts` for how each site was
 * found. The appraisal district and the clerk are the same vendors as Bell's (BIS eSearch, Kofile
 * PublicSearch), so those scrapers are the Bell ones pointed at Milam's hosts; the map is not
 * (Pritchard & Abbott ArcGIS), so the GIS scraper and both captures are Milam's own. FEMA and
 * TxDOT are statewide services and the Bell readers are used as they are.
 */

import type { CountyModule } from '../county-module.js';
import { MILAM_ENDPOINTS } from './config/endpoints.js';
import { scrapeMilamCad } from './scrapers/cad-scraper.js';
import { scrapeMilamGis, discoverMilamSiblingLots, findMilamAdjacentParcels } from './scrapers/gis-scraper.js';
import { scrapeMilamClerk } from './scrapers/clerk-scraper.js';
import { scrapeMilamPlats } from './scrapers/plat-scraper.js';
import { scrapeMilamTax } from './scrapers/tax-scraper.js';
import { captureMilamGisViewerScreenshots } from './scrapers/gis-viewer-capture.js';
import { captureMilamMapScreenshots } from './scrapers/map-screenshot-capture.js';
import { scrapeBellFema } from '../bell/scrapers/fema-scraper.js';
import { scrapeBellTxDot } from '../bell/scrapers/txdot-scraper.js';

export const MILAM_MODULE: CountyModule = {
  name: 'Milam',
  key: 'milam',
  fips: MILAM_ENDPOINTS.clerk.fipsCode,
  labels: {
    cad: 'Milam CAD',
    cadSite: 'Milam CAD eSearch',
    gis: 'Milam GIS',
    gisSite: 'Milam AD parcel map',
    clerk: 'Milam County Clerk',
    clerkSite: 'Milam County Clerk (Kofile)',
    platRepo: 'Milam County Clerk plat records',
  },
  hosts: {
    cad: MILAM_ENDPOINTS.cad.home,
    clerk: MILAM_ENDPOINTS.clerk.home,
    cadVendor: 'bis',
    clerkVendor: 'kofile',
  },
  scrapers: {
    cad: scrapeMilamCad,
    gis: scrapeMilamGis,
    siblingLots: discoverMilamSiblingLots,
    adjacentParcels: findMilamAdjacentParcels,
    clerk: scrapeMilamClerk,
    plats: scrapeMilamPlats,
    // Statewide services; the readers only take a coordinate.
    fema: scrapeBellFema,
    txdot: scrapeBellTxDot,
    tax: scrapeMilamTax,
  },
  captures: {
    gisViewer: captureMilamGisViewerScreenshots,
    maps: captureMilamMapScreenshots,
  },
};
