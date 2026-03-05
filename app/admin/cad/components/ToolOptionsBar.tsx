'use client';
// app/admin/cad/components/ToolOptionsBar.tsx
// Contextual tool-options strip that lives between the MenuBar and canvas.
// Shows options relevant to the currently active tool — ortho/polar modes,
// copy mode, regular-polygon sides picker, rotate angle, scale factor, etc.

import { useState, useEffect } from 'react';
import { useToolStore, useSelectionStore, useViewportStore, useDrawingStore } from '@/lib/cad/store';
import Tooltip from './Tooltip';
import {
  rotateSelection,
  scaleSelection,
  scaleSelectionXY,
  deleteSelection,
  duplicateSelection,
  computeSelectionCentroid,
} from '@/lib/cad/operations';
import { BUILTIN_LINE_TYPES } from '@/lib/cad/styles/linetype-library';

// Line weight constraints
const MIN_LINE_WEIGHT = 0.1;
const MAX_LINE_WEIGHT = 10;

// ─────────────────────────────────────────────
// Shared tiny toggle button
// ─────────────────────────────────────────────
interface ToggleProps {
  active: boolean;
  onClick: () => void;
  label: string;
  tooltipLabel: string;
  tooltipDesc: string;
  shortcut?: string;
  color?: string; // tailwind bg class when active
}
function ToggleBtn({ active, onClick, label, tooltipLabel, tooltipDesc, shortcut, color = 'bg-blue-600' }: ToggleProps) {
  return (
    <Tooltip label={tooltipLabel} description={tooltipDesc} shortcut={shortcut} side="bottom" delay={400}>
      <button
        className={`flex items-center gap-1 px-2.5 h-6 rounded text-[11px] font-medium transition-colors border whitespace-nowrap
          ${active
            ? `${color} border-blue-500 text-white`
            : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white'}`}
        onClick={onClick}
      >
        {label}
      </button>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────
// Small numeric input
// ─────────────────────────────────────────────
interface NumberInputProps {
  value: number | string;
  onChange: (v: string) => void;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  width?: string;
  label: string;
  tooltipLabel: string;
  tooltipDesc: string;
}
function NumberInput({ value, onChange, onCommit, min, max, step = 1, width = 'w-16', label, tooltipLabel, tooltipDesc }: NumberInputProps) {
  return (
    <Tooltip label={tooltipLabel} description={tooltipDesc} side="bottom" delay={400}>
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-gray-400 shrink-0">{label}</span>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          className={`${width} h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-blue-500`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onCommit(n);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const n = parseFloat((e.target as HTMLInputElement).value);
              if (!isNaN(n)) onCommit(n);
            }
          }}
        />
      </div>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────
// Separator
// ─────────────────────────────────────────────
function Sep() {
  return <span className="w-px h-4 bg-gray-600 mx-1 shrink-0" role="separator" aria-hidden="true" />;
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
export default function ToolOptionsBar() {
  const toolStore = useToolStore();
  const selectionStore = useSelectionStore();
  const viewportStore = useViewportStore();
  const drawingStore = useDrawingStore();

  const ts = toolStore.state;
  const { activeTool, orthoEnabled, polarEnabled, polarAngle, copyMode, regularPolygonSides, drawStyle } = ts;

  // Which groups of options are relevant for the current tool
  const isDrawingTool = activeTool.startsWith('DRAW_');
  const isMoveTool = activeTool === 'MOVE';
  const isTransformTool = activeTool === 'ROTATE' || activeTool === 'SCALE' || activeTool === 'MIRROR';
  const showOrtho = isDrawingTool || isMoveTool || activeTool === 'COPY';
  const showPolar = isDrawingTool || isMoveTool || activeTool === 'COPY';
  const showCopyMode = activeTool === 'MOVE' || isTransformTool;
  const showPolySides = activeTool === 'DRAW_REGULAR_POLYGON';
  const showRotateAngle = activeTool === 'ROTATE';
  const showScaleFactor = activeTool === 'SCALE';
  const showSelectAll = activeTool === 'SELECT';
  const showLineStyle = activeTool === 'DRAW_LINE' || activeTool === 'DRAW_POLYLINE';

  // Local state for text inputs
  const selCount = selectionStore.selectedIds.size;

  // POLAR_ANGLE_PRESETS
  const POLAR_PRESETS = [15, 30, 45, 90] as const;

  // When the active tool changes to a line tool, the drawStyle is read directly
  // from the store in the JSX — no separate local state required.
  useEffect(() => {
    // intentional no-op retained for future per-tool style-reset hooks
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);

  // Line type options – only the basic BASIC category for the picker
  const BASIC_LINE_TYPES = BUILTIN_LINE_TYPES.filter((lt) => lt.category === 'BASIC');

  return (
    <div
      className="flex items-center bg-gray-850 border-b border-gray-700 px-3 gap-2 min-h-[40px] py-1 text-xs text-gray-300 overflow-x-auto shrink-0"
      style={{ backgroundColor: '#1a1f2e' }}
    >
      {/* ── Tool name badge ─────────────────────────────────────────────────── */}
      <span
        className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider shrink-0 mr-1 whitespace-nowrap"
        role="status"
        aria-label={`Active tool: ${TOOL_DISPLAY_NAMES[activeTool] ?? activeTool}`}
      >
        {TOOL_DISPLAY_NAMES[activeTool] ?? activeTool}
      </span>

      {/* ── Ortho mode (F8) ─────────────────────────────────────────────────── */}
      {showOrtho && (
        <>
          <Sep />
          <ToggleBtn
            active={orthoEnabled}
            onClick={() => toolStore.setOrthoEnabled(!orthoEnabled)}
            label="Ortho (F8)"
            tooltipLabel="Ortho Mode"
            tooltipDesc="Constrains cursor movement to horizontal and vertical axes only. Disables polar tracking."
            shortcut="F8"
          />
        </>
      )}

      {/* ── Polar tracking (F10) ────────────────────────────────────────────── */}
      {showPolar && (
        <>
          <ToggleBtn
            active={polarEnabled}
            onClick={() => toolStore.setPolarEnabled(!polarEnabled)}
            label="Polar (F10)"
            tooltipLabel="Polar Tracking"
            tooltipDesc="Snaps cursor to multiples of the polar angle. Disables ortho mode."
            shortcut="F10"
          />
          {polarEnabled && (
            <>
              {/* Polar angle presets */}
              <Tooltip
                label="Polar Angle"
                description="Angle increment for polar snap. Cursor locks to multiples of this angle."
                side="bottom"
                delay={400}
              >
                <div className="flex items-center gap-0.5">
                  {POLAR_PRESETS.map((a) => (
                    <button
                      key={a}
                      className={`px-2 h-6 rounded text-[11px] transition-colors border
                        ${polarAngle === a
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                      onClick={() => toolStore.setPolarAngle(a)}
                    >
                      {a}°
                    </button>
                  ))}
                  {/* Custom angle */}
                  <input
                    type="number"
                    min={1}
                    max={90}
                    className="w-12 h-6 bg-gray-700 text-white text-[11px] rounded px-1 outline-none font-mono text-center border border-gray-600 focus:border-indigo-500"
                    value={polarAngle}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) toolStore.setPolarAngle(v);
                    }}
                    title="Custom polar angle (1–90°)"
                  />
                </div>
              </Tooltip>
            </>
          )}
        </>
      )}

      {/* ── Copy mode ──────────────────────────────────────────────────────── */}
      {showCopyMode && (
        <>
          <Sep />
          <ToggleBtn
            active={copyMode}
            onClick={() => toolStore.setCopyMode(!copyMode)}
            label="Copy Mode"
            tooltipLabel="Copy Mode"
            tooltipDesc="When enabled, the operation creates a copy of the original instead of modifying it in-place."
            color="bg-green-700"
          />
        </>
      )}

      {/* ── Line style controls (DRAW_LINE / DRAW_POLYLINE) ────────────────── */}
      {showLineStyle && (
        <>
          <Sep />
          {/* Color picker */}
          <Tooltip label="Line Color" description="Set the color for new line segments. Overrides the active layer color." side="bottom" delay={400}>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0 leading-none">Color:</span>
              <input
                type="color"
                className="w-8 h-6 rounded cursor-pointer border border-gray-600 bg-transparent p-0.5 block"
                value={drawStyle.color ?? '#000000'}
                title="Line color"
                aria-label="Line color"
                onChange={(e) => toolStore.setDrawStyle({ color: e.target.value })}
              />
              {drawStyle.color != null && (
                <button
                  className="w-5 h-6 flex items-center justify-center text-[11px] text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded transition-colors"
                  onClick={() => toolStore.setDrawStyle({ color: null })}
                  title="Reset to layer color"
                >✕</button>
              )}
            </div>
          </Tooltip>
          <Sep />
          {/* Line weight */}
          <Tooltip label="Line Weight" description="Set line thickness in points. Overrides the active layer weight." side="bottom" delay={400}>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0 leading-none">Weight:</span>
              <input
                type="number"
                min={MIN_LINE_WEIGHT}
                max={MAX_LINE_WEIGHT}
                step={0.25}
                className="w-14 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-blue-500"
                value={drawStyle.lineWeight ?? ''}
                placeholder="layer"
                title="Line weight (pt)"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  toolStore.setDrawStyle({ lineWeight: isNaN(v) ? null : Math.max(MIN_LINE_WEIGHT, Math.min(MAX_LINE_WEIGHT, v)) });
                }}
              />
            </div>
          </Tooltip>
          <Sep />
          {/* Opacity */}
          <Tooltip label="Opacity" description="Set line opacity (0 = transparent, 1 = fully opaque)." side="bottom" delay={400}>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0 leading-none">Opacity:</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                className="w-20 h-4 cursor-pointer accent-blue-500"
                value={drawStyle.opacity ?? 1}
                title={`Opacity: ${Math.round((drawStyle.opacity ?? 1) * 100)}%`}
                onChange={(e) => toolStore.setDrawStyle({ opacity: parseFloat(e.target.value) })}
              />
              <span className="text-[11px] text-gray-300 w-8 text-right font-mono shrink-0 leading-none">
                {Math.round((drawStyle.opacity ?? 1) * 100)}%
              </span>
            </div>
          </Tooltip>
          <Sep />
          {/* Line type */}
          <Tooltip label="Line Type" description="Choose the line pattern for new segments." side="bottom" delay={400}>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0 leading-none">Type:</span>
              <select
                className="h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none border border-gray-600 focus:border-blue-500 font-mono"
                value={drawStyle.lineType}
                onChange={(e) => toolStore.setDrawStyle({ lineType: e.target.value })}
                title="Line type"
              >
                <option value="SOLID">─── Solid</option>
                <option value="DASHED">- - - Dashed</option>
                <option value="DOTTED">· · · Dotted</option>
                <option value="DOT_DASH">-·-·- Dot-Dash</option>
                <option value="LONG_DASH">── ── Long Dash</option>
              </select>
            </div>
          </Tooltip>
        </>
      )}

      {/* ── Regular polygon sides ────────────────────────────────────────── */}
      {showPolySides && (
        <>
          <Sep />
          <Tooltip
            label="Number of Sides"
            description="Set the number of sides for the regular polygon. Range: 3 (triangle) to 20."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0">Sides:</span>
              <div className="flex gap-0.5">
                {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                  <button
                    key={n}
                    className={`w-7 h-6 text-[11px] rounded border transition-colors
                      ${regularPolygonSides === n
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                    onClick={() => toolStore.setRegularPolygonSides(n)}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={3}
                  max={20}
                  className="w-12 h-6 bg-gray-700 text-white text-[11px] rounded px-1 outline-none font-mono text-center border border-gray-600 focus:border-blue-500"
                  value={regularPolygonSides}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) toolStore.setRegularPolygonSides(v);
                  }}
                />
              </div>
            </div>
          </Tooltip>
        </>
      )}

      {/* ── Rotate angle quick-apply ─────────────────────────────────────── */}
      {showRotateAngle && (
        <>
          <Sep />
          <Tooltip
            label="Quick Rotate"
            description="Type an angle and click Apply to instantly rotate the selection by that amount around its center."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0">∠</span>
              <QuickRotateInput copyMode={copyMode} />
            </div>
          </Tooltip>
          <Sep />
          {/* Center-point presets for rotate */}
          <Tooltip
            label="Center of Mass"
            description="Set the rotate center to the bounding-box centroid of the selected elements."
            side="bottom"
            delay={400}
          >
            <button
              className="px-2.5 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors whitespace-nowrap"
              onClick={() => {
                const ids = Array.from(selectionStore.selectedIds);
                if (!ids.length) return;
                const c = computeSelectionCentroid(ids);
                toolStore.setRotateCenter(c);
              }}
            >
              ⊕ Center of Mass
            </button>
          </Tooltip>
          <Tooltip
            label="Center of Page"
            description="Set the rotate center to the center of the paper (based on paper size and drawing scale)."
            side="bottom"
            delay={400}
          >
            <button
              className="px-2.5 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors whitespace-nowrap"
              onClick={() => {
                const settings = drawingStore.document.settings;
                const pageCenterWorld = getPageCenter(settings);
                toolStore.setRotateCenter(pageCenterWorld);
              }}
            >
              ⊞ Center of Page
            </button>
          </Tooltip>
        </>
      )}

      {/* ── Scale factor quick-apply ─────────────────────────────────────── */}
      {showScaleFactor && (
        <>
          <Sep />
          <Tooltip
            label="Quick Scale"
            description="Type a scale factor and click Apply to instantly scale the selection around its center."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0">×</span>
              <QuickScaleInput copyMode={copyMode} />
            </div>
          </Tooltip>
          <Sep />
          {/* Center-point presets for scale */}
          <Tooltip
            label="Center of Mass"
            description="Set the scale pivot to the bounding-box centroid of the selected elements."
            side="bottom"
            delay={400}
          >
            <button
              className="px-2.5 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors whitespace-nowrap"
              onClick={() => {
                const ids = Array.from(selectionStore.selectedIds);
                if (!ids.length) return;
                const c = computeSelectionCentroid(ids);
                toolStore.setBasePoint(c);
              }}
            >
              ⊕ Center of Mass
            </button>
          </Tooltip>
          <Tooltip
            label="Center of Page"
            description="Set the scale pivot to the center of the paper."
            side="bottom"
            delay={400}
          >
            <button
              className="px-2.5 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors whitespace-nowrap"
              onClick={() => {
                const settings = drawingStore.document.settings;
                const pageCenterWorld = getPageCenter(settings);
                toolStore.setBasePoint(pageCenterWorld);
              }}
            >
              ⊞ Center of Page
            </button>
          </Tooltip>
          <Sep />
          {/* Distort: non-uniform scale */}
          <DistortInputs />
        </>
      )}

      {/* ── SELECT tool helpers ───────────────────────────────────────────── */}
      {showSelectAll && (
        <>
          <Sep />
          <Tooltip
            label="Select All"
            description="Select every visible, unlocked feature in the drawing."
            shortcut="Ctrl+A"
            side="bottom"
            delay={400}
          >
            <button
              className="px-2.5 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors whitespace-nowrap"
              onClick={() => {
                const allIds = drawingStore.getAllFeatures().map((f) => f.id);
                selectionStore.selectMultiple(allIds, 'REPLACE');
              }}
            >
              Select All
            </button>
          </Tooltip>
          {selCount > 0 && (
            <>
              <Tooltip
                label="Deselect All"
                description="Clear the current selection."
                shortcut="Esc"
                side="bottom"
                delay={400}
              >
                <button
                  className="px-2.5 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors whitespace-nowrap"
                  onClick={() => selectionStore.deselectAll()}
                >
                  Deselect
                </button>
              </Tooltip>
              <Tooltip
                label="Delete Selected"
                description={`Delete the ${selCount} currently selected feature${selCount !== 1 ? 's' : ''}.`}
                shortcut="Del"
                side="bottom"
                delay={400}
              >
                <button
                  className="px-2.5 h-6 rounded text-[11px] bg-gray-700 border border-red-900/50 text-red-400 hover:bg-red-900/30 transition-colors whitespace-nowrap"
                  onClick={() => deleteSelection()}
                >
                  Delete ({selCount})
                </button>
              </Tooltip>
              <Tooltip
                label="Duplicate Selected"
                description={`Duplicate the ${selCount} selected feature${selCount !== 1 ? 's' : ''}, offset by 10 units.`}
                shortcut="Ctrl+D"
                side="bottom"
                delay={400}
              >
                <button
                  className="px-2.5 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors whitespace-nowrap"
                  onClick={() => duplicateSelection()}
                >
                  Duplicate
                </button>
              </Tooltip>
            </>
          )}
        </>
      )}

      {/* ── Spacer pushes anything to the right ────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Snap + Grid quick toggles ────────────────────────────────────── */}
      <Tooltip
        label="Snap"
        description="Toggle object snap on/off. When on, the cursor snaps to geometric points like endpoints and midpoints."
        shortcut="F3"
        side="bottom"
        delay={400}
      >
        <button
          className={`px-2.5 h-6 rounded text-[11px] border transition-colors whitespace-nowrap
            ${drawingStore.document.settings.snapEnabled
              ? 'bg-green-700/30 border-green-600 text-green-400'
              : 'bg-gray-700 border-gray-600 text-gray-500 hover:text-gray-300'}`}
          onClick={() =>
            drawingStore.updateSettings({ snapEnabled: !drawingStore.document.settings.snapEnabled })
          }
        >
          Snap {drawingStore.document.settings.snapEnabled ? 'ON' : 'OFF'}
        </button>
      </Tooltip>

      <Tooltip
        label="Grid"
        description="Toggle grid display. The grid can be configured in Settings (style, spacing, and color)."
        shortcut="F7"
        side="bottom"
        delay={400}
      >
        <button
          className={`px-2.5 h-6 rounded text-[11px] border transition-colors whitespace-nowrap
            ${drawingStore.document.settings.gridVisible
              ? 'bg-green-700/30 border-green-600 text-green-400'
              : 'bg-gray-700 border-gray-600 text-gray-500 hover:text-gray-300'}`}
          onClick={() =>
            drawingStore.updateSettings({ gridVisible: !drawingStore.document.settings.gridVisible })
          }
        >
          Grid {drawingStore.document.settings.gridVisible ? 'ON' : 'OFF'}
        </button>
      </Tooltip>
    </div>
  );
}

// ─────────────────────────────────────────────
// Helper: compute paper center in world coords
// ─────────────────────────────────────────────
function getPageCenter(settings: { paperSize?: string; paperOrientation?: string; drawingScale?: number }): import('@/lib/cad/types').Point2D {
  const scale = settings.drawingScale ?? 50; // inches per world unit
  const sizeMap: Record<string, [number, number]> = {
    LETTER: [8.5, 11],
    TABLOID: [11, 17],
    ARCH_C: [18, 24],
    ARCH_D: [24, 36],
    ARCH_E: [36, 48],
  };
  let [w, h] = sizeMap[settings.paperSize ?? 'TABLOID'] ?? [11, 17];
  if (settings.paperOrientation === 'LANDSCAPE') {
    [w, h] = [h, w];
  }
  return { x: (w * scale) / 2, y: (h * scale) / 2 };
}

// ─────────────────────────────────────────────
// Distort: non-uniform scale inputs
// ─────────────────────────────────────────────
function DistortInputs() {
  const [scaleX, setScaleX] = useState('1');
  const [scaleY, setScaleY] = useState('1');

  function apply() {
    const x = parseFloat(scaleX);
    const y = parseFloat(scaleY);
    if (isNaN(x) || isNaN(y) || x <= 0 || y <= 0) return;
    scaleSelectionXY(x, y);
  }

  return (
    <Tooltip
      label="Distort"
      description="Scale the selection independently on each axis (non-uniform scaling). Enter separate X and Y scale factors."
      side="bottom"
      delay={400}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-gray-400 shrink-0">Distort X:</span>
        <input
          type="number"
          min={0.01}
          step={0.1}
          className="w-12 h-6 bg-gray-700 text-white text-[11px] rounded px-1 outline-none font-mono text-center border border-gray-600 focus:border-purple-500"
          value={scaleX}
          onChange={(e) => setScaleX(e.target.value)}
          title="X-axis scale factor"
        />
        <span className="text-[11px] text-gray-400 shrink-0">Y:</span>
        <input
          type="number"
          min={0.01}
          step={0.1}
          className="w-12 h-6 bg-gray-700 text-white text-[11px] rounded px-1 outline-none font-mono text-center border border-gray-600 focus:border-purple-500"
          value={scaleY}
          onChange={(e) => setScaleY(e.target.value)}
          title="Y-axis scale factor"
          onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
        />
        <button
          className="px-2.5 h-6 rounded text-[11px] bg-purple-700 border border-purple-600 text-white hover:bg-purple-600 transition-colors"
          onClick={apply}
        >
          Apply
        </button>
      </div>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────
// Quick rotate input
// ─────────────────────────────────────────────
function QuickRotateInput({ copyMode }: { copyMode: boolean }) {
  const [angle, setAngle] = useState('90');
  const presets = [-90, 45, 90, 180] as const;

  function apply(deg: number) {
    if (copyMode) {
      // Duplicate first, then rotate the copy
      duplicateSelection(0, 0);
    }
    rotateSelection(deg);
  }

  return (
    <div className="flex items-center gap-1">
      {presets.map((a) => (
        <button
          key={a}
          className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
          onClick={() => { setAngle(String(a)); apply(a); }}
          title={`Rotate ${a > 0 ? `${a}° CCW` : `${Math.abs(a)}° CW`}`}
        >
          {a > 0 ? `+${a}°` : `${a}°`}
        </button>
      ))}
      <input
        type="number"
        className="w-14 h-6 bg-gray-700 text-white text-[11px] rounded px-1 outline-none font-mono text-center border border-gray-600 focus:border-blue-500"
        value={angle}
        onChange={(e) => setAngle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { const v = parseFloat(angle); if (!isNaN(v)) apply(v); } }}
        title="Custom angle in degrees (positive = CCW)"
      />
      <button
        className="px-2.5 h-6 rounded text-[11px] bg-blue-700 border border-blue-600 text-white hover:bg-blue-600 transition-colors"
        onClick={() => { const v = parseFloat(angle); if (!isNaN(v)) apply(v); }}
      >
        Apply
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Quick scale input
// ─────────────────────────────────────────────
function QuickScaleInput({ copyMode }: { copyMode: boolean }) {
  const [factor, setFactor] = useState('2');
  const presets = [0.25, 0.5, 2] as const;

  function apply(f: number) {
    if (copyMode) {
      duplicateSelection(0, 0);
    }
    scaleSelection(f);
  }

  return (
    <div className="flex items-center gap-1">
      {presets.map((f) => (
        <button
          key={f}
          className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
          onClick={() => { setFactor(String(f)); apply(f); }}
          title={`Scale ×${f}`}
        >
          ×{f}
        </button>
      ))}
      <input
        type="number"
        min={0.01}
        step={0.1}
        className="w-14 h-6 bg-gray-700 text-white text-[11px] rounded px-1 outline-none font-mono text-center border border-gray-600 focus:border-green-500"
        value={factor}
        onChange={(e) => setFactor(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { const v = parseFloat(factor); if (!isNaN(v) && v > 0) apply(v); } }}
        title="Custom scale factor (e.g. 2 = double size)"
      />
      <button
        className="px-2.5 h-6 rounded text-[11px] bg-green-700 border border-green-600 text-white hover:bg-green-600 transition-colors"
        onClick={() => { const v = parseFloat(factor); if (!isNaN(v) && v > 0) apply(v); }}
      >
        Apply
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Display name map
// ─────────────────────────────────────────────
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  SELECT: 'Select',
  PAN: 'Pan / Zoom',
  DRAW_POINT: 'Draw Point',
  DRAW_LINE: 'Draw Line',
  DRAW_POLYLINE: 'Draw Polyline',
  DRAW_POLYGON: 'Draw Polygon',
  DRAW_RECTANGLE: 'Draw Rectangle',
  DRAW_REGULAR_POLYGON: 'Regular Polygon',
  DRAW_CIRCLE: 'Draw Circle',
  MOVE: 'Move',
  COPY: 'Copy',
  ROTATE: 'Rotate',
  MIRROR: 'Mirror',
  SCALE: 'Scale',
  ERASE: 'Erase',
};
