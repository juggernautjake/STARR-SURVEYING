// app/admin/research/components/DrawingViewToolbar.tsx — Quick-access toolbar for drawing view
'use client';

import type { ViewMode } from '@/types/research';
import type { DrawingPreferences } from './DrawingPreferencesPanel';

interface DrawingViewToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  preferences: DrawingPreferences;
  onPreferencesChange: (prefs: DrawingPreferences) => void;
  onOpenSettings: () => void;
  onExportSvg: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  elementCount: number;
  visibleCount: number;
  overallConfidence: number | null;
}

const VIEW_MODES: { key: ViewMode; label: string; icon: string }[] = [
  { key: 'standard', label: 'Standard', icon: 'S' },
  { key: 'feature', label: 'Feature', icon: 'F' },
  { key: 'confidence', label: 'Confidence', icon: 'C' },
  { key: 'discrepancy', label: 'Issues', icon: '!' },
];

const QUICK_LAYERS = [
  { key: 'boundary', label: 'Boundary' },
  { key: 'monuments', label: 'Monuments' },
  { key: 'labels', label: 'Labels' },
  { key: 'easements', label: 'Easements' },
];

export default function DrawingViewToolbar({
  viewMode,
  onViewModeChange,
  preferences,
  onPreferencesChange,
  onOpenSettings,
  onExportSvg,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  elementCount,
  visibleCount,
  overallConfidence,
}: DrawingViewToolbarProps) {
  function toggleLayer(layer: string) {
    const updated = { ...preferences.layers, [layer]: !preferences.layers[layer] };
    onPreferencesChange({ ...preferences, layers: updated });
  }

  return (
    <div className="research-toolbar">
      {/* View mode selector */}
      <div className="research-toolbar__group">
        <span className="research-toolbar__group-label">View</span>
        <div className="research-toolbar__btn-group">
          {VIEW_MODES.map(mode => (
            <button
              key={mode.key}
              className={`research-toolbar__mode-btn ${viewMode === mode.key ? 'research-toolbar__mode-btn--active' : ''}`}
              onClick={() => onViewModeChange(mode.key)}
              title={mode.label}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Layer quick toggles */}
      <div className="research-toolbar__group">
        <span className="research-toolbar__group-label">Layers</span>
        <div className="research-toolbar__btn-group">
          {QUICK_LAYERS.map(layer => (
            <button
              key={layer.key}
              className={`research-toolbar__layer-btn ${preferences.layers[layer.key] ? 'research-toolbar__layer-btn--active' : ''}`}
              onClick={() => toggleLayer(layer.key)}
              title={`Toggle ${layer.label}`}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="research-toolbar__group">
        <span className="research-toolbar__group-label">Zoom</span>
        <div className="research-toolbar__btn-group">
          <button className="research-toolbar__icon-btn" onClick={onZoomOut} title="Zoom Out">-</button>
          <span className="research-toolbar__zoom-value">{Math.round(zoom * 100)}%</span>
          <button className="research-toolbar__icon-btn" onClick={onZoomIn} title="Zoom In">+</button>
          <button className="research-toolbar__icon-btn research-toolbar__icon-btn--text" onClick={onZoomReset} title="Reset View">Fit</button>
        </div>
      </div>

      {/* Stats */}
      <div className="research-toolbar__group research-toolbar__group--stats">
        <span className="research-toolbar__stat">
          {visibleCount}/{elementCount} elements
        </span>
        {overallConfidence !== null && (
          <span className="research-toolbar__stat">
            {Math.round(overallConfidence)}% conf.
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="research-toolbar__group">
        <button className="research-toolbar__action-btn" onClick={onOpenSettings} title="Drawing Preferences">
          Settings
        </button>
        <button className="research-toolbar__action-btn" onClick={onExportSvg} title="Export as SVG">
          Export
        </button>
      </div>
    </div>
  );
}
