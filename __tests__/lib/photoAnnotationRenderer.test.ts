// __tests__/lib/photoAnnotationRenderer.test.ts
//
// Coverage for the photo-annotation pure helpers. The mobile and web
// renderers both call these to convert a stored annotation JSON blob
// into SVG paths — the algorithm has to match exactly, so pinning the
// stroke-to-path arithmetic prevents drift between platforms.

import { describe, it, expect } from 'vitest';
import {
  parseAnnotations,
  strokeToPath,
  strokeWidthPx,
  type PenStroke,
} from '@/lib/photoAnnotationRenderer';

describe('parseAnnotations', () => {
  it('returns null for null/undefined/empty input', () => {
    expect(parseAnnotations(null)).toBeNull();
    expect(parseAnnotations(undefined)).toBeNull();
    expect(parseAnnotations('')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseAnnotations('{ this is not json')).toBeNull();
  });

  it('returns null when items is missing', () => {
    expect(parseAnnotations(JSON.stringify({ version: 1 }))).toBeNull();
  });

  it('returns null when items is not an array', () => {
    expect(parseAnnotations(JSON.stringify({ items: 'oops' }))).toBeNull();
  });

  it('parses a valid empty items array', () => {
    const out = parseAnnotations(JSON.stringify({ items: [] }));
    expect(out).toEqual({ items: [] });
  });

  it('parses a document with a stroke', () => {
    const doc = {
      items: [
        { type: 'pen', color: '#000', width: 0.01, points: [{ x: 0.1, y: 0.2 }] },
      ],
    };
    expect(parseAnnotations(JSON.stringify(doc))).toEqual(doc);
  });
});

describe('strokeToPath', () => {
  it('returns empty string for an empty points list', () => {
    const empty: PenStroke = { type: 'pen', color: '#000', width: 0.01, points: [] };
    expect(strokeToPath(empty, 100, 200)).toBe('');
  });

  it('emits a Move at the first point and Lines for the rest', () => {
    // Three points → "M..L..L.."
    const s: PenStroke = {
      type: 'pen',
      color: '#000',
      width: 0.01,
      points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }],
    };
    expect(strokeToPath(s, 100, 200)).toBe('M0.00,0.00 L50.00,100.00 L100.00,200.00');
  });

  it('scales x by width and y by height (rect not square)', () => {
    const s: PenStroke = {
      type: 'pen', color: '#000', width: 0.01,
      points: [{ x: 0.25, y: 0.5 }],
    };
    expect(strokeToPath(s, 800, 400)).toBe('M200.00,200.00');
  });

  it('uses 2-decimal precision (no floating-point trail)', () => {
    const s: PenStroke = {
      type: 'pen', color: '#000', width: 0.01,
      points: [{ x: 0.123456, y: 0.987654 }],
    };
    expect(strokeToPath(s, 100, 100)).toBe('M12.35,98.77');
  });
});

describe('strokeWidthPx', () => {
  it('scales to the shorter edge (landscape image)', () => {
    expect(strokeWidthPx(0.01, 1600, 900)).toBe(9);
  });

  it('scales to the shorter edge (portrait image)', () => {
    expect(strokeWidthPx(0.01, 900, 1600)).toBe(9);
  });

  it('rounds to integer pixels', () => {
    // 0.0123 × 1000 = 12.3 → 12
    expect(strokeWidthPx(0.0123, 1000, 1000)).toBe(12);
  });

  it('floors very thin strokes to 1 px (minimum visible)', () => {
    expect(strokeWidthPx(0.0001, 100, 100)).toBe(1);
  });
});
