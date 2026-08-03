// Recreating the boundary drawing from a document's own calls (Phase I, S6).
//
// The assertions that matter are the ones about NOT drawing something. The tempting implementation
// joins the last point to the first and fills the polygon, and then every drawing looks like a
// closed, surveyed parcel — including the ones built from calls nobody could read and the ones whose
// closure error is fifty feet. Somebody will scale off this drawing.

import { describe, it, expect } from 'vitest';
import { drawBoundary, labelLeg } from '../services/survey-drawing.js';
import { traverse } from '../services/survey-geometry.js';

const square = [
  { bearing: 'N 0°00\'00" E', distance: 100, toPoint: 'a 1/2 inch iron rod found' },
  { bearing: 'N 90°00\'00" E', distance: 100, toPoint: 'an iron rod set' },
  { bearing: 'S 0°00\'00" E', distance: 100, toPoint: 'a concrete monument not found' },
  { bearing: 'S 90°00\'00" W', distance: 100, toPoint: 'the point of beginning' },
];

describe('the drawing shows what the deed says', () => {
  it('draws a line for every placed call', () => {
    const d = drawBoundary(traverse(square));
    expect((d.svg.match(/class="bnd"/g) ?? [])).toHaveLength(4);
  });

  it('labels each line with its bearing and distance', () => {
    const d = drawBoundary(traverse(square));
    expect(d.svg).toContain('100.00');
    // Quotes and apostrophes are XML-escaped, so a bearing label reads N 0°00&apos;00&quot; E — the
    // escaping is the point, since a seconds mark would otherwise close an attribute.
    expect(d.svg).toContain('N 0°00&apos;00&quot; E');
  });

  it('is valid, self-contained SVG', () => {
    const d = drawBoundary(traverse(square), { title: 'Lot 4 & Block 2' });
    expect(d.svg.startsWith('<svg')).toBe(true);
    expect(d.svg.trimEnd().endsWith('</svg>')).toBe(true);
    // The title is escaped, so an ampersand in a subdivision name cannot break the document.
    expect(d.svg).toContain('Lot 4 &amp; Block 2');
  });

  it('carries a north arrow and a scale bar', () => {
    const d = drawBoundary(traverse(square));
    expect(d.svg).toContain('class="north"');
    expect(d.svg).toMatch(/>\d+'<\/text>/);
  });
});

describe('labels are in the deed\'s own units', () => {
  it('labels a vara call in varas, with feet beneath', () => {
    // Labelling only in feet quietly rewrites the document. A surveyor comparing this against the
    // deed in their hand needs the deed's own number first.
    const t = traverse([{ bearing: 'N 0°00\'00" E', distance: 1900, unit: 'varas' }]);
    const l = labelLeg(t.legs[0]!);
    expect(l.distanceLabel).toBe('1900 vrs');
    expect(l.convertedLabel).toBe("(5277.78')");
  });

  it('does not add a redundant conversion for a call already in feet', () => {
    const t = traverse([{ bearing: 'N 0°00\'00" E', distance: 330.5 }]);
    expect(labelLeg(t.legs[0]!).convertedLabel).toBeNull();
  });

  it('says in the caveats which unit the deed used', () => {
    const d = drawBoundary(traverse([{ bearing: 'N 0°00\'00" E', distance: 1900, unit: 'varas' }]));
    expect(d.caveats.join(' ')).toContain('recited in varas');
  });

  it('flags a description that mixes units', () => {
    const d = drawBoundary(traverse([
      { bearing: 'N 0°00\'00" E', distance: 100, unit: 'varas' },
      { bearing: 'N 90°00\'00" E', distance: 100, unit: 'us_survey_feet' },
    ]));
    expect(d.caveats.join(' ')).toContain('mixes units');
  });
});

describe('monuments are drawn as what they are', () => {
  it('fills a found monument and leaves a set one hollow', () => {
    // The plat-legend convention, carrying the distinction that matters: which corners are existing
    // evidence and which are somebody's opinion.
    const d = drawBoundary(traverse(square));
    expect(d.svg).toContain('class="mon-found"');
    expect(d.svg).toContain('class="mon-set"');
  });

  it('marks a searched-for-and-missing corner distinctly from both', () => {
    const d = drawBoundary(traverse(square));
    expect(d.svg).toContain('class="mon-missing"');
  });
});

describe('what it refuses to draw', () => {
  it('does not close a description that does not close', () => {
    const open = [
      { bearing: 'N 0°00\'00" E', distance: 100 },
      { bearing: 'N 90°00\'00" E', distance: 100 },
      { bearing: 'S 0°00\'00" E', distance: 100 },
      { bearing: 'S 90°00\'00" W', distance: 80 },       // 20 ft short
    ];
    const d = drawBoundary(traverse(open));
    expect(d.svg).toContain('class="closure"');           // dashed, not a boundary line
    expect(d.svg).toContain('does not close');
    expect(d.caveats.join(' ')).toContain('not a boundary line');
  });

  it('leaves the outline broken where a call could not be placed', () => {
    const broken = [
      { bearing: 'N 0°00\'00" E', distance: 100 },
      { bearing: 'illegible', distance: 100 },
      { bearing: 'S 90°00\'00" W', distance: 100 },
    ];
    const d = drawBoundary(traverse(broken));
    expect((d.svg.match(/class="bnd"/g) ?? [])).toHaveLength(2);   // not 3, and not bridged
    expect(d.svg).toContain('INCOMPLETE');
    expect(d.caveats.join(' ')).toContain('could not be placed');
  });

  it('draws nothing, and says so, when no call could be placed', () => {
    const d = drawBoundary(traverse([{ bearing: 'illegible', distance: null }]));
    expect(d.svg).toContain('no boundary to draw');
    expect(d.caveats.join(' ')).toContain('about the document, not about the property');
  });

  it('never claims the drawing is on grid', () => {
    // North is up because the traverse was computed that way, not because it was rotated to grid.
    expect(drawBoundary(traverse(square)).caveats.join(' ')).toContain('NOT rotated to grid');
  });
});

describe('the figure is not distorted to fill the frame', () => {
  it('uses one scale for both axes', () => {
    // Stretching to fit changes every angle in the drawing, and somebody will scale off it.
    const wide = traverse([
      { bearing: 'N 90°00\'00" E', distance: 1000 },
      { bearing: 'N 0°00\'00" E', distance: 100 },
      { bearing: 'S 90°00\'00" W', distance: 1000 },
      { bearing: 'S 0°00\'00" E', distance: 100 },
    ]);
    const d = drawBoundary(wide, { widthPx: 1000, heightPx: 800 });

    // The 1000 ft side must be drawn ten times the length of the 100 ft side.
    const lines = [...d.svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" class="bnd"/g)]
      .map((m) => Math.hypot(+m[3]! - +m[1]!, +m[4]! - +m[2]!));
    const longest = Math.max(...lines);
    const shortest = Math.min(...lines);
    expect(longest / shortest).toBeCloseTo(10, 1);
  });
});
