// __tests__/cad/labels/dedup-identical-code-description.test.ts
//
// cad-ux-cleanup-pass Slice 6 — when POINT_CODE and POINT_DESCRIPTION
// would render the same text (the common TRV import case where both
// `properties.code` and `properties.description` are seeded from the
// same source string), suppress the duplicate POINT_DESCRIPTION label.
// Toggles remain independent: points where the two truly differ keep
// both labels, and turning off either toggle keeps the other untouched.

import { describe, it, expect } from 'vitest';
import { generateLabelsForFeature } from '@/lib/cad/labels';
import {
  DEFAULT_LAYER_DISPLAY_PREFERENCES,
  DEFAULT_DISPLAY_PREFERENCES,
  DEFAULT_FEATURE_STYLE,
} from '@/lib/cad/constants';
import type { Feature, Layer } from '@/lib/cad/types';

function pointLayer(showCodes: boolean, showDescriptions: boolean): Layer {
  return {
    id: 'L', name: 'L', visible: true, locked: false, frozen: false,
    color: '#000', lineWeight: 0.25, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: [],
    displayPreferences: {
      ...DEFAULT_LAYER_DISPLAY_PREFERENCES,
      showPointNames: false,
      showPointCodes: showCodes,
      showPointDescriptions: showDescriptions,
    },
  };
}

function pointWith(code: string | undefined, description: string | undefined): Feature {
  const properties: Record<string, string | number | boolean> = {};
  if (code !== undefined) properties.code = code;
  if (description !== undefined) properties.description = description;
  return {
    id: 'p',
    type: 'POINT',
    geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    layerId: 'L',
    style: { ...DEFAULT_FEATURE_STYLE },
    properties,
  };
}

const kinds = (labels: ReturnType<typeof generateLabelsForFeature>) =>
  labels.map((l) => `${l.kind}:${l.text}`);

describe('Slice 6 — dedup POINT_CODE / POINT_DESCRIPTION when identical', () => {
  it('TRV case: both seeded from the same source → only POINT_CODE renders', () => {
    const labels = generateLabelsForFeature(
      pointWith('309 inside 315 1in', '309 inside 315 1in'),
      pointLayer(true, true),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual(['POINT_CODE:309 inside 315 1in']);
  });

  it('case-insensitive trim match → still deduped', () => {
    const labels = generateLabelsForFeature(
      pointWith('IRF', '  irf '),
      pointLayer(true, true),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual(['POINT_CODE:IRF']);
  });

  it('genuinely different code + description → both render', () => {
    const labels = generateLabelsForFeature(
      pointWith('IRF', '1/2 inch iron rod found'),
      pointLayer(true, true),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual([
      'POINT_CODE:IRF',
      'POINT_DESCRIPTION:1/2 inch iron rod found',
    ]);
  });

  it('only DESCRIPTION toggle on → description still renders even when it would dup the code', () => {
    const labels = generateLabelsForFeature(
      pointWith('SAME', 'SAME'),
      pointLayer(false, true),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual(['POINT_DESCRIPTION:SAME']);
  });

  it('only CODE toggle on → code renders alone', () => {
    const labels = generateLabelsForFeature(
      pointWith('SAME', 'SAME'),
      pointLayer(true, false),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual(['POINT_CODE:SAME']);
  });

  it('point with description only (no code prop) still renders the description', () => {
    const labels = generateLabelsForFeature(
      pointWith(undefined, 'manhole'),
      pointLayer(true, true),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual(['POINT_DESCRIPTION:manhole']);
  });
});
