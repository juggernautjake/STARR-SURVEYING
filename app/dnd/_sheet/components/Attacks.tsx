import { useState } from 'react'
import { useChar } from '../state/store'
import { useSheetModule } from '../state/sheetConfig'
import { isItemActive } from '@/lib/dnd/effects/ledger'
import { abilityMod, signed } from '../rules/dnd'
import type { Attack } from '../types'
import SectionHead from './ui/SectionHead'
import ElementMenu from './ui/ElementMenu'
import AttackEditor from './ui/AttackEditor'
import EffectStar from './ui/EffectStar'
import EditMark from './ui/EditMark'

export default function Attacks() {
  const { char, abilities, pb, critMin, activeFormId, rollCheck, rollDmg, transformActive, recklessActive, canWrite, setChar, ledger } = useChar()
  const [editing, setEditing] = useState<Attack | null>(null)

  const duplicate = (a: Attack) =>
    setChar((c) => ({
      ...c,
      attacks: [...c.attacks, { ...a, id: `${a.id}-copy-${c.attacks.length}`, name: `${a.name} (copy)` }],
    }))
  const remove = (a: Attack) => {
    if (!confirm(`Delete “${a.name}”? This cannot be undone.`)) return
    setChar((c) => ({ ...c, attacks: c.attacks.filter((x) => x.id !== a.id) }))
  }
  const hasReckless = useSheetModule('reckless')
  const activeForm = char.forms.find((f) => f.id === activeFormId)
  // Damage dice scaling is declared BY THE ATTACK, not by hardcoded ids: an attack can follow
  // the active form's strike die and/or a per-level ladder. Anything else uses its flat damage.
  const dieFor = (a: (typeof char.attacks)[number]) => {
    if (a.usesFormStrikeDie) return activeForm?.strikeDie ?? a.damage
    if (a.damageByLevel?.length) {
      return a.damageByLevel.reduce((acc, e) => (char.meta.level >= e.level ? e.damage : acc), a.damage)
    }
    return a.damage
  }
  const hasFormStrike = char.attacks.some((a) => a.usesFormStrikeDie)

  // Attacks GRANTED by an equipped item (Slice 11 grant-half) — a flaming sword's Flame Lash. Full,
  // rollable Attacks, rendered through the SAME row logic as owned attacks (so their to-hit/damage
  // can't drift), badged to their item, with no ⋯ menu (on loan) and gone on unequip.
  const grantedAttacks = (char.inventory ?? [])
    .filter((i) => isItemActive(i) && i.grantsAttack)
    .map((i) => ({ atk: i.grantsAttack as Attack, source: i.name }))

  const rows: { a: Attack; granted: boolean; source?: string }[] = [
    ...char.attacks.map((a) => ({ a, granted: false, source: undefined })),
    ...grantedAttacks.map(({ atk, source }) => ({ a: atk, granted: true, source })),
  ]

  return (
    <section id="attacks">
      <SectionHead num="05" title="Attacks" />
      <p className="lead">
        Tap <strong>Hit</strong> to roll to-hit, <strong>Dmg</strong> for damage.{' '}
        {hasFormStrike && (
          <>
            Your unarmed die scales with your active form (<strong>{activeForm?.strikeDie ?? '1d6'}</strong>); AOE /
            signature strikes live on the Forms tab.{' '}
          </>
        )}
        {transformActive && char.combat.formDamageBonus > 0 && (
          <span className="hl-note">Transformed: +{char.combat.formDamageBonus} damage on boosted attacks. </span>
        )}
        {recklessActive && <span className="hl-note">Reckless: advantage on STR melee. </span>}
        Crit doubles the damage dice.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Attack</th>
              <th>Range</th>
              <th>To Hit / DC</th>
              <th>Damage</th>
              <th style={{ width: 200 }}>Roll</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, granted, source }) => {
              // Guard the ability key. An attack whose `ability` is missing or bogus (an AI edit
              // that dropped the field, a bad import) would otherwise compute abilityMod(undefined)
              // = NaN and render "-NaN" for to-hit and no damage bonus. A wrong-but-sane number is
              // still wrong, but a NaN on the sheet is alarming and looks like data loss. Fall back
              // to STR and carry on.
              const abilityKey = abilities[a.ability] != null ? a.ability : 'str'
              const mod = abilityMod(abilities[abilityKey])
              // Fold the ledger's GLOBAL attack-bonus targets (a +N-to-all-attacks item, a Bless-style
              // bonus) — the per-attack bonusToHit already handles a specific weapon's +N. No-op without them.
              const toHit = mod + (a.proficient ? pb : 0) + (a.bonusToHit ?? 0)
                + ledger.value('attack_roll', 0) + ledger.value('attack_and_damage', 0)
              const die = dieFor(a)
              const isSave = !!a.saveBased
              // Per-attack DC: a flat override wins; otherwise 8 + PB + the chosen ability's mod
              // (STR by default). Lets a spell or special weapon set its own hit DC (Slice 33).
              const saveDC = a.saveDcOverride ?? (8 + pb + abilityMod(abilities[a.saveDcAbility ?? 'str']))
              const dmgFlat = isSave ? 0 : mod + (a.bonusDamage ?? 0) // AOE dice don't add the ability mod
              const brute = a.formOnly === 'brute'
              const active = !a.formOnly || activeFormId === a.formOnly
              const req = a.unlockLevel ?? 1
              const locked = req > char.meta.level
              const dmgLabel = isSave
                ? die
                : `${die}${dmgFlat ? signed(dmgFlat).replace('+', ' + ').replace('−', ' − ') : ''}`
              return (
                <tr key={granted ? `granted-${source}-${a.id}` : a.id} className={brute ? 'here' : undefined} style={{ opacity: locked ? 0.4 : active ? 1 : 0.55 }}>
                  <td>
                    {a.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.image} alt="" className="inv-thumb" />
                    )}
                    {locked ? (
                      <strong style={{ color: 'var(--muted)' }}>
                        <span className="lock-badge" style={{ marginRight: 8 }}>🔒 Lv {req}</span>
                        {a.name}
                      </strong>
                    ) : (
                      <strong
                        className="atk-name"
                        onClick={() =>
                          isSave
                            ? rollDmg(`${a.name} — damage`, die, { tag: `${a.aoe ?? 'AOE'} · ${a.damageType}` })
                            : rollCheck(`${a.name} — to hit`, toHit, { kind: 'attack', strMelee: a.strMelee })
                        }
                        title={isSave ? 'Roll area damage' : 'Roll to hit'}
                      >
                        {a.name}
                      </strong>
                    )}
                    <EditMark on={a.customized} />
                    {a.notes && <div className="inv-desc">{a.notes}</div>}
                    {/* A granted attack is on loan from its item — badged, and never editable here
                        (change it on the item). Owned attacks get the ⋯ menu (Slice 27). */}
                    {granted ? (
                      <span className="tag" style={{ marginLeft: 8, color: 'var(--tealbright)' }} title={`Granted by ${source}`}>
                        granted · {source}
                      </span>
                    ) : (
                      canWrite && (
                        <ElementMenu
                          label={a.name}
                          actions={[
                            { label: 'Edit attack', onClick: () => setEditing(a) },
                            { label: 'Duplicate', onClick: () => duplicate(a) },
                            { label: 'Delete', danger: true, onClick: () => remove(a) },
                          ]}
                        />
                      )
                    )}
                  </td>
                  <td className="mono">{a.range}</td>
                  <td className="mono">
                    {locked ? (
                      '—'
                    ) : isSave ? (
                      <EffectStar target={`ability_${a.saveDcAbility ?? 'str'}`} label={`${a.name} DC`}>
                        {`DC ${saveDC} ${a.saveAbility?.toUpperCase()}`}
                      </EffectStar>
                    ) : (
                      <EffectStar target={`ability_${abilityKey}`} label={`${a.name} to hit`}>
                        {signed(toHit)}
                        {critMin < 20 && (
                          <span className="hl-note" style={{ marginLeft: 6 }} title={`Critical hit on a natural ${critMin}–20`}>
                            crit {critMin}–20
                          </span>
                        )}
                      </EffectStar>
                    )}
                  </td>
                  <td className="mono">
                    {locked ? '—' : dmgLabel}
                    <div className="inv-desc" style={{ color: 'var(--muted)' }}>{a.damageType}</div>
                  </td>
                  <td>
                    {locked ? (
                      <span className="muted mono" style={{ fontSize: 12 }}>Locked</span>
                    ) : isSave ? (
                      <div className="btn-row">
                        <button
                          className="rollbtn pink"
                          onClick={() => rollDmg(`${a.name} — damage`, die, { tag: `${a.aoe ?? 'AOE'} · ${a.damageType}` })}
                          title="Roll area damage (targets save for half)"
                        >
                          Dmg (AOE)
                        </button>
                      </div>
                    ) : (
                      <div className="btn-row">
                        <button
                          className="rollbtn"
                          onClick={() => rollCheck(`${a.name} — to hit`, toHit, { kind: 'attack', strMelee: a.strMelee })}
                          title={active ? '' : `Requires ${a.formOnly} form (rolling anyway)`}
                        >
                          Hit
                        </button>
                        <button
                          className="rollbtn pink"
                          onClick={() => rollDmg(`${a.name} — damage`, die, { flat: dmgFlat, formBoosted: a.formBoosted, tag: a.damageType })}
                        >
                          Dmg
                        </button>
                        <button
                          className="rollbtn gold"
                          onClick={() => rollDmg(`${a.name} — CRIT`, die, { flat: dmgFlat, formBoosted: a.formBoosted, crit: true, tag: a.damageType })}
                          title="Critical hit — double the dice"
                        >
                          Crit
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button
            className="btn tiny teal"
            onClick={() => {
              // A blank attack the player then edits — same shape as any other, so nothing
              // downstream can tell a hand-made one from a seeded one.
              const a: Attack = {
                id: `atk-${Date.now().toString(36)}`,
                name: 'New attack',
                ability: 'str',
                proficient: true,
                range: 'Melee (reach 5 ft)',
                damage: '1d6',
                damageType: 'bludgeoning',
              }
              setChar((c) => ({ ...c, attacks: [...c.attacks, a] }))
              setEditing(a)
            }}
          >
            ＋ Add attack
          </button>
        </div>
      )}

      {editing && <AttackEditor attack={editing} onClose={() => setEditing(null)} />}

      {/* Reckless Attack is a Barbarian feature — only shown to characters whose
          sheet_type registers the `reckless` module (see registry.ts). */}
      {hasReckless && (
        <div className="callout pink">
          <h4>Reckless Attack (L2)</h4>
          <p>
            Toggle <strong>Reckless</strong> in the Dice Tray before your first attack: Advantage on all STR melee
            attacks this turn, but attacks against you have Advantage until your next turn. The sheet applies the
            advantage to your STR melee rolls automatically.
          </p>
        </div>
      )}
    </section>
  )
}
