'use client';
// InfoTip (Area B7) — the ⓘ info dot on in-play effect chips (stance, condition, feat…).
//
// The implementation moved to `_ui/Tip` in CX-10, where it merged with the builder's help dot: the
// two were separately-maintained copies of the same popover, and only this one dismissed on Escape
// or an outside tap. This file stays as the adapter so the IG and PF2 sheets' imports are unchanged
// — the duplication is what CX-10 removed, not the call sites.
//
// Behaviour is identical to before: hover, keyboard focus, AND tap, because the sheets used to show
// these effects with a native `title`, which is mouse-hover ONLY and therefore invisible on the
// tablets a table actually uses.
import Tip from '@/app/dnd/_ui/Tip';

export default function InfoTip({ tip, label = 'more info' }: { tip: string; label?: string }) {
  return <Tip tip={tip} label={label} />;
}
