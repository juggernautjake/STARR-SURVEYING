// Run 5's review (2026-09-07) ran 80+ minutes and the screen showed "1:36:09 / 25:00 · $3.30" over a
// nine-minute, two-cent research run. Four causes, four fixes on the worker side:
//   T — the completed status payloads never said WHEN the run finished, so the clock kept counting;
//   U — the tiled reader zoomed into pieces already at native resolution (the same pixels, larger)
//       and had no per-page call budget: 112 calls on one document;
//   V — an owned document's re-open filed the viewer's 940×612 preview PNGs instead of the viewer's
//       PDF (the 1954 plat: a 3000×1954 image) — "55 effective DPI, unreadable";
//   W — the review honoured only the cost cap, never the 30-minute wall clock.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('T — a completed run says when it finished', () => {
  const src = read('index.ts');
  it('both cached completed payloads carry finishedAt', () => {
    // `PipelineResult` has no completedAt (the county result does) — the 0912adc32 build failed on
    // the worker host for exactly that, so the generic branch stamps the cache time.
    expect(src).not.toContain('finishedAt: result.completedAt');
    expect(src.split("finishedAt: new Date(completedResultsCachedAt.get(projectId) ?? Date.now()).toISOString(),").length - 1).toBe(2);
  });
});

describe('U — the tiled reader stops where the source has no more to give', () => {
  const av = read('services/adaptive-vision.ts');
  it('never zooms into a piece already at native resolution, and budgets calls per page', () => {
    expect(av).toContain('const MAX_CALLS_PER_PAGE = 24;');
    expect(av).toContain('const pieceWasDownscaled = Math.max(box.width, box.height) > CLAUDE_MAX_PIXELS;');
    expect(av).toContain('if (score.needsZoom && pieceWasDownscaled && pageCallsLeft >= 4) {');
    expect(av).toContain('Math.max(zbox.width, zbox.height) > CLAUDE_MAX_PIXELS && MAX_CALLS_PER_PAGE - totalApiCalls >= 4) {');
    expect(av).toContain('zooming would re-send the same pixels; not escalating');
  });
});

describe('V — an owned document\'s pages come from the viewer PDF', () => {
  const buy = read('services/texasfile-buy.ts');
  it('an owned begin\'s preview_url viewer path becomes the viewer URL, and the PDF is captured before the preview PNGs are used', () => {
    expect(buy).toContain("if (!viewerUrl && typeof body.preview_url === 'string' && /\\/document\\/viewer\\//.test(body.preview_url)) {");
    expect(buy).toContain("if (captured.pages.length > 0 && captured.method !== 'none') {");
    expect(buy).toContain('falling back to the ${body.pages.length} preview page image(s)');
    // The viewer capture sits BEFORE the page-url return in the same function.
    const fn = buy.slice(buy.indexOf('export async function purchaseTexasFile'), buy.indexOf('export async function downloadTexasFilePages'));
    expect(fn.indexOf('const captured = await capturePdfPages(page, viewerUrl, log);')).toBeGreaterThan(-1);
    expect(fn).toContain("return { pages: body.pages, purchaseId: receiptId ?? documentId ?? undefined, documentId: documentId ?? undefined, balance: body.user_balance, method: 'page-urls', charged };");
  });
});

describe('W — the review honours the wall clock as well as the cost cap', () => {
  it('mayContinue stops on any exceeded reason', () => {
    const src = read('index.ts');
    expect(src).toContain("const mayContinue = () => benchmark || checkBudget(projectId, spendForRun(projectId) - spendAtStart).exceeded == null;");
  });
});
