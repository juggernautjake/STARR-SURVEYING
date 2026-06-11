// __tests__/cad/points/disambiguate-point-name.test.ts
//
// cad-domain-audit Slice L — shared helper that picks a non-colliding
// point name for new POINT features. Mirrors the TRV importer's
// disambiguation rule (Slice 2): first occurrence keeps the bare
// name; later collisions get `${bare}:K` (smallest free suffix).
// Wired into the AI `addPoint` tool so the AI agent's "create a
// point named X" call can't silently overwrite an existing point.

import { describe, it, expect } from 'vitest';
import {
  disambiguatePointName,
  disambiguatePointNameWithRename,
  isPointNameTaken,
  stampDisambiguatedPointName,
} from '@/lib/cad/points/disambiguate';
import type { DrawingDocument, Feature } from '@/lib/cad/types';

function pointFeat(id: string, name: string): Feature {
  return {
    id, type: 'POINT', geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    layerId: 'L', style: {} as Feature['style'],
    properties: { pointName: name },
  } as Feature;
}

function doc(...features: Feature[]): DrawingDocument {
  const map: Record<string, Feature> = {};
  for (const f of features) map[f.id] = f;
  return { features: map, layers: {}, layerOrder: [] } as unknown as DrawingDocument;
}

describe('disambiguatePointName — pure rule', () => {
  it('passes the requested name through when nothing is taken', () => {
    expect(disambiguatePointName(doc(), 'IRF')).toBe('IRF');
  });

  it('appends `:1` for the first collision', () => {
    expect(disambiguatePointName(doc(pointFeat('p1', 'IRF')), 'IRF')).toBe('IRF:1');
  });

  it('walks up the suffix sequence skipping any already-taken suffix', () => {
    const d = doc(
      pointFeat('p1', 'IRF'),
      pointFeat('p2', 'IRF:1'),
      pointFeat('p3', 'IRF:3'),
    );
    expect(disambiguatePointName(d, 'IRF')).toBe('IRF:2');
  });

  it('trims whitespace before checking + returns the trimmed match', () => {
    const d = doc(pointFeat('p1', 'IRF'));
    expect(disambiguatePointName(d, '  IRF  ')).toBe('IRF:1');
  });

  it('returns "" when the request is empty / whitespace-only', () => {
    expect(disambiguatePointName(doc(pointFeat('p1', 'IRF')), '')).toBe('');
    expect(disambiguatePointName(doc(pointFeat('p1', 'IRF')), '   ')).toBe('');
    expect(disambiguatePointName(doc(pointFeat('p1', 'IRF')), undefined)).toBe('');
  });

  it('ignores non-POINT features when collecting taken names', () => {
    const f: Feature = {
      id: 'l1', type: 'LINE',
      geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      layerId: 'L', style: {} as Feature['style'],
      properties: { pointName: 'IRF' },
    } as Feature;
    expect(disambiguatePointName(doc(f), 'IRF')).toBe('IRF');
  });
});

describe('disambiguatePointNameWithRename — rename flag', () => {
  it('flag is false when no rename is needed', () => {
    expect(disambiguatePointNameWithRename(doc(), 'IRF')).toEqual({ name: 'IRF', renamed: false });
  });
  it('flag is true when a suffix is appended', () => {
    expect(disambiguatePointNameWithRename(doc(pointFeat('p1', 'IRF')), 'IRF'))
      .toEqual({ name: 'IRF:1', renamed: true });
  });
  it('flag is false when the request was empty (no name to rename)', () => {
    expect(disambiguatePointNameWithRename(doc(), '')).toEqual({ name: '', renamed: false });
  });
});

describe('isPointNameTaken', () => {
  it('true for an existing point name', () => {
    expect(isPointNameTaken(doc(pointFeat('p1', 'IRF')), 'IRF')).toBe(true);
  });
  it('false when nothing matches', () => {
    expect(isPointNameTaken(doc(), 'IRF')).toBe(false);
  });
});

describe('stampDisambiguatedPointName — props passthrough', () => {
  it('writes the resolved name under the canonical `pointName` key', () => {
    const d = doc(pointFeat('p1', 'IRF'));
    const props = stampDisambiguatedPointName(d, { pointName: 'IRF', code: 'IRF' });
    expect(props?.pointName).toBe('IRF:1');
    expect(props?.code).toBe('IRF');
  });

  it('accepts legacy aliases (pointNo / pointNumber / name) for the request', () => {
    const d = doc(pointFeat('p1', 'IRF'));
    const a = stampDisambiguatedPointName(d, { pointNo: 'IRF' });
    expect(a?.pointName).toBe('IRF:1');
    const b = stampDisambiguatedPointName(d, { pointNumber: 'IRF' });
    expect(b?.pointName).toBe('IRF:1');
    const c = stampDisambiguatedPointName(d, { name: 'IRF' });
    expect(c?.pointName).toBe('IRF:1');
  });

  it('leaves properties UNCHANGED when no name was requested', () => {
    const props = stampDisambiguatedPointName(doc(), { code: 'IRF' });
    expect(props).toEqual({ code: 'IRF' });
  });

  it('handles an undefined properties argument', () => {
    expect(stampDisambiguatedPointName(doc(), undefined)).toBeUndefined();
  });
});

describe('source-lock — AI tool registry wires the helper into addPoint', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'ai', 'tool-registry.ts'),
    'utf8',
  );
  it('addPoint imports stampDisambiguatedPointName', () => {
    expect(SRC).toMatch(/import \{ stampDisambiguatedPointName \} from '\.\.\/points\/disambiguate'/);
  });
  it('addPoint runs the helper against the live document before building the feature', () => {
    expect(SRC).toMatch(
      /const doc = useDrawingStore\.getState\(\)\.document;[\s\S]*?stampDisambiguatedPointName\(doc, \{[\s\S]*?\}\);/,
    );
  });
});
