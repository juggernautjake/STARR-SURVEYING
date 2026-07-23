'use client';
// app/dnd/_ui/builder/BuilderRoller.tsx — the PERMANENTLY DOCKED dice roller for the guided builder.
//
// The owner: in the builder, the roller is a fixed mechanic built into the page (for rolling stats and the
// like) — it does NOT float or move; that's a play-time affordance for the sheet. So this reuses the same
// animated roller STAGE + dice pad the sheet uses, but renders them INLINE (no FloatingRoller wrapper).
//
// The stages read from a `RollFeed` and their CSS is `.dnd-sheet`-scoped and token-driven, so we wrap in
// `.dnd-sheet` and supply the default skin's `--hx-*` (panels) + the bridged 5e shell tokens (--void/--gold/
// … that the Dice Core stage styles from) via `skin-tokens`, so the docked roller renders correctly on the
// plain hextech builder page. Roll state is local — the builder has no character store to publish into.
import { useCallback, useRef, useState } from 'react';
import type { ActiveRoll } from '@/app/dnd/_sheet/state/store';
import { RollFeedProvider } from '@/app/dnd/_sheet/components/rollers/rollFeed';
import { buildDamageActiveRoll, buildD20ActiveRoll } from '@/app/dnd/_sheet/components/rollers/rollFeedBuild';
import { rollerStageFor } from '@/app/dnd/_sheet/components/rollers/rollerFor';
import DicePad from '@/app/dnd/_sheet/components/rollers/DicePad';
import { rollDiceExpr } from '@/lib/dnd/roll';
import { skinHxVars, shellThemeVars } from '@/lib/dnd/skin-tokens';

export default function BuilderRoller() {
  const [activeRoll, setActiveRoll] = useState<ActiveRoll | null>(null);
  const tokenRef = useRef(0);
  const commit = useCallback(() => {}, []);

  // Roll N dice of S sides through the shared builder → the animated stage renders it.
  const rollDice = useCallback((sides: number, n: number) => {
    const expr = `${n}d${sides}`;
    const r = rollDiceExpr(expr);
    setActiveRoll(buildDamageActiveRoll({ token: ++tokenRef.current, label: expr, total: r.total, breakdown: r.breakdown }));
  }, []);

  // "Roll a stat" — 4d6 drop lowest, the classic ability-score roll, so a builder can roll straight into
  // the animated dice without leaving the page (then type the total into the abilities step's field).
  const rollStat = useCallback(() => {
    const rolls = [0, 0, 0, 0].map(() => rollDiceExpr('1d6').total); // rollDiceExpr('1d6') → 1..6
    const kept = [...rolls].sort((a, b) => a - b).slice(1); // drop the single lowest
    const total = kept.reduce((s, v) => s + v, 0);
    setActiveRoll(buildD20ActiveRoll({
      token: ++tokenRef.current, label: 'Ability score (4d6 drop lowest)',
      natural: total, total, modifier: 0, crit: false, fumble: false,
      tag: `rolled ${rolls.join(', ')} → keep ${kept.join(', ')} = ${total}`,
    }));
  }, []);

  return (
    <RollFeedProvider value={{ activeRoll, commitRoll: commit, rollerAnim: true, rollDice }}>
      <div
        className="dnd-sheet"
        style={{ ...skinHxVars('default'), ...shellThemeVars('default'), display: 'grid', gap: 8, border: '1px solid var(--hx-line)', borderRadius: 12, background: 'var(--hx-inset-soft)', padding: '12px 12px 14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: 'var(--hx-font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }}>Dice Roller</span>
          <button type="button" onClick={rollStat} title="Roll one ability score: 4d6, drop the lowest"
            style={{ fontSize: 12, fontWeight: 600, background: 'none', border: '1px solid var(--hx-line)', color: 'var(--hx-teal-1)', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>
            Roll a stat
          </button>
        </div>
        {rollerStageFor('core')}
        <DicePad />
      </div>
    </RollFeedProvider>
  );
}
