'use client';
// PF2ArmorEditor — set or customise the armor a PF2 character wears (S15d).
//
// Armor is a single worn SET, not a list, so this sets rather than adds. Every field here feeds
// `pf2ArmorClass` directly — that is the whole point. Armor that displays but does not move AC is
// worse than no armor field at all, because a player will trust the number.
//
// It shows a LIVE AC preview for exactly that reason: the formula is
// 10 + capped Dex + proficiency + item bonus, and the Dex cap in particular surprises people —
// raising your Dexterity does nothing for AC once the armor caps it. Showing the resulting number
// as the fields change makes the cap visible instead of a silent subtraction.
import { useState } from 'react';
import type { PF2Character, PF2Rank } from '@/lib/dnd/systems/pathfinder2e/model';
import { pf2Proficiency } from '@/lib/dnd/systems/pathfinder2e/rules';
import { pf2ResolveRunes } from '@/lib/dnd/systems/pathfinder2e/bonuses';
import { PF2_ARMORS_FULL } from '@/lib/dnd/systems/pathfinder2e/data';

const RANKS: PF2Rank[] = ['untrained', 'trained', 'expert', 'master', 'legendary'];

export default function PF2ArmorEditor({
  pf2, onSave, onClose,
}: {
  pf2: PF2Character;
  onSave: (edit: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const c = pf2.combat;
  const [name, setName] = useState(c.armorName ?? '');
  const [acBonus, setAcBonus] = useState(c.acItemBonus ?? 0);
  const [dexCap, setDexCap] = useState<number | null>(c.dexCap ?? null);
  const [checkPenalty, setCheckPenalty] = useState(Math.abs(c.armorCheckPenalty ?? 0));
  const [rank, setRank] = useState<PF2Rank>(c.armorRank);
  // Runes, as a comma-separated list. Free text on purpose: the catalog resolves the names it knows
  // and reports the ones it does not, so a homebrew rune stays expressible (Ground Rule 4) instead
  // of being rejected by a fixed dropdown.
  const [runes, setRunes] = useState((c.armorRunes ?? []).join(', '));

  const runeList = runes.split(',').map((r) => r.trim()).filter(Boolean);
  // Runes WIN over the hand-entered bonus when present — one potency rune, not potency plus a
  // typed number. Mirrors `pf2WeaponNumbers` exactly, and the preview must show the number the
  // sheet will show or the editor is lying about its own effect.
  const resolvedRunes = runeList.length ? pf2ResolveRunes(runeList) : null;
  const effectiveAc = resolvedRunes ? resolvedRunes.itemBonus : acBonus;

  // The live preview — the same formula pf2ResolveAc uses, so what the editor promises is what
  // the sheet will show.
  const dex = pf2.attributes.DEX ?? 0;
  const cappedDex = dexCap == null ? dex : Math.min(dex, dexCap);
  const previewAc = 10 + cappedDex + pf2Proficiency(rank, pf2.identity.level) + effectiveAc;
  const dexWasted = dexCap != null && dex > dexCap;

  /** Filling from a catalogued armor is a convenience, not a constraint — every field stays
   *  editable afterwards, so homebrew armor is authored by picking something close and retuning
   *  it, or by typing a name and setting the numbers from scratch. */
  function fillFrom(armorName: string) {
    const a = PF2_ARMORS_FULL.find((x) => x.name === armorName);
    if (!a) return;
    setName(a.name);
    setAcBonus(a.acBonus);
    setDexCap(a.dexCap);
    setCheckPenalty(Math.abs(a.checkPenalty ?? 0));
  }

  const field = { padding: '7px 9px', fontSize: 13, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6 } as const;
  const lbl = { fontSize: 10.5, color: 'var(--hx-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(2,4,10,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: '86vh', overflowY: 'auto', background: 'var(--hx-bg, #0a1018)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ flex: 1, color: 'var(--hx-text)' }}>Armor</strong>
          <button className="btn tiny" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <label style={{ display: 'grid', gap: 3 }}>
          <span style={lbl}>Start from a catalogued armor (optional)</span>
          <select defaultValue="" onChange={(e) => fillFrom(e.target.value)} style={field}>
            <option value="">— pick to fill the fields —</option>
            {PF2_ARMORS_FULL.map((a) => (
              <option key={a.name} value={a.name}>{a.name} (+{a.acBonus} AC, Dex cap {a.dexCap ?? '∞'})</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 3 }}>
          <span style={lbl}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} style={field} placeholder="e.g. Ashen Plate" />
        </label>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 100 }}>
            <span style={lbl}>AC bonus</span>
            <input type="number" min={0} max={10} value={acBonus} onChange={(e) => setAcBonus(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} style={field} />
          </label>
          <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 120 }}>
            <span style={lbl}>Dex cap</span>
            <input
              type="number" min={0} max={10}
              value={dexCap ?? ''}
              placeholder="none"
              onChange={(e) => setDexCap(e.target.value === '' ? null : Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
              style={field}
            />
          </label>
          <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 110 }}>
            <span style={lbl}>Check penalty</span>
            {/* Entered as a positive number and stored negative — a penalty typed as +2 would
                otherwise improve four skills instead of hindering them. */}
            <input type="number" min={0} max={10} value={checkPenalty} onChange={(e) => setCheckPenalty(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} style={field} />
          </label>
        </div>

        <label style={{ display: 'grid', gap: 3 }}>
          <span style={lbl}>Your armor proficiency</span>
          <select value={rank} onChange={(e) => setRank(e.target.value as PF2Rank)} style={field}>
            {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 3 }}>
          <span style={lbl}>Runes (comma-separated)</span>
          <input value={runes} onChange={(e) => setRunes(e.target.value)} style={field} placeholder="e.g. +1 armor potency, greater resilient" />
          <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>
            Potency sets the AC item bonus; resilient adds its bonus to every save. Listing any rune
            takes over from the AC-bonus box above — a suit has one potency rune, not two sources.
          </span>
        </label>

        <div style={{ padding: '8px 10px', border: '1px solid var(--hx-line)', borderRadius: 8, background: 'rgba(1,10,19,0.4)', fontSize: 12.5, color: 'var(--hx-text)' }}>
          Resulting AC <strong style={{ color: 'var(--hx-gold-2)', fontSize: 16 }}>{previewAc}</strong>
          <div style={{ fontSize: 11, color: 'var(--hx-muted)', marginTop: 2 }}>
            10 + Dex {cappedDex} + proficiency {pf2Proficiency(rank, pf2.identity.level)} + item {effectiveAc}
            {resolvedRunes?.saveBonus ? ` · +${resolvedRunes.saveBonus} to all saves (resilient)` : ''}
          </div>
          {resolvedRunes?.notes.length ? (
            // Unrecognised rune names are REPORTED, not swallowed — a typo that silently contributes
            // nothing is exactly how a player ends up trusting a number that never applied.
            <div style={{ fontSize: 10.5, color: 'var(--hx-muted)', marginTop: 3 }}>{resolvedRunes.notes.join(' · ')}</div>
          ) : null}
          {dexWasted && (
            // The surprise worth calling out: past the cap, more Dexterity does nothing for AC.
            <div style={{ fontSize: 11, color: '#e0a020', marginTop: 3 }}>
              ⚠ Your Dexterity is +{dex}, but this armor caps it at +{dexCap} — {dex - dexCap!} of it is doing nothing for AC.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn tiny" onClick={onClose}>Cancel</button>
          <button
            className="btn tiny solid"
            onClick={() => onSave({ op: 'set_armor', name, acBonus, dexCap, checkPenalty, rank, runes: runeList })}
          >Save armor</button>
        </div>
      </div>
    </div>
  );
}
