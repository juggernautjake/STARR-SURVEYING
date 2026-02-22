// app/admin/research/components/DrawingToolsSidebar.tsx — Drawing & annotation tools sidebar
'use client';

import { useState } from 'react';

// ── Tool Types ──────────────────────────────────────────────────────────────

export type DrawingTool =
  | 'select'         // Default pointer / selection tool
  | 'pan'            // Pan / hand tool
  | 'line'           // Straight line
  | 'polyline'       // Multi-segment line
  | 'rectangle'      // Rectangle
  | 'circle'         // Circle / ellipse
  | 'freehand'       // Freehand draw
  | 'text_type'      // Type text (click to place)
  | 'text_write'     // Handwrite text (freehand)
  | 'image'          // Place image from file
  | 'symbol'         // Place surveying symbol
  | 'dimension'      // Dimension line (distance/bearing)
  | 'callout'        // Callout / leader line
  | 'eraser'         // Erase user annotations
  | 'measure';       // Measure distance on drawing

export type SymbolType =
  // Monuments & Survey Markers
  | 'iron_rod'
  | 'iron_pipe'
  | 'concrete_monument'
  | 'nail'
  | 'pk_nail'
  | 'rebar'
  | 'mag_nail'
  | 'cap'
  | 'benchmark'
  // Fencing & Boundaries
  | 'fence_post'
  | 'fence_corner'
  | 'gate'
  // Utilities — Underground
  | 'utility_pole'
  | 'manhole'
  | 'cleanout'
  | 'water_valve'
  | 'water_meter'
  | 'gas_valve'
  | 'gas_meter'
  | 'electric_meter'
  | 'junction_box'
  | 'storm_drain'
  | 'catch_basin'
  | 'septic_tank'
  // Utilities — Above Ground
  | 'fire_hydrant'
  | 'light_pole'
  | 'power_pole'
  | 'transformer'
  | 'guy_wire'
  | 'telephone_pedestal'
  | 'cable_pedestal'
  // Buildings & Improvements
  | 'building_corner'
  | 'shed'
  | 'pool'
  | 'deck'
  | 'patio'
  | 'driveway'
  | 'sidewalk'
  | 'retaining_wall'
  | 'sign'
  | 'mailbox'
  | 'ac_unit'
  // Vegetation & Natural
  | 'tree'
  | 'tree_line'
  | 'shrub'
  | 'stump'
  // Topographic
  | 'spot_elevation'
  | 'contour_label'
  // Drainage & Water
  | 'pond'
  | 'creek'
  | 'swale'
  | 'culvert'
  // Directional & Reference
  | 'north_arrow'
  | 'reference_point'
  | 'tie_point';

export interface ToolSettings {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
  opacity: number;
  dashPattern: string;
  symbolType: SymbolType;
  symbolSize: number;
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  strokeColor: '#000000',
  fillColor: 'none',
  strokeWidth: 2,
  fontSize: 12,
  fontFamily: 'Arial',
  opacity: 1,
  dashPattern: '',
  symbolType: 'iron_rod',
  symbolSize: 8,
};

// ── Tool Definitions ────────────────────────────────────────────────────────

const TOOL_GROUPS = [
  {
    label: 'Selection',
    tools: [
      { key: 'select' as DrawingTool, label: 'Select', icon: '↖', shortcut: 'V' },
      { key: 'pan' as DrawingTool, label: 'Pan', icon: '✋', shortcut: 'H' },
    ],
  },
  {
    label: 'Draw',
    tools: [
      { key: 'line' as DrawingTool, label: 'Line', icon: '╱', shortcut: 'L' },
      { key: 'polyline' as DrawingTool, label: 'Polyline', icon: '⟋', shortcut: 'P' },
      { key: 'rectangle' as DrawingTool, label: 'Rectangle', icon: '▭', shortcut: 'R' },
      { key: 'circle' as DrawingTool, label: 'Circle', icon: '○', shortcut: 'C' },
      { key: 'freehand' as DrawingTool, label: 'Freehand', icon: '✎', shortcut: 'F' },
    ],
  },
  {
    label: 'Annotate',
    tools: [
      { key: 'text_type' as DrawingTool, label: 'Type Text', icon: 'T', shortcut: 'T' },
      { key: 'text_write' as DrawingTool, label: 'Handwrite', icon: '✍', shortcut: 'W' },
      { key: 'callout' as DrawingTool, label: 'Callout', icon: '💬', shortcut: 'A' },
      { key: 'dimension' as DrawingTool, label: 'Dimension', icon: '↔', shortcut: 'D' },
    ],
  },
  {
    label: 'Place',
    tools: [
      { key: 'symbol' as DrawingTool, label: 'Symbol', icon: '⊕', shortcut: 'S' },
      { key: 'image' as DrawingTool, label: 'Image', icon: '🖼', shortcut: 'I' },
    ],
  },
  {
    label: 'Utility',
    tools: [
      { key: 'measure' as DrawingTool, label: 'Measure', icon: '📏', shortcut: 'M' },
      { key: 'eraser' as DrawingTool, label: 'Eraser', icon: '⌫', shortcut: 'E' },
    ],
  },
];

const SYMBOL_CATEGORIES: { label: string; items: { key: SymbolType; label: string }[] }[] = [
  {
    label: 'Monuments',
    items: [
      { key: 'iron_rod', label: 'Iron Rod' },
      { key: 'iron_pipe', label: 'Iron Pipe' },
      { key: 'concrete_monument', label: 'Concrete Mon.' },
      { key: 'rebar', label: 'Rebar' },
      { key: 'nail', label: 'Nail' },
      { key: 'pk_nail', label: 'PK Nail' },
      { key: 'mag_nail', label: 'Mag Nail' },
      { key: 'cap', label: 'Cap' },
      { key: 'benchmark', label: 'Benchmark' },
    ],
  },
  {
    label: 'Fencing',
    items: [
      { key: 'fence_post', label: 'Fence Post' },
      { key: 'fence_corner', label: 'Fence Corner' },
      { key: 'gate', label: 'Gate' },
    ],
  },
  {
    label: 'Underground Utils',
    items: [
      { key: 'manhole', label: 'Manhole' },
      { key: 'cleanout', label: 'Cleanout' },
      { key: 'water_valve', label: 'Water Valve' },
      { key: 'water_meter', label: 'Water Meter' },
      { key: 'gas_valve', label: 'Gas Valve' },
      { key: 'gas_meter', label: 'Gas Meter' },
      { key: 'electric_meter', label: 'Electric Meter' },
      { key: 'junction_box', label: 'Junction Box' },
      { key: 'storm_drain', label: 'Storm Drain' },
      { key: 'catch_basin', label: 'Catch Basin' },
      { key: 'septic_tank', label: 'Septic Tank' },
    ],
  },
  {
    label: 'Above Ground',
    items: [
      { key: 'utility_pole', label: 'Utility Pole' },
      { key: 'fire_hydrant', label: 'Fire Hydrant' },
      { key: 'light_pole', label: 'Light Pole' },
      { key: 'power_pole', label: 'Power Pole' },
      { key: 'transformer', label: 'Transformer' },
      { key: 'guy_wire', label: 'Guy Wire' },
      { key: 'telephone_pedestal', label: 'Telephone Ped.' },
      { key: 'cable_pedestal', label: 'Cable Ped.' },
    ],
  },
  {
    label: 'Improvements',
    items: [
      { key: 'building_corner', label: 'Building Corner' },
      { key: 'shed', label: 'Shed' },
      { key: 'pool', label: 'Pool' },
      { key: 'deck', label: 'Deck' },
      { key: 'patio', label: 'Patio' },
      { key: 'driveway', label: 'Driveway' },
      { key: 'sidewalk', label: 'Sidewalk' },
      { key: 'retaining_wall', label: 'Retaining Wall' },
      { key: 'sign', label: 'Sign' },
      { key: 'mailbox', label: 'Mailbox' },
      { key: 'ac_unit', label: 'A/C Unit' },
    ],
  },
  {
    label: 'Natural',
    items: [
      { key: 'tree', label: 'Tree' },
      { key: 'tree_line', label: 'Tree Line' },
      { key: 'shrub', label: 'Shrub' },
      { key: 'stump', label: 'Stump' },
      { key: 'pond', label: 'Pond' },
      { key: 'creek', label: 'Creek' },
      { key: 'swale', label: 'Swale' },
      { key: 'culvert', label: 'Culvert' },
    ],
  },
  {
    label: 'Reference',
    items: [
      { key: 'north_arrow', label: 'North Arrow' },
      { key: 'reference_point', label: 'Reference Point' },
      { key: 'tie_point', label: 'Tie Point' },
      { key: 'spot_elevation', label: 'Spot Elevation' },
      { key: 'contour_label', label: 'Contour Label' },
    ],
  },
];

// Flat list for quick lookup
const SYMBOL_OPTIONS = SYMBOL_CATEGORIES.flatMap(cat => cat.items);

const DASH_PRESETS = [
  { label: 'Solid', value: '' },
  { label: 'Dashed', value: '10,5' },
  { label: 'Dotted', value: '3,3' },
  { label: 'Dash-Dot', value: '10,5,3,5' },
];

const FONT_OPTIONS = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia'];

// ── Props ───────────────────────────────────────────────────────────────────

interface DrawingToolsSidebarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  settings: ToolSettings;
  onSettingsChange: (settings: ToolSettings) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function DrawingToolsSidebar({
  activeTool,
  onToolChange,
  settings,
  onSettingsChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: DrawingToolsSidebarProps) {
  const [expandedSettings, setExpandedSettings] = useState(false);

  function updateSetting<K extends keyof ToolSettings>(key: K, value: ToolSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  // Determine which quick settings to show based on active tool
  const showStroke = !['select', 'pan', 'eraser', 'measure', 'image'].includes(activeTool);
  const showFill = ['rectangle', 'circle'].includes(activeTool);
  const showTextSettings = ['text_type', 'text_write', 'callout', 'dimension'].includes(activeTool);
  const showSymbolSettings = activeTool === 'symbol';
  const showDash = ['line', 'polyline', 'rectangle', 'circle', 'dimension'].includes(activeTool);

  return (
    <div className="research-tools">
      {/* Undo/Redo */}
      <div className="research-tools__undo-redo">
        <button
          className="research-tools__undo-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          ↩
        </button>
        <button
          className="research-tools__undo-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          ↪
        </button>
      </div>

      {/* Tool groups */}
      {TOOL_GROUPS.map(group => (
        <div key={group.label} className="research-tools__group">
          <div className="research-tools__group-label">{group.label}</div>
          <div className="research-tools__group-btns">
            {group.tools.map(tool => (
              <button
                key={tool.key}
                className={`research-tools__btn ${activeTool === tool.key ? 'research-tools__btn--active' : ''}`}
                onClick={() => onToolChange(tool.key)}
                title={`${tool.label} (${tool.shortcut})`}
              >
                <span className="research-tools__btn-icon">{tool.icon}</span>
                <span className="research-tools__btn-label">{tool.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Quick tool settings */}
      {(showStroke || showFill || showTextSettings || showSymbolSettings) && (
        <div className="research-tools__settings">
          <button
            className="research-tools__settings-toggle"
            onClick={() => setExpandedSettings(!expandedSettings)}
          >
            {expandedSettings ? '▾' : '▸'} Tool Settings
          </button>

          {expandedSettings && (
            <div className="research-tools__settings-body">
              {/* Stroke color */}
              {showStroke && (
                <div className="research-tools__setting-row">
                  <label>Color</label>
                  <input
                    type="color"
                    value={settings.strokeColor}
                    onChange={e => updateSetting('strokeColor', e.target.value)}
                    className="research-tools__color-input"
                  />
                </div>
              )}

              {/* Stroke width */}
              {showStroke && (
                <div className="research-tools__setting-row">
                  <label>Width</label>
                  <input
                    type="range"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={settings.strokeWidth}
                    onChange={e => updateSetting('strokeWidth', Number(e.target.value))}
                  />
                  <span className="research-tools__setting-value">{settings.strokeWidth}</span>
                </div>
              )}

              {/* Dash pattern */}
              {showDash && (
                <div className="research-tools__setting-row">
                  <label>Pattern</label>
                  <select
                    value={settings.dashPattern}
                    onChange={e => updateSetting('dashPattern', e.target.value)}
                    className="research-tools__select"
                  >
                    {DASH_PRESETS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Fill color */}
              {showFill && (
                <div className="research-tools__setting-row">
                  <label>Fill</label>
                  <input
                    type="color"
                    value={settings.fillColor === 'none' ? '#ffffff' : settings.fillColor}
                    onChange={e => updateSetting('fillColor', e.target.value)}
                    className="research-tools__color-input"
                  />
                </div>
              )}

              {/* Opacity */}
              {showStroke && (
                <div className="research-tools__setting-row">
                  <label>Opacity</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={settings.opacity}
                    onChange={e => updateSetting('opacity', Number(e.target.value))}
                  />
                  <span className="research-tools__setting-value">{settings.opacity}</span>
                </div>
              )}

              {/* Text settings */}
              {showTextSettings && (
                <>
                  <div className="research-tools__setting-row">
                    <label>Font Size</label>
                    <input
                      type="number"
                      min="6"
                      max="72"
                      value={settings.fontSize}
                      onChange={e => updateSetting('fontSize', Number(e.target.value))}
                      className="research-tools__num-input"
                    />
                  </div>
                  <div className="research-tools__setting-row">
                    <label>Font</label>
                    <select
                      value={settings.fontFamily}
                      onChange={e => updateSetting('fontFamily', e.target.value)}
                      className="research-tools__select"
                    >
                      {FONT_OPTIONS.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Symbol settings */}
              {showSymbolSettings && (
                <>
                  <div className="research-tools__setting-row">
                    <label>Symbol</label>
                    <select
                      value={settings.symbolType}
                      onChange={e => updateSetting('symbolType', e.target.value as SymbolType)}
                      className="research-tools__select"
                    >
                      {SYMBOL_CATEGORIES.map(cat => (
                        <optgroup key={cat.label} label={cat.label}>
                          {cat.items.map(s => (
                            <option key={s.key} value={s.key}>{s.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="research-tools__setting-row">
                    <label>Size</label>
                    <input
                      type="range"
                      min="4"
                      max="20"
                      step="1"
                      value={settings.symbolSize}
                      onChange={e => updateSetting('symbolSize', Number(e.target.value))}
                    />
                    <span className="research-tools__setting-value">{settings.symbolSize}px</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
