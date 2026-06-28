'use client';
// Floating numeric rotation control for a selected image.
//
// Appears just above the image's top edge whenever exactly one IMAGE
// feature is selected. Shows the live rotation in degrees (updating as
// the surveyor spins the on-canvas handle) and lets them type an exact
// angle. Rotation is applied around the image center so the image stays
// put while it turns. Tracks pan/zoom by subscribing to the viewport
// store. (Position assumes no global drawing rotation, the common case;
// the value shown is always correct regardless.)
//
// The box can be dragged out of the way by its grip handle — the offset
// is remembered until the selection changes. While the surveyor is
// actively manipulating the image on the canvas (resize / rotate / move),
// `suppressPointer` makes the whole widget pointer-transparent so a
// gesture that crosses the box is not swallowed / cancelled.
import { useEffect, useRef, useState } from 'react';
import { RotateCw, GripVertical } from 'lucide-react';

import {
  useSelectionStore,
  useDrawingStore,
  useViewportStore,
  useUndoStore,
} from '@/lib/cad/store';
import {
  imageLocalToWorld,
  setImageRotationAroundCenter,
  normalizeDeg,
} from '@/lib/cad/geometry/image';
import { generateId } from '@/lib/cad/types';

export function ImageRotationField({ suppressPointer = false }: { suppressPointer?: boolean }) {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const document = useDrawingStore((s) => s.document);
  // Subscribe to camera fields so the widget follows pan / zoom.
  const zoom = useViewportStore((s) => s.zoom);
  const centerX = useViewportStore((s) => s.centerX);
  const centerY = useViewportStore((s) => s.centerY);
  const screenWidth = useViewportStore((s) => s.screenWidth);
  const screenHeight = useViewportStore((s) => s.screenHeight);

  const [draft, setDraft] = useState<string | null>(null);
  // Manual drag offset (px, screen space) so the surveyor can park the box
  // away from the image. Reset whenever the selected image changes.
  const [dragOffset, setDragOffset] = useState({ dx: 0, dy: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseDx: number; baseDy: number } | null>(null);

  const ids = Array.from(selectedIds);
  const feature = ids.length === 1 ? document.features[ids[0]] : null;
  const img = feature?.geometry.type === 'IMAGE' ? feature.geometry.image : undefined;
  const activeId = feature && img ? ids[0] : null;

  // Reset the parked offset whenever the active image changes (or selection
  // clears) so the box re-centers over the next image.
  useEffect(() => {
    setDragOffset({ dx: 0, dy: 0 });
  }, [activeId]);

  if (!feature || !img) {
    // Reset any stale draft when the selection changes away from an image.
    if (draft !== null) setDraft(null);
    return null;
  }

  // Top-edge midpoint → screen, then a fixed nudge upward so the field
  // floats clear of the rotation handle.
  const tm = imageLocalToWorld(img, { x: img.width / 2, y: img.height });
  const sx = (tm.x - centerX) * zoom + screenWidth / 2;
  const sy = -(tm.y - centerY) * zoom + screenHeight / 2;

  const currentDeg = normalizeDeg((img.rotation * 180) / Math.PI);

  function apply(rawDeg: number) {
    if (!Number.isFinite(rawDeg)) return;
    const before = useDrawingStore.getState().getFeature(ids[0]);
    if (!before?.geometry.image) return;
    const rotated = setImageRotationAroundCenter(before.geometry.image, (rawDeg * Math.PI) / 180);
    useDrawingStore.getState().updateFeatureGeometry(ids[0], { ...before.geometry, image: rotated });
    const after = useDrawingStore.getState().getFeature(ids[0]);
    if (after) {
      useUndoStore.getState().pushUndo({
        id: generateId(),
        description: 'Rotate image',
        timestamp: Date.now(),
        operations: [{ type: 'MODIFY_FEATURE', data: { id: ids[0], before, after } }],
      });
    }
  }

  function commitDraft() {
    if (draft === null) return;
    const parsed = parseFloat(draft);
    if (Number.isFinite(parsed)) apply(parsed);
    setDraft(null);
  }

  function nudge(delta: number) {
    apply(currentDeg + delta);
  }

  // ── Drag-to-reposition the box itself (window-level tracking so the
  // gesture survives the cursor leaving the small handle). ─────────────
  function onHandleDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseDx: dragOffset.dx,
      baseDy: dragOffset.dy,
    };
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setDragOffset({
        dx: d.baseDx + (ev.clientX - d.startX),
        dy: d.baseDy + (ev.clientY - d.startY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <div
      className={`absolute z-30 ${suppressPointer ? 'pointer-events-none' : 'pointer-events-auto'}`}
      style={{
        left: sx + dragOffset.dx,
        top: sy - 52 + dragOffset.dy,
        transform: 'translate(-50%, -100%)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 rounded-md bg-gray-800/95 border border-gray-600 shadow-lg px-1.5 py-1 text-gray-200">
        <button
          type="button"
          onMouseDown={onHandleDown}
          className="flex items-center justify-center -ml-0.5 text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing focus:outline-none"
          aria-label="Drag rotation box"
          title="Drag to move this box"
        >
          <GripVertical size={12} />
        </button>
        <RotateCw size={12} className="text-blue-400 shrink-0" />
        <input
          type="number"
          step={1}
          value={draft ?? currentDeg.toFixed(1)}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => { setDraft(currentDeg.toFixed(1)); e.target.select(); }}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { commitDraft(); (e.target as HTMLInputElement).blur(); }
            else if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(e.shiftKey ? 15 : 1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(e.shiftKey ? -15 : -1); }
            e.stopPropagation();
          }}
          className="w-14 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-right tabular-nums focus:outline-none focus:border-blue-500"
          aria-label="Image rotation in degrees"
        />
        <span className="text-[10px] text-gray-400 pr-0.5">°</span>
      </div>
    </div>
  );
}
