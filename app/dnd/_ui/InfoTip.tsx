// app/dnd/_ui/InfoTip.tsx — the builder's inline help dot (Phase V, Slice 9).
//
// A "ⓘ" affordance next to a field or control; hover, focus or tap reveals a short explanation
// pulled from the builder help catalog (or passed directly). Keeps the builder surfaces uncluttered
// while making thorough help one tap away.
//
// Since CX-10 this is an adapter: the popover itself is `_ui/Tip`, which this file used to
// duplicate. What is left here is the part that was ever specific to the builder — resolving a
// `BuilderHelpKey` into its title and body — so the catalog stays the single source of the copy and
// the interaction (Escape, outside tap, touch) is the same one every other marker gets.
'use client';

import Tip from './Tip';
import { BUILDER_HELP, type BuilderHelpKey } from '@/lib/dnd/builder-help';

export default function InfoTip({ topic, title, body }: { topic?: BuilderHelpKey; title?: string; body?: string }) {
  const entry = topic ? BUILDER_HELP[topic] : undefined;
  const t = title ?? entry?.title ?? 'Help';
  const b = body ?? entry?.body ?? '';

  // No body → Tip renders nothing, same as before. A help dot that opens onto an empty bubble is
  // worse than no dot: it reads as broken rather than as "no help here".
  // The teal chrome is the builder's, not the sheet's — carried over so the dot looks the same
  // after the merge as it did before it.
  return (
    <Tip
      tip={b}
      title={t}
      label={`Help: ${t}`}
      glyph="i"
      triggerStyle={{ background: 'rgba(10,200,185,0.08)', color: 'var(--hx-teal-1, #0ac8b9)', fontSize: 11 }}
    />
  );
}
