'use client';
// app/admin/cad/components/ToolBar.tsx — Vertical drawing tool buttons with right-click variant flyouts

import { useState, useRef, useEffect } from 'react';
import {
  MousePointer2,
  Hand,
  Circle,
  Minus,
  Spline,
  Pentagon,
  RectangleHorizontal,
  Hexagon,
  Move,
  Copy,
  RotateCw,
  RotateCcw,
  FlipHorizontal2,
  FlipVertical2,
  Eraser,
  Expand,
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronRight,
  Slash,
} from 'lucide-react';
import { useToolStore, useSelectionStore, useViewportStore, useDrawingStore } from '@/lib/cad/store';
import {
  rotateSelection,
  flipSelectionHorizontal,
  flipSelectionVertical,
  duplicateSelection,
  scaleSelection,
  deleteSelection,
} from '@/lib/cad/operations';
import type { ToolType } from '@/lib/cad/types';

// ─────────────────────────────────────────────
// Tool group data
// ─────────────────────────────────────────────

interface ToolVariantItem {
  /** If set, switches to this tool */
  tool?: ToolType;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  /** If set, fires this instant action instead of switching tool */
  action?: () => void;
  /** Draw a separator below this item */
  belowSep?: boolean;
}

interface ToolGroupDef {
  mainTool: ToolType;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  variants: ToolVariantItem[];
}

// We define this as a factory function so the icons and actions can reference the stores at render time.
function buildToolGroups(
  toolStore: ReturnType<typeof useToolStore>,
  viewportStore: ReturnType<typeof useViewportStore>,
  drawingStore: ReturnType<typeof useDrawingStore>,
): ToolGroupDef[] {
  return [
    {
      mainTool: 'SELECT',
      label: 'Select',
      shortcut: 'S',
      icon: <MousePointer2 size={16} />,
      variants: [
        { tool: 'SELECT', label: 'Select (click / box)', shortcut: 'S', icon: <MousePointer2 size={14} /> },
      ],
    },
    {
      mainTool: 'PAN',
      label: 'Pan',
      shortcut: 'H',
      icon: <Hand size={16} />,
      variants: [
        { tool: 'PAN', label: 'Pan', shortcut: 'H', icon: <Hand size={14} /> },
        {
          label: 'Zoom In',
          shortcut: 'Ctrl+=',
          icon: <ZoomIn size={14} />,
          action: () =>
            viewportStore.zoomAt(
              viewportStore.screenWidth / 2,
              viewportStore.screenHeight / 2,
              1.5,
            ),
        },
        {
          label: 'Zoom Out',
          shortcut: 'Ctrl+-',
          icon: <ZoomOut size={14} />,
          action: () =>
            viewportStore.zoomAt(
              viewportStore.screenWidth / 2,
              viewportStore.screenHeight / 2,
              1 / 1.5,
            ),
        },
        {
          label: 'Zoom Extents',
          shortcut: 'Z E',
          icon: <Maximize size={14} />,
          belowSep: false,
          action: () => window.dispatchEvent(new CustomEvent('cad:zoomExtents')),
        },
      ],
    },
    {
      mainTool: 'DRAW_POINT',
      label: 'Point',
      shortcut: 'P',
      icon: <Circle size={16} />,
      variants: [
        { tool: 'DRAW_POINT', label: 'Point', shortcut: 'P', icon: <Circle size={14} /> },
      ],
    },
    {
      mainTool: 'DRAW_LINE',
      label: 'Line',
      shortcut: 'L',
      icon: <Minus size={16} />,
      variants: [
        { tool: 'DRAW_LINE', label: 'Line', shortcut: 'L', icon: <Minus size={14} /> },
        {
          tool: 'DRAW_LINE',
          label: 'Construction Line',
          icon: <Slash size={14} />,
          // Same tool but sets the shapeType property — handled in CanvasViewport
          action: () => toolStore.setTool('DRAW_LINE'),
        },
      ],
    },
    {
      mainTool: 'DRAW_POLYLINE',
      label: 'Polyline',
      shortcut: 'PL',
      icon: <Spline size={16} />,
      variants: [
        { tool: 'DRAW_POLYLINE', label: 'Polyline (open)', shortcut: 'PL', icon: <Spline size={14} /> },
      ],
    },
    {
      mainTool: 'DRAW_POLYGON',
      label: 'Polygon',
      shortcut: 'PG',
      icon: <Pentagon size={16} />,
      variants: [
        { tool: 'DRAW_POLYGON', label: 'Freeform Polygon', shortcut: 'PG', icon: <Pentagon size={14} /> },
        {
          tool: 'DRAW_RECTANGLE',
          label: 'Rectangle',
          shortcut: 'RE',
          icon: <RectangleHorizontal size={14} />,
        },
        {
          tool: 'DRAW_REGULAR_POLYGON',
          label: 'Regular Polygon',
          icon: <Hexagon size={14} />,
        },
      ],
    },
    {
      mainTool: 'MOVE',
      label: 'Move',
      shortcut: 'M',
      icon: <Move size={16} />,
      variants: [
        { tool: 'MOVE', label: 'Move', shortcut: 'M', icon: <Move size={14} /> },
        {
          label: 'Duplicate',
          shortcut: 'Ctrl+D',
          icon: <Copy size={14} />,
          action: () => duplicateSelection(),
        },
      ],
    },
    {
      mainTool: 'COPY',
      label: 'Copy',
      shortcut: 'CO',
      icon: <Copy size={16} />,
      variants: [
        { tool: 'COPY', label: 'Copy (interactive)', shortcut: 'CO', icon: <Copy size={14} /> },
        {
          label: 'Duplicate in-place',
          icon: <Copy size={14} />,
          action: () => duplicateSelection(),
        },
      ],
    },
    {
      mainTool: 'ROTATE',
      label: 'Rotate',
      shortcut: 'RO',
      icon: <RotateCw size={16} />,
      variants: [
        { tool: 'ROTATE', label: 'Rotate (interactive)', shortcut: 'RO', icon: <RotateCw size={14} /> },
        {
          label: 'Rotate 90° CW',
          icon: <RotateCw size={14} />,
          action: () => rotateSelection(-90),
          belowSep: false,
        },
        {
          label: 'Rotate 90° CCW',
          icon: <RotateCcw size={14} />,
          action: () => rotateSelection(90),
        },
        {
          label: 'Rotate 180°',
          icon: <RotateCw size={14} />,
          action: () => rotateSelection(180),
        },
      ],
    },
    {
      mainTool: 'MIRROR',
      label: 'Mirror',
      shortcut: 'MI',
      icon: <FlipHorizontal2 size={16} />,
      variants: [
        { tool: 'MIRROR', label: 'Mirror (pick line)', shortcut: 'MI', icon: <FlipHorizontal2 size={14} /> },
        {
          label: 'Flip Horizontal',
          icon: <FlipHorizontal2 size={14} />,
          action: () => flipSelectionHorizontal(),
        },
        {
          label: 'Flip Vertical',
          icon: <FlipVertical2 size={14} />,
          action: () => flipSelectionVertical(),
        },
      ],
    },
    {
      mainTool: 'SCALE',
      label: 'Scale',
      shortcut: 'SC',
      icon: <Expand size={16} />,
      variants: [
        { tool: 'SCALE', label: 'Scale (interactive)', shortcut: 'SC', icon: <Expand size={14} /> },
        {
          label: 'Scale by Factor…',
          icon: <Expand size={14} />,
          action: () => {
            const input = window.prompt('Enter scale factor (e.g. 2 for double size):');
            if (input === null) return;
            const f = parseFloat(input);
            if (!isNaN(f) && f > 0) scaleSelection(f);
          },
        },
      ],
    },
    {
      mainTool: 'ERASE',
      label: 'Erase',
      shortcut: 'E',
      icon: <Eraser size={16} />,
      variants: [
        { tool: 'ERASE', label: 'Erase (click)', shortcut: 'E', icon: <Eraser size={14} /> },
        {
          label: 'Erase selected',
          icon: <Eraser size={14} />,
          action: () => deleteSelection(),
        },
      ],
    },
  ];
}

// ─────────────────────────────────────────────
// Variant flyout
// ─────────────────────────────────────────────

interface FlyoutProps {
  group: ToolGroupDef;
  activeTool: ToolType;
  onSelect: (variant: ToolVariantItem) => void;
  onClose: () => void;
  anchorY: number; // top px of the anchor button
}

function VariantFlyout({ group, activeTool, onSelect, onClose, anchorY }: FlyoutProps) {
  const flyoutRef = useRef<HTMLDivElement>(null);

  // Position: to the right of the 48px sidebar, vertically at the anchor
  const flyoutLeft = 52; // sidebar width + gap

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Clamp top so flyout stays on screen
  const estHeight = group.variants.length * 32 + 8;
  const top = Math.min(anchorY, window.innerHeight - estHeight - 8);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={flyoutRef}
        className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl py-1 min-w-[200px]"
        style={{ left: flyoutLeft, top: Math.max(4, top) }}
      >
        {/* Group label header */}
        <div className="px-3 py-1 text-[10px] text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-700 mb-1">
          {group.label} variants
        </div>

        {group.variants.map((v, idx) => {
          const isCurrent = v.tool === activeTool;
          return (
            <div key={idx}>
              <button
                className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors gap-2
                  ${isCurrent ? 'bg-blue-600/20 text-blue-300' : 'hover:bg-gray-700 text-gray-200'}`}
                onClick={() => {
                  onSelect(v);
                  onClose();
                }}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-4 ${isCurrent ? 'text-blue-400' : 'text-gray-400'}`}>{v.icon}</span>
                  {v.label}
                  {isCurrent && <span className="text-[9px] text-blue-400 ml-1">●</span>}
                </span>
                {v.shortcut && (
                  <span className="text-gray-500 text-[10px] shrink-0 font-mono">{v.shortcut}</span>
                )}
              </button>
              {v.belowSep && <div className="my-1 border-t border-gray-700" />}
            </div>
          );
        })}

        {/* Extra: Regular Polygon sides picker */}
        {group.mainTool === 'DRAW_POLYGON' && (
          <div className="px-3 py-2 border-t border-gray-700 mt-1">
            <RegularPolygonSidesPicker />
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// Regular Polygon sides input
// ─────────────────────────────────────────────

function RegularPolygonSidesPicker() {
  const toolStore = useToolStore();
  const sides = toolStore.state.regularPolygonSides;
  const PRESETS = [3, 4, 5, 6, 8, 10, 12];
  return (
    <div>
      <div className="text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider">Regular polygon sides</div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {PRESETS.map((n) => (
          <button
            key={n}
            className={`w-7 h-6 text-[11px] rounded border transition-colors
              ${sides === n
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'}`}
            onClick={() => toolStore.setRegularPolygonSides(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-500">Custom:</span>
        <input
          type="number"
          min={3}
          max={20}
          className="w-14 bg-gray-700 text-white text-xs rounded px-1 py-0.5 outline-none font-mono text-center"
          value={sides}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v)) toolStore.setRegularPolygonSides(v);
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main ToolBar component
// ─────────────────────────────────────────────

export default function ToolBar() {
  const toolStore = useToolStore();
  const viewportStore = useViewportStore();
  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const activeTool = toolStore.state.activeTool;

  const [flyout, setFlyout] = useState<{ group: ToolGroupDef; anchorY: number } | null>(null);

  const toolGroups = buildToolGroups(toolStore, viewportStore, drawingStore);

  // Determine the displayed icon for a tool group (matches active variant)
  function getGroupIcon(group: ToolGroupDef): React.ReactNode {
    const activeVariant = group.variants.find((v) => v.tool === activeTool);
    return activeVariant?.icon ?? group.icon;
  }

  // Map variant tools to their parent group for sidebar highlighting
  const activeGroupTool = toolGroups.find(
    (g) =>
      g.mainTool === activeTool ||
      g.variants.some((v) => v.tool === activeTool),
  )?.mainTool;

  function handleVariantSelect(variant: ToolVariantItem) {
    if (variant.action) {
      variant.action();
    } else if (variant.tool) {
      toolStore.setTool(variant.tool);
    }
  }

  function openFlyout(group: ToolGroupDef, buttonEl: HTMLButtonElement) {
    const rect = buttonEl.getBoundingClientRect();
    setFlyout({ group, anchorY: rect.top });
  }

  return (
    <div className="relative flex flex-col items-center py-2 gap-1">
      {toolGroups.map((group) => {
        const isActive = activeGroupTool === group.mainTool;
        const hasVariants = group.variants.length > 1 || group.mainTool === 'DRAW_POLYGON';

        return (
          <div key={group.mainTool} className="relative group">
            <button
              title={`${group.label} (${group.shortcut})${hasVariants ? ' — right-click for variants' : ''}`}
              onClick={() => {
                if (group.mainTool === 'DRAW_POLYGON' && !isActive) {
                  toolStore.setTool(group.mainTool);
                } else if (group.mainTool === 'PAN') {
                  toolStore.setTool('PAN');
                } else {
                  toolStore.setTool(group.mainTool);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (hasVariants) openFlyout(group, e.currentTarget);
              }}
              className={`w-9 h-9 flex items-center justify-center rounded transition-colors relative
                ${isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
            >
              {getGroupIcon(group)}
              {/* Small triangle indicator: top-right corner marks tools with variants */}
              {hasVariants && (
                <span className="absolute bottom-0.5 right-0.5 w-0 h-0 border-r-[5px] border-b-[5px] border-r-transparent border-b-current opacity-40" />
              )}
            </button>
          </div>
        );
      })}

      {/* Variant flyout */}
      {flyout && (
        <VariantFlyout
          group={flyout.group}
          activeTool={activeTool}
          onSelect={handleVariantSelect}
          onClose={() => setFlyout(null)}
          anchorY={flyout.anchorY}
        />
      )}
    </div>
  );
}
