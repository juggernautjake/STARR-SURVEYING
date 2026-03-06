'use client';
// app/admin/cad/components/FeatureLabelPreferencesPanel.tsx
// Per-feature label visibility/style overrides panel.
// Accessed via right-click → "Edit Label Preferences…"

import { X, Eye, EyeOff, RotateCcw, Tag } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import type { TextLabel } from '@/lib/cad/types';
import { generateLabelsForFeature } from '@/lib/cad/labels';
import Tooltip from './Tooltip';

interface Props {
  featureId: string;
  open: boolean;
  onClose: () => void;
}

const KIND_LABEL: Record<string, string> = {
  BEARING: 'Bearing',
  DISTANCE: 'Distance',
  AREA: 'Area',
  PERIMETER: 'Perimeter',
  POINT_NAME: 'Point Name',
  POINT_DESCRIPTION: 'Description',
  POINT_ELEVATION: 'Elevation',
  POINT_COORDINATES: 'Coordinates',
  LINE_LENGTH: 'Line Length',
  CUSTOM: 'Custom',
};

export default function FeatureLabelPreferencesPanel({ featureId, open, onClose }: Props) {
  const store = useDrawingStore();
  const feature = store.getFeature(featureId);

  if (!open || !feature) return null;

  const labels: TextLabel[] = feature.textLabels ?? [];
  const noLabels = labels.length === 0;

  // ── Visibility helpers ────────────────────────────────────────────────────

  function toggleLabel(labelId: string, visible: boolean) {
    store.updateTextLabel(featureId, labelId, { visible });
  }

  function showAll() {
    for (const l of labels) {
      if (!l.visible) store.updateTextLabel(featureId, l.id, { visible: true });
    }
  }

  function hideAll() {
    for (const l of labels) {
      if (l.visible) store.updateTextLabel(featureId, l.id, { visible: false });
    }
  }

  // ── Label regeneration helper ─────────────────────────────────────────────
  // Re-runs generateLabelsForFeature so position-reset labels get fresh
  // default offsets from the current layer display preferences.

  function regenerateLabels() {
    const f = store.getFeature(featureId);
    if (!f) return;
    const layer = store.document.layers[f.layerId];
    if (!layer) return;
    const newLabels = generateLabelsForFeature(f, layer, store.document.settings.displayPreferences);
    store.setFeatureTextLabels(featureId, newLabels);
  }

  // ── Per-label reset helpers ───────────────────────────────────────────────

  function resetLabelPosition(labelId: string) {
    store.updateTextLabel(featureId, labelId, { userPositioned: false });
    regenerateLabels();
  }

  function resetLabelRotation(labelId: string) {
    store.updateTextLabel(featureId, labelId, { rotation: null });
  }

  function resetLabelScale(labelId: string) {
    store.updateTextLabel(featureId, labelId, { scale: 1 });
  }

  function resetLabelAll(labelId: string) {
    store.updateTextLabel(featureId, labelId, { userPositioned: false, rotation: null, scale: 1 });
    regenerateLabels();
  }

  // ── Bulk reset helpers ────────────────────────────────────────────────────

  function resetAllPositions() {
    for (const l of labels) {
      if (l.userPositioned) store.updateTextLabel(featureId, l.id, { userPositioned: false });
    }
    regenerateLabels();
  }

  function resetAllRotations() {
    for (const l of labels) {
      if (l.rotation !== null) store.updateTextLabel(featureId, l.id, { rotation: null });
    }
  }

  function resetAllScales() {
    for (const l of labels) {
      if (l.scale !== 1) store.updateTextLabel(featureId, l.id, { scale: 1 });
    }
  }

  function resetAll() {
    for (const l of labels) {
      store.updateTextLabel(featureId, l.id, { userPositioned: false, rotation: null, scale: 1 });
    }
    regenerateLabels();
  }

  // ── Dirty-state helpers ───────────────────────────────────────────────────

  const anyPositioned = labels.some((l) => l.userPositioned);
  const anyRotated    = labels.some((l) => l.rotation !== null);
  const anyScaled     = labels.some((l) => l.scale !== 1);
  const anyModified   = anyPositioned || anyRotated || anyScaled;
  /** How many distinct property types (position / rotation / scale) have bulk overrides. */
  const bulkModCount  = [anyPositioned, anyRotated, anyScaled].filter(Boolean).length;

  const layer = store.document.layers[feature.layerId];

  return (
    <div className="absolute right-0 top-0 z-40 bg-gray-800 border border-gray-600 rounded-l-lg shadow-2xl overflow-hidden flex flex-col"
      style={{ width: 300, maxHeight: 'calc(100vh - 120px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0"
        style={{ background: '#1a1f2e' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {layer && (
            <div className="w-3 h-3 rounded-sm border border-gray-500 shrink-0" style={{ backgroundColor: layer.color }} />
          )}
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-white truncate">{feature.type}</div>
            <div className="text-[9px] text-gray-500">Label Preferences</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors shrink-0"
        >
          <X size={12} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {noLabels ? (
          <div className="px-3 py-4 text-center">
            <Tag size={20} className="text-gray-600 mx-auto mb-2" />
            <p className="text-[10px] text-gray-500 leading-relaxed">
              No labels on this feature yet.
              <br />
              Enable label visibility in the Layer Preferences panel to generate labels.
            </p>
            <button
              className="mt-3 text-[10px] text-blue-400 hover:text-blue-300 underline"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('cad:openLayerPrefs', {
                  detail: { layerId: feature.layerId },
                }));
                onClose();
              }}
            >
              Open Layer Preferences →
            </button>
          </div>
        ) : (
          <div className="px-3 py-2 space-y-1">
            {labels.map((label) => {
              const isPositioned = label.userPositioned;
              const isRotated    = label.rotation !== null;
              const isScaled     = label.scale !== 1;
              const isModified   = isPositioned || isRotated || isScaled;
              return (
                <div key={label.id}
                  className="py-1.5 border-b last:border-b-0"
                  style={{ borderColor: '#2d3545' }}
                >
                  {/* Top row: kind, text, visibility toggle */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-gray-300 truncate">
                        {KIND_LABEL[label.kind] ?? label.kind}
                      </div>
                      <div className="text-[9px] text-gray-500 truncate font-mono">{label.text}</div>
                      {/* Modification badges */}
                      {isModified && (
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {isPositioned && <span className="text-[8px] bg-yellow-900/50 text-yellow-400 border border-yellow-700/50 px-1 rounded">moved</span>}
                          {isRotated    && <span className="text-[8px] bg-purple-900/50 text-purple-400 border border-purple-700/50 px-1 rounded">rotated</span>}
                          {isScaled     && <span className="text-[8px] bg-sky-900/50 text-sky-400 border border-sky-700/50 px-1 rounded">scaled ×{label.scale.toFixed(2)}</span>}
                        </div>
                      )}
                    </div>

                    {/* Eye toggle */}
                    <Tooltip
                      label={label.visible ? 'Hide label' : 'Show label'}
                      description={label.visible ? 'Click to hide this label on the canvas.' : 'Click to show this label on the canvas.'}
                      side="left"
                      delay={400}
                    >
                      <button
                        className={`p-1 rounded transition-colors ${label.visible ? 'text-blue-400 hover:text-blue-300 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-400 hover:bg-gray-700'}`}
                        onClick={() => toggleLabel(label.id, !label.visible)}
                      >
                        {label.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                    </Tooltip>
                  </div>

                  {/* Per-label reset buttons — shown only when at least one property is modified */}
                  {isModified && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {isPositioned && (
                        <Tooltip label="Reset position" description="Restore this label to its default position." side="bottom" delay={400}>
                          <button
                            className="flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-900/40 hover:bg-yellow-800/60 text-yellow-400 text-[9px] rounded border border-yellow-700/40 transition-colors"
                            onClick={() => resetLabelPosition(label.id)}
                          >
                            <RotateCcw size={8} /> Position
                          </button>
                        </Tooltip>
                      )}
                      {isRotated && (
                        <Tooltip label="Reset rotation" description="Restore auto-orientation (align with feature direction)." side="bottom" delay={400}>
                          <button
                            className="flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-900/40 hover:bg-purple-800/60 text-purple-400 text-[9px] rounded border border-purple-700/40 transition-colors"
                            onClick={() => resetLabelRotation(label.id)}
                          >
                            <RotateCcw size={8} /> Rotation
                          </button>
                        </Tooltip>
                      )}
                      {isScaled && (
                        <Tooltip label="Reset scale" description="Restore label to 1× scale." side="bottom" delay={400}>
                          <button
                            className="flex items-center gap-0.5 px-1.5 py-0.5 bg-sky-900/40 hover:bg-sky-800/60 text-sky-400 text-[9px] rounded border border-sky-700/40 transition-colors"
                            onClick={() => resetLabelScale(label.id)}
                          >
                            <RotateCcw size={8} /> Scale
                          </button>
                        </Tooltip>
                      )}
                      {([isPositioned, isRotated, isScaled].filter(Boolean).length > 1) && (
                        <Tooltip label="Reset all" description="Restore position, rotation, and scale to their defaults." side="bottom" delay={400}>
                          <button
                            className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-[9px] rounded border border-gray-600 transition-colors"
                            onClick={() => resetLabelAll(label.id)}
                          >
                            <RotateCcw size={8} /> All
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer actions */}
      {!noLabels && (
        <div className="border-t border-gray-700 px-3 py-2 shrink-0 space-y-1.5" style={{ background: '#1a1f2e' }}>
          {/* Visibility */}
          <div className="flex gap-2">
            <button
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-[10px] rounded border border-gray-600 transition-colors"
              onClick={showAll}
            >
              <Eye size={10} /> Show All
            </button>
            <button
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-[10px] rounded border border-gray-600 transition-colors"
              onClick={hideAll}
            >
              <EyeOff size={10} /> Hide All
            </button>
          </div>

          {/* Bulk resets — only shown when labels have been modified */}
          {anyModified && (
            <div className="space-y-1 pt-0.5">
              <div className="text-[9px] text-gray-600 uppercase tracking-wider font-semibold px-0.5">Reset</div>
              <div className="flex gap-1 flex-wrap">
                {anyPositioned && (
                  <button
                    className="flex items-center gap-0.5 px-2 py-1 bg-yellow-900/40 hover:bg-yellow-800/60 text-yellow-400 text-[9px] rounded border border-yellow-700/40 transition-colors"
                    onClick={resetAllPositions}
                  >
                    <RotateCcw size={8} /> All Positions
                  </button>
                )}
                {anyRotated && (
                  <button
                    className="flex items-center gap-0.5 px-2 py-1 bg-purple-900/40 hover:bg-purple-800/60 text-purple-400 text-[9px] rounded border border-purple-700/40 transition-colors"
                    onClick={resetAllRotations}
                  >
                    <RotateCcw size={8} /> All Rotations
                  </button>
                )}
                {anyScaled && (
                  <button
                    className="flex items-center gap-0.5 px-2 py-1 bg-sky-900/40 hover:bg-sky-800/60 text-sky-400 text-[9px] rounded border border-sky-700/40 transition-colors"
                    onClick={resetAllScales}
                  >
                    <RotateCcw size={8} /> All Scales
                  </button>
                )}
              </div>
              {/* Reset Everything button — shown when more than one property type is modified */}
              {bulkModCount > 1 && (
                <button
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-[10px] rounded border border-gray-600 transition-colors"
                  onClick={resetAll}
                >
                  <RotateCcw size={10} /> Reset Everything (Position + Rotation + Scale)
                </button>
              )}
            </div>
          )}

          <button
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] rounded border border-blue-500 transition-colors"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('cad:openLayerPrefs', {
                detail: { layerId: feature.layerId },
              }));
              onClose();
            }}
          >
            Open Layer Preferences…
          </button>
        </div>
      )}
    </div>
  );
}
