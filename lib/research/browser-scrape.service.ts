// lib/research/browser-scrape.service.ts
//
// Active browser-automation research for county property records.
//
// Uses Playwright (headless Chromium) to:
//   1. Navigate to county CAD e-search portals
//   2. Try every address variant in the search box and submit
//   3. Wait for results, take a screenshot, extract property ID from DOM + AI vision
//   4. Navigate to the property detail page and screenshot it
//   5. Open the county clerk deed search (publicsearch.us) with the property ID
//   6. Screenshot each deed document page
//   7. Use Claude vision to extract legal description, boundary calls, and easements
//   8. Store all screenshots as research_documents for the project
//
// Graceful degradation: if Playwright or a Chromium binary is not available the
// service returns null without throwing, so the caller can fall back to other methods.

import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET, ensureStorageBucket } from '@/lib/supabase';
import { callAI, callVision } from './ai-client';
import { stripStreetTypeSuffix, extractPropertyIdsFromEsearchHtml, extractPublicsearchItems } from './boundary-fetch.service';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BrowserScrapeRequest {
  projectId: string;
  address: string;
  addressVariants: string[];
  countyKey: string;
  /** Already-known property ID — skip CAD search and go straight to deed search */
  knownPropertyId?: string;
}

export interface BrowserScrapeResult {
  propertyId: string | null;
  legalDescription: string | null;
  ownerName: string | null;
  deedReference: string | null;
  /** IDs of research_documents rows created for screenshots */
  documentIds: string[];
  steps: string[];
}

// ── County configuration ──────────────────────────────────────────────────────

interface CountyBrowserConfig {
  name: string;
  cadSearchUrl: string;
  /**
   * Optional pre-filled search URL template.  When present, the browser navigates
   * directly to this URL (with {query} replaced by the address variant and {year}
   * by the current year) instead of trying to fill in the search form.  This is
   * more reliable on Tyler Technologies / Harris-Govern eSearch portals that accept
   * query params at load time.
   */
  cadPrefilledSearchUrlTemplate?: string;
  /** CSS selector for the search input on the CAD portal */
  cadSearchInputSelector: string;
  /** CSS selector for the submit button */
  cadSearchSubmitSelector: string;
  /** CSS selector for a result row (to know results loaded) */
  cadResultRowSelector: string;
  /** CSS selector(s) for extracting the property ID from the result row */
  cadPropertyIdSelectors: string[];
  /** URL pattern for the property detail page once prop ID is known: {id} is replaced */
  cadDetailUrl?: string;
  /** publicsearch.us subdomain */
  publicsearchSubdomain?: string;
}

const COUNTY_BROWSER_CONFIGS: Record<string, CountyBrowserConfig> = {
  bell: {
    name: 'Bell County Appraisal District',
    cadSearchUrl: 'https://esearch.bellcad.org/Property/Search',
    // Tyler Tech eSearch portals accept ?type=address&value=…&year=… and auto-submit
    cadPrefilledSearchUrlTemplate: 'https://esearch.bellcad.org/Property/Search?type=address&value={query}&year={year}',
    cadSearchInputSelector: [
      'input[id="Property_SearchValue"]',
      'input[name="SearchValue"]',
      'input#searchValue',
      'input[id="searchValue"]',
      'input[name="searchValue"]',
      'input[type="search"]',
      'input[placeholder*="address" i]',
      'input[placeholder*="search" i]',
      'input[type="text"]',
    ].join(', '),
    cadSearchSubmitSelector: 'button[type="submit"], input[type="submit"], button:has-text("Search"), .search-btn',
    cadResultRowSelector: '.search-results tr:not(:first-child), .result-row, tr.property-row, table tbody tr',
    cadPropertyIdSelectors: [
      'td[data-label*="property" i]',
      'td[data-label*="id" i]',
      'td:first-child a',
      'td:first-child',
      '[data-prop-id]',
      '.property-id',
    ],
    cadDetailUrl: 'https://esearch.bellcad.org/Property/View/{id}',
    publicsearchSubdomain: 'bell.tx.publicsearch.us',
  },
  williamson: {
    name: 'Williamson County Appraisal District',
    cadSearchUrl: 'https://esearch.wcad.org/Property/Search',
    cadPrefilledSearchUrlTemplate: 'https://esearch.wcad.org/Property/Search?type=address&value={query}&year={year}',
    cadSearchInputSelector: 'input[id="Property_SearchValue"], input[name="SearchValue"], input#searchValue, input[type="search"], input[placeholder*="address" i]',
    cadSearchSubmitSelector: 'button[type="submit"], .search-btn',
    cadResultRowSelector: '.search-results tr:not(:first-child), table tbody tr',
    cadPropertyIdSelectors: ['td:first-child a', 'td:first-child', '[data-prop-id]'],
    cadDetailUrl: 'https://esearch.wcad.org/Property/View/{id}',
    publicsearchSubdomain: 'williamson.tx.publicsearch.us',
  },
  hays: {
    name: 'Hays County Appraisal District',
    cadSearchUrl: 'https://esearch.hayscad.com/Property/Search',
    cadPrefilledSearchUrlTemplate: 'https://esearch.hayscad.com/Property/Search?type=address&value={query}&year={year}',
    cadSearchInputSelector: 'input[id="Property_SearchValue"], input[name="SearchValue"], input#searchValue, input[type="search"], input[placeholder*="address" i]',
    cadSearchSubmitSelector: 'button[type="submit"], .search-btn',
    cadResultRowSelector: '.search-results tr:not(:first-child), table tbody tr',
    cadPropertyIdSelectors: ['td:first-child a', 'td:first-child'],
    cadDetailUrl: 'https://esearch.hayscad.com/Property/View/{id}',
    publicsearchSubdomain: 'hays.tx.publicsearch.us',
  },
};

// ── Playwright type imports (lazy — only used at runtime) ─────────────────────

let playwrightAvailable: boolean | null = null;

async function getPlaywright() {
  if (playwrightAvailable === false) return null;
  try {
    // Try playwright first (bundled with browser binaries for local dev);
    // fall back to playwright-core (no bundled browser, relies on @sparticuz/chromium
    // or a PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH env var on the host).
    const pw = await import('playwright').catch(() => import('playwright-core'));
    playwrightAvailable = true;
    return pw;
  } catch {
    playwrightAvailable = false;
    return null;
  }
}

/**
 * Resolve the Chromium launch configuration.
 *
 * In serverless environments (Vercel Pro, AWS Lambda) the standard Playwright
 * browser binary is not available.  @sparticuz/chromium ships a Lambda-compatible
 * Chromium build (~55 MB compressed) that works within Vercel Pro's 250 MB limit.
 *
 * Local development: @sparticuz/chromium falls back gracefully so the standard
 * Playwright-bundled browser is used instead.
 */
async function getChromiumLaunchOptions(): Promise<{
  executablePath?: string;
  args: string[];
  headless: boolean;
}> {
  const baseArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    return {
      executablePath: await chromium.executablePath(),
      args: [...chromium.args, ...baseArgs],
      headless: true,
    };
  } catch {
    // @sparticuz/chromium not available or not on a serverless platform —
    // let Playwright use its own bundled browser (local dev, self-hosted servers).
    return { args: baseArgs, headless: true };
  }
}

// ── Screenshot storage ────────────────────────────────────────────────────────

async function storeScreenshotAsDocument(
  projectId: string,
  screenshotBuffer: Buffer,
  label: string,
  documentType: string,
  sourceUrl: string,
  extractedText: string,
): Promise<string | null> {
  const filename = `browser_capture_${Date.now()}.png`;
  const storagePath = `${projectId}/browser-captures/${filename}`;

  let storageUrl: string | null = null;
  try {
    await ensureStorageBucket();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(RESEARCH_DOCUMENTS_BUCKET)
      .upload(storagePath, screenshotBuffer, { contentType: 'image/png', upsert: false });

    if (!uploadError) {
      const { data } = supabaseAdmin.storage.from(RESEARCH_DOCUMENTS_BUCKET).getPublicUrl(storagePath);
      storageUrl = data?.publicUrl ?? null;
    }
  } catch { /* non-fatal */ }

  try {
    // Skip if a document with the same source_url and label already exists
    const { data: existing } = await supabaseAdmin
      .from('research_documents')
      .select('id')
      .eq('research_project_id', projectId)
      .eq('source_url', sourceUrl)
      .eq('document_label', label)
      .maybeSingle();
    if (existing) return existing.id;
  } catch { /* non-fatal — proceed with insert */ }

  try {
    const { data: doc, error } = await supabaseAdmin
      .from('research_documents')
      .insert({
        research_project_id: projectId,
        source_type: 'property_search',
        document_type: documentType,
        document_label: label,
        source_url: sourceUrl,
        original_filename: filename,
        file_type: 'png',
        file_size_bytes: screenshotBuffer.byteLength,
        storage_path: storageUrl ? storagePath : null,
        storage_url: storageUrl,
        processing_status: 'extracted',
        extracted_text: extractedText,
        extracted_text_method: 'browser_capture',
        recording_info: `Browser-captured from ${sourceUrl}`,
      })
      .select('id')
      .single();

    if (error || !doc) return null;
    return doc.id;
  } catch { return null; }
}

// ── HTTP-fetched document storage ────────────────────────────────────────────

/**
 * Store plain-text content fetched via HTTP as a research_document row.
 * Used by the HTTP GET fallback path when Playwright is not available.
 */
async function storeHttpFetchedDocument(
  projectId: string,
  label: string,
  documentType: string,
  sourceUrl: string,
  textContent: string,
): Promise<string | null> {
  try {
    const { data: existing } = await supabaseAdmin
      .from('research_documents')
      .select('id')
      .eq('research_project_id', projectId)
      .eq('source_url', sourceUrl)
      .eq('extracted_text_method', 'http_fetch')
      .maybeSingle();
    if (existing) return existing.id;
  } catch { /* non-fatal */ }

  try {
    const { data: doc, error } = await supabaseAdmin
      .from('research_documents')
      .insert({
        research_project_id: projectId,
        source_type: 'property_search',
        document_type: documentType,
        document_label: label,
        source_url: sourceUrl,
        file_type: 'html',
        processing_status: 'extracted',
        extracted_text: textContent.substring(0, 40_000), // research_documents.extracted_text column limit
        extracted_text_method: 'http_fetch',
        recording_info: `HTTP-fetched from ${sourceUrl}`,
      })
      .select('id')
      .single();

    if (error || !doc) return null;
    return doc.id;
  } catch { return null; }
}

/** Strip HTML tags and collapse whitespace to extract readable text from an HTML response. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── HTTP GET fallback: property research without Playwright ───────────────────

/**
 * eSearch portal base URLs for counties that expose a JSON search API.
 * Mirrors the COUNTY_BROWSER_CONFIGS for HTTP-only access.
 */
const ESEARCH_HTTP_CONFIG: Record<string, { baseUrl: string; name: string; publicsearchSubdomain?: string }> = {
  bell:       { baseUrl: 'https://esearch.bellcad.org',  name: 'Bell CAD e-Search',         publicsearchSubdomain: 'bell.tx.publicsearch.us'        },
  hays:       { baseUrl: 'https://esearch.hayscad.com',  name: 'Hays CAD e-Search',         publicsearchSubdomain: 'hays.tx.publicsearch.us'        },
  williamson: { baseUrl: 'https://esearch.wcad.org',      name: 'Williamson CAD e-Search',   publicsearchSubdomain: 'williamson.tx.publicsearch.us'  },
};

// Per-request timeout for HTTP fallback fetches.
// Three requests are made sequentially (search → detail → deed), each capped at 30 s.
const HTTP_FETCH_TIMEOUT_MS = 30_000;

/** Maximum characters to store for a legal description (covers the longest Texas legal descs). */
const MAX_LEGAL_DESCRIPTION_LENGTH = 2_000;

async function httpFetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Extract an array of hit objects from any known eSearch portal JSON response envelope. */
function extractHttpSearchHits(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d?.Results)) return d.Results as Array<Record<string, unknown>>;
  if (Array.isArray(d?.data))    return d.data    as Array<Record<string, unknown>>;
  return [];
}

/**
 * Fetch instrument list and first instrument detail from a publicsearch.us portal.
 * Tyler Tech's SPA loads data from their JSON REST API — the HTML shell is empty.
 *
 * Returns plain text suitable for storage as a research document, plus the raw
 * instrument list for further processing.
 */
async function fetchPublicsearchInstruments(
  subdomain: string,
  query: string,
  projectId: string,
  steps: string[],
): Promise<{ documentIds: string[]; legalDescription: string | null; deedReference: string | null; ownerName: string | null }> {
  const origin = `https://${subdomain}`;
  const documentIds: string[] = [];
  let legalDescription: string | null = null;
  let deedReference: string | null = null;
  let ownerName: string | null = null;

  const hdrs: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Referer': origin + '/',
    'Origin': origin,
  };

  // ── Step A: Fetch instrument list ────────────────────────────────────────
  const searchEps = [
    `${origin}/api/instruments?searchText=${encodeURIComponent(query)}&pageSize=20`,
    `${origin}/api/v1/instruments?q=${encodeURIComponent(query)}&pageSize=20`,
    `${origin}/api/instruments?q=${encodeURIComponent(query)}&limit=20`,
    `${origin}/api/instruments?propertyId=${encodeURIComponent(query)}&pageSize=20`,
  ];

  let instruments: Array<Record<string, unknown>> = [];
  for (const ep of searchEps) {
    try {
      steps.push(`[PublicSearch] Trying API: ${ep}`);
      const res = await httpFetchWithTimeout(ep, { headers: hdrs });
      if (!res.ok) { steps.push(`[PublicSearch] HTTP ${res.status}`); continue; }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) { steps.push(`[PublicSearch] Non-JSON response`); continue; }
      const data = await res.json() as unknown;
      const items = extractPublicsearchItems(data);
      if (items.length > 0) {
        instruments = items;
        steps.push(`[PublicSearch] ✓ Found ${instruments.length} instrument(s) via ${ep}`);
        break;
      } else {
        steps.push(`[PublicSearch] API returned 0 instruments`);
      }
    } catch (err) {
      steps.push(`[PublicSearch] API error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (instruments.length === 0) {
    steps.push(`[PublicSearch] No instruments found for query: "${query}"`);
    return { documentIds, legalDescription, deedReference, ownerName };
  }

  // Build summary text from instrument list
  const lines: string[] = [`County Clerk Instruments for: ${query}`, ''];
  for (const inst of instruments.slice(0, 15)) {
    const id       = String(inst.id ?? inst.instrumentId ?? inst.InstrumentId ?? '');
    const type     = String(inst.type ?? inst.instrumentType ?? inst.InstrumentType ?? '');
    const desc     = String(inst.description ?? inst.Description ?? '');
    const date     = String(inst.recordedDate ?? inst.instrumentDate ?? inst.Date ?? '');
    const vol      = String(inst.volume ?? inst.Volume ?? '');
    const pg       = String(inst.page ?? inst.Page ?? '');
    const grantors = String(inst.grantors ?? inst.Grantors ?? '');
    const grantees = String(inst.grantees ?? inst.Grantees ?? '');
    lines.push(`Instrument ID: ${id}`);
    if (type)      lines.push(`  Type: ${type}`);
    if (desc)      lines.push(`  Description: ${desc}`);
    if (date)      lines.push(`  Recorded: ${date}`);
    if (vol || pg) lines.push(`  Volume: ${vol}, Page: ${pg}`);
    if (grantors)  lines.push(`  Grantors: ${grantors}`);
    if (grantees)  lines.push(`  Grantees: ${grantees}`);
    lines.push('');

    // Capture deed reference from first warrant-deed-type instrument
    if (!deedReference && (vol || pg) && /deed|warranty/i.test(type || desc)) {
      deedReference = [vol && `Vol. ${vol}`, pg && `Pg. ${pg}`].filter(Boolean).join(', ');
    }
    if (!ownerName && grantees) ownerName = grantees.trim().split('\n')[0].trim().substring(0, 200);
  }

  const summaryText = lines.join('\n');
  const summaryDocId = await storeHttpFetchedDocument(
    projectId,
    `County Clerk Instruments — ${query}`,
    'deed',
    `${origin}/results?search=index,fullText&q=${encodeURIComponent(query)}`,
    summaryText.substring(0, 40_000),
  );
  if (summaryDocId) documentIds.push(summaryDocId);

  // ── Step B: Fetch the most relevant instrument's full detail + pages ────
  // Prioritize warranty deeds and special warranty deeds over other types.
  const ranked = [...instruments].sort((a, b) => {
    const aType = String(a.type ?? a.instrumentType ?? '').toLowerCase();
    const bType = String(b.type ?? b.instrumentType ?? '').toLowerCase();
    const score = (t: string) => t.includes('warranty deed') ? 2 : t.includes('deed') ? 1 : 0;
    return score(bType) - score(aType);
  });

  for (const inst of ranked.slice(0, 3)) {
    const instId = String(inst.id ?? inst.instrumentId ?? inst.InstrumentId ?? '');
    if (!instId) continue;

    // Fetch instrument detail
    for (const detailEp of [
      `${origin}/api/instruments/${instId}`,
      `${origin}/api/v1/instruments/${instId}`,
    ]) {
      try {
        const res = await httpFetchWithTimeout(detailEp, { headers: hdrs });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('json')) continue;
        const detail = await res.json() as Record<string, unknown>;
        const detailText = `Instrument Detail (ID: ${instId}):\n${JSON.stringify(detail, null, 2)}`;

        // Try to find total page count
        const pageCount = Number(detail.pageCount ?? detail.numberOfPages ?? detail.pages ?? 1);

        // Try to fetch page images — Tyler Tech provides images for each page
        const pageTexts: string[] = [];
        const pagesToFetch = Math.min(pageCount || 1, 8); // cap at 8 pages
        for (let p = 1; p <= pagesToFetch; p++) {
          const pageEps = [
            `${origin}/api/instruments/${instId}/pages/${p}`,
            `${origin}/api/pages?instrumentId=${instId}&pageNumber=${p}`,
            `${origin}/api/instruments/${instId}/page/${p}`,
          ];
          let pageText: string | null = null;
          for (const pageEp of pageEps) {
            try {
              const pageRes = await httpFetchWithTimeout(pageEp, { headers: hdrs });
              if (!pageRes.ok) continue;
              const pageCt = pageRes.headers.get('content-type') ?? '';
              if (pageCt.includes('json')) {
                const pageData = await pageRes.json() as Record<string, unknown>;
                pageText = JSON.stringify(pageData);
                break;
              }
            } catch { /* try next */ }
          }
          if (pageText) pageTexts.push(pageText);
        }

        const fullText = [
          detailText,
          pageTexts.length > 0 ? `\n\nPage Data:\n${pageTexts.join('\n')}` : '',
        ].join('').substring(0, 40_000);

        const docId = await storeHttpFetchedDocument(
          projectId,
          `Deed Document — Instrument ${instId}`,
          'deed',
          `${origin}/api/instruments/${instId}`,
          fullText,
        );
        if (docId) {
          documentIds.push(docId);
          steps.push(`[PublicSearch] ✓ Stored instrument ${instId} (${fullText.length} chars)`);
        }

        // Try to extract legal description from instrument detail fields
        const ld = String(detail.legalDescription ?? detail.LegalDescription ?? detail.legal_description ?? '');
        if (ld && ld.length > 20 && !legalDescription) {
          legalDescription = ld;
          steps.push(`[PublicSearch] Legal description from instrument detail: "${ld.substring(0, 80)}…"`);
        }
        break; // got detail for this instrument
      } catch (err) {
        steps.push(`[PublicSearch] Detail fetch error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  steps.push(`[PublicSearch] Stored ${documentIds.length} instrument document(s)`);
  return { documentIds, legalDescription, deedReference, ownerName };
}

/**
 * Fallback property research using plain HTTP GET requests to the county eSearch
 * portal JSON API and detail page.  Called when Playwright is not installed or the
 * Chromium binary is not present on the server.
 *
 * Steps:
 *  1. Try every address variant against the eSearch JSON search endpoint.
 *  2. Once a property ID is found, fetch the property detail HTML page.
 *  3. Parse the HTML for legal description, owner name, and deed reference.
 *  4. Optionally fetch the publicsearch.us deed results page.
 *  5. Store each fetched page as a research_document row.
 */
async function httpPropertyResearch(req: BrowserScrapeRequest): Promise<BrowserScrapeResult> {
  const steps: string[] = ['[HTTP] Playwright not available — using HTTP GET fallback to CAD eSearch portal'];
  const documentIds: string[] = [];

  const config = ESEARCH_HTTP_CONFIG[req.countyKey];
  if (!config) {
    steps.push(`[HTTP] No HTTP eSearch config for county "${req.countyKey}" — cannot proceed`);
    return { propertyId: null, legalDescription: null, ownerName: null, deedReference: null, documentIds, steps };
  }

  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)',
    'Accept': 'application/json, text/html, */*',
  };

  let propertyId: string | null = req.knownPropertyId ?? null;
  let legalDescription: string | null = null;
  let ownerName: string | null = null;
  let deedReference: string | null = null;

  // ── Step 1: Resolve property ID via eSearch JSON API ──────────────────────
  if (!propertyId) {
    const year = new Date().getFullYear();

    outer: for (const variant of req.addressVariants) {
      steps.push(`[HTTP] Querying ${config.name} for address variant: "${variant}"`);

      const endpoints = [
        `${config.baseUrl}/Property/GetSearchResults?q=${encodeURIComponent(variant)}&type=address&year=${year}&resultLimit=10`,
        `${config.baseUrl}/api/v1/properties/search?q=${encodeURIComponent(variant)}&searchType=address`,
        `${config.baseUrl}/Search/GetSearchData?searchValue=${encodeURIComponent(variant)}&searchType=address&year=${year}`,
        `${config.baseUrl}/Property/QuickSearch?q=${encodeURIComponent(variant)}&type=address`,
      ];

      for (const url of endpoints) {
        try {
          const res = await httpFetchWithTimeout(url, {
            headers: { ...defaultHeaders, Accept: 'application/json' },
          });
          if (!res.ok) continue;
          const ct = res.headers.get('content-type') ?? '';
          if (!ct.includes('application/json')) continue;

          const data: unknown = await res.json();
          const hits = extractHttpSearchHits(data);

          if (hits.length === 0) continue;

          const raw = hits[0].prop_id ?? hits[0].PropertyId ?? hits[0].propertyId
            ?? hits[0].Id ?? hits[0].id ?? hits[0].AccountNum;
          if (raw != null) {
            propertyId = String(raw).trim();
            steps.push(`[HTTP] ✓ Found property ID: ${propertyId} via ${url}`);
            steps.push(`[PROPERTY ID FOUND] ✓ CAD property ID: ${propertyId}`);
            break outer;
          }
        } catch (endpointErr) {
          steps.push(`[HTTP] Endpoint ${url} failed: ${endpointErr instanceof Error ? endpointErr.message : String(endpointErr)}`);
        }
      }
    }

    // ── Step 1b: StreetNumber / StreetName keyword search (HTML endpoint) ────
    // Many Tyler-Technologies eSearch portals support keyword-style searches at
    // /search/result?keywords=StreetNumber:X%20StreetName:Y that return an HTML
    // page.  Removing the street-type suffix (Dr, Drive, Rd …) from the street
    // name greatly improves recall (e.g. "Waggoner" vs "Waggoner Dr").
    if (!propertyId && req.address) {
      const streetOnly = req.address.split(',')[0].replace(/\./g, '').replace(/\s+/g, ' ').trim().toUpperCase();
      const houseNumMatch = streetOnly.match(/^(\d+)\s+(.+)$/);
      if (houseNumMatch) {
        const houseNum = houseNumMatch[1];
        const fullStreetName = houseNumMatch[2].trim();
        const baseStreetName = stripStreetTypeSuffix(fullStreetName);

        const streetNameCandidates = [baseStreetName];
        if (baseStreetName !== fullStreetName) streetNameCandidates.push(fullStreetName);

        for (const streetName of streetNameCandidates) {
          // Trailing space after the street name matches the portal's expected keyword format
          // (confirmed working URL: keywords=StreetNumber:3424%20StreetName:Waggoner%20).
          const keywords = `StreetNumber:${houseNum} StreetName:${streetName} `;
          const url = `${config.baseUrl}/search/result?keywords=${encodeURIComponent(keywords)}`;
          steps.push(`[HTTP] Querying ${config.name} via keyword search: "${keywords.trim()}"`);
          try {
            const res = await httpFetchWithTimeout(url, {
              headers: { ...defaultHeaders, Accept: 'text/html,application/xhtml+xml,*/*' },
            });
            if (!res.ok) continue;
            const html = await res.text();
            const ids = extractPropertyIdsFromEsearchHtml(html);
            if (ids.length > 0) {
              propertyId = ids[0];
              steps.push(`[HTTP] ✓ Keyword search found ${ids.length} result(s) — using property ID: ${propertyId}`);
              steps.push(`[PROPERTY ID FOUND] ✓ CAD property ID: ${propertyId}`);
              break;
            }
          } catch (kwErr) {
            steps.push(`[HTTP] Keyword search failed: ${kwErr instanceof Error ? kwErr.message : String(kwErr)}`);
          }
        }
      }
    }

    if (!propertyId) {
      steps.push(`[HTTP] eSearch did not return a property ID for any address variant.`);
    }
  } else {
    steps.push(`[HTTP] Using known property ID: ${propertyId} — skipping CAD search`);
  }

  // ── Step 2: Fetch property detail page via HTTP ────────────────────────────
  if (propertyId) {
    const year = new Date().getFullYear();
    const detailUrl = `${config.baseUrl}/Property/View/${encodeURIComponent(propertyId)}?year=${year}`;
    steps.push(`[HTTP] Fetching property detail page: ${detailUrl}`);

    try {
      const res = await httpFetchWithTimeout(detailUrl, {
        headers: { ...defaultHeaders, Accept: 'text/html' },
      });

      if (res.ok) {
        const html = await res.text();
        const text = stripHtml(html);
        steps.push(`[HTTP] Property detail page fetched (${text.length} chars)`);

        const docId = await storeHttpFetchedDocument(
          req.projectId,
          `CAD Property Detail — ID ${propertyId} (${config.name})`,
          'appraisal_record',
          detailUrl,
          text,
        );
        if (docId) documentIds.push(docId);

        // Match "LEGAL DESCRIPTION: ..." up to the next section heading (double-space,
        // numbered list, or a known CAD field label) or end of text.
        // Terminators: PROPERTY, OWNER, VALUE, IMPROVEMENT, LAND, DEED are common
        // next-section labels on eSearch property detail pages.
        if (!legalDescription) {
          // Try multiple patterns for different CAD system formats
          const ldPatterns = [
            /LEGAL\s+DESCRIPTION[:\s]+([A-Z0-9][^\n]{19,}(?:\n[^\n]{10,}){0,5})/i,
            /LEGAL\s+DESC(?:RIPTION)?\s*[:\s]+(.{20,})(?=\s{2,}|\b(?:PROPERTY|OWNER|VALUE|IMPROVEMENT|LAND|DEED\s+VOL|GEO\s+ID|YEAR\s+BUILT)\b)/i,
          ];
          for (const pat of ldPatterns) {
            const ldMatch = text.match(pat);
            const ldCapture = ldMatch?.[1]?.trim();
            if (ldCapture && ldCapture.length > 10) {
              legalDescription = ldCapture.substring(0, MAX_LEGAL_DESCRIPTION_LENGTH);
              steps.push(`[HTTP] Extracted legal description (${legalDescription.length} chars): "${legalDescription.substring(0, 80)}${legalDescription.length > 80 ? '…' : ''}"`);
              break;
            }
          }
        }
        // Extract owner name — "OWNER:" or "OWNER NAME:" label
        if (!ownerName) {
          const ownerMatch = text.match(/(?:^|\s)OWNER(?:\s+NAME)?[:\s]+(.+?)(?:\s{2,}|$)/im);
          if (ownerMatch?.[1]?.trim()) {
            ownerName = ownerMatch[1].trim().substring(0, 200);
            steps.push(`[HTTP] Owner: ${ownerName}`);
          }
        }
        // Extract deed reference — "DEED VOL/VOLUME/BK/BOOK" or "Instrument No/Number/#"
        if (!deedReference) {
          const drMatch = text.match(/(?:DEED\s+(?:VOL|VOLUME|BK|BOOK)|instrument\s*(?:no|number|#))[.:\s]+(.+?)(?:\s{2,}|$)/im);
          if (drMatch?.[1]?.trim()) {
            deedReference = drMatch[1].trim().substring(0, 200);
            steps.push(`[HTTP] Deed reference: ${deedReference}`);
          }
        }
      } else {
        steps.push(`[HTTP] Property detail page returned HTTP ${res.status}`);
      }
    } catch (err) {
      steps.push(`[HTTP] Detail page error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Step 3: Fetch deed documents via publicsearch.us JSON API ─────────────
  // Tyler Technologies' publicsearch.us is a React SPA. The HTML shell page is
  // nearly empty — all deed data comes from their REST JSON API. We probe their
  // known API patterns to get the instrument list and individual deed details.
  if (propertyId && config.publicsearchSubdomain) {
    steps.push(`[HTTP] Fetching deed instruments from publicsearch.us API…`);
    const psResult = await fetchPublicsearchInstruments(
      config.publicsearchSubdomain,
      propertyId,
      req.projectId,
      steps,
    );
    documentIds.push(...psResult.documentIds);
    if (!legalDescription && psResult.legalDescription) legalDescription = psResult.legalDescription;
    if (!deedReference   && psResult.deedReference)   deedReference   = psResult.deedReference;
    if (!ownerName       && psResult.ownerName)       ownerName       = psResult.ownerName;
  }

  steps.push(
    `[HTTP] Research complete — ${documentIds.length} document(s) stored, ` +
    `property ID: ${propertyId ?? 'not found'}, ` +
    `legal desc: ${legalDescription ? `${legalDescription.length} chars` : 'not found'}`,
  );

  return { propertyId, legalDescription, ownerName, deedReference, documentIds, steps };
}

// ── AI vision extraction ──────────────────────────────────────────────────────

/**
 * Run Claude Vision on a screenshot buffer.
 *
 * Pass 1 — OCR_EXTRACTOR: extract all raw text from the image precisely.
 * Pass 2 — DATA_EXTRACTOR: extract structured data points (boundary calls,
 *   easements, legal description, recording references, property ID, etc.)
 *   from the OCR'd text.
 *
 * Returns the structured extraction text so callers can parse it, and also
 * returns the raw OCR text for storage.
 */
async function extractFromScreenshot(
  screenshotBuffer: Buffer,
  context: string,   // e.g. document label / page description
  steps: string[],
): Promise<{ structured: string | null; ocrText: string | null }> {
  try {
    const base64 = screenshotBuffer.toString('base64');

    // Pass 1: OCR — get all text out of the image
    const ocrResult = await callVision(
      base64,
      'image/png',
      'OCR_EXTRACTOR',
      `Extract ALL text from this screenshot of a county property record page. Context: ${context}. ` +
      `Preserve every bearing, distance, deed reference, instrument number, property ID, legal description, ` +
      `lot/block, easement description, and any other property data exactly as written.`,
    );
    const ocrText = typeof ocrResult.response === 'string'
      ? ocrResult.response
      : (ocrResult.response as { full_text?: string })?.full_text ?? ocrResult.raw;

    if (!ocrText || ocrText.trim().length < 20) {
      steps.push(`[Vision] OCR returned no text for: ${context}`);
      return { structured: null, ocrText: null };
    }
    steps.push(`[Vision] OCR complete for "${context}" — ${ocrText.length} chars extracted`);

    // Pass 2: DATA_EXTRACTOR — structured extraction from the OCR text
    const extractResult = await callAI({
      promptKey: 'DATA_EXTRACTOR',
      userContent:
        `Document label: ${context}\n` +
        `Document type: county property record / deed / plat screenshot\n` +
        `Extract these categories: bearings distances, monuments, curve data, point of beginning, ` +
        `easements, setbacks, right of way, legal description, lot block subdivision, recording references, ` +
        `deed references, coordinates, elevations, flood zone, utilities, surveyor info\n\n` +
        `DOCUMENT TEXT (from Vision OCR):\n${ocrText.substring(0, 15000)}`,
      maxTokens: 4096,
      maxRetries: 1,
      timeoutMs: 90_000,
    });

    const structured = typeof extractResult.response === 'string'
      ? extractResult.response
      : JSON.stringify(extractResult.response);

    steps.push(`[Vision] Structured extraction complete for "${context}"`);
    return { structured, ocrText };
  } catch (err) {
    steps.push(`[Vision] Error processing "${context}": ${err instanceof Error ? err.message : String(err)}`);
    return { structured: null, ocrText: null };
  }
}

// ── Property ID extraction via DOM + vision ───────────────────────────────────

/**
 * Try to extract a property ID from a page via DOM selectors first (fast),
 * then fall back to Claude vision analysis of a screenshot.
 */
async function extractPropertyIdFromPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  config: CountyBrowserConfig,
  screenshot: Buffer,
  steps: string[],
): Promise<string | null> {
  // DOM approach — try each selector
  for (const selector of config.cadPropertyIdSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        // Check for href (linked property ID)
        const href = await el.getAttribute('href').catch(() => null);
        if (href) {
          // Extract numeric/alphanumeric ID from URL path
          const match = href.match(/\/(\d+)(?:[/?]|$)/);
          if (match) {
            steps.push(`[Browser] Found property ID ${match[1]} from DOM link: ${selector}`);
            return match[1];
          }
        }
        // Check data attributes
        const dataPropId = await el.getAttribute('data-prop-id').catch(() => null);
        if (dataPropId?.trim()) {
          steps.push(`[Browser] Found property ID ${dataPropId} from data-prop-id: ${selector}`);
          return dataPropId.trim();
        }
        // Read inner text
        const text = (await el.innerText().catch(() => '')) as string;
        const numMatch = text.trim().match(/^\d{4,10}$/);
        if (numMatch) {
          steps.push(`[Browser] Found property ID ${numMatch[0]} from text in: ${selector}`);
          return numMatch[0];
        }
      }
    } catch { /* selector not found — try next */ }
  }

  // Vision fallback — ask Claude to read the screenshot
  steps.push('[Browser] DOM extraction failed — asking Claude vision to identify property ID…');
  const visionResult = await extractFromScreenshot(
    screenshot,
    'CAD search results page — looking for property/parcel ID number',
    steps,
  );

  const visionText = visionResult.ocrText ?? visionResult.structured ?? '';
  if (visionText) {
    // Look for a standalone 5–12 digit number (property IDs are numeric)
    const numMatch = visionText.match(/\b(\d{5,12})\b/);
    if (numMatch) {
      steps.push(`[Browser/Vision] Extracted property ID from OCR: ${numMatch[1]}`);
      return numMatch[1];
    }
  }
  steps.push('[Browser] Could not extract property ID from results.');
  return null;
}

// ── Bell CAD eSearch: search + extract property ID ───────────────────────────

async function searchCadPortal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any,
  config: CountyBrowserConfig,
  variants: string[],
  projectId: string,
  steps: string[],
): Promise<{ propertyId: string | null; documentIds: string[] }> {
  const documentIds: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let context: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any;

  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });
    page = await context.newPage();

    for (const variant of variants) {
      steps.push(`[Browser] Trying CAD search for address variant: "${variant}"`);

      // ── Approach A: Pre-filled URL (eSearch portals that accept query params) ─────
      // Tyler Tech / Harris-Govern portals accept ?type=address&value=…&year=… and
      // auto-submit the search, so we can skip form interaction entirely.
      let navigatedWithPrefill = false;
      if (config.cadPrefilledSearchUrlTemplate) {
        const year = new Date().getFullYear();
        const prefilledUrl = config.cadPrefilledSearchUrlTemplate
          .replace('{query}', encodeURIComponent(variant))
          .replace('{year}', String(year));
        steps.push(`[Browser] Navigating to pre-filled search URL: ${prefilledUrl}`);
        try {
          await page.goto(prefilledUrl, { waitUntil: 'networkidle', timeout: 30_000 });
        } catch (err) {
          steps.push(`[Browser] Pre-filled URL networkidle timed out (${err instanceof Error ? err.message : String(err)}) — retrying with domcontentloaded`);
          await page.goto(prefilledUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        }
        // Wait a moment for client-side rendering
        await page.waitForTimeout(3_000);

        // Check whether results loaded via the pre-filled URL
        for (const sel of config.cadResultRowSelector.split(',').map(s => s.trim())) {
          try {
            await page.waitForSelector(sel, { timeout: 8_000 });
            navigatedWithPrefill = true;
            steps.push('[Browser] Pre-filled URL returned search results');
            break;
          } catch { /* try next result selector */ }
        }

        if (navigatedWithPrefill) {
          const screenshot = await page.screenshot({ type: 'png', fullPage: true }) as Buffer;
          const pageTitle = await page.title().catch(() => 'CAD Search Results');
          const pageText = await page.innerText('body').catch(() => '') as string;
          const docId = await storeScreenshotAsDocument(
            projectId, screenshot,
            `CAD Search — "${variant}" (${config.name})`,
            'appraisal_record',
            prefilledUrl,
            `Search variant: "${variant}"\nPage: ${pageTitle}\n\n${pageText.substring(0, 3000)}`,
          );
          if (docId) documentIds.push(docId);

          const propertyId = await extractPropertyIdFromPage(page, config, screenshot, steps);
          if (propertyId) {
            steps.push(`[Browser] ✓ Found property ID: ${propertyId} via pre-filled URL`);
            if (config.cadDetailUrl) {
              const detailUrl = config.cadDetailUrl.replace('{id}', encodeURIComponent(propertyId));
              try {
                await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30_000 });
                const detailShot = await page.screenshot({ type: 'png', fullPage: true }) as Buffer;
                const detailText = await page.innerText('body').catch(() => '') as string;
                const detailId = await storeScreenshotAsDocument(
                  projectId, detailShot,
                  `CAD Property Detail — ID ${propertyId} (${config.name})`,
                  'appraisal_record', detailUrl,
                  `Property ID: ${propertyId}\n\n${detailText.substring(0, 8000)}`,
                );
                if (detailId) documentIds.push(detailId);
                steps.push(`[Browser] Captured property detail page for ID ${propertyId}`);
              } catch (err) {
                steps.push(`[Browser] Could not load property detail page: ${err instanceof Error ? err.message : String(err)}`);
              }
            }
            await context.close().catch(() => {});
            return { propertyId, documentIds };
          }
          // Pre-filled URL loaded a results page but no ID found — try next variant
          continue;
        }

        // Pre-filled URL didn't load results — fall through to form-fill approach
        steps.push('[Browser] Pre-filled URL did not return results — falling back to form-fill');
      }

      // ── Approach B: Navigate to search page and fill in the form ─────────────
      try {
        await page.goto(config.cadSearchUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      } catch {
        // networkidle may time out on SPAs — proceed anyway
        await page.goto(config.cadSearchUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      }

      // Wait for the search input to appear
      let inputEl = null;
      for (const sel of config.cadSearchInputSelector.split(',').map(s => s.trim())) {
        try {
          await page.waitForSelector(sel, { timeout: 8_000 });
          inputEl = await page.$(sel);
          if (inputEl) break;
        } catch { /* try next selector */ }
      }

      if (!inputEl) {
        steps.push('[Browser] Search input not found — taking diagnostic screenshot');
        const shot = await page.screenshot({ type: 'png', fullPage: false }) as Buffer;
        const diagId = await storeScreenshotAsDocument(
          projectId, shot, `CAD Portal — Page Load (${variant})`, 'other',
          config.cadSearchUrl, `Could not find search input. Page title: ${await page.title()}`,
        );
        if (diagId) documentIds.push(diagId);
        continue;
      }

      // Clear and type the address variant
      await inputEl.click({ clickCount: 3 });
      await inputEl.fill(variant);
      await page.waitForTimeout(500);

      // Select search type = address if a dropdown exists
      try {
        // Harris-Govern eSearch uses a type selector
        const typeSelect = await page.$('select[id*="Type"], select[name*="Type"], #searchType, select[name="type"]');
        if (typeSelect) {
          await typeSelect.selectOption({ label: 'Address' }).catch(() =>
            typeSelect.selectOption({ value: 'address' }).catch(() => {})
          );
        }
      } catch { /* no type selector — proceed */ }

      // Submit the search
      let submitted = false;
      for (const sel of config.cadSearchSubmitSelector.split(',').map(s => s.trim())) {
        try {
          const btn = await page.$(sel);
          if (btn) {
            await btn.click();
            submitted = true;
            break;
          }
        } catch { /* try next */ }
      }
      if (!submitted) {
        // Fall back to Enter key
        await inputEl.press('Enter');
      }

      // Wait for results to load
      let resultsLoaded = false;
      for (const sel of config.cadResultRowSelector.split(',').map(s => s.trim())) {
        try {
          await page.waitForSelector(sel, { timeout: 15_000 });
          resultsLoaded = true;
          break;
        } catch { /* try next */ }
      }

      // Take a screenshot of the results (whether or not they loaded)
      const screenshot = await page.screenshot({ type: 'png', fullPage: true }) as Buffer;
      const pageTitle = await page.title().catch(() => 'CAD Search Results');
      const pageText = await page.innerText('body').catch(() => '') as string;

      // Store the screenshot as a document
      const docLabel = `CAD Search — "${variant}" (${config.name})`;
      const docId = await storeScreenshotAsDocument(
        projectId, screenshot, docLabel, 'appraisal_record',
        `${config.cadSearchUrl}?q=${encodeURIComponent(variant)}`,
        `Search variant: "${variant}"\nPage: ${pageTitle}\n\n${pageText.substring(0, 3000)}`,
      );
      if (docId) documentIds.push(docId);

      if (!resultsLoaded) {
        steps.push(`[Browser] No results loaded for "${variant}" — continuing to next variant`);
        continue;
      }

      // Extract property ID
      const propertyId = await extractPropertyIdFromPage(page, config, screenshot, steps);
      if (propertyId) {
        steps.push(`[Browser] ✓ Found property ID: ${propertyId} for variant "${variant}"`);

        // If we have a detail URL template, capture the property detail page too
        if (config.cadDetailUrl) {
          const detailUrl = config.cadDetailUrl.replace('{id}', encodeURIComponent(propertyId));
          try {
            await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30_000 });
            const detailShot = await page.screenshot({ type: 'png', fullPage: true }) as Buffer;
            const detailText = await page.innerText('body').catch(() => '') as string;
            const detailId = await storeScreenshotAsDocument(
              projectId, detailShot,
              `CAD Property Detail — ID ${propertyId} (${config.name})`,
              'appraisal_record', detailUrl,
              `Property ID: ${propertyId}\n\n${detailText.substring(0, 8000)}`,
            );
            if (detailId) documentIds.push(detailId);
            steps.push(`[Browser] Captured and stored property detail page for ID ${propertyId}`);
          } catch (err) {
            steps.push(`[Browser] Could not load property detail page: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        await context.close().catch(() => {});
        return { propertyId, documentIds };
      }
    }
  } catch (err) {
    steps.push(`[Browser] CAD portal search error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await context?.close().catch(() => {});
  }

  return { propertyId: null, documentIds };
}

// ── publicsearch.us deed search ───────────────────────────────────────────────

async function fetchDeedDocuments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any,
  subdomain: string,
  propertyId: string,
  projectId: string,
  steps: string[],
): Promise<{ legalDescription: string | null; deedReference: string | null; ownerName: string | null; documentIds: string[] }> {
  const documentIds: string[] = [];
  const searchUrl = `https://${subdomain}/results?search=index,fullText&q=${encodeURIComponent(propertyId)}`;
  steps.push(`[Browser] Searching deed records: ${searchUrl}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let context: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any;
  let legalDescription: string | null = null;
  let deedReference: string | null = null;
  let ownerName: string | null = null;

  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1280, height: 900 },
    });
    page = await context.newPage();

    // Navigate to search results
    try {
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45_000 });
    } catch {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    }

    // Wait for results or a "no results" message
    await page.waitForTimeout(3_000);

    // Screenshot the results list
    const resultsShot = await page.screenshot({ type: 'png', fullPage: true }) as Buffer;
    const resultsText = await page.innerText('body').catch(() => '') as string;

    const resultsDocId = await storeScreenshotAsDocument(
      projectId, resultsShot,
      `Deed Search Results — ID ${propertyId}`,
      'deed', searchUrl,
      `Property ID: ${propertyId}\nSearch URL: ${searchUrl}\n\n${resultsText.substring(0, 4000)}`,
    );
    if (resultsDocId) documentIds.push(resultsDocId);

    // Try to find deed document links (result items)
    const resultLinks = await page.$$('a[href*="/document/"], .result-item a, .search-result a, tr.result a').catch(() => []) as unknown[];
    steps.push(`[Browser] Found ${(resultLinks as unknown[]).length} deed document link(s) in results`);

    // Open up to 5 deed documents and screenshot each page
    const maxDocs = Math.min((resultLinks as unknown[]).length, 5);
    for (let i = 0; i < maxDocs; i++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const link = (resultLinks as any[])[i];
        const href = await link.getAttribute('href') as string | null;
        const linkText = await link.innerText().catch(() => `Deed Document ${i + 1}`) as string;

        if (!href) continue;
        const docUrl = href.startsWith('http') ? href : `https://${subdomain}${href}`;
        steps.push(`[Browser] Opening deed document: ${linkText} → ${docUrl}`);

        const docPage = await context.newPage();
        try {
          await docPage.goto(docUrl, { waitUntil: 'networkidle', timeout: 45_000 });
        } catch {
          await docPage.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        }
        await docPage.waitForTimeout(2_000);

        // Get total page count if there's a pagination indicator
        let pageCount = 1;
        try {
          const pageCountEl = await docPage.$('.page-count, [data-total-pages], .total-pages');
          if (pageCountEl) {
            const pcText = await pageCountEl.innerText() as string;
            const pcNum = parseInt(pcText.replace(/\D/g, ''), 10);
            if (!isNaN(pcNum) && pcNum > 0) pageCount = Math.min(pcNum, 10); // cap at 10 pages
          }
        } catch { /* no pagination indicator */ }

        steps.push(`[Browser] Deed document has ${pageCount} page(s)`);

        const pageTexts: string[] = [];
        for (let p = 1; p <= pageCount; p++) {
          if (p > 1) {
            // Navigate to next page
            try {
              const nextBtn = await docPage.$('[aria-label="Next page"], .next-page, button:has-text("Next"), a:has-text("Next")');
              if (nextBtn) {
                await nextBtn.click();
                await docPage.waitForTimeout(2_000);
              }
            } catch { break; }
          }

          // Screenshot at a readable resolution for OCR
          const pageShot = await docPage.screenshot({ type: 'png', fullPage: false }) as Buffer;
          const pageText = await docPage.innerText('body').catch(() => '') as string;
          pageTexts.push(pageText.substring(0, 6000));

          const pageDocId = await storeScreenshotAsDocument(
            projectId, pageShot,
            `${linkText || `Deed Document ${i + 1}`} — Page ${p}`,
            'deed', docUrl,
            `Document: ${linkText}\nPage: ${p} of ${pageCount}\nURL: ${docUrl}\n\n${pageText.substring(0, 6000)}`,
          );
          if (pageDocId) documentIds.push(pageDocId);
        }

        // Use AI to extract legal description and deed reference from the combined page text
        const combinedText = pageTexts.join('\n\n---PAGE BREAK---\n\n');
        if (combinedText.trim().length > 100) {
          const firstPageShot = await docPage.screenshot({ type: 'png', fullPage: true }) as Buffer;
          const docContext = `Deed document ${i + 1} — ${linkText || 'county clerk record'} — ${docUrl}`;
          const visionResult = await extractFromScreenshot(firstPageShot, docContext, steps);

          const visionText = visionResult.structured ?? visionResult.ocrText ?? '';
          if (visionText) {
            steps.push(`[Browser/Vision] Extracted deed data from document ${i + 1}`);
            // Store both the structured extraction and the raw OCR text
            if (documentIds.length > 0) {
              const lastDocId = documentIds[documentIds.length - 1];
              const storedText =
                (visionResult.structured ? `STRUCTURED EXTRACTION:\n${visionResult.structured}\n\n` : '') +
                (visionResult.ocrText    ? `OCR TEXT:\n${visionResult.ocrText}\n\n` : '') +
                `RAW DOM TEXT:\n${combinedText.substring(0, 6000)}`;
              await supabaseAdmin.from('research_documents').update({
                extracted_text: storedText.substring(0, 40000),
                extracted_text_method: 'browser_capture+vision',
                updated_at: new Date().toISOString(),
              }).eq('id', lastDocId);
            }

            // Parse legal description from OCR text (plain-text patterns)
            const searchText = visionResult.ocrText ?? visionText;
            if (!legalDescription) {
              const ldMatch = searchText.match(/LEGAL DESCRIPTION[:\s]+([^]*?)(?:\n\n|\d\.|GRANTOR|GRANTEE|RECORDING|DATE|$)/i);
              if (ldMatch?.[1]?.trim() && ldMatch[1].trim().toLowerCase() !== 'not found') {
                legalDescription = ldMatch[1].trim();
                steps.push(`[Browser] Extracted legal description (${legalDescription.length} chars)`);
              }
            }
            // Parse deed reference
            if (!deedReference) {
              const drMatch = searchText.match(/(?:RECORDING REFERENCE|instrument\s*(?:no|number|#)|volume\s*\d+.*?page\s*\d+)[:\s]+(.+?)(?:\n|$)/i);
              if (drMatch?.[1]?.trim() && drMatch[1].trim().toLowerCase() !== 'not found') {
                deedReference = drMatch[1].trim();
                steps.push(`[Browser] Deed reference: ${deedReference}`);
              }
            }
            // Parse owner/grantee
            if (!ownerName) {
              const owMatch = searchText.match(/GRANTEE[:\s]+(.+?)(?:\n|$)/i);
              if (owMatch?.[1]?.trim() && owMatch[1].trim().toLowerCase() !== 'not found') {
                ownerName = owMatch[1].trim();
                steps.push(`[Browser] Owner/Grantee: ${ownerName}`);
              }
            }
          }
        }

        await docPage.close().catch(() => {});
      } catch (err) {
        steps.push(`[Browser] Error opening deed doc ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── API fallback: if no document links, try the JSON API ────────────────
    if (maxDocs === 0 && propertyId) {
      steps.push('[Browser] No document links found — attempting publicsearch.us JSON API as fallback');
      const apiResult = await fetchPublicsearchInstruments(subdomain, propertyId, projectId, steps);
      documentIds.push(...apiResult.documentIds);
      if (!legalDescription && apiResult.legalDescription) legalDescription = apiResult.legalDescription;
      if (!deedReference   && apiResult.deedReference)   deedReference   = apiResult.deedReference;
      if (!ownerName       && apiResult.ownerName)       ownerName       = apiResult.ownerName;
    }

    if (maxDocs === 0) {
      // No document links found — try to extract data from the results page directly
      steps.push('[Browser] No individual document links found — extracting from results page via vision');
      const visionResult = await extractFromScreenshot(
        resultsShot,
        `County clerk record search results page — property ID: ${propertyId ?? 'unknown'}`,
        steps,
      );
      if (visionResult.structured || visionResult.ocrText) {
        steps.push('[Browser/Vision] Extracted information from results page');
        const stored =
          (visionResult.structured ? `STRUCTURED EXTRACTION:\n${visionResult.structured}\n\n` : '') +
          (visionResult.ocrText    ? `OCR TEXT:\n${visionResult.ocrText}\n\n` : '') +
          `RAW DOM TEXT:\n${resultsText.substring(0, 4000)}`;
        await supabaseAdmin.from('research_documents').update({
          extracted_text: stored.substring(0, 40000),
          extracted_text_method: 'browser_capture+vision',
          updated_at: new Date().toISOString(),
        }).eq('id', resultsDocId ?? '');
      }
    }
  } catch (err) {
    steps.push(`[Browser] Deed search error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await context?.close().catch(() => {});
  }

  return { legalDescription, deedReference, ownerName, documentIds };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run an active browser-based property research session.
 *
 * Launches headless Chromium to:
 *  1. Search the county CAD e-search portal with multiple address variants
 *  2. Screenshot every results/detail page and store as research documents
 *  3. Use Claude vision to extract the property ID if DOM extraction fails
 *  4. Search publicsearch.us by property ID to retrieve deed documents
 *  5. Screenshot each deed page (with slight zoom for readability)
 *  6. Extract legal description, deed reference, and owner name via AI vision
 *
 * Returns null if Playwright is not available (graceful degradation).
 */
export async function runBrowserPropertyResearch(
  req: BrowserScrapeRequest,
): Promise<BrowserScrapeResult | null> {
  const steps: string[] = [];
  const pw = await getPlaywright();
  if (!pw) {
    // Playwright binary is not installed — fall back to plain HTTP GET requests
    return httpPropertyResearch(req);
  }

  const config = COUNTY_BROWSER_CONFIGS[req.countyKey];
  if (!config) {
    steps.push(`[Browser] No browser config for county "${req.countyKey}" — falling back to HTTP`);
    return httpPropertyResearch(req);
  }

  steps.push(`[Browser] Starting browser research for "${req.address}" (${config.name})`);

  let browser = null;
  const allDocumentIds: string[] = [];

  try {
    const launchOptions = await getChromiumLaunchOptions();
    browser = await pw.chromium.launch(launchOptions);

    let propertyId: string | null = req.knownPropertyId ?? null;

    // Step 1: Search CAD portal to find property ID (if not already known)
    if (!propertyId) {
      const cadResult = await searchCadPortal(
        browser, config, req.addressVariants, req.projectId, steps,
      );
      propertyId = cadResult.propertyId;
      allDocumentIds.push(...cadResult.documentIds);
    } else {
      steps.push(`[Browser] Using known property ID: ${propertyId} — skipping CAD portal search`);

      // Still capture the property detail page
      if (config.cadDetailUrl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let context: any;
        try {
          context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            viewport: { width: 1280, height: 900 },
          });
          const page = await context.newPage();
          const detailUrl = config.cadDetailUrl.replace('{id}', encodeURIComponent(propertyId));
          await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() =>
            page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
          );
          const detailShot = await page.screenshot({ type: 'png', fullPage: true }) as Buffer;
          const detailText = await page.innerText('body').catch(() => '') as string;
          const detailDocId = await storeScreenshotAsDocument(
            req.projectId, detailShot,
            `CAD Property Detail — ID ${propertyId} (${config.name})`,
            'appraisal_record', detailUrl,
            `Property ID: ${propertyId}\n\n${detailText.substring(0, 8000)}`,
          );
          if (detailDocId) allDocumentIds.push(detailDocId);
          steps.push(`[Browser] Captured property detail page for ID ${propertyId}`);
        } catch (err) {
          steps.push(`[Browser] Detail page error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          await context?.close().catch(() => {});
        }
      }
    }

    if (!propertyId) {
      steps.push('[Browser] Could not find property ID from CAD portal — attempting deed search by address');
    }

    // Step 2: Search deed records
    let legalDescription: string | null = null;
    let deedReference: string | null = null;
    let ownerName: string | null = null;

    if (config.publicsearchSubdomain) {
      const deedResult = await fetchDeedDocuments(
        browser,
        config.publicsearchSubdomain,
        propertyId ?? req.address, // fall back to address if no ID
        req.projectId,
        steps,
      );
      legalDescription = deedResult.legalDescription;
      deedReference = deedResult.deedReference;
      ownerName = deedResult.ownerName;
      allDocumentIds.push(...deedResult.documentIds);
    }

    steps.push(
      `[Browser] Research complete — ${allDocumentIds.length} document(s) captured, ` +
      `property ID: ${propertyId ?? 'not found'}, ` +
      `legal desc: ${legalDescription ? `${legalDescription.length} chars` : 'not found'}`,
    );

    return {
      propertyId,
      legalDescription,
      ownerName,
      deedReference,
      documentIds: allDocumentIds,
      steps,
    };
  } catch (err) {
    steps.push(`[Browser] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
    return { propertyId: null, legalDescription: null, ownerName: null, deedReference: null, documentIds: allDocumentIds, steps };
  } finally {
    await browser?.close().catch(() => {});
  }
}
