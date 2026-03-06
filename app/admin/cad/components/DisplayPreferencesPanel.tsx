'use client';
// app/admin/cad/components/DisplayPreferencesPanel.tsx
// Quick-access sliding preferences panel tucked below the ToolOptionsBar.
// Toggled open/closed by the "Prefs ▾" button rendered in CADLayout.

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
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors whitespace-nowrap ${
                value === opt.value
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white'
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
          className={`${width} h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-blue-500`}
          onChange={(e) => { setEditing(true); setRaw(e.target.value); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setRaw(String(value)); } }}
        />
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
        maxHeight: open ? 600 : 0,
        opacity: open ? 1 : 0,
        transition: 'max-height 280ms cubic-bezier(0.4,0,0.2,1), opacity 220ms ease',
        pointerEvents: open ? 'auto' : 'none',
        width: 420,
      }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700 bg-gray-850" style={{ background: '#1a1f2e' }}>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
          <Settings2 size={13} className="text-blue-400" />
          Display Preferences
        </div>
        <div className="flex items-center gap-1">
          <Tooltip label="Reset to defaults" description="Restore all display preferences to factory defaults." side="left" delay={400}>
            <button
              onClick={() => update({ ...DEFAULT_DISPLAY_PREFERENCES })}
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

      {/* Panel body — scrollable if needed */}
      <div className="p-3 space-y-3 overflow-y-auto" style={{ maxHeight: 540 }}>

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
            tooltip="Choose the distance unit used in the HUD, status bar, and all tool readouts."
          />
          <OptionRow<LinearFormat>
            label="Format"
            options={[
              { value: 'DECIMAL',  label: 'Decimal',  title: 'Decimal notation  (e.g. 12.375 ft)' },
              { value: 'FRACTION', label: 'Fraction', title: 'Fraction notation (e.g. 12 3/8 ft)' },
            ]}
            value={prefs.linearFormat}
            onChange={(v) => update({ linearFormat: v })}
            tooltip="Decimal: 12.375 ft  |  Fraction: 12 3/8 ft"
          />
          <NumInput
            label="Decimal Places"
            value={prefs.linearDecimalPlaces}
            onChange={(v) => update({ linearDecimalPlaces: Math.max(0, Math.min(8, Math.round(v))) })}
            min={0}
            max={8}
            step={1}
            tooltip="Number of decimal digits shown for distances (0–8). Also controls coordinate display precision."
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
              { value: 'SQ_M',     label: 'm²',     title: 'Square Meters' },
              { value: 'HECTARES', label: 'ha',     title: 'Hectares (1 ha = 10,000 m²)' },
            ]}
            value={prefs.areaUnit}
            onChange={(v) => update({ areaUnit: v })}
            tooltip="Unit used to display computed area values (closure reports, polygon properties)."
          />
        </Section>

        {/* ── Bearings & Angles ─────────────────────────────────────────────── */}
        <Section title="Bearings & Angles">
          <OptionRow<BearingFormat>
            label="Bearing Style"
            options={[
              { value: 'QUADRANT', label: 'Quadrant',  title: "Quadrant bearing: N 45°30'15\" E" },
              { value: 'AZIMUTH',  label: 'Azimuth',   title: 'Azimuth 0–360° clockwise from North' },
            ]}
            value={prefs.bearingFormat}
            onChange={(v) => update({ bearingFormat: v })}
            tooltip={"Quadrant: N 45°30'15\" E  |  Azimuth: 45.5042°"}
          />
          <OptionRow<AngleFormat>
            label="Angle Format"
            options={[
              { value: 'DMS',         label: 'DMS',      title: "Degrees, Minutes, Seconds: 45°30'15\"" },
              { value: 'DECIMAL_DEG', label: 'Decimal°', title: 'Decimal degrees: 45.5042°' },
            ]}
            value={prefs.angleFormat}
            onChange={(v) => update({ angleFormat: v })}
            tooltip={"DMS: 45°30'15\"  |  Decimal: 45.5042°"}
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
            tooltip="N/E: survey-style Northing & Easting labels  |  X/Y: Cartesian X & Y labels"
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
              tooltip="Added to the world Y coordinate to get the displayed Northing. Set to a real-world Northing to display absolute survey coordinates."
              width="w-28"
            />
            <NumInput
              label="Origin Easting"
              value={prefs.originEasting}
              onChange={(v) => update({ originEasting: v })}
              step={1}
              tooltip="Added to the world X coordinate to get the displayed Easting."
              width="w-28"
            />
          </div>
        </Section>

        {/* Selection Behavior */}
        <Section title="Selection">
          <div className="space-y-1">
            <OptionRow<'GROUP_FIRST' | 'ELEMENT_FIRST'>
              label="Group Select"
              options={[
                { value: 'GROUP_FIRST', label: 'Group First', title: 'First click selects entire group, second click narrows to segment' },
                { value: 'ELEMENT_FIRST', label: 'Element First', title: 'First click selects individual segment, right-click for group' },
              ]}
              value={drawingStore.document.settings.groupSelectMode ?? 'GROUP_FIRST'}
              onChange={(v) => drawingStore.updateSettings({ groupSelectMode: v })}
              tooltip="Controls whether clicking a grouped element (polyline, polygon) selects the whole group or just the clicked segment."
            />
            <OptionRow<'CROSSING_EXPAND_GROUPS' | 'CROSSING_INDIVIDUAL' | 'WINDOW_FULL_ONLY'>
              label="Box Select"
              options={[
                { value: 'CROSSING_EXPAND_GROUPS', label: 'Crossing + Groups', title: 'Any overlap selects, expands to full polyline/polygon groups' },
                { value: 'CROSSING_INDIVIDUAL', label: 'Crossing Only', title: 'Any overlap selects individual elements, no group expansion' },
                { value: 'WINDOW_FULL_ONLY', label: 'Full Enclosure', title: 'Only fully enclosed elements/groups are selected' },
              ]}
              value={drawingStore.document.settings.boxSelectMode ?? 'CROSSING_EXPAND_GROUPS'}
              onChange={(v) => drawingStore.updateSettings({ boxSelectMode: v })}
              tooltip="Controls how the selection rectangle picks elements. Crossing selects anything touched; Full Enclosure requires elements to be completely inside the rectangle."
            />
          </div>
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
      description="Toggle the display preferences panel. Set units, bearing format, coordinate mode, and origin."
      side="bottom"
      delay={400}
    >
      <button
        id="display-prefs-toggle-btn"
        onClick={onToggle}
        className={`flex items-center gap-1 px-2.5 h-6 rounded text-[11px] font-medium border transition-colors whitespace-nowrap ${
          open
            ? 'bg-blue-600 border-blue-500 text-white'
            : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white'
        }`}
      >
        <Settings2 size={12} />
        Prefs
        <ChevronDown
          size={11}
          className="transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
    </Tooltip>
  );
}
