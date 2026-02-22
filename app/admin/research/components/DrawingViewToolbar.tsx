// app/admin/research/components/DrawingViewToolbar.tsx — Quick-access toolbar for drawing view
'use client';

import { useState } from 'react';
import type { ViewMode } from '@/types/research';
import type { DrawingPreferences } from './DrawingPreferencesPanel';
import Tooltip from './Tooltip';

interface DrawingViewToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  preferences: DrawingPreferences;
  onPreferencesChange: (prefs: DrawingPreferences) => void;
  onOpenSettings: () => void;
  onExportSvg: () => void;
  onExportJson: () => void;
  onSaveToDb: () => void;
  isSaving?: boolean;
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
  showUITooltips?: boolean;
  onToggleUITooltips?: () => void;
}

const VIEW_MODES: { key: ViewMode; label: string; desc: string; tip: string }[] = [
  { key: 'standard', label: 'Standard', desc: 'Normal drawing view', tip: 'Standard view — shows the drawing with your configured line styles and colors' },
  { key: 'feature', label: 'Feature', desc: 'Color by feature class', tip: 'Feature view — color-codes elements by type (boundary, easement, monument, etc.)' },
  { key: 'confidence', label: 'Confidence', desc: 'Color by confidence rating', tip: 'Confidence view — color-codes elements by AI confidence level (green = high, red = low, purple = user-edited)' },
  { key: 'discrepancy', label: 'Issues', desc: 'Highlight discrepancies', tip: 'Issues view — highlights elements that have conflicting data from different sources' },
];

const QUICK_LAYERS: { key: string; label: string; tip: string }[] = [
  { key: 'boundary', label: 'Boundary', tip: 'Toggle property boundary lines on/off' },
  { key: 'monuments', label: 'Monuments', tip: 'Toggle survey monument markers on/off' },
  { key: 'labels', label: 'Labels', tip: 'Toggle text labels (bearings, distances, lot numbers) on/off' },
  { key: 'easements', label: 'Easements', tip: 'Toggle easement and right-of-way lines on/off' },
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
  isSaving,
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
  showUITooltips = true,
  onToggleUITooltips,
}: DrawingViewToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showResetMenu, setShowResetMenu] = useState(false);
  const tips = showUITooltips;

  function toggleLayer(layer: string) {
    const updated = { ...preferences.layers, [layer]: !preferences.layers[layer] };
    onPreferencesChange({ ...preferences, layers: updated });
  }

  return (
    <div className="research-toolbar">
      {/* Undo / Redo */}
      <div className="research-toolbar__group">
        <Tooltip text="Undo your last action (Ctrl+Z)" enabled={tips} position="bottom">
          <button
            className="research-toolbar__icon-btn"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
          >
            ↩
          </button>
        </Tooltip>
        <Tooltip text="Redo the last undone action (Ctrl+Shift+Z)" enabled={tips} position="bottom">
          <button
            className="research-toolbar__icon-btn"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
          >
            ↪
          </button>
        </Tooltip>
      </div>

      {/* View mode selector */}
      <div className="research-toolbar__group">
        <span className="research-toolbar__group-label">View</span>
        <div className="research-toolbar__btn-group">
          {VIEW_MODES.map(mode => (
            <Tooltip key={mode.key} text={mode.tip} enabled={tips} position="bottom">
              <button
                className={`research-toolbar__mode-btn ${viewMode === mode.key ? 'research-toolbar__mode-btn--active' : ''}`}
                onClick={() => onViewModeChange(mode.key)}
              >
                {mode.label}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Layer quick toggles */}
      <div className="research-toolbar__group">
        <span className="research-toolbar__group-label">Layers</span>
        <div className="research-toolbar__btn-group">
          {QUICK_LAYERS.map(layer => (
            <Tooltip key={layer.key} text={layer.tip} enabled={tips} position="bottom">
              <button
                className={`research-toolbar__layer-btn ${preferences.layers[layer.key] ? 'research-toolbar__layer-btn--active' : ''}`}
                onClick={() => toggleLayer(layer.key)}
              >
                {layer.label}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="research-toolbar__group">
        <span className="research-toolbar__group-label">Zoom</span>
        <div className="research-toolbar__btn-group">
          <Tooltip text="Zoom out — make the drawing smaller" enabled={tips} position="bottom">
            <button className="research-toolbar__icon-btn" onClick={onZoomOut} aria-label="Zoom out">-</button>
          </Tooltip>
          <Tooltip text={`Current zoom level: ${Math.round(zoom * 100)}%. Scroll wheel also zooms.`} enabled={tips} position="bottom">
            <span className="research-toolbar__zoom-value">{Math.round(zoom * 100)}%</span>
          </Tooltip>
          <Tooltip text="Zoom in — make the drawing larger" enabled={tips} position="bottom">
            <button className="research-toolbar__icon-btn" onClick={onZoomIn} aria-label="Zoom in">+</button>
          </Tooltip>
          <Tooltip text="Reset zoom to fit the entire drawing in view" enabled={tips} position="bottom">
            <button className="research-toolbar__icon-btn research-toolbar__icon-btn--text" onClick={onZoomReset} aria-label="Reset zoom">Fit</button>
          </Tooltip>
        </div>
      </div>

      {/* Stats */}
      <div className="research-toolbar__group research-toolbar__group--stats">
        <Tooltip text={`${visibleCount} of ${elementCount} total drawing elements are currently visible`} enabled={tips} position="bottom">
          <span className="research-toolbar__stat">
            {visibleCount}/{elementCount} elements
          </span>
        </Tooltip>
        {modifiedCount > 0 && (
          <Tooltip text={`${modifiedCount} element(s) have been manually edited. Shown in purple in Confidence view.`} enabled={tips} position="bottom">
            <span className="research-toolbar__stat research-toolbar__stat--modified">
              {modifiedCount} modified
            </span>
          </Tooltip>
        )}
        {overallConfidence !== null && (
          <Tooltip text={`Overall AI confidence: ${Math.round(overallConfidence)}%. Higher is better — indicates how certain the AI is about the drawing accuracy.`} enabled={tips} position="bottom">
            <span className="research-toolbar__stat">
              {Math.round(overallConfidence)}% conf.
            </span>
          </Tooltip>
        )}
        {hasUnsavedChanges && (
          <Tooltip text="You have unsaved changes. Click Save to persist your work. Auto-save runs every 60 seconds." enabled={tips} position="bottom">
            <span className="research-toolbar__stat research-toolbar__stat--unsaved">
              Unsaved
            </span>
          </Tooltip>
        )}
      </div>

      {/* Actions */}
      <div className="research-toolbar__group">
        <Tooltip text="Open drawing preferences — customize colors, line styles, labels, layers, and interaction settings" enabled={tips} position="bottom">
          <button className="research-toolbar__action-btn" onClick={onOpenSettings} aria-label="Drawing preferences">
            Settings
          </button>
        </Tooltip>

        {/* Save / Export dropdown */}
        <div className="research-toolbar__dropdown-wrap">
          <Tooltip text="Save your drawing or export it as SVG/JSON" enabled={tips} position="bottom">
            <button
              className={`research-toolbar__action-btn ${hasUnsavedChanges ? 'research-toolbar__action-btn--primary' : ''}`}
              onClick={() => { setShowExportMenu(!showExportMenu); setShowResetMenu(false); }}
              disabled={isSaving}
              aria-label="Save and export options"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </Tooltip>
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
          <Tooltip text="Reset the drawing — revert to last saved version or original AI-generated state" enabled={tips} position="bottom">
            <button
              className="research-toolbar__action-btn"
              onClick={() => { setShowResetMenu(!showResetMenu); setShowExportMenu(false); }}
              aria-label="Reset drawing options"
            >
              Reset
            </button>
          </Tooltip>
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

        {/* Tooltip toggle */}
        {onToggleUITooltips && (
          <Tooltip text={showUITooltips ? 'Turn off helpful tooltips' : 'Turn on helpful tooltips'} enabled={true} position="bottom">
            <button
              className={`research-toolbar__icon-btn research-toolbar__icon-btn--text ${showUITooltips ? 'research-toolbar__icon-btn--active' : ''}`}
              onClick={onToggleUITooltips}
              aria-label={showUITooltips ? 'Disable tooltips' : 'Enable tooltips'}
            >
              ?
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
