'use client';
// app/admin/cad/components/LayerPanel.tsx — Layer list panel

import { useState, useRef } from 'react';
import { Eye, EyeOff, Lock, LockOpen, Plus, Settings, EyeOff as EyeOffIcon } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
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

interface ContextMenu {
  layerId: string;
  x: number;
  y: number;
}

export default function LayerPanel() {
  const store = useDrawingStore();
  const { document: doc, activeLayerId } = store;
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const dragLayerIdRef = useRef<string | null>(null);

  const layers = doc.layerOrder.map((id) => doc.layers[id]).filter(Boolean);

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
      lineWeight: 0.25,
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

  return (
    <div
      className="flex flex-col h-full text-gray-200 text-xs"
      onClick={contextMenu ? closeContextMenu : undefined}
    >
      <div className="px-2 py-1 text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-700">
        Layers
      </div>

      <div className="flex-1 overflow-y-auto">
        {layers.map((layer) => (
          <div
            key={layer.id}
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
            }`}
            onClick={() => handleSetActive(layer.id)}
            onContextMenu={(e) => handleContextMenu(e, layer.id)}
          >
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
                className={`flex-1 truncate ${activeLayerId === layer.id ? 'font-bold text-white' : ''}`}
                onDoubleClick={() => startRename(layer.id)}
              >
                {layer.name}
              </span>
            )}
          </div>
        ))}
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
