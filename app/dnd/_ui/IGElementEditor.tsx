'use client';
// IGElementEditor — edit a power/feat/weapon on an IG sheet, or author a brand-new one (IG-S2).
//
// IG could ADD catalogued content and remove it, but never CHANGE what it held or invent anything,
// and had no way to add a weapon at all. The 2024 and PF2 sheets both do all three.
//
// GROUND RULE 4 keeps this small: custom content is the SAME SHAPE as official content. Homebrew
// saves through the same `add_power`/`add_feat`/`add_attack` ops and renders through the same code
// — no parallel "custom" pathway.
//
// IG's powers and feats are bare `string[]`, so an authored one is just a name; its rules text
// lives in the character's `customEffects` map. That is why the editor writes `effect` on the
// UPDATE op rather than trying to carry text on the add — the add op has nowhere to put it.
import { useState } from 'react';
import type { IGAbilityKey } from '@/lib/dnd/systems/intuitive-games/model';

export type IGEditorKind = 'power' | 'feat' | 'weapon';

export interface IGEditableElement {
  name: string;
  /** Rules text, for a power or feat. */
  effect?: string;
  /** Weapon fields. */
  damage?: string;
  ability?: IGAbilityKey;
  properties?: string;
  weaponType?: string;
  bonusToHit?: number;
  bonusDamage?: number;
  proficient?: boolean;
}

const ABILITIES: IGAbilityKey[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export default function IGElementEditor({
  kind, initial, onSave, onClose,
}: {
  kind: IGEditorKind;
  /** Absent = authoring something new. Present = editing what the character holds. */
  initial?: IGEditableElement;
  /** Emits one or more ops — authoring a power with rules text needs an add THEN an update, since
   *  IG's add ops carry only a name. */
  onSave: (edits: Record<string, unknown>[]) => void;
  onClose: () => void;
}) {
  const creating = !initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [effect, setEffect] = useState(initial?.effect ?? '');
  const [damage, setDamage] = useState(initial?.damage ?? '1d6');
  const [ability, setAbility] = useState<IGAbilityKey>(initial?.ability ?? 'STR');
  const [properties, setProperties] = useState(initial?.properties ?? '');
  const [weaponType, setWeaponType] = useState(initial?.weaponType ?? '');
  const [bonusToHit, setBonusToHit] = useState(initial?.bonusToHit ?? 0);
  const [bonusDamage, setBonusDamage] = useState(initial?.bonusDamage ?? 0);
  const [proficient, setProficient] = useState(initial?.proficient ?? true);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && (kind !== 'weapon' || /^\d*d\d+$|^\d+$/i.test(damage.trim()));

  function save() {
    if (!canSave) return;
    if (kind === 'weapon') {
      const payload = { name: creating ? trimmed : initial!.name, weaponType, ability, damage: damage.trim(), properties, proficient, bonusToHit, bonusDamage };
      onSave([creating
        ? { op: 'add_attack', ...payload }
        : { op: 'update_attack', ...payload, ...(trimmed !== initial!.name ? { to: trimmed } : {}) }]);
      return;
    }

    const addOp = kind === 'power' ? 'add_power' : 'add_feat';
    const updateOp = kind === 'power' ? 'update_power' : 'update_feat';

    if (creating) {
      // Two ops: the add takes only a name (IG's shape), then the update attaches the rules text.
      // Emitted together so the caller can apply them in order rather than the UI making two
      // round trips a user could interrupt halfway.
      const ops: Record<string, unknown>[] = [{ op: addOp, name: trimmed }];
      if (effect.trim()) ops.push({ op: updateOp, name: trimmed, effect });
      onSave(ops);
      return;
    }

    onSave([{
      op: updateOp,
      name: initial!.name,
      ...(trimmed !== initial!.name ? { to: trimmed } : {}),
      // Always sent, including empty — an emptied override CLEARS the customisation and falls back
      // to the catalogue text, which is a different intent from leaving it alone.
      effect,
    }]);
  }

  const field = { padding: '7px 9px', fontSize: 13, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6 } as const;
  const lbl = { fontSize: 10.5, color: 'var(--hx-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
  const title = creating ? `New ${kind}` : `Edit ${initial!.name}`;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(2,4,10,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: '86vh', overflowY: 'auto', background: 'var(--hx-bg, #0a1018)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ flex: 1, color: 'var(--hx-text)' }}>{title}</strong>
          <button className="btn tiny" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {creating && (
          <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
            Homebrew is yours — it is not checked against the rules, because it never claimed to be
            official content. It is flagged custom so a DM reviewing the sheet can see it.
          </div>
        )}

        <label style={{ display: 'grid', gap: 3 }}>
          <span style={lbl}>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={field} />
        </label>

        {kind === 'weapon' ? (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 100 }}>
                <span style={lbl}>Damage die</span>
                <input value={damage} onChange={(e) => setDamage(e.target.value)} style={field} placeholder="1d6" />
              </label>
              <label style={{ display: 'grid', gap: 3, minWidth: 90 }}>
                <span style={lbl}>Ability</span>
                <select value={ability} onChange={(e) => setAbility(e.target.value as IGAbilityKey)} style={field}>
                  {ABILITIES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 110 }}>
                <span style={lbl}>Weapon type</span>
                <input value={weaponType} onChange={(e) => setWeaponType(e.target.value)} style={field} placeholder="Blade" />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 100 }}>
                <span style={lbl}>Bonus to hit</span>
                <input type="number" value={bonusToHit} onChange={(e) => setBonusToHit(Number(e.target.value) || 0)} style={field} />
              </label>
              <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 110 }}>
                <span style={lbl}>Bonus damage</span>
                <input type="number" value={bonusDamage} onChange={(e) => setBonusDamage(Number(e.target.value) || 0)} style={field} />
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--hx-text)', paddingBottom: 7 }}>
                <input type="checkbox" checked={proficient} onChange={(e) => setProficient(e.target.checked)} />
                Proficient
              </label>
            </div>
            <label style={{ display: 'grid', gap: 3 }}>
              <span style={lbl}>Properties</span>
              <input value={properties} onChange={(e) => setProperties(e.target.value)} style={field} placeholder="finesse, reach" />
            </label>
          </>
        ) : (
          <label style={{ display: 'grid', gap: 3 }}>
            <span style={lbl}>Rules text</span>
            <textarea
              value={effect} onChange={(e) => setEffect(e.target.value)} rows={5}
              style={{ ...field, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="What it actually does — the numbers matter more than the flavour."
            />
            {!creating && (
              // Says what clearing does, so emptying the box is a deliberate choice rather than a
              // surprise.
              <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>
                Clearing this restores the original rules text.
              </span>
            )}
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn tiny" onClick={onClose}>Cancel</button>
          <button
            className="btn tiny solid" onClick={save} disabled={!canSave}
            title={canSave ? undefined : kind === 'weapon' ? 'A name and a valid damage die (e.g. 1d6) are required.' : 'A name is required.'}
            style={canSave ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}
          >{creating ? `Create ${kind}` : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}
