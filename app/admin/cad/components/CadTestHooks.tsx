'use client';
// app/admin/cad/components/CadTestHooks.tsx
//
// Test-only helpers for the unauthenticated /cad-harness route. Rendered
// ONLY from app/cad-harness/page.tsx (which 404s unless
// NEXT_PUBLIC_E2E_HARNESS === '1'), so this never ships to the real
// /admin/cad editor.
//
// Driving the CAD canvas from Playwright is unreliable (tool keys are
// chord-prefixed; the WebGL canvas + command bar don't accept synthetic
// pointer/coordinate input deterministically). These window-event hooks let
// a spec deterministically seed + select geometry so selection-dependent
// behaviour (e.g. live Properties-panel style edits) can be verified.
//
//   window.dispatchEvent(new CustomEvent('cad:test:seedLine', {
//     detail: { start: { x: 100, y: 450 }, end: { x: 700, y: 450 } },
//   }))
//   → adds a LINE on the active layer and selects it (REPLACE).

import { useEffect } from 'react';
import { useDrawingStore, useSelectionStore, useUndoStore } from '@/lib/cad/store';
import { useViewportStore } from '@/lib/cad/store/viewport-store';
import { generateId } from '@/lib/cad/types';
import type { Feature, Point2D } from '@/lib/cad/types';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';

export default function CadTestHooks() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_HARNESS !== '1') return;

    // Expose the stores to Playwright so gesture specs can read centerX/Y
    // and zoom directly. Harness-only — guarded by the same env flag.
    (window as unknown as { __cad?: Record<string, unknown> }).__cad = {
      viewportStore: useViewportStore,
      drawingStore: useDrawingStore,
      selectionStore: useSelectionStore,
    };

    const onSeedLine = (e: Event) => {
      const detail = (e as CustomEvent).detail as { start?: Point2D; end?: Point2D } | undefined;
      const start = detail?.start ?? { x: 100, y: 450 };
      const end = detail?.end ?? { x: 700, y: 450 };
      const ds = useDrawingStore.getState();
      const feature: Feature = {
        id: generateId(),
        type: 'LINE',
        geometry: { type: 'LINE', start, end },
        layerId: ds.activeLayerId,
        style: { ...DEFAULT_FEATURE_STYLE, ...ds.getActiveLayerStyle() },
        properties: {},
      };
      ds.addFeature(feature);
      useSelectionStore.getState().select(feature.id, 'REPLACE');
      // Signal completion for the spec to await.
      window.dispatchEvent(new CustomEvent('cad:test:seedLine:done', { detail: { id: feature.id } }));
    };

    // Deterministic undo (cad:test:undo) — Ctrl+Z would hit a focused input.
    const onUndo = () => {
      useUndoStore.getState().undo();
      window.dispatchEvent(new CustomEvent('cad:test:undo:done'));
    };

    window.addEventListener('cad:test:seedLine', onSeedLine);
    window.addEventListener('cad:test:undo', onUndo);
    return () => {
      window.removeEventListener('cad:test:seedLine', onSeedLine);
      window.removeEventListener('cad:test:undo', onUndo);
    };
  }, []);

  return null;
}
