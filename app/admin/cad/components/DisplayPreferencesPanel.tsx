'use client';
// app/admin/cad/components/DisplayPreferencesPanel.tsx
// Quick-access sliding preferences panel tucked below the ToolOptionsBar.
// Toggled open/closed by the "Prefs" button rendered in CADLayout.

import { useState, useRef, useEffect } from 'react';
import { Settings2, X, ChevronDown, RotateCcw } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/cad/constants';
import type {
  DisplayPreferences,
  LinearUnit,
  LinearFormat,
  AreaUnit,
  AngleFormat,
  BearingFormat,
  CoordMode,
} from '@/lib/cad/types';
import Tooltip from './Tooltip';

interface Props {
  open: boolean;
  onClose: () => void;
}

// ── Compact radio-group button row ───────────────────────────────────────────
function OptionRow<T extends string>({
  label,
  options,
  value,
  onChange,
  tooltip,
}: {
  label: string;
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  tooltip: string;
}) {
  return (
    <Tooltip label={label} description={tooltip} side="bottom" delay={500}>
      <div className="flex items-center gap-1.5 py-0.5">
        <span className="text-[10px] text-gray-400 w-24 shrink-0 font-medium">{label}</span>
        <div className="flex gap-0.5 flex-wrap">
          {options.map((opt) => (
            <button
              key={opt.value}
              title={opt.title ?? opt.label}
              onClick={() => onChange(opt.value)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all duration-150 whitespace-nowrap ${
                value === opt.value
                  ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-500/20'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white hover:border-gray-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </Tooltip>
  );
}

// ── Numeric input ─────────────────────────────────────────────────────────────
function NumInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  tooltip,
  width = 'w-24',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  tooltip: string;
  width?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(String(value));

  useEffect(() => {
    if (!editing) setRaw(String(value));
  }, [value, editing]);

  function commit() {
    const n = parseFloat(raw);
    if (!isNaN(n)) onChange(n);
    else setRaw(String(value));
    setEditing(false);
  }

  return (
    <Tooltip label={label} description={tooltip} side="bottom" delay={500}>
      <div className="flex items-center gap-1.5 py-0.5">
        <span className="text-[10px] text-gray-400 w-24 shrink-0 font-medium">{label}</span>
        <input
          type="number"
          min={min}
          max={max}
          step={step ?? 1}
          value={editing ? raw : value}
          className={`${width} h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-blue-500 transition-colors duration-150`}
          onChange={(e) => { setEditing(true); setRaw(e.target.value); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setRaw(String(value)); } }}
        />
      </div>
    </Tooltip>
  );
}

// ── Quick toggle switch ──────────────────────────────────────────────────────
function QuickToggle({
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
      <div className="flex items-center gap-1.5 py-0.5">
        <span className="text-[10px] text-gray-400 w-24 shrink-0 font-medium">{label}</span>
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

// ── Section header ─────────────────────────────────────────────────────────────
function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 pb-0.5 border-b border-gray-700 mb-1">{title}</div>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DisplayPreferencesPanel({ open, onClose }: Props) {
  const drawingStore = useDrawingStore();
  const prefs: DisplayPreferences = drawingStore.document.settings.displayPreferences ?? DEFAULT_DISPLAY_PREFERENCES;
  const settings = drawingStore.document.settings;

  function update(partial: Partial<DisplayPreferences>) {
    drawingStore.updateSettings({
      displayPreferences: { ...prefs, ...partial },
    });
  }

  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Only close if not clicking the toggle button (handled in parent)
        const btn = document.getElementById('display-prefs-toggle-btn');
        if (btn && btn.contains(e.target as Node)) return;
        onClose();
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open, onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-0 z-30 bg-gray-800 border border-gray-600 rounded-bl-lg shadow-2xl overflow-hidden"
      style={{
        maxHeight: open ? 700 : 0,
        opacity: open ? 1 : 0,
        transition: 'max-height 280ms cubic-bezier(0.4,0,0.2,1), opacity 220ms ease',
        pointerEvents: open ? 'auto' : 'none',
        width: 440,
      }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700 bg-gray-850" style={{ background: '#1a1f2e' }}>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
          <Settings2 size={13} className="text-blue-400" />
          Quick Preferences
        </div>
        <div className="flex items-center gap-1">
          <Tooltip label="Reset to defaults" description="Restore all display preferences to factory defaults." side="left" delay={400}>
            <button
              onClick={() => update({ ...DEFAULT_DISPLAY_PREFERENCES })}
              className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors duration-150"
            >
              <RotateCcw size={11} />
            </button>
          </Tooltip>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors duration-150"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Panel body — scrollable if needed */}
      <div className="p-3 space-y-3 overflow-y-auto" style={{ maxHeight: 640 }}>

        {/* ── Distances & Dimensions ──────────────────────────────────────── */}
        <Section title="Distances & Dimensions">
          <OptionRow<LinearUnit>
            label="Distance Unit"
            options={[
              { value: 'FT',   label: 'ft',   title: 'US Survey Feet' },
              { value: 'IN',   label: 'in',   title: 'Inches' },
              { value: 'MILE', label: 'mi',   title: 'Miles' },
              { value: 'M',    label: 'm',    title: 'Meters' },
              { value: 'CM',   label: 'cm',   title: 'Centimeters' },
              { value: 'MM',   label: 'mm',   title: 'Millimeters' },
            ]}
            value={prefs.linearUnit}
            onChange={(v) => update({ linearUnit: v })}
            tooltip="Choose the distance unit used in the HUD, status bar, dimension labels, and all tool readouts. US Survey Feet (ft) is the standard for US survey work."
          />
          <OptionRow<LinearFormat>
            label="Format"
            options={[
              { value: 'DECIMAL',  label: 'Decimal',  title: 'Decimal notation  (e.g. 12.375 ft)' },
              { value: 'FRACTION', label: 'Fraction', title: 'Fraction notation (e.g. 12 3/8 ft)' },
            ]}
            value={prefs.linearFormat}
            onChange={(v) => update({ linearFormat: v })}
            tooltip="Decimal: Shows distances as decimal numbers (12.375 ft). Fraction: Shows distances as fractions (12 3/8 ft). Decimal is standard for survey work."
          />
          <NumInput
            label="Decimal Places"
            value={prefs.linearDecimalPlaces}
            onChange={(v) => update({ linearDecimalPlaces: Math.max(0, Math.min(8, Math.round(v))) })}
            min={0}
            max={8}
            step={1}
            tooltip="Number of decimal digits shown for distances (0-8). Also controls coordinate display precision. 2-3 is typical for survey work. Use more for precise engineering."
            width="w-14"
          />
        </Section>

        {/* ── Area ─────────────────────────────────────────────────────────── */}
        <Section title="Area">
          <OptionRow<AreaUnit>
            label="Area Unit"
            options={[
              { value: 'SQ_FT',    label: 'sq ft',  title: 'Square Feet' },
              { value: 'ACRES',    label: 'acres',  title: 'Acres (1 ac = 43,560 sq ft)' },
              { value: 'SQ_M',     label: 'm\u00b2',     title: 'Square Meters' },
              { value: 'HECTARES', label: 'ha',     title: 'Hectares (1 ha = 10,000 m\u00b2)' },
            ]}
            value={prefs.areaUnit}
            onChange={(v) => update({ areaUnit: v })}
            tooltip="Unit used to display computed area values in closure reports, polygon properties, and legal descriptions. Acres is the standard for US land surveys."
          />
        </Section>

        {/* ── Bearings & Angles ─────────────────────────────────────────────── */}
        <Section title="Bearings & Angles">
          <OptionRow<BearingFormat>
            label="Bearing Style"
            options={[
              { value: 'QUADRANT', label: 'Quadrant',  title: "Quadrant bearing: N 45\u00b030'15\" E" },
              { value: 'AZIMUTH',  label: 'Azimuth',   title: 'Azimuth 0-360\u00b0 clockwise from North' },
            ]}
            value={prefs.bearingFormat}
            onChange={(v) => update({ bearingFormat: v })}
            tooltip={"Quadrant: Standard US survey format using compass quadrants (N 45\u00b030'15\" E). Azimuth: 0-360\u00b0 measured clockwise from North. Quadrant is the legal standard for boundary surveys."}
          />
          <OptionRow<AngleFormat>
            label="Angle Format"
            options={[
              { value: 'DMS',         label: 'DMS',      title: "Degrees, Minutes, Seconds: 45\u00b030'15\"" },
              { value: 'DECIMAL_DEG', label: 'Decimal\u00b0', title: 'Decimal degrees: 45.5042\u00b0' },
            ]}
            value={prefs.angleFormat}
            onChange={(v) => update({ angleFormat: v })}
            tooltip={"DMS: Degrees, Minutes, Seconds (45\u00b030'15\") \u2014 standard for legal survey documents. Decimal: Decimal degrees (45.5042\u00b0) \u2014 used in some engineering applications."}
          />
        </Section>

        {/* ── Coordinates ──────────────────────────────────────────────────── */}
        <Section title="Coordinates">
          <OptionRow<CoordMode>
            label="Coord Mode"
            options={[
              { value: 'NE', label: 'N/E',  title: 'Display as Northing / Easting (survey default)' },
              { value: 'XY', label: 'X/Y',  title: 'Display as X (Easting) / Y (Northing)' },
            ]}
            value={prefs.coordMode}
            onChange={(v) => update({ coordMode: v })}
            tooltip="N/E: Standard survey notation — Northing first, then Easting. X/Y: Cartesian math notation — X (horizontal) first, then Y (vertical). Most surveyors use N/E."
          />

          <div className="pt-1 space-y-0.5">
            <div className="text-[10px] text-gray-400 mb-0.5">
              Origin Offset
              <span className="ml-1 text-gray-600 font-normal text-[9px]">(displayed coord = world coord + offset)</span>
            </div>
            <NumInput
              label="Origin Northing"
              value={prefs.originNorthing}
              onChange={(v) => update({ originNorthing: v })}
              step={1}
              tooltip="Added to the world Y coordinate to get the displayed Northing. Set to a real-world Northing to display absolute State Plane or UTM coordinates. Leave at 0 for relative coordinates."
              width="w-28"
            />
            <NumInput
              label="Origin Easting"
              value={prefs.originEasting}
              onChange={(v) => update({ originEasting: v })}
              step={1}
              tooltip="Added to the world X coordinate to get the displayed Easting. Set to a real-world Easting to display absolute State Plane or UTM coordinates."
              width="w-28"
            />
          </div>
        </Section>

        {/* ── Selection Behavior ──────────────────────────────────────────── */}
        <Section title="Selection">
          <div className="space-y-1">
            <OptionRow<'GROUP_FIRST' | 'ELEMENT_FIRST'>
              label="Group Select"
              options={[
                { value: 'GROUP_FIRST', label: 'Group First', title: 'First click selects entire group, second click narrows to segment' },
                { value: 'ELEMENT_FIRST', label: 'Element First', title: 'First click selects individual segment, right-click for group' },
              ]}
              value={settings.groupSelectMode ?? 'GROUP_FIRST'}
              onChange={(v) => drawingStore.updateSettings({ groupSelectMode: v })}
              tooltip="Group First: Clicking a polyline or polygon segment selects the entire group. Click the same segment again to drill down to just that piece. Element First: Click always selects the individual segment. Right-click and choose 'Select Group' to select the whole polyline."
            />
            <OptionRow<'CROSSING_EXPAND_GROUPS' | 'CROSSING_INDIVIDUAL' | 'WINDOW_FULL_ONLY'>
              label="Box Select"
              options={[
                { value: 'CROSSING_EXPAND_GROUPS', label: 'Crossing + Groups', title: 'Any overlap selects, expands to full polyline/polygon groups' },
                { value: 'CROSSING_INDIVIDUAL', label: 'Crossing Only', title: 'Any overlap selects individual elements, no group expansion' },
                { value: 'WINDOW_FULL_ONLY', label: 'Full Enclosure', title: 'Only fully enclosed elements/groups are selected' },
              ]}
              value={settings.boxSelectMode ?? 'CROSSING_EXPAND_GROUPS'}
              onChange={(v) => drawingStore.updateSettings({ boxSelectMode: v })}
              tooltip="Crossing + Groups: Any feature touching the selection rectangle is selected, plus all other members of its group. Crossing Only: Only the individual elements touching the rectangle. Full Enclosure: Only features completely inside the rectangle."
            />
          </div>
        </Section>

        {/* ── Quick Display Toggles ──────────────────────────────────────── */}
        <Section title="Display Toggles">
          <QuickToggle
            label="Grid"
            checked={settings.gridVisible}
            onChange={(v) => drawingStore.updateSettings({ gridVisible: v })}
            tooltip="Show or hide the reference grid on the canvas. Shortcut: F7. Grid snap still works even when the grid is hidden."
          />
          <QuickToggle
            label="Snap"
            checked={settings.snapEnabled}
            onChange={(v) => drawingStore.updateSettings({ snapEnabled: v })}
            tooltip="Enable or disable object snap (OSNAP). When enabled, the cursor automatically locks to geometric points like endpoints and midpoints. Shortcut: F3"
          />
          <QuickToggle
            label="Point Labels"
            checked={settings.showPointLabels ?? true}
            onChange={(v) => drawingStore.updateSettings({ showPointLabels: v })}
            tooltip="Show or hide labels on point features (field codes, descriptions). Disable to declutter dense drawings."
          />
          <QuickToggle
            label="Line Labels"
            checked={settings.showLineLabels ?? true}
            onChange={(v) => drawingStore.updateSettings({ showLineLabels: v })}
            tooltip="Show or hide bearing and distance labels along line segments and polyline edges."
          />
          <QuickToggle
            label="Dimensions"
            checked={settings.showDimensions ?? true}
            onChange={(v) => drawingStore.updateSettings({ showDimensions: v })}
            tooltip="Show or hide dimension annotations on the canvas."
          />
          <QuickToggle
            label="Hover Glow"
            checked={settings.hoverGlowEnabled ?? true}
            onChange={(v) => drawingStore.updateSettings({ hoverGlowEnabled: v })}
            tooltip="Show a multi-layer glow highlight when hovering over features. Gives visual feedback before clicking to select."
          />
        </Section>

      </div>
    </div>
  );
}

// ── Toggle button (export separately so CADLayout can position it) ───────────
export function DisplayPrefsToggleButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip
      label="Display Preferences"
      description="Toggle the quick preferences panel. Set units, bearings, coordinates, selection behavior, and display toggles."
      side="bottom"
      delay={400}
    >
      <button
        id="display-prefs-toggle-btn"
        onClick={onToggle}
        className={`flex items-center gap-1 px-2.5 h-6 rounded text-[11px] font-medium border transition-all duration-200 whitespace-nowrap ${
          open
            ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-500/20'
            : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white hover:border-gray-500'
        }`}
      >
        <Settings2 size={12} className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        Prefs
        <ChevronDown
          size={11}
          className="transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
    </Tooltip>
  );
}
