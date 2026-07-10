// __tests__/lib/survey-diagram.test.ts
//
// The diagram generator must (a) turn a stored spec + the freshly-generated
// vars into an <svg> whose labels match those numbers, and (b) fail SOFT
// (null / empty frame) rather than throw, so a bad figure never breaks a quiz.

import { describe, it, expect } from 'vitest';
import { buildDiagramFromSpec, renderTowerTwoAngles } from '@/lib/diagrams/survey-diagram';

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
