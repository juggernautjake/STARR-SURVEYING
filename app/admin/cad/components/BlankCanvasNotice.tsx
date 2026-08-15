'use client';
// app/admin/cad/components/BlankCanvasNotice.tsx
//
// C25 — the indicator that reaches the person who needs it.
//
// The status-bar pill is correct (C24) and clickable, and it only removes the "where did my
// linework go" failure for a surveyor who thinks to look at the status bar. **The person most
// likely to miss a small amber number in the corner is the one staring at an empty canvas**, which
// is exactly when the answer matters most: a drawing opened with a saved layer state that turns
// everything off, or an isolate left on from yesterday, looks identical to a drawing that failed
// to load.
//
// So when the document has features and none of them are visible, say so on the canvas, name what
// is doing it, and put the fix one click away.
//
// Deliberately NOT shown for a partially hidden drawing. A notice that appears whenever anything is
// hidden would be on screen most of the time — hiding things is a normal part of drafting — and a
// warning you see constantly is one you stop reading. The pill covers that case; this covers the
// case the pill cannot.

import { EyeOff } from 'lucide-react';

import { useDrawingStore } from '@/lib/cad/store';
import { hiddenSummary, describeHidden } from '@/lib/cad/visibility';

export default function BlankCanvasNotice() {
  const features = useDrawingStore((s) => s.document.features);
  const layers = useDrawingStore((s) => s.document.layers);

  const summary = hiddenSummary(Object.values(features), layers);
  if (!summary.blankButNotEmpty) return null;

  const detail = describeHidden(summary);

  return (
    <div
      className="absolute inset-x-0 top-16 z-30 flex justify-center pointer-events-none"
      data-testid="blank-canvas-notice"
    >
      <div className="pointer-events-auto max-w-md rounded-lg border border-amber-500/60 bg-gray-900/95 px-4 py-3 shadow-2xl">
        <div className="flex items-start gap-2.5">
          <EyeOff size={16} className="mt-0.5 shrink-0 text-amber-300" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-200">
              Everything in this drawing is hidden
            </p>
            <p className="mt-0.5 text-xs text-gray-300">
              {/* The count first, because "the drawing is empty" and "the drawing has 4,012
                  features you cannot see" are different problems and only one of them is this. */}
              {summary.totalFeatures} feature{summary.totalFeatures === 1 ? '' : 's'} are here —
              none are on screen.
            </p>
            {detail && (
              <p className="mt-0.5 text-[11px] text-gray-400">{detail}</p>
            )}
            <button
              type="button"
              className="mt-2 h-7 rounded bg-amber-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-amber-500"
              onClick={() => window.dispatchEvent(new CustomEvent('cad:toggleHiddenItems'))}
              data-testid="blank-canvas-notice-open"
            >
              Show me what is hidden
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
