'use client';
// app/admin/cad/components/SelectionDragChip.tsx
//
// Phase 8 §11.7 Slice 4 — drag-to-layer chip. When the
// surveyor has at least one feature selected, this small
// floating pill at the top-right of the canvas becomes the
// drag source for transfer-to-layer operations. Drop on any
// LayerPanel layer row → Move (default). Hold Alt while
// dropping → Duplicate. The drag payload uses a custom
// mime type so layer-reorder (which already drag/drops
// inside LayerPanel) doesn't accidentally consume it.

import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useSelectionStore } from '@/lib/cad/store';

export const TRANSFER_DRAG_MIME = 'application/x-starr-selection-transfer';

export interface TransferDragPayload {
  /** Feature ids the surveyor wants to transfer. Captured at
   *  drag-start so a subsequent edit doesn't drift the set
   *  before the drop fires. */
  featureIds: string[];
  /** Marker so the LayerPanel drop handler can prove it's
   *  ours and not a layer-reorder drag. */
  kind: 'TRANSFER';
}

export default function SelectionDragChip() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const count = selectedIds.size;
  const [dragging, setDragging] = useState(false);
  if (count === 0) return null;

  const onDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    const payload: TransferDragPayload = {
      featureIds: Array.from(selectedIds),
      kind: 'TRANSFER',
    };
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData(TRANSFER_DRAG_MIME, JSON.stringify(payload));
    // Plain-text fallback so dropping into a text field
    // outside the LayerPanel pastes a sensible label rather
    // than swallowing the drag silently.
    e.dataTransfer.setData('text/plain', `${count} CAD feature${count === 1 ? '' : 's'}`);
    setDragging(true);
  };

  const onDragEnd = () => setDragging(false);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title="Drag onto a layer in the Layers panel to move (or hold Alt to duplicate). Ctrl+Shift+L opens the full transfer dialog."
      className={`absolute top-2 right-2 z-30 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono cursor-grab active:cursor-grabbing select-none transition-all duration-150 ${
        dragging ? 'opacity-40 scale-95' : 'opacity-90 hover:opacity-100'
      }`}
      style={{ background: 'rgba(20,40,80,0.85)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.45)' }}
    >
      <ArrowUpRight size={10} />
      <span>Drag {count} to a layer</span>
      <span className="text-blue-300/60">(Alt = duplicate)</span>
    </div>
  );
}
