// __tests__/cad/labels/dedup-name-vs-code-description.test.ts
//
// cad-domain-audit Slice O — extend the Slice 6 dedup so any LOWER-
// priority point label (CODE / DESCRIPTION) is suppressed when it
// would render identical text to a HIGHER-priority one. Priority
// order: NAME > CODE > DESCRIPTION. Toggles still work
// independently; turning the higher-priority toggle off un-suppresses
// the lower one again.

import { describe, it, expect } from 'vitest';
import { generateLabelsForFeature } from '@/lib/cad/labels';
import {
  DEFAULT_LAYER_DISPLAY_PREFERENCES,
  DEFAULT_DISPLAY_PREFERENCES,
  DEFAULT_FEATURE_STYLE,
} from '@/lib/cad/constants';
import type { Feature, Layer } from '@/lib/cad/types';

function layerWith(toggles: Partial<{
  showPointNames: boolean;
  showPointCodes: boolean;
  showPointDescriptions: boolean;
}>): Layer {
  return {
    id: 'L', name: 'L', visible: true, locked: false, frozen: false,
    color: '#000', lineWeight: 0.25, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: [],
    displayPreferences: {
      ...DEFAULT_LAYER_DISPLAY_PREFERENCES,
      showPointNames: false,
      showPointCodes: false,
      showPointDescriptions: false,
      ...toggles,
    },
  };
}

function pt(
  name?: string,
  code?: string,
  description?: string,
): Feature {
  const properties: Record<string, string | number | boolean> = {};
  if (name !== undefined) properties.pointName = name;
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

describe('Slice O — NAME suppresses identical CODE / DESCRIPTION', () => {
  it('NAME == CODE → CODE drops, NAME remains', () => {
    const labels = generateLabelsForFeature(
      pt('309', '309', 'inside 315 1in'),
      layerWith({ showPointNames: true, showPointCodes: true, showPointDescriptions: true }),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual([
      'POINT_NAME:309',
      'POINT_DESCRIPTION:inside 315 1in',
    ]);
  });

  it('NAME == DESCRIPTION → DESCRIPTION drops, NAME remains', () => {
    const labels = generateLabelsForFeature(
      pt('IRF', 'BC03', 'irf'),
      layerWith({ showPointNames: true, showPointCodes: true, showPointDescriptions: true }),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual(['POINT_NAME:IRF', 'POINT_CODE:BC03']);
  });

  it('NAME == CODE == DESCRIPTION → only NAME renders', () => {
    const labels = generateLabelsForFeature(
      pt('SAME', 'SAME', 'SAME'),
      layerWith({ showPointNames: true, showPointCodes: true, showPointDescriptions: true }),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual(['POINT_NAME:SAME']);
  });

  it('three genuinely different texts → all three render', () => {
    const labels = generateLabelsForFeature(
      pt('PT1', 'IRF', '1/2 inch iron rod found'),
      layerWith({ showPointNames: true, showPointCodes: true, showPointDescriptions: true }),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual([
      'POINT_NAME:PT1',
      'POINT_CODE:IRF',
      'POINT_DESCRIPTION:1/2 inch iron rod found',
    ]);
  });

  it('NAME toggle OFF un-suppresses the CODE / DESCRIPTION dedup against NAME', () => {
    // When NAME isn't rendered there's nothing to deduplicate
    // against, so CODE + DESCRIPTION fall back to Slice 6's
    // CODE-vs-DESCRIPTION dedup (which keeps CODE here).
    const labels = generateLabelsForFeature(
      pt('309', '309', '309'),
      layerWith({ showPointNames: false, showPointCodes: true, showPointDescriptions: true }),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual(['POINT_CODE:309']);
  });

  it('CODE toggle OFF + NAME == DESCRIPTION → only NAME renders (DESCRIPTION suppressed)', () => {
    const labels = generateLabelsForFeature(
      pt('IRF', undefined, 'IRF'),
      layerWith({ showPointNames: true, showPointCodes: false, showPointDescriptions: true }),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual(['POINT_NAME:IRF']);
  });

  it('case-insensitive trim match still applies (Slice 6 contract preserved)', () => {
    const labels = generateLabelsForFeature(
      pt('IRF', '  IRF  ', '  irf  '),
      layerWith({ showPointNames: true, showPointCodes: true, showPointDescriptions: true }),
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(kinds(labels)).toEqual(['POINT_NAME:IRF']);
  });
});
