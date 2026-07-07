import { useChar } from '../state/store'
import { abilityMod, signed } from '../rules/dnd'
import SectionHead from './ui/SectionHead'

export default function Attacks() {
  const { char, pb, rollCheck, rollDmg, transformActive, recklessActive } = useChar()
  const activeForm = char.forms.find((f) => f.id === char.activeFormId)
  // Basic-attack dice scale: fist follows your form's strike die; laser follows level.
  const dieFor = (a: (typeof char.attacks)[number]) => {
    if (a.id === 'fist') return activeForm?.strikeDie ?? a.damage
    if (a.id === 'laser') return char.meta.level >= 6 ? '1d10' : '1d8'
    return a.damage
  }

  return (
    <section id="attacks">
      <SectionHead num="05" title="Attacks" />
      <p className="lead">
        Tap <strong>Hit</strong> to roll to-hit, <strong>Dmg</strong> for damage. Your fist die scales with your active
        form (<strong>{activeForm?.strikeDie ?? '1d6'}</strong>); AOE / signature strikes live on the Forms tab.{' '}
        {transformActive && <span className="rage-only">Surged: +{char.combat.rageDamageBonus} damage on STR attacks. </span>}
        {recklessActive && <span className="rage-only">Reckless: advantage on STR melee. </span>}
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
            {char.attacks.map((a) => {
              const mod = abilityMod(char.abilities[a.ability])
              const toHit = mod + (a.proficient ? pb : 0) + (a.bonusToHit ?? 0)
              const die = dieFor(a)
              const isSave = !!a.saveBased
              const saveDC = 8 + pb + abilityMod(char.abilities.str)
              const dmgFlat = isSave ? 0 : mod + (a.bonusDamage ?? 0) // AOE dice don't add the ability mod
              const brute = a.formOnly === 'brute'
              const active = !a.formOnly || char.activeFormId === a.formOnly
              const req = a.unlockLevel ?? 1
              const locked = req > char.meta.level
              const dmgLabel = isSave
                ? die
                : `${die}${dmgFlat ? signed(dmgFlat).replace('+', ' + ').replace('−', ' − ') : ''}`
              return (
                <tr key={a.id} className={brute ? 'here' : undefined} style={{ opacity: locked ? 0.4 : active ? 1 : 0.55 }}>
                  <td>
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
                    {a.notes && <div className="inv-desc">{a.notes}</div>}
                  </td>
                  <td className="mono">{a.range}</td>
                  <td className="mono">
                    {locked ? '—' : isSave ? `DC ${saveDC} ${a.saveAbility?.toUpperCase()}` : signed(toHit)}
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
                          onClick={() => rollDmg(`${a.name} — damage`, die, { flat: dmgFlat, rageable: a.rageable, tag: a.damageType })}
                        >
                          Dmg
                        </button>
                        <button
                          className="rollbtn gold"
                          onClick={() => rollDmg(`${a.name} — CRIT`, die, { flat: dmgFlat, rageable: a.rageable, crit: true, tag: a.damageType })}
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

      <div className="callout pink">
        <h4>Reckless Attack (L2)</h4>
        <p>
          Toggle <strong>Reckless</strong> in the Dice Tray before your first attack: Advantage on all STR melee attacks
          this turn, but attacks against you have Advantage until your next turn. The sheet applies the advantage to your
          fist and Brute Slam rolls automatically.
        </p>
      </div>
    </section>
  )
}
