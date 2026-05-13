'use client';
// app/admin/cad/components/PickModeContextMenu.tsx
//
// Phase 8 §11.7 — right-click context menu surfaced while
// LayerTransferDialog is in Pick mode. Lets the surveyor prune
// the running pick set without leaving Pick mode or fishing
// through the dialog's source list.
//
// Two entry contexts:
//   * Right-click on a glowing feature → "Remove from selection",
//     "Remove all on layer <name>", "Remove all with code <code>"
//     (only when the feature carries `properties.rawCode`).
//   * Right-click on empty canvas → just the universal Clear /
//     Pop-last entries.

import { useEffect, useRef } from 'react';
import {
  useDrawingStore,
  useTransferStore,
} from '@/lib/cad/store';

interface PickModeContextMenuProps {
  x: number;
  y: number;
  featureId: string | null;
  onClose: () => void;
}

export default function PickModeContextMenu({
  x,
  y,
  featureId,
  onClose,
}: PickModeContextMenuProps) {
  const drawing  = useDrawingStore();
  const transfer = useTransferStore();
  const ref = useRef<HTMLDivElement | null>(null);

  const feature = featureId ? drawing.document.features[featureId] : null;
  const isPicked = !!(featureId && transfer.pickedIds.has(featureId));
  const layerId = feature?.layerId ?? null;
  const layer = layerId ? drawing.document.layers[layerId] : null;
  const rawCode = (feature?.properties?.rawCode as string | undefined) ?? null;

  const picksAtLayer = layerId
    ? Array.from(transfer.pickedIds).filter(
        (id) => drawing.document.features[id]?.layerId === layerId
      )
    : [];
  const picksWithCode = rawCode
    ? Array.from(transfer.pickedIds).filter(
        (id) =>
          (drawing.document.features[id]?.properties?.rawCode as string | undefined) === rawCode
      )
    : [];

  // Close on click outside or Escape.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    // Defer so the right-click that opened the menu doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const item = (label: string, action: () => void, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        action();
        onClose();
      }}
      className={
        'w-full text-left px-3 py-1 text-xs ' +
        (disabled
          ? 'text-gray-600 cursor-not-allowed'
          : 'text-gray-200 hover:bg-gray-700')
      }
    >
      {label}
    </button>
  );

  const divider = (
    <div className="border-t border-gray-700 my-0.5" key="divider" />
  );

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[200px] max-w-[280px] bg-gray-800 border border-gray-700 rounded shadow-xl py-1"
      style={{ left: x, top: y }}
      role="menu"
    >
      {isPicked && (
        <>
          {item('Remove from selection', () => transfer.removePick(featureId!))}
          {layer && picksAtLayer.length > 1 &&
            item(
              `Remove all on layer "${layer.name}" (${picksAtLayer.length})`,
              () => transfer.removePicks(picksAtLayer)
            )}
          {rawCode && picksWithCode.length > 1 &&
            item(
              `Remove all with code "${rawCode}" (${picksWithCode.length})`,
              () => transfer.removePicks(picksWithCode)
            )}
          {divider}
        </>
      )}
      {item(
        `Clear last pick${transfer.pickedIds.size > 0 ? ` (${transfer.pickedIds.size} picked)` : ''}`,
        () => transfer.popLastPick(),
        transfer.pickedIds.size === 0
      )}
      {item(
        'Clear all picks',
        () => transfer.clearPicks(),
        transfer.pickedIds.size === 0
      )}
    </div>
  );
}
