'use client';
// app/admin/cad/components/LayerPanel.tsx — Layer list panel

import { useState, useRef } from 'react';
import { Eye, EyeOff, Lock, LockOpen, Plus, Settings, EyeOff as EyeOffIcon, RotateCw, ChevronDown, ChevronRight, Layers, X, Send, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { useDrawingStore } from '@/lib/cad/store';
import { useSelectionStore } from '@/lib/cad/store';
import { useUIStore } from '@/lib/cad/store';
import { useMediaStore } from '@/lib/cad/media/media-store';
import { confirmAction } from './ConfirmDialog';
import { useAIConversationsStore } from '@/lib/cad/store/ai-conversations-store';
import { generateId } from '@/lib/cad/types';
import type { Layer, TitleBlockConfig } from '@/lib/cad/types';
// cad-layer-grouping-and-context-menus Slice 1 — POLYGON/POLYLINE
// expand-chevron helpers for the layer panel.
import { formatFeatureVertices, isExpandableFeature } from '@/lib/cad/feature-vertices';
import { featureRowLabel } from '@/lib/cad/feature-row-label';
import { transferSelectionToLayer } from '@/lib/cad/operations';
import { useTransferStore } from '@/lib/cad/store';
import { isDraftLayer, promoteDraftLayer, findPromotionTarget } from '@/lib/cad/ai/sandbox';
import { TRANSFER_DRAG_MIME, type TransferDragPayload } from './SelectionDragChip';
import NewLayerDialog from './NewLayerDialog';
// cad-layer-grouping Slice 5 — unified context menu for layer-panel
// group rows (and, in future slices, feature rows + layer rows).
import TargetContextMenu, { type ContextMenuTarget } from './TargetContextMenu';

// Accessible palette for new layers — visually distinct, good contrast
const LAYER_COLOR_PALETTE = [
  '#E53E3E', '#DD6B20', '#D69E2E', '#38A169', '#3182CE',
  '#805AD5', '#D53F8C', '#00B5D8', '#2D3748', '#718096',
];
let paletteIndex = 0;
function nextLayerColor(): string {
  const color = LAYER_COLOR_PALETTE[paletteIndex % LAYER_COLOR_PALETTE.length];
  paletteIndex++;
  return color;
}

/** Number of default survey info elements always present in the SURVEY-INFO layer. */
const SURVEY_INFO_ELEM_COUNT = 4;

interface ContextMenu {
  layerId: string;
  x: number;
  y: number;
}

export default function LayerPanel() {
  const store = useDrawingStore();
  const selectionStore = useSelectionStore();
  const restrictToActive = useUIStore((s) => s.restrictEditingToActiveLayer);
  const setRestrictToActive = useUIStore((s) => s.setRestrictEditingToActiveLayer);
  const { document: doc, activeLayerId } = store;
  const mediaByOwner = useMediaStore((s) => s.byOwner);
  const mediaHydrate = useMediaStore((s) => s.hydrate);
  useEffect(() => { void mediaHydrate(); }, [mediaHydrate]);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [panelMenu, setPanelMenu] = useState<{ x: number; y: number } | null>(null);
  const [newLayerDefaults, setNewLayerDefaults] = useState<{ name: string; color: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const dragLayerIdRef = useRef<string | null>(null);
  // Phase 8 §11.7 Slice 4 — id of the layer row currently
  // hovered by an in-flight transfer drag. Drives the blue
  // glow on the target row + the cursor effect.
  const [transferDropTargetId, setTransferDropTargetId] = useState<string | null>(null);
  const [transferDropAlt, setTransferDropAlt] = useState(false);
  /** When set, a small rotation input is shown in the context menu for this layer. */
  const [rotatingLayerId, setRotatingLayerId] = useState<string | null>(null);
  const [rotationInputVal, setRotationInputVal] = useState('0');
  /** Layers that are expanded (showing feature tree). */
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());
  /** Feature groups that are expanded (showing group members). */
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  /** cad-layer-grouping-and-context-menus Slice 1 — POLYLINE /
   *  POLYGON feature rows that are expanded to show their
   *  constituent vertices as read-only child rows. */
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());
  /** cad-layer-grouping Slice 5 — open target context menu (group /
   *  feature / layer / selection). Null when no menu is open. */
  const [targetMenu, setTargetMenu] = useState<{ target: ContextMenuTarget; x: number; y: number } | null>(null);
  /** Currently renaming group id. */
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState('');
  // Layer name filter — case-insensitive substring match against
  // layer name. Hides any layer whose name doesn't match. Empty
  // string shows all layers (default).
  const [filterText, setFilterText] = useState('');
  const renameGroupRef = useRef<HTMLInputElement>(null);

  const layers = doc.layerOrder.map((id) => doc.layers[id]).filter(Boolean);
  // Apply the filter text — case-insensitive substring match
  // on layer name. Empty filter passes everything through. The
  // active layer is always kept visible so the surveyor doesn't
  // lose context after typing a filter that excludes their
  // current selection.
  const filterTrim = filterText.trim().toLowerCase();
  const filteredLayers = filterTrim.length === 0
    ? layers
    : layers.filter((l) => l.name.toLowerCase().includes(filterTrim) || l.id === activeLayerId);

  // Track selected and hovered feature IDs for layer highlighting
  const selectedIds    = selectionStore.selectedIds;
  const hoveredId      = selectionStore.hoveredId;
  // Title-block element hover / selection — drives SURVEY-INFO layer highlight
  const hoveredTBElem  = selectionStore.hoveredTBElem;
  const selectedTBElem = selectionStore.selectedTBElem;

  // cad-trv-fidelity — when a feature is selected (e.g. clicked on the
  // canvas), reveal it in the panel: auto-expand its layer + the full
  // ancestry of feature groups (sublayers) it belongs to, and scroll
  // its row into view. The layer/group ROWS already highlight off
  // `selectedIds`; this makes that highlight visible when the branch
  // was collapsed, so clicking a point/line on the drawing surfaces the
  // exact layer + sublayer it lives in.
  //
  // cad-ux-cleanup-pass Slice 1 — the original implementation was a
  // one-way ratchet (it only ever opened, never closed), so selecting
  // a point left every visited layer expanded until the surveyor
  // manually collapsed each one. We now track which ids we opened
  // ourselves in refs; deselecting collapses them back, and the
  // toggle handlers drop any id the user manually collapses so we
  // don't re-open it the next time a point on that layer is touched.
  const autoOpenedLayersRef = useRef<Set<string>>(new Set());
  const autoOpenedGroupsRef = useRef<Set<string>>(new Set());
  const selectionKey = Array.from(selectedIds).sort().join('|');
  useEffect(() => {
    if (selectedIds.size === 0) {
      // Collapse back the ids we auto-opened for the prior selection;
      // ids the user expanded manually (NOT in the auto-set) stay open.
      const autoLayers = autoOpenedLayersRef.current;
      const autoGroups = autoOpenedGroupsRef.current;
      if (autoLayers.size > 0) {
        setExpandedLayers((prev) => {
          const next = new Set(prev);
          for (const id of autoLayers) next.delete(id);
          return next;
        });
        autoOpenedLayersRef.current = new Set();
      }
      if (autoGroups.size > 0) {
        setExpandedGroups((prev) => {
          const next = new Set(prev);
          for (const id of autoGroups) next.delete(id);
          return next;
        });
        autoOpenedGroupsRef.current = new Set();
      }
      return;
    }
    const groupById = doc.featureGroups ?? {};
    const layersToOpen = new Set<string>();
    const groupsToOpen = new Set<string>();
    for (const id of selectedIds) {
      const f = doc.features[id];
      if (!f) continue;
      layersToOpen.add(f.layerId);
      let gid: string | null = f.featureGroupId ?? null;
      let guard = 0;
      while (gid && groupById[gid] && guard++ < 50) {
        groupsToOpen.add(gid);
        gid = groupById[gid].parentGroupId ?? null;
      }
    }
    if (layersToOpen.size > 0) {
      setExpandedLayers((prev) => {
        const next = new Set(prev);
        for (const id of layersToOpen) {
          if (next.has(id)) continue;
          next.add(id);
          autoOpenedLayersRef.current.add(id);
        }
        return next;
      });
    }
    if (groupsToOpen.size > 0) {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        for (const id of groupsToOpen) {
          if (next.has(id)) continue;
          next.add(id);
          autoOpenedGroupsRef.current.add(id);
        }
        return next;
      });
    }
    const firstId = selectedIds.values().next().value;
    if (firstId) {
      requestAnimationFrame(() => {
        const sel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(firstId) : firstId;
        const row = document.querySelector(`[data-feature-row="${sel}"]`);
        if (!row) return;
        // Skip the scroll when the row is already in view — the
        // previous unconditional scrollIntoView nudged the panel even
        // when nothing needed to move, which jumped the surveyor's
        // view away from where they were looking.
        const rect = row.getBoundingClientRect();
        const top = rect.top;
        const bottom = rect.bottom;
        const viewportH = window.innerHeight || document.documentElement.clientHeight;
        if (top < 0 || bottom > viewportH) {
          row.scrollIntoView({ block: 'nearest' });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  function handleToggleVisibility(layer: Layer) {
    store.updateLayer(layer.id, { visible: !layer.visible });
  }

  function handleToggleLock(layer: Layer) {
    store.updateLayer(layer.id, { locked: !layer.locked });
  }

  function handleSetActive(layerId: string) {
    store.setActiveLayer(layerId);
  }

  // Opening the New Layer modal (§11). The actual layer is created in
  // `createLayerFromDialog` once the surveyor confirms.
  function handleNewLayer() {
    setPanelMenu(null);
    setNewLayerDefaults({ name: `Layer ${doc.layerOrder.length + 1}`, color: nextLayerColor() });
  }

  function createLayerFromDialog(result: { name: string; color: string; description: string; pointIds: string[] }) {
    const id = generateId();
    const existingCount = doc.layerOrder.length;
    store.addLayer({
      id,
      name: result.name,
      visible: true,
      locked: false,
      frozen: false,
      color: result.color,
      lineWeight: 0.75,
      lineTypeId: 'SOLID',
      opacity: 1,
      groupId: null,
      sortOrder: existingCount,
      isDefault: false,
      isProtected: false,
      autoAssignCodes: [],
      description: result.description || undefined,
    });
    // Move the chosen points onto the new layer.
    for (const pid of result.pointIds) store.updateFeature(pid, { layerId: id });
    store.setActiveLayer(id);
    setNewLayerDefaults(null);
  }

  function handleContextMenu(e: React.MouseEvent, layerId: string) {
    e.preventDefault();
    e.stopPropagation(); // don't also open the panel-level menu
    setPanelMenu(null);
    setContextMenu({ layerId, x: e.clientX, y: e.clientY });
  }

  function closeContextMenu() {
    setContextMenu(null);
    setPanelMenu(null);
  }

  // Panel-level (background) right-click menu — bulk layer actions.
  function handlePanelContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu(null);
    setPanelMenu({ x: e.clientX, y: e.clientY });
  }

  function setAllLayers(patch: { visible?: boolean; locked?: boolean }) {
    for (const id of doc.layerOrder) store.updateLayer(id, patch);
    setPanelMenu(null);
  }

  function duplicateActiveLayer() {
    const src = doc.layers[activeLayerId];
    if (src) {
      const newLayer = { ...src, id: generateId(), name: `${src.name} copy` };
      store.addLayer(newLayer);
    }
    setPanelMenu(null);
  }

  function startRename(layerId: string) {
    const layer = doc.layers[layerId];
    if (!layer) return;
    setRenamingId(layerId);
    setRenameValue(layer.name);
    setContextMenu(null);
    setTimeout(() => renameRef.current?.select(), 0);
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      store.updateLayer(renamingId, { name: renameValue.trim() });
    }
    setRenamingId(null);
  }

  async function handleDeleteLayer(layerId: string) {
    const layer = doc.layers[layerId];
    if (!layer) return;
    setContextMenu(null);
    const name = layer.name ?? layerId;
    const count = Object.values(doc.features).filter((f) => f.layerId === layerId).length;
    const isLastLayer = doc.layerOrder.length <= 1;

    // Always confirm a layer delete (it can't be undone). The last layer
    // gets a stronger warning because deleting it empties the whole
    // project — all features, including point data, are permanently removed.
    let title: string;
    let message: string;
    let confirmLabel: string;
    if (isLastLayer) {
      title = 'Delete the last layer?';
      message =
        count > 0
          ? `"${name}" is the only layer left. Deleting it permanently removes the entire drawing — all ${count} feature${count === 1 ? '' : 's'}, including every survey point, will be deleted and the project will be empty. This can't be undone.`
          : `"${name}" is the only layer left. Deleting it leaves the project with no layers. This can't be undone.`;
      confirmLabel = count > 0 ? 'Delete everything' : 'Delete layer';
    } else if (count > 0) {
      const targetId = doc.layerOrder.find((id) => id !== layerId);
      const targetName = targetId ? (doc.layers[targetId]?.name ?? 'another layer') : 'another layer';
      title = 'Delete layer?';
      message = `Delete layer "${name}"? Its ${count} feature${count === 1 ? '' : 's'} will move to "${targetName}". This can't be undone.`;
      confirmLabel = 'Delete layer';
    } else {
      title = 'Delete layer?';
      message = `Delete empty layer "${name}"? This can't be undone.`;
      confirmLabel = 'Delete layer';
    }

    const ok = await confirmAction({
      title,
      message,
      confirmLabel,
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    store.removeLayer(layerId);
  }

  /** cad-ux-cleanup-pass Slice 8 — open the existing Layer Transfer
   *  dialog pre-targeted at `layerId` so the surveyor can move points
   *  into it without picking the target again. Same code path the
   *  bindable `layer.quickAdd` action fires. */
  function quickAddToLayer(layerId: string) {
    useTransferStore.getState().setOptions({ targetLayerId: layerId });
    window.dispatchEvent(new CustomEvent('cad:openLayerTransfer'));
    setContextMenu(null);
  }

  function handleDuplicateLayer(layerId: string) {
    const src = doc.layers[layerId];
    if (!src) return;
    // New layer inherits the source's style/visibility, then receives a
    // copy of every feature on the source layer (originals untouched).
    const newId = generateId();
    // cad-ux-cleanup-pass Slice 3 — flag the new layer as a duplicate
    // so the "move points from master" dialogs can exclude its copies
    // from their source pool.
    const newLayer: Layer = { ...src, id: newId, name: `${src.name} copy`, isDefault: false, duplicateOf: layerId };
    store.addLayer(newLayer);
    const ids = Object.values(doc.features)
      .filter((f) => f.layerId === layerId)
      .map((f) => f.id);
    if (ids.length > 0) {
      transferSelectionToLayer(ids, newId, {
        keepOriginals: true,
        renumberStart: null,
        stripUnknownCodes: false,
        codeMap: null,
        targetTraverseId: null,
        offset: null,
        bringAlongLinkedGeometry: false,
        transferOperationId: generateId(),
      });
    }
    setContextMenu(null);
  }

  function handleChangeColor(layerId: string) {
    setContextMenu(null);
    // Create a temporary color input
    const input = document.createElement('input');
    input.type = 'color';
    input.value = doc.layers[layerId]?.color ?? '#000000';
    input.onchange = () => {
      store.updateLayer(layerId, { color: input.value });
    };
    input.click();
  }

  function openLayerPreferences(layerId: string) {
    setContextMenu(null);
    window.dispatchEvent(new CustomEvent('cad:openLayerPrefs', { detail: { layerId } }));
  }

  function openHiddenItems() {
    window.dispatchEvent(new CustomEvent('cad:toggleHiddenItems'));
  }

  function toggleLayerExpand(layerId: string) {
    // cad-ux-cleanup-pass Slice 1 — once the user collapses (or
    // re-opens) a layer manually, hand control back to them: drop the
    // id from the auto-set so the deselect-collapse pass leaves it
    // alone and the next selection doesn't reopen what they just
    // closed.
    autoOpenedLayersRef.current.delete(layerId);
    setExpandedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }

  function toggleGroupExpand(groupId: string) {
    autoOpenedGroupsRef.current.delete(groupId);
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  /** Click on a feature row in the tree to select it on canvas. */
  function handleFeatureClick(featureId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const mode = e.ctrlKey || e.metaKey ? 'TOGGLE' : 'REPLACE';
    selectionStore.select(featureId, mode);
  }

  /** Click on a group row to select all group members. */
  function handleGroupClick(groupId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const group = doc.featureGroups?.[groupId];
    if (!group) return;
    const mode = e.ctrlKey || e.metaKey ? 'ADD' : 'REPLACE';
    selectionStore.selectMultiple(group.featureIds, mode);
  }

  function startRenameGroup(groupId: string) {
    const group = doc.featureGroups?.[groupId];
    if (!group) return;
    setRenamingGroupId(groupId);
    setRenameGroupValue(group.name);
    setTimeout(() => renameGroupRef.current?.select(), 0);
  }

  function commitRenameGroup() {
    if (renamingGroupId && renameGroupValue.trim()) {
      store.renameFeatureGroup(renamingGroupId, renameGroupValue.trim());
    }
    setRenamingGroupId(null);
  }

  return (
    <div
      className="flex flex-col h-full text-gray-200 text-xs"
      onClick={contextMenu || panelMenu ? closeContextMenu : undefined}
    >
      <div className="px-2 py-1 text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-700 flex items-center justify-between gap-2">
        <span className="shrink-0">Layers</span>
        {/* Active-layer callout — the new-feature destination.
            Keeps the surveyor's eye on the "where will my next
            shape land?" answer without having to scan the row
            list for the highlighted entry. */}
        <span
          className="flex-1 truncate normal-case tracking-normal text-[10px] text-gray-500"
          title={`Active layer — new features land here: ${
            doc.layers[activeLayerId]?.name ?? '—'
          }`}
        >
          <span className="text-gray-500">active:</span>{' '}
          <span className={doc.layers[activeLayerId]?.locked ? 'text-yellow-400' : 'text-white'}>
            {doc.layers[activeLayerId]?.name ?? '—'}
            {doc.layers[activeLayerId]?.locked ? ' 🔒' : ''}
          </span>
        </span>
        <span className="text-gray-500 normal-case tracking-normal text-[10px] shrink-0">
          {filterTrim.length > 0 ? `${filteredLayers.length} of ${layers.length}` : `${layers.length}`}
        </span>
      </div>

      {/* Filter input — case-insensitive name match. The
          active layer is always kept visible regardless of
          the filter so the surveyor can't lose context. */}
      <div className="px-2 py-1 border-b border-gray-700">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setFilterText(''); (e.target as HTMLInputElement).blur(); } }}
          placeholder="Filter layers…"
          className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-200 placeholder:text-gray-500 outline-none focus:border-blue-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto" onContextMenu={handlePanelContextMenu}>
        {filteredLayers.map((layer) => {
          const isExpanded = expandedLayers.has(layer.id);
          // All features on this layer. cad-fill-rotation Slice 2 —
          // include hidden features too so the layer tree can show an
          // eye toggle per row (was filtering them out, which made
          // hiding an element from the canvas right-click also vanish
          // it from the tree, with no way to bring it back from here).
          const layerFeatures = Object.values(doc.features).filter((f) => f.layerId === layer.id);
          // Check if any feature on this layer is selected or hovered
          const hasSelectedFeature = layerFeatures.some((f) => selectedIds.has(f.id));
          const hasHoveredFeature  = !!hoveredId && layerFeatures.some((f) => f.id === hoveredId);
          // SURVEY-INFO layer is highlighted when any title-block element is hovered or selected
          const hasTBActivity = layer.id === 'SURVEY-INFO' && (hoveredTBElem !== null || selectedTBElem !== null);
          const isHighlighted = hasSelectedFeature || hasHoveredFeature || hasTBActivity;

          // Groups on this layer. cad-layer-grouping Slice 3 — the
          // tree renderer below only walks root-level groups (those
          // with no parentGroupId); nested groups are reached via
          // recursion inside `renderGroup`. Keep the full `layerGroups`
          // list around so the recursive walker can look up children.
          const layerGroups = Object.values(doc.featureGroups ?? {}).filter((g) => g.layerId === layer.id);
          const rootLayerGroups = layerGroups.filter((g) => (g.parentGroupId ?? null) === null);
          // Ungrouped features
          const ungroupedFeatures = layerFeatures.filter((f) => !f.featureGroupId);

          // cad-layer-grouping Slice 3 — recursive group renderer.
          // Renders one FeatureGroup row + (when expanded) its child
          // groups (recursive call at depth + 1) followed by its
          // member features. Indentation is 12px per depth level
          // applied to the OUTER div, so all descendants of a
          // nested group inherit the same offset and stack
          // cleanly. Depth 0 = layer-root group ⇒ no extra padding,
          // pixel-identical to the pre-Slice-3 flat render.
          const renderGroup = (group: import('@/lib/cad/types').FeatureGroup, depth: number): React.ReactNode => {
            const groupFeatures = (group.featureIds ?? [])
              .map((id) => doc.features[id])
              .filter(Boolean);
            const groupSelected = groupFeatures.some((f) => selectedIds.has(f.id));
            const groupHovered  = !!hoveredId && groupFeatures.some((f) => f.id === hoveredId);
            const isGroupExpanded = expandedGroups.has(group.id);
            const childGroups = layerGroups.filter((g) => (g.parentGroupId ?? null) === group.id);
            return (
              <div
                key={group.id}
                data-group-id={group.id}
                data-group-depth={depth}
                style={depth > 0 ? { paddingLeft: `${depth * 0.75}rem` } : undefined}
              >
                {/* Group header row */}
                <div
                  className={`flex items-center gap-1 px-1 py-0.5 cursor-pointer hover:bg-gray-700 transition-colors ${
                    groupSelected || groupHovered ? 'text-blue-300' : 'text-gray-400'
                  }`}
                  onClick={(e) => handleGroupClick(group.id, e)}
                  onDoubleClick={() => startRenameGroup(group.id)}
                  // cad-layer-grouping Slice 5 — right-click opens
                  // the unified TargetContextMenu for this group.
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTargetMenu({ target: { kind: 'group', id: group.id }, x: e.clientX, y: e.clientY });
                  }}
                  title="Click to select group. Double-click to rename. Right-click for more."
                >
                  <button
                    className="flex-shrink-0 text-gray-500 hover:text-gray-300 p-0.5"
                    onClick={(e) => { e.stopPropagation(); toggleGroupExpand(group.id); }}
                    title={isGroupExpanded ? 'Collapse group' : 'Expand group'}
                    aria-label={isGroupExpanded ? 'Collapse group' : 'Expand group'}
                  >
                    {isGroupExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  </button>
                  <Layers size={9} className="text-gray-600 shrink-0" />
                  {renamingGroupId === group.id ? (
                    <input
                      ref={renameGroupRef}
                      className="flex-1 bg-gray-600 text-white text-xs px-1 rounded outline-none min-w-0"
                      value={renameGroupValue}
                      onChange={(e) => setRenameGroupValue(e.target.value)}
                      onBlur={commitRenameGroup}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRenameGroup();
                        if (e.key === 'Escape') setRenamingGroupId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span className="text-[10px] font-semibold truncate">{group.name}</span>
                  )}
                  <span className="ml-auto text-[9px] text-gray-600 shrink-0 pr-0.5">
                    {groupFeatures.length}
                  </span>
                  <button
                    className="text-gray-600 hover:text-red-400 shrink-0 p-0.5"
                    onClick={(e) => { e.stopPropagation(); store.ungroupFeatures(group.id); }}
                    title="Ungroup"
                  >
                    <X size={9} />
                  </button>
                </div>
                {/* Expanded body — child groups first, then member
                    features, mirroring how a CAD layer-panel tree
                    typically presents container vs leaf children. */}
                {isGroupExpanded && (
                  <>
                    {childGroups.map((child) => renderGroup(child, depth + 1))}
                    {groupFeatures.map((feat) => {
                      const isSelected = selectedIds.has(feat.id);
                      const isHovered  = hoveredId === feat.id;
                      const isHidden = feat.hidden === true;
                      const expandable = isExpandableFeature(feat);
                      const isExpanded = expandable && expandedFeatures.has(feat.id);
                      return (
                        <div key={feat.id} data-feature-row={feat.id}>
                          <div
                            className={`flex items-center gap-1 pl-6 pr-1 py-0.5 cursor-pointer hover:bg-gray-750 transition-colors text-[10px] ${
                              isHidden
                                ? 'text-gray-600 italic'
                                : isSelected ? 'text-blue-300 bg-blue-900/20' : isHovered ? 'text-blue-200' : 'text-gray-500'
                            }`}
                            onClick={(e) => handleFeatureClick(feat.id, e)}
                            title={feat.id}
                            data-feature-id={feat.id}
                            data-hidden={isHidden ? 'true' : 'false'}
                          >
                            {expandable ? (
                              <button
                                type="button"
                                aria-label={isExpanded ? 'Collapse vertices' : 'Expand vertices'}
                                data-testid={`layer-panel-feature-expand-${feat.id}`}
                                className="shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-100 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedFeatures((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(feat.id)) next.delete(feat.id);
                                    else next.add(feat.id);
                                    return next;
                                  });
                                }}
                              >
                                {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                              </button>
                            ) : (
                              <span className="shrink-0 w-3" aria-hidden />
                            )}
                            <button
                              type="button"
                              aria-label={isHidden ? 'Show feature' : 'Hide feature'}
                              aria-pressed={isHidden}
                              title={isHidden ? 'Show feature' : 'Hide feature'}
                              data-testid={`layer-panel-feature-eye-${feat.id}`}
                              className={`shrink-0 p-0.5 rounded transition-colors ${
                                isHidden ? 'text-gray-600 hover:text-gray-300' : 'text-gray-400 hover:text-gray-100'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isHidden) store.unhideFeature(feat.id);
                                else store.hideFeature(feat.id);
                              }}
                            >
                              {isHidden ? <EyeOff size={10} /> : <Eye size={10} />}
                            </button>
                            <span className="truncate">{featureRowLabel(feat)}</span>
                          </div>
                          {isExpanded && (
                            <div data-testid={`layer-panel-feature-vertices-${feat.id}`}>
                              {formatFeatureVertices(feat).map((line, i) => (
                                <div
                                  key={`v-${i}`}
                                  className="pl-12 pr-1 py-0.5 text-[10px] text-gray-600 tabular-nums truncate"
                                >
                                  {line}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          };

          return (
            <div key={layer.id}>
              {/* Layer row */}
              <div
                draggable
                onDragStart={(e) => {
                  dragLayerIdRef.current = layer.id;
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  // Two drag flavours: a layer-reorder drag
                  // (originating from another layer row in
                  // this same panel) or a selection-transfer
                  // drag (originating from the canvas's
                  // SelectionDragChip — Phase 8 §11.7 Slice 4).
                  // Differentiate by mime type: only the
                  // transfer drag carries TRANSFER_DRAG_MIME.
                  const types = e.dataTransfer.types;
                  const isTransfer = types.indexOf(TRANSFER_DRAG_MIME) !== -1;
                  e.preventDefault();
                  if (isTransfer) {
                    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
                    setTransferDropTargetId(layer.id);
                    setTransferDropAlt(e.altKey);
                  } else {
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDragLeave={() => {
                  // Only clear when leaving the row that's
                  // currently flagged — otherwise sibling
                  // drag-leave events fire while the cursor
                  // is still inside the panel.
                  if (transferDropTargetId === layer.id) {
                    setTransferDropTargetId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const types = e.dataTransfer.types;
                  const isTransfer = types.indexOf(TRANSFER_DRAG_MIME) !== -1;

                  if (isTransfer) {
                    // Selection-transfer drop. Read the
                    // payload, dispatch the kernel; Move by
                    // default, Alt-drop = Duplicate.
                    setTransferDropTargetId(null);
                    setTransferDropAlt(false);
                    let payload: TransferDragPayload | null = null;
                    try {
                      payload = JSON.parse(e.dataTransfer.getData(TRANSFER_DRAG_MIME));
                    } catch {
                      payload = null;
                    }
                    if (!payload || payload.kind !== 'TRANSFER' || payload.featureIds.length === 0) return;
                    if (layer.locked) {
                      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
                        detail: { text: `Layer "${layer.name}" is locked — drop denied.` },
                      }));
                      return;
                    }
                    const wantDuplicate = e.altKey;
                    const result = transferSelectionToLayer(
                      payload.featureIds,
                      layer.id,
                      {
                        keepOriginals: wantDuplicate,
                        renumberStart: null,
                        stripUnknownCodes: false,
                        targetTraverseId: null,
                        offset: null,
                        bringAlongLinkedGeometry: wantDuplicate,
                        transferOperationId: generateId(),
                      },
                    );
                    if (result.written > 0 || result.removed > 0) {
                      const verb = wantDuplicate ? 'duplicated' : 'moved';
                      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
                        detail: { text: `${result.written} feature${result.written === 1 ? '' : 's'} ${verb} to ${layer.name}.` },
                      }));
                    }
                    return;
                  }

                  // Layer-reorder drop (existing behaviour).
                  const fromId = dragLayerIdRef.current;
                  dragLayerIdRef.current = null;
                  if (!fromId || fromId === layer.id) return;
                  const order = [...doc.layerOrder];
                  const fromIdx = order.indexOf(fromId);
                  const toIdx = order.indexOf(layer.id);
                  if (fromIdx === -1 || toIdx === -1) return;
                  order.splice(fromIdx, 1);
                  order.splice(toIdx, 0, fromId);
                  store.reorderLayers(order);
                }}
                className={`flex items-center gap-1 px-1 py-1 cursor-pointer transition-colors duration-100 hover:bg-gray-700 ${
                  activeLayerId === layer.id ? 'bg-gray-700' : ''
                } ${isHighlighted ? 'ring-1 ring-blue-500 ring-inset' : ''} ${
                  transferDropTargetId === layer.id
                    ? transferDropAlt
                      ? 'ring-2 ring-green-400 bg-green-900/30'
                      : 'ring-2 ring-blue-400 bg-blue-900/30'
                    : ''
                }`}
                onClick={() => handleSetActive(layer.id)}
                onContextMenu={(e) => handleContextMenu(e, layer.id)}
              >
                {/* Expand/collapse toggle */}
                <button
                  className="flex-shrink-0 text-gray-500 hover:text-gray-300 p-0.5"
                  onClick={(e) => { e.stopPropagation(); toggleLayerExpand(layer.id); }}
                  title={isExpanded ? 'Collapse layer' : 'Expand layer'}
                >
                  {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </button>

                {/* Visibility toggle */}
                <button
                  className="flex-shrink-0 text-gray-400 hover:text-white p-0.5 transition-colors duration-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                      // Shift+click = isolate this layer (AutoCAD/Civil 3D convention).
                      // Matches the "Isolate Layer" context-menu action below — surveyors
                      // expect both gestures.
                      for (const id of doc.layerOrder) {
                        store.updateLayer(id, { visible: id === layer.id });
                      }
                    } else {
                      handleToggleVisibility(layer);
                    }
                  }}
                  title={layer.visible ? 'Hide layer · Shift+click to isolate' : 'Show layer · Shift+click to isolate'}
                >
                  {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>

                {/* Lock toggle */}
                <button
                  className={`flex-shrink-0 p-0.5 transition-colors duration-100 ${layer.locked ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-600 hover:text-gray-300'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleLock(layer);
                  }}
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                >
                  {layer.locked ? <Lock size={12} /> : <LockOpen size={12} />}
                </button>

                {/* Color swatch */}
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0 border border-gray-500"
                  style={{ backgroundColor: layer.color }}
                />

                {/* Layer preferences button */}
                <button
                  className="flex-shrink-0 text-gray-600 hover:text-blue-400 p-0.5 transition-colors duration-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    openLayerPreferences(layer.id);
                  }}
                  title="Layer display preferences"
                >
                  <Settings size={10} />
                </button>

                {/* cad-ux-cleanup-pass Slice 8 — quick-add points
                    button. Opens the Layer Transfer dialog already
                    pointed at this layer so the surveyor can move
                    selected points in without re-picking the target. */}
                <button
                  data-testid={`layer-quick-add-${layer.id}`}
                  className="flex-shrink-0 text-gray-600 hover:text-green-400 p-0.5 transition-colors duration-100"
                  onClick={(e) => { e.stopPropagation(); quickAddToLayer(layer.id); }}
                  title="Quick-add points to this layer"
                  aria-label={`Quick-add points to ${layer.name}`}
                >
                  <Plus size={10} />
                </button>

                {/* Layer name */}
                {renamingId === layer.id ? (
                  <input
                    ref={renameRef}
                    className="flex-1 bg-gray-600 text-white text-xs px-1 rounded outline-none min-w-0"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span
                    className={`flex-1 truncate ${activeLayerId === layer.id ? 'font-bold text-white' : ''} ${isHighlighted ? 'text-blue-300' : ''}`}
                    title={layer.name}
                    onDoubleClick={() => startRename(layer.id)}
                  >
                    {layer.name}
                  </span>
                )}

              {/* Feature count badge */}
                {(layer.id === 'SURVEY-INFO' ? SURVEY_INFO_ELEM_COUNT : layerFeatures.length) > 0 && (
                  <span className="ml-auto text-[9px] text-gray-500 shrink-0 pr-1">
                    {layer.id === 'SURVEY-INFO' ? SURVEY_INFO_ELEM_COUNT : layerFeatures.length}
                  </span>
                )}

                {/* §32.3 promote-draft affordance — only on
                    DRAFT__ layers. Moves the layer's features
                    onto its target via the §11.7 transfer
                    kernel + removes the now-empty draft. */}
                {isDraftLayer(layer) && (() => {
                  const target = findPromotionTarget(layer);
                  const canPromote = !!target && !target.locked;
                  return (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const result = promoteDraftLayer(layer.id);
                        if (!result.ok) {
                          window.dispatchEvent(new CustomEvent('cad:commandOutput', {
                            detail: { text: `Promote draft: ${result.reason}` },
                          }));
                          return;
                        }
                        const targetName = target?.name ?? '(target)';
                        window.dispatchEvent(new CustomEvent('cad:commandOutput', {
                          detail: { text: `Promoted ${result.movedCount} feature${result.movedCount === 1 ? '' : 's'} from "${layer.name}" → "${targetName}".` },
                        }));
                      }}
                      disabled={!canPromote}
                      className={`flex-shrink-0 ml-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded border transition-colors ${
                        canPromote
                          ? 'bg-amber-900/50 border-amber-500 text-amber-200 hover:bg-amber-800/60'
                          : 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                      }`}
                      title={
                        canPromote
                          ? `Promote draft features to "${target?.name}" via the Layer Transfer kernel (§11.7).`
                          : !target
                            ? 'No target layer found — rename the draft or create the matching real layer first.'
                            : 'Target layer is locked.'
                      }
                    >
                      <Send size={9} className="inline mr-0.5" />
                      Promote
                    </button>
                  );
                })()}
              </div>

              {/* Expanded feature tree */}
              {isExpanded && (
                <div className="ml-4 border-l border-gray-700">
                  {/* Special: SURVEY-INFO layer always shows the default
                      survey furniture elements. cad-survey-info-element-hide
                      — each now has its OWN eye toggle bound to a
                      per-element TitleBlockConfig flag, so the surveyor can
                      hide the title block / signature / scale bar / north
                      arrow individually (the layer eye above still hides
                      them all at once). */}
                  {layer.id === 'SURVEY-INFO' && (() => {
                    const tb = doc.settings?.titleBlock;
                    // key = the TitleBlockConfig flag this row toggles;
                    // hoverKey = the canvas element id for hover/selection
                    // highlight sync.
                    const surveyElements: Array<{
                      key: keyof TitleBlockConfig;
                      hoverKey: string;
                      label: string;
                      visible: boolean;
                    }> = [
                      { key: 'visible',               hoverKey: 'titleBlock',     label: 'Title Block',            visible: tb?.visible !== false },
                      { key: 'signatureBlockVisible', hoverKey: 'signatureBlock', label: 'Seal / Signature Block', visible: tb?.signatureBlockVisible !== false },
                      { key: 'scaleBarVisible',       hoverKey: 'scaleBar',       label: 'Graphic Scale',          visible: tb?.scaleBarVisible !== false },
                      { key: 'northArrowVisible',     hoverKey: 'northArrow',     label: 'Compass / North Arrow',  visible: tb?.northArrowVisible !== false },
                    ];
                    return (
                      <>
                        {surveyElements.map((el) => {
                          const isElHovered  = hoveredTBElem  === el.hoverKey;
                          const isElSelected = selectedTBElem === el.hoverKey;
                          return (
                            <div
                              key={el.key}
                              className={`flex items-center gap-1 pl-2 pr-1 py-0.5 text-[10px] transition-colors ${
                                isElSelected
                                  ? 'text-blue-300 bg-blue-900/20'
                                  : isElHovered
                                  ? 'text-blue-200'
                                  : el.visible ? 'text-gray-400' : 'text-gray-600'
                              }`}
                              title={el.visible ? `Hide ${el.label}` : `Show ${el.label}`}
                            >
                              <span className="shrink-0 w-3" aria-hidden />
                              <button
                                type="button"
                                aria-label={el.visible ? `Hide ${el.label}` : `Show ${el.label}`}
                                aria-pressed={!el.visible}
                                title={el.visible ? `Hide ${el.label}` : `Show ${el.label}`}
                                data-testid={`layer-panel-survey-info-eye-${el.key}`}
                                className={`shrink-0 p-0.5 rounded transition-colors ${
                                  el.visible ? 'text-gray-400 hover:text-gray-100' : 'text-gray-600 hover:text-gray-300'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  store.updateTitleBlock({ [el.key]: !el.visible } as Partial<TitleBlockConfig>);
                                }}
                              >
                                {el.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                              </button>
                              <span className={`truncate ${el.visible ? '' : 'line-through opacity-50'}`}>{el.label}</span>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                  {/* Groups — cad-layer-grouping Slice 3: recursive
                      tree render. Iterates ROOT-level groups only;
                      `renderGroup` walks children via recursion when
                      a parent is expanded. */}
                  {rootLayerGroups.map((group) => renderGroup(group, 0))}

                  {/* Ungrouped features */}
                  {ungroupedFeatures.map((feat) => {
                    const isSelected = selectedIds.has(feat.id);
                    const isHovered  = hoveredId === feat.id;
                    const isHidden = feat.hidden === true;
                    // cad-layer-grouping-and-context-menus Slice 1 —
                    // chevron-expandable POLYGON/POLYLINE rows.
                    const expandable = isExpandableFeature(feat);
                    const isExpanded = expandable && expandedFeatures.has(feat.id);
                    return (
                      <div key={feat.id} data-feature-row={feat.id}>
                        <div
                          className={`flex items-center gap-1 pl-2 pr-1 py-0.5 cursor-pointer hover:bg-gray-700 transition-colors text-[10px] ${
                            isHidden
                              ? 'text-gray-600 italic'
                              : isSelected ? 'text-blue-300 bg-blue-900/20' : isHovered ? 'text-blue-200' : 'text-gray-500'
                          }`}
                          onClick={(e) => handleFeatureClick(feat.id, e)}
                          title={feat.id}
                          data-feature-id={feat.id}
                          data-hidden={isHidden ? 'true' : 'false'}
                        >
                          {/* cad-layer-grouping Slice 1 — expand
                              chevron for POLYLINE / POLYGON. Hidden
                              for other feature types so the row width
                              stays consistent. */}
                          {expandable ? (
                            <button
                              type="button"
                              aria-label={isExpanded ? 'Collapse vertices' : 'Expand vertices'}
                              data-testid={`layer-panel-feature-expand-${feat.id}`}
                              className="shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-100 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedFeatures((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(feat.id)) next.delete(feat.id);
                                  else next.add(feat.id);
                                  return next;
                                });
                              }}
                            >
                              {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                            </button>
                          ) : (
                            <span className="shrink-0 w-3" aria-hidden />
                          )}
                          {/* cad-fill-rotation Slice 2 — per-feature eye
                              toggle. Two-way bound to Feature.hidden so
                              right-click "Hide Element" auto-updates the
                              icon. stopPropagation so clicking the eye
                              doesn't also fire handleFeatureClick. */}
                          <button
                            type="button"
                            aria-label={isHidden ? 'Show feature' : 'Hide feature'}
                            aria-pressed={isHidden}
                            title={isHidden ? 'Show feature' : 'Hide feature'}
                            data-testid={`layer-panel-feature-eye-${feat.id}`}
                            className={`shrink-0 p-0.5 rounded transition-colors ${
                              isHidden ? 'text-gray-600 hover:text-gray-300' : 'text-gray-400 hover:text-gray-100'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isHidden) store.unhideFeature(feat.id);
                              else store.hideFeature(feat.id);
                            }}
                          >
                            {isHidden ? <EyeOff size={10} /> : <Eye size={10} />}
                          </button>
                          <span className="truncate">{featureRowLabel(feat)}</span>
                        </div>
                        {/* cad-layer-grouping Slice 1 — expanded
                            vertex list. Read-only display; per-vertex
                            hideability requires the "Explode to
                            segments" right-click op (Slice 6 of this
                            plan). */}
                        {isExpanded && (
                          <div data-testid={`layer-panel-feature-vertices-${feat.id}`}>
                            {formatFeatureVertices(feat).map((line, i) => (
                              <div
                                key={`v-${i}`}
                                className="pl-8 pr-1 py-0.5 text-[10px] text-gray-600 tabular-nums truncate"
                              >
                                {line}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {layer.id !== 'SURVEY-INFO' && layerFeatures.length === 0 && (
                    <div className="pl-2 py-0.5 text-[10px] text-gray-600 italic">No features</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* New Layer + Hidden Items buttons */}
      <div className="border-t border-gray-700 p-1 space-y-0.5">
        <button
          className="w-full flex items-center gap-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded px-1 py-1 text-xs transition-colors duration-100"
          onClick={handleNewLayer}
        >
          <Plus size={12} />
          New Layer
        </button>
        <button
          className="w-full flex items-center gap-1 text-gray-400 hover:text-orange-300 hover:bg-gray-700 rounded px-1 py-1 text-xs transition-colors duration-100"
          onClick={openHiddenItems}
        >
          <EyeOffIcon size={12} />
          Hidden Items
        </button>
        <button
          className="w-full flex items-center gap-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded px-1 py-1 text-xs transition-colors duration-100"
          onClick={() => setRestrictToActive(!restrictToActive)}
          title={
            restrictToActive
              ? 'Editing is limited to the active layer. Click to allow editing any visible layer.'
              : 'Editing is allowed on any visible layer. Click to limit editing to the active layer only.'
          }
        >
          {restrictToActive ? <Lock size={12} /> : <LockOpen size={12} />}
          Edit: {restrictToActive ? 'active layer only' : 'any visible layer'}
        </button>
      </div>

      {/* Click-away overlay — a normal click anywhere (incl. the canvas
          outside this panel) dismisses the layer/panel right-click menus. */}
      {(contextMenu || panelMenu) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setContextMenu(null); setPanelMenu(null); }}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); setPanelMenu(null); }}
        />
      )}

      {/* cad-layer-grouping Slice 5 — TargetContextMenu for group
          right-click. The component manages its own outside-click
          + Escape dismissal so we just render it conditionally. */}
      {targetMenu && (
        <TargetContextMenu
          target={targetMenu.target}
          x={targetMenu.x}
          y={targetMenu.y}
          onRequestRename={(groupId) => startRenameGroup(groupId)}
          onClose={() => setTargetMenu(null)}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-600 rounded shadow-lg py-1 text-xs text-gray-200 min-w-[120px] animate-[scaleIn_120ms_cubic-bezier(0.16,1,0.3,1)]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100 flex items-center gap-1.5 text-blue-300"
            onClick={() => {
              const layerName = doc.layers[contextMenu.layerId]?.name ?? 'this layer';
              const count = Object.values(doc.features).filter((f) => f.layerId === contextMenu.layerId).length;
              useAIConversationsStore.getState().openWith({
                scope: `Layer “${layerName}” (${count} feature${count === 1 ? '' : 's'})`,
              });
              setContextMenu(null);
            }}
          >
            <Sparkles size={12} /> Ask AI about this layer…
          </button>
          <div className="my-1 border-t border-gray-700" />
          <button
            className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100"
            onClick={() => {
              // Select every feature on this layer so the surveyor can
              // immediately Move / Scale / Rotate the whole layer.
              const ids = Object.values(doc.features)
                .filter((f) => f.layerId === contextMenu.layerId && !f.hidden)
                .map((f) => f.id);
              if (ids.length > 0) selectionStore.selectMultiple(ids, 'REPLACE');
              setContextMenu(null);
            }}
          >
            Select all in layer
          </button>
          {/* cad-ux-cleanup-pass Slice 8 — quick-add points entry.
              Opens the Layer Transfer dialog pre-targeted at this
              layer so the surveyor can drop a selection in without
              re-picking the target. */}
          <button
            className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100 flex items-center gap-1.5"
            onClick={() => quickAddToLayer(contextMenu.layerId)}
          >
            <Plus size={11} /> Quick-add points…
          </button>
          <button
            className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100"
            onClick={() => handleDuplicateLayer(contextMenu.layerId)}
          >
            Duplicate layer
          </button>
          <button
            className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100"
            onClick={() => {
              const id = contextMenu.layerId;
              setContextMenu(null);
              window.dispatchEvent(new CustomEvent('cad:addMediaForOwner', { detail: { ownerId: id, ownerKind: 'layer' } }));
            }}
          >
            Add media for this layer…
          </button>
          {(mediaByOwner[contextMenu.layerId]?.length ?? 0) > 0 && (
            <button
              className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100"
              onClick={() => {
                const id = contextMenu.layerId;
                setContextMenu(null);
                window.dispatchEvent(new CustomEvent('cad:openMediaViewer', { detail: { ownerId: id } }));
              }}
            >
              View media ({mediaByOwner[contextMenu.layerId].length})
            </button>
          )}
          <button
            className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100"
            onClick={() => startRename(contextMenu.layerId)}
          >
            Rename
          </button>
          <button
            className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100"
            onClick={() => {
              const layer = doc.layers[contextMenu.layerId];
              if (layer) handleToggleLock(layer);
              setContextMenu(null);
            }}
          >
            {doc.layers[contextMenu.layerId]?.locked ? 'Unlock' : 'Lock'}
          </button>
          <button
            className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100"
            onClick={() => handleChangeColor(contextMenu.layerId)}
          >
            Change Color
          </button>
          <button
            className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100"
            onClick={() => openLayerPreferences(contextMenu.layerId)}
          >
            Layer Preferences
          </button>
          <div className="border-t border-gray-700 my-0.5" />
          {/* Isolate / show-all — surveyors regularly want to
              focus on one layer (boundary work hides topo, etc.).
              Isolate hides every other layer; Show All restores
              full visibility. Both update the layer store
              directly, so the canvas re-renders immediately. */}
          <button
            className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100"
            onClick={() => {
              const target = contextMenu.layerId;
              for (const id of doc.layerOrder) {
                store.updateLayer(id, { visible: id === target });
              }
              setContextMenu(null);
            }}
          >
            Isolate Layer
          </button>
          <button
            className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100"
            onClick={() => {
              for (const id of doc.layerOrder) {
                if (!doc.layers[id]?.visible) store.updateLayer(id, { visible: true });
              }
              setContextMenu(null);
            }}
          >
            Show All Layers
          </button>
          <div className="border-t border-gray-700 my-0.5" />
          {/* Per-layer rotation */}
          {rotatingLayerId === contextMenu.layerId ? (
            <div className="px-3 py-1.5 flex items-center gap-1.5">
              <RotateCw size={11} className="text-blue-400 shrink-0" />
              <input
                type="number"
                step="1"
                value={rotationInputVal}
                onChange={(e) => setRotationInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const deg = parseFloat(rotationInputVal) || 0;
                    store.updateLayer(contextMenu.layerId, { rotationDeg: deg === 0 ? null : deg });
                    setRotatingLayerId(null);
                    setContextMenu(null);
                  }
                  if (e.key === 'Escape') { setRotatingLayerId(null); }
                }}
                className="w-16 bg-gray-700 border border-gray-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-blue-400"
                autoFocus
                placeholder="0°"
              />
              <button
                className="text-[10px] text-blue-400 hover:text-blue-300"
                onClick={() => {
                  const deg = parseFloat(rotationInputVal) || 0;
                  store.updateLayer(contextMenu.layerId, { rotationDeg: deg === 0 ? null : deg });
                  setRotatingLayerId(null);
                  setContextMenu(null);
                }}
              >Set</button>
            </div>
          ) : (
            <button
              className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100 flex items-center gap-1.5"
              onClick={() => {
                const currentRot = doc.layers[contextMenu.layerId]?.rotationDeg ?? 0;
                setRotationInputVal(String(currentRot ?? 0));
                setRotatingLayerId(contextMenu.layerId);
              }}
            >
              <RotateCw size={11} className="text-gray-400" />
              Rotate Layer View…
              {(doc.layers[contextMenu.layerId]?.rotationDeg ?? 0) !== 0 && (
                <span className="ml-auto text-[10px] text-blue-400">
                  {doc.layers[contextMenu.layerId]?.rotationDeg}°
                </span>
              )}
            </button>
          )}
          <button
            className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100 text-red-400"
            onClick={() => handleDeleteLayer(contextMenu.layerId)}
          >
            Delete
          </button>
        </div>
      )}

      {/* Panel-level (background) right-click menu — bulk layer actions. */}
      {panelMenu && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-600 rounded shadow-lg py-1 text-xs text-gray-200 min-w-[180px] animate-[scaleIn_120ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none origin-top-left"
          style={{ top: panelMenu.y, left: panelMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="w-full text-left px-3 py-1 hover:bg-gray-700 flex items-center gap-1.5 text-blue-300"
            onClick={() => { handleNewLayer(); setPanelMenu(null); }}>
            <Plus size={12} /> New Layer
          </button>
          <div className="my-1 border-t border-gray-700" />
          <button className="w-full text-left px-3 py-1 hover:bg-gray-700 flex items-center gap-1.5"
            onClick={() => setAllLayers({ visible: true })}>
            <Eye size={12} /> Reveal all layers
          </button>
          <button className="w-full text-left px-3 py-1 hover:bg-gray-700 flex items-center gap-1.5"
            onClick={() => setAllLayers({ visible: false })}>
            <EyeOff size={12} /> Hide all layers
          </button>
          <div className="my-1 border-t border-gray-700" />
          <button className="w-full text-left px-3 py-1 hover:bg-gray-700 flex items-center gap-1.5"
            onClick={() => setAllLayers({ locked: true })}>
            <Lock size={12} /> Lock all layers
          </button>
          <button className="w-full text-left px-3 py-1 hover:bg-gray-700 flex items-center gap-1.5"
            onClick={() => setAllLayers({ locked: false })}>
            <LockOpen size={12} /> Unlock all layers
          </button>
          <div className="my-1 border-t border-gray-700" />
          <button className="w-full text-left px-3 py-1 hover:bg-gray-700 flex items-center gap-1.5"
            onClick={duplicateActiveLayer}>
            <Layers size={12} /> Duplicate active layer
          </button>
          <button className="w-full text-left px-3 py-1 hover:bg-gray-700 flex items-center gap-1.5"
            onClick={() => { window.dispatchEvent(new CustomEvent('cad:openExportLayers')); setPanelMenu(null); }}>
            <Send size={12} /> Export layers…
          </button>
        </div>
      )}

      {/* New-layer creation modal (§11). */}
      {newLayerDefaults && (
        <NewLayerDialog
          defaultName={newLayerDefaults.name}
          defaultColor={newLayerDefaults.color}
          onCreate={createLayerFromDialog}
          onClose={() => setNewLayerDefaults(null)}
        />
      )}
    </div>
  );
}

