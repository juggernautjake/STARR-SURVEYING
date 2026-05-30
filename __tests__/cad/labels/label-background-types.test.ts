// __tests__/cad/labels/label-background-types.test.ts
//
// Slice 232 of cad-label-backgrounds-and-textured-fills-2026-05-30.md.
// Locks the schema-level wiring of the opt-in label background
// highlight: TextLabelStyle gains a `borderWidth` slot alongside the
// existing `backgroundColor` / `borderColor` / `padding` triple, and
// AreaAnnotation re-uses the TextAnnotation background shape
// (backgroundColor / borderVisible / borderColor / padding). Defaults
// stay null / false so existing drawings keep their current bare-text
// look until the surveyor opts in.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_TEXT_LABEL_STYLE } from '@/lib/cad/constants';
import {
  createAreaAnnotation,
  createAreaLabelForFeature,
  DEFAULT_AREA_LABEL_CONFIG,
} from '@/lib/cad/labels/area-label';
import type { Feature } from '@/lib/cad/types';

const TYPES_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'types.ts'),
  'utf8',
);

const ANN_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'labels', 'annotation-types.ts'),
  'utf8',
);

describe('Slice 232 — TextLabelStyle borderWidth + background defaults', () => {
  it('TextLabelStyle declares borderWidth: number | null', () => {
    expect(TYPES_SRC).toMatch(/borderWidth: number \| null;/);
  });

  it('DEFAULT_TEXT_LABEL_STYLE keeps backgroundColor null so existing drawings stay bare', () => {
    expect(DEFAULT_TEXT_LABEL_STYLE.backgroundColor).toBeNull();
  });

  it('DEFAULT_TEXT_LABEL_STYLE seeds borderWidth as null (no stroke until opt-in)', () => {
    expect(DEFAULT_TEXT_LABEL_STYLE).toHaveProperty('borderWidth');
    expect(DEFAULT_TEXT_LABEL_STYLE.borderWidth).toBeNull();
  });

  it('DEFAULT_TEXT_LABEL_STYLE keeps borderColor null + padding 2 px', () => {
    expect(DEFAULT_TEXT_LABEL_STYLE.borderColor).toBeNull();
    expect(DEFAULT_TEXT_LABEL_STYLE.padding).toBe(2);
  });
});

describe('Slice 232 — AreaAnnotation gains the TextAnnotation background shape', () => {
  it('source declares backgroundColor / borderVisible / borderColor / padding inside AreaAnnotation', () => {
    expect(ANN_SRC).toMatch(
      /export interface AreaAnnotation extends AnnotationBase \{[\s\S]*?backgroundColor: string \| null;[\s\S]*?borderVisible: boolean;[\s\S]*?borderColor: string;[\s\S]*?padding: number;[\s\S]*?\}/,
    );
  });
});

describe('Slice 232 — createAreaAnnotation seeds the background fields off-by-default', () => {
  it('emits backgroundColor null + borderVisible false + padding 2', () => {
    const ann = createAreaAnnotation(
      'feat-1',
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      DEFAULT_AREA_LABEL_CONFIG,
    );
    expect(ann.backgroundColor).toBeNull();
    expect(ann.borderVisible).toBe(false);
    expect(ann.borderColor).toBe('#000000');
    expect(ann.padding).toBe(2);
  });
});

describe('Slice 232 — createAreaLabelForFeature seeds the background fields off-by-default', () => {
  it('emits backgroundColor null + borderVisible false + padding 2 for a square POLYGON', () => {
    const feature: Feature = {
      id: 'feat-square',
      type: 'POLYGON',
      layerId: 'BOUNDARY',
      geometry: {
        type: 'POLYGON',
        vertices: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 50 },
          { x: 0, y: 50 },
        ],
      },
      style: { color: '#000000', lineWeight: 1, opacity: 1 },
      visible: true,
      locked: false,
      selected: false,
      properties: {},
    } as unknown as Feature;
    const ann = createAreaLabelForFeature(feature);
    expect(ann).not.toBeNull();
    expect(ann!.backgroundColor).toBeNull();
    expect(ann!.borderVisible).toBe(false);
    expect(ann!.borderColor).toBe('#000000');
    expect(ann!.padding).toBe(2);
  });
});

describe('Slice 232 — TextLabelStyle accepts the opt-in shape end-to-end', () => {
  it('a surveyor-opted style with background fill + border passes the type', () => {
    const opted: typeof DEFAULT_TEXT_LABEL_STYLE = {
      ...DEFAULT_TEXT_LABEL_STYLE,
      backgroundColor: '#ffffff',
      borderColor: '#444444',
      borderWidth: 1,
      padding: 4,
    };
    expect(opted.backgroundColor).toBe('#ffffff');
    expect(opted.borderWidth).toBe(1);
    expect(opted.padding).toBe(4);
  });
});
