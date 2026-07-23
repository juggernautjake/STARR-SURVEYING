'use client';
// StatGenPanel — the 5e ability-score generation widget for the manual builder (MB-1).
//
// The vanilla 5e methods, each with ONE input per ability and a live modifier: Standard Array and Roll assign
// a POOL of six values (each usable once, via a per-ability dropdown); Point Buy uses steppers against the
// 27-point budget; Manual is free entry. A "Roll 4d6" button rolls the pool inline (drop-lowest, showing the
// dropped die) — the "manually roll dice or use the roller" ask, without leaving the builder. Racial (2014)
// or background (2024) increases are shown as a base → +bonus → final → modifier breakdown. All the maths is
// the unit-tested `statgen/dnd5e`; this file is presentation + controlled inputs. Colours are
// `var(--hx-*, <fallback>)` so it reads on every skin.
import React from 'react';
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import { ABILITIES } from '@/app/dnd/_sheet/rules/dnd';
import {
  STANDARD_ARRAY_5E,
  abilityMod5e,
  validatePointBuy,
  POINT_BUY_BUDGET,
  POINT_BUY_MIN,
  POINT_BUY_MAX,
  rollAbilityScores,
  applyAbilityIncreases5e,
} from '@/lib/dnd/statgen/dnd5e';

export type StatGenMethod = 'standard' | 'pointbuy' | 'roll' | 'manual';

const METHODS: { key: StatGenMethod; label: string; blurb: string }[] = [
  { key: 'standard', label: 'Standard array', blurb: 'Assign 15, 14, 13, 12, 10, 8.' },
  { key: 'pointbuy', label: 'Point buy', blurb: '27 points; each score 8–15.' },
  { key: 'roll', label: 'Roll', blurb: '4d6 drop lowest, ×6 — roll here or enter your own.' },
  { key: 'manual', label: 'Manual', blurb: 'Type each score directly.' },
];

const LINE = 'var(--hx-line, rgba(130,132,140,0.30))';
const INSET = 'var(--hx-inset, rgba(130,132,140,0.06))';
const fmtMod = (m: number) => (m >= 0 ? `+${m}` : `${m}`);
const cap20 = (n: number) => Math.max(1, Math.min(20, n));

const btn = (on: boolean): React.CSSProperties => ({
  fontSize: 12.5, fontWeight: 600, padding: '5px 11px', borderRadius: 7, cursor: 'pointer',
  border: `1px solid ${on ? 'var(--hx-gold-1, #8a6d3b)' : LINE}`, color: 'inherit',
  background: on ? 'var(--hx-inset-strong, rgba(130,132,140,0.14))' : 'none',
});
const input: React.CSSProperties = {
  width: 56, fontSize: 15, fontWeight: 700, textAlign: 'center', padding: '5px 6px', borderRadius: 6,
  background: 'var(--hx-inset-strong, rgba(130,132,140,0.10))', color: 'inherit', border: `1px solid ${LINE}`,
};

export interface StatGenPanelProps {
  /** The BASE scores the player is generating (before racial/background increases). */
  value: Record<AbilityKey, number>;
  onChange: (next: Record<AbilityKey, number>) => void;
  method: StatGenMethod;
  onMethodChange: (m: StatGenMethod) => void;
  /** Racial (2014) or background (2024) increases, shown in the breakdown and folded into the final. */
  increases?: Partial<Record<AbilityKey, number>>;
  /** How the increase column is labelled — "Racial" (2014) or "Background" (2024). */
  increaseLabel?: string;
}

export default function StatGenPanel({ value, onChange, method, onMethodChange, increases, increaseLabel = 'Bonus' }: StatGenPanelProps) {
  // The rolled pool (Roll method). Fixed for Standard Array. Assignments read from `value`.
  const [pool, setPool] = React.useState<number[] | null>(null);

  const activePool = method === 'standard' ? [...STANDARD_ARRAY_5E] : method === 'roll' ? pool : null;

  const set = (k: AbilityKey, n: number) => onChange({ ...value, [k]: n });

  const rollPool = () => {
    const rolls = rollAbilityScores();
    setPool(rolls.map((r) => r.total).sort((a, b) => b - a));
  };

  // For pool methods, which pool values are already used, so each is assignable once.
  const used = new Set<AbilityKey>();
  const remainingFor = (self: AbilityKey): number[] => {
    if (!activePool) return [];
    const counts = new Map<number, number>();
    for (const v of activePool) counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const a of ABILITIES) {
      if (a.key === self) continue;
      const v = value[a.key];
      if (counts.has(v)) counts.set(v, (counts.get(v) ?? 0) - 1);
    }
    used.add(self);
    const out: number[] = [];
    for (const [v, c] of counts) for (let i = 0; i < c; i++) out.push(v);
    return out.sort((a, b) => b - a);
  };

  const pointBuy = method === 'pointbuy' ? validatePointBuy(value) : null;
  const final = applyAbilityIncreases5e(value, increases ?? {});

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Method picker */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {METHODS.map((m) => (
          <button key={m.key} type="button" style={btn(method === m.key)} onClick={() => onMethodChange(m.key)} title={m.blurb}>
            {m.label}
          </button>
        ))}
        {method === 'roll' && (
          <button type="button" style={{ ...btn(false), marginLeft: 'auto' }} onClick={rollPool}>🎲 Roll 4d6 ×6</button>
        )}
        {method === 'pointbuy' && pointBuy && (
          <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: pointBuy.remaining < 0 ? 'var(--hx-danger, #c0392b)' : 'inherit' }}>
            {pointBuy.remaining} / {POINT_BUY_BUDGET} points left
          </span>
        )}
      </div>

      {/* Per-ability rows */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 44px 44px 44px', gap: 8, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.6, padding: '0 4px' }}>
          <span>Ability</span><span>Score</span><span>{increaseLabel}</span><span>Final</span><span>Mod</span>
        </div>
        {ABILITIES.map((a) => {
          const base = value[a.key];
          const inc = increases?.[a.key] ?? 0;
          const fin = cap20(final[a.key]);
          return (
            <div key={a.key} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 44px 44px 44px', gap: 8, alignItems: 'center', border: `1px solid ${LINE}`, background: INSET, borderRadius: 8, padding: '5px 8px' }}>
              <span style={{ fontWeight: 700, fontSize: 13 }} title={a.full}>{a.label}</span>
              <span>
                {activePool ? (
                  <select value={base} onChange={(e) => set(a.key, Number(e.target.value))} style={{ ...input, width: '100%', textAlign: 'left' }} aria-label={`${a.full} score`}>
                    {/* the current value stays selectable, plus the remaining pool */}
                    {[base, ...remainingFor(a.key).filter((v) => v !== base)].map((v, i) => (
                      <option key={`${v}-${i}`} value={v}>{v}</option>
                    ))}
                  </select>
                ) : method === 'pointbuy' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <button type="button" style={btn(false)} onClick={() => set(a.key, Math.max(POINT_BUY_MIN, base - 1))} aria-label={`Lower ${a.full}`}>−</button>
                    <strong style={{ minWidth: 22, textAlign: 'center' }}>{base}</strong>
                    <button type="button" style={btn(false)} onClick={() => set(a.key, Math.min(POINT_BUY_MAX, base + 1))} aria-label={`Raise ${a.full}`}>+</button>
                  </span>
                ) : (
                  <input type="number" min={1} max={30} value={base} onChange={(e) => set(a.key, cap20(Number(e.target.value) || 0))} style={input} aria-label={`${a.full} score`} />
                )}
              </span>
              <span style={{ opacity: inc ? 1 : 0.4, fontWeight: 600 }}>{inc ? `+${inc}` : '—'}</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fin}</strong>
              <strong style={{ color: 'var(--hx-gold-2, #b9975b)', fontVariantNumeric: 'tabular-nums' }}>{fmtMod(abilityMod5e(fin))}</strong>
            </div>
          );
        })}
      </div>

      {method === 'pointbuy' && pointBuy && !pointBuy.valid && (
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--hx-danger, #c0392b)', fontSize: 12.5 }}>
          {pointBuy.errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
