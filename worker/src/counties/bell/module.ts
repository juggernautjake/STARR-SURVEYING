/**
 * Bell County — the module the shared orchestrator runs.
 *
 * Each entry is the scraper that was called by name inside `orchestrator.ts` until 2026-09-09;
 * the orchestrator now takes this object (see `counties/county-module.ts`) so a second county can
 * hand it a different set. Nothing about what a Bell run does changed with the move — the same
 * functions, called with the same arguments, in the same order.
 */

import type { CountyModule } from '../county-module.js';
import { BELL_ENDPOINTS } from './config/endpoints.js';
import { scrapeBellCad } from './scrapers/cad-scraper.js';
import { scrapeBellGis, discoverSiblingLots, findAdjacentParcels } from './scrapers/gis-scraper.js';
import { scrapeBellClerk } from './scrapers/clerk-scraper.js';
import { scrapeBellPlats } from './scrapers/plat-scraper.js';
import { scrapeBellFema } from './scrapers/fema-scraper.js';
import { scrapeBellTxDot } from './scrapers/txdot-scraper.js';
import { scrapeBellTax } from './scrapers/tax-scraper.js';
import { captureGisViewerScreenshots } from './scrapers/gis-viewer-capture.js';
import { captureMapScreenshots } from './scrapers/map-screenshot-capture.js';

export const BELL_MODULE: CountyModule = {
  name: 'Bell',
  key: 'bell',
  fips: BELL_ENDPOINTS.clerk.fipsCode,
  labels: {
    cad: 'Bell CAD',
    cadSite: 'Bell CAD eSearch',
    gis: 'Bell GIS',
    gisSite: 'Bell CAD GIS',
    clerk: 'Bell County Clerk',
    clerkSite: 'Bell County Clerk (Kofile)',
    platRepo: 'Bell County Plat Repository',
  },
  hosts: {
    cad: BELL_ENDPOINTS.cad.home,
    clerk: BELL_ENDPOINTS.clerk.home,
    cadVendor: 'bis',
    clerkVendor: 'kofile',
  },
  scrapers: {
    cad: scrapeBellCad,
    gis: scrapeBellGis,
    siblingLots: discoverSiblingLots,
    adjacentParcels: findAdjacentParcels,
    clerk: scrapeBellClerk,
    plats: scrapeBellPlats,
    fema: scrapeBellFema,
    txdot: scrapeBellTxDot,
    tax: scrapeBellTax,
  },
  captures: {
    gisViewer: captureGisViewerScreenshots,
    maps: captureMapScreenshots,
  },
};
