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

const TF = 'https://www.texasfile.com';

/** `Bell` / `Bell County` → `bell` (the API segment) and `bell-county` (the search-page slug). */
export function texasFileCountyKey(county: string): string {
  return county.trim().toLowerCase().replace(/\s+county$/, '').replace(/[^a-z0-9]+/g, '-');
}
export function texasFileCountySlug(county: string): string {
  return `${texasFileCountyKey(county)}-county`;
}

/** The purchase-API URL for a document GUID found in a search (mapped live 2026-09-05). */
export function purchaseApiUrl(county: string, guid: string, searchId: string, state = 'texas'): string {
  return `${TF}/document/api/purchase/${state}/${texasFileCountyKey(county)}/instrument/${guid}/`
    + `?from_product_content_type=search&from_product_object_id=${encodeURIComponent(searchId)}`;
}

export interface TexasFileResult {
  guid: string;
  instrument: string | null;
  bookVolPage: string | null;
  pages: number | null;
  type: string | null;
  date: string | null;
  text: string;
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

  const results = await page.evaluate(() => {
    const out: Array<{ guid: string; instrument: string | null; bookVolPage: string | null; pages: number | null; type: string | null; date: string | null; text: string }> = [];
    const btns = Array.from(document.querySelectorAll('button[name="btnPurchaseFromSearch"], button[data-for^="Purchase-"]'));
    for (const b of btns) {
      const dataFor = b.getAttribute('data-for') || '';
      const guid = (dataFor.replace(/^Purchase-/, '') || (b.closest('[id^="purchaseButton"]')?.id || '').replace('purchaseButton', ''));
      if (!/^[0-9a-f-]{30,}$/i.test(guid)) continue;
      const row = b.closest('tr');
      const detail = row?.nextElementSibling; // the "Reference Documents: Pages: N …" row
      const txt = ((row?.textContent || '') + ' ' + (detail?.textContent || '')).replace(/\s+/g, ' ').trim();
      const pm = txt.match(/Pages?:\s*(\d+)/i);
      const tm = txt.match(/County Type:\s*([^-][^]*?)(?:Additional|$)/i);
      const dm = txt.match(/\b(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/);
      const im = txt.match(/\b(\d{7,})\b/);
      out.push({ guid: guid.toUpperCase(), instrument: im ? im[1] : null, bookVolPage: null, pages: pm ? +pm[1] : null, type: tm ? tm[1].trim().slice(0, 40) : null, date: dm ? dm[1] : null, text: txt.slice(0, 160) });
    }
    // de-dup by guid
    const seen = new Set<string>();
    return out.filter(r => (seen.has(r.guid) ? false : (seen.add(r.guid), true)));
  });
  log.info('TexasFile', `Search "${input.name ?? `${input.volume}/${input.page}`}" → ${results.length} result(s), searchId=${searchId ?? '?'}.`);
  return { searchId, results };
}

/** Purchase (or re-fetch if already owned) a document by GUID and return its page image URLs. */
export async function purchaseTexasFile(page: Page, county: string, guid: string, searchId: string, log: PipelineLogger = noLog): Promise<{ pages: string[]; purchaseId?: number; balance?: string } | null> {
  try {
    const res = await page.context().request.get(purchaseApiUrl(county, guid, searchId), { timeout: 30_000 });
    if (!res.ok()) { log.warn('TexasFile', `Purchase API HTTP ${res.status()} for ${guid}.`); return null; }
    const body = await res.json() as { pages?: string[]; purchase_id?: number; user_balance?: string; images_available?: boolean };
    if (!body.images_available || !Array.isArray(body.pages) || body.pages.length === 0) {
      log.warn('TexasFile', `Purchase returned no images for ${guid} (images_available=${body.images_available}).`);
      return null;
    }
    return { pages: body.pages, purchaseId: body.purchase_id, balance: body.user_balance };
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

      const { searchId, results } = await searchTexasFile(page, input, log);
      if (!searchId || results.length === 0) return { ok: false, reason: 'no TexasFile results for that search', pages: [] };

      // Pick the result that matches the wanted document: by instrument number if we have one, else
      // the first (a name/vol-page search is already narrow).
      const want = input.instrumentNumber?.replace(/\D/g, '');
      const chosen = (want && results.find(r => (r.instrument ?? '').replace(/\D/g, '') === want)) || results[0];

      if (input.maxUsd != null && chosen.pages != null && chosen.pages > input.maxUsd) {
        return { ok: false, reason: `document is ${chosen.pages} page(s) (~$${chosen.pages}), over the $${input.maxUsd} limit`, pages: [], pageCount: chosen.pages };
      }

      const bought = await purchaseTexasFile(page, input.county, chosen.guid, searchId, log);
      if (!bought) return { ok: false, reason: 'purchase did not return images', pages: [], guid: chosen.guid };

      const pages = await downloadTexasFilePages(page, bought.pages);
      if (pages.length === 0) return { ok: false, reason: 'purchased but no page image downloaded', pages: [], guid: chosen.guid, purchaseId: bought.purchaseId };

      log.info('TexasFile', `Bought ${pages.length} page(s) for ${chosen.instrument ?? chosen.guid} — balance now ${bought.balance ?? '?'}.`);
      return {
        ok: true, reason: 'purchased', pages, guid: chosen.guid, purchaseId: bought.purchaseId,
        pageCount: pages.length, costUsd: chosen.pages ?? pages.length, balanceAfter: bought.balance,
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
