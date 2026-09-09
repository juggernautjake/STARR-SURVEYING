// worker/src/playbooks/milam.ts — Milam County site playbooks (plan B3 shape).
//
// Authored from the sites as driven live on 2026-09-09 (counties/milam/config/endpoints.ts). The
// version is bumped when a recipe changes; the atlas walk (B5) keeps these honest.

import type { Playbook } from './types.js';

export const MILAM_CLERK: Playbook = {
  site: 'milam-clerk',
  county: 'MILAM',
  version: 1,
  displayName: 'Milam County Clerk (Kofile public search)',
  entryUrl: 'https://milam.tx.publicsearch.us',
  egress: 'direct',
  dismissals: [
    { signal: 'a "Terms of Use" / disclaimer button on first entry', action: 'accept the terms to reach the search', why: 'the search form is behind the disclaimer' },
  ],
  searchRecipe: {
    // The appraisal district cites deeds by volume/page; the advanced search takes them directly
    // (results?department=RP&searchType=advancedSearch&volume=…&page=…&recordedDateRange=…).
    query: 'volume/page from the appraisal deed history; owner name; subdivision name with recording-form abbreviations expanded; instrument number ("2009-109100")',
    documentTypes: ['PLAT', 'SURVEY PLAT', 'AMENDMENT TO PLAT', 'PLAT VACATE AND REPLAT', 'WARRANTY DEED', 'WARNTY DEED', 'WARRANTY DEED V/LIEN', 'ASSUMPTION W/D', 'DEED', 'EASEMENT', 'RIGHT OF WAY DEED'],
  },
  doneSignal: { kind: 'disappears', signal: 'Loading Results' },
  viewerRecipe: 'open a row to the document viewer; the real document URL is https://milam.tx.publicsearch.us/doc/<internal id> (not the instrument number)',
  downloadRecipe: 'capture each page image from the viewer (fetchDocumentImages); the free preview is watermarked — a copy is $1/page + $2/document through the cart',
  captchaSignature: null,
};

export const MILAM_CAD: Playbook = {
  site: 'milam-cad',
  county: 'MILAM',
  version: 1,
  displayName: 'Milam AD (BIS eSearch appraisal district)',
  entryUrl: 'https://esearch.milamad.org/',
  egress: 'direct',
  dismissals: [],
  searchRecipe: {
    query: 'street name (+ number) through the results API (POST /search/SearchResults with a session token from /search/requestSessionToken); owner name; property id',
    documentTypes: ['APPRAISAL RECORD'],
  },
  // The grid is loaded from JSON; the page itself is only the shell. Ready when a row exists.
  doneSignal: { kind: 'appears', signal: 'table tbody tr[data-uid], .resultsList' },
  viewerRecipe: 'open a result row to the property detail page (/Property/View/<id>?year=<year>)',
  downloadRecipe: 'the appraisal record is read from the detail page HTML (owner, legal, deed history by volume/page); "View Map → Interactive Map" links to maps.pandai.com/milamad/?find=<id>',
  captchaSignature: null,
};

export const MILAM_GIS: Playbook = {
  site: 'milam-gis',
  county: 'MILAM',
  version: 1,
  displayName: 'Milam AD parcel map (Pritchard & Abbott ArcGIS Web AppBuilder)',
  entryUrl: 'https://maps.pandai.com/milamad/',
  egress: 'direct',
  dismissals: [
    { signal: 'a splash dialog with an "Accept" button', action: 'click Accept', why: 'the map is behind the disclaimer' },
  ],
  searchRecipe: {
    query: '?find=<propertyId> zooms to the parcel and opens its popup; the data itself is read from gisdata.pandai.com/pamaps01/rest/services/Milam/MilamCADPublic/MapServer (layer 0 parcels+accounts, 3 surveys, 5 subdivisions) without the viewer',
    documentTypes: ['PARCEL MAP'],
  },
  doneSignal: { kind: 'appears', signal: 'the parcel popup text "Parcel: <id>"' },
  viewerRecipe: 'window._viewerMap (ArcGIS 3.34) — setLevel(n) to zoom, getLayer(id).setVisibility(false) to drop the parcel lines; /export on the MapServer renders any bbox server-side',
  downloadRecipe: 'compose the MapServer /export PNG over Esri World Imagery for the same bbox; photograph the viewer at three zoom levels',
  captchaSignature: null,
};

export const MILAM_QUICKLINK: Playbook = {
  site: 'milam-quicklink',
  county: 'MILAM',
  version: 1,
  displayName: 'Milam County Clerk historic index books (Kofile QuickLink, 1874–1982)',
  entryUrl: 'https://kofilequicklinks.com/Milam/',
  egress: 'direct',
  dismissals: [],
  searchRecipe: {
    query: 'ASP.NET WebForms postbacks: "Search for a Document" — Book (Deed Record / Deed of Trust / Oil and Gas), Volume (select, populated after Book), Page (text), then cmdSearchDocument',
    documentTypes: ['DEED RECORD', 'DEED OF TRUST'],
  },
  doneSignal: { kind: 'appears', signal: 'Viewer.aspx?ImageId=<n> — one ImageId per page; "Image: k/n" in the toolbar' },
  viewerRecipe: 'the viewer tiles a TIFF through Viewer.aspx?atalagettile=true&atala_si=DistortionCache\\48331-Deed+Record_<vol>_<page>_d1.tiff; adjacent pages are ImageId±1',
  downloadRecipe: 'not automated yet — photograph the viewer, or purchase through the site cart; recorded here so the pre-1983 volume/page references in a deed chain have a known home',
  captchaSignature: null,
};

export const MILAM_PLAYBOOKS: Playbook[] = [MILAM_CLERK, MILAM_CAD, MILAM_GIS, MILAM_QUICKLINK];
