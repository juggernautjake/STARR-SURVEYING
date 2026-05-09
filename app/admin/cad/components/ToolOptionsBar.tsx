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
  applyInteractiveOffset,
  flipSelectionHorizontal,
  flipSelectionVertical,
  flipSelectionByDirection,
  invertSelection,
  arraySelectionRectangular,
  arraySelectionPolar,
  joinSelection,
} from '@/lib/cad/operations';
import { BUILTIN_LINE_TYPES } from '@/lib/cad/styles/linetype-library';
import { confirmAction } from './ConfirmDialog';
import { OFFSET_PRESETS } from '@/lib/cad/geometry/offset';

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
  const showMirror = activeTool === 'MIRROR';
  const showFlip = activeTool === 'FLIP';
  const showInvert = activeTool === 'INVERT';
  const showArray = activeTool === 'ARRAY';
  const showSplit = activeTool === 'SPLIT';
  const showTrim = activeTool === 'TRIM';
  const showExtend = activeTool === 'EXTEND';
  const showJoin = activeTool === 'JOIN';
  const showFillet = activeTool === 'FILLET';
  const showChamfer = activeTool === 'CHAMFER';
  const showDivide = activeTool === 'DIVIDE';
  const showExplode = activeTool === 'EXPLODE';
  const showReverse = activeTool === 'REVERSE';
  const showMatchProperties = activeTool === 'MATCH_PROPERTIES';
  const showPointAtDistance = activeTool === 'POINT_AT_DISTANCE';
  const showPerpendicular = activeTool === 'PERPENDICULAR';
  const showSmoothPolyline = activeTool === 'SMOOTH_POLYLINE';
  const showSimplifyPolyline = activeTool === 'SIMPLIFY_POLYLINE';
  const showInsertVertex = activeTool === 'INSERT_VERTEX';
  const showRemoveVertex = activeTool === 'REMOVE_VERTEX';
  const showInverse = activeTool === 'INVERSE';
  const showMeasureArea = activeTool === 'MEASURE_AREA';
  const showDim = activeTool === 'DIM';
  const showSelectAll = activeTool === 'SELECT' || activeTool === 'BOX_SELECT';
  const showLineStyle = activeTool === 'DRAW_LINE' || activeTool === 'DRAW_POLYLINE';
  const showOffset = activeTool === 'OFFSET';

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
        key={activeTool}
        className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider shrink-0 mr-1 whitespace-nowrap animate-[fadeIn_150ms_ease-out]"
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
          <Sep />
          {/* Phase indicator — surfaces the next required click in the interactive flow */}
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            {selCount === 0
              ? 'Select features first'
              : !ts.rotateCenter
                ? 'Click pivot point (or use a preset)'
                : 'Click to commit angle (cursor angle from pivot)'}
          </span>
          {ts.rotateCenter && (
            <button
              className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
              onClick={() => toolStore.setRotateCenter(null)}
              title="Cancel pivot — reset to phase 1"
            >
              ✕
            </button>
          )}
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
          <Sep />
          {/* Phase indicator — surfaces the next required click in the interactive flow */}
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            {selCount === 0
              ? 'Select features first'
              : !ts.basePoint
                ? 'Click pivot point (or use a preset)'
                : 'Click to commit factor (50 units = ×1, drag farther grows, closer shrinks)'}
          </span>
          {ts.basePoint && (
            <button
              className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
              onClick={() => toolStore.setBasePoint(null)}
              title="Cancel pivot — reset to phase 1"
            >
              ✕
            </button>
          )}
        </>
      )}

      {/* ── MIRROR tool options ─────────────────────────────────────────────── */}
      {showMirror && (
        <>
          <Sep />
          {/* Axis-mode picker */}
          <Tooltip
            label="Mirror Axis"
            description="Two Points: classic two-click axis. Pick Line: click an existing line/edge to use as the axis. Angle: click an anchor point to mirror at the typed angle through it."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-0.5">
              {(['TWO_POINTS', 'PICK_LINE', 'ANGLE'] as const).map((m) => (
                <button
                  key={m}
                  className={`px-2 h-6 rounded text-[11px] border transition-colors whitespace-nowrap
                    ${ts.mirrorAxisMode === m
                      ? 'bg-pink-600 border-pink-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                  onClick={() => {
                    toolStore.setMirrorAxisMode(m);
                    toolStore.clearDrawingPoints();
                  }}
                >
                  {m === 'TWO_POINTS' ? '∶∶ Two Pts' : m === 'PICK_LINE' ? '┃ Pick Line' : '∠ Angle'}
                </button>
              ))}
            </div>
          </Tooltip>
          {ts.mirrorAxisMode === 'ANGLE' && (
            <>
              <Sep />
              <Tooltip
                label="Axis Angle"
                description="Angle of the mirror axis from horizontal in degrees. CCW positive. Range 0–179° (180° wraps back to 0°)."
                side="bottom"
                delay={400}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-400 shrink-0">∠</span>
                  <input
                    type="number"
                    min={0}
                    max={179}
                    step={1}
                    className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-pink-500"
                    value={ts.mirrorAngle}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) toolStore.setMirrorAngle(v);
                    }}
                  />
                  <span className="text-[10px] text-gray-500">°</span>
                  <div className="flex gap-0.5">
                    {[0, 45, 90, 135].map((a) => (
                      <button
                        key={a}
                        className={`px-1.5 h-6 rounded text-[10px] border transition-colors
                          ${Math.abs(ts.mirrorAngle - a) < 0.01
                            ? 'bg-pink-600 border-pink-500 text-white'
                            : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                        onClick={() => toolStore.setMirrorAngle(a)}
                      >
                        {a}°
                      </button>
                    ))}
                  </div>
                </div>
              </Tooltip>
            </>
          )}
          <Sep />
          {/* Quick centroid presets — same as the existing
              flipSelection helpers, work regardless of axis
              mode and respect Copy Mode. */}
          <Tooltip
            label="Quick Mirror"
            description="Apply a mirror immediately through the selection's centroid. Honours Copy Mode."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0">Quick:</span>
              <div className="flex gap-0.5">
                <button
                  className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
                  onClick={() => {
                    if (selCount === 0) return;
                    if (copyMode) duplicateSelection(0, 0);
                    flipSelectionHorizontal();
                  }}
                  title="Mirror across vertical axis through centroid"
                >
                  ↔ Vertical
                </button>
                <button
                  className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
                  onClick={() => {
                    if (selCount === 0) return;
                    if (copyMode) duplicateSelection(0, 0);
                    flipSelectionVertical();
                  }}
                  title="Mirror across horizontal axis through centroid"
                >
                  ↕ Horizontal
                </button>
              </div>
            </div>
          </Tooltip>
          <Sep />
          {/* Phase indicator — describes the next click depending on axis mode. */}
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            {selCount === 0
              ? 'Select features first'
              : ts.mirrorAxisMode === 'PICK_LINE'
                ? 'Click an existing line / edge to use as the axis'
                : ts.mirrorAxisMode === 'ANGLE'
                  ? 'Click an anchor point to mirror through'
                  : 'Click two points to define a custom mirror axis'}
          </span>
        </>
      )}

      {/* ── FLIP tool options ─────────────────────────────────────────────── */}
      {showFlip && (
        <>
          <Sep />
          <Tooltip
            label="Flip Direction"
            description="H: top↔bottom across horizontal axis. V: left↔right across vertical axis. D1: across the y=x diagonal. D2: across the y=-x anti-diagonal. All flip through the selection centroid. Click the canvas (or use Apply) to commit; honours Copy Mode."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0">Direction:</span>
              <div className="flex gap-0.5">
                {(['H', 'V', 'D1', 'D2'] as const).map((d) => (
                  <button
                    key={d}
                    className={`px-2 h-6 rounded text-[11px] border transition-colors whitespace-nowrap
                      ${ts.flipDirection === d
                        ? 'bg-fuchsia-600 border-fuchsia-500 text-white'
                        : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                    onClick={() => toolStore.setFlipDirection(d)}
                  >
                    {d === 'H' ? '↕ H' : d === 'V' ? '↔ V' : d === 'D1' ? '⤢ D1' : '⤩ D2'}
                  </button>
                ))}
              </div>
            </div>
          </Tooltip>
          <Sep />
          <Tooltip
            label="Apply Flip"
            description="Apply the flip immediately through the selection's centroid using the chosen direction. Same as clicking on the canvas with the FLIP tool active."
            side="bottom"
            delay={400}
          >
            <button
              className="px-2.5 h-6 rounded text-[11px] bg-fuchsia-700 border border-fuchsia-600 text-white hover:bg-fuchsia-600 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={selCount === 0}
              onClick={() => flipSelectionByDirection(ts.flipDirection, copyMode)}
            >
              Flip
            </button>
          </Tooltip>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            {selCount === 0 ? 'Select features first' : 'Click canvas or press Apply to flip'}
          </span>
        </>
      )}

      {/* ── INVERT tool options ──────────────────────────────────────────── */}
      {showInvert && (
        <>
          <Sep />
          <Tooltip
            label="Invert (Point Inversion)"
            description="Click a point on the canvas to invert the selection through it (a 180° rotation around the clicked center). Honours Copy Mode."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-amber-400 shrink-0">⊙ Invert</span>
              <button
                className="px-2.5 h-6 rounded text-[11px] bg-amber-700 border border-amber-600 text-white hover:bg-amber-600 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={selCount === 0}
                onClick={() => {
                  if (selCount === 0) return;
                  // Apply via centroid as a quick path.
                  const ids = Array.from(useSelectionStore.getState().selectedIds);
                  const c = computeSelectionCentroid(ids);
                  invertSelection(c, copyMode);
                }}
                title="Invert through selection centroid"
              >
                Through Centroid
              </button>
            </div>
          </Tooltip>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            {selCount === 0 ? 'Select features first' : 'Click any point to use as the inversion center'}
          </span>
        </>
      )}

      {/* ── SPLIT tool options ─────────────────────────────────────────────── */}
      {showSplit && (
        <>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click any line, polyline, or polygon to break it at the cursor point. The lime ring marks the split location.
          </span>
        </>
      )}

      {/* ── TRIM tool options ──────────────────────────────────────────────── */}
      {showTrim && (
        <>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click a line or polyline portion that crosses another feature — the section between the two adjacent crossings (highlighted red) gets removed. No crossings = whole feature deleted.
          </span>
        </>
      )}

      {/* ── EXTEND tool options ────────────────────────────────────────────── */}
      {showExtend && (
        <>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click near the end of a line or polyline — that end (closer of the two) lengthens along its tangent until it hits the next feature. The bright green ghost shows the extension; a grey ring means nothing lies in the extension direction.
          </span>
        </>
      )}

      {/* ── INVERSE tool options ───────────────────────────────────────────── */}
      {showInverse && (
        <>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click to set the base point, then click again to measure each leg. Bearing + distance + running total stream into the command bar; press Esc to finish.
          </span>
        </>
      )}

      {/* ── MEASURE_AREA tool options ──────────────────────────────────────── */}
      {showMeasureArea && (
        <>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click polygon vertices to read live perimeter + area (sq ft + acres). Magenta fill previews the polygon; press Esc to finish.
          </span>
        </>
      )}

      {/* ── DIM tool options ───────────────────────────────────────────────── */}
      {showDim && (
        <>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click two points to place a permanent bearing + distance annotation. The TEXT label rotates parallel to the dimension line and offsets 6 ft perpendicular so it reads clear of the geometry.
          </span>
        </>
      )}

      {/* ── REMOVE_VERTEX tool options ─────────────────────────────────────── */}
      {showRemoveVertex && (
        <>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click within 14 px of a vertex on a POLYLINE / POLYGON to delete it. Red X marks the target; grey ring means the chain is at minimum vertices and can’t shrink further.
          </span>
        </>
      )}

      {/* ── INSERT_VERTEX tool options ─────────────────────────────────────── */}
      {showInsertVertex && (
        <>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click on any POLYLINE or POLYGON edge to insert a new vertex at the click point. The cyan ring shows where the vertex will land. Endpoint-coincident clicks are no-ops.
          </span>
        </>
      )}

      {/* ── SIMPLIFY_POLYLINE tool options ─────────────────────────────────── */}
      {showSimplifyPolyline && (
        <>
          <Sep />
          <Tooltip
            label="RDP Tolerance"
            description="Distance tolerance for the Ramer-Douglas-Peucker simplification, in feet. Vertices closer than this to the line through their kept neighbours get dropped. Smaller = more vertices preserved (precise); larger = more aggressive pruning (smoother)."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0">Tol:</span>
              <input
                type="number"
                min={0.01}
                step={0.1}
                className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-orange-500"
                value={ts.simplifyTolerance}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) toolStore.setSimplifyTolerance(v);
                }}
              />
              <span className="text-[10px] text-gray-500">ft</span>
            </div>
          </Tooltip>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click any POLYLINE / POLYGON. Faint orange shows the source; bright orange shows the predicted reduced chain.
          </span>
        </>
      )}

      {/* ── SMOOTH_POLYLINE tool options ───────────────────────────────────── */}
      {showSmoothPolyline && (
        <>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click any POLYLINE / POLYGON (≥ 3 vertices) to replace it with a smooth SPLINE that passes through the same vertices. Lavender ghost shows the curve before clicking.
          </span>
        </>
      )}

      {/* ── PERPENDICULAR tool options ─────────────────────────────────────── */}
      {showPerpendicular && (
        <>
          <Sep />
          {ts.perpendicularSourcePoint && (
            <button
              className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
              onClick={() => toolStore.setPerpendicularSourcePoint(null)}
              title="Clear source — restart point picking"
            >
              ✕
            </button>
          )}
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            {!ts.perpendicularSourcePoint
              ? 'Click the source point — snaps to an existing POINT feature when one is in range, otherwise uses the clicked world position.'
              : 'Click a LINE / POLYLINE / POLYGON — the cyan dashed line shows the perpendicular foot on the hovered segment.'}
          </span>
        </>
      )}

      {/* ── POINT_AT_DISTANCE tool options ─────────────────────────────────── */}
      {showPointAtDistance && (
        <>
          <Sep />
          <Tooltip
            label="Distance Along Feature"
            description="Arc-length offset (feet) from the chosen end. Distances larger than the feature's total length clamp to the far endpoint so the marker always lands on the geometry."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0">Dist:</span>
              <input
                type="number"
                min={0}
                step={1}
                className="w-20 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-lime-500"
                value={ts.pointAtDistanceValue}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v >= 0) toolStore.setPointAtDistanceValue(v);
                }}
              />
              <span className="text-[10px] text-gray-500">ft</span>
            </div>
          </Tooltip>
          <Sep />
          <Tooltip
            label="Origin End"
            description="From the START (vertex 0) or END (last vertex) of the feature. The cyan square in the live preview marks the chosen origin."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-0.5">
              {[
                { label: '◇ Start', val: false },
                { label: 'End ◇', val: true },
              ].map((o) => (
                <button
                  key={o.label}
                  className={`px-2 h-6 rounded text-[11px] border transition-colors whitespace-nowrap
                    ${ts.pointAtDistanceFromEnd === o.val
                      ? 'bg-lime-600 border-lime-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                  onClick={() => toolStore.setPointAtDistanceFromEnd(o.val)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Tooltip>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click any line / polyline / polygon — the lime ring shows the predicted commit point.
          </span>
        </>
      )}

      {/* ── MATCH_PROPERTIES tool options ──────────────────────────────────── */}
      {showMatchProperties && (
        <>
          <Sep />
          {ts.matchPropertiesSourceId && (
            <button
              className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
              onClick={() => toolStore.setMatchPropertiesSourceId(null)}
              title="Clear source — pick a new model feature"
            >
              ✕
            </button>
          )}
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            {!ts.matchPropertiesSourceId
              ? 'Click a feature to lock it in as the model style.'
              : 'Click each target feature to paint the source style + layer onto it. Esc to finish.'}
          </span>
        </>
      )}

      {/* ── REVERSE tool options ───────────────────────────────────────────── */}
      {showReverse && (
        <>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click any LINE / POLYLINE / POLYGON to flip its direction. The cyan square marks the current start; the arrowhead marks the current end. Useful when offset side, DIVIDE numbering, or label rotation went the wrong way.
          </span>
        </>
      )}

      {/* ── EXPLODE tool options ───────────────────────────────────────────── */}
      {showExplode && (
        <>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click any POLYLINE or POLYGON to burst it into individual LINE features. Vertex markers (white rings) show every breakpoint; alternating orange/cyan strokes mark each future segment. Style and properties carry over.
          </span>
        </>
      )}

      {/* ── DIVIDE tool options ────────────────────────────────────────────── */}
      {showDivide && (
        <>
          <Sep />
          <Tooltip
            label="Divide Count"
            description="Number of equal-length segments to divide the feature into. Drops count − 1 POINT markers at equal arc-length intervals along the source. Range 2–100."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0">÷</span>
              <input
                type="number"
                min={2}
                max={100}
                step={1}
                className="w-14 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-lime-500"
                value={ts.divideCount}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v)) toolStore.setDivideCount(v);
                }}
              />
              <span className="text-[11px] text-gray-500">→ {ts.divideCount - 1} markers</span>
            </div>
          </Tooltip>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            Click any line / polyline / polygon to drop {ts.divideCount - 1} station marker{ts.divideCount - 1 === 1 ? '' : 's'} at equal arc-length intervals. The source stays untouched.
          </span>
        </>
      )}

      {/* ── CHAMFER tool options ───────────────────────────────────────────── */}
      {showChamfer && (
        <>
          <Sep />
          <Tooltip
            label="Chamfer Distances"
            description="How far to trim each line back from the corner along its keep direction. Equal distances produce a symmetric chamfer (45° relative to a right-angle corner); unequal distances produce an asymmetric bevel — useful when matching a road-design table or property setback callout."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0">D1:</span>
              <input
                type="number"
                min={0.01}
                step={0.5}
                className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-amber-500"
                value={ts.chamferDistance1}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) toolStore.setChamferDistance1(v);
                }}
              />
              <span className="text-[11px] text-gray-400 shrink-0">D2:</span>
              <input
                type="number"
                min={0.01}
                step={0.5}
                className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-amber-500"
                value={ts.chamferDistance2}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) toolStore.setChamferDistance2(v);
                }}
              />
              <button
                className="px-1.5 h-6 rounded text-[10px] bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
                onClick={() => toolStore.setChamferDistance2(ts.chamferDistance1)}
                title="Make D2 equal D1 (symmetric chamfer)"
              >
                = D1
              </button>
              <span className="text-[10px] text-gray-500">ft</span>
            </div>
          </Tooltip>
          <Sep />
          {ts.chamferPickedLineId && (
            <button
              className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
              onClick={() => toolStore.setChamferPickedLine(null, null)}
              title="Cancel — restart line picking"
            >
              ✕
            </button>
          )}
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            {!ts.chamferPickedLineId
              ? 'Click first line on the side you want to keep'
              : 'Click second line on the side you want to keep — cyan ghost shows the bevel'}
          </span>
        </>
      )}

      {/* ── FILLET tool options ────────────────────────────────────────────── */}
      {showFillet && (
        <>
          <Sep />
          <Tooltip
            label="Fillet Radius"
            description="Radius of the fillet arc in feet. The arc is tangent to both lines at distance radius / tan(half-angle) from their intersection. The lines must each be at least that long; otherwise the fillet bails with an error."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0">R:</span>
              <input
                type="number"
                min={0.01}
                step={0.5}
                className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-amber-500"
                value={ts.filletRadius}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) toolStore.setFilletRadius(v);
                }}
              />
              <span className="text-[10px] text-gray-500">ft</span>
            </div>
          </Tooltip>
          <Sep />
          {ts.filletPickedLineId && (
            <button
              className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
              onClick={() => toolStore.setFilletPickedLine(null, null)}
              title="Cancel — restart line picking"
            >
              ✕
            </button>
          )}
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            {!ts.filletPickedLineId
              ? 'Click first line on the side you want to keep'
              : 'Click second line on the side you want to keep — cyan ghost shows the fillet'}
          </span>
        </>
      )}

      {/* ── JOIN tool options ──────────────────────────────────────────────── */}
      {showJoin && (
        <>
          <Sep />
          <Tooltip
            label="Apply Join"
            description="Merge the selected lines / polylines into one POLYLINE. Endpoints within 0.01 ft are treated as coincident. Selection must form a single chain — branches or fragments are rejected with a console message."
            side="bottom"
            delay={400}
          >
            <button
              className="px-2.5 h-6 rounded text-[11px] bg-fuchsia-700 border border-fuchsia-600 text-white hover:bg-fuchsia-600 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={selCount < 2}
              onClick={() => {
                const result = joinSelection();
                if (!result.ok) {
                  // Surface failure reason via the command bar
                  // output channel so the surveyor sees why it
                  // didn't merge.
                  window.dispatchEvent(new CustomEvent('cad:commandOutput', {
                    detail: { text: `JOIN — ${result.reason ?? 'failed'}` },
                  }));
                }
              }}
            >
              Join {selCount >= 2 ? `${selCount}` : ''}
            </button>
          </Tooltip>
          <Sep />
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            {selCount === 0
              ? 'Click features to add them to the chain'
              : selCount === 1
                ? 'Click another feature to extend the chain'
                : 'Click empty space (or press Apply) to merge into one POLYLINE'}
          </span>
        </>
      )}

      {/* ── ARRAY tool options ─────────────────────────────────────────────── */}
      {showArray && (
        <>
          <Sep />
          {/* Mode picker — RECT or POLAR */}
          <Tooltip
            label="Array Layout"
            description="Rectangular: rows × cols grid with row/col spacing. Polar: count copies around a center point, evenly spaced across an angle span."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-0.5">
              {(['RECT', 'POLAR'] as const).map((m) => (
                <button
                  key={m}
                  className={`px-2 h-6 rounded text-[11px] border transition-colors whitespace-nowrap
                    ${ts.arrayMode === m
                      ? 'bg-cyan-600 border-cyan-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                  onClick={() => toolStore.setArrayMode(m)}
                >
                  {m === 'RECT' ? '▦ Rect' : '◯ Polar'}
                </button>
              ))}
            </div>
          </Tooltip>
          <Sep />
          {ts.arrayMode === 'RECT' ? (
            <>
              <Tooltip
                label="Array Grid"
                description="Number of rows × columns. The original counts as row 0, col 0; the remaining cells are placed at row × row-spacing and col × col-spacing offsets."
                side="bottom"
                delay={400}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-400 shrink-0">Rows:</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    className="w-12 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-cyan-500"
                    value={ts.arrayRows}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) toolStore.setArrayRows(v);
                    }}
                  />
                  <span className="text-[11px] text-gray-500">×</span>
                  <span className="text-[11px] text-gray-400 shrink-0">Cols:</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    className="w-12 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-cyan-500"
                    value={ts.arrayCols}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) toolStore.setArrayCols(v);
                    }}
                  />
                </div>
              </Tooltip>
              <Sep />
              <Tooltip
                label="Array Spacing"
                description="Distance between row origins (vertical) and column origins (horizontal) in world units. Negative values mirror the array direction."
                side="bottom"
                delay={400}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-400 shrink-0">↕</span>
                  <input
                    type="number"
                    step={1}
                    className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-cyan-500"
                    value={ts.arrayRowSpacing}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) toolStore.setArrayRowSpacing(v);
                    }}
                  />
                  <span className="text-[11px] text-gray-400 shrink-0">↔</span>
                  <input
                    type="number"
                    step={1}
                    className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-cyan-500"
                    value={ts.arrayColSpacing}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) toolStore.setArrayColSpacing(v);
                    }}
                  />
                </div>
              </Tooltip>
              <Sep />
              <Tooltip label="Apply Array" description="Replicate the selection in a rectangular grid using the current rows × cols × spacing." side="bottom" delay={400}>
                <button
                  className="px-2.5 h-6 rounded text-[11px] bg-cyan-700 border border-cyan-600 text-white hover:bg-cyan-600 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={selCount === 0 || (ts.arrayRows * ts.arrayCols) <= 1}
                  onClick={() => arraySelectionRectangular(ts.arrayRows, ts.arrayCols, ts.arrayRowSpacing, ts.arrayColSpacing)}
                >
                  Array {ts.arrayRows}×{ts.arrayCols}
                </button>
              </Tooltip>
              <Sep />
              <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
                {selCount === 0
                  ? 'Select features first'
                  : (ts.arrayRows * ts.arrayCols) <= 1
                    ? 'Set rows × cols ≥ 2 to array'
                    : `Click canvas or Apply to add ${ts.arrayRows * ts.arrayCols - 1} cop${(ts.arrayRows * ts.arrayCols - 1) === 1 ? 'y' : 'ies'}`}
              </span>
            </>
          ) : (
            <>
              <Tooltip
                label="Polar Array"
                description="Number of copies (including original) and total angle span. 360° wraps a full circle; smaller angles sweep an arc. Negative angle sweeps clockwise."
                side="bottom"
                delay={400}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-400 shrink-0">Count:</span>
                  <input
                    type="number"
                    min={2}
                    max={360}
                    step={1}
                    className="w-14 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-cyan-500"
                    value={ts.arrayPolarCount}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) toolStore.setArrayPolarCount(v);
                    }}
                  />
                  <span className="text-[11px] text-gray-400 shrink-0">∠</span>
                  <input
                    type="number"
                    min={-360}
                    max={360}
                    step={1}
                    className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-cyan-500"
                    value={ts.arrayPolarAngleDeg}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) toolStore.setArrayPolarAngleDeg(v);
                    }}
                  />
                  <span className="text-[10px] text-gray-500">°</span>
                  <div className="flex gap-0.5">
                    {[90, 180, 270, 360].map((a) => (
                      <button
                        key={a}
                        className={`px-1.5 h-6 rounded text-[10px] border transition-colors
                          ${Math.abs(ts.arrayPolarAngleDeg - a) < 0.01
                            ? 'bg-cyan-600 border-cyan-500 text-white'
                            : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                        onClick={() => toolStore.setArrayPolarAngleDeg(a)}
                      >
                        {a}°
                      </button>
                    ))}
                  </div>
                </div>
              </Tooltip>
              <Sep />
              <ToggleBtn
                active={ts.arrayPolarRotate}
                onClick={() => toolStore.setArrayPolarRotate(!ts.arrayPolarRotate)}
                label="Rotate Items"
                tooltipLabel="Rotate Items"
                tooltipDesc="When ON, each polar copy is rotated to match its radial position (CAD default). When OFF, copies keep the original orientation — useful for symbols like manhole covers that must stay upright."
                color="bg-cyan-700"
              />
              <Sep />
              {/* Center pivot helper — set the polar center to the selection centroid */}
              <Tooltip
                label="Center of Mass"
                description="Set the polar array center to the bounding-box centroid of the selected elements. Otherwise, click anywhere on the canvas to set the center, then click again to commit."
                side="bottom"
                delay={400}
              >
                <button
                  className="px-2.5 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors whitespace-nowrap disabled:opacity-50"
                  disabled={selCount === 0}
                  onClick={() => {
                    const ids = Array.from(selectionStore.selectedIds);
                    if (!ids.length) return;
                    toolStore.setArrayPolarCenter(computeSelectionCentroid(ids));
                  }}
                >
                  ⊕ Center of Mass
                </button>
              </Tooltip>
              <Sep />
              <Tooltip label="Apply Polar Array" description="Commit the polar array using the current count, angle span, and center. Disabled until a center has been picked (click the canvas or use Center of Mass)." side="bottom" delay={400}>
                <button
                  className="px-2.5 h-6 rounded text-[11px] bg-cyan-700 border border-cyan-600 text-white hover:bg-cyan-600 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={selCount === 0 || ts.arrayPolarCount < 2 || !ts.arrayPolarCenter}
                  onClick={() => {
                    if (!ts.arrayPolarCenter) return;
                    arraySelectionPolar(
                      ts.arrayPolarCount,
                      ts.arrayPolarAngleDeg,
                      ts.arrayPolarCenter,
                      ts.arrayPolarRotate,
                    );
                    toolStore.setArrayPolarCenter(null);
                  }}
                >
                  Polar ×{ts.arrayPolarCount}
                </button>
              </Tooltip>
              {ts.arrayPolarCenter && (
                <button
                  className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
                  onClick={() => toolStore.setArrayPolarCenter(null)}
                  title="Clear locked-in center"
                >
                  ✕
                </button>
              )}
              <Sep />
              <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
                {selCount === 0
                  ? 'Select features first'
                  : !ts.arrayPolarCenter
                    ? 'Click canvas to set center (or use Center of Mass)'
                    : `Click canvas or Apply to add ${ts.arrayPolarCount - 1} cop${ts.arrayPolarCount - 1 === 1 ? 'y' : 'ies'}`}
              </span>
            </>
          )}
        </>
      )}

      {/* ── OFFSET tool options ─────────────────────────────────────────────── */}
      {showOffset && (
        <>
          <Sep />
          {/* Phase indicator */}
          <span className={`text-[11px] font-medium px-2 h-6 flex items-center rounded border whitespace-nowrap
            ${ts.offsetSourceId
              ? 'bg-blue-700/40 border-blue-500 text-blue-300'
              : 'bg-gray-700 border-gray-600 text-gray-300'}`}
          >
            {ts.offsetSourceId
              ? ts.offsetMode === 'SCALE'
                ? '⟳ Click to commit scale offset'
                : ts.offsetMode === 'TRANSLATE'
                  ? '⟳ Click anywhere to commit translate offset'
                  : '⟳ Click side to place offset'
              : '① Click object to offset'}
          </span>
          {ts.offsetSourceId && (
            <Tooltip label="Cancel Selection" description="Deselect the current offset source and pick a new object." side="bottom" delay={400}>
              <button
                className="px-2 h-6 rounded text-[11px] bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
                onClick={() => {
                  toolStore.setOffsetSourceId(null);
                  toolStore.setOffsetSourceSegmentIndex(null);
                }}
              >
                ✕
              </button>
            </Tooltip>
          )}
          <Sep />
          {/* Target — whole feature or single segment.
              Curved sources (circle, ellipse, arc, spline)
              ignore SEGMENT and fall through to whole-shape. */}
          <Tooltip
            label="Offset Target"
            description="Whole: offset the entire feature as one. Segment: offset only the polyline edge nearest the cursor at pick time as a standalone line. Curved sources always offset as a whole."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-0.5">
              {(['WHOLE', 'SEGMENT'] as const).map((m) => (
                <button
                  key={m}
                  className={`px-2 h-6 rounded text-[11px] border transition-colors whitespace-nowrap
                    ${ts.offsetSegmentMode === m
                      ? 'bg-teal-600 border-teal-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                  onClick={() => {
                    toolStore.setOffsetSegmentMode(m);
                    // Switching modes mid-pick clears the
                    // captured segment index so the next
                    // phase-1 click recaptures correctly.
                    toolStore.setOffsetSourceSegmentIndex(null);
                  }}
                >
                  {m === 'WHOLE' ? '◇ Whole' : '┃ Segment'}
                </button>
              ))}
            </div>
          </Tooltip>
          <Sep />
          {/* Mode selector — PARALLEL vs SCALE vs TRANSLATE */}
          <Tooltip
            label="Offset Mode"
            description="Parallel: perpendicular offset by distance. Scale: proportional resize around the feature's centroid. Translate: programmatic vector offset — type a distance and azimuth (bearing) to copy the source by that exact vector."
            side="bottom"
            delay={400}
          >
            <div className="flex items-center gap-0.5">
              {(['PARALLEL', 'SCALE', 'TRANSLATE'] as const).map((m) => (
                <button
                  key={m}
                  className={`px-2 h-6 rounded text-[11px] border transition-colors whitespace-nowrap
                    ${ts.offsetMode === m
                      ? 'bg-orange-600 border-orange-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                  onClick={() => toolStore.setOffsetMode(m)}
                >
                  {m === 'PARALLEL' ? '∥ Parallel' : m === 'SCALE' ? '⤢ Scale' : '➜ Translate'}
                </button>
              ))}
            </div>
          </Tooltip>
          <Sep />
          {/* Mode-specific input — distance for PARALLEL, factor for SCALE, distance + bearing for TRANSLATE */}
          {ts.offsetMode === 'PARALLEL' && (
            <Tooltip
              label="Offset Distance"
              description="Distance to offset. Set to 0 to pick the distance dynamically by mouse position."
              side="bottom"
              delay={400}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-400 shrink-0">Dist:</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-blue-500"
                  value={ts.offsetDistance}
                  title={ts.offsetDistance === 0 ? 'Dynamic (follow cursor)' : `${ts.offsetDistance} units`}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) toolStore.setOffsetDistance(v);
                  }}
                />
              </div>
            </Tooltip>
          )}
          {ts.offsetMode === 'SCALE' && (
            <Tooltip
              label="Scale Factor"
              description="Multiplier for the proportional resize. >1 enlarges, <1 shrinks. Side ▷ Right inverts (acts as 1/factor) so you can shrink without retyping."
              side="bottom"
              delay={400}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-400 shrink-0">×</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.05}
                  className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-orange-500"
                  value={ts.offsetScaleFactor}
                  title={`Scale factor: ${ts.offsetScaleFactor}`}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) toolStore.setOffsetScaleFactor(v);
                  }}
                />
              </div>
            </Tooltip>
          )}
          {ts.offsetMode === 'TRANSLATE' && (
            <Tooltip
              label="Vector Distance + Bearing"
              description="Programmatic offset by a survey-style vector. Distance is the length in feet; bearing is an azimuth in degrees (0° = North, clockwise). Click anywhere on the canvas to commit; the source is copied by the exact vector regardless of cursor position."
              side="bottom"
              delay={400}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-400 shrink-0">Dist:</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-orange-500"
                  value={ts.offsetDistance}
                  title={`${ts.offsetDistance} units`}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v >= 0) toolStore.setOffsetDistance(v);
                  }}
                />
                <span className="text-[11px] text-gray-400 shrink-0">∠ Az:</span>
                <input
                  type="number"
                  min={0}
                  max={360}
                  step={1}
                  className="w-16 h-6 bg-gray-700 text-white text-[11px] rounded px-1.5 outline-none font-mono text-center border border-gray-600 focus:border-orange-500"
                  value={ts.offsetBearingDeg}
                  title={`Azimuth: ${ts.offsetBearingDeg}° (0=N, clockwise)`}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) toolStore.setOffsetBearingDeg(v);
                  }}
                />
                <span className="text-[10px] text-gray-500">°</span>
                {/* Quick azimuth presets — N / E / S / W */}
                <div className="flex gap-0.5">
                  {[
                    { label: 'N', deg: 0 },
                    { label: 'E', deg: 90 },
                    { label: 'S', deg: 180 },
                    { label: 'W', deg: 270 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      className={`px-1.5 h-6 rounded text-[10px] border transition-colors
                        ${Math.abs(ts.offsetBearingDeg - p.deg) < 0.01
                          ? 'bg-orange-600 border-orange-500 text-white'
                          : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                      onClick={() => toolStore.setOffsetBearingDeg(p.deg)}
                      title={`${p.label} = ${p.deg}°`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </Tooltip>
          )}
          {/* Side selector — only meaningful for PARALLEL
              (perpendicular direction) and SCALE (sign-flip
              for shrink). TRANSLATE encodes direction in the
              azimuth itself, so the side picker is hidden. */}
          {ts.offsetMode !== 'TRANSLATE' && (
            <>
              <Sep />
              <Tooltip
                label="Offset Side"
                description={
                  ts.offsetMode === 'SCALE'
                    ? "Side ◁ Left applies the factor as-is. Side ▷ Right inverts (1/factor) so the same number can be used for both 'blow up' and 'shrink'. 'Both' creates two offsets simultaneously (parallel only)."
                    : "Which side of the object to create the offset on. 'Both' creates offsets on both sides simultaneously."
                }
                side="bottom"
                delay={400}
              >
                <div className="flex items-center gap-0.5">
                  {(['LEFT', 'RIGHT', 'BOTH'] as const)
                    .filter((s) => ts.offsetMode === 'PARALLEL' || s !== 'BOTH')
                    .map((s) => (
                      <button
                        key={s}
                        className={`px-2 h-6 rounded text-[11px] border transition-colors whitespace-nowrap
                          ${ts.offsetSide === s
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                        onClick={() => toolStore.setOffsetSide(s)}
                        title={s === 'LEFT' ? 'Left / outside' : s === 'RIGHT' ? 'Right / inside' : 'Both sides'}
                      >
                        {s === 'LEFT' ? '◁ Left' : s === 'RIGHT' ? 'Right ▷' : '⇔ Both'}
                      </button>
                    ))}
                </div>
              </Tooltip>
            </>
          )}
          {ts.offsetMode === 'PARALLEL' && (
            <>
              <Sep />
              {/* Corner handling */}
              <Tooltip label="Corner Style" description="How corners are joined in the offset polyline: Miter (sharp), Round (arc), or Chamfer (beveled)." side="bottom" delay={400}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-400 shrink-0">Corner:</span>
                  <div className="flex items-center gap-0.5">
                    {(['MITER', 'ROUND', 'CHAMFER'] as const).map((m) => (
                      <button
                        key={m}
                        className={`px-2 h-6 rounded text-[11px] border transition-colors
                          ${ts.offsetCornerHandling === m
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}
                        onClick={() => toolStore.setOffsetCornerHandling(m)}
                      >
                        {m === 'MITER' ? '⌐ Miter' : m === 'ROUND' ? '◜ Round' : '/ Chamfer'}
                      </button>
                    ))}
                  </div>
                </div>
              </Tooltip>
            </>
          )}
          {ts.offsetMode === 'SCALE' && (
            <>
              <Sep />
              {/* Line weight scaling toggle (SCALE mode only) */}
              <ToggleBtn
                active={ts.offsetScaleLineWeight}
                onClick={() => toolStore.setOffsetScaleLineWeight(!ts.offsetScaleLineWeight)}
                label="Scale Stroke"
                tooltipLabel="Scale Line Weight"
                tooltipDesc="When ON, the offset feature's line weight scales with the geometry (a 2× scale also doubles the stroke). When OFF (default), the stroke stays the same so the new feature reads at the same visual weight as the source."
                color="bg-orange-700"
              />
            </>
          )}
          <Sep />
          {/* Presets — PARALLEL only (SCALE has no canonical
              survey distances). */}
          {ts.offsetMode === 'PARALLEL' && <OffsetPresetsDropdown />}
          {/* Quick-apply when a source is selected */}
          {ts.offsetSourceId && (
            (ts.offsetMode === 'PARALLEL' && ts.offsetDistance > 0) ||
            (ts.offsetMode === 'SCALE' && ts.offsetScaleFactor > 0 && ts.offsetScaleFactor !== 1) ||
            (ts.offsetMode === 'TRANSLATE' && ts.offsetDistance > 0)
          ) && (
            <>
              <Sep />
              <Tooltip label="Apply Offset" description="Apply the offset to the selected object with the current settings." side="bottom" delay={400}>
                <button
                  className="px-2.5 h-6 rounded text-[11px] bg-blue-700 border border-blue-600 text-white hover:bg-blue-600 transition-colors whitespace-nowrap"
                  onClick={() => {
                    const {
                      offsetSourceId: sid,
                      offsetDistance: dist,
                      offsetSide: side,
                      offsetCornerHandling: corner,
                      offsetMode: mode,
                      offsetScaleFactor: factor,
                      offsetScaleLineWeight: scaleWeight,
                      offsetBearingDeg: bearing,
                    } = toolStore.state;
                    if (!sid) return;
                    if (mode === 'SCALE') {
                      if (factor > 0 && factor !== 1) {
                        applyInteractiveOffset(sid, 0, side, corner, {
                          mode: 'SCALE',
                          scaleFactor: factor,
                          scaleLineWeight: scaleWeight,
                        });
                        toolStore.setOffsetSourceId(null);
                      }
                    } else if (mode === 'TRANSLATE') {
                      if (dist > 0) {
                        applyInteractiveOffset(sid, dist, side, corner, {
                          mode: 'TRANSLATE',
                          bearingDeg: bearing,
                        });
                        toolStore.setOffsetSourceId(null);
                      }
                    } else if (dist > 0) {
                      applyInteractiveOffset(sid, dist, side, corner);
                      toolStore.setOffsetSourceId(null);
                    }
                  }}
                >
                  Apply
                </button>
              </Tooltip>
            </>
          )}
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
                  onClick={async () => {
                    // Bulk deletes (5+ features) ask for
                    // confirmation so a stray Ctrl+A → Delete
                    // can't quietly wipe a drawing. Singletons
                    // skip the prompt — Ctrl+Z still works.
                    if (selCount >= 5) {
                      const ok = await confirmAction({
                        title: `Delete ${selCount} features?`,
                        message: 'This permanently removes the selected features from the drawing. You can undo with Ctrl+Z.',
                        confirmLabel: 'Delete',
                        danger: true,
                      });
                      if (!ok) return;
                    }
                    deleteSelection();
                  }}
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
// Offset presets dropdown
// ─────────────────────────────────────────────
function OffsetPresetsDropdown() {
  const toolStore = useToolStore();

  function applyPreset(presetId: string) {
    const preset = OFFSET_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (preset.config.distance !== undefined) toolStore.setOffsetDistance(preset.config.distance);
    if (preset.config.cornerHandling) toolStore.setOffsetCornerHandling(preset.config.cornerHandling);
  }

  return (
    <Tooltip label="Offset Presets" description="Load a common surveying offset distance and corner style." side="bottom" delay={400}>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-gray-400 shrink-0">Preset:</span>
        <select
          className="h-6 bg-gray-700 text-white text-[11px] rounded px-1 outline-none border border-gray-600 focus:border-blue-500 max-w-[160px]"
          defaultValue=""
          onChange={(e) => { if (e.target.value) applyPreset(e.target.value); }}
        >
          <option value="">— choose —</option>
          {OFFSET_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────
// Display name map
// ─────────────────────────────────────────────
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  SELECT: 'Select',
  BOX_SELECT: 'Box Select',
  PAN: 'Pan / Zoom',
  DRAW_POINT: 'Draw Point',
  DRAW_LINE: 'Draw Line',
  DRAW_POLYLINE: 'Draw Polyline',
  DRAW_POLYGON: 'Draw Polygon',
  DRAW_RECTANGLE: 'Draw Rectangle',
  DRAW_REGULAR_POLYGON: 'Regular Polygon',
  DRAW_CIRCLE: 'Circle (Center)',
  DRAW_CIRCLE_EDGE: 'Circle (Edge)',
  DRAW_ELLIPSE: 'Ellipse (Center)',
  DRAW_ELLIPSE_EDGE: 'Ellipse (Edge)',
  MOVE: 'Move',
  COPY: 'Copy',
  ROTATE: 'Rotate',
  MIRROR: 'Mirror',
  FLIP: 'Flip',
  INVERT: 'Invert',
  ARRAY: 'Array',
  SPLIT: 'Split',
  TRIM: 'Trim',
  EXTEND: 'Extend',
  JOIN: 'Join',
  FILLET: 'Fillet',
  CHAMFER: 'Chamfer',
  DIVIDE: 'Divide',
  EXPLODE: 'Explode',
  REVERSE: 'Reverse',
  MATCH_PROPERTIES: 'Match Properties',
  POINT_AT_DISTANCE: 'Point at Distance',
  PERPENDICULAR: 'Perpendicular',
  SMOOTH_POLYLINE: 'Smooth Polyline',
  SIMPLIFY_POLYLINE: 'Simplify Polyline',
  INSERT_VERTEX: 'Insert Vertex',
  REMOVE_VERTEX: 'Remove Vertex',
  MEASURE_AREA: 'Measure Area',
  DIM: 'Dimension',
  SCALE: 'Scale',
  ERASE: 'Erase',
  OFFSET: 'Offset',
};
