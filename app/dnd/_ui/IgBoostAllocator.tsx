'use client';
// IgBoostAllocator — the Intuitive Games ability-boost picker for the manual builder (MB-4).
//
// Replaces the builder's raw 1–30 score inputs with IG's real method (the unit-tested `statgen/ig`): every
// ability starts at 10, you spend EIGHT +2 boosts, at most two per ability (creation cap 14). Each ability is
// a stepper; the resolved scores + modifiers and the remaining-boost budget show live, and the scores are
// emitted to the parent as `picks.abilities`. Token colours so it reads on every skin.
import React from 'react';
import {
  IG_ABILITIES,
  IG_BOOST_COUNT,
  IG_MAX_BOOSTS_PER_ABILITY,
  igAbilityMod,
  igBlankAllocation,
  igBoostsSpent,
  igResolveScores,
  igValidateAllocation,
  type IGAbilityKey,
} from '@/lib/dnd/statgen/ig';

const LINE = 'var(--hx-line, rgba(130,132,140,0.30))';
const step: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, width: 26, height: 26, borderRadius: 6, cursor: 'pointer',
  border: `1px solid ${LINE}`, background: 'var(--hx-inset-strong, rgba(130,132,140,0.12))', color: 'inherit',
};
const fmtMod = (m: number) => (m >= 0 ? `+${m}` : `${m}`);

export default function IgBoostAllocator({ onChange }: { onChange: (scores: Record<IGAbilityKey, number>) => void }) {
  const [alloc, setAlloc] = React.useState(igBlankAllocation());

  const scores = igResolveScores(alloc);
  const validation = igValidateAllocation(alloc);
  const spent = igBoostsSpent(alloc);
  const scoresKey = JSON.stringify(scores);

  React.useEffect(() => {
    onChange(scores);
    // scoresKey captures the value; onChange is a stable setter from the parent's useState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoresKey, onChange]);

  const bump = (a: IGAbilityKey, d: 1 | -1) =>
    setAlloc((cur) => {
      const next = Math.max(0, Math.min(IG_MAX_BOOSTS_PER_ABILITY, (cur[a] || 0) + d));
      // Don't let a raise push total over the eight-boost budget.
      if (d === 1 && igBoostsSpent(cur) >= IG_BOOST_COUNT) return cur;
      return { ...cur, [a]: next };
    });

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>
        Start 10 · spend <strong>{IG_BOOST_COUNT}</strong> boosts of +2 · max two per ability (cap 14) ·{' '}
        <strong style={{ color: spent === IG_BOOST_COUNT ? 'inherit' : 'var(--hx-gold-2, #b9975b)' }}>{IG_BOOST_COUNT - spent} left</strong>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
        {IG_ABILITIES.map((a) => (
          <div key={a} style={{ display: 'grid', gap: 3, justifyItems: 'center', border: `1px solid ${LINE}`, borderRadius: 8, padding: '7px 6px', background: 'var(--hx-inset, rgba(130,132,140,0.06))' }}>
            <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{a}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" style={step} onClick={() => bump(a, -1)} disabled={(alloc[a] || 0) === 0} aria-label={`Lower ${a}`}>−</button>
              <strong style={{ fontSize: 18, minWidth: 26, textAlign: 'center' }}>{scores[a]}</strong>
              <button type="button" style={step} onClick={() => bump(a, 1)} disabled={(alloc[a] || 0) >= IG_MAX_BOOSTS_PER_ABILITY || spent >= IG_BOOST_COUNT} aria-label={`Raise ${a}`}>+</button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--hx-gold-2, #b9975b)', fontWeight: 700 }}>{fmtMod(igAbilityMod(scores[a]))}</span>
            <span style={{ fontSize: 9.5, opacity: 0.55 }}>{alloc[a] || 0} boost{(alloc[a] || 0) === 1 ? '' : 's'}</span>
          </div>
        ))}
      </div>
      {!validation.valid && (
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--hx-danger, #c0392b)', fontSize: 12 }}>
          {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
