'use client';
// app/admin/cad/components/SettingsDialog.tsx — Drawing settings & preferences
// Comprehensive settings dialog covering all configurable options.

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Grid, Sliders, Palette, MousePointer2, Eye, Save, FileText, Crosshair, Keyboard } from 'lucide-react';
import { useDrawingStore, useHotkeysStore, useUIStore } from '@/lib/cad/store';
import type { SnapType } from '@/lib/cad/types';
import { DEFAULT_DRAWING_SETTINGS } from '@/lib/cad/constants';
import { DEFAULT_GLOBAL_STYLE_CONFIG } from '@/lib/cad/styles/types';
import { DEFAULT_ACTIONS } from '@/lib/cad/hotkeys/registry';
import { findHotkeyConflicts, findConflictForAction } from '@/lib/cad/hotkeys/conflicts';
import { applyHotkeyPreset } from '@/lib/cad/hotkeys/presets';
import { normalizeKeyboardEvent } from '@/lib/cad/hotkeys/key-format';
import type { ActionCategory, BindableAction } from '@/lib/cad/hotkeys/types';
import Tooltip from './Tooltip';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Props {
  onClose: () => void;
}

const ALL_SNAP_TYPES: { type: SnapType; label: string; description: string }[] = [
  { type: 'ENDPOINT', label: 'Endpoint', description: 'Snaps to line/segment endpoints and point features. The most commonly used snap — essential for connecting line segments accurately.' },
  { type: 'MIDPOINT', label: 'Midpoint', description: 'Snaps to the exact midpoint of any line segment. Useful for centering elements or placing features at the halfway mark.' },
  { type: 'INTERSECTION', label: 'Intersection', description: 'Snaps to the computed intersection point of two features. Automatically detects where lines, arcs, or polyline segments cross.' },
  { type: 'NEAREST', label: 'Nearest', description: 'Snaps to the closest point on any visible feature. Useful for placing features exactly on an existing line without needing a specific geometric point.' },
  { type: 'CENTER', label: 'Center', description: 'Snaps to the center point of arcs and circles. Useful for aligning elements to the center of curved features.' },
  { type: 'PERPENDICULAR', label: 'Perpendicular', description: 'Snaps to the point on a line that forms a 90-degree angle from the previous point. Essential for creating right-angle connections.' },
  { type: 'GRID', label: 'Grid', description: 'Snaps to the nearest grid intersection point. The grid spacing is configured in the Grid tab. Disable if you need freeform placement.' },
];

const TABS = ['Display', 'Grid', 'Appearance', 'Interaction', 'Snap', 'Labels', 'Auto-Save', 'Document', 'Hotkeys'] as const;
type Tab = typeof TABS[number];

// ── Toggle switch component ──────────────────────────────────────────────────
function Toggle({
  label,
  description,
  checked,
  onChange,
  tooltip,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  tooltip: string;
}) {
  return (
    <Tooltip label={label} description={tooltip} side="right" delay={400}>
      <div className="flex items-center justify-between gap-3 py-1">
        <div className="min-w-0">
          <div className="text-white font-medium text-xs">{label}</div>
          {description && <div className="text-gray-500 text-[10px] mt-0.5">{description}</div>}
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={checked}
            onChange={() => onChange(!checked)}
          />
          <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500" />
        </label>
      </div>
    </Tooltip>
  );
}

// ── Slider input ─────────────────────────────────────────────────────────────
function SliderInput({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  tooltip,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  tooltip: string;
}) {
  return (
    <Tooltip label={label} description={tooltip} side="right" delay={400}>
      <div className="py-1">
        <div className="flex items-center justify-between mb-1">
          <div>
            <span className="text-gray-400 text-xs">{label}</span>
            {description && <span className="text-gray-600 text-[10px] ml-1.5">{description}</span>}
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={value}
              className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-blue-500"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
              }}
            />
            {unit && <span className="text-gray-500 text-[10px]">{unit}</span>}
          </div>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          className="w-full h-1.5 bg-gray-600 rounded-full appearance-none cursor-pointer accent-blue-500"
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </div>
    </Tooltip>
  );
}

// ── Color picker row ─────────────────────────────────────────────────────────
function ColorRow({
  label,
  value,
  onChange,
  tooltip,
  preview,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tooltip: string;
  preview?: string;
}) {
  return (
    <Tooltip label={label} description={tooltip} side="right" delay={400}>
      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-gray-400 text-xs">{label}</span>
        <div className="flex items-center gap-2">
          {preview && <span className="text-gray-500 text-[10px]">{preview}</span>}
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              className="w-8 h-7 rounded cursor-pointer bg-transparent border border-gray-600 outline-none"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
            <span className="text-gray-300 font-mono text-[10px] w-16">{value}</span>
          </div>
        </div>
      </div>
    </Tooltip>
  );
}

// ── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, label, description }: { icon: React.ReactNode; label: string; description?: string }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5">
        <span className="text-blue-400">{icon}</span>
        <span className="text-white font-medium text-xs">{label}</span>
      </div>
      {description && <p className="text-gray-500 text-[10px] mt-1">{description}</p>}
    </div>
  );
}

// ── Button group ─────────────────────────────────────────────────────────────
function ButtonGroup<T extends string>({
  value,
  options,
  onChange,
  tooltip,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  tooltip?: string;
}) {
  const inner = (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
  if (tooltip) {
    return <Tooltip label="" description={tooltip} side="right" delay={400}>{inner}</Tooltip>;
  }
  return inner;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function SettingsDialog({ onClose }: Props) {
  useEscapeToClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const drawingStore = useDrawingStore();
  const { settings } = drawingStore.document;
  const gsc = drawingStore.document.globalStyleConfig;
  const [activeTab, setActiveTab] = useState<Tab>('Display');

  function toggleSnapType(type: SnapType) {
    const current = settings.snapTypes;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    drawingStore.updateSettings({ snapTypes: next });
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-[fadeIn_150ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-[540px] max-h-[85vh] flex flex-col text-sm text-gray-200 animate-[scaleIn_200ms_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-blue-400" />
            <h2 className="font-semibold text-white">Settings &amp; Preferences</h2>
          </div>
          <button className="text-gray-400 hover:text-white transition-colors" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Tab bar — scrollable for many tabs */}
        <div className="flex border-b border-gray-700 shrink-0 text-xs overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`px-3 py-2 transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'text-white border-b-2 border-blue-400 -mb-px'
                  : 'text-gray-400 hover:text-white'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4 text-xs">

          {/* ═══════════════════════ DISPLAY ═══════════════════════════════════ */}
          {activeTab === 'Display' && (
            <div className="space-y-4">
              <SectionHeader
                icon={<Eye size={12} />}
                label="Drawing Scale & Code Display"
                description="Set document-level display options that affect how features are rendered and labeled."
              />

              <div>
                <Tooltip label="Drawing Scale" description="Defines the paper-to-world scale ratio. For example, 1&quot;=50' means one inch on paper equals 50 feet in the real world. This affects dimension labels, text sizing, and print output." side="right" delay={400}>
                  <label className="block text-gray-400 mb-1">Drawing Scale</label>
                </Tooltip>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">1&quot; =</span>
                  <input
                    className="w-20 bg-gray-700 text-white rounded px-2 py-1 outline-none font-mono border border-gray-600 focus:border-blue-500"
                    type="number"
                    min="1"
                    step="1"
                    value={settings.drawingScale}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) drawingStore.updateSettings({ drawingScale: v });
                    }}
                  />
                  <span className="text-gray-400">feet</span>
                </div>
                <p className="text-gray-500 mt-1 text-[10px]">Common scales: 20 (site plan), 50 (boundary), 100 (topography), 200 (large areas)</p>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Tooltip label="Code Display Mode" description="Controls how field codes are displayed on point features. Alpha codes use short letter codes (e.g., IP, MON). Numeric codes use the original collector numbers." side="right" delay={400}>
                  <label className="block text-gray-400 mb-1.5">Code Display Mode</label>
                </Tooltip>
                <ButtonGroup
                  value={settings.codeDisplayMode}
                  options={[
                    { value: 'ALPHA', label: 'Alpha (IP, MON)' },
                    { value: 'NUMERIC', label: 'Numeric (101, 202)' },
                  ]}
                  onChange={(v) => drawingStore.updateSettings({ codeDisplayMode: v })}
                  tooltip="Alpha: Uses short alphabetic field codes. Numeric: Uses numeric code identifiers from the data collector."
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Tooltip label="Symbol Size Mode" description="Screen mode keeps symbols the same pixel size regardless of zoom. World mode scales symbols proportionally with the drawing zoom level." side="right" delay={400}>
                  <label className="block text-gray-400 mb-1.5">Symbol Size Mode</label>
                </Tooltip>
                <ButtonGroup
                  value={gsc.symbolSizeMode}
                  options={[
                    { value: 'SCREEN', label: 'Screen (fixed px)' },
                    { value: 'WORLD', label: 'World (scales with zoom)' },
                  ]}
                  onChange={(v) => drawingStore.updateGlobalStyleConfig({ symbolSizeMode: v })}
                  tooltip="Screen: Symbols stay the same size on screen no matter how far you zoom. World: Symbols grow and shrink as you zoom in and out."
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Tooltip label="Bearing Precision" description="Controls the precision of bearing angle display. Second precision shows degrees, minutes, and whole seconds. Tenth-second adds one decimal place for higher accuracy." side="right" delay={400}>
                  <label className="block text-gray-400 mb-1.5">Bearing Precision</label>
                </Tooltip>
                <ButtonGroup
                  value={gsc.bearingPrecision}
                  options={[
                    { value: 'SECOND', label: "Seconds (45\u00b030'15\")" },
                    { value: 'TENTH_SECOND', label: "Tenths (45\u00b030'15.3\")" },
                  ]}
                  onChange={(v) => drawingStore.updateGlobalStyleConfig({ bearingPrecision: v })}
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Tooltip label="Area Display" description="Controls how computed area values are shown in polygon properties, closure reports, and legal descriptions." side="right" delay={400}>
                  <label className="block text-gray-400 mb-1.5">Area Display Format</label>
                </Tooltip>
                <ButtonGroup
                  value={gsc.areaDisplay}
                  options={[
                    { value: 'SQFT_AND_ACRES', label: 'Sq Ft + Acres' },
                    { value: 'SQFT_ONLY', label: 'Sq Ft Only' },
                    { value: 'ACRES_ONLY', label: 'Acres Only' },
                  ]}
                  onChange={(v) => drawingStore.updateGlobalStyleConfig({ areaDisplay: v })}
                  tooltip="Sq Ft + Acres: Shows both (e.g., '43,560 sq ft / 1.000 ac'). Sq Ft Only: Just square footage. Acres Only: Just acreage."
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <SliderInput
                  label="Distance Precision"
                  description="(decimal places)"
                  value={gsc.distancePrecision}
                  onChange={(v) => drawingStore.updateGlobalStyleConfig({ distancePrecision: Math.round(v) })}
                  min={0}
                  max={6}
                  step={1}
                  tooltip="Number of decimal places shown for distance values in dimension labels, status bar readouts, and property panels. Default: 2"
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════ GRID ══════════════════════════════════════ */}
          {activeTab === 'Grid' && (
            <div className="space-y-3">
              <SectionHeader
                icon={<Grid size={12} />}
                label="Grid Configuration"
                description="Configure the reference grid displayed on the canvas. The grid helps with visual alignment and provides snap targets when grid snap is enabled."
              />

              <Toggle
                label="Show Grid"
                description="Display reference grid on the drawing canvas"
                checked={settings.gridVisible}
                onChange={(v) => drawingStore.updateSettings({ gridVisible: v })}
                tooltip="Toggle the visibility of the reference grid on the canvas. When hidden, grid snap still works if enabled. Shortcut: F7"
              />

              <div className="border-t border-gray-700 pt-3">
                <Tooltip label="Grid Style" description="Choose the visual style of grid markings. Dots are lightest on the eye, Lines show a full mesh, Crosshairs show small + marks at intersections." side="right" delay={400}>
                  <label className="block text-gray-400 mb-1.5">Grid Style</label>
                </Tooltip>
                <ButtonGroup
                  value={settings.gridStyle}
                  options={[
                    { value: 'DOTS', label: 'Dots' },
                    { value: 'LINES', label: 'Lines' },
                    { value: 'CROSSHAIRS', label: 'Crosshairs' },
                  ]}
                  onChange={(v) => drawingStore.updateSettings({ gridStyle: v })}
                  tooltip="Dots: Small dots at grid intersections (lightest visual weight). Lines: Full grid lines (best for precise alignment). Crosshairs: Small + marks at intersections (medium weight)."
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <SliderInput
                  label="Major Grid Spacing"
                  value={settings.gridMajorSpacing}
                  onChange={(v) => drawingStore.updateSettings({ gridMajorSpacing: v })}
                  min={1}
                  max={1000}
                  step={10}
                  unit="ft"
                  tooltip="Distance between major (darker) grid lines in survey feet. Major grid lines are drawn with a heavier weight to provide visual reference. Common values: 10 (detail), 50 (site), 100 (boundary)."
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <SliderInput
                  label="Minor Divisions"
                  description="per major interval"
                  value={settings.gridMinorDivisions}
                  onChange={(v) => drawingStore.updateSettings({ gridMinorDivisions: Math.max(1, Math.round(v)) })}
                  min={1}
                  max={50}
                  step={1}
                  tooltip="Number of minor subdivisions within each major grid interval. For example, with 100ft major spacing and 10 divisions, minor lines appear every 10ft. Set to 1 to show only major lines."
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════ APPEARANCE ════════════════════════════════ */}
          {activeTab === 'Appearance' && (
            <div className="space-y-4">
              <SectionHeader
                icon={<Palette size={12} />}
                label="Colors & Visual Appearance"
                description="Customize the colors used for selection highlights, grid, hover effects, and the canvas background. All changes take effect immediately."
              />

              <div className="space-y-0.5 bg-gray-750 rounded-lg p-3" style={{ background: '#1f2937' }}>
                <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Selection & Hover</div>
                <ColorRow
                  label="Selection Color"
                  value={settings.selectionColor ?? '#0088ff'}
                  onChange={(v) => drawingStore.updateSettings({ selectionColor: v })}
                  tooltip="The primary color for selected feature outlines, selection rectangle borders, and grip handle borders. This is the most prominent UI color in the CAD engine."
                />
                <ColorRow
                  label="Hover Highlight"
                  value={settings.hoverColor ?? '#66aaff'}
                  onChange={(v) => drawingStore.updateSettings({ hoverColor: v })}
                  tooltip="The glow color shown when the cursor hovers over a feature before clicking. A lighter shade of the selection color works best for visual consistency."
                />
                <ColorRow
                  label="Grip Fill"
                  value={settings.gripFillColor ?? '#ffffff'}
                  onChange={(v) => drawingStore.updateSettings({ gripFillColor: v })}
                  tooltip="The interior fill color of the small grip squares that appear at vertices and control points of selected features. White provides good contrast against most backgrounds."
                />
                <ColorRow
                  label="Grip Border"
                  value={settings.gripColor ?? '#0088ff'}
                  onChange={(v) => drawingStore.updateSettings({ gripColor: v })}
                  tooltip="The border color of grip squares. Usually matches the selection color for visual consistency."
                />
              </div>

              <div className="space-y-0.5 bg-gray-750 rounded-lg p-3" style={{ background: '#1f2937' }}>
                <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Grid Colors</div>
                <ColorRow
                  label="Major Grid"
                  value={settings.gridMajorColor ?? '#c8c8c8'}
                  onChange={(v) => drawingStore.updateSettings({ gridMajorColor: v })}
                  tooltip="Color of the major (larger interval) grid lines or dots. Should be more visible than minor grid but not overpowering. Darker colors work better on white backgrounds."
                  preview="Primary"
                />
                <ColorRow
                  label="Minor Grid"
                  value={settings.gridMinorColor ?? '#e8e8e8'}
                  onChange={(v) => drawingStore.updateSettings({ gridMinorColor: v })}
                  tooltip="Color of the minor (subdivision) grid markings. Should be subtler than the major grid to create a clear visual hierarchy."
                  preview="Subdivision"
                />
              </div>

              <div className="space-y-0.5 bg-gray-750 rounded-lg p-3" style={{ background: '#1f2937' }}>
                <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Canvas</div>
                <ColorRow
                  label="Background"
                  value={settings.backgroundColor}
                  onChange={(v) => drawingStore.updateSettings({ backgroundColor: v })}
                  tooltip="The background color of the drawing canvas. White (#FFFFFF) is the standard for printed survey drawings and legal documents. Dark backgrounds can reduce eye strain during long editing sessions."
                />
              </div>

              <div className="border-t border-gray-700 pt-3 space-y-2">
                <SliderInput
                  label="Selection Line Width"
                  value={settings.selectionLineWidth ?? 1.5}
                  onChange={(v) => drawingStore.updateSettings({ selectionLineWidth: v })}
                  min={0.5}
                  max={4}
                  step={0.5}
                  unit="px"
                  tooltip="Thickness of the selection outline drawn around selected features. Thicker lines are easier to see on high-DPI displays. Default: 1.5px"
                />
                <SliderInput
                  label="Grip Size"
                  value={settings.gripSize ?? 6}
                  onChange={(v) => drawingStore.updateSettings({ gripSize: Math.round(v) })}
                  min={3}
                  max={12}
                  step={1}
                  unit="px"
                  tooltip="Size of the small square handles that appear at vertices and control points of selected features. Larger grips are easier to click but take up more visual space. Default: 6px"
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Toggle
                  label="Hover Glow Effect"
                  description="Multi-layer glow highlight when hovering over features"
                  checked={settings.hoverGlowEnabled ?? true}
                  onChange={(v) => drawingStore.updateSettings({ hoverGlowEnabled: v })}
                  tooltip="When enabled, features display a professional multi-layer glow effect when the cursor hovers over them. The glow uses the Hover Highlight color. Disable if you prefer a cleaner look or need better performance."
                />
                {(settings.hoverGlowEnabled ?? true) && (
                  <SliderInput
                    label="Glow Intensity"
                    value={settings.hoverGlowIntensity ?? 1.0}
                    onChange={(v) => drawingStore.updateSettings({ hoverGlowIntensity: v })}
                    min={0.3}
                    max={2.0}
                    step={0.1}
                    tooltip="Controls the brightness and spread of the hover glow effect. Lower values create a subtle glow; higher values create a more dramatic highlight. Default: 1.0"
                  />
                )}
              </div>

              <div className="border-t border-gray-700 pt-2">
                <button
                  className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors underline"
                  onClick={() => {
                    drawingStore.updateSettings({
                      selectionColor: '#0088ff',
                      hoverColor: '#66aaff',
                      gridMajorColor: '#c8c8c8',
                      gridMinorColor: '#e8e8e8',
                      backgroundColor: '#FFFFFF',
                      gripColor: '#0088ff',
                      gripFillColor: '#ffffff',
                      selectionLineWidth: 1.5,
                      gripSize: 6,
                      hoverGlowEnabled: true,
                      hoverGlowIntensity: 1.0,
                    });
                  }}
                >
                  Reset all appearance settings to defaults
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════ INTERACTION ═══════════════════════════════ */}
          {activeTab === 'Interaction' && (
            <div className="space-y-4">
              <SectionHeader
                icon={<MousePointer2 size={12} />}
                label="Viewport & Interaction"
                description="Fine-tune how the canvas responds to mouse and scroll input. Adjust zoom speed, pan sensitivity, and drag behavior to match your workflow."
              />

              <div className="space-y-2">
                <SliderInput
                  label="Zoom Speed"
                  value={settings.zoomSpeed ?? 1.0}
                  onChange={(v) => drawingStore.updateSettings({ zoomSpeed: v })}
                  min={0.2}
                  max={3.0}
                  step={0.1}
                  tooltip="Controls how fast the view zooms in/out when scrolling. Lower values give finer control, higher values zoom more per scroll tick. Set to 0.5 for precise work, 2.0 for fast navigation. Default: 1.0"
                />
                <SliderInput
                  label="Pan Speed"
                  value={settings.panSpeed ?? 1.0}
                  onChange={(v) => drawingStore.updateSettings({ panSpeed: v })}
                  min={0.2}
                  max={3.0}
                  step={0.1}
                  tooltip="Controls how fast the canvas pans when click-dragging on empty space. Lower values give finer positional control, higher values move the viewport faster. Default: 1.0"
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Toggle
                  label="Zoom Toward Cursor"
                  description="Center zoom on cursor position instead of viewport center"
                  checked={settings.zoomTowardCursor ?? true}
                  onChange={(v) => drawingStore.updateSettings({ zoomTowardCursor: v })}
                  tooltip="When enabled, scrolling to zoom centers on the cursor position, making it easy to zoom into a specific area. When disabled, zoom always centers on the middle of the viewport. Most CAD users prefer cursor-centered zoom."
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Toggle
                  label="Invert Scroll Zoom"
                  description="Scroll up = zoom out, scroll down = zoom in"
                  checked={settings.invertScrollZoom ?? false}
                  onChange={(v) => drawingStore.updateSettings({ invertScrollZoom: v })}
                  tooltip="Reverses the zoom direction when scrolling. Default (off): scroll up zooms in. Inverted (on): scroll up zooms out. Some users prefer inverted zoom if they're used to 'pushing away' to zoom out."
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <SliderInput
                  label="Drag Threshold"
                  value={settings.dragThreshold ?? 5}
                  onChange={(v) => drawingStore.updateSettings({ dragThreshold: Math.round(v) })}
                  min={1}
                  max={15}
                  step={1}
                  unit="px"
                  tooltip="Minimum number of pixels the mouse must move after a click before it's treated as a drag operation instead of a click. Higher values prevent accidental drags but add a slight delay. Default: 5px"
                />
              </div>

              <div className="border-t border-gray-700 pt-3 space-y-2">
                <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">Selection Behavior</div>

                <Tooltip label="Group Select Mode" description="Controls how clicking on a grouped element (polyline, polygon composed of segments) behaves." side="right" delay={400}>
                  <label className="block text-gray-400 mb-1">Group Select Mode</label>
                </Tooltip>
                <ButtonGroup
                  value={settings.groupSelectMode ?? 'GROUP_FIRST'}
                  options={[
                    { value: 'GROUP_FIRST', label: 'Group First' },
                    { value: 'ELEMENT_FIRST', label: 'Element First' },
                  ]}
                  onChange={(v) => drawingStore.updateSettings({ groupSelectMode: v })}
                  tooltip="Group First: Clicking a polyline segment selects the entire polyline group. Click again on a specific segment to drill down to just that piece. Element First: Clicking always selects only the individual segment. Use right-click > 'Select Group' to get the whole polyline."
                />

                <div className="pt-2">
                  <Tooltip label="Box Select Mode" description="Controls how the selection rectangle (drag-to-select) picks features and handles grouped elements." side="right" delay={400}>
                    <label className="block text-gray-400 mb-1">Box Select Mode</label>
                  </Tooltip>
                  <ButtonGroup
                    value={settings.boxSelectMode ?? 'CROSSING_EXPAND_GROUPS'}
                    options={[
                      { value: 'CROSSING_EXPAND_GROUPS', label: 'Crossing + Groups' },
                      { value: 'CROSSING_INDIVIDUAL', label: 'Crossing Only' },
                      { value: 'WINDOW_FULL_ONLY', label: 'Full Enclosure' },
                    ]}
                    onChange={(v) => drawingStore.updateSettings({ boxSelectMode: v })}
                    tooltip="Crossing + Groups: Any overlap selects the feature AND expands to include all members of its polyline/polygon group. Crossing Only: Any overlap selects just the individual element without group expansion. Full Enclosure: Only features completely inside the rectangle are selected."
                  />
                </div>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <SliderInput
                  label="Cursor Crosshair Size"
                  value={settings.cursorCrosshairSize ?? 24}
                  onChange={(v) => drawingStore.updateSettings({ cursorCrosshairSize: Math.round(v) })}
                  min={16}
                  max={48}
                  step={2}
                  unit="px"
                  tooltip="Size of the crosshair cursor used for drawing tools (line, polyline, polygon, etc.). Larger crosshairs are easier to see but may obscure nearby elements. Default: 24px"
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Toggle
                  label="Show Cursor Coordinates"
                  description="Display live coordinate readout near the cursor"
                  checked={settings.showCursorCoordinates ?? false}
                  onChange={(v) => drawingStore.updateSettings({ showCursorCoordinates: v })}
                  tooltip="When enabled, a small coordinate readout follows the cursor showing the current world position (Northing/Easting or X/Y depending on your coordinate mode setting). Useful for precision placement without looking at the status bar."
                />
              </div>

              <div className="border-t border-gray-700 pt-2">
                <button
                  className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors underline"
                  onClick={() => {
                    drawingStore.updateSettings({
                      zoomSpeed: 1.0,
                      panSpeed: 1.0,
                      zoomTowardCursor: true,
                      invertScrollZoom: false,
                      dragThreshold: 5,
                      cursorCrosshairSize: 24,
                      showCursorCoordinates: false,
                      groupSelectMode: 'GROUP_FIRST',
                      boxSelectMode: 'CROSSING_EXPAND_GROUPS',
                    });
                  }}
                >
                  Reset interaction settings to defaults
                </button>
              </div>

              {/* Tooltip delay — global hover delay before any
                  Tooltip appears. Persisted in localStorage via
                  the ui-store partialize allow-list, takes
                  effect immediately. */}
              <TooltipDelaySection />
            </div>
          )}

          {/* ═══════════════════════ SNAP ══════════════════════════════════════ */}
          {activeTab === 'Snap' && (
            <div className="space-y-3">
              <SectionHeader
                icon={<Crosshair size={12} />}
                label="Object Snap (OSNAP)"
                description="Configure automatic snapping to geometric points on existing features. When enabled, the cursor automatically locks to nearby snap points while drawing or placing features. Toggle snap on/off with F3."
              />

              <Toggle
                label="Snap Enabled"
                description="Automatically snap cursor to geometric points (F3)"
                checked={settings.snapEnabled}
                onChange={(v) => drawingStore.updateSettings({ snapEnabled: v })}
                tooltip="Master toggle for object snap. When disabled, the cursor moves freely without snapping to any geometric points. You can also toggle this quickly with the F3 key during drawing."
              />

              <div className="border-t border-gray-700 pt-3">
                <SliderInput
                  label="Snap Radius"
                  description="(detection range)"
                  value={settings.snapRadius}
                  onChange={(v) => drawingStore.updateSettings({ snapRadius: Math.max(5, Math.min(50, Math.round(v))) })}
                  min={5}
                  max={50}
                  step={1}
                  unit="px"
                  tooltip="The maximum distance in screen pixels between the cursor and a snap point for snap to activate. Larger values make snapping easier to trigger but may snap to unintended points in dense drawings. Default: 15px"
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400">Active Snap Types</span>
                  <div className="flex gap-1">
                    <button
                      className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                      onClick={() => drawingStore.updateSettings({ snapTypes: ALL_SNAP_TYPES.map(s => s.type) })}
                    >
                      Enable All
                    </button>
                    <span className="text-gray-600">|</span>
                    <button
                      className="text-[10px] text-gray-400 hover:text-gray-300 transition-colors"
                      onClick={() => drawingStore.updateSettings({ snapTypes: [] })}
                    >
                      Disable All
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {ALL_SNAP_TYPES.map(({ type, label, description }) => (
                    <Tooltip key={type} label={label} description={description} side="right" delay={300}>
                      <label className="flex items-start gap-2.5 cursor-pointer group py-0.5">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-blue-500"
                          checked={settings.snapTypes.includes(type)}
                          onChange={() => toggleSnapType(type)}
                        />
                        <div className="min-w-0">
                          <span className="text-white group-hover:text-blue-300 transition-colors text-xs">{label}</span>
                          <p className="text-gray-500 text-[10px] leading-tight">{description}</p>
                        </div>
                      </label>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════ LABELS ════════════════════════════════════ */}
          {activeTab === 'Labels' && (
            <div className="space-y-4">
              <SectionHeader
                icon={<Eye size={12} />}
                label="Labels & Annotations"
                description="Control which labels and annotations are shown on the canvas. These settings affect the visual display of text next to features."
              />

              <Toggle
                label="Show Point Labels"
                description="Display labels on point features (code, description, elevation)"
                checked={settings.showPointLabels ?? true}
                onChange={(v) => drawingStore.updateSettings({ showPointLabels: v })}
                tooltip="When enabled, point features display their field code label (e.g., 'IP', 'MON', 'TREE') next to the point symbol. Disable to reduce visual clutter on dense drawings. Individual point labels can still be toggled per-feature in the property panel."
              />

              <div className="border-t border-gray-700 pt-3">
                <Toggle
                  label="Show Line Labels"
                  description="Display bearing and distance labels on line segments"
                  checked={settings.showLineLabels ?? true}
                  onChange={(v) => drawingStore.updateSettings({ showLineLabels: v })}
                  tooltip="When enabled, line segments and polyline edges display their bearing and distance as text labels along the line. Essential for survey plat review but can clutter the view on complex drawings. Bearing format is controlled in the Display Preferences panel."
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Toggle
                  label="Show Dimensions"
                  description="Display dimension annotations (length, angle, area)"
                  checked={settings.showDimensions ?? true}
                  onChange={(v) => drawingStore.updateSettings({ showDimensions: v })}
                  tooltip="When enabled, dimension annotations created with the Dimension tool are visible on the canvas. Disable to temporarily hide all dimensions without deleting them. Useful for cleaner views during editing."
                />
              </div>

              <div className="border-t border-gray-700 pt-3 space-y-2">
                <Tooltip label="Default Font" description="The default typeface used for labels and annotations on the canvas." side="right" delay={400}>
                  <label className="block text-gray-400 mb-1">Default Label Font</label>
                </Tooltip>
                <select
                  className="w-full bg-gray-700 text-white rounded px-2 py-1.5 outline-none border border-gray-600 focus:border-blue-500 text-xs"
                  value={gsc.defaultFont}
                  onChange={(e) => drawingStore.updateGlobalStyleConfig({ defaultFont: e.target.value })}
                >
                  <option value="Arial">Arial</option>
                  <option value="Helvetica">Helvetica</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Courier New">Courier New (Monospace)</option>
                  <option value="Verdana">Verdana</option>
                  <option value="Georgia">Georgia</option>
                </select>
                <p className="text-gray-500 text-[10px]">Font used for point labels, dimension text, and other annotations. Arial is the standard for survey plats.</p>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <SliderInput
                  label="Default Font Size"
                  value={gsc.defaultFontSize}
                  onChange={(v) => drawingStore.updateGlobalStyleConfig({ defaultFontSize: Math.round(v) })}
                  min={4}
                  max={24}
                  step={1}
                  unit="pt"
                  tooltip="Base font size for labels in points. This is the size at the drawing scale (1&quot;=scale). At 1:1 view, text will appear at this size. When zoomed, text scales accordingly if symbol size mode is set to World. Default: 8pt"
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════ AUTO-SAVE ═════════════════════════════════ */}
          {activeTab === 'Auto-Save' && (
            <div className="space-y-4">
              <SectionHeader
                icon={<Save size={12} />}
                label="Auto-Save & Recovery"
                description="Configure automatic saving to prevent data loss. Auto-save periodically stores the current drawing state to the browser's local storage."
              />

              <Toggle
                label="Enable Auto-Save"
                description="Periodically save drawing state to prevent data loss"
                checked={settings.autoSaveEnabled ?? true}
                onChange={(v) => drawingStore.updateSettings({ autoSaveEnabled: v })}
                tooltip="When enabled, the drawing is automatically saved at the configured interval. The auto-save writes to browser local storage and can recover your work if the browser tab closes unexpectedly. Strongly recommended to keep this enabled."
              />

              {(settings.autoSaveEnabled ?? true) && (
                <div className="border-t border-gray-700 pt-3">
                  <SliderInput
                    label="Auto-Save Interval"
                    value={settings.autoSaveIntervalSec ?? 120}
                    onChange={(v) => drawingStore.updateSettings({ autoSaveIntervalSec: Math.round(v) })}
                    min={30}
                    max={600}
                    step={30}
                    unit="sec"
                    tooltip="How often to automatically save the drawing (in seconds). Shorter intervals provide more protection but may cause brief pauses on very large drawings. Default: 120 seconds (2 minutes). Range: 30 seconds to 10 minutes."
                  />
                  <p className="text-gray-500 text-[10px] mt-1">
                    {settings.autoSaveIntervalSec <= 60
                      ? 'Frequent saves — best protection, may impact performance on large drawings.'
                      : settings.autoSaveIntervalSec <= 180
                      ? 'Balanced — good protection with minimal performance impact.'
                      : 'Infrequent saves — best performance, but more work may be lost if the browser closes.'}
                  </p>
                </div>
              )}

              <div className="border-t border-gray-700 pt-3">
                <p className="text-gray-500 text-[10px]">
                  Auto-save stores a snapshot of your drawing in the browser. It does <strong className="text-gray-400">not</strong> replace
                  manual file saves (Ctrl+S). For permanent storage, always save your drawing to a file.
                </p>
              </div>
            </div>
          )}

          {/* ═══════════════════════ DOCUMENT ══════════════════════════════════ */}
          {activeTab === 'Document' && (
            <div className="space-y-3">
              <SectionHeader
                icon={<FileText size={12} />}
                label="Document Properties"
                description="Set metadata and paper layout for this drawing document. These properties appear in exported files and print layouts."
              />

              <div>
                <Tooltip label="Document Name" description="The name of this drawing. Appears in the title bar, export filenames, and print headers." side="right" delay={400}>
                  <label className="block text-gray-400 mb-1">Document Name</label>
                </Tooltip>
                <input
                  className="w-full bg-gray-700 text-white rounded px-2 py-1.5 outline-none border border-gray-600 focus:border-blue-500"
                  value={drawingStore.document.name}
                  onChange={(e) => drawingStore.updateDocumentName(e.target.value)}
                  placeholder="Untitled Drawing"
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Tooltip label="Author" description="The name of the person or firm who created this drawing. Appears in file metadata and can be placed in title blocks." side="right" delay={400}>
                  <label className="block text-gray-400 mb-1">Author</label>
                </Tooltip>
                <input
                  className="w-full bg-gray-700 text-white rounded px-2 py-1.5 outline-none border border-gray-600 focus:border-blue-500"
                  value={drawingStore.document.author}
                  onChange={(e) => drawingStore.updateDocumentAuthor(e.target.value)}
                  placeholder="Your name or firm"
                />
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Tooltip label="Paper Size" description="The physical sheet size for printing and PDF export. This determines the printable area and affects how the drawing scale maps to physical dimensions." side="right" delay={400}>
                  <label className="block text-gray-400 mb-1">Paper Size</label>
                </Tooltip>
                <select
                  className="w-full bg-gray-700 text-white rounded px-2 py-1.5 outline-none border border-gray-600 focus:border-blue-500"
                  value={settings.paperSize}
                  onChange={(e) =>
                    drawingStore.updateSettings({
                      paperSize: e.target.value as typeof settings.paperSize,
                    })
                  }
                >
                  <option value="LETTER">Letter (8.5&quot; x 11&quot;)</option>
                  <option value="TABLOID">Tabloid (11&quot; x 17&quot;) — Most Common</option>
                  <option value="ARCH_C">Arch C (18&quot; x 24&quot;)</option>
                  <option value="ARCH_D">Arch D (24&quot; x 36&quot;) — Standard Survey</option>
                  <option value="ARCH_E">Arch E (36&quot; x 48&quot;)</option>
                </select>
                <p className="text-gray-500 text-[10px] mt-1">
                  Arch D (24&quot;x36&quot;) is the industry standard for boundary survey plats. Tabloid (11&quot;x17&quot;) is common for sketches and field prints.
                </p>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <Tooltip label="Orientation" description="Portrait: taller than wide. Landscape: wider than tall. Most survey drawings use landscape orientation." side="right" delay={400}>
                  <label className="block text-gray-400 mb-1.5">Orientation</label>
                </Tooltip>
                <ButtonGroup
                  value={settings.paperOrientation}
                  options={[
                    { value: 'PORTRAIT', label: 'Portrait' },
                    { value: 'LANDSCAPE', label: 'Landscape' },
                  ]}
                  onChange={(v) => drawingStore.updateSettings({ paperOrientation: v })}
                  tooltip="Portrait: Sheet is taller than wide. Landscape: Sheet is wider than tall. Most survey and engineering drawings use landscape orientation."
                />
              </div>

              <FirmLogoSection />

              <div className="border-t border-gray-700 pt-3 text-gray-500 text-[10px] space-y-1">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-600 mb-1">Document Info</div>
                <div className="flex justify-between">
                  <span>Created:</span>
                  <span className="text-gray-400">{new Date(drawingStore.document.created).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Modified:</span>
                  <span className="text-gray-400">{new Date(drawingStore.document.modified).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Document ID:</span>
                  <span className="font-mono text-gray-400">{drawingStore.document.id.slice(0, 12)}...</span>
                </div>
                <div className="flex justify-between">
                  <span>Features:</span>
                  <span className="text-gray-400">{Object.keys(drawingStore.document.features).length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Layers:</span>
                  <span className="text-gray-400">{drawingStore.document.layerOrder.length}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Hotkeys' && <HotkeysTab />}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-700 text-gray-500 text-[10px] shrink-0 flex justify-between items-center">
          <span>Changes apply immediately — no save required</span>
          <button
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors text-xs"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tooltip delay slider — pulled from the persisted ui-store
// so changes survive a refresh. Tooltips that pass an explicit
// `delay` prop override this; everything else uses it as the
// default.
// ────────────────────────────────────────────────────────────

function TooltipDelaySection() {
  const tooltipDelay = useUIStore((s) => s.tooltipDelayMs);
  const setTooltipDelay = useUIStore((s) => s.setTooltipDelayMs);
  return (
    <div className="border-t border-gray-700 pt-3">
      <SliderInput
        label="Tooltip Delay"
        description="(milliseconds before any tooltip appears)"
        value={tooltipDelay}
        onChange={(v) => setTooltipDelay(v)}
        min={100}
        max={3000}
        step={50}
        tooltip="Global hover delay (in ms) for every tooltip in the app — toolbar buttons, layer rows, settings labels, command-bar hints. Range 100 ms (very fast) to 3000 ms (long pause). Persists across browser refreshes."
      />
      <p className="text-gray-500 mt-1 text-[10px]">
        Tooltips that pass an explicit delay (e.g. the canvas feature-hover info) override this global default.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Firm logo section — uploads a PNG / JPG / SVG and stores
// it as a base64 data URL in `useUIStore.firmLogoDataUrl`
// (persisted via the ui-store partialize allow-list). The
// logo is firm-wide rather than per-document, so it shows
// on every drawing's title block header until the surveyor
// clears it. Raster images are downscaled through a canvas
// to a max edge of 256 px before being stored — keeps the
// localStorage footprint tiny while still rendering crisply
// in the title block (which is at most ~1 inch tall).
// ────────────────────────────────────────────────────────────

const LOGO_MAX_EDGE_PX = 256;

async function fileToLogoDataUrl(file: File): Promise<string | null> {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  // SVGs are vector — keep them as-is so they stay sharp.
  if (isSvg) {
    return new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    });
  }
  // Raster — load → downscale via canvas → re-encode as PNG
  // (PNG preserves transparency; logos typically have it).
  return new Promise<string | null>((resolve) => {
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result !== 'string') {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, LOGO_MAX_EDGE_PX / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(r.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(r.result as string);
        }
      };
      img.onerror = () => resolve(null);
      img.src = r.result;
    };
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}

function FirmLogoSection() {
  const firmLogoDataUrl = useUIStore((s) => s.firmLogoDataUrl);
  const setFirmLogoDataUrl = useUIStore((s) => s.setFirmLogoDataUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setError(null);
    if (!/^image\//.test(file.type) && !/\.(png|jpe?g|svg)$/i.test(file.name)) {
      setError('Please choose a PNG, JPG, or SVG image.');
      return;
    }
    const dataUrl = await fileToLogoDataUrl(file);
    if (!dataUrl) {
      setError('Failed to read the image — try a different file.');
      return;
    }
    setFirmLogoDataUrl(dataUrl);
  };

  return (
    <div className="border-t border-gray-700 pt-3">
      <Tooltip
        label="Firm Logo"
        description="Upload your firm's logo (PNG, JPG, or SVG). It replaces the firm-name text in every drawing's title block header until cleared. Stored locally in your browser, so it persists across reloads but doesn't sync to other devices."
        side="right"
        delay={400}
      >
        <label className="block text-gray-400 mb-1.5">Firm Logo</label>
      </Tooltip>
      <div className="flex items-center gap-3">
        <div className="w-20 h-12 bg-gray-900 border border-gray-700 rounded flex items-center justify-center overflow-hidden">
          {firmLogoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={firmLogoDataUrl}
              alt="Firm logo preview"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <span className="text-[9px] uppercase tracking-wider text-gray-600">No Logo</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              // Reset so picking the same file twice still fires
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
          <button
            type="button"
            className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {firmLogoDataUrl ? 'Replace…' : 'Upload Logo…'}
          </button>
          {firmLogoDataUrl && (
            <button
              type="button"
              className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-red-900/40 hover:border-red-800/60 hover:text-red-300 transition-colors"
              onClick={() => setFirmLogoDataUrl(null)}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-red-400 text-[10px] mt-1.5">{error}</p>}
      <p className="text-gray-500 text-[10px] mt-1.5 leading-relaxed">
        Raster logos are downscaled to {LOGO_MAX_EDGE_PX} px on the longest edge before storing — plenty of resolution for the title block, with a small enough footprint to fit in browser storage.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Hotkeys tab — categorised list of every bindable action
// with its current key (default OR user override) and a
// red badge on conflicts. Click any key badge to enter
// capture mode; the next non-modifier keydown becomes the
// new binding. If the captured key is already in use by
// another action in an overlapping context the displaced
// action is automatically unbound — the conflict is
// resolved on the spot rather than left as a red badge for
// the surveyor to chase. Esc cancels capture; Backspace /
// Delete clear the binding. Cross-session persistence
// flows through `useHotkeysStore`'s `persist` middleware.
// ────────────────────────────────────────────────────────────

const CATEGORY_ORDER_HK: ActionCategory[] = [
  'FILE', 'EDIT', 'TOOLS', 'DRAW', 'MODIFY', 'SELECTION',
  'ZOOM_PAN', 'VIEW', 'SNAP', 'LAYERS', 'ANNOTATIONS',
  'SURVEY_MATH', 'AI', 'APP',
];

const CATEGORY_LABEL_HK: Record<ActionCategory, string> = {
  FILE: 'File',
  EDIT: 'Edit',
  TOOLS: 'Tools',
  DRAW: 'Draw',
  MODIFY: 'Modify',
  SELECTION: 'Selection',
  ZOOM_PAN: 'Zoom & Pan',
  VIEW: 'View',
  SNAP: 'Snap',
  LAYERS: 'Layers',
  ANNOTATIONS: 'Annotations',
  SURVEY_MATH: 'Survey Math',
  AI: 'AI',
  APP: 'App',
};

function HotkeysTab() {
  const userBindings = useHotkeysStore((s) => s.userBindings);
  const setBinding = useHotkeysStore((s) => s.setBinding);
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflicts = useMemo(
    () => findHotkeyConflicts(DEFAULT_ACTIONS, userBindings),
    [userBindings],
  );
  const activeKeys = useMemo(() => {
    const out: Record<string, string> = {};
    for (const a of DEFAULT_ACTIONS) {
      if (a.defaultKey) out[a.id] = a.defaultKey;
    }
    for (const u of userBindings) {
      if (u.key) out[u.actionId] = u.key;
      else delete out[u.actionId];
    }
    return out;
  }, [userBindings]);
  const grouped = useMemo(() => {
    const map = new Map<ActionCategory, BindableAction[]>();
    for (const a of DEFAULT_ACTIONS) {
      const arr = map.get(a.category) ?? [];
      arr.push(a);
      map.set(a.category, arr);
    }
    return map;
  }, []);

  // Show a status line for ~3 s after a successful capture so
  // the surveyor sees that conflicts were auto-resolved.
  const flashStatus = (msg: string) => {
    setStatusMsg(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatusMsg(null), 3500);
  };

  // Capture-mode key listener. Mounted only while a row is in
  // capture mode; uses the capture phase + stopPropagation so
  // the global hotkey engine doesn't also fire on the keypress
  // we're trying to rebind.
  useEffect(() => {
    if (!capturingId) return;
    const targetAction = DEFAULT_ACTIONS.find((a) => a.id === capturingId);
    if (!targetAction) return;

    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Esc cancels capture without writing a binding.
      if (event.key === 'Escape') {
        setCapturingId(null);
        return;
      }
      // Backspace / Delete clears the binding for this action.
      if (event.key === 'Backspace' || event.key === 'Delete') {
        setBinding(capturingId, null);
        flashStatus(`Cleared binding for "${targetAction.label}".`);
        setCapturingId(null);
        return;
      }

      const norm = normalizeKeyboardEvent(event);
      // Ignore pure modifier presses — keep listening so the
      // surveyor can still hold Ctrl while choosing the final
      // key.
      if (norm.isModifierOnly || !norm.base) return;

      const newKey = norm.key;
      // Find any other action that currently owns this key in
      // an overlapping context — that's the one we'll have to
      // displace to satisfy "reassign updates both bindings".
      const displaced: { id: string; label: string }[] = [];
      for (const other of DEFAULT_ACTIONS) {
        if (other.id === capturingId) continue;
        if (activeKeys[other.id] !== newKey) continue;
        if (
          other.context === targetAction.context ||
          other.context === 'GLOBAL' ||
          targetAction.context === 'GLOBAL'
        ) {
          displaced.push({ id: other.id, label: other.label });
        }
      }

      // Order matters — clear the displaced bindings first so
      // there's no transient state where two actions share the
      // key. (zustand batches synchronous sets, but we're
      // explicit here for clarity.)
      for (const d of displaced) setBinding(d.id, null);
      setBinding(capturingId, newKey);

      if (displaced.length === 0) {
        flashStatus(`Bound "${targetAction.label}" → ${formatHotkeyDisplay(newKey)}.`);
      } else {
        const names = displaced.map((d) => `"${d.label}"`).join(', ');
        flashStatus(`Bound "${targetAction.label}" → ${formatHotkeyDisplay(newKey)}. Unbound ${names}.`);
      }
      setCapturingId(null);
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturingId, setBinding, activeKeys]);

  return (
    <div className="space-y-3 animate-[fadeIn_150ms_ease-out]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
          <Keyboard size={14} />
          Keyboard Shortcuts
        </h3>
        <div className="flex items-center gap-2">
          {conflicts.length > 0 && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-900/40 border border-red-800/60 text-red-300 font-semibold">
              {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
            </span>
          )}
          <button
            type="button"
            className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
            onClick={() => applyHotkeyPreset('AUTOCAD')}
            title="Replace bindings with AutoCAD-style aliases (L for line, M for move, etc.)"
          >
            Apply AutoCAD Preset
          </button>
          <button
            type="button"
            className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
            onClick={() => applyHotkeyPreset('DEFAULT')}
            title="Clear every customisation and fall back to registry defaults"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
      <p className="text-[10px] text-gray-500 leading-relaxed">
        Click any shortcut to rebind it — the next key you press becomes the new binding. If the chosen key is already in use, the displaced action is unbound automatically so the conflict is resolved in one step. Press <kbd className="font-mono px-1 rounded bg-gray-800 border border-gray-700">Esc</kbd> to cancel, <kbd className="font-mono px-1 rounded bg-gray-800 border border-gray-700">Backspace</kbd> to clear. Bindings persist across reloads.
      </p>
      {statusMsg && (
        <div className="text-[11px] px-2 py-1 rounded bg-blue-900/30 border border-blue-800/60 text-blue-200 animate-[fadeIn_150ms_ease-out]">
          {statusMsg}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {CATEGORY_ORDER_HK.map((cat) => {
          const actions = grouped.get(cat);
          if (!actions || actions.length === 0) return null;
          return (
            <section key={cat}>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                {CATEGORY_LABEL_HK[cat]}
              </div>
              <div className="space-y-0.5">
                {actions.map((a) => {
                  const key = activeKeys[a.id];
                  const conflict = findConflictForAction(a.id, conflicts);
                  const isCapturing = capturingId === a.id;
                  const badgeBase = 'rounded px-1.5 py-0.5 text-[10px] font-mono shrink-0 border transition-colors';
                  let badgeClass: string;
                  if (isCapturing) {
                    badgeClass = `${badgeBase} bg-blue-900/40 border-blue-700 text-blue-200 animate-pulse`;
                  } else if (conflict) {
                    badgeClass = `${badgeBase} bg-red-900/40 border-red-800/60 text-red-300 hover:bg-red-900/60 cursor-pointer`;
                  } else if (!key) {
                    badgeClass = `${badgeBase} bg-gray-900 border-gray-800 text-gray-600 hover:bg-gray-800 hover:text-gray-400 cursor-pointer italic`;
                  } else {
                    badgeClass = `${badgeBase} bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white cursor-pointer`;
                  }
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 text-[11px] py-0.5"
                      title={
                        conflict
                          ? `Conflict: also fires ${conflict.actionIds.filter((id) => id !== a.id).join(', ')} in the ${conflict.context.toLowerCase()} context. Click to rebind.`
                          : 'Click to rebind'
                      }
                    >
                      <span className={`truncate ${conflict ? 'text-red-300' : 'text-gray-300'}`}>{a.label}</span>
                      <button
                        type="button"
                        className={badgeClass}
                        onClick={() => setCapturingId(isCapturing ? null : a.id)}
                      >
                        {isCapturing ? 'Press a key…' : key ? formatHotkeyDisplay(key) : 'unbound'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function formatHotkeyDisplay(s: string): string {
  return s
    .split(' ')
    .map((step) =>
      step
        .split('+')
        .map((part) => {
          const p = part.trim();
          if (p === 'ctrl') return 'Ctrl';
          if (p === 'shift') return 'Shift';
          if (p === 'alt') return 'Alt';
          if (p === 'meta') return '⌘';
          if (p === 'escape') return 'Esc';
          if (p === 'space') return 'Space';
          if (p === 'comma') return ',';
          if (p === 'period') return '.';
          if (p === 'slash') return '/';
          if (p === 'backslash') return '\\';
          if (p === 'minus') return '-';
          if (p === 'equal') return '=';
          if (p === 'leftbracket') return '[';
          if (p === 'rightbracket') return ']';
          if (p === 'semicolon') return ';';
          if (p === 'quote') return "'";
          if (p === 'backtick') return '`';
          if (p === 'delete') return 'Del';
          if (p.length === 1) return p.toUpperCase();
          return p;
        })
        .join('+')
    )
    .join(' ');
}
