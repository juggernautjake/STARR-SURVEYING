// __tests__/lib/survey-diagram.test.ts
//
// The diagram generator must (a) turn a stored spec + the freshly-generated
// vars into an <svg> whose labels match those numbers, and (b) fail SOFT
// (null / empty frame) rather than throw, so a bad figure never breaks a quiz.

import { describe, it, expect } from 'vitest';
import { buildDiagramFromSpec, renderTowerTwoAngles, renderProfile, renderCrossSection, renderPlat, renderRoundedCornerLot, renderHeightRelations, renderTiltedPhoto, renderContourMap } from '@/lib/diagrams/survey-diagram';

describe('renderCurve (enriched) via buildDiagramFromSpec', () => {
  const svg = buildDiagramFromSpec({ type: 'curve', rVar: 'R', iVar: 'I' }, { R: 500, I: 60 }) || '';

  it('renders an svg', () => {
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('labels R and I from the vars', () => {
    expect(svg).toContain('R = 500.00');
    expect(svg).toContain('I =');
  });

  it('adds the full element set T, LC, E, M and the tangent–chord = I/2', () => {
    // T = 500·tan30° = 288.68; LC = 2·500·sin30° = 500.00
    expect(svg).toContain('T = 288.68');
    expect(svg).toContain('LC = 500.00');
    expect(svg).toContain('E = ');
    expect(svg).toContain('M = ');
    expect(svg).toContain('I/2');
  });

  it('returns null when a required var is missing', () => {
    expect(buildDiagramFromSpec({ type: 'curve', rVar: 'R', iVar: 'I' }, { R: 500 })).toBeNull();
  });
});

describe('renderTowerTwoAngles', () => {
  it('renders the two stations, angles, baseline and unknown height', () => {
    const svg = renderTowerTwoAngles(100, 22, 42);
    expect(svg).toContain('<svg');
    expect(svg).toContain('A =');
    expect(svg).toContain('B =');
    expect(svg).toContain('h = ?');
    expect(svg).toContain("100.00'");
  });

  it('fails soft (empty frame, no throw) when β ≤ α', () => {
    const svg = renderTowerTwoAngles(100, 42, 22);
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('h = ?');
  });

  it('is reachable through the spec dispatcher', () => {
    const svg = buildDiagramFromSpec(
      { type: 'towerTwoAngles', dVar: 'd', alphaVar: 'a', betaVar: 'b' },
      { d: 100, a: 22, b: 42 },
    ) || '';
    expect(svg).toContain('h = ?');
  });

  it('returns null when a var is missing', () => {
    expect(buildDiagramFromSpec(
      { type: 'towerTwoAngles', dVar: 'd', alphaVar: 'a', betaVar: 'b' },
      { d: 100, a: 22 },
    )).toBeNull();
  });
});

describe('renderProfile', () => {
  it('labels the invert elevations and stations (with X+YY.YY format)', () => {
    const svg = renderProfile(
      [{ sta: 0, elev: 1228.69, label: 'MH1' }, { sta: 247.55, elev: 1229.27, label: 'MH2' }],
      { cutSta: 125 },
    );
    expect(svg).toContain('<svg');
    expect(svg).toContain('MH1');
    expect(svg).toContain('1228.69');
    expect(svg).toContain('2+47.55'); // station format
    expect(svg).toContain('1+25.00'); // cut station
    expect(svg).toContain('cut = ?');
  });

  it('reaches through the dispatcher with var refs', () => {
    const svg = buildDiagramFromSpec({
      type: 'profile',
      profilePoints: [{ staVar: 's0', elevVar: 'e0', label: 'MH1' }, { staVar: 's1', elevVar: 'e1', label: 'MH2' }],
      cutStaVar: 'cs',
    }, { s0: 0, e0: 1228.69, s1: 247.55, e1: 1229.27, cs: 125 }) || '';
    expect(svg).toContain('MH2');
    expect(svg).toContain('cut = ?');
  });
});

describe('renderCrossSection', () => {
  it('draws a fill section with the slope ratio and half-width', () => {
    const svg = renderCrossSection(12, 4, 'fill');
    expect(svg).toContain('<svg');
    expect(svg).toContain('4.00 : 1');
    expect(svg).toContain("12.00' to edge");
    expect(svg).toContain('FILL');
  });

  it('draws a cut section', () => {
    expect(renderCrossSection(12, 2, 'cut')).toContain('CUT');
  });

  it('reaches through the dispatcher and honors cutFill', () => {
    const svg = buildDiagramFromSpec(
      { type: 'crossSection', halfWidthVar: 'w', slopeVar: 's', cutFill: 'fill' },
      { w: 12, s: 4 },
    ) || '';
    expect(svg).toContain('4.00 : 1');
  });

  it('returns null on invalid inputs', () => {
    expect(buildDiagramFromSpec({ type: 'crossSection', halfWidthVar: 'w', slopeVar: 's' }, { w: 12 })).toBeNull();
  });
});

describe('renderPlat', () => {
  it('draws lots with numbers, frontage dims (incl. a "±" remainder) and monuments', () => {
    const svg = renderPlat(
      [{ width: 50, label: '1' }, { width: 50, label: '2' }, { width: 50, label: '3' },
       { width: 50, label: '4' }, { width: 32.3, label: '5', dim: '30±' }],
      { streetName: 'First Street', monA: 'A', monB: 'B' },
    );
    expect(svg).toContain('<svg');
    expect(svg).toContain('First Street');
    expect(svg).toContain('30±');       // remainder-lot dimension label
    expect(svg).toContain('>A<');       // monument A label
  });

  it('reaches through the dispatcher', () => {
    const svg = buildDiagramFromSpec({
      type: 'plat',
      platLots: [{ widthVar: 'w1', label: '1' }, { widthVar: 'w2', label: '2' }],
      streetName: 'Easy Street',
    }, { w1: 50, w2: 60 }) || '';
    expect(svg).toContain('Easy Street');
  });
});

describe('renderRoundedCornerLot', () => {
  it('labels the sides, radius and 90° and draws an arc', () => {
    const svg = renderRoundedCornerLot(120, 60, 20);
    expect(svg).toContain('<svg');
    expect(svg).toContain("120.00'");
    expect(svg).toContain("60.00'");
    expect(svg).toContain('r = 20.00');
    expect(svg).toContain('90°');
    expect(svg).toMatch(/ A [\d.]+ [\d.]+ 0 0 0/); // an SVG arc segment
  });

  it('reaches through the dispatcher', () => {
    const svg = buildDiagramFromSpec(
      { type: 'roundedLot', lengthVar: 'L', widthVar: 'W', radiusVar: 'r' },
      { L: 120, W: 60, r: 20 },
    ) || '';
    expect(svg).toContain('r = 20.00');
  });

  it('fails soft when the radius exceeds a side', () => {
    expect(renderRoundedCornerLot(120, 60, 80)).not.toContain('90°');
  });
});

describe('renderHeightRelations', () => {
  it('labels terrain/geoid/ellipsoid, the h/H/N segments and h = H + N', () => {
    const svg = renderHeightRelations(150, 190, 40);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Terrain');
    expect(svg).toContain('Geoid');
    expect(svg).toContain('Ellipsoid');
    expect(svg).toContain('h = H + N');
  });

  it('reaches through the dispatcher with literal values (static question)', () => {
    const svg = buildDiagramFromSpec(
      { type: 'heightRelations', orthoH: 150, ellipH: 190, geoidN: 40 },
      {},
    ) || '';
    expect(svg).toContain('h = H + N');
  });
});

describe('renderTiltedPhoto', () => {
  it('labels the plumb line, optical axis, tilted photo and principal line', () => {
    const svg = renderTiltedPhoto(18);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Plumb line');
    expect(svg).toContain('Optical axis');
    expect(svg).toContain('Tilted photo');
    expect(svg).toContain('Principal line');
  });

  it('reaches through the dispatcher with a literal tilt', () => {
    expect(buildDiagramFromSpec({ type: 'tiltedPhoto', tilt: 18 }, {}) || '').toContain('Tilted photo');
  });
});

describe('renderContourMap', () => {
  const svg = renderContourMap(1000, 100, 1875); // interval 100, index at 1000 & 1500, highest = 1800

  it('renders contour paths', () => {
    expect(svg).toContain('<svg');
    expect((svg.match(/<path /g) || []).length).toBeGreaterThan(3);
  });

  it('labels the two lowest index contours (1,000 and 1,500) but not the peak', () => {
    expect(svg).toContain('>1,000<');
    expect(svg).toContain('>1,500<');
    expect(svg).not.toContain('>1,800<'); // student must deduce the highest contour
  });

  it('reaches through the dispatcher with var refs', () => {
    const s = buildDiagramFromSpec(
      { type: 'contour', baseElevVar: 'b', intervalVar: 'i', peakElevVar: 'p' },
      { b: 1000, i: 100, p: 1875 },
    ) || '';
    expect(s).toContain('>1,500<');
  });

  it('returns null on invalid inputs (peak ≤ base)', () => {
    expect(buildDiagramFromSpec({ type: 'contour', baseElev: 1000, interval: 100, peakElev: 900 }, {})).toBeNull();
  });
});
