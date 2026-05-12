'use client';
// app/admin/cad/components/AIProvenancePopup.tsx
//
// Phase 6 §32.7 — provenance-only fallback for the "Why did AI
// draw this?" right-click action. Mounted alongside the full
// §30.3 ElementExplanationPopup; whichever has the data
// renders. The two popups never show together because:
//
//   - ElementExplanationPopup renders only when the pipeline
//     result has a full `explanations[featureId]` entry.
//   - AIProvenancePopup renders only when there's no such
//     entry but the feature carries `aiOrigin` stamps from a
//     tool-registry call.
//
// Surveyors see the same "open" event for both paths
// (`useAIStore.openExplanation(featureId)`), so the right-
// click menu doesn't need to know which one will mount.

import { useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useAIStore, useDrawingStore } from '@/lib/cad/store';
import { readProvenance } from '@/lib/cad/ai/provenance';

export default function AIProvenancePopup() {
  const featureId = useAIStore((s) => s.explanationFeatureId);
  const close = useAIStore((s) => s.closeExplanation);
  const result = useAIStore((s) => s.result);
  const feature = useDrawingStore((s) =>
    featureId ? s.getFeature(featureId) : null,
  );

  // Esc closes — same as the full popup.
  useEffect(() => {
    if (!featureId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [featureId, close]);

  if (!featureId || !feature) return null;
  const provenance = readProvenance(feature.properties);
  if (!provenance) return null;
  // Give the full explanation popup precedence when both have
  // data for the same feature.
  if (result?.explanations[featureId]) return null;

  const confidencePct = Math.round(provenance.aiConfidence * 100);
  const shortHash =
    provenance.aiPromptHash.length > 12
      ? `${provenance.aiPromptHash.slice(0, 12)}…`
      : provenance.aiPromptHash;
  const shortBatch =
    provenance.aiBatchId.length > 12
      ? `${provenance.aiBatchId.slice(0, 12)}…`
      : provenance.aiBatchId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI feature provenance"
        className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-[440px] m-4 text-sm text-gray-200 overflow-hidden animate-[scaleIn_180ms_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-600 bg-gray-750">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-300" />
            <h2 className="font-semibold text-white">Why did AI draw this?</h2>
          </div>
          <button onClick={close} className="text-gray-400 hover:text-white transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 text-[12px]">
          <Row label="Origin" value={provenance.aiOrigin} mono />
          <Row label="Confidence" value={`${confidencePct}%`} accent={confidenceColor(provenance.aiConfidence)} />
          <Row label="Prompt hash" value={shortHash} mono title={provenance.aiPromptHash} />
          <Row label="Batch id" value={shortBatch} mono title={provenance.aiBatchId} />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Source points ({provenance.aiSourcePoints.length})
            </div>
            {provenance.aiSourcePoints.length === 0 ? (
              <p className="text-gray-500 italic text-[11px]">
                The AI did not cite any specific points for this feature.
              </p>
            ) : (
              <ul className="font-mono text-[11px] text-gray-300 space-y-0.5 max-h-32 overflow-y-auto">
                {provenance.aiSourcePoints.map((id) => (
                  <li key={id} className="px-1.5 py-[1px] rounded bg-gray-900 border border-gray-700">
                    {id}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[10px] text-gray-500 italic leading-relaxed">
            Run the full AI Drawing Engine for the reasoning, weighted data sources, assumptions, and confidence breakdown.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-3 border-t border-gray-600 bg-gray-900/40">
          <button
            onClick={close}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row(props: { label: string; value: string; mono?: boolean; accent?: string; title?: string }) {
  return (
    <div className="flex items-baseline gap-2" title={props.title}>
      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold w-24 shrink-0">
        {props.label}
      </span>
      <span
        className={`flex-1 ${props.mono ? 'font-mono text-[11px]' : 'text-[12px]'} ${props.accent ?? 'text-gray-200'}`}
      >
        {props.value}
      </span>
    </div>
  );
}

function confidenceColor(c: number): string {
  if (c >= 0.85) return 'text-emerald-300';
  if (c >= 0.65) return 'text-amber-300';
  return 'text-red-300';
}
