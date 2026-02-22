// app/admin/research/components/DrawingViewToolbar.tsx — Quick-access toolbar for drawing view
'use client';

import { useState } from 'react';
import type { ViewMode } from '@/types/research';
import type { DrawingPreferences } from './DrawingPreferencesPanel';

interface DrawingViewToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  preferences: DrawingPreferences;
  onPreferencesChange: (prefs: DrawingPreferences) => void;
  onOpenSettings: () => void;
  onExportSvg: () => void;
  onExportJson: () => void;
  onSaveToDb: () => void;
  onResetOriginal: () => void;
  onResetLastSaved: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  elementCount: number;
  visibleCount: number;
  modifiedCount: number;
  overallConfidence: number | null;
  hasUnsavedChanges: boolean;
  lastSavedAt: string | null;
}

const VIEW_MODES: { key: ViewMode; label: string; desc: string }[] = [
  { key: 'standard', label: 'Standard', desc: 'Normal drawing view' },
  { key: 'feature', label: 'Feature', desc: 'Color by feature class' },
  { key: 'confidence', label: 'Confidence', desc: 'Color by confidence rating' },
  { key: 'discrepancy', label: 'Issues', desc: 'Highlight discrepancies' },
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
  onExportJson,
  onSaveToDb,
  onResetOriginal,
  onResetLastSaved,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  elementCount,
  visibleCount,
  modifiedCount,
  overallConfidence,
  hasUnsavedChanges,
  lastSavedAt,
}: DrawingViewToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showResetMenu, setShowResetMenu] = useState(false);

  function toggleLayer(layer: string) {
    const updated = { ...preferences.layers, [layer]: !preferences.layers[layer] };
    onPreferencesChange({ ...preferences, layers: updated });
  }

  return (
    <div className="research-toolbar">
      {/* Undo / Redo */}
      <div className="research-toolbar__group">
        <button
          className="research-toolbar__icon-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          ↩
        </button>
        <button
          className="research-toolbar__icon-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          ↪
        </button>
      </div>

      {/* View mode selector */}
      <div className="research-toolbar__group">
        <span className="research-toolbar__group-label">View</span>
        <div className="research-toolbar__btn-group">
          {VIEW_MODES.map(mode => (
            <button
              key={mode.key}
              className={`research-toolbar__mode-btn ${viewMode === mode.key ? 'research-toolbar__mode-btn--active' : ''}`}
              onClick={() => onViewModeChange(mode.key)}
              title={mode.desc}
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
        {modifiedCount > 0 && (
          <span className="research-toolbar__stat research-toolbar__stat--modified" title="User-modified elements shown in purple in Confidence view">
            {modifiedCount} modified
          </span>
        )}
        {overallConfidence !== null && (
          <span className="research-toolbar__stat">
            {Math.round(overallConfidence)}% conf.
          </span>
        )}
        {hasUnsavedChanges && (
          <span className="research-toolbar__stat research-toolbar__stat--unsaved" title="You have unsaved changes">
            Unsaved
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="research-toolbar__group">
        <button className="research-toolbar__action-btn" onClick={onOpenSettings} title="Drawing Preferences">
          Settings
        </button>

        {/* Save / Export dropdown */}
        <div className="research-toolbar__dropdown-wrap">
          <button
            className={`research-toolbar__action-btn ${hasUnsavedChanges ? 'research-toolbar__action-btn--primary' : ''}`}
            onClick={() => { setShowExportMenu(!showExportMenu); setShowResetMenu(false); }}
            title="Save & Export"
          >
            Save
          </button>
          {showExportMenu && (
            <div className="research-toolbar__dropdown">
              <button
                className="research-toolbar__dropdown-item"
                onClick={() => { onSaveToDb(); setShowExportMenu(false); }}
              >
                Save to Project
                <span className="research-toolbar__dropdown-hint">Save drawing state to database</span>
              </button>
              <button
                className="research-toolbar__dropdown-item"
                onClick={() => { onExportJson(); setShowExportMenu(false); }}
              >
                Export Drawing (JSON)
                <span className="research-toolbar__dropdown-hint">Download full drawing data as JSON file</span>
              </button>
              <button
                className="research-toolbar__dropdown-item"
                onClick={() => { onExportSvg(); setShowExportMenu(false); }}
              >
                Export Image (SVG)
                <span className="research-toolbar__dropdown-hint">Download rendered drawing as SVG</span>
              </button>
            </div>
          )}
        </div>

        {/* Reset dropdown */}
        <div className="research-toolbar__dropdown-wrap">
          <button
            className="research-toolbar__action-btn"
            onClick={() => { setShowResetMenu(!showResetMenu); setShowExportMenu(false); }}
            title="Reset drawing"
          >
            Reset
          </button>
          {showResetMenu && (
            <div className="research-toolbar__dropdown">
              <button
                className="research-toolbar__dropdown-item"
                onClick={() => { onResetLastSaved(); setShowResetMenu(false); }}
              >
                Revert to Last Save
                <span className="research-toolbar__dropdown-hint">
                  {lastSavedAt ? `Saved: ${new Date(lastSavedAt).toLocaleString()}` : 'No saved version'}
                </span>
              </button>
              <button
                className="research-toolbar__dropdown-item research-toolbar__dropdown-item--danger"
                onClick={() => { onResetOriginal(); setShowResetMenu(false); }}
              >
                Reset to Original
                <span className="research-toolbar__dropdown-hint">Discard all changes and regenerate</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
