// app/admin/research/components/DrawingPreferencesPanel.tsx — Full drawing customization
'use client';

import { useState } from 'react';
import type { ViewMode, FeatureClass } from '@/types/research';
import Tooltip from './Tooltip';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DrawingPreferences {
  // Display
  showTitleBlock: boolean;
  showNorthArrow: boolean;
  showScaleBar: boolean;
  showLegend: boolean;
  showConfidenceBar: boolean;
  showGrid: boolean;
  gridSpacing: number;
  backgroundColor: string;

  // Labels
  showBearingLabels: boolean;
  showDistanceLabels: boolean;
  showMonumentLabels: boolean;
  showLotLabels: boolean;
  labelFontSize: number;
  labelFontFamily: string;

  // Layers visibility
  layers: Record<string, boolean>;

  // Feature class styles (user overrides)
  featureStyles: Record<string, {
    stroke: string;
    strokeWidth: number;
    dasharray: string;
    fill: string;
    opacity: number;
  }>;

  // Monument symbols
  monumentStyle: 'standard' | 'filled' | 'outline' | 'crosshair';
  monumentSize: number;

  // Confidence display
  confidenceThreshold: number;   // Hide elements below this confidence %
  fadeByConfidence: boolean;     // Reduce opacity of low-confidence elements

  // Interaction
  snapToGrid: boolean;
  highlightOnHover: boolean;
  showTooltips: boolean;
}

export const DEFAULT_PREFERENCES: DrawingPreferences = {
  showTitleBlock: true,
  showNorthArrow: true,
  showScaleBar: true,
  showLegend: false,
  showConfidenceBar: false,
  showGrid: false,
  gridSpacing: 50,
  backgroundColor: '#FFFFFF',

  showBearingLabels: true,
  showDistanceLabels: true,
  showMonumentLabels: true,
  showLotLabels: true,
  labelFontSize: 8,
  labelFontFamily: 'Arial',

  layers: {
    boundary: true,
    monuments: true,
    labels: true,
    easements: true,
    setbacks: true,
    dimensions: true,
    annotations: true,
  },

  featureStyles: {
    property_boundary: { stroke: '#000000', strokeWidth: 2, dasharray: '', fill: 'none', opacity: 1 },
    easement:          { stroke: '#CC0000', strokeWidth: 1.5, dasharray: '10,5', fill: 'none', opacity: 1 },
    setback:           { stroke: '#0066CC', strokeWidth: 1, dasharray: '5,5', fill: 'none', opacity: 1 },
    right_of_way:      { stroke: '#666666', strokeWidth: 1.5, dasharray: '15,5,5,5', fill: 'none', opacity: 1 },
    road:              { stroke: '#8B4513', strokeWidth: 2, dasharray: '', fill: '#F5DEB3', opacity: 1 },
    building:          { stroke: '#333333', strokeWidth: 1.5, dasharray: '', fill: '#B0C4DE', opacity: 1 },
    fence:             { stroke: '#228B22', strokeWidth: 1, dasharray: '4,4', fill: 'none', opacity: 1 },
    utility:           { stroke: '#FF8C00', strokeWidth: 1, dasharray: '8,3,2,3', fill: 'none', opacity: 1 },
    monument:          { stroke: '#CC0000', strokeWidth: 1.5, dasharray: '', fill: '#CC0000', opacity: 1 },
    annotation:        { stroke: '#000000', strokeWidth: 0.5, dasharray: '', fill: 'none', opacity: 1 },
  },

  monumentStyle: 'standard',
  monumentSize: 5,

  confidenceThreshold: 0,
  fadeByConfidence: false,

  snapToGrid: false,
  highlightOnHover: true,
  showTooltips: true,
};

// ── Feature Labels ───────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  property_boundary: 'Property Boundary',
  easement: 'Easement',
  setback: 'Setback',
  right_of_way: 'Right of Way',
  road: 'Road',
  building: 'Building',
  fence: 'Fence',
  utility: 'Utility',
  monument: 'Monument',
  annotation: 'Annotation/Label',
};

const DASH_PRESETS = [
  { label: 'Solid', value: '' },
  { label: 'Dashed', value: '10,5' },
  { label: 'Dotted', value: '3,3' },
  { label: 'Dash-Dot', value: '10,5,3,5' },
  { label: 'Long Dash', value: '15,5' },
  { label: 'Center', value: '15,5,5,5' },
];

const FONT_OPTIONS = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia'];

// ── Props ────────────────────────────────────────────────────────────────────

interface DrawingPreferencesPanelProps {
  preferences: DrawingPreferences;
  onChange: (prefs: DrawingPreferences) => void;
  onClose: () => void;
  onReset: () => void;
}

export default function DrawingPreferencesPanel({
  preferences,
  onChange,
  onClose,
  onReset,
}: DrawingPreferencesPanelProps) {
  const [activeTab, setActiveTab] = useState<'display' | 'styles' | 'labels' | 'layers' | 'interaction'>('display');

  function update(partial: Partial<DrawingPreferences>) {
    onChange({ ...preferences, ...partial });
  }

  function updateFeatureStyle(feature: string, field: string, value: string | number) {
    const updated = { ...preferences.featureStyles };
    updated[feature] = { ...updated[feature], [field]: value };
    update({ featureStyles: updated });
  }

  function updateLayer(layer: string, visible: boolean) {
    update({ layers: { ...preferences.layers, [layer]: visible } });
  }

  return (
    <div className="research-prefs">
      <div className="research-prefs__header">
        <h3 className="research-prefs__title">Drawing Preferences</h3>
        <div className="research-prefs__header-actions">
          <Tooltip text="Reset all preferences back to factory defaults" position="bottom">
            <button className="research-prefs__reset-btn" onClick={onReset}>
              Reset Defaults
            </button>
          </Tooltip>
          <Tooltip text="Close the preferences panel" position="bottom">
            <button className="research-prefs__close-btn" onClick={onClose}>
              &times;
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="research-prefs__tabs">
        {([
          ['display', 'Display'],
          ['styles', 'Line Styles'],
          ['labels', 'Labels'],
          ['layers', 'Layers'],
          ['interaction', 'Interaction'],
        ] as [typeof activeTab, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`research-prefs__tab ${activeTab === key ? 'research-prefs__tab--active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="research-prefs__body">
        {/* ── Display Tab ── */}
        {activeTab === 'display' && (
          <div className="research-prefs__section">
            <div className="research-prefs__group-title">Drawing Elements</div>

            <label className="research-prefs__toggle">
              <input type="checkbox" checked={preferences.showTitleBlock} onChange={e => update({ showTitleBlock: e.target.checked })} />
              <span>Title Block</span>
            </label>
            <label className="research-prefs__toggle">
              <input type="checkbox" checked={preferences.showNorthArrow} onChange={e => update({ showNorthArrow: e.target.checked })} />
              <span>North Arrow</span>
            </label>
            <label className="research-prefs__toggle">
              <input type="checkbox" checked={preferences.showScaleBar} onChange={e => update({ showScaleBar: e.target.checked })} />
              <span>Scale Bar</span>
            </label>
            <label className="research-prefs__toggle">
              <input type="checkbox" checked={preferences.showLegend} onChange={e => update({ showLegend: e.target.checked })} />
              <span>Feature Legend</span>
            </label>
            <Tooltip text="Show a color legend indicating what confidence score ranges each color represents" position="right">
              <label className="research-prefs__toggle">
                <input type="checkbox" checked={preferences.showConfidenceBar} onChange={e => update({ showConfidenceBar: e.target.checked })} />
                <span>Confidence Color Bar</span>
              </label>
            </Tooltip>

            <div className="research-prefs__group-title" style={{ marginTop: '1rem' }}>Grid</div>
            <label className="research-prefs__toggle">
              <input type="checkbox" checked={preferences.showGrid} onChange={e => update({ showGrid: e.target.checked })} />
              <span>Show Grid</span>
            </label>
            {preferences.showGrid && (
              <div className="research-prefs__slider-row">
                <span className="research-prefs__slider-label">Grid Spacing</span>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="10"
                  value={preferences.gridSpacing}
                  onChange={e => update({ gridSpacing: Number(e.target.value) })}
                />
                <span className="research-prefs__slider-value">{preferences.gridSpacing} ft</span>
              </div>
            )}

            <div className="research-prefs__group-title" style={{ marginTop: '1rem' }}>Background</div>
            <div className="research-prefs__color-row">
              <span>Background Color</span>
              <input
                type="color"
                value={preferences.backgroundColor}
                onChange={e => update({ backgroundColor: e.target.value })}
                className="research-prefs__color-input"
              />
            </div>

            <div className="research-prefs__group-title" style={{ marginTop: '1rem' }}>Confidence</div>
            <Tooltip text="Hide elements with confidence scores below this threshold — useful for filtering out uncertain data" position="right">
              <div className="research-prefs__slider-row">
                <span className="research-prefs__slider-label">Min. confidence threshold</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={preferences.confidenceThreshold}
                  onChange={e => update({ confidenceThreshold: Number(e.target.value) })}
                />
                <span className="research-prefs__slider-value">{preferences.confidenceThreshold}%</span>
              </div>
            </Tooltip>
            <Tooltip text="Make low-confidence elements semi-transparent so you can still see them but clearly distinguish them from high-confidence data" position="right">
              <label className="research-prefs__toggle">
                <input type="checkbox" checked={preferences.fadeByConfidence} onChange={e => update({ fadeByConfidence: e.target.checked })} />
                <span>Fade low-confidence elements</span>
              </label>
            </Tooltip>
          </div>
        )}

        {/* ── Line Styles Tab ── */}
        {activeTab === 'styles' && (
          <div className="research-prefs__section">
            <div className="research-prefs__group-title">Feature Class Styles</div>
            <p className="research-prefs__hint-text">
              Customize the color, weight, pattern, and fill for each feature type.
            </p>

            {Object.entries(preferences.featureStyles).map(([feature, style]) => (
              <div key={feature} className="research-prefs__style-row">
                <div className="research-prefs__style-header">
                  <span className="research-prefs__style-label">
                    {FEATURE_LABELS[feature] || feature.replace(/_/g, ' ')}
                  </span>
                  {/* Preview swatch */}
                  <svg width="50" height="12" className="research-prefs__style-preview">
                    <line
                      x1="2" y1="6" x2="48" y2="6"
                      stroke={style.stroke}
                      strokeWidth={Math.min(style.strokeWidth, 4)}
                      strokeDasharray={style.dasharray}
                      opacity={style.opacity}
                    />
                  </svg>
                </div>

                <div className="research-prefs__style-controls">
                  <div className="research-prefs__style-field">
                    <label>Color</label>
                    <input
                      type="color"
                      value={style.stroke}
                      onChange={e => updateFeatureStyle(feature, 'stroke', e.target.value)}
                      className="research-prefs__color-input"
                    />
                  </div>
                  <div className="research-prefs__style-field">
                    <label>Width</label>
                    <input
                      type="number"
                      min="0.25"
                      max="10"
                      step="0.25"
                      value={style.strokeWidth}
                      onChange={e => updateFeatureStyle(feature, 'strokeWidth', Number(e.target.value))}
                      className="research-prefs__num-input"
                    />
                  </div>
                  <div className="research-prefs__style-field">
                    <label>Pattern</label>
                    <select
                      value={style.dasharray}
                      onChange={e => updateFeatureStyle(feature, 'dasharray', e.target.value)}
                      className="research-prefs__select"
                    >
                      {DASH_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="research-prefs__style-field">
                    <label>Fill</label>
                    <input
                      type="color"
                      value={style.fill === 'none' ? '#ffffff' : style.fill}
                      onChange={e => updateFeatureStyle(feature, 'fill', e.target.value)}
                      className="research-prefs__color-input"
                    />
                  </div>
                  <div className="research-prefs__style-field">
                    <label>Opacity</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={style.opacity}
                      onChange={e => updateFeatureStyle(feature, 'opacity', Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="research-prefs__group-title" style={{ marginTop: '1rem' }}>Monument Symbols</div>
            <div className="research-prefs__style-controls">
              <div className="research-prefs__style-field">
                <label>Style</label>
                <select
                  value={preferences.monumentStyle}
                  onChange={e => update({ monumentStyle: e.target.value as DrawingPreferences['monumentStyle'] })}
                  className="research-prefs__select"
                >
                  <option value="standard">Standard (by type)</option>
                  <option value="filled">All Filled</option>
                  <option value="outline">All Outline</option>
                  <option value="crosshair">Crosshair Only</option>
                </select>
              </div>
              <div className="research-prefs__style-field">
                <label>Size</label>
                <input
                  type="range"
                  min="3"
                  max="12"
                  step="1"
                  value={preferences.monumentSize}
                  onChange={e => update({ monumentSize: Number(e.target.value) })}
                />
                <span className="research-prefs__slider-value">{preferences.monumentSize}px</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Labels Tab ── */}
        {activeTab === 'labels' && (
          <div className="research-prefs__section">
            <div className="research-prefs__group-title">Label Visibility</div>

            <label className="research-prefs__toggle">
              <input type="checkbox" checked={preferences.showBearingLabels} onChange={e => update({ showBearingLabels: e.target.checked })} />
              <span>Bearing Labels</span>
            </label>
            <label className="research-prefs__toggle">
              <input type="checkbox" checked={preferences.showDistanceLabels} onChange={e => update({ showDistanceLabels: e.target.checked })} />
              <span>Distance Labels</span>
            </label>
            <label className="research-prefs__toggle">
              <input type="checkbox" checked={preferences.showMonumentLabels} onChange={e => update({ showMonumentLabels: e.target.checked })} />
              <span>Monument Labels</span>
            </label>
            <label className="research-prefs__toggle">
              <input type="checkbox" checked={preferences.showLotLabels} onChange={e => update({ showLotLabels: e.target.checked })} />
              <span>Lot/Block Labels</span>
            </label>

            <div className="research-prefs__group-title" style={{ marginTop: '1rem' }}>Label Style</div>
            <div className="research-prefs__slider-row">
              <span className="research-prefs__slider-label">Font Size</span>
              <input
                type="range"
                min="5"
                max="16"
                step="1"
                value={preferences.labelFontSize}
                onChange={e => update({ labelFontSize: Number(e.target.value) })}
              />
              <span className="research-prefs__slider-value">{preferences.labelFontSize}pt</span>
            </div>
            <div className="research-prefs__style-field" style={{ marginTop: '0.5rem' }}>
              <label>Font Family</label>
              <select
                value={preferences.labelFontFamily}
                onChange={e => update({ labelFontFamily: e.target.value })}
                className="research-prefs__select"
              >
                {FONT_OPTIONS.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ── Layers Tab ── */}
        {activeTab === 'layers' && (
          <div className="research-prefs__section">
            <div className="research-prefs__group-title">Layer Visibility</div>
            <p className="research-prefs__hint-text">
              Toggle visibility of individual drawing layers.
            </p>

            {Object.entries(preferences.layers).map(([layer, visible]) => (
              <label key={layer} className="research-prefs__toggle">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={e => updateLayer(layer, e.target.checked)}
                />
                <span>{layer.charAt(0).toUpperCase() + layer.slice(1)}</span>
              </label>
            ))}
          </div>
        )}

        {/* ── Interaction Tab ── */}
        {activeTab === 'interaction' && (
          <div className="research-prefs__section">
            <div className="research-prefs__group-title">Interaction Settings</div>

            <Tooltip text="Show small info popups when you hover over drawing elements on the canvas (feature name, confidence, coordinates)" position="right">
              <label className="research-prefs__toggle">
                <input type="checkbox" checked={preferences.showTooltips} onChange={e => update({ showTooltips: e.target.checked })} />
                <span>Show Canvas Tooltips on Hover</span>
              </label>
            </Tooltip>
            <Tooltip text="Visually highlight drawing elements when your cursor moves over them with a glow effect" position="right">
              <label className="research-prefs__toggle">
                <input type="checkbox" checked={preferences.highlightOnHover} onChange={e => update({ highlightOnHover: e.target.checked })} />
                <span>Highlight Elements on Hover</span>
              </label>
            </Tooltip>
            <Tooltip text="When drawing or moving annotations, snap them to the nearest grid intersection for precise alignment" position="right">
              <label className="research-prefs__toggle">
                <input type="checkbox" checked={preferences.snapToGrid} onChange={e => update({ snapToGrid: e.target.checked })} />
                <span>Snap to Grid (when editing)</span>
              </label>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}
