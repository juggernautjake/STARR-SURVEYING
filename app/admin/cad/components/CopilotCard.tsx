'use client';
// app/admin/cad/components/CopilotCard.tsx
//
// Phase 6 §32 Slice 5 — COPILOT proposal card. Renders the head
// proposal from the AIStore queue. The surveyor sees:
//
//   - The proposal's description + confidence.
//   - A sandbox toggle (defaults to sandboxDefault on the
//     proposal, then to the store-wide AIStore.sandbox).
//   - Tool / args summary.
//   - Accept / Modify / Skip buttons.
//
// Accept routes through useAIStore.acceptHeadProposal(sandbox).
// Skip drops the proposal without executing. Modify is a stub
// for Slice 5 (Slice 6 wires it to the real AI re-propose flow).
//
// The card also publishes `cad:copilotPreview` events whenever
// the head proposal changes so CanvasViewport can paint a
// dashed ghost.

import { useEffect, useState } from 'react';
import { Sparkles, X, Check, MessageSquare } from 'lucide-react';
import { useAIStore, useDrawingStore } from '@/lib/cad/store';
import type {
  AddPointArgs,
  DrawLineBetweenArgs,
  DrawPolylineThroughArgs,
} from '@/lib/cad/ai/tool-registry';

export default function CopilotCard() {
  const head = useAIStore((s) => s.proposalQueue[0] ?? null);
  const queueLength = useAIStore((s) => s.proposalQueue.length);
  const storeSandbox = useAIStore((s) => s.sandbox);
  const accept = useAIStore((s) => s.acceptHeadProposal);
  const skip = useAIStore((s) => s.skipHeadProposal);
  // §32 Slice 13 — MANUAL hides every AI entry point, including
  // any card a stale queue might leave behind after a mode flip.
  const aiMode = useAIStore((s) => s.mode);

  // Per-card sandbox override. Reset whenever the head changes
  // so the surveyor's toggle on proposal A doesn't bleed into B.
  const initialSandbox = head?.sandboxDefault ?? storeSandbox;
  const [sandbox, setSandbox] = useState<boolean>(initialSandbox);
  useEffect(() => {
    setSandbox(head?.sandboxDefault ?? storeSandbox);
  }, [head?.id, head?.sandboxDefault, storeSandbox]);

  // Publish the ghost preview whenever the head changes. Clear
  // on unmount / dequeue so the canvas drops the dashed outline.
  useEffect(() => {
    if (!head) {
      window.dispatchEvent(new CustomEvent('cad:copilotPreview', { detail: null }));
      return;
    }
    const detail = buildPreviewDetail(head.toolName, head.args);
    window.dispatchEvent(new CustomEvent('cad:copilotPreview', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('cad:copilotPreview', { detail: null }));
    };
  }, [head]);

  if (!head || aiMode === 'MANUAL') return null;

  const confidencePct = Math.round(head.confidence * 100);
  const confidenceTone =
    head.confidence >= 0.85
      ? 'text-emerald-300'
      : head.confidence >= 0.65
        ? 'text-amber-300'
        : 'text-red-300';

  function handleAccept() {
    const result = accept(sandbox);
    if (result && !result.ok) {
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: { text: `AI proposal failed: ${result.reason}` },
      }));
    }
  }

  function handleSkip() {
    skip();
  }

  function handleModify() {
    // Slice 5 stub. Slice 6 wires this to the real AI re-propose
    // flow (the surveyor types a redirect, the AI re-emits).
    window.dispatchEvent(new CustomEvent('cad:commandOutput', {
      detail: {
        text:
          'COPILOT Modify lands in Slice 6 — for now, Skip and ask the AI to redo via the chat sidebar.',
      },
    }));
  }

  return (
    <div className="fixed top-16 right-4 z-40 w-[360px] pointer-events-auto">
      <div
        className="bg-gray-800 border border-blue-600/60 rounded-lg shadow-2xl overflow-hidden animate-[scaleIn_180ms_cubic-bezier(0.16,1,0.3,1)]"
        role="dialog"
        aria-label="AI proposal card"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-blue-700/40 bg-blue-900/30">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-blue-300" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-200">
              AI Proposal
            </span>
            <span className="text-[10px] text-blue-400/80 font-mono">{head.toolName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-semibold ${confidenceTone}`}>
              {confidencePct}%
            </span>
            {queueLength > 1 && (
              <span
                className="text-[10px] text-gray-400 bg-gray-900 border border-gray-700 rounded px-1.5 py-[1px]"
                title={`${queueLength} proposals queued; next will appear after Accept / Skip.`}
              >
                +{queueLength - 1} more
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-3 space-y-2 text-[12px] text-gray-200">
          <p className="leading-snug">{head.description}</p>
          <ArgsSummary toolName={head.toolName} args={head.args} />

          {/* Sandbox toggle */}
          <label
            className="flex items-center gap-2 text-[11px] text-gray-400 select-none cursor-pointer hover:text-gray-200"
            title="When ON, the AI writes to a DRAFT__<target> layer for review before promoting back to the real target."
          >
            <input
              type="checkbox"
              checked={sandbox}
              onChange={(e) => setSandbox(e.target.checked)}
              className="accent-amber-500 w-3 h-3"
            />
            Write to sandbox layer (DRAFT__*)
          </label>
        </div>

        {/* Footer — Accept / Modify / Skip */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-700 bg-gray-900/50">
          <button
            type="button"
            onClick={handleSkip}
            className="px-2.5 py-1 text-[11px] bg-gray-800 border border-gray-600 text-gray-300 rounded hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-1"
            title="Drop this proposal without executing (the next one in the queue, if any, shows up after)."
          >
            <X size={12} /> Skip
          </button>
          <button
            type="button"
            onClick={handleModify}
            className="px-2.5 py-1 text-[11px] bg-gray-800 border border-gray-600 text-gray-300 rounded hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-1"
            title="Ask the AI to revise this proposal (Slice 6)."
          >
            <MessageSquare size={12} /> Modify
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="ml-auto px-3 py-1 text-[11px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-1 font-semibold"
            title="Run the proposed tool call now."
          >
            <Check size={12} /> Accept
          </button>
        </div>
      </div>
    </div>
  );
}

function ArgsSummary(props: { toolName: string; args: unknown }) {
  // Compact, surveyor-readable args summary. Falls back to JSON
  // for unknown shapes so the card always shows *something*.
  if (props.toolName === 'addPoint') {
    const a = props.args as AddPointArgs;
    return (
      <div className="text-[11px] font-mono text-gray-400 bg-gray-900 border border-gray-700 rounded px-2 py-1">
        ({a.x.toFixed(2)}, {a.y.toFixed(2)})
        {a.code ? ` • code ${a.code}` : ''}
        {a.layerId ? ` • layer ${a.layerId.slice(0, 6)}` : ''}
      </div>
    );
  }
  if (props.toolName === 'drawLineBetween') {
    const a = props.args as DrawLineBetweenArgs;
    return (
      <div className="text-[11px] font-mono text-gray-400 bg-gray-900 border border-gray-700 rounded px-2 py-1">
        ({a.from.x.toFixed(2)}, {a.from.y.toFixed(2)}) → ({a.to.x.toFixed(2)}, {a.to.y.toFixed(2)})
      </div>
    );
  }
  if (props.toolName === 'drawPolylineThrough') {
    const a = props.args as DrawPolylineThroughArgs;
    return (
      <div className="text-[11px] font-mono text-gray-400 bg-gray-900 border border-gray-700 rounded px-2 py-1">
        {a.closed ? 'POLYGON' : 'POLYLINE'} • {a.points.length} vertices
      </div>
    );
  }
  return (
    <pre className="text-[10px] font-mono text-gray-400 bg-gray-900 border border-gray-700 rounded p-2 max-h-32 overflow-y-auto">
      {JSON.stringify(props.args, null, 2)}
    </pre>
  );
}

function buildPreviewDetail(toolName: string, args: unknown):
  | { kind: 'POINT' | 'LINE' | 'POLYLINE' | 'POLYGON'; point?: { x: number; y: number }; from?: { x: number; y: number }; to?: { x: number; y: number }; vertices?: { x: number; y: number }[]; color?: string }
  | null {
  // We resolve a colour from the active layer so the ghost
  // reads visually like the target layer (per §32.3 sandbox
  // styling). Falls back to amber when none is set.
  const drawing = useDrawingStore.getState();
  const activeLayer = drawing.document.layers[drawing.activeLayerId];
  const color = activeLayer?.color ?? '#fbbf24';

  if (toolName === 'addPoint') {
    const a = args as AddPointArgs;
    return { kind: 'POINT', point: { x: a.x, y: a.y }, color };
  }
  if (toolName === 'drawLineBetween') {
    const a = args as DrawLineBetweenArgs;
    return { kind: 'LINE', from: a.from, to: a.to, color };
  }
  if (toolName === 'drawPolylineThrough') {
    const a = args as DrawPolylineThroughArgs;
    return {
      kind: a.closed ? 'POLYGON' : 'POLYLINE',
      vertices: a.points,
      color,
    };
  }
  // Layer-op proposals don't paint a ghost — surveyor sees the
  // result in the layer panel after Accept.
  return null;
}
