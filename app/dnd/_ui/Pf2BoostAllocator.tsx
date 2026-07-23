'use client';
// Pf2BoostAllocator — the PF2 attribute-boost picker for the manual builder (MB-3).
//
// Replaces the builder's raw modifier inputs with the real PF2 method: staged boost sets (ancestry /
// background / class / free) resolved through the unit-tested `statgen/pf2`, with the ancestry flaw applied
// and the "two free boosts, no flaw" alternative offered. Each free slot is a dropdown (restricted where the
// rules restrict it — a background's chosen boost, a class key choice); the resolved modifiers are emitted to
// the parent as `picks.attributes`. Token colours so it reads on every skin.
import React from 'react';
import { PF2_ATTRIBUTES, type PF2AttributeKey } from '@/lib/dnd/systems/pathfinder2e/model';
import { pf2AncestryFull, pf2BackgroundFull } from '@/lib/dnd/systems/pathfinder2e/data';
import {
  pf2StandardSets,
  pf2ResolveAttributes,
  pf2ValidateAllocation,
  pf2ModToScore,
  type BoostAllocation,
} from '@/lib/dnd/statgen/pf2';

const LINE = 'var(--hx-line, rgba(130,132,140,0.30))';
const sel: React.CSSProperties = {
  fontSize: 12.5, padding: '4px 7px', borderRadius: 6, background: 'var(--hx-inset-strong, rgba(130,132,140,0.10))',
  color: 'inherit', border: `1px solid ${LINE}`, minWidth: 66,
};
const fmtMod = (m: number) => (m >= 0 ? `+${m}` : `${m}`);

export default function Pf2BoostAllocator({
  ancestry,
  background,
  classKeyOptions,
  onChange,
}: {
  ancestry: string;
  background: string;
  classKeyOptions: PF2AttributeKey[];
  onChange: (attrs: Record<PF2AttributeKey, number>) => void;
}) {
  const [alloc, setAlloc] = React.useState<BoostAllocation>({});
  const [useAlternate, setUseAlternate] = React.useState(false);

  const ancFull = pf2AncestryFull(ancestry);
  const bgFull = pf2BackgroundFull(background);
  const { sets, flaw } = pf2StandardSets({
    ancestryBoosts: ancFull?.boosts ?? [],
    ancestryFlaw: ancFull?.flaw,
    useAlternate,
    backgroundChoice: bgFull?.attributeChoice ?? [],
    classKeyOptions,
  });

  const resolved = pf2ResolveAttributes(sets, alloc, flaw);
  const validation = pf2ValidateAllocation(sets, alloc);
  const resolvedKey = JSON.stringify(resolved);

  React.useEffect(() => {
    onChange(resolved);
    // resolvedKey captures the value; onChange is a stable setter from the parent's useState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey, onChange]);

  const setSlot = (setKey: string, slot: number, value: PF2AttributeKey) =>
    setAlloc((cur) => {
      const arr = [...(cur[setKey] ?? [])];
      arr[slot] = value;
      return { ...cur, [setKey]: arr };
    });

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {ancFull && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
          <input type="checkbox" checked={useAlternate} onChange={(e) => { setUseAlternate(e.target.checked); setAlloc((c) => ({ ...c, ancestry: [] })); }} />
          Use the alternative: two free ancestry boosts, no flaw
        </label>
      )}

      {sets.map((set) => (
        <div key={set.key} style={{ display: 'grid', gap: 5, border: `1px solid ${LINE}`, borderRadius: 8, padding: '7px 10px', background: 'var(--hx-inset, rgba(130,132,140,0.06))' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.7 }}>
            {set.label}
            {set.key === 'ancestry' && flaw && <span style={{ color: 'var(--hx-danger, #c0392b)', marginLeft: 8 }}>flaw −2 {flaw}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {set.fixed.map((f, i) => (
              <span key={`f${i}`} style={{ fontSize: 12.5, fontWeight: 600, padding: '3px 8px', borderRadius: 5, border: `1px solid ${LINE}` }}>+2 {f}</span>
            ))}
            {set.slots.map((restriction, i) => (
              <select key={`s${i}`} value={(alloc[set.key] ?? [])[i] ?? ''} onChange={(e) => setSlot(set.key, i, e.target.value as PF2AttributeKey)} style={sel} aria-label={`${set.label} boost ${i + 1}`}>
                <option value="">boost…</option>
                {(restriction ?? PF2_ATTRIBUTES).map((a) => <option key={a} value={a}>+2 {a}</option>)}
              </select>
            ))}
            {set.fixed.length === 0 && set.slots.length === 0 && <span style={{ fontSize: 12, opacity: 0.6 }}>—</span>}
          </div>
        </div>
      ))}

      {/* Resolved modifiers */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PF2_ATTRIBUTES.map((a) => (
          <span key={a} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1, border: `1px solid ${LINE}`, borderRadius: 7, padding: '5px 10px', minWidth: 52 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.65 }}>{a}</span>
            <strong style={{ fontSize: 15 }}>{fmtMod(resolved[a])}</strong>
            <span style={{ fontSize: 10.5, opacity: 0.6 }}>{pf2ModToScore(resolved[a])}</span>
          </span>
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
