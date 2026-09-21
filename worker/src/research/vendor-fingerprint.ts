/**
 * What software is this county running?
 *
 * Owner, 2026-09-21: "consider all of the research and methods and playwright calling and stuff
 * that you are doing in this session to find all of the resources and compiling them. We need all
 * of that functionality built into our system."
 *
 * ── WHY THIS IS THE FIRST PIECE ─────────────────────────────────────────────────────────────────
 *
 * Because the single most expensive error this repository has made was a WRONG VENDOR, and it went
 * unnoticed for months. Williamson was configured as a BIS county. BIS counties answer at
 * `esearch.<something>` with a particular JSON search; Williamson runs True Automation PublicAccess
 * on DNN at `search.wcad.org` and answers nothing at all to a BIS-shaped request. The run generated
 * BIS address variants, sent them to a hostname that does not resolve, and reported the silence as
 * "the county appraisal site is unreachable".
 *
 * Nobody checked, because checking meant opening the site and knowing what you were looking at.
 * That is exactly the kind of knowledge that should live in code rather than in whoever happened to
 * drive it last.
 *
 * ── EVERY SIGNATURE HERE WAS READ OFF A LIVE PAGE ───────────────────────────────────────────────
 *
 * Not inferred from documentation and not copied from a vendor's marketing. Each was captured while
 * driving the real site on 2026-09-21, and the distinguishing markers are the ones that survive a
 * redesign: framework artefacts, URL shapes, API paths.
 */

export type Vendor =
  | 'true_automation'   // PublicAccess on DNN — Williamson (WCAD)
  | 'bis'               // BIS eSearch — Bell, Milam, ~30 others
  | 'tyler_eagle'       // Tyler Self-Service — Williamson clerk
  | 'tyler_odyssey'     // Odyssey Public Access — court records
  | 'kofile'            // Kofile PublicSearch — Bell clerk
  | 'socrata'           // Open data portal — data.wcad.org
  | 'arcgis_server'     // ArcGIS REST services
  | 'arcgis_experience' // Experience Builder app
  | 'texasfile'         // The statewide aggregator
  | 'civicplus'         // County government CMS — wilcotx.gov
  | 'unknown';

export interface Fingerprint {
  vendor: Vendor;
  /** 0-1. How sure, given what was visible. */
  confidence: number;
  /** The markers that fired, so a wrong identification can be traced to its rule. */
  evidence: string[];
  /** What this vendor means for a run — the sentence a profile wants. */
  note: string;
}

interface Signature {
  vendor: Vendor;
  note: string;
  /** Each returns the marker's name when it fires. */
  markers: Array<{ name: string; weight: number; test: (ctx: FingerprintInput) => boolean }>;
}

export interface FingerprintInput {
  url?: string | null;
  /** The page's HTML or its rendered text. Either works; more is better. */
  body?: string | null;
  title?: string | null;
  headers?: Record<string, string>;
}

const has = (hay: string | null | undefined, needle: RegExp) => Boolean(hay && needle.test(hay));

const SIGNATURES: Signature[] = [
  {
    vendor: 'true_automation',
    note:
      'True Automation / Tyler PublicAccess on DNN. Free-text property search at ' +
      '/ProxyT/Search/Properties/quick/ returning JSON with no auth; the detail page is ASP.NET ' +
      'WebForms and must be read by label. Tax year runs a year ahead of the calendar.',
    markers: [
      { name: 'title says PublicAccess', weight: 0.5, test: (c) => has(c.title, /PublicAccess/i) },
      { name: '/ProxyT/ API path', weight: 0.6, test: (c) => has(c.url, /\/ProxyT\//i) || has(c.body, /\/ProxyT\/Search\/Properties/i) },
      { name: 'Property-Detail route', weight: 0.4, test: (c) => has(c.url, /Property-Detail/i) || has(c.body, /Property-Detail\?PropertyQuickRefID/i) },
      { name: 'DNN framework', weight: 0.2, test: (c) => has(c.body, /dnn\$ctl|__dnnVariable|DotNetNuke/i) },
      { name: 'PropertyQuickRefID', weight: 0.5, test: (c) => has(c.body, /PropertyQuickRefID/i) },
    ],
  },
  {
    vendor: 'bis',
    note:
      'BIS eSearch. Search through the JSON results API; the detail page read by its labels. This ' +
      'is what most of the counties around Bell run.',
    markers: [
      { name: 'esearch hostname', weight: 0.5, test: (c) => has(c.url, /\/\/esearch\./i) },
      { name: 'bisclient GIS', weight: 0.4, test: (c) => has(c.body, /bisclient\.com/i) || has(c.url, /bisclient\.com/i) },
      { name: 'BIS branding', weight: 0.3, test: (c) => has(c.body, /Brazos Information Systems|BIS Consulting/i) },
    ],
  },
  {
    vendor: 'tyler_eagle',
    note:
      'Tyler Technologies Self-Service. An "I Accept" disclaimer gate, then /search/DOCSEARCH…. ' +
      'The NAME fields are chip lists: the search term is the entry selected from the suggestion ' +
      'dropdown, NOT the text typed into the box. A fill-and-submit returns "Your search could ' +
      'not be completed", which is not the same sentence as "no results".',
    markers: [
      { name: 'DOCSEARCH route', weight: 0.6, test: (c) => has(c.url, /DOCSEARCH\d+/i) || has(c.body, /DOCSEARCH\d+/i) },
      { name: 'tylerhost.net', weight: 0.5, test: (c) => has(c.url, /tylerhost\.net/i) },
      { name: 'Self-Service title', weight: 0.3, test: (c) => has(c.title, /Self-?Service/i) },
      { name: 'Tyler copyright', weight: 0.3, test: (c) => has(c.body, /Copyright[^<]{0,30}Tyler Technologies/i) },
      { name: 'chip-list field ids', weight: 0.4, test: (c) => has(c.body, /field_BothNamesID|cblist-input-list/i) },
    ],
  },
  {
    vendor: 'tyler_odyssey',
    note:
      'Tyler Odyssey Public Access — court records. Search.aspx?ID=200 is Civil, Family & Probate, ' +
      'where heirship, partition and trespass-to-try-title live. PartySearchMode has a BusinessName ' +
      'mode, which is what an entity owner needs.',
    markers: [
      { name: 'PublicAccess/Search.aspx', weight: 0.6, test: (c) => has(c.url, /PublicAccess\/(default|Search)\.aspx/i) },
      { name: 'LaunchSearch handler', weight: 0.4, test: (c) => has(c.body, /LaunchSearch\('Search\.aspx/i) },
      { name: 'Records Inquiry title', weight: 0.3, test: (c) => has(c.body, /Records Inquiry/i) },
    ],
  },
  {
    vendor: 'kofile',
    note:
      'Kofile PublicSearch. Department-scoped: check which departments it actually exposes before ' +
      'trusting it for land records — Williamson\'s carries ONLY Commissioners Court, so a deed ' +
      'search there returns an empty page that reads as "this property has no deeds".',
    markers: [
      { name: 'publicsearch.us host', weight: 0.6, test: (c) => has(c.url, /publicsearch\.us/i) },
      { name: 'department query', weight: 0.3, test: (c) => has(c.url, /[?&]department=/i) },
      { name: 'Kofile branding', weight: 0.3, test: (c) => has(c.body, /Kofile/i) },
    ],
  },
  {
    vendor: 'socrata',
    note:
      'A Socrata open-data portal with a full SODA API — JSON, $where, $select, $group, no key. ' +
      'Often the richest source a county has and almost never documented: WCAD publishes 97 ' +
      'datasets including parcels WITH polygons, sales with book/page, and subdivisions.',
    markers: [
      { name: '/resource/ API', weight: 0.5, test: (c) => has(c.url, /\/resource\/[a-z0-9]{4}-[a-z0-9]{4}\.json/i) },
      { name: 'catalog API', weight: 0.5, test: (c) => has(c.url, /\/api\/catalog\/v1/i) },
      { name: 'Socrata markers', weight: 0.4, test: (c) => has(c.body, /socrata|tyler-technologies\.com\/data|\/stories\/s\//i) },
    ],
  },
  {
    vendor: 'arcgis_server',
    note: 'An ArcGIS REST service directory. Layers can be queried directly for parcel geometry.',
    markers: [
      { name: 'rest/services path', weight: 0.6, test: (c) => has(c.url, /\/(arcgis|server)\/rest\/services/i) },
      { name: 'FeatureServer or MapServer', weight: 0.5, test: (c) => has(c.url, /(Feature|Map)Server/i) },
    ],
  },
  {
    vendor: 'arcgis_experience',
    note: 'An ArcGIS Experience Builder app. Usually keyed by a property id in the query string.',
    markers: [
      { name: 'experience.arcgis.com', weight: 0.7, test: (c) => has(c.url, /experience\.arcgis\.com/i) },
    ],
  },
  {
    vendor: 'texasfile',
    note:
      'The statewide aggregator. Free index and image previews; PDFs charged per page. Its ' +
      'instrument-number search returns empty where book/vol/page works, so a county whose ' +
      'appraisal data cites book and page lands on its strongest search.',
    markers: [
      { name: 'texasfile.com', weight: 0.7, test: (c) => has(c.url, /texasfile\.com/i) },
      { name: 'county-clerk-records path', weight: 0.3, test: (c) => has(c.url, /\/(county-clerk|plat)-records\//i) },
    ],
  },
  {
    vendor: 'civicplus',
    note: 'A CivicPlus county government CMS. Not a records source itself — a directory of links to them.',
    markers: [
      { name: 'CivicPlus footer', weight: 0.6, test: (c) => has(c.body, /Government Websites by CivicPlus/i) },
      { name: 'numbered page route', weight: 0.2, test: (c) => has(c.url, /\/\d{3,4}\/[A-Za-z-]+$/) },
    ],
  },
];

/**
 * Identify the software behind a page.
 *
 * Weights are summed and clamped rather than averaged, because the markers are INDEPENDENT
 * evidence: a `/ProxyT/` path and a `PropertyQuickRefID` each point at True Automation on their
 * own, and seeing both should raise confidence rather than dilute it — which is what an average
 * would do when one weak marker fires alongside a strong one.
 */
export function fingerprint(input: FingerprintInput): Fingerprint {
  let best: Fingerprint = {
    vendor: 'unknown', confidence: 0, evidence: [],
    note: 'No known vendor signature matched. Drive it by hand and add one.',
  };

  for (const sig of SIGNATURES) {
    const fired = sig.markers.filter((m) => {
      try { return m.test(input); } catch { return false; }
    });
    if (fired.length === 0) continue;

    const confidence = Math.min(1, fired.reduce((n, m) => n + m.weight, 0));
    if (confidence > best.confidence) {
      best = { vendor: sig.vendor, confidence, evidence: fired.map((m) => m.name), note: sig.note };
    }
  }

  return best;
}

/** Everything this module can recognise — for a coverage report, and for a test to assert against. */
export function knownVendors(): Array<{ vendor: Vendor; note: string; markerCount: number }> {
  return SIGNATURES.map((s) => ({ vendor: s.vendor, note: s.note, markerCount: s.markers.length }));
}

/**
 * Does the vendor we found match the vendor we expected?
 *
 * The check that would have caught Williamson. A profile declares a vendor; this says whether the
 * live site agrees, and a disagreement is a configuration defect rather than an outage.
 */
export function vendorMismatch(
  expected: string | null | undefined,
  found: Fingerprint,
): { mismatch: boolean; message: string } | null {
  const e = (expected ?? '').trim().toLowerCase();
  if (!e || found.vendor === 'unknown' || found.confidence < 0.5) return null;
  if (e === found.vendor) return null;

  return {
    mismatch: true,
    message:
      `Configured as "${expected}" but the live site fingerprints as "${found.vendor}" ` +
      `(${(found.confidence * 100).toFixed(0)}%: ${found.evidence.join(', ')}). ` +
      'A wrong vendor means every request is the wrong SHAPE, and the silence that follows reads ' +
      'as the site being down. This is a configuration defect, not an outage.',
  };
}
