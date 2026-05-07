'use client';
// app/admin/cad/components/ToolBar.tsx — Vertical drawing tool buttons with right-click variant flyouts

import { useState, useRef, useEffect } from 'react';
import {
  MousePointer2,
  BoxSelect,
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
  Grid3x3,
  Scissors,
  ScissorsLineDashed,
  Eraser,
  Expand,
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronRight,
  Slash,
  GitCommitHorizontal,
  Waves,
  ArrowRightLeft,
  Navigation,
  SeparatorHorizontal,
  RefreshCw,
  Type,
  ImageIcon,
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
import Tooltip from './Tooltip';

// ─────────────────────────────────────────────
// Tool group data
// ─────────────────────────────────────────────

interface ToolVariantItem {
  /** If set, switches to this tool */
  tool?: ToolType;
  label: string;
  /** Short description shown in the variant flyout */
  description?: string;
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
  /** Short tooltip description for the toolbar button */
  description: string;
  shortcut: string;
  icon: React.ReactNode;
  variants: ToolVariantItem[];
}

// We define this as a factory function so the icons and actions can reference the stores at render time.
function buildToolGroups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolStore: { setTool: (t: ToolType) => void; state: { regularPolygonSides: number }; setDrawStyle: (s: any) => void },
  viewportStore: { zoomAt: (x: number, y: number, f: number) => void; screenWidth: number; screenHeight: number },
): ToolGroupDef[] {
  return [
    {
      mainTool: 'SELECT',
      label: 'Select',
      description: 'Select features by clicking or dragging a box. Shift+click to toggle. Right-click for more options.',
      shortcut: 'S',
      icon: <MousePointer2 size={16} />,
      variants: [
        { tool: 'SELECT', label: 'Select (click / drag)', description: 'Click a feature to select it, drag to move it. Click empty space and drag to pan. Shift+click for box select.', shortcut: 'S', icon: <MousePointer2 size={14} /> },
        { tool: 'BOX_SELECT', label: 'Box Select', description: 'Drag a rectangle to select features. Left-to-right = window (fully enclosed), right-to-left = crossing (any overlap). Respects box select preferences.', shortcut: 'B', icon: <BoxSelect size={14} /> },
      ],
    },
    {
      mainTool: 'PAN',
      label: 'Pan',
      description: 'Click and drag to pan the view. Scroll wheel to zoom. Middle-mouse drag also pans.',
      shortcut: 'H',
      icon: <Hand size={16} />,
      variants: [
        { tool: 'PAN', label: 'Pan', description: 'Click and drag to pan the canvas.', shortcut: 'H', icon: <Hand size={14} /> },
        {
          label: 'Zoom In',
          description: 'Zoom in to the center of the canvas.',
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
          description: 'Zoom out from the center of the canvas.',
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
          description: 'Fit all features in the canvas view.',
          shortcut: 'Z E',
          icon: <Maximize size={14} />,
          action: () => window.dispatchEvent(new CustomEvent('cad:zoomExtents')),
        },
      ],
    },
    {
      mainTool: 'DRAW_POINT',
      label: 'Point',
      description: 'Place a survey point at the clicked location. Points can be snapped to grid intersections.',
      shortcut: 'P',
      icon: <Circle size={16} />,
      variants: [
        { tool: 'DRAW_POINT', label: 'Point', description: 'Click to place a point feature.', shortcut: 'P', icon: <Circle size={14} /> },
      ],
    },
    {
      mainTool: 'DRAW_LINE',
      label: 'Line',
      description: 'Draw a single line segment. Click the start point, then the end point. Right-click for line type variants.',
      shortcut: 'L',
      icon: <Minus size={16} />,
      variants: [
        { tool: 'DRAW_LINE', label: 'Line — Solid', description: 'Click start point, then end point to draw a solid line segment.', shortcut: 'L', icon: <Minus size={14} />, action: () => { toolStore.setTool('DRAW_LINE'); toolStore.setDrawStyle({ lineType: 'SOLID' }); } },
        { tool: 'DRAW_LINE', label: 'Line — Dashed', description: 'Draw a dashed line segment.', icon: <Slash size={14} />, action: () => { toolStore.setTool('DRAW_LINE'); toolStore.setDrawStyle({ lineType: 'DASHED' }); } },
        { tool: 'DRAW_LINE', label: 'Line — Dotted', description: 'Draw a dotted line segment.', icon: <GitCommitHorizontal size={14} />, action: () => { toolStore.setTool('DRAW_LINE'); toolStore.setDrawStyle({ lineType: 'DOTTED' }); } },
        { tool: 'DRAW_LINE', label: 'Line — Dash-Dot', description: 'Draw a dash-dot line segment (centerline style).', icon: <SeparatorHorizontal size={14} />, action: () => { toolStore.setTool('DRAW_LINE'); toolStore.setDrawStyle({ lineType: 'DASH_DOT' }); } },
        { tool: 'DRAW_LINE', label: 'Line — Center', description: 'Draw a centerline (long dash – short dash pattern).', icon: <Navigation size={14} />, action: () => { toolStore.setTool('DRAW_LINE'); toolStore.setDrawStyle({ lineType: 'CENTER' }); } },
        { tool: 'DRAW_LINE', label: 'Construction Line', description: 'Same as Line but intended for reference geometry.', icon: <Slash size={14} />, belowSep: false, action: () => { toolStore.setTool('DRAW_LINE'); toolStore.setDrawStyle({ lineType: 'SOLID' }); } },
      ],
    },
    {
      mainTool: 'DRAW_POLYLINE',
      label: 'Polyline',
      description: 'Draw a multi-segment connected line. Each click adds a vertex. Right-click or double-click to finish.',
      shortcut: 'PL',
      icon: <Spline size={16} />,
      variants: [
        { tool: 'DRAW_POLYLINE', label: 'Polyline (open)', description: 'Multi-segment open polyline. Click each vertex, right-click or double-click to finish.', shortcut: 'PL', icon: <Spline size={14} /> },
      ],
    },
    {
      mainTool: 'DRAW_POLYGON',
      label: 'Polygon',
      description: 'Draw a closed polygon shape. Right-click for more shape variants (Rectangle, Circle, Ellipse, Regular Polygon).',
      shortcut: 'PG',
      icon: <Pentagon size={16} />,
      variants: [
        { tool: 'DRAW_POLYGON', label: 'Freeform Polygon', description: 'Click vertices to define a freeform closed polygon. Double-click or Enter to close.', shortcut: 'PG', icon: <Pentagon size={14} /> },
        {
          tool: 'DRAW_RECTANGLE',
          label: 'Rectangle',
          description: 'Click two opposite corners to draw an axis-aligned rectangle.',
          shortcut: 'RE',
          icon: <RectangleHorizontal size={14} />,
        },
        {
          tool: 'DRAW_CIRCLE',
          label: 'Circle (Center)',
          description: 'Click the center point, then drag or click to set the radius. Draws a circle expanding from its center.',
          shortcut: 'CI',
          icon: <Circle size={14} />,
        },
        {
          tool: 'DRAW_CIRCLE_EDGE',
          label: 'Circle (Edge)',
          description: 'Click a point on the circle edge, then drag or click the diametrically opposite point. The circle expands from the side rather than the center.',
          icon: <Circle size={14} />,
        },
        {
          tool: 'DRAW_ELLIPSE',
          label: 'Ellipse (Center)',
          description: 'Click the center, then drag to a bounding-box corner to set both semi-axes.',
          icon: (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <ellipse cx="7" cy="7" rx="6" ry="4" />
            </svg>
          ),
        },
        {
          tool: 'DRAW_ELLIPSE_EDGE',
          label: 'Ellipse (Edge)',
          description: 'Click one corner of the bounding box, then drag or click the opposite corner. The ellipse expands from its edge.',
          icon: (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <ellipse cx="7" cy="7" rx="6" ry="4" />
              <line x1="1" y1="7" x2="13" y2="7" strokeOpacity="0.4" strokeDasharray="2 2" />
            </svg>
          ),
        },
        {
          tool: 'DRAW_REGULAR_POLYGON',
          label: 'Regular Polygon',
          description: 'Click the center, then drag to set the radius and orientation. Use the Sides picker to control vertex count.',
          icon: <Hexagon size={14} />,
        },
      ],
    },
    {
      mainTool: 'MOVE',
      label: 'Move',
      description: 'Move selected features. Click base point, then destination. Enable "Copy Mode" in the options bar to keep the original.',
      shortcut: 'M',
      icon: <Move size={16} />,
      variants: [
        { tool: 'MOVE', label: 'Move', description: 'Click a base point, then click where to move the selection.', shortcut: 'M', icon: <Move size={14} /> },
        {
          label: 'Duplicate',
          description: 'Instantly duplicate the selection, offset 10 units.',
          shortcut: 'Ctrl+D',
          icon: <Copy size={14} />,
          action: () => duplicateSelection(),
        },
      ],
    },
    {
      mainTool: 'COPY',
      label: 'Copy',
      description: 'Copy selected features to a new location. Click base point, then destination. Click again for additional copies.',
      shortcut: 'CO',
      icon: <Copy size={16} />,
      variants: [
        { tool: 'COPY', label: 'Copy (interactive)', description: 'Pick a base point, then place copies at each clicked location.', shortcut: 'CO', icon: <Copy size={14} /> },
        { tool: 'ARRAY', label: 'Array (rectangular)', description: 'Replicate the selection in a rows × cols grid with adjustable spacing. Set the parameters in the options bar then click the canvas (or press Apply) to commit.', shortcut: 'AR', icon: <Grid3x3 size={14} /> },
        {
          label: 'Duplicate in-place',
          description: 'Duplicate the selection offset by 10 units (same as Ctrl+D).',
          icon: <Copy size={14} />,
          action: () => duplicateSelection(),
        },
      ],
    },
    {
      mainTool: 'ROTATE',
      label: 'Rotate',
      description: 'Rotate selected features around a center point. Use the quick-rotate buttons in the options bar for common angles.',
      shortcut: 'RO',
      icon: <RotateCw size={16} />,
      variants: [
        { tool: 'ROTATE', label: 'Rotate (interactive)', description: 'Pick the rotation center, then type the angle in degrees.', shortcut: 'RO', icon: <RotateCw size={14} /> },
        {
          label: 'Rotate 90° CW',
          description: 'Instantly rotate the selection 90° clockwise.',
          icon: <RotateCw size={14} />,
          action: () => rotateSelection(-90),
        },
        {
          label: 'Rotate 90° CCW',
          description: 'Instantly rotate the selection 90° counter-clockwise.',
          icon: <RotateCcw size={14} />,
          action: () => rotateSelection(90),
        },
        {
          label: 'Rotate 180°',
          description: 'Instantly rotate the selection 180°.',
          icon: <RotateCw size={14} />,
          action: () => rotateSelection(180),
        },
      ],
    },
    {
      mainTool: 'MIRROR',
      label: 'Mirror',
      description: 'Mirror, Flip, and Invert tools. Mirror reflects across an axis (two points / picked line / angle). Flip is a one-click reflection through the centroid. Invert is a 180° point-inversion through a clicked center.',
      shortcut: 'MI',
      icon: <FlipHorizontal2 size={16} />,
      variants: [
        { tool: 'MIRROR', label: 'Mirror (custom axis)', description: 'Reflect the selection across an axis. The axis can be defined by two clicks, by picking an existing line, or by typing an angle and clicking an anchor point. Honours Copy Mode.', shortcut: 'MI', icon: <FlipHorizontal2 size={14} /> },
        { tool: 'FLIP',   label: 'Flip',                description: 'One-click reflection through the selection centroid. Pick H / V / D1 / D2 in the options bar then click the canvas (or press Apply). Honours Copy Mode.', shortcut: 'FL', icon: <FlipVertical2 size={14} /> },
        { tool: 'INVERT', label: 'Invert',              description: 'Point inversion — equivalent to a 180° rotation around a clicked center. Click anywhere on the canvas to use that point as the inversion center. Honours Copy Mode.', shortcut: 'IV', icon: <RotateCcw size={14} /> },
        {
          label: 'Flip Horizontal',
          description: 'Instantly mirror the selection horizontally across its own center.',
          icon: <FlipHorizontal2 size={14} />,
          action: () => flipSelectionHorizontal(),
        },
        {
          label: 'Flip Vertical',
          description: 'Instantly mirror the selection vertically across its own center.',
          icon: <FlipVertical2 size={14} />,
          action: () => flipSelectionVertical(),
        },
      ],
    },
    {
      mainTool: 'SCALE',
      label: 'Scale',
      description: 'Scale selected features. Use quick-scale buttons in the options bar, or the interactive tool to pick a center.',
      shortcut: 'SC',
      icon: <Expand size={16} />,
      variants: [
        { tool: 'SCALE', label: 'Scale (interactive)', description: 'Pick a base point, then type the scale factor (e.g. 2 for double size).', shortcut: 'SC', icon: <Expand size={14} /> },
        {
          label: 'Scale by Factor…',
          description: 'Instantly scale the selection by a factor you enter.',
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
      description: 'Click features to erase them. Or select features first, then activate the erase tool to delete all at once.',
      shortcut: 'E',
      icon: <Eraser size={16} />,
      variants: [
        { tool: 'ERASE', label: 'Erase (click)', description: 'Click any feature to immediately delete it.', shortcut: 'E', icon: <Eraser size={14} /> },
        {
          label: 'Erase selected',
          description: 'Delete all currently selected features at once.',
          icon: <Eraser size={14} />,
          action: () => deleteSelection(),
        },
      ],
    },
    {
      mainTool: 'SPLIT',
      label: 'Split',
      description: 'Break a line, polyline, or polygon at the clicked point. The closest point on the geometry to the cursor is the split location; for polylines the new vertex is inserted in the chosen segment.',
      shortcut: 'SP',
      icon: <Scissors size={16} />,
      variants: [
        { tool: 'SPLIT', label: 'Split (click)', description: 'Click anywhere on a line/polyline/polygon to break it into two pieces at that point. POLYGON splits open into a single POLYLINE walking the perimeter.', shortcut: 'SP', icon: <Scissors size={14} /> },
        { tool: 'TRIM',  label: 'Trim',          description: 'Click a portion of a line or polyline that lies between two crossings with other features — the clicked section is removed. When only one side has a crossing, the remainder on that side stays. When the source has no crossings, the click deletes it.', shortcut: 'TR', icon: <ScissorsLineDashed size={14} /> },
      ],
    },

    // ── Phase 4 tools ──

    {
      mainTool: 'DRAW_ARC',
      label: 'Arc',
      description: 'Draw a true circular arc. Right-click for spline drawing tools.',
      shortcut: 'A',
      icon: <GitCommitHorizontal size={16} />,
      variants: [
        { tool: 'DRAW_ARC', label: 'Arc (3-point)', description: 'Click PC, mid-point, PT to define an arc.', shortcut: 'A', icon: <GitCommitHorizontal size={14} /> },
        { tool: 'DRAW_CURVED_LINE', label: 'Curved Line', description: 'Click to place fit points with tangent handles. Right-click or double-click to finish. Creates smooth bezier curves.', shortcut: 'CL', icon: <Waves size={14} /> },
        { tool: 'DRAW_SPLINE_FIT', label: 'Spline (fit-point)', description: 'Click fit-points for a smooth Fusion 360-style spline. Double-click to finish.', shortcut: 'SF', icon: <Waves size={14} /> },
        { tool: 'DRAW_SPLINE_CONTROL', label: 'Spline (NURBS control-point)', description: 'Click control points for a NURBS spline. Double-click to finish.', shortcut: 'SN', icon: <Spline size={14} /> },
      ],
    },
    {
      mainTool: 'CURB_RETURN',
      label: 'Curb Return',
      description: 'Fillet two lines with a circular arc. Click first line, second line, enter radius. Right-click for Offset tool.',
      shortcut: 'CR',
      icon: <RefreshCw size={16} />,
      variants: [
        { tool: 'CURB_RETURN', label: 'Curb Return / Fillet', description: 'Click first line, click second line, type radius. Arc is computed at intersection.', shortcut: 'CR', icon: <RefreshCw size={14} /> },
        { tool: 'OFFSET', label: 'Offset', description: 'Offset a polyline/line by a parallel distance. Right-click on a feature to offset it.', shortcut: 'OF', icon: <SeparatorHorizontal size={14} /> },
      ],
    },
    {
      mainTool: 'INVERSE',
      label: 'Inverse',
      description: 'Click two points to compute bearing and distance between them. Right-click for Forward Point tool.',
      shortcut: 'INV',
      icon: <ArrowRightLeft size={16} />,
      variants: [
        { tool: 'INVERSE', label: 'Inverse (bearing & distance)', description: 'Click point A then point B — bearing and distance are shown in the status bar and command bar.', shortcut: 'INV', icon: <ArrowRightLeft size={14} /> },
        { tool: 'FORWARD_POINT', label: 'Forward Point', description: 'Click a base point, type bearing and distance in the command bar to place a new point.', shortcut: 'FP', icon: <Navigation size={14} /> },
      ],
    },
    {
      mainTool: 'DRAW_TEXT',
      label: 'Text',
      description: 'Click to place a text annotation. Font size scales with drawing scale. Right-click for options.',
      shortcut: 'TX',
      icon: <Type size={16} />,
      variants: [
        { tool: 'DRAW_TEXT', label: 'Text Annotation', description: 'Click where you want the text. Type your text and press Enter to place it.', shortcut: 'TX', icon: <Type size={14} /> },
      ],
    },
    {
      mainTool: 'DRAW_IMAGE',
      label: 'Image',
      description: 'Click on the canvas to insert an image. Supports PNG, JPG, SVG, GIF, WebP. Resize, rotate, and mirror after placing.',
      shortcut: 'IM',
      icon: <ImageIcon size={16} />,
      variants: [
        { tool: 'DRAW_IMAGE', label: 'Insert Image', description: 'Click where you want the image. A dialog will open to select or paste an image file.', shortcut: 'IM', icon: <ImageIcon size={14} /> },
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
      <div className="fixed inset-0 z-40 bg-black/10 animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div
        ref={flyoutRef}
        className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl py-1 min-w-[260px] max-w-[340px] animate-[slideInLeft_150ms_ease-out]"
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
                className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-all duration-150 gap-2
                  ${isCurrent ? 'bg-blue-600/20 text-blue-300' : 'hover:bg-gray-700 text-gray-200 hover:pl-4'}`}
                onClick={() => {
                  onSelect(v);
                  onClose();
                }}
              >
                <span className="flex flex-col items-start gap-0.5 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className={`w-4 shrink-0 ${isCurrent ? 'text-blue-400' : 'text-gray-400'}`}>{v.icon}</span>
                    <span className="font-medium">
                      {v.label}
                      {isCurrent && <span className="text-[9px] text-blue-400 ml-1.5">●</span>}
                    </span>
                  </span>
                  {v.description && (
                    <span className="text-[10px] text-gray-500 pl-6 leading-relaxed">{v.description}</span>
                  )}
                </span>
                {v.shortcut && (
                  <span className="text-gray-500 text-[10px] shrink-0 font-mono ml-2">{v.shortcut}</span>
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

  const toolGroups = buildToolGroups(toolStore, viewportStore);

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
            <Tooltip
              label={`${group.label}${hasVariants ? ' ▸' : ''}`}
              description={group.description}
              shortcut={group.shortcut}
              side="right"
              delay={500}
            >
              <button
                onClick={() => {
                  toolStore.setTool(group.mainTool);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (hasVariants) openFlyout(group, e.currentTarget);
                }}
                className={`w-9 h-9 flex items-center justify-center rounded transition-all duration-150 relative
                  ${isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 scale-105'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white hover:scale-110 active:scale-95'}`}
              >
                {getGroupIcon(group)}
                {/* Small triangle indicator: bottom-right corner marks tools with variants */}
                {hasVariants && (
                  <span className="absolute bottom-0.5 right-0.5 w-0 h-0 border-r-[5px] border-b-[5px] border-r-transparent border-b-current opacity-40" />
                )}
              </button>
            </Tooltip>
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
