import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { scoreConfidence } from '../services/adaptive-vision.js';

// ── D3 — ESCALATION IS THE POINT, SO VERIFY IT FIRES ────────────────────────────────────────────
//
// > "each page should also be split up into quadrants and then enlarged and reviewed/analyzed
// >  individually" … "zoom in and get an even better understanding"
//
// The zoom half is the sixth phase of adaptive-vision: a segment scoring under 60 is cut into four
// and read again at higher resolution. The previous slice gave Bell the same GRID as the generic
// pipeline; it did not give Bell that phase, so a hard-to-read quadrant on a deed was read once and
// accepted.
//
// This asserts the trigger on text that looks like what a watermarked county scan actually
// produces, and asserts that both paths ACT on it.

const ROOT = path.join(__dirname, '..');
const code = (p: string): string => {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const s = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
  if (!/\b(import|export|const|function)\b/.test(s)) throw new Error(`stripping destroyed ${p}`);
  return s;
};

describe('what a bad read looks like, and what a good one looks like', () => {
  // A clean quadrant off a legible deed: bearings, distances, a lot reference, no hedging.
  const CLEAN = [
    'N 45°30\'15" E 152.40 feet to a 1/2" iron rod',
    'S 44°29\'45" E 210.75 feet',
    'S 45°30\'15" W 152.40 feet',
    'LOT 4, BLOCK A',
    'L1 N 12°00\'00" E 88.20',
  ].join('\n');

  // The same quadrant under a county watermark: the model reads SOMETHING but hedges everywhere.
  const WATERMARKED = [
    'N 45°30\'15" E 152.[?]0 feet — partially obscured by watermark',
    'S 44°[?]9\'45" E 21[?].75 feet, possibly 216.75',
    'bearing unclear, could be S 45° or S 46°',
    'LOT 4 [?] illegible',
  ].join('\n');

  it('CONTROL: a clean read scores well and needs no zoom', () => {
    // Without this, "the bad one needs zoom" could be true because EVERYTHING needs zoom.
    const s = scoreConfidence(CLEAN);
    expect(s.dataPoints).toBeGreaterThan(0);
    expect(s.confidence).toBeGreaterThanOrEqual(60);
    expect(s.needsZoom).toBe(false);
  });

  it('THE TRIGGER: a watermarked read found data and still reads badly — so zoom', () => {
    const s = scoreConfidence(WATERMARKED);
    expect(s.dataPoints).toBeGreaterThan(0);
    expect(s.uncertaintyScore).toBeGreaterThan(0);
    expect(s.confidence).toBeLessThan(60);
    expect(s.needsZoom).toBe(true);
  });

  it('a blank margin does NOT zoom — four more calls on nothing is four more calls', () => {
    // `needsZoom` requires dataPoints > 0 on purpose. A region that found nothing at all has
    // nothing to find; a region that found something and hedged has more to find.
    const s = scoreConfidence('');
    expect(s.dataPoints).toBe(0);
    expect(s.needsZoom).toBe(false);
  });

  it('a text-only region (dedications, notes) is not mistaken for a failed read', () => {
    const s = scoreConfidence('KNOW ALL MEN BY THESE PRESENTS that the undersigned owner does hereby dedicate.');
    expect(s.dataPoints).toBe(0);
    expect(s.needsZoom).toBe(false);
  });
});

describe('both paths act on it — assert the CALLERS', () => {
  it('the generic pipeline escalates, and re-splits 2×2', () => {
    const s = code('services/adaptive-vision.ts');
    expect(s).toContain('if (score.needsZoom)');
    expect(s).toContain('computeCropBoxes(box.width, box.height, 2, 2, ZOOM_OVERLAP_PCT)');
  });

  it('THE GAP: Bell escalates too now', () => {
    const s = code('counties/bell/analyzers/deed-analyzer.ts');
    expect(s).toContain('const score = scoreConfidence(text);');
    expect(s).toContain('if (score.needsZoom && region.box');
    expect(s).toContain('computeCropBoxes(region.box.width, region.box.height, 2, 2, ZOOM_OVERLAP)');
  });

  it('Bell re-cuts from the ORIGINAL page, not from the resized crop', () => {
    // Enlarging a downscaled image cannot recover detail, and recovering detail is the whole
    // point of escalating. The region carries its box so the sub-piece comes out of the original.
    const s = code('counties/bell/analyzers/deed-analyzer.ts');
    expect(s).toContain('cropRegionFromPage(');
    expect(s).toContain('pageBuf, pageMeta.width, pageMeta.height');
    expect(s).toContain('region.box.left + sub.left');
  });

  it('and only for a region big enough to have something finer inside it', () => {
    const s = code('counties/bell/analyzers/deed-analyzer.ts');
    expect(s).toContain('region.box.width > 400 && region.box.height > 400');
  });

  it('the escalation overlap is tighter than the primary one, in both modules', () => {
    // 8% against 15%/5%: the sub-pieces are already small, so a wide overlap mostly re-reads
    // what the neighbour already read.
    expect(code('counties/bell/analyzers/deed-analyzer.ts')).toContain('const ZOOM_OVERLAP = 0.08;');
    expect(code('services/adaptive-vision.ts')).toContain('const ZOOM_OVERLAP_PCT = 0.08;');
  });
});
