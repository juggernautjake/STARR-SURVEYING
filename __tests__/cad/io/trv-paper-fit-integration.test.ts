// __tests__/cad/io/trv-paper-fit-integration.test.ts
//
// Integration check: the user reported that survey imports still
// don't seem to adjust to scale. This test runs the real Garland
// sample through parse → map → bbox → paper-fit and verifies the
// resulting paper / scale / origin actually surround the survey.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';
import { fitPaperToBounds, bboxOfFeaturePointsRobust, PAPER_SIZES_IN } from '@/lib/cad/io/trv-paper-fit';

const sample = '/root/.claude/uploads/586362d4-da1f-4c40-b1d9-3487a6982d53/07a3cb8a-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026_1.TRV';
const exists = fs.existsSync(sample);

describe.skipIf(!exists)('TRV paper-fit integration — Garland sample', () => {
  it('produces a non-degenerate bbox in the state-plane millions', () => {
    const text = fs.readFileSync(sample, 'latin1');
    const { features } = trvToDrawing(parseTrv(text));
    const bbox = bboxOfFeaturePointsRobust(features as Parameters<typeof bboxOfFeaturePointsRobust>[0]);
    expect(bbox).not.toBeNull();
    // Eastings are millions; northings are negative millions
    // (screen-y-down). The full survey is on the order of
    // hundreds of feet on each axis.
    const widthFt = bbox!.maxX - bbox!.minX;
    const heightFt = bbox!.maxY - bbox!.minY;
    expect(widthFt).toBeGreaterThan(50);
    expect(widthFt).toBeLessThan(2000);
    expect(heightFt).toBeGreaterThan(50);
    expect(heightFt).toBeLessThan(2000);
  });

  it('picks a paper + scale whose printable area COVERS the bbox', () => {
    const text = fs.readFileSync(sample, 'latin1');
    const { features } = trvToDrawing(parseTrv(text));
    const bbox = bboxOfFeaturePointsRobust(features as Parameters<typeof bboxOfFeaturePointsRobust>[0])!;
    const fit = fitPaperToBounds(bbox);
    expect(fit).not.toBeNull();

    const [pwBase, phBase] = PAPER_SIZES_IN[fit!.paperSize];
    const [paperW, paperH] = fit!.paperOrientation === 'LANDSCAPE'
      ? [Math.max(pwBase, phBase), Math.min(pwBase, phBase)]
      : [Math.min(pwBase, phBase), Math.max(pwBase, phBase)];
    const margin = 1; // matches fitPaperToBounds default
    const printableWorldW = (paperW - 2 * margin) * fit!.drawingScale;
    const printableWorldH = (paperH - 2 * margin) * fit!.drawingScale;
    const surveyW = bbox.maxX - bbox.minX;
    const surveyH = bbox.maxY - bbox.minY;
    expect(printableWorldW).toBeGreaterThanOrEqual(surveyW);
    expect(printableWorldH).toBeGreaterThanOrEqual(surveyH);
  });

  it('places the paper so the survey is centered within it', () => {
    const text = fs.readFileSync(sample, 'latin1');
    const { features } = trvToDrawing(parseTrv(text));
    const bbox = bboxOfFeaturePointsRobust(features as Parameters<typeof bboxOfFeaturePointsRobust>[0])!;
    const fit = fitPaperToBounds(bbox)!;
    const [pwBase, phBase] = PAPER_SIZES_IN[fit.paperSize];
    const [paperW, paperH] = fit.paperOrientation === 'LANDSCAPE'
      ? [Math.max(pwBase, phBase), Math.min(pwBase, phBase)]
      : [Math.min(pwBase, phBase), Math.max(pwBase, phBase)];
    const paperWorldW = paperW * fit.drawingScale;
    const paperWorldH = paperH * fit.drawingScale;
    const bboxCenterX = (bbox.minX + bbox.maxX) / 2;
    const bboxCenterY = (bbox.minY + bbox.maxY) / 2;
    const paperCenterX = fit.paperOriginWorld.x + paperWorldW / 2;
    const paperCenterY = fit.paperOriginWorld.y + paperWorldH / 2;
    expect(paperCenterX).toBeCloseTo(bboxCenterX, 3);
    expect(paperCenterY).toBeCloseTo(bboxCenterY, 3);
  });

  it('picks an engineering scale ≤ 200 ft/in for a typical lot survey', () => {
    const text = fs.readFileSync(sample, 'latin1');
    const { features } = trvToDrawing(parseTrv(text));
    const bbox = bboxOfFeaturePointsRobust(features as Parameters<typeof bboxOfFeaturePointsRobust>[0])!;
    const fit = fitPaperToBounds(bbox)!;
    // Garland is a single-lot survey on the order of hundreds of
    // feet — should fit on TABLOID-or-smaller at ≤ 200 ft/in. A
    // failure here means the picker is over-escalating either
    // paper or scale.
    expect(fit.drawingScale).toBeLessThanOrEqual(200);
    expect(['LETTER', 'TABLOID', 'ARCH_C']).toContain(fit.paperSize);
  });
});
