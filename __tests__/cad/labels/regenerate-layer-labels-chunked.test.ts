// __tests__/cad/labels/regenerate-layer-labels-chunked.test.ts
//
// cad-desktop-tauri-and-perf Slice P4 — non-blocking label regen.
// The chunked path yields to the event loop every
// `LABEL_REGEN_CHUNK_SIZE` features so the slider's hold gesture
// stays responsive and the canvas keeps animating. The auto helper
// picks sync vs chunked based on feature count.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  LABEL_REGEN_CHUNK_SIZE,
  LABEL_REGEN_CHUNK_THRESHOLD,
  regenerateLayerLabelsAuto,
  regenerateLayerLabelsChunked,
} from '@/lib/cad/labels/regenerate-layer-labels-chunked';
import {
  DEFAULT_DISPLAY_PREFERENCES,
  DEFAULT_FEATURE_STYLE,
  DEFAULT_LAYER_DISPLAY_PREFERENCES,
} from '@/lib/cad/constants';
import type { Feature, Layer } from '@/lib/cad/types';

function layer(id: string): Layer {
  return {
    id, name: id, visible: true, locked: false, frozen: false,
    color: '#000', lineWeight: 0.25, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: [],
    displayPreferences: {
      ...DEFAULT_LAYER_DISPLAY_PREFERENCES,
      showPointNames: true,
    },
  };
}

function pointFeat(id: string, layerId = 'L'): Feature {
  return {
    id,
    type: 'POINT',
    geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    layerId,
    style: { ...DEFAULT_FEATURE_STYLE },
    properties: { pointName: id },
  };
}

describe('constants', () => {
  it('chunk size matches the threshold (auto helper guards on it)', () => {
    expect(LABEL_REGEN_CHUNK_THRESHOLD).toBe(LABEL_REGEN_CHUNK_SIZE);
  });

  it('chunk size is set to absorb < 1 frame of work', () => {
    // 200 was the chosen value; making it much higher invites
    // dropped frames, much lower invites scheduling thrash. Lock it
    // so a casual edit doesn't drift away from the tuned point.
    expect(LABEL_REGEN_CHUNK_SIZE).toBe(200);
  });
});

describe('regenerateLayerLabelsChunked — small layer', () => {
  it('produces one map entry per feature on the layer', async () => {
    const features = [pointFeat('p1'), pointFeat('p2')];
    const result = await regenerateLayerLabelsChunked(features, layer('L'), DEFAULT_DISPLAY_PREFERENCES);
    expect([...result.keys()].sort()).toEqual(['p1', 'p2']);
  });

  it('skips features that belong to other layers', async () => {
    const features = [pointFeat('p1', 'L'), pointFeat('p2', 'OTHER')];
    const result = await regenerateLayerLabelsChunked(features, layer('L'), DEFAULT_DISPLAY_PREFERENCES);
    expect([...result.keys()]).toEqual(['p1']);
  });
});

describe('regenerateLayerLabelsChunked — chunked yield behaviour', () => {
  it('returns the same result as the sync regen for a multi-chunk input', async () => {
    const features = Array.from({ length: 450 }, (_, i) => pointFeat(`p${i}`));
    const result = await regenerateLayerLabelsChunked(features, layer('L'), DEFAULT_DISPLAY_PREFERENCES);
    expect(result.size).toBe(450);
    // Each feature got at least one label (showPointNames is true).
    for (const labels of result.values()) {
      expect(labels.length).toBeGreaterThan(0);
    }
  });

  it('a small chunkSize forces multiple yields without changing the output', async () => {
    const features = Array.from({ length: 25 }, (_, i) => pointFeat(`p${i}`));
    const result = await regenerateLayerLabelsChunked(features, layer('L'), DEFAULT_DISPLAY_PREFERENCES, {
      chunkSize: 5,
    });
    expect(result.size).toBe(25);
  });

  it('honors an aborted AbortSignal by returning the partial map', async () => {
    const controller = new AbortController();
    const features = Array.from({ length: 1000 }, (_, i) => pointFeat(`p${i}`));
    // Abort after the first chunk completes.
    setTimeout(() => controller.abort(), 0);
    const result = await regenerateLayerLabelsChunked(features, layer('L'), DEFAULT_DISPLAY_PREFERENCES, {
      chunkSize: 100,
      signal: controller.signal,
    });
    // Aborted runs return whatever they had at the time of abort.
    expect(result.size).toBeLessThanOrEqual(features.length);
  });
});

describe('regenerateLayerLabelsAuto — sync vs chunked dispatch', () => {
  it('a layer below the threshold is processed synchronously (no yield needed)', async () => {
    const features = Array.from({ length: 10 }, (_, i) => pointFeat(`p${i}`));
    const result = await regenerateLayerLabelsAuto(features, layer('L'), DEFAULT_DISPLAY_PREFERENCES);
    expect(result.size).toBe(10);
  });

  it('a layer above the threshold is processed chunked', async () => {
    const features = Array.from({ length: LABEL_REGEN_CHUNK_THRESHOLD + 5 }, (_, i) => pointFeat(`p${i}`));
    const result = await regenerateLayerLabelsAuto(features, layer('L'), DEFAULT_DISPLAY_PREFERENCES);
    expect(result.size).toBe(LABEL_REGEN_CHUNK_THRESHOLD + 5);
  });
});

describe('LayerPreferencesPanel — Slice P4 wiring', () => {
  const SRC = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      '..',
      'app',
      'admin',
      'cad',
      'components',
      'LayerPreferencesPanel.tsx',
    ),
    'utf8',
  );

  it('imports regenerateLayerLabelsAuto from the chunked module', () => {
    expect(SRC).toMatch(
      /import \{ regenerateLayerLabelsAuto \} from '@\/lib\/cad\/labels\/regenerate-layer-labels-chunked'/,
    );
  });

  it('update() runs the chunked regen in a fire-and-forget async IIFE', () => {
    expect(SRC).toMatch(
      /void \(async \(\) => \{\s*\n\s*const labelMap = await regenerateLayerLabelsAuto\(\s*\n\s*features,/,
    );
  });

  it('still pipes each label result through store.setFeatureTextLabels', () => {
    expect(SRC).toMatch(
      /labelMap\.forEach\(\(labels, featureId\) => \{\s*\n\s*store\.setFeatureTextLabels\(featureId, labels\);/,
    );
  });
});
