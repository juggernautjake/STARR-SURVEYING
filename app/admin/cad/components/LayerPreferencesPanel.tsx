'use client';
// app/admin/cad/components/LayerPreferencesPanel.tsx — Per-layer display preferences panel
// Allows users to configure what attributes are shown and how text labels are styled for each layer.

import { useState, useRef, useEffect } from 'react';
import { X, RotateCcw, ChevronDown, ChevronRight, Type, Palette, Eye, EyeOff } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import { DEFAULT_LAYER_DISPLAY_PREFERENCES, DEFAULT_TEXT_LABEL_STYLE } from '@/lib/cad/constants';
import type {
  LayerDisplayPreferences, TextLabelStyle, Layer,
  BearingFormat, AngleFormat, LinearUnit, LinearFormat, AreaUnit, CoordMode,
} from '@/lib/cad/types';
import { regenerateLayerLabels } from '@/lib/cad/labels';
import Tooltip from './Tooltip';

interface Props {
  layerId: string;
  open: boolean;
  onClose: () => void;
}

// ── Toggle switch ──
function Toggle({
  label,
  checked,
  onChange,
  tooltip,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  tooltip: string;
}) {
  return (
    <Tooltip label={label} description={tooltip} side="bottom" delay={500}>
      <div className="flex items-center justify-between gap-2 py-0.5">
        <span className="text-[11px] text-gray-300">{label}</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={checked}
            onChange={() => onChange(!checked)}
          />
          <div className="w-7 h-4 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-500" />
        </label>
      </div>
    </Tooltip>
  );
}

// ── Collapsible section ──
function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-700 last:border-b-0">
      <button
        className="flex items-center gap-1 w-full px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-200 hover:bg-gray-750 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {title}
      </button>
      {open && <div className="px-3 pb-2 space-y-1">{children}</div>}
    </div>
  );
}

// ── Text style editor ──
function TextStyleEditor({
  label,
  style,
  onChange,
  layerColor,
}: {
  label: string;
  style: TextLabelStyle;
  onChange: (s: TextLabelStyle) => void;
  layerColor: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-750 rounded border border-gray-700 overflow-hidden" style={{ background: '#2a2f3e' }}>
      <button
        className="flex items-center gap-1.5 w-full px-2 py-1 text-left text-[10px] text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Type size={10} className="text-gray-500" />
        <span className="flex-1">{label} Style</span>
        <span
          className="w-3 h-3 rounded-sm border border-gray-500"
          style={{ backgroundColor: style.color ?? layerColor }}
        />
        <span className="text-[9px] text-gray-500">{style.fontSize}pt {style.fontFamily}</span>
        {expanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
      </button>

      {expanded && (
        <div className="px-2 pb-2 pt-1 space-y-1.5 border-t border-gray-700">
          {/* Font family */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-500 w-14 shrink-0">Font</span>
            <select
              className="flex-1 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none"
              value={style.fontFamily}
              onChange={(e) => onChange({ ...style, fontFamily: e.target.value })}
            >
              <option value="Arial">Arial</option>
              <option value="Helvetica">Helvetica</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
              <option value="serif">Serif</option>
              <option value="sans-serif">Sans-serif</option>
              <option value="monospace">Monospace</option>
            </select>
          </div>

          {/* Font size */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-500 w-14 shrink-0">Size</span>
            <input
              type="number"
              min={4}
              max={72}
              step={1}
              value={style.fontSize}
              className="w-14 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none text-center"
              onChange={(e) => onChange({ ...style, fontSize: Math.max(4, Math.min(72, parseInt(e.target.value) || 10)) })}
            />
            <span className="text-[9px] text-gray-500">pt</span>
          </div>

          {/* Weight & Style */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-500 w-14 shrink-0">Weight</span>
            <div className="flex gap-0.5">
              <button
                className={`px-2 py-0.5 rounded text-[9px] border transition-colors ${
                  style.fontWeight === 'bold'
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white'
                }`}
                onClick={() => onChange({ ...style, fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })}
              >
                <strong>B</strong>
              </button>
              <button
                className={`px-2 py-0.5 rounded text-[9px] border transition-colors ${
                  style.fontStyle === 'italic'
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white'
                }`}
                onClick={() => onChange({ ...style, fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })}
              >
                <em>I</em>
              </button>
            </div>
          </div>

          {/* Color */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-500 w-14 shrink-0">Color</span>
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-3 h-3"
                  checked={style.color === null}
                  onChange={(e) => onChange({ ...style, color: e.target.checked ? null : layerColor })}
                />
                <span className="text-[9px] text-gray-400">Layer</span>
              </label>
              {style.color !== null && (
                <input
                  type="color"
                  value={style.color}
                  className="w-5 h-5 rounded border border-gray-600 cursor-pointer"
                  onChange={(e) => onChange({ ...style, color: e.target.value })}
                />
              )}
            </div>
          </div>

          {/* Background color */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-500 w-14 shrink-0">BG</span>
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-3 h-3"
                  checked={style.backgroundColor === null}
                  onChange={(e) => onChange({ ...style, backgroundColor: e.target.checked ? null : '#ffffff' })}
                />
                <span className="text-[9px] text-gray-400">None</span>
              </label>
              {style.backgroundColor !== null && (
                <input
                  type="color"
                  value={style.backgroundColor}
                  className="w-5 h-5 rounded border border-gray-600 cursor-pointer"
                  onChange={(e) => onChange({ ...style, backgroundColor: e.target.value })}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ──
export default function LayerPreferencesPanel({ layerId, open, onClose }: Props) {
  const store = useDrawingStore();
  const layer = store.document.layers[layerId];
  const panelRef = useRef<HTMLDivElement>(null);

  if (!layer) return null;

  const prefs: LayerDisplayPreferences = layer.displayPreferences ?? { ...DEFAULT_LAYER_DISPLAY_PREFERENCES };

  function update(partial: Partial<LayerDisplayPreferences>) {
    store.updateLayerDisplayPreferences(layerId, partial);
  }

  function applyToExistingFeatures() {
    const features = store.getFeaturesOnLayer(layerId);
    const displayPrefs = store.document.settings.displayPreferences;
    const labelMap = regenerateLayerLabels(features, { ...layer, displayPreferences: { ...prefs } }, displayPrefs);
    labelMap.forEach((labels, featureId) => {
      store.setFeatureTextLabels(featureId, labels);
    });
  }

  function resetToDefaults() {
    store.updateLayerDisplayPreferences(layerId, { ...DEFAULT_LAYER_DISPLAY_PREFERENCES });
  }

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-0 z-40 bg-gray-800 border border-gray-600 rounded-l-lg shadow-2xl overflow-hidden flex flex-col"
      style={{ width: 340, maxHeight: 'calc(100vh - 120px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0" style={{ background: '#1a1f2e' }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-sm border border-gray-500 shrink-0" style={{ backgroundColor: layer.color }} />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-white truncate">{layer.name}</div>
            <div className="text-[9px] text-gray-500">Layer Display Preferences</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip label="Reset" description="Reset all display preferences for this layer to defaults." side="left" delay={400}>
            <button
              onClick={resetToDefaults}
              className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <RotateCcw size={11} />
            </button>
          </Tooltip>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">

        {/* Line Display */}
        <Section title="Line Labels" defaultOpen>
          <Toggle
            label="Show Bearings"
            checked={prefs.showBearings}
            onChange={(v) => update({ showBearings: v })}
            tooltip="Display bearing text above each line segment, oriented along the line direction."
          />
          <Toggle
            label="Show Distances"
            checked={prefs.showDistances}
            onChange={(v) => update({ showDistances: v })}
            tooltip="Display distance text below each line segment, oriented along the line direction."
          />
          <Toggle
            label="Show Line Labels"
            checked={prefs.showLineLabels}
            onChange={(v) => update({ showLineLabels: v })}
            tooltip="Show any attached line labels or custom text."
          />

          {/* Gaps */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[9px] text-gray-500 w-20 shrink-0">Bearing Gap</span>
            <input
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={prefs.bearingTextGap}
              className="w-14 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none text-center"
              onChange={(e) => update({ bearingTextGap: parseFloat(e.target.value) || 3 })}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-500 w-20 shrink-0">Distance Gap</span>
            <input
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={prefs.distanceTextGap}
              className="w-14 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none text-center"
              onChange={(e) => update({ distanceTextGap: parseFloat(e.target.value) || 3 })}
            />
          </div>

          {prefs.showBearings && (
            <TextStyleEditor
              label="Bearing"
              style={prefs.bearingTextStyle}
              onChange={(s) => update({ bearingTextStyle: s })}
              layerColor={layer.color}
            />
          )}
          {prefs.showDistances && (
            <TextStyleEditor
              label="Distance"
              style={prefs.distanceTextStyle}
              onChange={(s) => update({ distanceTextStyle: s })}
              layerColor={layer.color}
            />
          )}
        </Section>

        {/* Point Display */}
        <Section title="Point Labels" defaultOpen>
          <Toggle
            label="Show Point Names"
            checked={prefs.showPointNames}
            onChange={(v) => update({ showPointNames: v })}
            tooltip="Display point name/number near each point on this layer."
          />
          <Toggle
            label="Show Descriptions"
            checked={prefs.showPointDescriptions}
            onChange={(v) => update({ showPointDescriptions: v })}
            tooltip="Display point description or code near each point."
          />
          <Toggle
            label="Show Elevations"
            checked={prefs.showPointElevations}
            onChange={(v) => update({ showPointElevations: v })}
            tooltip="Display elevation values near points that have elevation data."
          />
          <Toggle
            label="Show Coordinates"
            checked={prefs.showPointCoordinates}
            onChange={(v) => update({ showPointCoordinates: v })}
            tooltip="Display Northing/Easting coordinates near each point."
          />
          <Toggle
            label="Auto-Rotate Labels"
            checked={prefs.pointLabelAutoRotate}
            onChange={(v) => update({ pointLabelAutoRotate: v })}
            tooltip="Automatically rotate point labels to match nearby line orientation. Off = always upright."
          />

          {/* Point label offset */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[9px] text-gray-500 w-20 shrink-0">Label Offset X</span>
            <input
              type="number"
              step={1}
              value={prefs.pointLabelOffset.x}
              className="w-14 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none text-center"
              onChange={(e) => update({ pointLabelOffset: { ...prefs.pointLabelOffset, x: parseFloat(e.target.value) || 0 } })}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-500 w-20 shrink-0">Label Offset Y</span>
            <input
              type="number"
              step={1}
              value={prefs.pointLabelOffset.y}
              className="w-14 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none text-center"
              onChange={(e) => update({ pointLabelOffset: { ...prefs.pointLabelOffset, y: parseFloat(e.target.value) || 0 } })}
            />
          </div>

          {prefs.showPointNames && (
            <TextStyleEditor
              label="Point Name"
              style={prefs.pointNameTextStyle}
              onChange={(s) => update({ pointNameTextStyle: s })}
              layerColor={layer.color}
            />
          )}
          {prefs.showPointDescriptions && (
            <TextStyleEditor
              label="Description"
              style={prefs.pointDescriptionTextStyle}
              onChange={(s) => update({ pointDescriptionTextStyle: s })}
              layerColor={layer.color}
            />
          )}
          {prefs.showPointElevations && (
            <TextStyleEditor
              label="Elevation"
              style={prefs.pointElevationTextStyle}
              onChange={(s) => update({ pointElevationTextStyle: s })}
              layerColor={layer.color}
            />
          )}
          {prefs.showPointCoordinates && (
            <TextStyleEditor
              label="Coordinates"
              style={prefs.pointCoordinateTextStyle}
              onChange={(s) => update({ pointCoordinateTextStyle: s })}
              layerColor={layer.color}
            />
          )}
        </Section>

        {/* Polygon / Closed Shape Display */}
        <Section title="Area & Polygon Labels">
          <Toggle
            label="Show Area"
            checked={prefs.showArea}
            onChange={(v) => update({ showArea: v })}
            tooltip="Display computed area at the centroid of closed polygons."
          />
          <Toggle
            label="Show Perimeter"
            checked={prefs.showPerimeter}
            onChange={(v) => update({ showPerimeter: v })}
            tooltip="Display total perimeter of closed polygons."
          />
          {(prefs.showArea || prefs.showPerimeter) && (
            <TextStyleEditor
              label="Area/Perimeter"
              style={prefs.areaTextStyle}
              onChange={(s) => update({ areaTextStyle: s })}
              layerColor={layer.color}
            />
          )}
        </Section>

        {/* Format Overrides — per-layer override of drawing-level preferences */}
        <Section title="Format Overrides">
          <p className="text-[9px] text-gray-500 mb-1">
            Override drawing-level display formats for this layer. Leave as &quot;Inherit&quot; to use drawing defaults.
          </p>

          {/* Bearing format override */}
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="text-[10px] text-gray-400 w-20 shrink-0">Bearing</span>
            <select
              className="flex-1 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none"
              value={prefs.bearingFormatOverride ?? ''}
              onChange={(e) => update({ bearingFormatOverride: (e.target.value || null) as BearingFormat | null })}
            >
              <option value="">Inherit</option>
              <option value="QUADRANT">Quadrant (N 45°30&apos; E)</option>
              <option value="AZIMUTH">Azimuth (0-360°)</option>
            </select>
          </div>

          {/* Angle format override */}
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="text-[10px] text-gray-400 w-20 shrink-0">Angles</span>
            <select
              className="flex-1 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none"
              value={prefs.angleFormatOverride ?? ''}
              onChange={(e) => update({ angleFormatOverride: (e.target.value || null) as AngleFormat | null })}
            >
              <option value="">Inherit</option>
              <option value="DMS">DMS (45°30&apos;15&quot;)</option>
              <option value="DECIMAL_DEG">Decimal Degrees</option>
            </select>
          </div>

          {/* Linear unit override */}
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="text-[10px] text-gray-400 w-20 shrink-0">Distance</span>
            <select
              className="flex-1 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none"
              value={prefs.linearUnitOverride ?? ''}
              onChange={(e) => update({ linearUnitOverride: (e.target.value || null) as LinearUnit | null })}
            >
              <option value="">Inherit</option>
              <option value="FT">US Survey Feet</option>
              <option value="IN">Inches</option>
              <option value="MILE">Miles</option>
              <option value="M">Meters</option>
              <option value="CM">Centimeters</option>
              <option value="MM">Millimeters</option>
            </select>
          </div>

          {/* Linear format override */}
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="text-[10px] text-gray-400 w-20 shrink-0">Format</span>
            <select
              className="flex-1 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none"
              value={prefs.linearFormatOverride ?? ''}
              onChange={(e) => update({ linearFormatOverride: (e.target.value || null) as LinearFormat | null })}
            >
              <option value="">Inherit</option>
              <option value="DECIMAL">Decimal</option>
              <option value="FRACTION">Fraction</option>
            </select>
          </div>

          {/* Decimal places override */}
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="text-[10px] text-gray-400 w-20 shrink-0">Decimals</span>
            <select
              className="flex-1 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none"
              value={prefs.linearDecimalPlacesOverride ?? ''}
              onChange={(e) => update({ linearDecimalPlacesOverride: e.target.value ? parseInt(e.target.value) : null })}
            >
              <option value="">Inherit</option>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Area unit override */}
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="text-[10px] text-gray-400 w-20 shrink-0">Area</span>
            <select
              className="flex-1 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none"
              value={prefs.areaUnitOverride ?? ''}
              onChange={(e) => update({ areaUnitOverride: (e.target.value || null) as AreaUnit | null })}
            >
              <option value="">Inherit</option>
              <option value="SQ_FT">Square Feet</option>
              <option value="ACRES">Acres</option>
              <option value="SQ_M">Square Meters</option>
              <option value="HECTARES">Hectares</option>
            </select>
          </div>

          {/* Coordinate mode override */}
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="text-[10px] text-gray-400 w-20 shrink-0">Coords</span>
            <select
              className="flex-1 bg-gray-700 text-white text-[10px] rounded px-1 py-0.5 border border-gray-600 outline-none"
              value={prefs.coordModeOverride ?? ''}
              onChange={(e) => update({ coordModeOverride: (e.target.value || null) as CoordMode | null })}
            >
              <option value="">Inherit</option>
              <option value="NE">Northing / Easting</option>
              <option value="XY">X / Y</option>
            </select>
          </div>
        </Section>
      </div>

      {/* Footer: Apply to existing features button */}
      <div className="border-t border-gray-700 p-2 shrink-0" style={{ background: '#1a1f2e' }}>
        <button
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium rounded border border-blue-500 transition-colors shadow-sm"
          onClick={applyToExistingFeatures}
        >
          <Palette size={12} />
          Apply to Existing Features
        </button>
        <p className="text-[9px] text-gray-500 text-center mt-1">
          Regenerate labels for all features on this layer using current preferences.
        </p>
      </div>
    </div>
  );
}
