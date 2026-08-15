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
import { Sparkles, X, Check, MessageSquare, Loader2 } from 'lucide-react';
import { useAIStore, useDrawingStore } from '@/lib/cad/store';
import { drawableLayerIds } from '@/lib/cad/styles/default-layers';
import { buildPreviewShapes } from '@/lib/cad/ai/preview';
import type {
  AddPointArgs,
  DrawLineBetweenArgs,
  DrawPolylineThroughArgs,
  DrawRectangleArgs,
  DrawCircleArgs,
  DrawArcArgs,
  DrawTextArgs,
  MoveFeaturesArgs,
  RotateFeaturesArgs,
  ScaleFeaturesArgs,
  DeleteFeaturesArgs,
} from '@/lib/cad/ai/tool-registry';

/** Geometry proposals that land on a layer (get the layer picker).
 *
 *  C38 — the four C34 drawing tools join the original three. The modify family does NOT: those act
 *  on features that already have a home, and offering "add to layer" there would read as an offer
 *  to move them between layers, which is not what accepting the card would do. */
const LAYER_TOOLS = new Set([
  'addPoint', 'drawLineBetween', 'drawPolylineThrough',
  'drawRectangle', 'drawCircle', 'drawArc', 'drawText',
]);

/** Proposals that act on features already on the drawing (summarised by count, not coordinates). */
const MODIFY_TOOLS = new Set([
  'moveFeatures', 'rotateFeatures', 'scaleFeatures', 'mirrorFeatures', 'deleteFeatures',
]);

/** Human, specific "here's exactly what I did" line for the chat log. */
function describeApplied(toolName: string, args: unknown, layerName: string): string {
  if (toolName === 'addPoint') {
    const a = args as AddPointArgs;
    return `✓ Added a point at (${a.x.toFixed(2)}, ${a.y.toFixed(2)})${a.code ? ` coded ${a.code}` : ''} on layer “${layerName}”.`;
  }
  if (toolName === 'drawLineBetween') {
    const a = args as DrawLineBetweenArgs;
    const len = Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
    return `✓ Drew a line (${len.toFixed(2)} ft) from (${a.from.x.toFixed(2)}, ${a.from.y.toFixed(2)}) to (${a.to.x.toFixed(2)}, ${a.to.y.toFixed(2)}) on layer “${layerName}”.`;
  }
  if (toolName === 'drawPolylineThrough') {
    const a = args as DrawPolylineThroughArgs;
    return `✓ Drew a ${a.closed ? 'polygon' : 'polyline'} through ${a.points.length} vertices on layer “${layerName}”.`;
  }
  if (toolName === 'drawRectangle') {
    const a = args as DrawRectangleArgs;
    const w = Math.abs(a.opposite.x - a.corner.x);
    const h = Math.abs(a.opposite.y - a.corner.y);
    return `✓ Drew a ${w.toFixed(2)} × ${h.toFixed(2)} ft rectangle on layer “${layerName}”.`;
  }
  if (toolName === 'drawCircle') {
    const a = args as DrawCircleArgs;
    return `✓ Drew a circle of radius ${a.radius.toFixed(2)} ft at (${a.center.x.toFixed(2)}, ${a.center.y.toFixed(2)}) on layer “${layerName}”.`;
  }
  if (toolName === 'drawArc') {
    const a = args as DrawArcArgs;
    return `✓ Drew an arc from (${a.start.x.toFixed(2)}, ${a.start.y.toFixed(2)}) to (${a.end.x.toFixed(2)}, ${a.end.y.toFixed(2)}) on layer “${layerName}”.`;
  }
  if (toolName === 'drawText') {
    const a = args as DrawTextArgs;
    return `✓ Placed the note “${a.text}” at (${a.at.x.toFixed(2)}, ${a.at.y.toFixed(2)}) on layer “${layerName}”.`;
  }
  if (toolName === 'moveFeatures') {
    const a = args as MoveFeaturesArgs;
    return `✓ Moved ${a.ids.length} feature(s) by ${a.dx.toFixed(2)} ft east and ${a.dy.toFixed(2)} ft north.`;
  }
  if (toolName === 'rotateFeatures') {
    const a = args as RotateFeaturesArgs;
    return `✓ Rotated ${a.ids.length} feature(s) ${a.angleDeg.toFixed(4)}°.`;
  }
  if (toolName === 'scaleFeatures') {
    const a = args as ScaleFeaturesArgs;
    return `✓ Scaled ${a.ids.length} feature(s) by ×${a.factor}.`;
  }
  if (toolName === 'mirrorFeatures') {
    const a = args as { ids: string[] };
    return `✓ Mirrored ${a.ids.length} feature(s).`;
  }
  if (toolName === 'deleteFeatures') {
    const a = args as DeleteFeaturesArgs;
    // Named as reversible on the spot: a delete the surveyor approved is still a delete they may
    // have approved too fast, and the recovery is one keystroke away.
    return `✓ Deleted ${a.ids.length} feature(s). Ctrl+Z puts them back.`;
  }
  return `✓ Applied ${toolName}.`;
}

export default function CopilotCard() {
  const head = useAIStore((s) => s.proposalQueue[0] ?? null);
  const queueLength = useAIStore((s) => s.proposalQueue.length);
  const storeSandbox = useAIStore((s) => s.sandbox);
  const accept = useAIStore((s) => s.acceptHeadProposal);
  const skip = useAIStore((s) => s.skipHeadProposal);
  // §32 Slice 13 — MANUAL hides every AI entry point, including
  // any card a stale queue might leave behind after a mode flip.
  const aiMode = useAIStore((s) => s.mode);
  // Subscribe to the layer catalog so the picker + ghost color update live.
  const layers = useDrawingStore((s) => s.document.layers);
  const layerOrder = useDrawingStore((s) => s.document.layerOrder);
  const activeLayerId = useDrawingStore((s) => s.activeLayerId);

  // While a proposal is being applied, swap the buttons for a spinner.
  const [isApplying, setIsApplying] = useState(false);

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
    // C38 — the builder moved to lib/cad/ai/preview.ts and returns a LIST, because a modify
    // proposal ghosts every feature it touches, not one shape.
    const drawing = useDrawingStore.getState();
    const detail = buildPreviewShapes(
      head.toolName,
      head.args,
      drawing.document,
      drawing.activeLayerId,
    );
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
    if (isApplying || !head) return;
    // Capture the details before the queue dequeues so the result
    // message is accurate even as the next proposal slides in.
    const proposal = head;
    const targetLayerId = (proposal.args as { layerId?: string }).layerId ?? activeLayerId;
    const layerName = layers[targetLayerId]?.name ?? 'active layer';
    setIsApplying(true);
    // Defer one frame so the spinner paints before the (synchronous) commit.
    setTimeout(() => {
      const result = accept(sandbox);
      const ts = new Date().toISOString();
      if (result && !result.ok) {
        useAIStore.getState().appendCopilotMessage({
          id: `m${Date.now().toString(36)}`, role: 'SYSTEM',
          content: `⚠ Couldn't apply: ${result.reason}`, ts,
        });
      } else {
        useAIStore.getState().appendCopilotMessage({
          id: `m${Date.now().toString(36)}`, role: 'AI',
          content: describeApplied(proposal.toolName, proposal.args, layerName), ts,
        });
      }
      setIsApplying(false);
    }, 220);
  }

  function handleSkip() {
    skip();
  }

  function handleModify() {
    // Phase 6 §32 Slice 14 — Skip the current proposal so it
    // doesn't auto-execute on the next AUTO tick, then open the
    // sidebar with a "Revise this" prompt naming the original
    // proposal. The surveyor edits + sends (Ctrl+Enter); the
    // AI re-emits a fresh proposal via `proposeFromPrompt`.
    const original = head;
    if (!original) return;
    skip();
    const revise =
      `Revise the last proposal — ${original.toolName}: "${original.description}". ` +
      'I need it changed because: ';
    useAIStore.getState().openCopilotWithPrompt(revise);
    window.dispatchEvent(new CustomEvent('cad:focusAICopilot'));
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

          {/* Target-layer picker — choose where the suggested element
              lands before accepting. */}
          {LAYER_TOOLS.has(head.toolName) && (
            <label className="flex items-center gap-2 text-[11px] text-gray-300">
              <span className="text-gray-400 shrink-0">Add to layer</span>
              <select
                value={(head.args as { layerId?: string }).layerId ?? activeLayerId}
                onChange={(e) => useAIStore.getState().setHeadProposalLayerId(e.target.value)}
                disabled={isApplying}
                className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded px-1.5 py-1 text-[11px] text-white outline-none focus:border-blue-500"
              >
                {/* CAD_AUDIT Slice S13l — fourteenth destination site. This picks where the AI's
                    proposed geometry LANDS when the surveyor accepts it, so the reserved sheet-info
                    layer is excluded like every other destination. Worth noting it is the only one
                    reached without the surveyor choosing a layer at all: accept the proposal and the
                    default applies. */}
                {drawableLayerIds(
                  layerOrder,
                  (head.args as { layerId?: string }).layerId ?? activeLayerId,
                ).map((id) => {
                  const l = layers[id];
                  if (!l) return null;
                  return <option key={id} value={id}>{l.name}</option>;
                })}
              </select>
            </label>
          )}

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

        {/* Footer — Accept / Modify / Skip, or a working spinner */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-700 bg-gray-900/50">
          {isApplying ? (
            <span className="flex items-center gap-2 text-[11px] text-blue-300 font-semibold mx-auto py-0.5">
              <Loader2 size={13} className="animate-spin" /> Applying the change…
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSkip}
                className="px-3 py-1 text-[11px] bg-gray-800 border border-gray-600 text-gray-300 rounded hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-1"
                title="Drop this proposal without executing (the next one in the queue, if any, shows up after)."
              >
                <X size={12} /> Skip
              </button>
              <button
                type="button"
                onClick={handleModify}
                className="px-3 py-1 text-[11px] bg-gray-800 border border-gray-600 text-gray-300 rounded hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-1"
                title="Skip this proposal and open the chat so you can ask the AI to revise it."
              >
                <MessageSquare size={12} /> Modify
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="ml-auto px-3 py-1 text-[11px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-1 font-semibold"
                title="Run the proposed tool call now."
              >
                <Check size={12} /> Apply
              </button>
            </>
          )}
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
  // C38 — the C34 drawing tools and the C35 modify family. Before this they all fell through to the
  // JSON dump below, which is exactly as readable as it sounds when the question is "should I let
  // the AI delete these forty things".
  if (props.toolName === 'drawRectangle') {
    const a = props.args as DrawRectangleArgs;
    return (
      <div className="text-[11px] font-mono text-gray-400 bg-gray-900 border border-gray-700 rounded px-2 py-1">
        {Math.abs(a.opposite.x - a.corner.x).toFixed(2)} × {Math.abs(a.opposite.y - a.corner.y).toFixed(2)} ft
      </div>
    );
  }
  if (props.toolName === 'drawCircle') {
    const a = props.args as DrawCircleArgs;
    return (
      <div className="text-[11px] font-mono text-gray-400 bg-gray-900 border border-gray-700 rounded px-2 py-1">
        ⌀ {(a.radius * 2).toFixed(2)} ft • centre ({a.center.x.toFixed(2)}, {a.center.y.toFixed(2)})
      </div>
    );
  }
  if (props.toolName === 'drawArc') {
    const a = props.args as DrawArcArgs;
    return (
      <div className="text-[11px] font-mono text-gray-400 bg-gray-900 border border-gray-700 rounded px-2 py-1">
        ({a.start.x.toFixed(2)}, {a.start.y.toFixed(2)}) ⌒ ({a.end.x.toFixed(2)}, {a.end.y.toFixed(2)})
      </div>
    );
  }
  if (props.toolName === 'drawText') {
    const a = props.args as DrawTextArgs;
    return (
      <div className="text-[11px] font-mono text-gray-400 bg-gray-900 border border-gray-700 rounded px-2 py-1 truncate">
        “{a.text}” @ ({a.at.x.toFixed(2)}, {a.at.y.toFixed(2)})
      </div>
    );
  }
  if (MODIFY_TOOLS.has(props.toolName)) {
    const a = props.args as { ids?: string[]; dx?: number; dy?: number; angleDeg?: number; factor?: number };
    const what =
      props.toolName === 'moveFeatures'
        ? `by ${(a.dx ?? 0).toFixed(2)} E, ${(a.dy ?? 0).toFixed(2)} N`
        : props.toolName === 'rotateFeatures'
          ? `by ${(a.angleDeg ?? 0).toFixed(4)}°`
          : props.toolName === 'scaleFeatures'
            ? `by ×${a.factor}`
            : props.toolName === 'mirrorFeatures'
              ? 'across the given axis'
              : 'permanently';
    const destructive = props.toolName === 'deleteFeatures';
    return (
      <div
        className={`text-[11px] font-mono rounded px-2 py-1 border ${
          destructive
            ? 'text-red-200 bg-red-950/40 border-red-800'
            : 'text-gray-400 bg-gray-900 border-gray-700'
        }`}
      >
        {a.ids?.length ?? 0} feature(s) • {what}
      </div>
    );
  }
  return (
    <pre className="text-[10px] font-mono text-gray-400 bg-gray-900 border border-gray-700 rounded p-2 max-h-32 overflow-y-auto">
      {JSON.stringify(props.args, null, 2)}
    </pre>
  );
}

