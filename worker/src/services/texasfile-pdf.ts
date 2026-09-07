// worker/src/services/texasfile-pdf.ts — the pages of a TexasFile document that is served as a PDF
//
// ── WHAT THE LIVE SITE DOES (2026-09-07, Bell plat GUID 0FE0A9D8-…) ────────────────────────────
//
// A deed bought through `/instrument/` answers with page-image URLs. A PLAT bought through `/plat/`
// does not: the begin call answers `{ preview_url, retrieval_url, images_available: true,
// purchase_id: null }` — the document id lives INSIDE the two URLs — the complete call answers
// `{ purchase_url: "/document/viewer/<docId>/", purchase_id, user_balance }`, the status call only
// ever says `{ document_id, available: true }`, and the viewer page fetches the whole document as
// ONE signed PDF from media.texasfile.com (`application/pdf`, link valid until 2100). So a plat is a
// PDF to rasterise, not a list of images to download. The old code read `purchase_id` (null), never
// completed, saw no `pages`, and reported "no images" for a plat it had found.
//
// This module: read the ids out of the begin body; recognise the PDF response; rasterise a PDF into
// page PNGs with poppler's `pdftoppm` (installed in the worker image); and, when poppler is missing
// (an image built before this change), fall back to screenshotting the viewer's canvas page by page
// so a run still files the plat — at screen resolution, said so in the log.

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Page } from 'playwright';
import type { PipelineLogger } from '../lib/logger.js';

const execFileAsync = promisify(execFile);

export interface TexasFileBeginBody {
  pages?: string[];
  purchase_id?: number | null;
  user_balance?: string;
  images_available?: boolean | null;
  preview_url?: string;
  retrieval_url?: string;
  purchase_url?: string;
}

/** The TexasFile document id a begin/complete body refers to: `purchase_id` when it is a number,
 *  else the id embedded in `preview_url` (…/purchase/<id>/complete/…) or `retrieval_url`
 *  (…/status/<id>/purchase/). Null when none of the three carries one. */
export function documentIdFromBegin(body: TexasFileBeginBody | null | undefined): number | null {
  if (!body) return null;
  if (typeof body.purchase_id === 'number' && Number.isFinite(body.purchase_id)) return body.purchase_id;
  const fromPreview = body.preview_url?.match(/\/purchase\/(\d+)\/complete\//)?.[1];
  if (fromPreview) return Number(fromPreview);
  const fromStatus = body.retrieval_url?.match(/\/status\/(\d+)\//)?.[1];
  if (fromStatus) return Number(fromStatus);
  const fromViewer = body.purchase_url?.match(/\/viewer\/(\d+)\//)?.[1];
  if (fromViewer) return Number(fromViewer);
  return null;
}

/** Is this response the document itself? The viewer fetches it from media.texasfile.com as a PDF. */
export function isTexasFilePdfResponse(url: string, contentType: string | undefined): boolean {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('application/pdf')) return true;
  return /media\.texasfile\.com\/documents\/.*\.pdf(\?|$)/i.test(url);
}

/** The filename TexasFile suggests for the PDF ("Bell_1954-09-21_V_A_P_166A.pdf"), from the URL. */
export function pdfFilenameFromUrl(url: string): string | null {
  const m = url.match(/filename%3D%22([^%]+)%22|filename="([^"]+)"/i);
  return m ? decodeURIComponent(m[1] ?? m[2] ?? '') || null : null;
}

/**
 * Rasterise a PDF into page PNG buffers with poppler's `pdftoppm`. Throws a stated error when the
 * binary is missing so the caller can fall back — a silent zero-page result is what this replaces.
 */
export async function rasterisePdf(pdf: Buffer, opts: { dpi?: number } = {}): Promise<Buffer[]> {
  const dpi = opts.dpi ?? 200;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tf-pdf-'));
  try {
    const input = path.join(dir, 'doc.pdf');
    await fs.writeFile(input, pdf);
    try {
      await execFileAsync('pdftoppm', ['-r', String(dpi), '-png', input, path.join(dir, 'page')], { timeout: 120_000, maxBuffer: 1024 * 1024 });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'ENOENT') throw new Error('pdftoppm is not installed in this worker image (poppler-utils) — cannot rasterise the PDF');
      throw new Error(`pdftoppm failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const files = (await fs.readdir(dir)).filter((f) => f.startsWith('page') && f.endsWith('.png')).sort(pageOrder);
    const out: Buffer[] = [];
    for (const f of files) out.push(await fs.readFile(path.join(dir, f)));
    return out;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** pdftoppm names pages `page-1.png` … `page-10.png` (zero-padded when there are many); sort numerically. */
export function pageOrder(a: string, b: string): number {
  const na = Number(a.match(/(\d+)\.png$/)?.[1] ?? 0);
  const nb = Number(b.match(/(\d+)\.png$/)?.[1] ?? 0);
  return na - nb;
}

export interface CapturedPdfPages {
  /** Page images, base64 PNG/JPEG, in order. */
  pages: Array<{ imageBase64: string; url: string }>;
  /** The signed PDF URL the viewer fetched, when one was seen. */
  pdfUrl: string | null;
  /** The raw PDF bytes, when they were downloaded. */
  pdf: Buffer | null;
  /** How the pages were produced. */
  method: 'pdftoppm' | 'viewer-canvas' | 'none';
  note?: string;
}

/**
 * Open the viewer for a purchased document, take its PDF, and turn it into page images.
 *
 * Order: the PDF the viewer fetches → poppler. If poppler is missing, the viewer's own canvas is
 * screenshotted page by page (the viewer paginates with a next-page control) — lower resolution,
 * but the plat is filed rather than lost. Never throws; a total failure returns `method: 'none'`
 * with the reason in `note`.
 */
export async function capturePdfPages(page: Page, viewerUrl: string, log: PipelineLogger): Promise<CapturedPdfPages> {
  // A holder, not a `let`: the URL is set from an event callback, which TypeScript's narrowing
  // cannot see, so a plain variable reads as `never` after the loop.
  const seen: { pdfUrl: string | null } = { pdfUrl: null };
  const onResponse = (r: { url: () => string; headers: () => Record<string, string> }) => {
    if (!seen.pdfUrl && isTexasFilePdfResponse(r.url(), r.headers()['content-type'])) seen.pdfUrl = r.url();
  };
  page.on('response', onResponse);
  try {
    await page.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    // The PDF request follows the viewer's scripts; give it a bounded wait rather than a fixed sleep.
    const deadline = Date.now() + 25_000;
    while (!seen.pdfUrl && Date.now() < deadline) await page.waitForTimeout(500);
  } catch (err) {
    log.warn('TexasFile', `Viewer did not load (${viewerUrl}): ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    page.off('response', onResponse);
  }
  const pdfUrl = seen.pdfUrl;

  let pdf: Buffer | null = null;
  if (pdfUrl) {
    try {
      const r = await page.context().request.get(pdfUrl, { timeout: 60_000 });
      if (r.ok()) pdf = Buffer.from(await r.body());
      else log.warn('TexasFile', `PDF download HTTP ${r.status()} — ${pdfUrl.slice(0, 120)}`);
    } catch (err) {
      log.warn('TexasFile', `PDF download failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    log.warn('TexasFile', 'The viewer did not fetch a PDF within 25 s — falling back to the viewer canvas.');
  }

  if (pdf) {
    try {
      const pngs = await rasterisePdf(pdf, { dpi: 200 });
      if (pngs.length > 0) {
        log.info('TexasFile', `Rasterised the PDF: ${pngs.length} page(s) at 200 dpi (${Math.round(pdf.length / 1024)} KB).`);
        return { pages: pngs.map((b, i) => ({ imageBase64: b.toString('base64'), url: `${pdfUrl}#page=${i + 1}` })), pdfUrl, pdf, method: 'pdftoppm' };
      }
      log.warn('TexasFile', 'pdftoppm produced no pages — falling back to the viewer canvas.');
    } catch (err) {
      log.warn('TexasFile', `${err instanceof Error ? err.message : String(err)} — falling back to the viewer canvas.`);
    }
  }

  // ── Fallback: the viewer's canvas, page by page ───────────────────────────────────────────────
  try {
    const shots = await screenshotViewerPages(page);
    if (shots.length > 0) {
      log.info('TexasFile', `Captured ${shots.length} page(s) from the viewer canvas (screen resolution — install poppler for 200 dpi).`);
      return { pages: shots.map((b, i) => ({ imageBase64: b.toString('base64'), url: `${viewerUrl}#page=${i + 1}` })), pdfUrl, pdf, method: 'viewer-canvas', note: 'viewer canvas fallback' };
    }
  } catch (err) {
    log.warn('TexasFile', `Viewer canvas capture failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { pages: [], pdfUrl, pdf, method: 'none', note: pdfUrl ? 'PDF seen but no page could be produced' : 'no PDF and no canvas' };
}

/** Screenshot the viewer's canvas for each page: zoom to fit, capture, press next until the page
 *  counter stops advancing. Bounded at 60 pages. */
async function screenshotViewerPages(page: Page): Promise<Buffer[]> {
  const out: Buffer[] = [];
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 15_000 });
  // "Fit" keeps the whole page in the canvas; the viewer exposes it as a toolbar word.
  await page.getByText(/^Fit$/).first().click({ timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(800);
  const total = await page.evaluate(() => {
    const m = document.body.innerText.match(/of\s+(\d+)/);
    return m ? Number(m[1]) : 1;
  }).catch(() => 1);
  const pages = Math.min(Math.max(1, total), 60);
  for (let i = 0; i < pages; i++) {
    await page.waitForTimeout(600);
    out.push(await canvas.screenshot({ type: 'png' }));
    if (i < pages - 1) {
      const next = page.getByText(/^arrow_downward$/).first();
      await next.click({ timeout: 3_000 }).catch(() => {});
    }
  }
  return out;
}
