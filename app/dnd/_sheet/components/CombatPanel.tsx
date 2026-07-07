import { useState } from 'react'
import { useChar } from '../state/store'
import { abilityMod, signed } from '../rules/dnd'
import SectionHead from './ui/SectionHead'

export default function CombatPanel() {
  const { char, setChar, editMode, adjustHp, rollDeathSave, spendHitDie, shortRest, longRest } = useChar()
  const { combat } = char
  const [amt, setAmt] = useState(5)

  const dying = combat.currentHp <= 0

  const setTemp = (v: number) => setChar((c) => ({ ...c, combat: { ...c.combat, tempHp: Math.max(0, v) } }))
  const setDeath = (kind: 'deathSuccess' | 'deathFail', v: number) =>
    setChar((c) => ({ ...c, combat: { ...c.combat, [kind]: v } }))

  return (
    <section id="combat">
      <SectionHead num="04" title="Vitals & Defenses" />
      <div className="two">
        {/* HP TRACKER */}
        <div className="card">
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

          <div className="flex center gap" style={{ justifyContent: 'center', marginBottom: 12 }}>
            <button className="btn danger" onClick={() => adjustHp(-amt)}>
              − Damage
            </button>
            <input
              className="mono"
              type="number"
              value={amt}
              onChange={(e) => setAmt(Math.max(0, Number(e.target.value) || 0))}
              style={{ width: 70, textAlign: 'center' }}
            />
            <button className="btn teal" onClick={() => adjustHp(amt)}>
              + Heal
            </button>
          </div>

          <div className="hp-editline">
            <span className="muted mono" style={{ fontSize: 11 }}>TEMP HP</span>
            <button className="step" onClick={() => setTemp(combat.tempHp - 1)}>−</button>
            <input className="mono" type="number" value={combat.tempHp} onChange={(e) => setTemp(Number(e.target.value) || 0)} />
            <button className="step" onClick={() => setTemp(combat.tempHp + 1)}>+</button>
          </div>

          {editMode && (
            <div className="hp-editline" style={{ marginTop: 10 }}>
              <span className="muted mono" style={{ fontSize: 11 }}>MAX HP</span>
              <input
                className="mono"
                type="number"
                value={combat.maxHp}
                onChange={(e) => setChar((c) => ({ ...c, combat: { ...c.combat, maxHp: Number(e.target.value) || 0 } }))}
              />
              <span className="muted mono" style={{ fontSize: 11 }}>CUR</span>
              <input
                className="mono"
                type="number"
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

          {/* REGENERATION (Lv 13+) */}
          {char.meta.level >= 13 && (
            <div className="res-block" style={{ marginTop: 16 }}>
              <div className="res-head">
                <span className="rn">Regeneration</span>
                <span className="rc">while raging · Lv 13+</span>
              </div>
              <button
                className="btn tiny teal"
                onClick={() => adjustHp(Math.max(1, abilityMod(char.abilities.con)))}
                disabled={combat.currentHp <= 0 || combat.currentHp >= combat.maxHp}
                title="Regenerative Biology — regain CON modifier HP at the start of your turn while raging"
              >
                ✚ Regenerate +{Math.max(1, abilityMod(char.abilities.con))} HP / turn
              </button>
            </div>
          )}

          {/* DEATH SAVES */}
          <div className="res-block" style={{ marginTop: 16 }}>
            <div className="res-head">
              <span className="rn">Death Saves</span>
              <span className="rc">+{combat.deathSaveBonus} · Beyond the Limit</span>
            </div>
            <div className="flex between center" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="flex center gap">
                <span className="mono" style={{ color: 'var(--good)', fontSize: 12 }}>SAVE</span>
                <div className="pips">
                  {[1, 2, 3].map((i) => (
                    <button
                      key={i}
                      className={`pip round teal ${i <= combat.deathSuccess ? 'filled' : ''}`}
                      onClick={() => setDeath('deathSuccess', combat.deathSuccess === i ? i - 1 : i)}
                    />
                  ))}
                </div>
              </div>
              <div className="flex center gap">
                <span className="mono" style={{ color: 'var(--danger)', fontSize: 12 }}>FAIL</span>
                <div className="pips">
                  {[1, 2, 3].map((i) => (
                    <button
                      key={i}
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
              <strong>Armor Class {combat.ac}</strong> — {combat.acNote}
            </li>
            <li>
              <strong>Initiative {signed(abilityMod(char.abilities.dex) + combat.initiativeMisc)}</strong> — DEX-based; roll it from the quick bar.
            </li>
            <li>
              <strong>Speed {combat.speed} ft</strong> — {combat.speedNote}
            </li>
            <li>
              <strong>Damage Resistance</strong> <span className="rage-only">(while Raging)</span>: bludgeoning, piercing, slashing.
            </li>
            <li>
              <strong>Darkvision 60 ft</strong> · <strong>Adv vs Frightened</strong> (Surge Blood) · <strong>+PB to death saves</strong> (Beyond the Limit).
            </li>
          </ul>

          <div className="res-head" style={{ marginTop: 16 }}>
            <span className="rn">Rest</span>
            <span className="rc">recover resources</span>
          </div>
          <div className="btn-row">
            <button className="btn teal" onClick={shortRest} title="Restore short-rest resources">
              ☾ Short Rest
            </button>
            <button className="btn pink" onClick={() => { if (confirm('Take a long rest? Restores HP, hit dice, rages, lasers, death saves.')) longRest() }}>
              ★ Long Rest
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
