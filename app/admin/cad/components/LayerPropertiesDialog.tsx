'use client';
// app/admin/cad/components/LayerPropertiesDialog.tsx
//
// C6 of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// The layer properties a surveyor could not reach.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// The C5 audit found the layer MODEL is in good shape — 19 fields, matching AutoCAD's Layer
// Properties Manager on nine of ten columns — while every `updateLayer()` call in the whole CAD
// surface wrote one of five: `visible`, `locked`, `name`, `color`, `rotationDeg`.
//
// The rest were set once at layer creation and never again. `lineWeight` was hard-coded to 0.75 and
// `lineTypeId` to `'SOLID'` in `LayerPanel`'s create handler, which means **every layer in every
// drawing this product has ever made is 0.75 solid**. A layer could not be dashed — and dashed is
// how a boundary is distinguished from an easement on a plat. Nothing was broken; a form was
// missing over a model that already supported all of it, and the renderer already honoured.
//
// ── WHY `frozen` IS HERE AND NOT JUST ANOTHER EYE ICON ──────────────────────────────────────────
//
// `frozen` is not a second `visible`. `canFeatureBeRendered` excludes a frozen layer from SNAP and
// SELECTION as well as from drawing, which is precisely what a surveyor wants from a busy
// reference layer they need on screen but never want to click. The store, the predicates and the
// render path all honoured it already; only the UI was silent, so the product shipped the weaker
// half of a distinction it had gone to the trouble of modelling.
//
// It is labelled by what it does rather than by its field name, because "frozen" means nothing to
// someone who has not read the render code.

import React, { useEffect, useState } from 'react';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';
import { useDrawingStore } from '@/lib/cad/store';
import { BUILTIN_LINE_TYPES } from '@/lib/cad/styles/linetype-library';
import type { Layer } from '@/lib/cad/types';

export interface LayerPropertiesDialogProps {
  /** The layer being edited, or null when the dialog is closed. */
  layerId: string | null;
  onClose: () => void;
}

/** Lineweights offered, in millimetres. The ISO set AutoCAD ships, trimmed to what a plat uses —
 *  a 45-entry dropdown is a worse answer than a short one for a value nobody tunes finely. */
const LINE_WEIGHTS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 0.75, 1.0, 1.4, 2.0];

export default function LayerPropertiesDialog({ layerId, onClose }: LayerPropertiesDialogProps) {
  const layer = useDrawingStore((s) => (layerId ? s.document.layers[layerId] : undefined));

  // Local draft so a half-typed description does not write on every keystroke. Committed on change
  // for the selects/toggles (which are discrete) and on blur for the free text.
  const [description, setDescription] = useState('');
  useEffect(() => { setDescription(layer?.description ?? ''); }, [layer?.id, layer?.description]);

  if (!layerId || !layer) return null;

  const patch = (p: Partial<Layer>) => {
    useDrawingStore.getState().updateLayer(layerId, p);
  };

  return (
    <ModalFrame
      open
      title={`Layer properties — ${layer.name}`}
      onClose={onClose}
      initialWidth={420}
      initialHeight={470}
      minWidth={320}
      minHeight={320}
    >
      <div className="flex flex-col gap-3 p-3 text-xs text-gray-200">

        <label className="flex flex-col gap-1">
          <span className="text-gray-400 uppercase tracking-wide text-[10px]">Line type</span>
          <select
            className="bg-gray-800 border border-gray-600 rounded px-2 h-8 text-gray-100"
            value={layer.lineTypeId}
            onChange={(e) => patch({ lineTypeId: e.target.value })}
          >
            {BUILTIN_LINE_TYPES.map((lt) => (
              <option key={lt.id} value={lt.id}>{lt.name}</option>
            ))}
          </select>
          <span className="text-gray-500 text-[10px]">
            Every layer was created SOLID and could not be changed until now.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-gray-400 uppercase tracking-wide text-[10px]">Line weight (mm)</span>
          <select
            className="bg-gray-800 border border-gray-600 rounded px-2 h-8 text-gray-100"
            value={String(layer.lineWeight)}
            onChange={(e) => patch({ lineWeight: Number(e.target.value) })}
          >
            {/* A layer whose stored weight is not one of the offered steps keeps its own value as an
                extra option, rather than being silently snapped to the nearest one on open. */}
            {(LINE_WEIGHTS.includes(layer.lineWeight)
              ? LINE_WEIGHTS
              : [...LINE_WEIGHTS, layer.lineWeight].sort((a, b) => a - b)
            ).map((w) => (
              <option key={w} value={String(w)}>{w.toFixed(2)} mm</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-gray-400 uppercase tracking-wide text-[10px]">
            Opacity — {Math.round((layer.opacity ?? 1) * 100)}%
          </span>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={Math.round((layer.opacity ?? 1) * 100)}
            onChange={(e) => patch({ opacity: Number(e.target.value) / 100 })}
            aria-label="Layer opacity"
          />
          <span className="text-gray-500 text-[10px]">
            Floor of 10% on purpose: a 0% layer is invisible but still snaps, which reads as a bug.
            Use the eye to hide it.
          </span>
        </label>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={layer.frozen}
            onChange={(e) => patch({ frozen: e.target.checked })}
          />
          <span className="flex flex-col">
            <span className="text-gray-200">Freeze — hide, and ignore for snap and selection</span>
            <span className="text-gray-500 text-[10px]">
              Stronger than the eye. Hiding a layer only stops it drawing; freezing also stops it
              being snapped to or picked, which is what you want for a busy reference layer.
            </span>
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-gray-400 uppercase tracking-wide text-[10px]">Description</span>
          <input
            type="text"
            className="bg-gray-800 border border-gray-600 rounded px-2 h-8 text-gray-100"
            value={description}
            placeholder="What this layer is for"
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              const next = description.trim();
              if (next !== (layer.description ?? '')) patch({ description: next || undefined });
            }}
          />
        </label>

      </div>
    </ModalFrame>
  );
}
