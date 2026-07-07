import { useState } from 'react'
import { useChar } from '../state/store'
import { ABILITIES, SKILLS, abilityMod, signed, profContribution, type ProfLevel, type AbilityKey } from '../rules/dnd'
import type { CustomSkill } from '../types'
import SectionHead from './ui/SectionHead'

const PROF_ORDER: ProfLevel[] = ['none', 'proficient', 'expertise']

export default function SavesSkills() {
  const { char, pb, setChar, rollCheck } = useChar()
  const [newName, setNewName] = useState('')
  const [newAbil, setNewAbil] = useState<AbilityKey>('int')
  const [newProf, setNewProf] = useState<ProfLevel>('proficient')

  const customSkills = char.customSkills ?? []

  function addCustom() {
    const label = newName.trim()
    if (!label) return
    const cs: CustomSkill = { id: `cs-${Date.now()}`, label, ability: newAbil, prof: newProf, misc: 0 }
    setChar((c) => ({ ...c, customSkills: [...(c.customSkills ?? []), cs] }))
    setNewName('')
  }
  function cycleCustom(id: string) {
    setChar((c) => ({
      ...c,
      customSkills: (c.customSkills ?? []).map((cs) =>
        cs.id === id ? { ...cs, prof: PROF_ORDER[(PROF_ORDER.indexOf(cs.prof) + 1) % 3] } : cs,
      ),
    }))
  }
  function removeCustom(id: string) {
    setChar((c) => ({ ...c, customSkills: (c.customSkills ?? []).filter((cs) => cs.id !== id) }))
  }

  const passivePerception =
    10 +
    abilityMod(char.abilities.wis) +
    profContribution(char.skills.perception.prof, pb) +
    char.skills.perception.misc
  const saveDC = 8 + pb + abilityMod(char.abilities.str)

  function cycleSkill(key: string) {
    setChar((c) => {
      const order: ProfLevel[] = ['none', 'proficient', 'expertise']
      const cur = c.skills[key].prof
      const next = order[(order.indexOf(cur) + 1) % order.length]
      return { ...c, skills: { ...c.skills, [key]: { ...c.skills[key], prof: next } } }
    })
  }

  function toggleSave(key: (typeof ABILITIES)[number]['key']) {
    setChar((c) => ({
      ...c,
      saves: { ...c.saves, [key]: { ...c.saves[key], proficient: !c.saves[key].proficient } },
    }))
  }

  return (
    <section id="core">
      <SectionHead num="03" title="Saves & Skills" />
      <p className="lead">
        Tap any row to roll. Advantage / Disadvantage from the Dice Tray applies; <em className="term">Danger Sense</em>{' '}
        auto-grants advantage on Dexterity saves. Passive Perception <strong>{passivePerception}</strong> · Save DC{' '}
        <strong>{saveDC}</strong> (Surge / psi — 8 + prof + STR).
      </p>

      <div className="two">
        {/* SAVING THROWS */}
        <div className="card">
          <h3>Saving Throws</h3>
          <div className="rowlist">
            {ABILITIES.map((a) => {
              const s = char.saves[a.key]
              const mod = abilityMod(char.abilities[a.key]) + (s.proficient ? pb : 0) + s.misc
              const isDex = a.key === 'dex'
              return (
                <div className="rrow" key={a.key}>
                  <button
                    className={`prof-dot ${s.proficient ? 'on' : ''}`}
                    onClick={() => toggleSave(a.key)}
                    title="Click to toggle proficiency"
                    style={{ cursor: 'pointer' }}
                  />
                  <div className="rlabel">
                    {a.full}
                    {isDex && <span className="rabil">DANGER SENSE · ADV</span>}
                  </div>
                  <div className="rmod">{signed(mod)}</div>
                  <button
                    className="rollbtn"
                    onClick={() => rollCheck(`${a.label} Save`, mod, { kind: 'save', advantage: isDex, tag: isDex ? 'Danger Sense' : undefined })}
                  >
                    {signed(mod)}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* SKILLS */}
        <div className="card">
          <h3>Skills</h3>
          <div className="rowlist">
            {SKILLS.map((sk) => {
              const st = char.skills[sk.key]
              const abil = ABILITIES.find((a) => a.key === sk.ability)!
              const mod = abilityMod(char.abilities[sk.ability]) + profContribution(st.prof, pb) + st.misc
              // Base Form ("The Kid") is small and unassuming → advantage on Stealth.
              // The larger Surge forms (Brute, Titan…) are anything but subtle.
              const stealthAdv = sk.key === 'stealth' && char.activeFormId === 'base'
              return (
                <div className="rrow" key={sk.key}>
                  <button
                    className={`prof-dot ${st.prof === 'proficient' ? 'on' : st.prof === 'expertise' ? 'exp' : ''}`}
                    onClick={() => cycleSkill(sk.key)}
                    title="Click to cycle: none → proficient → expertise"
                    style={{ cursor: 'pointer' }}
                  />
                  <div className="rlabel">
                    {sk.label}
                    <span className="rabil">{abil.label}</span>
                    {stealthAdv && <span className="rabil" style={{ color: 'var(--tealbright)' }}>BASE FORM · ADV</span>}
                  </div>
                  <button
                    className="rollbtn"
                    onClick={() => rollCheck(`${sk.label}`, mod, { advantage: stealthAdv, tag: stealthAdv ? 'Base Form' : abil.label })}
                  >
                    {signed(mod)}
                  </button>
                </div>
              )
            })}

            {/* Custom checks */}
            {customSkills.map((cs) => {
              const abil = ABILITIES.find((a) => a.key === cs.ability)!
              const mod = abilityMod(char.abilities[cs.ability]) + profContribution(cs.prof, pb) + cs.misc
              return (
                <div className="rrow" key={cs.id}>
                  <button
                    className={`prof-dot ${cs.prof === 'proficient' ? 'on' : cs.prof === 'expertise' ? 'exp' : ''}`}
                    onClick={() => cycleCustom(cs.id)}
                    title="Click to cycle: none → proficient → expertise"
                    style={{ cursor: 'pointer' }}
                  />
                  <div className="rlabel">
                    {cs.label}
                    <span className="rabil">{abil.label} · custom</span>
                  </div>
                  <button className="rollbtn" onClick={() => rollCheck(cs.label, mod, { tag: abil.label })}>
                    {signed(mod)}
                  </button>
                  <button className="btn tiny danger" onClick={() => removeCustom(cs.id)} title="Delete this check" style={{ marginLeft: 6 }}>
                    ✕
                  </button>
                </div>
              )
            })}
          </div>

          {/* Add a custom check */}
          <div className="add-check">
            <input
              placeholder="New check name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustom()}
            />
            <select value={newAbil} onChange={(e) => setNewAbil(e.target.value as AbilityKey)} title="Governing ability">
              {ABILITIES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
            <select value={newProf} onChange={(e) => setNewProf(e.target.value as ProfLevel)} title="Proficiency">
              <option value="none">Untrained</option>
              <option value="proficient">Proficient</option>
              <option value="expertise">Expertise</option>
            </select>
            <button className="btn tiny teal" onClick={addCustom}>
              + Add
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
