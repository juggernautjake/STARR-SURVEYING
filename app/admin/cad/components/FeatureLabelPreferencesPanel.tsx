'use client';
// app/admin/cad/components/FeatureLabelPreferencesPanel.tsx
// Per-feature label visibility/style overrides panel.
// Accessed via right-click → "Edit Label Preferences…"

import { X, Eye, EyeOff, RotateCcw, Tag } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import type { TextLabel } from '@/lib/cad/types';
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

  function resetPositions() {
    for (const l of labels) {
      if (l.userPositioned) {
        store.updateTextLabel(featureId, l.id, { userPositioned: false });
      }
    }
  }

  const layer = store.document.layers[feature.layerId];

  return (
    <div className="absolute right-0 top-0 z-40 bg-gray-800 border border-gray-600 rounded-l-lg shadow-2xl overflow-hidden flex flex-col"
      style={{ width: 280, maxHeight: 'calc(100vh - 120px)' }}
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
            {labels.map((label) => (
              <div key={label.id}
                className="flex items-center justify-between gap-2 py-1 border-b border-gray-750 last:border-b-0"
                style={{ borderColor: '#2d3545' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-gray-300 truncate">
                    {KIND_LABEL[label.kind] ?? label.kind}
                  </div>
                  <div className="text-[9px] text-gray-500 truncate font-mono">{label.text}</div>
                  {label.userPositioned && (
                    <div className="text-[8px] text-yellow-500">repositioned</div>
                  )}
                </div>
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
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      {!noLabels && (
        <div className="border-t border-gray-700 px-3 py-2 shrink-0 space-y-1.5" style={{ background: '#1a1f2e' }}>
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
          {labels.some((l) => l.userPositioned) && (
            <button
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-[10px] rounded border border-gray-600 transition-colors"
              onClick={resetPositions}
            >
              <RotateCcw size={10} /> Reset Label Positions
            </button>
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
