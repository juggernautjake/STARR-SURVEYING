'use client';
// app/admin/cad/components/StatusBar.tsx — Bottom status bar

import { useState, useEffect, useRef } from 'react';
import { useDrawingStore, useViewportStore, useSelectionStore, useToolStore, useAIStore, AI_MODE_CYCLE } from '@/lib/cad/store';
import { formatDistance, formatCoordinates, formatAngle } from '@/lib/cad/geometry/units';
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/cad/constants';
import { listAutosaves } from '@/lib/cad/persistence/autosave';
import type { SnapType } from '@/lib/cad/types';

const SNAP_TYPE_INFO: Array<{ type: SnapType; label: string; hint: string }> = [
  { type: 'ENDPOINT',      label: 'Endpoint',      hint: 'Snap to the start / end of any line, polyline, or arc.' },
  { type: 'MIDPOINT',      label: 'Midpoint',      hint: 'Snap to the midpoint of any line / arc.' },
  { type: 'INTERSECTION',  label: 'Intersection',  hint: 'Snap to where two features cross.' },
  { type: 'CENTER',        label: 'Center',        hint: 'Snap to the center of a circle, arc, or ellipse.' },
  { type: 'PERPENDICULAR', label: 'Perpendicular', hint: 'Snap to the perpendicular foot from the cursor to a line / arc.' },
  { type: 'NEAREST',       label: 'Nearest',       hint: 'Snap to the nearest point along any feature outline.' },
  { type: 'GRID',          label: 'Grid',          hint: 'Snap to the nearest grid intersection.' },
];

const TOOL_LABELS: Record<string, string> = {
  SELECT: 'Select',
  PAN: 'Pan',
  DRAW_POINT: 'Point',
  DRAW_LINE: 'Line',
  DRAW_POLYLINE: 'Polyline',
  DRAW_POLYGON: 'Polygon',
  DRAW_RECTANGLE: 'Rectangle',
  DRAW_REGULAR_POLYGON: 'Reg.Polygon',
  DRAW_CIRCLE: 'Circle',
  DRAW_CIRCLE_EDGE: 'Circle(E)',
  DRAW_ELLIPSE: 'Ellipse',
  DRAW_ELLIPSE_EDGE: 'Ellipse(E)',
  MOVE: 'Move',
  COPY: 'Copy',
  ROTATE: 'Rotate',
  MIRROR: 'Mirror',
  SCALE: 'Scale',
  ERASE: 'Erase',
};

/**
 * Per-mode badge styling. Colours follow §32.1:
 *   AUTO    — purple (high-autonomy, draws attention)
 *   COPILOT — blue   (collaborative, the default)
 *   COMMAND — teal   (task-oriented)
 *   MANUAL  — gray   (AI off; matches dimmed UI tone)
 */
const AI_MODE_BADGE_CLASS: Record<import('@/lib/cad/store').AIMode, string> = {
  AUTO:    'bg-purple-900/50 border-purple-500 text-purple-200 hover:bg-purple-800/60',
  COPILOT: 'bg-blue-900/50 border-blue-500 text-blue-200 hover:bg-blue-800/60',
  COMMAND: 'bg-teal-900/50 border-teal-500 text-teal-200 hover:bg-teal-800/60',
  MANUAL:  'bg-gray-800 border-gray-600 text-gray-400 hover:text-gray-200',
};

const MIN_ZOOM_PCT = 5;
const MAX_ZOOM_PCT = 500;
const ZOOM_STEP_PCT = 25;

interface StatusBarProps {
  /** Opens the RecentRecoveriesDialog (File → "Recover unsaved drawings…").
   *  When present, StatusBar surfaces a clickable "N recoverable" pill
   *  whenever IndexedDB carries autosaves for drawings other than the
   *  active one — recovery shouldn't be buried in a menu when work is
   *  one click away. */
  onOpenRecentRecoveries?: () => void;
}

export default function StatusBar({ onOpenRecentRecoveries }: StatusBarProps = {}) {
  const drawingStore = useDrawingStore();
  const viewportStore = useViewportStore();
  const selectionStore = useSelectionStore();
  const toolStore = useToolStore();
  const aiMode = useAIStore((s) => s.mode);
  const aiSandbox = useAIStore((s) => s.sandbox);
  const cycleAIMode = useAIStore((s) => s.cycleMode);
  const cursor = viewportStore.cursorWorld;
  const zoom = viewportStore.zoom;

  const { document: doc, activeLayerId } = drawingStore;
  const activeLayer = doc.layers[activeLayerId];
  const { snapEnabled, gridVisible, drawingScale } = doc.settings;
  const enabledSnapTypes = doc.settings.snapTypes ?? [];
  const prefs = doc.settings.displayPreferences ?? DEFAULT_DISPLAY_PREFERENCES;
  const selCount = selectionStore.selectionCount();
  // §UX U18 — surface the otherwise-buried "hidden features"
  // state. The Layer panel's "Hidden Items" button is easy to
  // miss; this pill in the status bar makes the count visible
  // and one-click recoverable.
  const hiddenCount = Object.values(doc.features).filter((f) => f.hidden).length;

  // §UX U16 (UX_POLISH §2.4) — "Recover unsaved drawings…" is the
  // 4th File-menu entry, easy to miss. Count IndexedDB autosaves
  // whose docId isn't the active drawing's; a non-zero count
  // surfaces a clickable pill in the bar so a surveyor never
  // forgets pending recoveries when reopening the app. Re-run on
  // docId change so a freshly-loaded drawing recomputes.
  const [otherRecoveryCount, setOtherRecoveryCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    listAutosaves()
      .then((entries) => {
        if (cancelled) return;
        setOtherRecoveryCount(
          entries.filter((e) => e.docId !== doc.id).length
        );
      })
      .catch(() => {
        // IndexedDB read failed (private-mode, quota, etc.).
        // Silently hide the pill — the menu entry still works.
      });
    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  const { activeTool, drawingPoints, basePoint, rotateCenter, orthoEnabled, polarEnabled, polarAngle, copyMode } = toolStore.state;

  // Express zoom as a percentage of 1px-per-world-unit baseline
  const zoomPct = Math.round(zoom * 100);

  // Zoom input editing state
  const [zoomEditing, setZoomEditing] = useState(false);
  const [zoomInputValue, setZoomInputValue] = useState('');
  const zoomInputRef = useRef<HTMLInputElement>(null);

  // Quick-snap popover state — anchored to the chevron next
  // to the Snap: ON/OFF toggle.
  const [snapPopoverOpen, setSnapPopoverOpen] = useState(false);
  const snapPopoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!snapPopoverOpen) return undefined;
    const onClickOutside = (e: MouseEvent) => {
      if (snapPopoverRef.current && !snapPopoverRef.current.contains(e.target as Node)) {
        setSnapPopoverOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSnapPopoverOpen(false);
    };
    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKey);
    };
  }, [snapPopoverOpen]);

  function toggleSnapType(type: SnapType) {
    const current = doc.settings.snapTypes ?? [];
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    drawingStore.updateSettings({ snapTypes: next });
  }

  // Sync input value whenever the external zoom changes (not while editing)
  useEffect(() => {
    if (!zoomEditing) {
      setZoomInputValue(String(zoomPct));
    }
  }, [zoomPct, zoomEditing]);

  function applyZoomPct(pct: number) {
    const clamped = Math.max(MIN_ZOOM_PCT, Math.min(MAX_ZOOM_PCT, pct));
    viewportStore.setZoom(clamped / 100);
  }

  function incrementZoom() {
    applyZoomPct(Math.min(MAX_ZOOM_PCT, zoomPct + ZOOM_STEP_PCT));
  }

  function decrementZoom() {
    applyZoomPct(Math.max(MIN_ZOOM_PCT, zoomPct - ZOOM_STEP_PCT));
  }

  function commitZoomInput() {
    const val = parseFloat(zoomInputValue);
    if (!isNaN(val) && val > 0) {
      applyZoomPct(val);
    } else {
      setZoomInputValue(String(zoomPct));
    }
    setZoomEditing(false);
  }

  function handleZoomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commitZoomInput();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setZoomInputValue(String(zoomPct));
      setZoomEditing(false);
      (e.target as HTMLInputElement).blur();
    }
  }

  // Live distance/angle when drawing — formatted per display preferences
  let distanceInfo: { dist: string; bearing: string } | null = null;
  const lastPt = drawingPoints[drawingPoints.length - 1] ?? basePoint ?? rotateCenter;
  if (lastPt && (activeTool.startsWith('DRAW_') || activeTool === 'MOVE' || activeTool === 'COPY' || activeTool === 'MIRROR')) {
    const dx = cursor.x - lastPt.x;
    const dy = cursor.y - lastPt.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Math angle (counter-clockwise from east) → survey bearing
    const mathAngleRad = Math.atan2(dy, dx);
    distanceInfo = {
      dist: formatDistance(dist, prefs),
      bearing: formatAngle(mathAngleRad, prefs, 'BEARING'),
    };
  }

  // Formatted cursor coordinates
  const coords = formatCoordinates(cursor.x, cursor.y, prefs);

  function toggleSnap() {
    drawingStore.updateSettings({ snapEnabled: !snapEnabled });
  }

  function toggleGrid() {
    drawingStore.updateSettings({ gridVisible: !gridVisible });
  }

  return (
    <div className="flex items-center bg-gray-900 border-t border-gray-700 px-3 py-0.5 text-xs text-gray-400 gap-4 overflow-hidden">
      {/* Coordinates */}
      <span className="font-mono shrink-0 text-cyan-300">
        {coords.label1}: {coords.value1} &nbsp; {coords.label2}: {coords.value2}
      </span>

      {/* Live dist/bearing when drawing */}
      {distanceInfo && (
        <>
          <span className="text-gray-600">|</span>
          <span className="font-mono shrink-0 text-cyan-400">
            d={distanceInfo.dist} &nbsp; {distanceInfo.bearing}
          </span>
        </>
      )}

      <span className="text-gray-600">|</span>

      {/* Zoom control: − [input %] + */}
      <div className="flex items-center gap-0.5 shrink-0" title="Zoom level (Ctrl+scroll to zoom, 5%–500%)">
        <button
          onClick={decrementZoom}
          disabled={zoomPct <= MIN_ZOOM_PCT}
          className="w-4 h-4 flex items-center justify-center rounded text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
          title={`Zoom out 25% (current: ${zoomPct}%)`}
        >
          −
        </button>
        <div className="relative flex items-center">
          <input
            ref={zoomInputRef}
            type="text"
            inputMode="numeric"
            value={zoomEditing ? zoomInputValue : String(zoomPct)}
            onChange={(e) => {
              setZoomEditing(true);
              setZoomInputValue(e.target.value);
            }}
            onFocus={() => {
              setZoomEditing(true);
              setZoomInputValue(String(zoomPct));
              setTimeout(() => zoomInputRef.current?.select(), 0);
            }}
            onBlur={commitZoomInput}
            onKeyDown={handleZoomKeyDown}
            className="w-10 text-center bg-gray-800 border border-gray-600 rounded text-gray-200 font-mono text-xs px-0.5 py-0 focus:outline-none focus:border-blue-500 focus:text-white"
            style={{ height: 18 }}
          />
          <span className="ml-0.5 text-gray-500 font-mono">%</span>
        </div>
        <button
          onClick={incrementZoom}
          disabled={zoomPct >= MAX_ZOOM_PCT}
          className="w-4 h-4 flex items-center justify-center rounded text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
          title={`Zoom in 25% (current: ${zoomPct}%)`}
        >
          +
        </button>
      </div>

      <span className="text-gray-600">|</span>

      {/* AI mode chip — Phase 6 §32 four-mode framework.
          Click cycles AUTO → COPILOT → COMMAND → MANUAL → AUTO
          (matches Ctrl+Shift+M). Sandbox dot appears when the
          active mode is writing to DRAFT__* layers. */}
      <button
        onClick={cycleAIMode}
        className={`shrink-0 flex items-center gap-1 px-1.5 py-0 rounded border text-[10px] font-semibold tracking-wider transition-colors ${AI_MODE_BADGE_CLASS[aiMode]}`}
        title={(() => {
          const i = AI_MODE_CYCLE.indexOf(aiMode);
          const next = AI_MODE_CYCLE[(i + 1) % AI_MODE_CYCLE.length];
          return `AI mode: ${aiMode} — click (or Ctrl+Shift+M) to cycle. Next: ${next}.` +
            (aiMode === 'MANUAL'
              ? ' AI entry points are hidden in MANUAL — no chat, no proposals, no right-click "Ask AI".'
              : aiSandbox
                ? ' Sandbox ON — AI writes route to DRAFT__* layers.'
                : ' Sandbox OFF — AI writes to live target layers.');
        })()}
      >
        {aiMode === 'MANUAL' ? (
          <>
            <span className="text-gray-500 line-through decoration-gray-500 decoration-1">AI</span>
            <span className="text-gray-400">off</span>
          </>
        ) : (
          <>AI: {aiMode}</>
        )}
        {aiMode !== 'MANUAL' && (
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${aiSandbox ? 'bg-amber-300' : 'bg-emerald-300'}`}
            aria-hidden
          />
        )}
      </button>

      <span className="text-gray-600">|</span>

      {/* Active tool */}
      <span className="shrink-0 text-gray-500 transition-colors duration-150" title="Active tool">
        {TOOL_LABELS[activeTool] ?? activeTool}
      </span>

      <span className="text-gray-600">|</span>

      {/* Active layer */}
      <button
        className="hover:text-white transition-colors shrink-0"
        title="Active layer"
        onClick={() => drawingStore.setActiveLayer(activeLayerId)}
      >
        Layer: <span className={activeLayer?.locked ? 'text-yellow-400' : 'text-white'}>{activeLayer?.name ?? '—'}{activeLayer?.locked ? ' 🔒' : ''}</span>
      </button>

      <span className="text-gray-600">|</span>

      {/* Selection count */}
      {selCount > 0 && (
        <>
          <span className="text-blue-400 shrink-0 animate-[fadeIn_150ms_ease-out]">{selCount} selected</span>
          <span className="text-gray-600">|</span>
        </>
      )}

      {/* Hidden features pill — click opens the Hidden Items
          panel. Skipped when nothing is hidden so the bar stays
          uncluttered. */}
      {hiddenCount > 0 && (
        <>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('cad:toggleHiddenItems'))}
            className="shrink-0 text-amber-300 hover:text-amber-100 transition-colors animate-[fadeIn_150ms_ease-out]"
            title={`${hiddenCount} hidden feature${hiddenCount === 1 ? '' : 's'} — click to manage`}
          >
            {hiddenCount} hidden
          </button>
          <span className="text-gray-600">|</span>
        </>
      )}

      {/* Recoverable-drawings pill — visible when IndexedDB carries
          autosaves for other docs. Click opens RecentRecoveriesDialog
          (same path as File → "Recover unsaved drawings…"), so the
          surveyor can recover work without browsing the File menu. */}
      {otherRecoveryCount > 0 && onOpenRecentRecoveries && (
        <>
          <button
            type="button"
            onClick={onOpenRecentRecoveries}
            className="shrink-0 text-amber-300 hover:text-amber-100 transition-colors animate-[fadeIn_150ms_ease-out]"
            title={`${otherRecoveryCount} recoverable drawing${otherRecoveryCount === 1 ? '' : 's'} — click to manage`}
          >
            🔄 {otherRecoveryCount} recoverable
          </button>
          <span className="text-gray-600">|</span>
        </>
      )}

      {/* Snap toggle + per-type popover */}
      <div className="relative flex items-center gap-0.5 shrink-0" ref={snapPopoverRef}>
        <button
          onClick={toggleSnap}
          className={`hover:text-white transition-colors ${snapEnabled ? 'text-green-400' : 'text-gray-500'}`}
          title="Toggle snap on/off (F3)"
        >
          Snap: {snapEnabled ? 'ON' : 'OFF'}
        </button>
        <button
          onClick={() => setSnapPopoverOpen((v) => !v)}
          className={`hover:text-white transition-colors px-0.5 ${snapPopoverOpen ? 'text-white' : 'text-gray-500'}`}
          title="Toggle individual snap types"
          aria-label="Snap type options"
        >
          ▾
        </button>
        {snapPopoverOpen && (
          <div
            className="absolute bottom-full left-0 mb-1 w-[260px] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-[150] p-2 animate-[fadeIn_120ms_ease-out]"
            role="menu"
          >
            <div className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-1 font-semibold flex items-center justify-between">
              <span>Active Snap Types</span>
              <span className="text-gray-600 normal-case tracking-normal text-[10px]">{enabledSnapTypes.length} of {SNAP_TYPE_INFO.length}</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {SNAP_TYPE_INFO.map((s) => {
                const enabled = enabledSnapTypes.includes(s.type);
                return (
                  <button
                    key={s.type}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={enabled}
                    className="w-full flex items-start gap-2 px-2 py-1.5 text-left text-xs hover:bg-gray-800 rounded transition-colors"
                    onClick={() => toggleSnapType(s.type)}
                  >
                    <span className={`mt-0.5 inline-block w-3 h-3 border rounded-sm shrink-0 ${enabled ? 'bg-green-500 border-green-400' : 'border-gray-600 bg-gray-800'}`}>
                      {enabled && (
                        <svg viewBox="0 0 12 12" className="w-full h-full" fill="none" stroke="white" strokeWidth="2">
                          <path d="M2 6 L5 9 L10 3" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block ${enabled ? 'text-gray-200' : 'text-gray-400'}`}>{s.label}</span>
                      <span className="block text-[10px] text-gray-500">{s.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-gray-700 mt-1 px-2 pt-1.5 pb-0.5 flex items-center gap-2">
              <button
                type="button"
                className="flex-1 text-[10px] py-0.5 px-1.5 rounded bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
                onClick={() => drawingStore.updateSettings({ snapTypes: SNAP_TYPE_INFO.map((s) => s.type) })}
              >
                Enable all
              </button>
              <button
                type="button"
                className="flex-1 text-[10px] py-0.5 px-1.5 rounded bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
                onClick={() => drawingStore.updateSettings({ snapTypes: [] })}
              >
                Disable all
              </button>
            </div>
          </div>
        )}
      </div>

      <span className="text-gray-600">|</span>

      {/* Grid toggle */}
      <button
        onClick={toggleGrid}
        className={`hover:text-white transition-colors shrink-0 ${gridVisible ? 'text-green-400' : 'text-gray-500'}`}
        title="Toggle grid (F7)"
      >
        Grid: {gridVisible ? 'ON' : 'OFF'}
      </button>

      <span className="text-gray-600">|</span>

      {/* Ortho mode */}
      {orthoEnabled && (
        <>
          <span className="text-blue-400 font-semibold shrink-0 animate-[fadeIn_150ms_ease-out]" title="Ortho mode active — cursor constrained to H/V axes (F8)">ORTHO</span>
          <span className="text-gray-600">|</span>
        </>
      )}

      {/* Polar tracking */}
      {polarEnabled && !orthoEnabled && (
        <>
          <span className="text-indigo-400 font-semibold shrink-0 animate-[fadeIn_150ms_ease-out]" title={`Polar tracking active at ${polarAngle}° increments (F10)`}>POLAR {polarAngle}°</span>
          <span className="text-gray-600">|</span>
        </>
      )}

      {/* Copy mode */}
      {copyMode && (
        <>
          <span className="text-green-400 font-semibold shrink-0 animate-[fadeIn_150ms_ease-out]" title="Copy mode: operations will keep the original">COPY</span>
          <span className="text-gray-600">|</span>
        </>
      )}

      {/* Drawing scale */}
      <span className="text-gray-500 shrink-0" title="Drawing scale">
        1″={drawingScale}′
      </span>
    </div>
  );
}
