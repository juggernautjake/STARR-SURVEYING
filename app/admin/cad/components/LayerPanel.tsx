'use client';
// app/admin/cad/components/LayerPanel.tsx — Layer list panel

import { useState, useRef } from 'react';
import { Eye, EyeOff, Lock, LockOpen, Plus, Settings, EyeOff as EyeOffIcon, RotateCw, ChevronDown, ChevronRight, Layers, X } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import { useSelectionStore } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import type { Layer } from '@/lib/cad/types';

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
  const { document: doc, activeLayerId } = store;
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const dragLayerIdRef = useRef<string | null>(null);
  /** When set, a small rotation input is shown in the context menu for this layer. */
  const [rotatingLayerId, setRotatingLayerId] = useState<string | null>(null);
  const [rotationInputVal, setRotationInputVal] = useState('0');
  /** Layers that are expanded (showing feature tree). */
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());
  /** Currently renaming group id. */
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState('');
  const renameGroupRef = useRef<HTMLInputElement>(null);

  const layers = doc.layerOrder.map((id) => doc.layers[id]).filter(Boolean);

  // Track selected and hovered feature IDs for layer highlighting
  const selectedIds    = selectionStore.selectedIds;
  const hoveredId      = selectionStore.hoveredId;
  // Title-block element hover / selection — drives SURVEY-INFO layer highlight
  const hoveredTBElem  = selectionStore.hoveredTBElem;
  const selectedTBElem = selectionStore.selectedTBElem;

  function handleToggleVisibility(layer: Layer) {
    store.updateLayer(layer.id, { visible: !layer.visible });
  }

  function handleToggleLock(layer: Layer) {
    store.updateLayer(layer.id, { locked: !layer.locked });
  }

  function handleSetActive(layerId: string) {
    store.setActiveLayer(layerId);
  }

  function handleNewLayer() {
    const id = generateId();
    const existingCount = doc.layerOrder.length;
    store.addLayer({
      id,
      name: `Layer ${existingCount + 1}`,
      visible: true,
      locked: false,
      frozen: false,
      color: nextLayerColor(),
      lineWeight: 0.75,
      lineTypeId: 'SOLID',
      opacity: 1,
      groupId: null,
      sortOrder: existingCount,
      isDefault: false,
      isProtected: false,
      autoAssignCodes: [],
    });
    store.setActiveLayer(id);
  }

  function handleContextMenu(e: React.MouseEvent, layerId: string) {
    e.preventDefault();
    setContextMenu({ layerId, x: e.clientX, y: e.clientY });
  }

  function closeContextMenu() {
    setContextMenu(null);
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

  function handleDeleteLayer(layerId: string) {
    const layer = doc.layers[layerId];
    if (layer?.isDefault) return;
    store.removeLayer(layerId);
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
    setExpandedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
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
      onClick={contextMenu ? closeContextMenu : undefined}
    >
      <div className="px-2 py-1 text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-700">
        Layers
      </div>

      <div className="flex-1 overflow-y-auto">
        {layers.map((layer) => {
          const isExpanded = expandedLayers.has(layer.id);
          // All features on this layer
          const layerFeatures = Object.values(doc.features).filter((f) => f.layerId === layer.id && !f.hidden);
          // Check if any feature on this layer is selected or hovered
          const hasSelectedFeature = layerFeatures.some((f) => selectedIds.has(f.id));
          const hasHoveredFeature  = !!hoveredId && layerFeatures.some((f) => f.id === hoveredId);
          // SURVEY-INFO layer is highlighted when any title-block element is hovered or selected
          const hasTBActivity = layer.id === 'SURVEY-INFO' && (hoveredTBElem !== null || selectedTBElem !== null);
          const isHighlighted = hasSelectedFeature || hasHoveredFeature || hasTBActivity;

          // Groups on this layer
          const layerGroups = Object.values(doc.featureGroups ?? {}).filter((g) => g.layerId === layer.id);
          // Ungrouped features
          const ungroupedFeatures = layerFeatures.filter((f) => !f.featureGroupId);

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
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
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
                } ${isHighlighted ? 'ring-1 ring-blue-500 ring-inset' : ''}`}
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
                    handleToggleVisibility(layer);
                  }}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
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
              </div>

              {/* Expanded feature tree */}
              {isExpanded && (
                <div className="ml-4 border-l border-gray-700">
                  {/* Special: SURVEY-INFO layer always shows default survey elements */}
                  {layer.id === 'SURVEY-INFO' && (() => {
                    const tb = doc.settings?.titleBlock;
                    const tbVisible = tb?.visible !== false;
                    const surveyElements = [
                      { key: 'titleBlock',      label: 'Title Block',            visible: tbVisible },
                      { key: 'signatureBlock',  label: 'Seal / Signature Block', visible: tbVisible },
                      { key: 'scaleBar',        label: 'Graphic Scale',          visible: tbVisible && (tb?.scaleBarVisible !== false) },
                      { key: 'northArrow',      label: 'Compass / North Arrow',  visible: tbVisible },
                    ];
                    return (
                      <>
                        {surveyElements.map((el) => {
                          const isElHovered  = hoveredTBElem  === el.key;
                          const isElSelected = selectedTBElem === el.key;
                          return (
                            <div
                              key={el.key}
                              className={`flex items-center gap-1 pl-2 pr-1 py-0.5 text-[10px] transition-colors ${
                                isElSelected
                                  ? 'text-blue-300 bg-blue-900/20'
                                  : isElHovered
                                  ? 'text-blue-200'
                                  : 'text-gray-400'
                              }`}
                              title={el.visible ? 'Visible' : 'Hidden (title block is hidden)'}
                            >
                              <span className={`truncate ${el.visible ? '' : 'line-through opacity-50'}`}>{el.label}</span>
                              {!el.visible && <span className="text-gray-600 text-[9px] ml-auto">hidden</span>}
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                  {/* Groups */}
                  {layerGroups.map((group) => {
                    const groupFeatures = (group.featureIds ?? [])
                      .map((id) => doc.features[id])
                      .filter(Boolean);
                    const groupSelected = groupFeatures.some((f) => selectedIds.has(f.id));
                    const groupHovered  = !!hoveredId && groupFeatures.some((f) => f.id === hoveredId);

                    return (
                      <div key={group.id}>
                        {/* Group header row */}
                        <div
                          className={`flex items-center gap-1 px-1 py-0.5 cursor-pointer hover:bg-gray-700 transition-colors ${
                            groupSelected || groupHovered ? 'text-blue-300' : 'text-gray-400'
                          }`}
                          onClick={(e) => handleGroupClick(group.id, e)}
                          onDoubleClick={() => startRenameGroup(group.id)}
                          title="Click to select group. Double-click to rename."
                        >
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
                          <button
                            className="ml-auto text-gray-600 hover:text-red-400 shrink-0 p-0.5"
                            onClick={(e) => { e.stopPropagation(); store.ungroupFeatures(group.id); }}
                            title="Ungroup"
                          >
                            <X size={9} />
                          </button>
                        </div>
                        {/* Group members */}
                        {groupFeatures.map((feat) => {
                          const isSelected = selectedIds.has(feat.id);
                          const isHovered  = hoveredId === feat.id;
                          return (
                            <div
                              key={feat.id}
                              className={`flex items-center gap-1 pl-4 pr-1 py-0.5 cursor-pointer hover:bg-gray-750 transition-colors text-[10px] ${
                                isSelected ? 'text-blue-300 bg-blue-900/20' : isHovered ? 'text-blue-200' : 'text-gray-500'
                              }`}
                              onClick={(e) => handleFeatureClick(feat.id, e)}
                              title={feat.id}
                            >
                              <span className="truncate">{feat.type}{feat.properties?.name ? ` – ${feat.properties.name}` : ''}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Ungrouped features */}
                  {ungroupedFeatures.map((feat) => {
                    const isSelected = selectedIds.has(feat.id);
                    const isHovered  = hoveredId === feat.id;
                    return (
                      <div
                        key={feat.id}
                        className={`flex items-center gap-1 pl-2 pr-1 py-0.5 cursor-pointer hover:bg-gray-700 transition-colors text-[10px] ${
                          isSelected ? 'text-blue-300 bg-blue-900/20' : isHovered ? 'text-blue-200' : 'text-gray-500'
                        }`}
                        onClick={(e) => handleFeatureClick(feat.id, e)}
                        title={feat.id}
                      >
                        <span className="truncate">{feat.type}{feat.properties?.name ? ` – ${feat.properties.name}` : ''}</span>
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
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-600 rounded shadow-lg py-1 text-xs text-gray-200 min-w-[120px] animate-[scaleIn_120ms_cubic-bezier(0.16,1,0.3,1)]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
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
          {!doc.layers[contextMenu.layerId]?.isDefault && (
            <button
              className="w-full text-left px-3 py-1 hover:bg-gray-700 transition-colors duration-100 text-red-400"
              onClick={() => handleDeleteLayer(contextMenu.layerId)}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

