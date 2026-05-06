'use client';
// app/admin/cad/components/BidirectionalSync.tsx
//
// Phase 7 §3.3 — bidirectional element sync. Watches the
// drawing store for per-feature mutations (move, resize,
// grip-edit, attribute change) and, for any feature that
// carries an AI explanation, marks the explanation stale +
// flips the matching review-queue item to MODIFIED.
//
// Detection runs on a Zustand subscription scoped to
// `state.document.features`. We diff the current map against
// the previous reference; any feature whose object identity
// changed is treated as mutated.
//
// This component renders nothing — mounted at the root of
// CADLayout so the side-effect runs across the whole editor
// surface.

import { useEffect, useRef } from 'react';

import { useAIStore, useDrawingStore } from '@/lib/cad/store';
import type { Feature } from '@/lib/cad/types';

export default function BidirectionalSync() {
  const previousFeaturesRef = useRef<Record<string, Feature> | null>(null);

  useEffect(() => {
    // Seed the ref on mount so the first subscribe callback
    // doesn't fire on every existing feature.
    previousFeaturesRef.current = useDrawingStore.getState().document.features;

    const unsubscribe = useDrawingStore.subscribe((state) => {
      const next = state.document.features;
      const prev = previousFeaturesRef.current;
      previousFeaturesRef.current = next;
      if (!prev || prev === next) return;

      const ai = useAIStore.getState();
      const explanations = ai.result?.explanations ?? null;
      const queue = ai.result?.reviewQueue ?? null;
      if (!explanations && !queue) return;

      // Walk the current feature map; flag any feature whose
      // object reference changed since the previous tick.
      for (const id of Object.keys(next)) {
        const current = next[id];
        const previous = prev[id];
        // Skip new features (no prior entry; AI never produced
        // an explanation for them) and unchanged refs.
        if (!previous || previous === current) continue;
        // Skip when geometry + properties + style are
        // structurally identical (e.g. layerId-only renames
        // already write through the same path) — cheap fast
        // path that catches the most common no-op write.
        if (
          previous.geometry === current.geometry &&
          previous.properties === current.properties &&
          previous.style === current.style &&
          previous.layerId === current.layerId
        ) {
          continue;
        }
        if (explanations && explanations[id]) {
          ai.markExplanationStale(id);
        }
        if (queue) flipReviewItemForFeature(queue, id);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return null;
}

function flipReviewItemForFeature(
  queue: NonNullable<
    ReturnType<typeof useAIStore.getState>['result']
  >['reviewQueue'],
  featureId: string
): void {
  for (const tier of [5, 4, 3, 2, 1] as const) {
    const item = queue.tiers[tier].find((it) => it.featureId === featureId);
    if (!item) continue;
    // Don't downgrade explicit user decisions — REJECTED stays
    // REJECTED. ACCEPTED → MODIFIED because the geometry
    // diverged from what was accepted; PENDING flips to
    // MODIFIED so the row visually moves out of "untouched".
    if (item.status === 'REJECTED') return;
    useAIStore
      .getState()
      .setItemStatus(item.id, 'MODIFIED', item.userNote ?? null);
    return;
  }
}
