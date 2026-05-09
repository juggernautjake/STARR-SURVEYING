'use client';
// app/admin/cad/components/FeatureContextMenu.tsx
// Rich right-click context menu for canvas features and empty space.

import { useState, useEffect, useRef } from 'react';
import {
  Copy,
  Clipboard,
  Trash2,
  RotateCw,
  RotateCcw,
  FlipHorizontal2,
  FlipVertical2,
  Expand,
  Layers,
  ZoomIn,
  MousePointer2,
  EyeOff,
  ChevronRight,
  Check,
  Box,
  BoxSelect,
  Slash,
} from 'lucide-react';
import {
  useDrawingStore,
  useSelectionStore,
  useToolStore,
  useViewportStore,
  useUndoStore,
  makeBatchEntry,
} from '@/lib/cad/store';
import {
  copyToClipboard,
  pasteCadClipboard,
  hasClipboard,
  getClipboardCount,
  duplicateSelection,
  rotateSelection,
  flipSelectionHorizontal,
  flipSelectionVertical,
  scaleSelection,
  scaleSelectionXY,
  deleteSelection,
  selectSimilarType,
  zoomToSelection,
  copyCadSelection,
  translateSelection,
  offsetSelectionByDistance,
  alignSelection,
  reverseFeature,
  explodeFeature,
  smoothPolyline,
  simplifyPolylineFeature,
  divideFeatureBy,
} from '@/lib/cad/operations';
import { insertInflectionPoint, findClosestSplineParam } from '@/lib/cad/geometry/curve-render';
import { generateId } from '@/lib/cad/types';

interface Props {
  x: number;          // Screen X (clientX)
  y: number;          // Screen Y (clientY)
  worldX: number;     // World X at right-click position (for paste)
  worldY: number;
  featureId: string | null;
  onClose: () => void;
}

// A single menu item with optional icon, shortcut, submenu, disabled state
interface MenuItemDef {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: false;
  submenu?: SubMenuDef[];
  action?: () => void;
}
interface SeparatorDef {
  separator: true;
  id: string;
}
type MenuDef = MenuItemDef | SeparatorDef;
type SubMenuDef = MenuItemDef | SeparatorDef;

// ── Sub-menu component ───────────────────────────────────────────────────────
function SubMenu({ items, onAction }: { items: SubMenuDef[]; onAction: () => void }) {
  return (
    <div className="absolute left-full top-0 z-60 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[200px]">
      {items.map((item) => {
        if ('separator' in item && item.separator) {
          return <div key={item.id} className="my-1 border-t border-gray-700" />;
        }
        const mi = item as MenuItemDef;
        return (
          <button
            key={mi.id}
            disabled={mi.disabled}
            className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors gap-3
              ${mi.disabled ? 'opacity-40 cursor-default' : mi.danger ? 'hover:bg-red-900/40 text-red-400' : 'hover:bg-gray-700 text-gray-200'}`}
            onClick={() => {
              if (!mi.disabled && mi.action) {
                mi.action();
                onAction();
              }
            }}
          >
            <span className="flex items-center gap-2">
              {mi.icon && <span className="w-4 text-gray-400">{mi.icon}</span>}
              {mi.label}
            </span>
            {mi.shortcut && <span className="text-gray-500 text-[10px] shrink-0">{mi.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Menu row ─────────────────────────────────────────────────────────────────
function MenuRow({ item, onAction }: { item: MenuItemDef; onAction: () => void }) {
  const [showSub, setShowSub] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rowRef}
      className="relative"
      onMouseEnter={() => item.submenu && setShowSub(true)}
      onMouseLeave={() => setShowSub(false)}
    >
      <button
        disabled={item.disabled}
        className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors gap-3
          ${item.disabled ? 'opacity-40 cursor-default' : item.danger ? 'hover:bg-red-900/40 text-red-400' : 'hover:bg-gray-700 text-gray-200'}`}
        onClick={() => {
          if (!item.disabled && item.action && !item.submenu) {
            item.action();
            onAction();
          }
        }}
      >
        <span className="flex items-center gap-2">
          {item.icon && <span className="w-4 text-gray-400">{item.icon}</span>}
          {item.label}
        </span>
        <span className="flex items-center gap-2">
          {item.shortcut && <span className="text-gray-500 text-[10px]">{item.shortcut}</span>}
          {item.submenu && <ChevronRight size={10} className="text-gray-500" />}
        </span>
      </button>
      {showSub && item.submenu && (
        <SubMenu items={item.submenu} onAction={onAction} />
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function FeatureContextMenu({ x, y, worldX, worldY, featureId, onClose }: Props) {
  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const toolStore = useToolStore();
  const viewportStore = useViewportStore();
  const undoStore = useUndoStore();

  const selIds = Array.from(selectionStore.selectedIds);
  const selCount = selIds.length;
  const feature = featureId ? drawingStore.getFeature(featureId) : null;
  const hasGroup = !!(feature?.properties?.polylineGroupId);
  const clipboard = hasClipboard();
  const clipCount = getClipboardCount();
  const { document: doc } = drawingStore;
  const layers = doc.layerOrder.map((id) => doc.layers[id]).filter(Boolean);

  // Clamp menu position so it doesn't go off-screen
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    if (!menuRef.current) return;
    const { offsetWidth, offsetHeight } = menuRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      left: x + offsetWidth > vw ? x - offsetWidth : x,
      top: y + offsetHeight > vh ? y - offsetHeight : y,
    });
  }, [x, y]);

  // ── Helper: rotate by custom angle ───────────────────────────────────────
  function handleCustomRotate() {
    const input = window.prompt('Enter rotation angle in degrees (positive = CCW):');
    if (input === null) return;
    const deg = parseFloat(input);
    if (!isNaN(deg)) rotateSelection(deg);
    // MenuRow/SubMenu will call onClose() after this returns
  }

  // ── Helper: scale by factor ───────────────────────────────────────────────
  function handleScaleByFactor() {
    const input = window.prompt('Enter scale factor (e.g. 2 to double, 0.5 to halve):');
    if (input === null) return;
    const factor = parseFloat(input);
    if (!isNaN(factor) && factor > 0) scaleSelection(factor);
  }

  // ── Helper: translate by offset ──────────────────────────────────────────
  function handleTranslate() {
    const dx = parseFloat(window.prompt('Move by X (world units, + = East):') ?? '');
    if (isNaN(dx)) return;
    const dy = parseFloat(window.prompt('Move by Y (world units, + = North):') ?? '');
    if (isNaN(dy)) return;
    translateSelection(dx, dy);
  }

  // ── Helper: offset copy ───────────────────────────────────────────────────
  function handleOffset() {
    const input = window.prompt('Offset distance (positive = left/outward, negative = right/inward):');
    if (input === null) return;
    const dist = parseFloat(input);
    if (!isNaN(dist) && dist !== 0) offsetSelectionByDistance(dist);
  }

  // ── Helper: move to layer ─────────────────────────────────────────────────
  function moveSelectionToLayer(layerId: string) {
    const ids = Array.from(selectionStore.selectedIds);
    if (ids.length === 0) return;
    const ops = ids.map((id) => {
      const f = drawingStore.getFeature(id)!;
      const after = { ...f, layerId };
      drawingStore.updateFeature(id, { layerId });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after } };
    });
    undoStore.pushUndo(makeBatchEntry('Move to Layer', ops));
  }

  // ── Helper: hide selection's layer ───────────────────────────────────────
  function hideSelectionLayer() {
    if (selIds.length === 0) return;
    const uniqueLayers = [...new Set(selIds.map((id) => drawingStore.getFeature(id)?.layerId).filter(Boolean))];
    for (const lid of uniqueLayers) {
      drawingStore.updateLayer(lid as string, { visible: false });
    }
  }

  // ── Helper: group selected features ─────────────────────────────────────
  function handleGroupSelected() {
    const ids = Array.from(selectionStore.selectedIds);
    if (ids.length < 2) return;
    // Check all selected features are on the same layer
    const firstFeature = drawingStore.getFeature(ids[0]);
    if (!firstFeature) return;
    const layerId = firstFeature.layerId;
    const crossLayer = ids.some((id) => drawingStore.getFeature(id)?.layerId !== layerId);
    if (crossLayer) {
      window.alert('Cannot group elements from different layers.\nAll elements in a group must be on the same layer.');
      return;
    }
    // Check if any selected feature is already a member of a group
    const alreadyGrouped = ids.filter((id) => !!drawingStore.getFeature(id)?.featureGroupId);
    if (alreadyGrouped.length > 0) {
      window.alert(
        `${alreadyGrouped.length} element(s) are already part of a group.\n` +
        'Remove them from their current group first (right-click → Ungroup or use the Layer Panel).'
      );
      return;
    }
    const name = window.prompt('Group name (optional):');
    if (name === null) return; // cancelled
    drawingStore.groupFeatures(ids, name.trim() || undefined);
    onClose();
  }

  // ── Helper: ungroup selected feature group ───────────────────────────────
  function handleUngroup() {
    const ids = Array.from(selectionStore.selectedIds);
    const groupIds = new Set<string>();
    for (const id of ids) {
      const f = drawingStore.getFeature(id);
      if (f?.featureGroupId) groupIds.add(f.featureGroupId);
    }
    for (const gid of groupIds) {
      drawingStore.ungroupFeatures(gid);
    }
    onClose();
  }

  // ── Helper: select entire feature group ──────────────────────────────────
  function handleSelectFeatureGroup() {
    if (!feature?.featureGroupId) return;
    const group = drawingStore.getFeatureGroup(feature.featureGroupId);
    if (group) selectionStore.selectMultiple(group.featureIds, 'REPLACE');
    onClose();
  }

  // Derived grouping state for menu display
  const selFeatureGroupIds = new Set(
    selIds.map((id) => drawingStore.getFeature(id)?.featureGroupId).filter(Boolean)
  );
  const anyAlreadyGrouped = selIds.some((id) => !!drawingStore.getFeature(id)?.featureGroupId);
  const canGroup   = selIds.length >= 2 && !anyAlreadyGrouped;
  const canUngroup = selFeatureGroupIds.size > 0;

  // ── Helper: select polyline group ────────────────────────────────────────
  function handleSelectGroup() {
    if (!feature) return;
    const groupId = feature.properties?.polylineGroupId as string | undefined;
    if (groupId) {
      const groupIds = drawingStore
        .getAllFeatures()
        .filter((f) => f.properties.polylineGroupId === groupId)
        .map((f) => f.id);
      selectionStore.selectMultiple(groupIds, 'REPLACE');
    }
  }

  // ── Helper: expand current selection to include full groups ─────────────
  function handleExpandSelectionToGroups() {
    const currentIds = Array.from(selectionStore.selectedIds);
    const groupIds = new Set<string>();
    for (const id of currentIds) {
      const f = drawingStore.getFeature(id);
      const gid = f?.properties?.polylineGroupId as string | undefined;
      if (gid) groupIds.add(gid);
    }
    if (groupIds.size === 0) return;
    const expanded = new Set(currentIds);
    for (const f of drawingStore.getAllFeatures()) {
      const gid = f.properties?.polylineGroupId as string | undefined;
      if (gid && groupIds.has(gid)) expanded.add(f.id);
    }
    selectionStore.selectMultiple(Array.from(expanded), 'REPLACE');
  }

  // ── Build "Modify" submenu ────────────────────────────────────────────────
  const modifySubmenu: SubMenuDef[] = [
    // ─ Interactive (cursor-driven) ──────────────────────────────────────
    {
      id: 'rotateInteractive',
      label: 'Rotate (Interactive)…',
      icon: <RotateCw size={12} />,
      action: () => {
        window.dispatchEvent(new CustomEvent('cad:startInteractiveRotate'));
        onClose();
      },
    },
    {
      id: 'scaleInteractive',
      label: 'Scale / Resize (Interactive)…',
      icon: <Expand size={12} />,
      action: () => {
        window.dispatchEvent(new CustomEvent('cad:startInteractiveScale'));
        onClose();
      },
    },
    { separator: true, id: 'ms0' },
    // ─ Rotate presets ────────────────────────────────────────────────────
    { id: 'rot90cw',  label: 'Rotate 90° Clockwise',     icon: <RotateCw size={12} />,  action: () => rotateSelection(-90) },
    { id: 'rot90ccw', label: 'Rotate 90° Counter-CW',    icon: <RotateCcw size={12} />, action: () => rotateSelection(90)  },
    { id: 'rot45cw',  label: 'Rotate 45° Clockwise',                                    action: () => rotateSelection(-45) },
    { id: 'rot45ccw', label: 'Rotate 45° Counter-CW',                                   action: () => rotateSelection(45)  },
    { id: 'rot180',   label: 'Rotate 180°',                                              action: () => rotateSelection(180) },
    { id: 'rotCustom',label: 'Rotate Custom Angle…',                                    action: () => {
        const input = window.prompt('Enter rotation angle in degrees (positive = CCW):');
        if (input === null) return;
        const deg = parseFloat(input);
        if (!isNaN(deg)) rotateSelection(deg);
      },
    },
    { separator: true, id: 'ms1' },
    // ─ Mirror / Flip ─────────────────────────────────────────────────────
    { id: 'flipH',    label: 'Mirror Horizontal',        icon: <FlipHorizontal2 size={12} />, action: () => flipSelectionHorizontal() },
    { id: 'flipV',    label: 'Mirror Vertical',          icon: <FlipVertical2 size={12} />,   action: () => flipSelectionVertical()   },
    { separator: true, id: 'ms2' },
    // ─ Scale presets ─────────────────────────────────────────────────────
    { id: 'scale2x',  label: 'Scale ×2 (Double)',        icon: <Expand size={12} />,          action: () => scaleSelection(2)         },
    { id: 'scale05x', label: 'Scale ×0.5 (Half)',                                             action: () => scaleSelection(0.5)       },
    { id: 'scaleCustom', label: 'Scale by Factor…',                                           action: handleScaleByFactor             },
    { id: 'scaleXY',  label: 'Scale X/Y Independently…',                                     action: () => {
        const sx = parseFloat(window.prompt('Scale factor X (horizontal):') ?? '');
        if (isNaN(sx) || sx <= 0) return;
        const sy = parseFloat(window.prompt('Scale factor Y (vertical):') ?? '');
        if (isNaN(sy) || sy <= 0) return;
        scaleSelectionXY(sx, sy);
      },
    },
    { separator: true, id: 'ms3' },
    // ─ Move / Offset ─────────────────────────────────────────────────────
    { id: 'translate', label: 'Move by Offset…',                                              action: handleTranslate                 },
    { id: 'offset',    label: 'Offset Copy…',                                                 action: handleOffset                    },
    { separator: true, id: 'ms4' },
    // ─ Align (only useful with 2+ selected) ─────────────────────────────
    { id: 'alignL',   label: 'Align Left Edges',   disabled: selCount < 2,                   action: () => alignSelection('LEFT')    },
    { id: 'alignR',   label: 'Align Right Edges',  disabled: selCount < 2,                   action: () => alignSelection('RIGHT')   },
    { id: 'alignT',   label: 'Align Top Edges',    disabled: selCount < 2,                   action: () => alignSelection('TOP')     },
    { id: 'alignB',   label: 'Align Bottom Edges', disabled: selCount < 2,                   action: () => alignSelection('BOTTOM')  },
    { id: 'alignCH',  label: 'Center Horizontally',disabled: selCount < 2,                   action: () => alignSelection('CENTER_H')},
    { id: 'alignCV',  label: 'Center Vertically',  disabled: selCount < 2,                   action: () => alignSelection('CENTER_V')},
  ];

  // ── Build menu items ──────────────────────────────────────────────────────
  const featureSection: MenuDef[] = feature
    ? [
        {
          id: 'properties',
          label: 'Properties…',
          icon: <MousePointer2 size={12} />,
          action: () => {
            window.dispatchEvent(
              new CustomEvent('cad:openFeatureDialog', {
                detail: { featureId: feature.id, x, y },
              }),
            );
          },
        },
        // Add Inflection Point — only for SPLINE features
        ...(feature.geometry.type === 'SPLINE' && feature.geometry.spline && feature.geometry.spline.controlPoints.length >= 4
          ? [
              {
                id: 'add-inflection',
                label: 'Add Inflection Point',
                icon: <Expand size={12} />,
                action: () => {
                  const spline = feature.geometry.spline!;
                  const closest = findClosestSplineParam(spline.controlPoints, { x: worldX, y: worldY });
                  const newCPs = insertInflectionPoint(spline.controlPoints, closest.segIndex, closest.t);
                  const newGeom = { ...feature.geometry, spline: { ...spline, controlPoints: newCPs } };
                  const before = JSON.parse(JSON.stringify(feature));
                  drawingStore.updateFeatureGeometry(feature.id, newGeom);
                  const after = drawingStore.getFeature(feature.id);
                  if (after) {
                    undoStore.pushUndo({
                      id: generateId(),
                      description: 'Add inflection point to spline',
                      timestamp: Date.now(),
                      operations: [{ type: 'MODIFY_FEATURE', data: { id: feature.id, before, after } }],
                    });
                  }
                },
              } as MenuItemDef,
            ]
          : []),
        { separator: true, id: 's0' },
        {
          id: 'copy',
          label: 'Copy',
          icon: <Copy size={12} />,
          shortcut: 'Ctrl+C',
          action: () => copyCadSelection(),
        },
        {
          id: 'paste',
          label: `Paste${clipCount > 1 ? ` (${clipCount})` : ''}`,
          icon: <Clipboard size={12} />,
          shortcut: 'Ctrl+V',
          disabled: !clipboard,
          action: () => pasteCadClipboard(worldX, worldY),
        },
        {
          id: 'duplicate',
          label: 'Duplicate',
          shortcut: 'Ctrl+D',
          action: () => duplicateSelection(),
        },
        { separator: true, id: 's1' },
        {
          id: 'rotate',
          label: 'Rotate',
          icon: <RotateCw size={12} />,
          submenu: [
            {
              id: 'rot90cw',
              label: '90° Clockwise',
              icon: <RotateCw size={12} />,
              action: () => rotateSelection(-90),
            },
            {
              id: 'rot90ccw',
              label: '90° Counter-CW',
              icon: <RotateCcw size={12} />,
              action: () => rotateSelection(90),
            },
            {
              id: 'rot180',
              label: '180°',
              action: () => rotateSelection(180),
            },
            {
              id: 'rotCustom',
              label: 'Custom angle…',
              action: handleCustomRotate,
            },
          ],
        },
        {
          id: 'flipH',
          label: 'Flip Horizontal',
          icon: <FlipHorizontal2 size={12} />,
          action: () => flipSelectionHorizontal(),
        },
        {
          id: 'flipV',
          label: 'Flip Vertical',
          icon: <FlipVertical2 size={12} />,
          action: () => flipSelectionVertical(),
        },
        {
          id: 'scale',
          label: 'Scale…',
          icon: <Expand size={12} />,
          action: handleScaleByFactor,
        },
        { separator: true, id: 's2' },
        // ── Edit submenu — line-editing operations that
        // apply to vertex-chain features. Shown only when
        // the right-clicked feature is one of the supported
        // types so the surveyor doesn't see an inert menu.
        ...((feature.geometry.type === 'LINE' ||
            feature.geometry.type === 'POLYLINE' ||
            feature.geometry.type === 'POLYGON' ||
            feature.geometry.type === 'MIXED_GEOMETRY')
          ? [
              {
                id: 'edit',
                label: 'Edit',
                icon: <Slash size={12} />,
                submenu: [
                  // Reverse — works on every vertex-chain.
                  {
                    id: 'reverse',
                    label: 'Reverse Direction',
                    action: () => { reverseFeature(feature.id); onClose(); },
                  },
                  // Explode — POLYLINE / POLYGON / MIXED only.
                  ...(feature.geometry.type !== 'LINE'
                    ? [{
                        id: 'explode',
                        label: 'Explode (burst into LINEs)',
                        action: () => { explodeFeature(feature.id); onClose(); },
                      }]
                    : []),
                  // Smooth → Spline. Requires ≥ 3 vertices on a chain feature.
                  ...((feature.geometry.type === 'POLYLINE' || feature.geometry.type === 'POLYGON') && feature.geometry.vertices && feature.geometry.vertices.length >= 3
                    ? [{
                        id: 'smooth',
                        label: 'Smooth → Spline',
                        action: () => { smoothPolyline(feature.id); onClose(); },
                      }]
                    : []),
                  // Simplify (RDP). Same eligibility as smooth.
                  ...((feature.geometry.type === 'POLYLINE' || feature.geometry.type === 'POLYGON') && feature.geometry.vertices && feature.geometry.vertices.length >= 3
                    ? [{
                        id: 'simplify',
                        label: 'Simplify (RDP, 0.5 ft)',
                        action: () => { simplifyPolylineFeature(feature.id, 0.5); onClose(); },
                      }]
                    : []),
                  // Divide — works on every vertex-chain.
                  {
                    id: 'divide4',
                    label: 'Divide ÷4 (3 markers)',
                    action: () => { divideFeatureBy(feature.id, 4); onClose(); },
                  },
                  {
                    id: 'divide10',
                    label: 'Divide ÷10 (9 markers)',
                    action: () => { divideFeatureBy(feature.id, 10); onClose(); },
                  },
                  {
                    id: 'divideCustom',
                    label: 'Divide…',
                    action: () => {
                      const input = window.prompt('Number of equal segments (2–100):', '4');
                      if (input === null) { onClose(); return; }
                      const n = parseInt(input);
                      if (!isNaN(n) && n >= 2 && n <= 100) divideFeatureBy(feature.id, n);
                      onClose();
                    },
                  },
                ],
              } as MenuItemDef,
              { separator: true, id: 's2b' } as { separator: true; id: string },
            ]
          : []),
        {
          id: 'moveToLayer',
          label: 'Move to Layer',
          icon: <Layers size={12} />,
          submenu: layers.map((l) => ({
            id: `layer_${l.id}`,
            label: l.name,
            icon: <Check size={12} className={l.id === feature.layerId ? 'text-blue-400' : 'opacity-0'} />,
            action: () => moveSelectionToLayer(l.id),
          })),
        },
        ...(hasGroup
          ? [
              {
                id: 'selectGroup',
                label: 'Select Polyline Group',
                action: handleSelectGroup,
              } as MenuItemDef,
              {
                id: 'selectSegment',
                label: 'Select This Segment Only',
                action: () => { if (featureId) { selectionStore.select(featureId, 'REPLACE'); } onClose(); },
              } as MenuItemDef,
            ]
          : []),
        {
          id: 'selectSimilar',
          label: `Select All ${feature.type} features`,
          action: () => { selectSimilarType(feature.id); onClose(); },
        },
        ...(selCount > 1
          ? [
              {
                id: 'expandToGroups',
                label: 'Expand Selection to Groups',
                action: () => { handleExpandSelectionToGroups(); onClose(); },
              } as MenuItemDef,
            ]
          : []),
        { separator: true, id: 's3g' },
        // ── Feature group actions ──────────────────────────────────────────
        ...(feature.featureGroupId
          ? [
              {
                id: 'selectFeatureGroup',
                label: 'Select All in Group',
                icon: <BoxSelect size={12} />,
                action: handleSelectFeatureGroup,
              } as MenuItemDef,
              {
                id: 'ungroupFeatures',
                label: 'Ungroup',
                icon: <Box size={12} />,
                action: handleUngroup,
              } as MenuItemDef,
            ]
          : []),
        ...(canGroup
          ? [
              {
                id: 'groupFeatures',
                label: `Group Selected (${selCount})`,
                icon: <BoxSelect size={12} />,
                action: handleGroupSelected,
              } as MenuItemDef,
            ]
          : []),
        ...(canUngroup && !feature.featureGroupId
          ? [
              {
                id: 'ungroupFeatures2',
                label: 'Ungroup Selected',
                icon: <Box size={12} />,
                action: handleUngroup,
              } as MenuItemDef,
            ]
          : []),
        { separator: true, id: 's3' },
        {
          id: 'zoomToSel',
          label: 'Zoom to Selection',
          icon: <ZoomIn size={12} />,
          action: () => { zoomToSelection(); onClose(); },
        },
        {
          id: 'hideLayer',
          label: 'Hide Layer',
          icon: <EyeOff size={12} />,
          action: hideSelectionLayer,
        },
        {
          id: 'layerPrefs',
          label: 'Layer Preferences…',
          icon: <Layers size={12} />,
          action: () => {
            const sel = Array.from(selectionStore.selectedIds);
            const firstFeature = sel.length > 0 ? drawingStore.getFeature(sel[0]) : null;
            if (firstFeature) {
              window.dispatchEvent(
                new CustomEvent('cad:openLayerPrefs', { detail: { layerId: firstFeature.layerId } }),
              );
            }
            onClose();
          },
        },
        {
          id: 'featureLabelPrefs',
          label: 'Edit Label Preferences…',
          icon: <Layers size={12} />,
          action: () => {
            if (featureId) {
              window.dispatchEvent(
                new CustomEvent('cad:openFeatureLabelPrefs', { detail: { featureId } }),
              );
            }
            onClose();
          },
        },
        {
          id: 'hideElement',
          label: selCount > 1 ? `Hide Elements (${selCount})` : 'Hide Element',
          icon: <EyeOff size={12} />,
          action: () => {
            const ids = Array.from(selectionStore.selectedIds);
            ids.forEach((id) => drawingStore.hideFeature(id));
            selectionStore.deselectAll();
            onClose();
          },
        },
        ...((() => {
          // Show "Hide Labels" option if selected feature(s) have visible labels
          const selFeatures = Array.from(selectionStore.selectedIds)
            .map((id) => drawingStore.getFeature(id))
            .filter(Boolean);
          const hasLabels = selFeatures.some((f) => f!.textLabels?.some((l) => l.visible));
          if (!hasLabels) return [];
          return [{
            id: 'hideLabels',
            label: 'Hide All Labels',
            icon: <EyeOff size={12} />,
            action: () => {
              for (const f of selFeatures) {
                if (!f) continue;
                const labels = f.textLabels ?? [];
                for (const l of labels) {
                  if (l.visible) {
                    drawingStore.updateTextLabel(f.id, l.id, { visible: false });
                  }
                }
              }
              onClose();
            },
          } as MenuItemDef];
        })()),
        ...((() => {
          // Show "Show All Labels" option if selected feature(s) have hidden labels
          const selFeatures = Array.from(selectionStore.selectedIds)
            .map((id) => drawingStore.getFeature(id))
            .filter(Boolean);
          const hasHiddenLabels = selFeatures.some((f) => f!.textLabels?.some((l) => !l.visible));
          if (!hasHiddenLabels) return [];
          return [{
            id: 'showLabels',
            label: 'Show All Labels',
            icon: <ZoomIn size={12} />,
            action: () => {
              for (const f of selFeatures) {
                if (!f) continue;
                const labels = f.textLabels ?? [];
                for (const l of labels) {
                  if (!l.visible) {
                    drawingStore.updateTextLabel(f.id, l.id, { visible: true });
                  }
                }
              }
              onClose();
            },
          } as MenuItemDef];
        })()),
        { separator: true, id: 's4' },
        {
          id: 'delete',
          label: selCount > 1 ? `Delete (${selCount})` : 'Delete',
          icon: <Trash2 size={12} />,
          shortcut: 'Del',
          danger: true,
          action: () => { deleteSelection(); onClose(); },
        },
      ]
    : [];

  // Empty-canvas section (paste, select all, zoom, settings)
  const emptySection: MenuDef[] = [
    {
      id: 'paste',
      label: `Paste${clipCount > 1 ? ` (${clipCount})` : ''}`,
      icon: <Clipboard size={12} />,
      shortcut: 'Ctrl+V',
      disabled: !clipboard,
      action: () => { pasteCadClipboard(worldX, worldY); onClose(); },
    },
    { separator: true, id: 'es0' },
    {
      id: 'selectAll',
      label: 'Select All',
      shortcut: 'Ctrl+A',
      action: () => {
        const allIds = drawingStore.getAllFeatures().map((f) => f.id);
        selectionStore.selectMultiple(allIds, 'REPLACE');
        onClose();
      },
    },
    {
      id: 'deselectAll',
      label: 'Deselect All',
      shortcut: 'Esc',
      action: () => { selectionStore.deselectAll(); onClose(); },
    },
    { separator: true, id: 'es1' },
    {
      id: 'zoomExtents',
      label: 'Zoom Extents',
      icon: <ZoomIn size={12} />,
      shortcut: 'Z E',
      action: () => {
        window.dispatchEvent(new CustomEvent('cad:zoomExtents'));
        onClose();
      },
    },
    {
      id: 'settings',
      label: 'Settings & Preferences…',
      action: () => {
        window.dispatchEvent(new CustomEvent('cad:openSettings'));
        onClose();
      },
    },
  ];

  const items: MenuDef[] = feature ? featureSection : emptySection;

  // Also append deselect when something is selected but we right-clicked empty space
  if (!feature && selCount > 0) {
    const actionCopy: MenuItemDef = {
      id: 'copyEmpty',
      label: `Copy selected (${selCount})`,
      icon: <Copy size={12} />,
      shortcut: 'Ctrl+C',
      action: () => { copyCadSelection(); onClose(); },
    };
    const actionExpandGroups: MenuItemDef = {
      id: 'expandGroupsEmpty',
      label: 'Expand Selection to Groups',
      action: () => { handleExpandSelectionToGroups(); onClose(); },
    };
    const actionDelete: MenuItemDef = {
      id: 'deleteEmpty',
      label: `Delete selected (${selCount})`,
      icon: <Trash2 size={12} />,
      shortcut: 'Del',
      danger: true,
      action: () => { deleteSelection(); onClose(); },
    };
    items.splice(2, 0, actionCopy);
    items.splice(3, 0, actionExpandGroups);
    // Add group/ungroup for multi-selection
    if (canGroup) {
      items.splice(4, 0, {
        id: 'groupEmpty',
        label: `Group Selected (${selCount})`,
        icon: <BoxSelect size={12} />,
        action: handleGroupSelected,
      } as MenuItemDef);
    }
    if (canUngroup) {
      items.splice(canGroup ? 5 : 4, 0, {
        id: 'ungroupEmpty',
        label: 'Ungroup Selected',
        icon: <Box size={12} />,
        action: handleUngroup,
      } as MenuItemDef);
    }
    items.push({ separator: true, id: 'del_sep' });
    items.push(actionDelete);
  }

  // Header label
  let headerText = '';
  if (feature) {
    headerText =
      selCount > 1
        ? `${selCount} objects selected`
        : `${feature.type}`;
  } else {
    headerText = selCount > 0 ? `${selCount} selected` : 'Canvas';
  }

  return (
    <>
      {/* Click-away overlay */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        ref={menuRef}
        className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl py-1 text-xs text-gray-200 min-w-[200px] max-w-[260px] animate-[scaleIn_120ms_cubic-bezier(0.16,1,0.3,1)]"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 py-1.5 text-[10px] text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-700 mb-1">
          {headerText}
        </div>

        {items.map((item) => {
          if ('separator' in item && item.separator) {
            return <div key={item.id} className="my-1 border-t border-gray-700" />;
          }
          const menuItem = item as MenuItemDef;
          return <MenuRow key={menuItem.id} item={menuItem} onAction={onClose} />;
        })}
      </div>
    </>
  );
}
