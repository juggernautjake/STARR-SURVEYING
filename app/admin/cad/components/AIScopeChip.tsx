'use client';
// app/admin/cad/components/AIScopeChip.tsx
//
// C32 — "do this to THESE", said out loud.
//
// The live selection was already sent to the model on every turn, so the AI could always *see* it.
// What was missing is what the slice actually asks for: that the scope be **explicit and visible,
// not inferred**. Two failures follow from leaving it implicit:
//
//   INVISIBLE   the surveyor cannot see what the AI is about to act on before pressing send. Four
//               hundred features from a rubber-band ten minutes ago look exactly like none.
//
//   DRIFTING    the scope is read when the message is SENT, not when it was composed. Clicking the
//               canvas mid-sentence — to look at the thing being described — silently changed what
//               "these" meant. The request was right, the answer was right for a different
//               question, and nothing looked wrong afterwards.
//
// So: a chip that always says what the scope is, and a pin that freezes it.

import { Crosshair, Pin, PinOff } from 'lucide-react';

import { useAIConversationsStore, useDrawingStore, useSelectionStore } from '@/lib/cad/store';
import { summariseScope, resolveScopeIds, scopeStaleCount, scopeLayerName } from '@/lib/cad/ai/scope';

export default function AIScopeChip() {
  const doc = useDrawingStore((s) => s.document);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const pinnedScope = useAIConversationsStore((s) => s.pinnedScope);
  const pinScope = useAIConversationsStore((s) => s.pinScope);
  const clearScope = useAIConversationsStore((s) => s.clearScope);

  const live = Array.from(selectedIds);
  const effective = resolveScopeIds(pinnedScope, live, doc);
  const summary = summariseScope(doc, effective);
  const stale = scopeStaleCount(doc, pinnedScope);
  const pinned = pinnedScope !== null;
  // C33 — a layer scope names the layer rather than repeating the feature breakdown. "Layer: FENCE"
  // is what the surveyor chose; "9 features · 9 LINE · FENCE" is a description of the same thing
  // that does not say the scope will keep up as they draw.
  const isLayer = pinnedScope?.kind === 'LAYER';
  const layerName = isLayer ? scopeLayerName(doc, pinnedScope.layerId) : null;

  return (
    <div
      className="flex items-center gap-1.5 border-t border-gray-700 px-2 py-1"
      data-testid="ai-scope-chip"
    >
      <Crosshair size={11} className={`shrink-0 ${pinned ? 'text-blue-300' : 'text-gray-500'}`} />
      <span className="text-[10px] text-gray-400 shrink-0">
        {isLayer ? 'Layer' : pinned ? 'Pinned' : 'Scope'}
      </span>
      <span
        className={`flex-1 min-w-0 truncate text-[10px] ${summary.count === 0 && !isLayer ? 'text-gray-500' : 'text-gray-300'}`}
        title={summary.ids.join(', ')}
        data-testid="ai-scope-label"
      >
        {/* An empty LAYER scope still reads as a scope — "everything on DEMOLITION" is meaningful
            for a layer about to be drawn on, and "Nothing selected" would be the wrong sentence. */}
        {isLayer ? `${layerName} · ${summary.count} feature${summary.count === 1 ? '' : 's'}` : summary.label}
      </span>

      {/* Stale is REPORTED, never silently corrected. Shrinking the scope quietly would mean the
          surveyor sends "move these twelve", eight move, and the chip agreed with itself the whole
          time. */}
      {stale > 0 && (
        <span className="shrink-0 text-[10px] text-amber-300" data-testid="ai-scope-stale">
          {stale} gone
        </span>
      )}

      {pinned ? (
        <button
          className="shrink-0 rounded p-1 text-blue-300 transition-colors hover:bg-gray-700 hover:text-blue-100"
          onClick={clearScope}
          title="Unpin — follow the canvas selection again"
          aria-label="Unpin AI scope"
          data-testid="ai-scope-unpin"
        >
          <PinOff size={11} />
        </button>
      ) : (
        <button
          className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-30"
          onClick={() => pinScope(live)}
          // Nothing to freeze is not a pin. Refusing here keeps the chip to two honest states
          // rather than a third that claims a scope of nothing.
          disabled={live.length === 0}
          title={live.length === 0 ? 'Select something to pin' : 'Pin this selection as the AI scope'}
          aria-label="Pin AI scope"
          data-testid="ai-scope-pin"
        >
          <Pin size={11} />
        </button>
      )}
    </div>
  );
}
