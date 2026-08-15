'use client';
// app/admin/cad/components/IsolateBadge.tsx
//
// C26 — the mode has to be visible while it is on.
//
// Isolate used to leave no trace at all: layers went off, nothing said why, and the only exit was
// "Show All Layers" three menus away — which was not an exit, because it also turned on layers the
// surveyor had deliberately switched off before isolating. C25's blank-canvas notice named the
// symptom out loud: "an isolate left on from yesterday looks identical to a drawing that failed to
// load."
//
// So: a badge on the canvas naming what is isolated, with one obvious control to leave it.

import { Focus, X } from 'lucide-react';

import { useDrawingStore } from '@/lib/cad/store';
import { describeIsolate, isIsolateCurrent, layersAddedDuringIsolate } from '@/lib/cad/isolate';

export default function IsolateBadge() {
  const isolate = useDrawingStore((s) => s.document.isolate);
  const layers = useDrawingStore((s) => s.document.layers);
  const exitIsolate = useDrawingStore((s) => s.exitIsolate);

  if (!isolate) return null;

  // A surveyor can leave isolate the long way round — turning layers back on by hand, or pressing
  // "Show All Layers". Once they have, this badge is lying, and its exit button would HIDE layers
  // they just chose to show. Rendering nothing is the honest answer; the stale session is cleared
  // the next time isolate is entered or exited.
  if (!isIsolateCurrent(isolate, layers)) return null;

  const added = layersAddedDuringIsolate(isolate, layers).length;

  return (
    <div
      className="absolute left-1/2 top-3 z-30 -translate-x-1/2"
      data-testid="isolate-badge"
    >
      <div className="flex items-center gap-2 rounded-full border border-blue-500/70 bg-gray-900/95 py-1 pl-3 pr-1.5 shadow-xl">
        <Focus size={12} className="shrink-0 text-blue-300" />
        <span className="text-xs text-blue-100">{describeIsolate(isolate, layers)}</span>
        {added > 0 && (
          <span
            className="text-[10px] text-gray-400"
            // Otherwise a layer created during isolate stays visible after the exit and looks like
            // the restore missed one.
            title={`${added} layer${added === 1 ? '' : 's'} created since isolating will stay as they are`}
          >
            +{added} new
          </span>
        )}
        <button
          type="button"
          className="flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-blue-500"
          onClick={exitIsolate}
          data-testid="isolate-badge-exit"
          title="Restore the layer visibility from before this isolate"
        >
          <X size={10} />
          Exit
        </button>
      </div>
    </div>
  );
}
