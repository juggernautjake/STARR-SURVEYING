// app/admin/research/components/AnnotationLayerPanel.tsx — Annotation layer manager
'use client';

import { useState, useRef } from 'react';
import Tooltip from './Tooltip';
import { confirm as confirmDialog } from './ConfirmDialog';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AnnotationLayer {
  id: string;
  name: string;
  color: string;       // accent color for layer label
  visible: boolean;
  locked: boolean;
  order: number;       // lower = rendered first (bottom)
}

export const DEFAULT_LAYER_COLORS = [
  '#2563EB', '#16A34A', '#DC2626', '#9333EA',
  '#EA580C', '#0891B2', '#65A30D', '#BE185D',
];

export function createDefaultLayer(idx = 0): AnnotationLayer {
  return {
    id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: `Layer ${idx + 1}`,
    color: DEFAULT_LAYER_COLORS[idx % DEFAULT_LAYER_COLORS.length],
    visible: true,
    locked: false,
    order: idx,
  };
}

// ── Props ────────────────────────────────────────────────────────────────────

interface AnnotationLayerPanelProps {
  layers: AnnotationLayer[];
  activeLayerId: string;
  onLayersChange: (layers: AnnotationLayer[]) => void;
  onActiveLayerChange: (id: string) => void;
  annotationCountByLayer: Record<string, number>;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AnnotationLayerPanel({
  layers,
  activeLayerId,
  onLayersChange,
  onActiveLayerChange,
  annotationCountByLayer,
}: AnnotationLayerPanelProps) {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragLayerRef = useRef<string | null>(null);

  const sorted = [...layers].sort((a, b) => b.order - a.order); // top → bottom display

  function addLayer() {
    const newLayer = createDefaultLayer(layers.length);
    onLayersChange([...layers, newLayer]);
    onActiveLayerChange(newLayer.id);
  }

  function deleteLayer(id: string) {
    if (layers.length <= 1) return; // must keep at least one
    const remaining = layers.filter(l => l.id !== id);
    onLayersChange(remaining);
    if (activeLayerId === id) onActiveLayerChange(remaining[0].id);
  }

  function updateLayer(id: string, partial: Partial<AnnotationLayer>) {
    onLayersChange(layers.map(l => l.id === id ? { ...l, ...partial } : l));
  }

  function startRename(layer: AnnotationLayer) {
    setEditingLayerId(layer.id);
    setEditingName(layer.name);
  }

  function commitRename() {
    if (editingLayerId && editingName.trim()) {
      updateLayer(editingLayerId, { name: editingName.trim() });
    }
    setEditingLayerId(null);
  }

  // Drag-to-reorder
  function handleDragStart(id: string) {
    dragLayerRef.current = id;
  }

  function handleDrop(targetId: string) {
    const fromId = dragLayerRef.current;
    if (!fromId || fromId === targetId) { setDragOver(null); return; }

    const from = layers.find(l => l.id === fromId);
    const to = layers.find(l => l.id === targetId);
    if (!from || !to) { setDragOver(null); return; }

    // Swap orders
    const updated = layers.map(l => {
      if (l.id === fromId) return { ...l, order: to.order };
      if (l.id === targetId) return { ...l, order: from.order };
      return l;
    });
    onLayersChange(updated);
    setDragOver(null);
    dragLayerRef.current = null;
  }

  return (
    <div className="layer-panel">
      <div className="layer-panel__header">
        <span className="layer-panel__title">Layers</span>
        <Tooltip text="Add a new annotation layer. Each layer can be toggled, locked, and colored independently." position="right" delay={300}>
          <button className="layer-panel__add-btn" onClick={addLayer} aria-label="Add new layer">
            + Add
          </button>
        </Tooltip>
      </div>

      <div className="layer-panel__list">
        {sorted.map(layer => {
          const count = annotationCountByLayer[layer.id] || 0;
          const isActive = layer.id === activeLayerId;

          return (
            <div
              key={layer.id}
              className={`layer-panel__row ${isActive ? 'layer-panel__row--active' : ''} ${dragOver === layer.id ? 'layer-panel__row--drag-over' : ''}`}
              draggable
              onDragStart={() => handleDragStart(layer.id)}
              onDragOver={e => { e.preventDefault(); setDragOver(layer.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(layer.id)}
              onClick={() => onActiveLayerChange(layer.id)}
            >
              {/* Color dot */}
              <div className="layer-panel__color-dot" style={{ background: layer.color }} />

              {/* Name — click to select, double-click to rename */}
              {editingLayerId === layer.id ? (
                <input
                  className="layer-panel__name-input"
                  value={editingName}
                  autoFocus
                  onChange={e => setEditingName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingLayerId(null);
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="layer-panel__name"
                  onDoubleClick={e => { e.stopPropagation(); startRename(layer); }}
                  title="Double-click to rename"
                >
                  {layer.name}
                  {count > 0 && <span className="layer-panel__count">{count}</span>}
                </span>
              )}

              {/* Controls */}
              <div className="layer-panel__controls" onClick={e => e.stopPropagation()}>
                {/* Visibility toggle */}
                <Tooltip text={layer.visible ? 'Hide layer — annotations on this layer will be invisible' : 'Show layer — make this layer visible'} position="right" delay={400}>
                  <button
                    className={`layer-panel__btn ${!layer.visible ? 'layer-panel__btn--off' : ''}`}
                    onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                    aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                  >
                    {layer.visible ? '👁' : '🚫'}
                  </button>
                </Tooltip>

                {/* Lock toggle */}
                <Tooltip text={layer.locked ? 'Locked — click to unlock so annotations can be edited' : 'Unlocked — click to lock so annotations cannot be moved or edited'} position="right" delay={400}>
                  <button
                    className={`layer-panel__btn ${layer.locked ? 'layer-panel__btn--locked' : ''}`}
                    onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                    aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </button>
                </Tooltip>

                {/* Color change */}
                <Tooltip text="Change the accent color for this layer (used for the color dot and row highlight)" position="right" delay={400}>
                  <input
                    type="color"
                    value={layer.color}
                    className="layer-panel__color-input"
                    aria-label="Layer color"
                    onChange={e => updateLayer(layer.id, { color: e.target.value })}
                  />
                </Tooltip>

                {/* Delete */}
                <Tooltip text={layers.length <= 1 ? 'Cannot delete the only layer' : count > 0 ? `Delete layer — ${count} annotation(s) will also be removed` : 'Delete this empty layer'} position="right" delay={400}>
                  <button
                    className="layer-panel__btn layer-panel__btn--delete"
                    onClick={async () => {
                      if (count > 0) {
                        const ok = await confirmDialog({
                          title: `Delete "${layer.name}"?`,
                          body: `It has ${count} annotation${count === 1 ? '' : 's'} that will also be removed.`,
                          confirmLabel: 'Delete',
                          tone: 'danger',
                        });
                        if (!ok) return;
                      }
                      deleteLayer(layer.id);
                    }}
                    aria-label="Delete layer"
                    disabled={layers.length <= 1}
                  >
                    ×
                  </button>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>

      <div className="layer-panel__hint">
        💡 Click a row to set active layer · Double-click name to rename · Drag to reorder
      </div>
    </div>
  );
}
