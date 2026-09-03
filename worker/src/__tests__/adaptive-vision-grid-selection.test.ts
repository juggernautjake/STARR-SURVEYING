import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeImageDimensions, selectOptimalGrid, computeCropBoxes,
} from '../services/adaptive-vision.js';

// ── A DEED PAGE WAS COSTING 32 VISION CALLS, AND NOBODY HAD MEASURED IT ─────────────────────────
//
// Found while giving Bell the quadrant analysis the owner asked for. Before wiring Bell to this
// planner, a probe asked it what grid an ordinary deed page gets. The answer was 4×8 — thirty-two
// segments — and a 24×36 plat, the thing this module was built for, got 2×2.
//
// Two defects compounding:
//
//   1. `analyzeImageDimensions` looked like a search for the closest standard sheet and was not
//      one. `bestDiff` started at Infinity, so the FIRST candidate always won and the body
//      `return`ed inside the loop. Every image was called a 24×36 sheet.
//
//   2. Letter and legal were not in the sheet table at all, and deeds are the majority of what
//      this system reads.
//
// Together: a 2550×3300 scan — letter at a perfectly good 300 DPI — was computed as 3300/36 ≈ 92
// DPI, its fine text estimated at 6.4px against a 13px floor, so every grid failed and the selector
// fell through to its finest option. Each of those 32 segments could then escalate to 4 more, and
// each of those to 4 more again.
//
//   3. And the test inside `selectOptimalGrid` did not mention the grid. `fineTextPx = dpi × 0.07`
//      is constant across all four options, so the loop could only return 2×2 on the first pass or
//      fail all four. **2×4 and 4×4 have never been selected in the history of this module.**

describe('the sheet a bitmap actually came from', () => {
  it('CONTROL: a real 24×36 plat is still recognised as one', () => {
    // If this breaks, a failure below means the matcher broke, not that the sizes were wrong.
    const info = analyzeImageDimensions(7200, 10800);
    expect(info.sheetName).toBe('24×36');
    expect(info.estimatedDpi).toBe(300);
  });

  it('THE DEFECT: a letter deed page is no longer called a 24×36 sheet', () => {
    const info = analyzeImageDimensions(2550, 3300);
    expect(info.sheetName).toBe('letter');
    // Was 3300/36 ≈ 92. A 92 DPI reading of a 300 DPI scan is what drove the 4×8 split.
    expect(info.estimatedDpi).toBe(300);
  });

  it('legal and 11×17 resolve too — entries the loop could never reach', () => {
    expect(analyzeImageDimensions(2550, 4200).sheetName).toBe('legal');
    expect(analyzeImageDimensions(3300, 5100).sheetName).toBe('11×17');
  });

  it('orientation does not matter — a landscape plat is the same sheet', () => {
    expect(analyzeImageDimensions(10800, 7200).sheetName).toBe('24×36');
  });
});

describe('how many Vision calls a page costs', () => {
  const grid = (w: number, h: number) => selectOptimalGrid(analyzeImageDimensions(w, h));

  it('THE COST DEFECT: a 300 DPI letter deed page is 4 segments, not 32', () => {
    const g = grid(2550, 3300);
    expect(g.totalPieces).toBe(4);
    expect(`${g.rows}x${g.cols}`).toBe('2x2');
  });

  it('the quadrant floor holds even for a scan too poor to read', () => {
    // A 120 DPI letter page reaches the floor at no grid. The old fallback answered 4×8 — 32 calls
    // to read the same blur, because a finer grid only helps by avoiding downscale and there is no
    // downscale here. Splitting further cannot create ink that was never scanned.
    const g = grid(1024, 1320);
    expect(g.totalPieces).toBe(4);
    expect(g.fineTextPx).toBeLessThan(13);
  });

  it('a plat still gets its quadrants, and a bigger plat does not get more expensive', () => {
    expect(grid(7200, 10800).totalPieces).toBe(4);
    expect(grid(14400, 21600).totalPieces).toBe(4);
  });

  it('the fine-text estimate accounts for the downscale the API applies', () => {
    // The surrounding log messages already computed it this way; the DECISION did not, so the log
    // and the choice were different numbers and only one was printed.
    const small = grid(2550, 3300);   // pieces well inside the limit — no downscale
    const huge  = grid(14400, 21600); // 2×2 pieces exceed 8000px — downscaled on the way in
    expect(small.fineTextPx).toBeCloseTo(21, 0);
    expect(huge.fineTextPx).toBeLessThan(600 * 0.07);  // scaled down from the raw DPI estimate
    expect(huge.fineTextPx).toBeGreaterThan(13);       // still legible, so 2×2 is right
  });
});

describe('crop boxes cover the page', () => {
  it('a 2×2 grid is four boxes that reach every edge', () => {
    const boxes = computeCropBoxes(2550, 3300, 2, 2, 0.15);
    expect(boxes).toHaveLength(4);
    expect(Math.min(...boxes.map((b) => b.left))).toBe(0);
    expect(Math.min(...boxes.map((b) => b.top))).toBe(0);
    expect(Math.max(...boxes.map((b) => b.left + b.width))).toBe(2550);
    expect(Math.max(...boxes.map((b) => b.top + b.height))).toBe(3300);
  });

  it('adjacent boxes overlap, so a bearing on a seam is not cut in half', () => {
    const [tl, tr] = computeCropBoxes(1000, 1000, 2, 2, 0.15);
    expect(tr!.left).toBeLessThan(tl!.left + tl!.width);
  });
});

describe('Bell uses the shared planner — assert the CALLER', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'counties/bell/analyzers/deed-analyzer.ts'), 'utf8',
  );
  const code = src.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');

  it('CONTROL: the probe is reading the analyzer', () => {
    expect(code).toContain('splitImageIntoRegions');
  });

  it('THE DEFECT: two horizontal strips are gone', () => {
    // It produced exactly three regions on every page, forever: full image, top half, bottom half.
    // A "half" of a 24×36 sheet is eighteen inches of drawing in one Vision call.
    expect(code).not.toContain("'top half'");
    expect(code).not.toContain("'bottom half'");
  });

  it('and the grid comes from adaptive-vision, not a second copy of the idea', () => {
    expect(code).toContain('selectOptimalGrid(info)');
    expect(code).toContain('computeCropBoxes(width, height, grid.rows, grid.cols');
  });

  it('the whole page is still analysed as well as the quadrants', () => {
    // "Each page should be saved as a whole page, but each page should also be split up into
    // quadrants" — both, not one instead of the other.
    expect(code).toContain("'full image (overview)'");
  });
});
