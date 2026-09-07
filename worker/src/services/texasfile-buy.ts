// worker/src/services/texasfile-buy.ts — buy a document from TexasFile and return its page images.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// TexasFile is the owner's funded paid source. The OLD `texasfile-adapter.ts` was written for a
// Django site TexasFile has since replaced with a React SPA, so it never worked — searches "set a
// flag and nothing read it", and `research_document_purchases` stayed at 0 rows. This module was
// built 2026-09-05 by driving the LIVE site logged into the owner's account (and buying one real
// document), so it matches what TexasFile actually does now. See
// memory `project_texasfile_purchase_flow`.
//
// THE FLOW (all verified live):
//   1. Login — a modal at `/?login=beta`: username box, password box, "Log In".
//   2. Search — the per-county page `/search/texas/{county}-county/county-clerk-records/`. Form
//      field names are unchanged (`name-0-name`, `number-0-number`, `bvp-0-volume`/`bvp-0-page`).
//      Bell's own INSTRUMENT NUMBER returns empty on TexasFile — name and book/vol/page are the
//      reliable searches. Submitting lands on `/search/.../{searchId}/`; each result's Purchase
//      button carries `data-for="Purchase-{GUID}"`.
//   3. Purchase + images in ONE call:
//        GET /document/api/purchase/texas/{county}/instrument/{GUID}/
//            ?from_product_content_type=search&from_product_object_id={searchId}
//      returns { pages: [signed jpeg urls], purchase_id, user_balance, images_available }. The FIRST
//      call charges the wallet ($1/page, no confirmation); a later call for a doc already owned
//      returns the images WITHOUT re-charging — the built-in dedupe.
//   4. Download each `pages[]` url through the authenticated context.

import type { Browser, Page } from 'playwright';
import { acquireBrowser } from '../lib/browser-factory.js';
import type { PipelineLogger } from '../lib/logger.js';
import { extractTexasFileRawRows, instrumentsMatch, normaliseSubdivisionName, parseTexasFileRow } from './texasfile-rows.js';
import { capturePdfPages, documentIdFromBegin, type TexasFileBeginBody } from './texasfile-pdf.js';
import { texasFileNameVariants } from './texasfile-names.js';

const TF = 'https://www.texasfile.com';

/** `Bell` / `Bell County` → `bell` (the API segment) and `bell-county` (the search-page slug). */
export function texasFileCountyKey(county: string): string {
  return county.trim().toLowerCase().replace(/\s+county$/, '').replace(/[^a-z0-9]+/g, '-');
}
export function texasFileCountySlug(county: string): string {
  return `${texasFileCountyKey(county)}-county`;
}

/** The purchase-API URL for a document GUID found in a search (mapped live 2026-09-05). */
export function purchaseApiUrl(county: string, guid: string, searchId: string, state = 'texas', product: 'instrument' | 'plat' = 'instrument'): string {
  // A deed buy is `/instrument/{guid}/`; a PLAT buy uses `/plat/{guid}/` (plan 1.5 — the path segment
  // differs by product on the redesigned SPA). Default stays 'instrument' so existing deed buys are
  // unchanged; the plat segment is confirmed against the live account in the supervised run.
  return `${TF}/document/api/purchase/${state}/${texasFileCountyKey(county)}/${product}/${guid}/`
    + `?from_product_content_type=search&from_product_object_id=${encodeURIComponent(searchId)}`;
}

export interface TexasFileResult {
  guid: string;
  /** Canonical (year + six-digit sequence for Bell) — see texasfile-rows.ts. */
  instrument: string | null;
  bookVolPage: string | null;
  pages: number | null;
  type: string | null;
  date: string | null;
  text: string;
  // ── Parsed by column since 2026-09-07 (the row text used to be CSS) ─────────────────────────────
  /** The Number column as TexasFile printed it ("34968"). */
  instrumentRaw?: string | null;
  /** Record book (OPR / OR / DR …), the volume (or plat cabinet) and the page (or slide). */
  book?: string | null;
  volume?: string | null;
  page?: string | null;
  priceUsd?: number | null;
  countyType?: string | null;
  grantor?: string | null;
  grantee?: string | null;
  /** The Legal Desc. column verbatim, and what it parsed to. */
  legal?: string | null;
  subdivision?: string | null;
  lots?: string[];
  block?: string | null;
  abstract?: string | null;
  survey?: string | null;
  /** Plat rows: the Subdivision Name column (normalised) and the Description column. */
  name?: string | null;
  description?: string | null;
  /** The account already owns this document (Download button, no Purchase button): re-open it,
   *  never pay for it — and never pay for a duplicate row of the same document. */
  owned?: boolean;
}

export interface TexasFileBuyInput {
  county: string;                 // 'Bell'
  /** One of these drives the search. Name and book/vol/page are reliable on TexasFile; the county's
   *  own instrument number is NOT (it returns empty). */
  name?: string;                  // grantor/grantee, "SMITH TOMMY"
  volume?: string;
  page?: string;
  book?: string;
  /** Used only to PICK the right result among many and to verify — never to search by. */
  instrumentNumber?: string;
  /** A cost ceiling for THIS purchase in dollars; the buy is refused if the doc's price would exceed
   *  it. $1/page on TexasFile. */
  maxUsd?: number;
  // ── Buying a document the discovery pass already FOUND (2026-09-06) ────────────────────────────
  // The search-only pass returns each result's TexasFile GUID; until now the buy threw it away and
  // re-searched by instrument (a plat has none), so a plat the engine had in hand was re-searched as
  // a deed and never bought. With a GUID the buy picks THAT result; with `product: 'plat'` it runs
  // the PLAT search (by subdivision or cabinet/slide) and purchases through `/plat/`.
  guid?: string;
  product?: 'instrument' | 'plat';
  /** The plat search's "Subdivision or Name" key (a subdivision or a survey name). Also used to
   *  PICK among deed results by their legal description. */
  subdivision?: string;
  /** Lot / block of the subject, to pick the right deed among a name search's many rows. */
  lot?: string;
  block?: string;
}

/** Every TexasFile plat is $10 flat, whatever its page count (mapped live 2026-09-05). */
export const PLAT_FLAT_USD = 10;

/**
 * Pick the search result a buy should purchase. A GUID the discovery pass recorded wins outright (it
 * names the exact document); else the instrument-number match; else the first row (a name/vol-page
 * search is already narrow). Pure, so the choice is unit-tested without a browser.
 */
export function chooseTexasFileResult(
  results: TexasFileResult[],
  input: Pick<TexasFileBuyInput, 'guid' | 'instrumentNumber' | 'volume' | 'book' | 'page' | 'subdivision' | 'lot' | 'block'>,
): TexasFileResult | null {
  if (results.length === 0) return null;
  const guid = input.guid?.trim().toUpperCase();
  if (guid) {
    const byGuid = results.find((r) => r.guid.toUpperCase() === guid);
    if (byGuid) return byGuid;
  }
  // An owned copy outranks an unowned one of the same document at every step below — it is free.
  results = [...results].sort((a, b) => Number(b.owned ?? false) - Number(a.owned ?? false));
  // Year-tolerant: the CAD's "2004034968" and TexasFile's "34968" are the same filing.
  if (input.instrumentNumber) {
    const byInstrument = results.find((r) => instrumentsMatch(r.instrument, input.instrumentNumber) || instrumentsMatch(r.instrumentRaw, input.instrumentNumber));
    if (byInstrument) return byInstrument;
  }
  const vol = (input.volume ?? input.book ?? '').replace(/\D/g, '');
  const pg = (input.page ?? '').replace(/\D/g, '');
  if (vol && pg) {
    const byVolPage = results.find((r) => (r.volume ?? '').replace(/\D/g, '') === vol && (r.page ?? '').replace(/\D/g, '') === pg);
    if (byVolPage) return byVolPage;
  }
  // A name search returns every filing for that name, across every property the person ever owned.
  // The subject's legal description is what tells the right deed from a lien on a different lot.
  if (input.subdivision) {
    const want = normaliseSubdivisionName(input.subdivision);
    const inSubdivision = results.filter((r) => r.subdivision && (r.subdivision === want || r.subdivision.startsWith(want) || want.startsWith(r.subdivision)));
    if (inSubdivision.length > 0) {
      const lot = input.lot?.toUpperCase().replace(/^LOT\s*/, '');
      const block = input.block?.toUpperCase().replace(/^(?:BLK|BLOCK)\s*/, '');
      const onLot = lot ? inSubdivision.filter((r) => (r.lots ?? []).includes(lot) && (!block || !r.block || r.block === block)) : [];
      const pool = onLot.length > 0 ? onLot : inSubdivision;
      // Prefer a deed (the conveyance) over liens/releases when the type is known.
      return pool.find((r) => /deed/i.test(r.type ?? '') && !/trust/i.test(r.type ?? '')) ?? pool[0]!;
    }
  }
  return results[0];
}

/** What a chosen result will cost: a plat is flat-rate; anything else is $1/page (unknown pages → null). */
export function priceTexasFileResult(r: TexasFileResult, product: 'instrument' | 'plat'): number | null {
  if (r.owned) return 0; // already paid for — re-opening it costs nothing
  if (product === 'plat' || r.type === 'plat') return PLAT_FLAT_USD;
  // The Purchase tooltip states the price outright ("3 pages for $3.00"); pages × $1 is the fallback.
  if (typeof r.priceUsd === 'number' && Number.isFinite(r.priceUsd) && r.priceUsd > 0) return r.priceUsd;
  return r.pages != null ? r.pages : null;
}

export interface TexasFilePage { imageBase64: string; url: string }

export interface TexasFileBuyResult {
  ok: boolean;
  reason: string;
  pages: TexasFilePage[];
  purchaseId?: number;
  pageCount?: number;
  costUsd?: number;
  balanceAfter?: string;
  guid?: string;
  /** The county instrument number TexasFile lists for the document actually bought. A
   *  `search_required` want is keyed in the ledger by THIS, not by the placeholder. */
  instrument?: string;
  /** The signed PDF the viewer served (a plat), TexasFile's document id, and how the pages were made. */
  pdfUrl?: string;
  documentId?: number;
  pageMethod?: 'page-urls' | 'pdftoppm' | 'viewer-canvas';
}

const noLog = { info: () => {}, warn: () => {}, error: () => {} } as unknown as PipelineLogger;

/** Log into TexasFile in `page`. Returns true on success. Never throws. */
export async function loginTexasFile(page: Page, log: PipelineLogger = noLog): Promise<boolean> {
  const user = process.env.TEXASFILE_USERNAME;
  const pass = process.env.TEXASFILE_PASSWORD;
  if (!user || !pass) { log.warn('TexasFile', 'No TEXASFILE_USERNAME/PASSWORD set — cannot buy.'); return false; }
  try {
    await page.goto(`${TF}/?login=beta`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const userBox = page.locator('input[placeholder*="username" i], input[placeholder*="email" i]').first();
    const passBox = page.locator('input[type="password"]').first();
    await userBox.waitFor({ timeout: 15_000 });
    await userBox.fill(user);
    await passBox.fill(pass);
    await page.getByRole('button', { name: /log ?in/i }).first().click();
    // Logged in when the login modal is gone and an account/dashboard marker is present.
    await page.waitForTimeout(2500);
    const stillLogin = await page.locator('input[type="password"]:visible').count().catch(() => 0);
    if (stillLogin > 0) { log.warn('TexasFile', 'Sign-in did not take — credentials refused or the modal changed.'); return false; }
    log.info('TexasFile', 'Signed in.');
    return true;
  } catch (err) {
    log.warn('TexasFile', `Login failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** Run a search and return the searchId (from the results URL) and the parsed result rows. */
export async function searchTexasFile(page: Page, input: TexasFileBuyInput, log: PipelineLogger = noLog): Promise<{ searchId: string | null; results: TexasFileResult[] }> {
  const slug = texasFileCountySlug(input.county);
  await page.goto(`${TF}/search/texas/${slug}/county-clerk-records/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(1200);

  // Fill and submit whichever search the caller gave us. Field names are the live ones.
  const filled = await page.evaluate((inp: TexasFileBuyInput) => {
    const vis = (el: Element | null) => !!el && (el as HTMLElement).offsetParent !== null;
    const setNative = (el: HTMLInputElement, v: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const pick = (sel: string) => Array.from(document.querySelectorAll(sel)).find(vis) as HTMLInputElement | undefined;
    if (inp.name) {
      const el = pick('#Form0Name, input[name="name-0-name"]'); if (!el) return 'no name field';
      setNative(el, inp.name); (document.querySelector('#nameSearchBtn') as HTMLButtonElement | null)?.click(); return 'name';
    }
    if (inp.volume || inp.page || inp.book) {
      const v = pick('#VolumeInput, input[name="bvp-0-volume"]'); const p = pick('#PageInput, input[name="bvp-0-page"]');
      if (inp.volume && v) setNative(v, inp.volume); if (inp.page && p) setNative(p, inp.page);
      const btn = Array.from(document.querySelectorAll('button')).find(b => /search/i.test(b.textContent || '') && (b as HTMLButtonElement).closest('#bvpSearch, [id*="bvp" i]')) as HTMLButtonElement | undefined;
      (btn ?? (document.querySelector('#bvpSearchButton') as HTMLButtonElement | null))?.click(); return 'bvp';
    }
    return 'no search input';
  }, input);
  if (!['name', 'bvp'].includes(filled)) { log.warn('TexasFile', `Search not submitted: ${filled}`); return { searchId: null, results: [] }; }

  // Wait for the results URL (/search/.../<id>/) and the rows.
  await page.waitForTimeout(3500);
  const url = page.url();
  const m = url.match(/county-clerk-records\/(\d+)\//);
  const searchId = m ? m[1] : null;

  // By COLUMN (2026-09-07): the rows are read as header-keyed cells in the page and parsed here,
  // where the parser is unit-tested against rows copied from the live site. The old text scrape read
  // the tooltip's injected CSS and returned no instrument for any deed.
  const raws = await page.evaluate(extractTexasFileRawRows);
  const results = raws.map((r) => parseTexasFileRow(r, 'instrument'));
  log.info('TexasFile', `Search "${input.name ?? `${input.volume}/${input.page}`}" → ${results.length} result(s), searchId=${searchId ?? '?'}.`);
  return { searchId, results };
}

/** What drives a PLAT search (plan 1.1). A subdivision name is the usual key; cabinet/volume + slide/page
 *  pin an exact plat. All plats are $10 flat on TexasFile regardless of page count. */
export interface TexasFilePlatInput {
  county: string;
  subdivision?: string;
  volume?: string;   // "Volume or Cabinet"
  page?: string;     // "Page, Slide or Sleeve"
  fileNumber?: string;
}

/**
 * Search TexasFile's PLAT records (`/plat-records/`), NOT the clerk deed records (plan 1.1). This is the
 * gap the 1401 North East St run exposed: the engine only searched county-clerk records, so subdivision
 * plats — which the free plat repo could not get (403) — were invisible. Fills the plat form by its visible
 * placeholder labels (resilient to id changes), submits, and parses the plat purchase buttons into
 * `TexasFileResult`s typed 'plat'. Never buys, never throws, returns `[]` on any failure. The live path is
 * exercised in the supervised run; the parsing is unit-tested against a fixture.
 */
export async function searchTexasFilePlats(page: Page, input: TexasFilePlatInput, log: PipelineLogger = noLog): Promise<{ searchId: string | null; results: TexasFileResult[] }> {
  const slug = texasFileCountySlug(input.county);
  await page.goto(`${TF}/search/texas/${slug}/plat-records/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(1200);

  const filled = await page.evaluate((inp: TexasFilePlatInput) => {
    const vis = (el: Element | null) => !!el && (el as HTMLElement).offsetParent !== null;
    const setNative = (el: HTMLInputElement, v: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    // Find a text input by any of the placeholder fragments it might carry, visible only.
    const byPlaceholder = (frags: string[]): HTMLInputElement | undefined =>
      Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
        .filter(vis)
        .find((el) => {
          const p = ((el as HTMLInputElement).placeholder || '').toLowerCase();
          return frags.some((f) => p.includes(f));
        }) as HTMLInputElement | undefined;
    let any = false;
    if (inp.subdivision) { const el = byPlaceholder(['subdivision', 'name']); if (el) { setNative(el, inp.subdivision); any = true; } }
    if (inp.volume)      { const el = byPlaceholder(['volume', 'cabinet']);   if (el) { setNative(el, inp.volume); any = true; } }
    if (inp.page)        { const el = byPlaceholder(['page', 'slide', 'sleeve']); if (el) { setNative(el, inp.page); any = true; } }
    if (inp.fileNumber)  { const el = byPlaceholder(['file number', 'file']);  if (el) { setNative(el, inp.fileNumber); any = true; } }
    if (!any) return 'no plat input';
    const btn = Array.from(document.querySelectorAll('button, input[type="submit"]'))
      .filter(vis)
      .find((b) => /search/i.test((b.textContent || (b as HTMLInputElement).value || ''))) as HTMLElement | undefined;
    btn?.click();
    return 'plat';
  }, input);
  if (filled !== 'plat') { log.warn('TexasFile', `Plat search not submitted: ${filled}`); return { searchId: null, results: [] }; }

  await page.waitForTimeout(3500);
  const url = page.url();
  const m = url.match(/plat-records\/(\d+)\//);
  const searchId = m ? m[1] : null;

  // By COLUMN (2026-09-07) — Filed Date | Subdivision Name | Number | Cabinet/Volume | Slide/Page |
  // Description. The old text scrape read the tooltip's CSS and returned no cabinet, slide or date.
  const raws = await page.evaluate(extractTexasFileRawRows);
  const results = raws.map((r) => parseTexasFileRow(r, 'plat'));
  log.info('TexasFile', `Plat search "${input.subdivision ?? `${input.volume}/${input.page}`}" → ${results.length} plat(s), searchId=${searchId ?? '?'}: ${results.slice(0, 4).map((r) => `${r.name ?? '?'} ${r.bookVolPage ?? ''} ${r.date ?? ''}`.trim()).join(' | ')}.`);
  return { searchId, results };
}

/** Step 2 of the mapped purchase flow (2026-09-05): completes a begun purchase and charges the wallet. */
export function purchaseCompleteUrl(purchaseId: number | string, searchId: string): string {
  return `${TF}/document/api/purchase/${purchaseId}/complete/`
    + `?from_product_content_type=search&from_product_object_id=${encodeURIComponent(searchId)}`;
}

/** What a purchase hands back: page-image URLs (a deed bought through /instrument/), or the pages
 *  already rasterised from the document's PDF (a plat — see texasfile-pdf.ts). */
export interface TexasFilePurchaseOutcome {
  pages: string[];
  pageImages?: TexasFilePage[];
  pdfUrl?: string | null;
  /** The receipt id (`purchase_id` from the complete step) — what the wallet line refers to. */
  purchaseId?: number;
  /** TexasFile's document id (the one in the viewer / status URLs). */
  documentId?: number;
  balance?: string;
  method?: 'page-urls' | 'pdftoppm' | 'viewer-canvas';
}

/** Purchase (or re-fetch if already owned) a document by GUID and return its pages. */
export async function purchaseTexasFile(page: Page, county: string, guid: string, searchId: string, log: PipelineLogger = noLog, product: 'instrument' | 'plat' = 'instrument', opts: { owned?: boolean } = {}): Promise<TexasFilePurchaseOutcome | null> {
  try {
    // 90 s, not 30: the begin call prepares the document server-side and took ~20 s on a plat; a
    // 30 s budget timed out on the live site (2026-09-07).
    let res = await page.context().request.get(purchaseApiUrl(county, guid, searchId, 'texas', product), { timeout: 90_000 });
    // Plan 1.5 — the purchase path segment differs by product (`/instrument/` vs `/plat/`) on the
    // redesigned SPA. A 404 means the wrong segment, not a real failure, so try the OTHER one before
    // giving up. A 404 buys nothing, so the retry cannot double-charge.
    if (res.status() === 404) {
      const alt: 'instrument' | 'plat' = product === 'plat' ? 'instrument' : 'plat';
      log.info('TexasFile', `Purchase 404 on /${product}/ for ${guid} — retrying /${alt}/.`);
      res = await page.context().request.get(purchaseApiUrl(county, guid, searchId, 'texas', alt), { timeout: 90_000 });
    }
    if (!res.ok()) { log.warn('TexasFile', `Purchase API HTTP ${res.status()} for ${guid}.`); return null; }
    let body = await res.json() as TexasFileBeginBody;

    // ── STEP 2: COMPLETE THE PURCHASE ───────────────────────────────────────────────────────
    // The live flow has two calls: `/purchase/.../{GUID}/` BEGINS a purchase; the COMPLETE call is
    // what charges the wallet and finishes it. For a deed the begin body names `purchase_id`; for a
    // PLAT it is null and the document id lives inside `preview_url` (which IS the complete URL) and
    // `retrieval_url` (2026-09-07, live). Until then a plat the engine had found was begun, never
    // completed, and reported "no images". A completion that returns pages wins; one that fails is
    // logged and the begun purchase's pages are still used — a document in hand beats a tidy abort.
    const documentId = documentIdFromBegin(body);
    let receiptId: number | undefined;
    let viewerUrl: string | null = body.purchase_url ? `${TF}${body.purchase_url}` : null;
    if (documentId != null && opts.owned) {
      // Already ours (the row showed Download, not Purchase): the begin call named the document and
      // costs nothing; the COMPLETE call is the one that charges, so it is not made. Straight to the viewer.
      log.info('TexasFile', `Document ${documentId} is already owned — re-opening it, no charge.`);
    } else if (documentId != null) {
      const completeUrl = body.preview_url ? `${TF}${body.preview_url}` : purchaseCompleteUrl(documentId, searchId);
      try {
        const done = await page.context().request.get(completeUrl, { timeout: 30_000 });
        if (done.ok()) {
          const completed = await done.json().catch(() => null) as TexasFileBeginBody | null;
          if (completed) {
            if (Array.isArray(completed.pages) && completed.pages.length > 0) body = { ...body, pages: completed.pages };
            if (completed.user_balance) body = { ...body, user_balance: completed.user_balance };
            if (typeof completed.purchase_id === 'number') receiptId = completed.purchase_id;
            if (completed.purchase_url) viewerUrl = `${TF}${completed.purchase_url}`;
          }
          log.info('TexasFile', `Purchase of document ${documentId} completed (receipt ${receiptId ?? '?'}) — balance ${body.user_balance ?? '?'}.`);
        } else {
          log.warn('TexasFile', `Document ${documentId} complete step returned HTTP ${done.status()} — using the begun purchase's pages.`);
        }
      } catch (err) {
        log.warn('TexasFile', `Document ${documentId} complete step threw: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      log.warn('TexasFile', `Begin response for ${guid} named no document id (purchase_id/preview_url/retrieval_url all empty) — cannot complete.`);
    }

    // ── STEP 3: THE PAGES ────────────────────────────────────────────────────────────────────
    // A deed: page-image URLs in the body. A plat: nothing here — the viewer serves one PDF.
    if (Array.isArray(body.pages) && body.pages.length > 0) {
      return { pages: body.pages, purchaseId: receiptId ?? documentId ?? undefined, documentId: documentId ?? undefined, balance: body.user_balance, method: 'page-urls' };
    }
    if (viewerUrl || documentId != null) {
      const captured = await capturePdfPages(page, viewerUrl ?? `${TF}/document/viewer/${documentId}/`, log);
      if (captured.pages.length > 0) {
        return {
          pages: [], pageImages: captured.pages, pdfUrl: captured.pdfUrl,
          purchaseId: receiptId ?? documentId ?? undefined, documentId: documentId ?? undefined,
          balance: body.user_balance, method: captured.method === 'none' ? undefined : captured.method,
        };
      }
      log.warn('TexasFile', `Document ${documentId ?? guid}: ${captured.note ?? 'no pages could be produced'} (images_available=${body.images_available}).`);
      return null;
    }
    log.warn('TexasFile', `Purchase returned no images for ${guid} (images_available=${body.images_available}).`);
    return null;
  } catch (err) {
    log.warn('TexasFile', `Purchase threw for ${guid}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Download each page image (signed url) through the authenticated context, as base64. */
export async function downloadTexasFilePages(page: Page, urls: string[]): Promise<TexasFilePage[]> {
  const out: TexasFilePage[] = [];
  for (const url of urls) {
    try {
      const r = await page.context().request.get(url, { timeout: 30_000 });
      if (!r.ok()) continue;
      out.push({ url, imageBase64: Buffer.from(await r.body()).toString('base64') });
    } catch { /* skip a page that will not fetch; the others still count */ }
  }
  return out;
}

/**
 * Buy one document from TexasFile end to end: log in, search, pick the best-matching result, buy it
 * (or re-use it if already owned), and download its pages. Never throws.
 */
export async function buyDocument(input: TexasFileBuyInput, log: PipelineLogger = noLog): Promise<TexasFileBuyResult> {
  let browser: Browser | null = null;
  try {
    browser = await acquireBrowser({ adapterId: 'texasfile', targetUrl: TF });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' });
    const page = await context.newPage();
    try {
      if (!(await loginTexasFile(page, log))) return { ok: false, reason: 'could not sign in to TexasFile', pages: [] };

      // A plat lives in TexasFile's PLAT records, reached by a different search form and bought
      // through `/plat/`. The deed search cannot find it — which is how a plat the discovery pass had
      // already located was "not available" at buy time.
      const product: 'instrument' | 'plat' = input.product ?? 'instrument';
      let { searchId, results } = product === 'plat'
        ? await searchTexasFilePlats(page, { county: input.county, subdivision: input.subdivision, volume: input.volume ?? input.book, page: input.page }, log)
        : await searchTexasFile(page, input, log);
      // A name search that answers nothing is usually the CAD's owner string, not the person:
      // "CAFFREY, BARBARA SPEER & ADRIANNE CAFFERY EVERS" → 0 rows, "CAFFREY BARBARA" → 39
      // (2026-09-07). Try the name the way TexasFile indexes it before giving up.
      if (product !== 'plat' && input.name && (!searchId || results.length === 0)) {
        for (const variant of texasFileNameVariants(input.name)) {
          if (variant === input.name.trim().toUpperCase()) continue;
          log.info('TexasFile', `No rows for "${input.name}" — trying "${variant}".`);
          const again = await searchTexasFile(page, { ...input, name: variant }, log);
          if (again.searchId && again.results.length > 0) { searchId = again.searchId; results = again.results; break; }
        }
      }
      if (!searchId || results.length === 0) return { ok: false, reason: 'no TexasFile results for that search', pages: [] };

      const chosen = chooseTexasFileResult(results, input)!;
      if (input.guid && chosen.guid.toUpperCase() !== input.guid.toUpperCase()) {
        log.warn('TexasFile', `Result ${input.guid} not in this search's ${results.length} row(s) — buying the best match ${chosen.guid} instead.`);
      }

      const price = priceTexasFileResult(chosen, product);
      if (input.maxUsd != null && price != null && price > input.maxUsd) {
        const what = product === 'plat' ? `plat is $${PLAT_FLAT_USD} flat` : `document is ${chosen.pages} page(s) (~$${chosen.pages})`;
        return { ok: false, reason: `${what}, over the $${input.maxUsd} limit`, pages: [], pageCount: chosen.pages ?? undefined };
      }

      if (chosen.owned) log.info('TexasFile', `${chosen.guid} is already owned by this account — re-opening it for free.`);
      const bought = await purchaseTexasFile(page, input.county, chosen.guid, searchId, log, product, { owned: chosen.owned === true });
      if (!bought) return { ok: false, reason: 'purchase did not return images', pages: [], guid: chosen.guid };

      // A plat arrives already rasterised from its PDF; a deed as page-image URLs to download.
      const pages = bought.pageImages ?? await downloadTexasFilePages(page, bought.pages);
      if (pages.length === 0) return { ok: false, reason: 'purchased but no page image downloaded', pages: [], guid: chosen.guid, purchaseId: bought.purchaseId };
      if (bought.method && bought.method !== 'page-urls') log.info('TexasFile', `Pages produced by ${bought.method}${bought.pdfUrl ? ' from the document PDF' : ''}.`);

      log.info('TexasFile', `Bought ${pages.length} page(s) for ${chosen.instrument ?? chosen.guid} — balance now ${bought.balance ?? '?'}.`);
      return {
        ok: true, reason: 'purchased', pages, guid: chosen.guid, purchaseId: bought.purchaseId,
        pageCount: pages.length, costUsd: price ?? pages.length, balanceAfter: bought.balance,
        instrument: chosen.instrument ?? undefined,
        pdfUrl: bought.pdfUrl ?? undefined, documentId: bought.documentId, pageMethod: bought.method,
      };
    } finally {
      await context.close().catch(() => {});
    }
  } catch (err) {
    return { ok: false, reason: `TexasFile buy failed: ${err instanceof Error ? err.message : String(err)}`, pages: [] };
  } finally {
    // acquireBrowser leases are pooled; do not close the shared browser here.
  }
}

/**
 * Search TexasFile for a target and return the results WITHOUT buying (cross-source discovery, plan
 * 1.1). Login + search only — this is how the free-first engine learns what TexasFile HAS before it
 * decides whether a document is paid-exclusive. Never throws: a failed search returns `[]` so one
 * source cannot sink the discovery pass.
 */
export async function searchTexasFileDocuments(input: TexasFileBuyInput, log: PipelineLogger = noLog): Promise<TexasFileResult[]> {
  let browser: Browser | null = null;
  try {
    browser = await acquireBrowser({ adapterId: 'texasfile', targetUrl: TF });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' });
    const page = await context.newPage();
    try {
      if (!(await loginTexasFile(page, log))) {
        log.warn('TexasFile', 'search-only: could not sign in');
        return [];
      }
      const { results } = await searchTexasFile(page, input, log);
      return results;
    } finally {
      await context.close().catch(() => {});
    }
  } catch (err) {
    log.warn('TexasFile', `search-only failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  } finally {
    // acquireBrowser leases are pooled; do not close the shared browser here.
  }
}

/** Search-only wrapper for PLATS (plan 1.2): acquire a browser, log in, run `searchTexasFilePlats`, return
 *  the plats. Mirrors `searchTexasFileDocuments`; never buys, never throws, returns `[]` on failure. */
export async function searchTexasFilePlatsDocuments(input: TexasFilePlatInput, log: PipelineLogger = noLog): Promise<TexasFileResult[]> {
  let browser: Browser | null = null;
  try {
    browser = await acquireBrowser({ adapterId: 'texasfile', targetUrl: TF });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' });
    const page = await context.newPage();
    try {
      if (!(await loginTexasFile(page, log))) {
        log.warn('TexasFile', 'plat search-only: could not sign in');
        return [];
      }
      const { results } = await searchTexasFilePlats(page, input, log);
      return results;
    } finally {
      await context.close().catch(() => {});
    }
  } catch (err) {
    log.warn('TexasFile', `plat search-only failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
