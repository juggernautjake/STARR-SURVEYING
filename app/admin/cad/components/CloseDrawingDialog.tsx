'use client';
// app/admin/cad/components/CloseDrawingDialog.tsx
//
// CAD_POINTS_AND_AI slice E — "Close Drawing" dialogue.
//
// Use case (user): a building perimeter that the surveyor measured
// in the field but whose edges don't quite meet at the start. The
// dialogue runs a misclosure report on the current POLYLINE /
// POLYGON selection, lets the surveyor preview a Bowditch (compass-
// rule) or transit-rule adjustment, and on accept commits the
// adjusted vertices as a closed POLYGON via the AI proposal queue
// (so it inherits ghost-preview + Accept/Skip from CopilotCard).

import { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, Sparkles, AlertTriangle } from 'lucide-react';

import ModalFrame from '@/app/admin/components/ui/ModalFrame';
import { useAIStore, useDrawingStore, useSelectionStore } from '@/lib/cad/store';
import type { Point2D } from '@/lib/cad/types';
import { vertexClosure, vertexBowditchAdjust } from '@/lib/cad/geometry/closure';
import { buildSolverPolylineProposal } from '@/lib/cad/ai/solver-proposal';
import { formatBearing } from '@/lib/cad/geometry/bearing';

type Method = 'NONE' | 'BOWDITCH';

interface Props { onClose: () => void }

export default function CloseDrawingDialog({ onClose }: Props): React.ReactElement {
  const [method, setMethod] = useState<Method>('BOWDITCH');
  const [error, setError] = useState<string | null>(null);

  // Pull the vertices of the single selected polyline/polygon.
  const vertices = useSelectedPolylineVertices();
  const closure = useMemo(() => (vertices.length >= 2 ? vertexClosure(vertices) : null), [vertices]);
  const adjusted = useMemo(() => {
    if (method !== 'BOWDITCH' || vertices.length < 2) return null;
    return vertexBowditchAdjust(vertices);
  }, [vertices, method]);

  // Publish a ghost preview of the adjusted vertices so the canvas
  // paints the corrected polygon next to the original. Uses the
  // same `cad:copilotPreview` channel as the CopilotCard.
  useEffect(() => {
    if (!adjusted) {
      window.dispatchEvent(new CustomEvent('cad:copilotPreview', { detail: null }));
      return;
    }
    window.dispatchEvent(new CustomEvent('cad:copilotPreview', {
      detail: { kind: 'POLYGON', vertices: adjusted, color: '#22d3ee' },
    }));
    return () => {
      window.dispatchEvent(new CustomEvent('cad:copilotPreview', { detail: null }));
    };
  }, [adjusted]);

  function suggest(): void {
    if (!adjusted || adjusted.length < 2) {
      setError('Compute an adjustment first.');
      return;
    }
    const proposal = buildSolverPolylineProposal({
      vertices: adjusted,
      closed: true,
      originLabel: 'Close drawing (Bowditch)',
    });
    useAIStore.getState().enqueueProposal(proposal);
    onClose();
  }

  return (
    <ModalFrame
      open
      onClose={onClose}
      title={<span className="flex items-center gap-2"><RefreshCcw size={14} className="text-cyan-500" />Close Drawing</span>}
      initialWidth={520}
      initialHeight={460}
      minWidth={360}
      minHeight={260}
    >
      <div className="text-gray-200">
        <div className="p-4 space-y-3 text-xs">
          {vertices.length < 2 && (
            <div className="rounded border border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 px-2 py-1 flex items-start gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>Select a polyline or polygon feature first. The dialogue closes its perimeter back to its first vertex.</span>
            </div>
          )}

          {closure && (
            <div className="rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 p-2 space-y-1" data-testid="closure-report">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
                <span className="text-gray-500">Linear error</span>
                <span>{closure.linearError.toFixed(4)} ft</span>
                <span className="text-gray-500">Δ East</span>
                <span>{closure.errorEast >= 0 ? '+' : ''}{closure.errorEast.toFixed(4)}</span>
                <span className="text-gray-500">Δ North</span>
                <span>{closure.errorNorth >= 0 ? '+' : ''}{closure.errorNorth.toFixed(4)}</span>
                <span className="text-gray-500">Error bearing</span>
                <span>{formatBearing(closure.errorBearingDeg)}</span>
                <span className="text-gray-500">Perimeter</span>
                <span>{closure.totalDistance.toFixed(2)} ft</span>
                <span className="text-gray-500">Precision</span>
                <span className={`font-semibold ${closure.precisionDenominator >= 10000 ? 'text-emerald-600' : closure.precisionDenominator >= 5000 ? 'text-amber-600' : 'text-red-600'}`}>
                  {closure.precisionRatio}
                </span>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                The closing edge runs from <span className="font-mono">({closure.closingFrom.x.toFixed(2)}, {closure.closingFrom.y.toFixed(2)})</span> back to <span className="font-mono">({closure.closingTo.x.toFixed(2)}, {closure.closingTo.y.toFixed(2)})</span>.
              </div>
            </div>
          )}

          {closure && (
            <label className="block">
              <span className="text-gray-600 dark:text-gray-300 font-medium">Adjustment method</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                data-testid="closure-method"
              >
                <option value="NONE">None — report only, don&apos;t adjust</option>
                <option value="BOWDITCH">Bowditch (compass rule)</option>
              </select>
            </label>
          )}

          {adjusted && (
            <div className="rounded border border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30 text-cyan-800 dark:text-cyan-100 px-2 py-1" data-testid="closure-adjusted">
              <strong>{adjusted.length} vertices</strong> adjusted (Bowditch). The corrected polygon is shown as a cyan ghost on the canvas. Click <em>Suggest</em> to enqueue it as a proposal — review + Accept on the AI Proposal card to commit.
            </div>
          )}

          {error && (
            <div className="rounded border border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-200 px-2 py-1" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button onClick={suggest} disabled={!adjusted} className="px-3 py-1.5 text-xs bg-cyan-600 text-white rounded disabled:opacity-40 hover:bg-cyan-500 flex items-center gap-1" data-testid="closure-suggest">
            <Sparkles size={12} /> Suggest as ghost
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function useSelectedPolylineVertices(): Point2D[] {
  const ids = useSelectionStore((s) => s.selectedIds);
  const docVersion = useDrawingStore((s) => s.document.id);
  return useMemo(() => {
    void docVersion;
    const drawing = useDrawingStore.getState();
    for (const id of ids) {
      const f = drawing.getFeature(id);
      if (!f) continue;
      if (f.geometry.type === 'POLYLINE' || f.geometry.type === 'POLYGON') {
        return (f.geometry as { vertices: Point2D[] }).vertices.map((v) => ({ x: v.x, y: v.y }));
      }
    }
    return [];
  }, [ids, docVersion]);
}
