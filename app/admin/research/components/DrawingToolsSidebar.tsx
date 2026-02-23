// app/admin/research/components/DrawingToolsSidebar.tsx — Drawing & annotation tools sidebar
'use client';

import { useState, useEffect, useMemo } from 'react';
import Tooltip from './Tooltip';

// ── Quick color palette ─────────────────────────────────────────────────────

const QUICK_COLORS = [
  '#000000', // Black
  '#374151', // Dark gray
  '#EF4444', // Red
  '#F97316', // Orange
  '#EAB308', // Yellow
  '#22C55E', // Green
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#92400E', // Brown
  '#FFFFFF', // White
];

// ── Tool Types ──────────────────────────────────────────────────────────────

export type DrawingTool =
  | 'select'             // Default pointer / selection tool
  | 'pan'                // Pan / hand tool
  | 'vertex_edit'        // Edit vertices / control points
  | 'coordinate_entry'   // CAD-style bearing/distance entry
  | 'line'               // Straight line
  | 'polyline'           // Multi-segment line
  | 'rectangle'          // Rectangle
  | 'circle'             // Circle / ellipse
  | 'freehand'           // Freehand draw
  | 'text_type'          // Type text (click to place)
  | 'text_write'         // Handwrite text (freehand)
  | 'image'              // Place image from file
  | 'symbol'             // Place surveying symbol
  | 'dimension'          // Dimension line (distance/bearing)
  | 'callout'            // Callout / leader line
  | 'eraser'             // Erase user annotations
  | 'measure';           // Measure distance on drawing

export type SymbolType =
  // Monuments & Survey Markers — standard
  | 'iron_rod'
  | 'iron_pipe'
  | 'concrete_monument'
  | 'nail'
  | 'pk_nail'
  | 'rebar'
  | 'mag_nail'
  | 'cap'
  | 'benchmark'
  // Monuments — sized variants (1/2", 5/8", 3/4", 1")
  | 'iron_rod_half'        // 1/2" iron rod
  | 'iron_rod_five_eighth' // 5/8" iron rod (most common in US)
  | 'iron_rod_three_quarter' // 3/4" iron rod
  | 'iron_rod_one_inch'    // 1" iron rod
  | 'iron_pipe_half'
  | 'iron_pipe_three_quarter'
  | 'iron_pipe_one_inch'
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
  // Utilities — Underground Lines (used as point symbols on drawings)
  | 'water_line'
  | 'sewer_line'
  | 'gas_line'
  | 'electric_line'
  | 'telecom_line'
  | 'fiber_line'
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
  /** Snap mode: off = no snapping; hover = snap after 4s hover; auto = auto snap within radius */
  snapMode: 'off' | 'hover' | 'auto';
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
  snapMode: 'off',
};

// ── Tool Definitions ────────────────────────────────────────────────────────

const TOOL_GROUPS = [
  {
    label: 'Selection',
    tools: [
      { key: 'select' as DrawingTool, label: 'Select', icon: '↖', shortcut: 'V', tip: 'Click to select elements or annotations. Drag empty space to pan.' },
      { key: 'pan' as DrawingTool, label: 'Pan', icon: '✋', shortcut: 'H', tip: 'Click and drag to pan around the drawing. Also works with middle-click or Alt+click.' },
    ],
  },
  {
    label: 'CAD',
    tools: [
      { key: 'vertex_edit' as DrawingTool, label: 'Edit Vertices', icon: '◇', shortcut: 'G', tip: 'Edit individual vertices. Click a vertex handle to edit its coordinates, bearing, or distance.' },
      { key: 'coordinate_entry' as DrawingTool, label: 'Coord Entry', icon: '⌖', shortcut: 'K', tip: 'Open the coordinate entry panel. Type bearings, distances, azimuths, or coordinates to draw precisely.' },
    ],
  },
  {
    label: 'Draw',
    tools: [
      { key: 'line' as DrawingTool, label: 'Line', icon: '╱', shortcut: 'L', tip: 'Draw a straight line. Click start point, drag to end point.' },
      { key: 'polyline' as DrawingTool, label: 'Polyline', icon: '⟋', shortcut: 'P', tip: 'Draw connected line segments. Click to add points, double-click to finish.' },
      { key: 'rectangle' as DrawingTool, label: 'Rectangle', icon: '▭', shortcut: 'R', tip: 'Draw a rectangle. Click one corner, drag to the opposite corner.' },
      { key: 'circle' as DrawingTool, label: 'Circle', icon: '○', shortcut: 'C', tip: 'Draw a circle/ellipse. Click center, drag to set radius.' },
      { key: 'freehand' as DrawingTool, label: 'Freehand', icon: '✎', shortcut: 'F', tip: 'Draw freehand lines. Click and drag to draw freely.' },
    ],
  },
  {
    label: 'Annotate',
    tools: [
      { key: 'text_type' as DrawingTool, label: 'Type Text', icon: 'T', shortcut: 'T', tip: 'Place typed text on the drawing. Click to position, type your text, press Enter to confirm.' },
      { key: 'text_write' as DrawingTool, label: 'Handwrite', icon: '✍', shortcut: 'W', tip: 'Draw freehand handwriting on the canvas.' },
      { key: 'callout' as DrawingTool, label: 'Callout', icon: '💬', shortcut: 'A', tip: 'Add a callout with a leader line pointing to a feature. Click the target, drag to place the label.' },
      { key: 'dimension' as DrawingTool, label: 'Dimension', icon: '↔', shortcut: 'D', tip: 'Add a dimension line showing distance between two points.' },
    ],
  },
  {
    label: 'Place',
    tools: [
      { key: 'symbol' as DrawingTool, label: 'Symbol', icon: '⊕', shortcut: 'S', tip: 'Place a surveying symbol (monument, utility, etc.). Choose the type below, then click to place.' },
      { key: 'image' as DrawingTool, label: 'Image', icon: '🖼', shortcut: 'I', tip: 'Upload and place an image on the drawing from your device.' },
    ],
  },
  {
    label: 'Utility',
    tools: [
      { key: 'measure' as DrawingTool, label: 'Measure', icon: '📏', shortcut: 'M', tip: 'Measure distance between two points on the drawing. Click start, then click end.' },
      { key: 'eraser' as DrawingTool, label: 'Eraser', icon: '⌫', shortcut: 'E', tip: 'Erase user annotations. Click on any annotation you added to delete it.' },
    ],
  },
];

const SYMBOL_CATEGORIES: { label: string; items: { key: SymbolType; label: string }[] }[] = [
  {
    label: 'Monuments — Standard',
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
    label: 'Monuments — Iron Rod Sizes',
    items: [
      { key: 'iron_rod_half', label: '1/2" Rod' },
      { key: 'iron_rod_five_eighth', label: '5/8" Rod' },
      { key: 'iron_rod_three_quarter', label: '3/4" Rod' },
      { key: 'iron_rod_one_inch', label: '1" Rod' },
      { key: 'iron_pipe_half', label: '1/2" Pipe' },
      { key: 'iron_pipe_three_quarter', label: '3/4" Pipe' },
      { key: 'iron_pipe_one_inch', label: '1" Pipe' },
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
    label: 'Underground Lines',
    items: [
      { key: 'water_line', label: 'Water Line' },
      { key: 'sewer_line', label: 'Sewer Line' },
      { key: 'gas_line', label: 'Gas Line' },
      { key: 'electric_line', label: 'Electric Line' },
      { key: 'telecom_line', label: 'Telecom Line' },
      { key: 'fiber_line', label: 'Fiber Line' },
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
  showUITooltips?: boolean;
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
  showUITooltips = true,
}: DrawingToolsSidebarProps) {
  const [expandedSettings, setExpandedSettings] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');

  // Auto-expand settings when switching to a tool that has configurable options
  const TOOLS_WITHOUT_SETTINGS = ['select', 'pan', 'eraser', 'measure', 'image'] as const;
  const SNAP_HOVER_SECONDS = 4;

  useEffect(() => {
    const hasSettings = !(TOOLS_WITHOUT_SETTINGS as readonly string[]).includes(activeTool);
    if (hasSettings) setExpandedSettings(true);
  }, [activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateSetting<K extends keyof ToolSettings>(key: K, value: ToolSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  // Determine which quick settings to show based on active tool
  const showStroke = !(TOOLS_WITHOUT_SETTINGS as readonly string[]).includes(activeTool);
  const showFill = ['rectangle', 'circle', 'polyline', 'freehand'].includes(activeTool);
  const showTextSettings = ['text_type', 'text_write', 'callout', 'dimension'].includes(activeTool);
  const showSymbolSettings = activeTool === 'symbol';
  const showDash = ['line', 'polyline', 'rectangle', 'circle', 'dimension'].includes(activeTool);
  // Show snap settings for any drawing tool
  const showSnap = !(TOOLS_WITHOUT_SETTINGS as readonly string[]).includes(activeTool);

  // Pre-normalize colors to avoid repeated .toLowerCase() calls in render
  const strokeColorNorm = settings.strokeColor.toLowerCase();
  const fillColorNorm = settings.fillColor.toLowerCase();

  // Helper: whether a color needs a visible border for contrast on white backgrounds
  const needsBorder = (hex: string) => hex.toUpperCase() === '#FFFFFF';

  // Memoize symbol count so the filter doesn't re-run on every keystroke elsewhere
  const filteredSymbolCount = useMemo(
    () => SYMBOL_OPTIONS.filter(s => !symbolSearch || s.label.toLowerCase().includes(symbolSearch.toLowerCase())).length,
    [symbolSearch],
  );

  return (
    <div className="research-tools">
      {/* Undo/Redo */}
      <div className="research-tools__undo-redo">
        <Tooltip text="Undo last action (Ctrl+Z)" enabled={showUITooltips} position="right">
          <button
            className="research-tools__undo-btn"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
          >
            ↩
          </button>
        </Tooltip>
        <Tooltip text="Redo last undone action (Ctrl+Shift+Z)" enabled={showUITooltips} position="right">
          <button
            className="research-tools__undo-btn"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
          >
            ↪
          </button>
        </Tooltip>
      </div>

      {/* Tool groups */}
      {TOOL_GROUPS.map(group => (
        <div key={group.label} className="research-tools__group">
          <div className="research-tools__group-label">{group.label}</div>
          <div className="research-tools__group-btns">
            {group.tools.map(tool => (
              <Tooltip key={tool.key} text={tool.tip} shortcut={tool.shortcut} enabled={showUITooltips} position="right" delay={300}>
                <button
                  className={`research-tools__btn ${activeTool === tool.key ? 'research-tools__btn--active' : ''}`}
                  onClick={() => onToolChange(tool.key)}
                  aria-label={`${tool.label} (${tool.shortcut})`}
                >
                  <span className="research-tools__btn-icon">{tool.icon}</span>
                  <span className="research-tools__btn-label">{tool.label}</span>
                  <kbd className="research-tools__btn-shortcut">{tool.shortcut}</kbd>
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      ))}

      {/* Quick tool settings */}
        {(showStroke || showFill || showTextSettings || showSymbolSettings || showSnap) && (
          <div className="research-tools__settings">
            <Tooltip text="Customize stroke, fill, pattern, and other options for the active tool" enabled={showUITooltips} position="right" delay={300}>
              <button
                className="research-tools__settings-toggle"
                onClick={() => setExpandedSettings(!expandedSettings)}
                aria-expanded={expandedSettings}
              >
                <span>{expandedSettings ? '▾' : '▸'} Tool Settings</span>
                {showStroke && (
                  <span className="research-tools__settings-preview" style={{ background: settings.strokeColor }} title={`Current color: ${settings.strokeColor}`} />
                )}
            </button>
          </Tooltip>

          {expandedSettings && (
            <div className="research-tools__settings-body">
              {/* Stroke color */}
              {showStroke && (
                <>
                  <div className="research-tools__setting-row">
                    <label>Color</label>
                    <input
                      type="color"
                      value={settings.strokeColor}
                      onChange={e => updateSetting('strokeColor', e.target.value)}
                      className="research-tools__color-input"
                      title="Pick a custom stroke color"
                    />
                    <span className="research-tools__setting-value" style={{ fontFamily: 'monospace' }}>{settings.strokeColor}</span>
                  </div>
                  <div className="research-tools__quick-colors">
                    {QUICK_COLORS.map(c => (
                      <Tooltip key={c} text={needsBorder(c) ? 'White' : c} position="top" delay={200}>
                        <button
                          className={`research-tools__quick-color ${strokeColorNorm === c.toLowerCase() ? 'research-tools__quick-color--active' : ''}`}
                          style={{ background: c, border: needsBorder(c) ? '1px solid #D1D5DB' : undefined }}
                          onClick={() => updateSetting('strokeColor', c)}
                          aria-label={`Set stroke color to ${c}`}
                        />
                      </Tooltip>
                    ))}
                  </div>
                </>
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
                  <span className="research-tools__setting-value">{settings.strokeWidth}px</span>
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
                <>
                  <div className="research-tools__setting-row">
                    <label>Fill</label>
                    <input
                      type="color"
                      value={settings.fillColor === 'none' ? '#ffffff' : settings.fillColor}
                      onChange={e => updateSetting('fillColor', e.target.value)}
                      className="research-tools__color-input"
                      title="Pick a fill color"
                    />
                    <Tooltip text="No fill — shape outline only" position="top" delay={200}>
                      <button
                        className={`research-tools__no-fill-btn ${settings.fillColor === 'none' ? 'research-tools__no-fill-btn--active' : ''}`}
                        onClick={() => updateSetting('fillColor', settings.fillColor === 'none' ? '#3B82F6' : 'none')}
                        aria-label="Toggle no fill"
                        title="Toggle none / filled"
                      >
                        ∅
                      </button>
                    </Tooltip>
                  </div>
                  {settings.fillColor !== 'none' && (
                    <div className="research-tools__quick-colors">
                      {QUICK_COLORS.map(c => (
                        <Tooltip key={c} text={needsBorder(c) ? 'White' : c} position="top" delay={200}>
                          <button
                            className={`research-tools__quick-color ${fillColorNorm === c.toLowerCase() ? 'research-tools__quick-color--active' : ''}`}
                            style={{ background: c, border: needsBorder(c) ? '1px solid #D1D5DB' : undefined }}
                            onClick={() => updateSetting('fillColor', c)}
                            aria-label={`Set fill color to ${c}`}
                          />
                        </Tooltip>
                      ))}
                    </div>
                  )}
                </>
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
                  <span className="research-tools__setting-value">{Math.round(settings.opacity * 100)}%</span>
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
                    <span className="research-tools__setting-value">pt</span>
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

              {/* Symbol settings with search */}
              {showSymbolSettings && (
                <>
                  <div className="research-tools__setting-row">
                    <label>Symbol</label>
                    <input
                      type="text"
                      className="research-tools__search-input"
                      placeholder="Search symbols…"
                      value={symbolSearch}
                      onChange={e => setSymbolSearch(e.target.value)}
                      aria-label="Search symbols"
                    />
                  </div>
                  <div className="research-tools__setting-row research-tools__setting-row--column">
                    <select
                      value={settings.symbolType}
                      onChange={e => updateSetting('symbolType', e.target.value as SymbolType)}
                      className="research-tools__select research-tools__select--symbol"
                      size={7}
                      aria-label="Choose symbol type"
                    >
                      {SYMBOL_CATEGORIES.map(cat => {
                        const filtered = cat.items.filter(s =>
                          !symbolSearch || s.label.toLowerCase().includes(symbolSearch.toLowerCase())
                        );
                        if (filtered.length === 0) return null;
                        return (
                          <optgroup key={cat.label} label={cat.label}>
                            {filtered.map(s => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                    <p className="research-tools__symbol-hint">
                      Click to select · {filteredSymbolCount} available
                    </p>
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

              {/* Snap mode */}
              {showSnap && (
                <>
                  <div className="research-tools__setting-row">
                    <label>Snap</label>
                    <select
                      value={settings.snapMode}
                      onChange={e => updateSetting('snapMode', e.target.value as 'off' | 'hover' | 'auto')}
                      className="research-tools__select"
                      aria-label="Snap mode"
                    >
                      <option value="off">Off</option>
                      <option value="hover">Hover ({SNAP_HOVER_SECONDS}s)</option>
                      <option value="auto">Auto</option>
                    </select>
                  </div>
                  {settings.snapMode !== 'off' && (
                    <p className="research-tools__snap-desc">
                      {settings.snapMode === 'hover'
                        ? `🟡 Hover over a point for ${SNAP_HOVER_SECONDS} seconds — it turns green when locked. Then click to connect.`
                        : '🟢 Cursor auto-snaps to the nearest node (endpoint, midpoint, or line) within the snap radius.'}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
