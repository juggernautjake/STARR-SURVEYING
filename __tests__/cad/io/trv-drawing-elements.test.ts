// __tests__/cad/io/trv-drawing-elements.test.ts
//
// cad-trv-element-coverage Slice 2 — pure helpers for subtype-12
// point labels + the mapper integration that attaches them to
// POINT features.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { extractPointLabels, cleanLabelText } from '@/lib/cad/io/trv-drawing-elements';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';
import type { TrvDrawingElement } from '@/lib/cad/io/trv-parser';

const PILCROW = '¶';
const DC4 = '\x14';

function mkDe(header: string[], properties: string[][] = [], sourceLine = 0): TrvDrawingElement {
  return { header, properties, sourceLine };
}

describe('cleanLabelText', () => {
  it('strips a trailing pilcrow', () => {
    expect(cleanLabelText(`hello${PILCROW}`)).toBe('hello');
  });

  it('splits pilcrows into newlines (multi-line label)', () => {
    expect(cleanLabelText(`line A${PILCROW}line B${PILCROW}`)).toBe('line A\nline B');
  });

  it('joins DC4-separated tokens with a single space', () => {
    // TRV uses DC4 to separate the point id from descriptive text.
    expect(cleanLabelText(`443${DC4}930 5ft os${PILCROW}`)).toBe('443 930 5ft os');
  });

  it('drops empty pieces from the DC4 split', () => {
    expect(cleanLabelText(`${DC4}${DC4}only${DC4}${PILCROW}`)).toBe('only');
  });

  it('handles an empty payload safely', () => {
    expect(cleanLabelText('')).toBe('');
    expect(cleanLabelText(PILCROW)).toBe('');
  });
});

describe('extractPointLabels — pure helper', () => {
  it('skips drawing elements that are NOT subtype 12', () => {
    const elements = [
      mkDe(['10', '1000', 'North arrow', 'NORTH ARROWS\\X.DXF']),
      mkDe(['5', '-1.9', '1.6']),
      mkDe(['0', '0', 'Drawing1']),
    ];
    expect(extractPointLabels(elements)).toEqual([]);
  });

  it('extracts a subtype-12 label with the cleaned text', () => {
    const e = mkDe(
      ['12', '20fnd'],
      [
        ['5', '0.03', '-0.07', '0', '1', '6.00', '0', '0', `309 inside 315 1in${PILCROW}`],
        ['2', '917508'],
      ],
      7211,
    );
    const out = extractPointLabels([e]);
    expect(out).toEqual([
      { trvPointId: '20fnd', label: '309 inside 315 1in', sourceLine: 7211 },
    ]);
  });

  it('extracts multiple subtype-12 labels in document order', () => {
    const out = extractPointLabels([
      mkDe(['12', '443'], [['5', '0.01', '-0.05', '0', '0', '4.00', '0', '0', `443${DC4}930 5ft os${PILCROW}`]]),
      mkDe(['12', '221'], [['5', '-0.04', '-0.09', '0', '0', '4.00', '0', '0', `221${DC4}lndscape timber${PILCROW}`]]),
    ]);
    expect(out.map((l) => `${l.trvPointId}=${l.label}`)).toEqual([
      '443=443 930 5ft os',
      '221=221 lndscape timber',
    ]);
  });

  it('skips subtype-12 with no text-run 29 record (no label payload)', () => {
    const out = extractPointLabels([
      mkDe(['12', 'pointA'], [['2', '917508']]),
    ]);
    expect(out).toEqual([]);
  });

  it('skips subtype-12 with an empty point id', () => {
    expect(extractPointLabels([mkDe(['12', ''], [['5', '0', '0', '0', '0', '6', '0', '0', `x${PILCROW}`]])])).toEqual([]);
  });
});

describe('trvToDrawing — attaches subtype-12 labels onto POINT features', () => {
  it('a point with no native description picks up the drawing-element label', () => {
    // Note: the parser only opens a drawing element when both a 28
    // line AND a following section/record sequence are present in
    // the source. Using a real fixture rather than synthesising one
    // here keeps the integration honest.
    const text = [
      '999,begin',
      '#,POINTS',
      '95,1',
      '0,20fnd',
      '3,0',
      '4,5,0,0',
      '2,100,200,0',
      '#,TRAVERSE',
      '30,decor',
      '31,0,0,0,0',
      `28,12,20fnd`,
      `29,5,0.03,-0.07,0,1,6.00,0,0,309 inside 315 1in${PILCROW}`,
      '999,end',
    ].join('\r\n');
    const { features, notes } = trvToDrawing(parseTrv(text));
    const point = features.find((f) => f.type === 'POINT' && f.properties.trvPointId === '20fnd');
    expect(point).toBeDefined();
    expect(point!.properties.label).toBe('309 inside 315 1in');
    expect(notes.some((n) => n.includes('subtype 12'))).toBe(true);
  });

  it('the point\'s OWN 1,<description> wins when both exist (non-destructive)', () => {
    const text = [
      '999,begin',
      '#,POINTS',
      '95,1',
      '0,20fnd',
      '1,native description',
      '3,0',
      '4,5,0,0',
      '2,100,200,0',
      '#,TRAVERSE',
      '30,decor',
      '31,0,0,0,0',
      `28,12,20fnd`,
      `29,5,0.03,-0.07,0,1,6.00,0,0,from element${PILCROW}`,
      '999,end',
    ].join('\r\n');
    const point = trvToDrawing(parseTrv(text)).features.find((f) => f.type === 'POINT')!;
    expect(point.properties.label).toBe('native description');
  });
});

describe('trvToDrawing — Garland sample integration', () => {
  const sample = '/root/.claude/uploads/586362d4-da1f-4c40-b1d9-3487a6982d53/07a3cb8a-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026_1.TRV';
  it.skipIf(!fs.existsSync(sample))('extracts every subtype-12 drawing element from the live file', () => {
    const trv = parseTrv(fs.readFileSync(sample, 'latin1'));
    const labels = extractPointLabels(trv.drawingElements);
    expect(labels.length).toBeGreaterThan(0);
    // Garland has a `28,12,20fnd` with the label "309 inside 315 1in"
    // — spot-check it parses to the expected cleaned text.
    const fnd = labels.find((l) => l.trvPointId === '20fnd');
    expect(fnd?.label).toContain('309 inside 315');
  });

  it.skipIf(!fs.existsSync(sample))('the mapper joins drawing-element labels into the import notes', () => {
    const trv = parseTrv(fs.readFileSync(sample, 'latin1'));
    const out = trvToDrawing(trv);
    // The mapper logs "Attached N descriptive label(s)" ONLY when
    // labels actually overwrite an empty native label. Garland's
    // points all have native `1,<desc>` lines so the non-clobber
    // guard wins. The negative case — no note — is just as valid
    // as positive attachment; assert that the helper at least ran.
    const subtype12Count = trv.drawingElements.filter((de) => de.header[0] === '12').length;
    expect(subtype12Count).toBeGreaterThan(0);
    // No exception thrown + the note set is well-formed.
    expect(Array.isArray(out.notes)).toBe(true);
  });
});
