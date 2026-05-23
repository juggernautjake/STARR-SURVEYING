'use client';
// app/admin/cad/components/SketchReconcileDialog.tsx
//
// CAD_POINTS_AND_AI slice F — hand-drawn sketch reconciliation UI.
// Surveyor uploads a photo of their field sketch (PNG / JPEG /
// WebP, ≤ 8 MB), optionally types notes, and clicks Analyze. The
// dialog POSTs to /api/admin/cad/sketch-reconcile along with the
// currently-loaded POINT features so the AI has the collected
// coordinates to anchor against. The result is a suggested closed
// polygon that flows through the CopilotCard as a ghost preview —
// surveyor accepts (commits) or skips (clears).

import { useMemo, useRef, useState } from 'react';
import { X, Upload, Sparkles, AlertTriangle } from 'lucide-react';
import { useAIStore, useDrawingStore } from '@/lib/cad/store';
import { buildSolverPolylineProposal } from '@/lib/cad/ai/solver-proposal';
import type { Feature } from '@/lib/cad/types';

interface Props { onClose: () => void }
type Phase = 'idle' | 'uploading' | 'success' | 'error';

interface SketchResult {
  vertices: Array<{ x: number; y: number }>;
  edgeLabels: Array<{ fromIndex: number; toIndex: number; label: string }>;
  narrative: string;
  confidence: number;
}

export default function SketchReconcileDialog({ onClose }: Props): React.ReactElement {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SketchResult | null>(null);

  // Pull every POINT feature from the drawing so the AI gets the
  // full collected-point cloud as anchor coordinates.
  const collectedPoints = useMemo(() => {
    const drawing = useDrawingStore.getState();
    const out: Array<{ name: string; x: number; y: number }> = [];
    for (const f of Object.values(drawing.document.features) as Feature[]) {
      if (f.geometry.type !== 'POINT') continue;
      const p = (f.geometry as { type: 'POINT'; position: { x: number; y: number } }).position;
      const rawName = f.properties?.pointName;
      out.push({
        name: typeof rawName === 'string' ? rawName : f.id.slice(0, 8),
        x: p.x,
        y: p.y,
      });
    }
    return out;
  }, []);

  async function analyze(): Promise<void> {
    if (!file) {
      setError('Choose a sketch image first.');
      return;
    }
    setPhase('uploading');
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append('sketch', file);
      body.append('collectedPoints', JSON.stringify(collectedPoints));
      if (notes.trim()) body.append('notes', notes.trim());
      const res = await fetch('/api/admin/cad/sketch-reconcile', { method: 'POST', body });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      setResult(payload.result as SketchResult);
      setPhase('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sketch analysis failed.');
      setPhase('error');
    }
  }

  function suggest(): void {
    if (!result) return;
    const proposal = buildSolverPolylineProposal({
      vertices: result.vertices,
      closed: true,
      originLabel: 'Sketch reconciliation',
      confidence: result.confidence,
    });
    useAIStore.getState().enqueueProposal(proposal);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto" role="dialog" aria-label="Sketch reconciliation">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-purple-500" />
            <h2 className="text-sm font-semibold">Reconcile Hand Sketch</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <div className="rounded border border-blue-300 dark:border-blue-700/50 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 px-2 py-1.5">
            Upload a photo of your field sketch (PNG / JPEG / WebP, ≤ 8 MB). The AI reads the drawn outline + any written measurements and proposes a closed polygon anchored against the <strong>{collectedPoints.length}</strong> point{collectedPoints.length === 1 ? '' : 's'} currently in this drawing. The proposal is rendered as a ghost — nothing persists until you accept it on the AI Proposal card.
          </div>

          <label className="block">
            <span className="text-gray-600 dark:text-gray-300 font-medium">Sketch image</span>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs"
              data-testid="sketch-file"
            />
            {file && (
              <p className="mt-1 text-[10px] text-gray-500">
                Selected: <span className="font-mono">{file.name}</span> ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </label>

          <label className="block">
            <span className="text-gray-600 dark:text-gray-300 font-medium">Notes for the AI (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800"
              placeholder="e.g. The garage corner labelled GC was not shot; we got points on the porch and the back wall. The sketch is rotated about 30° clockwise from true north."
              data-testid="sketch-notes"
            />
          </label>

          {phase === 'uploading' && (
            <div className="rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-200 px-2 py-1">
              Analyzing sketch with Claude Vision… this can take 15–30 s.
            </div>
          )}

          {error && (
            <div className="rounded border border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-200 px-2 py-1 flex items-start gap-1.5" role="alert">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="rounded border border-purple-400 bg-purple-50 dark:bg-purple-950/30 text-purple-900 dark:text-purple-100 px-2 py-2 space-y-1" data-testid="sketch-result">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Suggested {result.vertices.length}-vertex polygon</span>
                <span className="font-mono text-[11px]">
                  confidence {(result.confidence * 100).toFixed(0)}%
                </span>
              </div>
              {result.narrative && <p className="text-[11px]">{result.narrative}</p>}
              {result.edgeLabels.length > 0 && (
                <ul className="text-[10px] list-disc pl-4">
                  {result.edgeLabels.slice(0, 8).map((e, i) => (
                    <li key={i}>
                      v{e.fromIndex} → v{e.toIndex}: <span className="font-mono">{e.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button onClick={analyze} disabled={!file || phase === 'uploading'} className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded disabled:opacity-40 hover:bg-gray-600" data-testid="sketch-analyze">
              {phase === 'uploading' ? 'Analyzing…' : 'Analyze'}
            </button>
            <button onClick={suggest} disabled={!result} className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded disabled:opacity-40 hover:bg-purple-500 flex items-center gap-1" data-testid="sketch-suggest">
              <Sparkles size={12} /> Suggest as ghost
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
