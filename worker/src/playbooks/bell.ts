// worker/src/playbooks/bell.ts — Bell County site playbooks (plan B3).
//
// Authored from what the scrapers already know and this session verified: the clerk's public search
// (Kofile) and the county plat repository (bellcountytx.com). Person-reviewed via code review; the
// version is bumped when the recipe changes. The atlas walk (B1/B2) will keep these honest (B5).

import type { Playbook } from './types.js';

export const BELL_CLERK: Playbook = {
  site: 'bell-clerk',
  county: 'BELL',
  version: 1,
  displayName: 'Bell County Clerk (Kofile public search)',
  entryUrl: 'https://bell.tx.publicsearch.us',
  egress: 'direct',
  dismissals: [
    { signal: 'a "Terms of Use" / disclaimer button on first entry', action: 'accept the terms to reach the search', why: 'the search form is behind the disclaimer' },
  ],
  searchRecipe: {
    // The plat search uses the subdivision name expanded to the terms the county filed it under
    // (see research/plat-search-terms.ts, C1); the deed search uses owner name then instrument.
    query: 'subdivision name with section/phase suffix stripped and recording-form abbreviations expanded; owner name; instrument number',
    documentTypes: ['PLAT', 'REPLAT', 'DEDICATION', 'WARRANTY DEED', 'DEED', 'EASEMENT'],
  },
  // The results grid shows "Loading Results" while the query runs; it is gone when the rows are ready.
  doneSignal: { kind: 'disappears', signal: 'Loading Results' },
  viewerRecipe: 'open a row to the document viewer; the real document URL is https://bell.tx.publicsearch.us/doc/<id>',
  downloadRecipe: 'capture each page image from the viewer (fetchDocumentImages); the free preview is watermarked — a purchase is a separate, gated path',
  captchaSignature: null,
};

export const BELL_PLAT_REPO: Playbook = {
  site: 'bell-plat-repo',
  county: 'BELL',
  version: 1,
  displayName: 'Bell County Clerk plat repository (bellcountytx.com)',
  entryUrl: 'https://www.bellcountytx.com/county_government/county_clerk/a.php',
  // The site 403s the worker's IP and answers only through the Browserbase egress (C2/C4).
  egress: 'browser-route',
  dismissals: [],
  searchRecipe: {
    query: 'alphabetical index page per first letter; match the subdivision name (and its C1 variants) among the <a href="*.pdf"> links',
    documentTypes: ['PLAT'],
  },
  // An index page is ready when its plat links are present; there is no async spinner.
  doneSignal: { kind: 'appears', signal: 'a href$=".pdf" (or /docs/plats/ in the href)' },
  viewerRecipe: 'the href IS the direct PDF; no viewer step',
  downloadRecipe: 'GET the PDF through the browser egress; a captcha or a non-PDF body means the wall is up (see detectCaptcha)',
  captchaSignature: null,
};

export const BELL_PLAYBOOKS: Playbook[] = [BELL_CLERK, BELL_PLAT_REPO];
