import { useChar } from '../state/store'
import { abilityMod } from '../rules/dnd'
import SectionHead from './ui/SectionHead'

export default function FormAbilities() {
  const { char, abilities, pb, activeFormId, useFormAbility, rollDmg } = useChar()
  const form = char.forms.find((f) => f.id === activeFormId)
  const surged = char.combat.transformActive
  // Effective STR (Slice 10/25): when transformed, `abilities` already folds the form's imposed STR
  // (a Titan form sets STR to 25) plus items — so the form's ability DC uses the form's strength, not
  // the base character's.
  const saveDC = 8 + pb + abilityMod(abilities.str)

  if (!form?.abilities?.length) return null

  return (
    <section id="form-abilities">
      <SectionHead num="06" title={`${form.name.split('—').pop()?.trim()} — Abilities`} />
      <p className="lead">
        {surged
          ? `Surged for ${char.combat.transformTurnsLeft} more turn${char.combat.transformTurnsLeft === 1 ? '' : 's'}. `
          : 'This is your current form. '}
        Limited abilities show <strong>uses per Surge</strong>; at-will ones last until the form ends.
      </p>
      <div className="card">
        {form.abilities.map((ab) => {
          const limited = ab.uses !== undefined
          const remaining = limited ? char.combat.abilityUses[ab.id] ?? ab.uses ?? 0 : null
          const canUse = !limited || (surged && remaining! > 0)
          const dcNote = ab.attack?.saveAbility ? ` · DC ${saveDC} ${ab.attack.saveAbility.toUpperCase()}` : ''
          return (
            <div className="ability-row" key={ab.id}>
              <div className="ability-main">
                <div className="ability-name">
                  {ab.name}
                  {limited ? (
                    <span className="tag" style={{ color: canUse ? 'var(--pink)' : 'var(--muted)' }}>
                      {remaining}/{ab.uses} per Surge
                    </span>
                  ) : (
                    <span className="tag equipped">At-will</span>
                  )}
                </div>
                <div className="inv-desc">
                  {ab.desc}
                  {ab.attack && (
                    <>
                      {' '}
                      <span style={{ color: 'var(--gold)' }}>
                        [{ab.attack.damage} {ab.attack.damageType}
                        {ab.attack.aoe ? ` · ${ab.attack.aoe}` : ''}
                        {dcNote}]
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="btn-row">
                {ab.attack && (
                  <button
                    className="rollbtn pink"
                    disabled={!canUse}
                    title={!canUse ? (limited && !surged ? 'Surge to use this' : 'No uses left') : 'Roll it'}
                    onClick={() => {
                      rollDmg(ab.name, ab.attack!.damage, { tag: `${ab.attack!.aoe ?? ''} ${ab.attack!.damageType}`.trim() })
                      // useFormAbility is a store action ("spend a use"), not a React hook — safe in a callback.
                      // eslint-disable-next-line react-hooks/rules-of-hooks
                      if (limited) useFormAbility(ab.id)
                    }}
                  >
                    Roll
                  </button>
                )}
                {limited && !ab.attack && (
                  // eslint-disable-next-line react-hooks/rules-of-hooks -- store action, not a hook
                  <button className="btn tiny" disabled={!canUse} onClick={() => useFormAbility(ab.id)} title={!canUse ? 'Surge to use this' : 'Spend a use'}>
                    Use
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
