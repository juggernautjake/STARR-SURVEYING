'use client';
// PF2WeaponEditor — edit a Strike on a PF2 sheet, or author a homebrew weapon (S15d).
//
// The sheet stored a pre-computed damage STRING, so an edited weapon displayed correctly and rolled
// wrong: `deadly`, `fatal`, `two-hand`, `agile` and the striking rune line never computed. This
// editor writes the BASE die plus its traits and lets `pf2ResolveStrike` derive the rest at render.
//
// Traits are the mechanically important field here, not decoration — `agile` changes the multiple
// attack penalty, `deadly dX` and `fatal dX` change the critical damage, `two-hand dX` changes the
// die itself. They are offered as a picker rather than free text so a typo cannot silently disable
// a weapon's defining property.
import { useState } from 'react';
import type { PF2AttributeKey } from '@/lib/dnd/systems/pathfinder2e/model';

export interface PF2EditableWeapon {
  name: string;
  damage?: string;
  damageType?: string;
  traits?: string[];
  weaponBonus?: number;
  striking?: string;
  attribute?: PF2AttributeKey;
}

/** The traits that CHANGE A NUMBER. Purely descriptive traits (reach, sweep, versatile) are typed
 *  freely in the extra field — offering every trait as a toggle would bury the four that matter. */
const MECHANICAL_TRAITS = ['agile', 'finesse', 'propulsive', 'thrown 10 ft'] as const;
const DIE_TRAITS = [
  { prefix: 'deadly', label: 'Deadly', help: 'Adds one die of this size on a critical hit, after doubling.' },
  { prefix: 'fatal', label: 'Fatal', help: 'On a crit the damage die becomes this size, plus one extra die.' },
  { prefix: 'two-hand', label: 'Two-hand', help: 'Wielded in two hands, the damage die becomes this size.' },
] as const;
const DICE = ['', 'd4', 'd6', 'd8', 'd10', 'd12'] as const;
const STRIKING = [
  { v: 'none', label: 'None' }, { v: 'striking', label: 'Striking (2 dice)' },
  { v: 'greater', label: 'Greater (3 dice)' }, { v: 'major', label: 'Major (4 dice)' },
] as const;

export default function PF2WeaponEditor({
  initial, onSave, onClose,
}: {
  initial?: PF2EditableWeapon;
  onSave: (edit: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const creating = !initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [damage, setDamage] = useState(initial?.damage ?? '1d6');
  const [damageType, setDamageType] = useState(initial?.damageType ?? 'slashing');
  const [attribute, setAttribute] = useState<PF2AttributeKey>(initial?.attribute ?? 'STR');
  const [weaponBonus, setWeaponBonus] = useState(initial?.weaponBonus ?? 0);
  const [striking, setStriking] = useState(initial?.striking ?? 'none');

  const start = initial?.traits ?? [];
  const [flags, setFlags] = useState<string[]>(start.filter((t) => (MECHANICAL_TRAITS as readonly string[]).includes(t.toLowerCase())));
  const [dieTraits, setDieTraits] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const d of DIE_TRAITS) {
      const hit = start.find((t) => t.toLowerCase().startsWith(`${d.prefix} `));
      out[d.prefix] = hit ? (hit.match(/d\d+$/i)?.[0] ?? '') : '';
    }
    return out;
  });
  const [extra, setExtra] = useState(
    start.filter((t) => !(MECHANICAL_TRAITS as readonly string[]).includes(t.toLowerCase())
      && !DIE_TRAITS.some((d) => t.toLowerCase().startsWith(`${d.prefix} `))).join(', '),
  );

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && /^\d*d\d+$|^\d+$/i.test(damage.trim());

  function save() {
    if (!canSave) return;
    const traits = [
      ...flags,
      ...DIE_TRAITS.filter((d) => dieTraits[d.prefix]).map((d) => `${d.prefix} ${dieTraits[d.prefix]}`),
      ...extra.split(',').map((s) => s.trim()).filter(Boolean),
    ];
    const payload = { name: creating ? trimmed : initial!.name, damage: damage.trim(), damageType, traits, weaponBonus, striking, attribute };
    onSave(creating
      ? { op: 'add_attack', ...payload }
      : { op: 'update_attack', ...payload, ...(trimmed !== initial!.name ? { to: trimmed } : {}) });
  }

  const field = { padding: '7px 9px', fontSize: 13, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6 } as const;
  const lbl = { fontSize: 10.5, color: 'var(--hx-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(2,4,10,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: '86vh', overflowY: 'auto', background: 'var(--hx-bg, #0a1018)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ flex: 1, color: 'var(--hx-text)' }}>{creating ? 'New weapon' : `Edit ${initial!.name}`}</strong>
          <button className="btn tiny" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <label style={{ display: 'grid', gap: 3 }}>
          <span style={lbl}>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={field} placeholder="e.g. Ashfall Blade" />
        </label>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 100 }}>
            {/* BASE die only — striking and two-hand are applied by the resolver, not typed here. */}
            <span style={lbl}>Base die</span>
            <input value={damage} onChange={(e) => setDamage(e.target.value)} style={field} placeholder="1d8" />
          </label>
          <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 110 }}>
            <span style={lbl}>Damage type</span>
            <input value={damageType} onChange={(e) => setDamageType(e.target.value)} style={field} placeholder="slashing" />
          </label>
          <label style={{ display: 'grid', gap: 3, minWidth: 90 }}>
            <span style={lbl}>Attribute</span>
            <select value={attribute} onChange={(e) => setAttribute(e.target.value as PF2AttributeKey)} style={field}>
              {(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 110 }}>
            <span style={lbl}>Potency (+X to hit)</span>
            <input type="number" min={0} max={3} value={weaponBonus} onChange={(e) => setWeaponBonus(Math.max(0, Math.min(3, Number(e.target.value) || 0)))} style={field} />
          </label>
          <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 150 }}>
            <span style={lbl}>Striking rune</span>
            <select value={striking} onChange={(e) => setStriking(e.target.value)} style={field}>
              {STRIKING.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gap: 5 }}>
          <span style={lbl}>Traits that change a number</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {MECHANICAL_TRAITS.map((t) => (
              <label key={t} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--hx-text)' }}>
                <input
                  type="checkbox" checked={flags.includes(t)}
                  onChange={(e) => setFlags((p) => e.target.checked ? [...p, t] : p.filter((x) => x !== t))}
                />
                {t}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DIE_TRAITS.map((d) => (
              <label key={d.prefix} title={d.help} style={{ display: 'grid', gap: 2, minWidth: 100 }}>
                <span style={{ ...lbl, cursor: 'help' }}>{d.label}</span>
                <select value={dieTraits[d.prefix] ?? ''} onChange={(e) => setDieTraits((p) => ({ ...p, [d.prefix]: e.target.value }))} style={field}>
                  {DICE.map((x) => <option key={x} value={x}>{x || '—'}</option>)}
                </select>
              </label>
            ))}
          </div>
          <label style={{ display: 'grid', gap: 3 }}>
            <span style={lbl}>Other traits (comma-separated)</span>
            <input value={extra} onChange={(e) => setExtra(e.target.value)} style={field} placeholder="reach, sweep, versatile P" />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn tiny" onClick={onClose}>Cancel</button>
          <button
            className="btn tiny solid" onClick={save} disabled={!canSave}
            title={canSave ? undefined : 'A name and a valid base die (e.g. 1d8) are required.'}
            style={canSave ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}
          >{creating ? 'Create weapon' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}
