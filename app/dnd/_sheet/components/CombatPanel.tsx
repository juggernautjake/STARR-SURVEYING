import { useMemo, useState } from 'react'
import { useChar } from '../state/store'
import { abilityMod, signed } from '../rules/dnd'
import { deriveAc } from '../lib/derive-ac'
import { md } from '../lib/inline'
import { RichRules } from './RuleTip'
import SectionHead from './ui/SectionHead'
import ElementMenu from './ui/ElementMenu'
import EffectStar from './ui/EffectStar'
import TraitEditor from './ui/TraitEditor'

export default function CombatPanel() {
  const { char, setChar, editMode, canWrite, ledger, adjustHp, rollDeathSave, spendHitDie, shortRest, longRest } = useChar()
  const [editingTrait, setEditingTrait] = useState<{ index: number; text: string } | null>(null)
  const removeTrait = (i: number) => {
    if (!confirm('Delete this trait? This cannot be undone.')) return
    setChar((c) => ({ ...c, traits: (c.traits ?? []).filter((_, idx) => idx !== i) }))
  }
  const { combat } = char
  const [amt, setAmt] = useState(5)
  // Regeneration is character-owned: a flat amount or the CON modifier (min 1).
  const regenAmount =
    char.regen == null
      ? 0
      : char.regen.amount === 'conMod'
        ? Math.max(1, abilityMod(char.abilities.con))
        : char.regen.amount
  const longRestPrompt = `Take a long rest? Restores HP, hit dice, resources, death saves${char.longRestNote ? `, ${char.longRestNote}` : ''}.`
  // AC from equipped armor/shield + item AC-effects; falls back to the manual combat.ac when
  // nothing is equipped (so hand-set AC still works). Recomputes when inventory/DEX/AC change.
  const acInfo = useMemo(
    () => deriveAc(char.inventory, abilityMod(char.abilities.dex), combat.ac, char.activeEffects),
    [char.inventory, char.abilities.dex, combat.ac, char.activeEffects],
  )

  // Walk speed through the ledger (Slice 15): a Boots of Striding +10 shows here and stars itself.
  // Speed is display-only, so folding it has none of max-HP's heal-clamp interaction — that stays
  // on the base for now. `value` returns the base untouched when nothing modifies it.
  const walkSpeed = ledger.value('speed_walk', combat.speed)

  const dying = combat.currentHp <= 0

  const setTemp = (v: number) => setChar((c) => ({ ...c, combat: { ...c.combat, tempHp: Math.max(0, v) } }))
  const setDeath = (kind: 'deathSuccess' | 'deathFail', v: number) =>
    setChar((c) => ({ ...c, combat: { ...c.combat, [kind]: v } }))

  return (
    <section id="combat">
      <SectionHead num="04" title="Vitals & Defenses" />
      <div className="two">
        {/* HP TRACKER */}
        <div className="card hp-card">
          <h3>Hit Points</h3>
          <div style={{ textAlign: 'center', margin: '4px 0 14px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 700, color: dying ? 'var(--danger)' : 'var(--good)', lineHeight: 1 }}>
              {combat.currentHp}
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--muted)' }}> / {combat.maxHp}</span>
            {combat.tempHp > 0 && (
              <div className="mono" style={{ color: 'var(--tealbright)', marginTop: 2 }}>+{combat.tempHp} temporary</div>
            )}
          </div>

          {/* Damage / amount / Heal — one row of EQUAL-HEIGHT controls on a shared baseline.
              These were a plain flex row of a .btn, a bare <input> and a .btn, each with its own
              padding and border, so the input floated above the buttons. `.hp-row` gives every
              control the same height and centres them as one unit. */}
          <div className="hp-row">
            <button className="btn danger hp-ctl" onClick={() => adjustHp(-amt)}>− Damage</button>
            <input
              className="mono hp-ctl hp-amount"
              type="number"
              inputMode="numeric"
              aria-label="Amount of damage or healing"
              value={amt}
              onChange={(e) => setAmt(Math.max(0, Number(e.target.value) || 0))}
            />
            <button className="btn teal hp-ctl" onClick={() => adjustHp(amt)}>+ Heal</button>
          </div>

          <div className="hp-row hp-row-temp">
            <span className="hp-label">Temp HP</span>
            <button className="step hp-ctl" onClick={() => setTemp(combat.tempHp - 1)} aria-label="Less temp HP">−</button>
            <input
              className="mono hp-ctl hp-amount"
              type="number"
              inputMode="numeric"
              aria-label="Temporary hit points"
              value={combat.tempHp}
              onChange={(e) => setTemp(Number(e.target.value) || 0)}
            />
            <button className="step hp-ctl" onClick={() => setTemp(combat.tempHp + 1)} aria-label="More temp HP">+</button>
          </div>

          {editMode && (
            <div className="hp-row hp-row-temp">
              <span className="hp-label">Max HP</span>
              <input
                className="mono hp-ctl hp-amount"
                type="number"
                aria-label="Maximum hit points"
                value={combat.maxHp}
                onChange={(e) => setChar((c) => ({ ...c, combat: { ...c.combat, maxHp: Number(e.target.value) || 0 } }))}
              />
              <span className="hp-label">Current</span>
              <input
                className="mono hp-ctl hp-amount"
                type="number"
                aria-label="Current hit points"
                value={combat.currentHp}
                onChange={(e) => setChar((c) => ({ ...c, combat: { ...c.combat, currentHp: Number(e.target.value) || 0 } }))}
              />
            </div>
          )}

          {/* HIT DICE */}
          <div className="res-block" style={{ marginTop: 16 }}>
            <div className="res-head">
              <span className="rn">Hit Dice</span>
              <span className="rc">
                {combat.hitDiceRemaining}/{combat.hitDiceTotal} · d{combat.hitDiceSize}
              </span>
            </div>
            <button className="btn tiny gold" onClick={spendHitDie} disabled={combat.hitDiceRemaining <= 0}>
              Spend die → heal 1d{combat.hitDiceSize}+CON
            </button>
          </div>

          {/* REGENERATION — only for a character that actually declares `regen` (character-
              owned; this used to render for anyone who reached level 13). */}
          {char.regen && char.meta.level >= (char.regen.unlockLevel ?? 1) && (
            <div className="res-block" style={{ marginTop: 16 }}>
              <div className="res-head">
                <span className="rn">Regeneration</span>
                {char.regen.note && <span className="rc">{char.regen.note}</span>}
              </div>
              <button
                className="btn tiny teal"
                onClick={() => adjustHp(regenAmount)}
                disabled={combat.currentHp <= 0 || combat.currentHp >= combat.maxHp}
                title={char.regen.label}
              >
                ✚ Regenerate +{regenAmount} HP / turn
              </button>
            </div>
          )}

          {/* DEATH SAVES */}
          <div className="res-block" style={{ marginTop: 16 }}>
            <div className="res-head">
              <span className="rn">Death Saves</span>
              {combat.deathSaveBonus > 0 && <span className="rc">+{combat.deathSaveBonus} bonus</span>}
            </div>
            {/* SAVE and FAIL sat at opposite ends of a space-between row, so the two pip groups
                drifted apart as the card widened. They now sit on a shared two-column grid with
                their labels aligned. */}
            <div className="death-grid">
              <div className="death-line">
                <span className="hp-label death-ok">Save</span>
                <div className="pips">
                  {[1, 2, 3].map((i) => (
                    <button
                      key={i}
                      aria-label={`Death save success ${i}`}
                      className={`pip round teal ${i <= combat.deathSuccess ? 'filled' : ''}`}
                      onClick={() => setDeath('deathSuccess', combat.deathSuccess === i ? i - 1 : i)}
                    />
                  ))}
                </div>
              </div>
              <div className="death-line">
                <span className="hp-label death-bad">Fail</span>
                <div className="pips">
                  {[1, 2, 3].map((i) => (
                    <button
                      key={i}
                      aria-label={`Death save failure ${i}`}
                      className={`pip round ${i <= combat.deathFail ? 'filled' : ''}`}
                      onClick={() => setDeath('deathFail', combat.deathFail === i ? i - 1 : i)}
                    />
                  ))}
                </div>
              </div>
            </div>
            <button className="btn tiny danger" style={{ marginTop: 10 }} onClick={rollDeathSave}>
              🎲 Roll Death Save
            </button>
          </div>
        </div>

        {/* DEFENSES + REST */}
        <div className="card">
          <h3>Defenses</h3>
          <ul className="clean">
            <li>
              <strong>Armor Class {acInfo.ac}</strong> — {acInfo.fromEquipment ? `from ${acInfo.source}` : combat.acNote}
              {acInfo.fromEquipment && combat.ac !== acInfo.ac && <span className="hl-note"> (manual base {combat.ac})</span>}
            </li>
            <li>
              <strong>Initiative {signed(abilityMod(char.abilities.dex) + combat.initiativeMisc)}</strong> — DEX-based; roll it from the quick bar.
            </li>
            <li>
              <strong>
                Speed{' '}
                <EffectStar target="speed_walk" label="Walking speed">
                  {walkSpeed} ft
                </EffectStar>
              </strong>{' '}
              — {combat.speedNote}
            </li>
            {/* Species/class traits are character-owned — this list used to hardcode a
                single character's species traits onto every sheet. */}
            {(char.traits ?? []).map((t, i) => (
              <li key={i}>
                <RichRules text={t} />
                {canWrite && (
                  <ElementMenu
                    label="trait"
                    actions={[
                      { label: 'Edit trait', onClick: () => setEditingTrait({ index: i, text: t }) },
                      { label: 'Delete', danger: true, onClick: () => removeTrait(i) },
                    ]}
                  />
                )}
              </li>
            ))}
            {canWrite && (
              <li style={{ listStyle: 'none', marginTop: 6 }}>
                <button
                  className="btn tiny teal"
                  onClick={() => {
                    setChar((c) => ({ ...c, traits: [...(c.traits ?? []), 'New trait'] }))
                    setEditingTrait({ index: (char.traits ?? []).length, text: 'New trait' })
                  }}
                >
                  ＋ Add trait
                </button>
              </li>
            )}
          </ul>

          <div className="res-head" style={{ marginTop: 16 }}>
            <span className="rn">Rest</span>
            <span className="rc">recover resources</span>
          </div>
          <div className="btn-row">
            <button className="btn teal" onClick={shortRest} title="Restore short-rest resources">
              ☾ Short Rest
            </button>
            <button className="btn pink" onClick={() => { if (confirm(longRestPrompt)) longRest() }}>
              ★ Long Rest
            </button>
          </div>
        </div>
      </div>

      {editingTrait && <TraitEditor index={editingTrait.index} text={editingTrait.text} onClose={() => setEditingTrait(null)} />}
    </section>
  )
}
