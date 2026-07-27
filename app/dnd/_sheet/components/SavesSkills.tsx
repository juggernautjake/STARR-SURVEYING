import { useMemo, useState } from 'react'
import { useChar } from '../state/store'
import { useSheetSystem } from '../state/sheetConfig'
import { systemSkills } from '@/lib/dnd/system-rules'
import { normalizeSystem, systemLabel } from '@/lib/dnd/systems'
import { logManualEdit } from '../lib/log-edit'
import { ABILITIES, SKILLS, abilityMod, signed, profContribution, type ProfLevel, type AbilityKey } from '../rules/dnd'
import { rollEffectSources } from '../lib/roll-effects'
import type { CustomSkill } from '../types'
import SectionHead from './ui/SectionHead'
import EffectStar from './ui/EffectStar'

const PROF_ORDER: ProfLevel[] = ['none', 'proficient', 'expertise']

export default function SavesSkills() {
  const { char, abilities, pb, saveDc, setChar, rollCheck, ledger, activeFormId, characterId } = useChar()
  // Proficiencies granted by an active effect (Slice 11 grant-half): a pendant that grants longsword
  // proficiency, a boon that grants a language. The ledger collects them with their source; this is
  // their home on the sheet — a granted target that renders nowhere is a lie the engine tells.
  const grantedProfs = ledger.collected('grant_proficiency')

  // Does this character's system have a DIFFERENT skill list from the 5e one rendered below? Derived from
  // the shared rules catalog rather than a hardcoded list of systems, so a fifth system is covered the day
  // its skills are authored. Compared by NAME, case-insensitively: 5e's own entries must not trip it.
  const sheetSystem = useSheetSystem()
  const foreignSkillList = useMemo(() => {
    const key = normalizeSystem(sheetSystem)
    const own = systemSkills(key)
    if (!own.length) return null                                   // untracked system → nothing to claim
    const mine = new Set(SKILLS.map((s) => s.label.toLowerCase()))
    const missing = own.filter((s) => !mine.has(s.name.toLowerCase()))
    if (!missing.length) return null                               // 5e (both editions) → identical, no note
    return { label: systemLabel(key), sample: missing.slice(0, 3).map((s) => s.name).join(', ') }
  }, [sheetSystem])

  // THE SYSTEM'S OWN SKILL LIST, rendered rather than merely announced.
  //
  // This was deferred as needing "a system-keyed skill-proficiency store, which is larger than a drop-in" —
  // on the premise that `char.skills` is a fixed 5e-keyed shape. It is not: the type is
  // `Record<string, SkillState>` and `normalizeCharacter` merges it as a plain map, so an IG character can
  // hold `arcane`/`appraise`/`bluff` today with no schema change at all. The estimate was written from the
  // component (which iterates a hardcoded `SKILLS`), not from the store it writes to.
  //
  // So the real work is this list plus a default for a key the character has never touched — the same
  // shape as any other progressive field. 5e keeps the exact rows it always had, since `systemSkills`
  // returns the identical list for both editions.
  const rows = useMemo(() => {
    const own = systemSkills(normalizeSystem(sheetSystem))
    if (!own.length) return SKILLS                                 // untracked → the 5e list, as before
    const byLabel = new Map(SKILLS.map((s) => [s.label.toLowerCase(), s]))
    return own.map((s) => {
      // Reuse the 5e row when the name matches, so a shared skill keeps its established key — an IG
      // character's "Athletics" must not become a second, empty skill beside the one it already had.
      const shared = byLabel.get(s.name.toLowerCase())
      if (shared) return shared
      return { key: s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label: s.name, ability: s.ability as AbilityKey }
    })
  }, [sheetSystem])

  /** A skill the character has never touched has no stored state; treat it as untrained rather than crash. */
  const stateOf = (key: string) => char.skills[key] ?? { prof: 'none' as ProfLevel, misc: 0 }
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

  // OR the ledger's advantage/disadvantage flags across several roll targets (e.g. a specific save +
  // all_saves) so an effect that grants advantage on a save/skill actually reaches the roll — the
  // hardcoded feature flags (Danger Sense, Base Form) are combined with these. Empty when nothing grants.
  const rollFlagsUnion = (...targets: string[]) =>
    targets.reduce(
      (acc, t) => { const f = ledger.rollFlags(t); return { advantage: acc.advantage || f.advantage, disadvantage: acc.disadvantage || f.disadvantage } },
      { advantage: false, disadvantage: false },
    )

  // Passive Perception and the Save DC read the LEDGER-effective abilities (like the saves + skills
  // below do), not the base scores — otherwise a WIS- or STR-boosting item would move every save and
  // skill on this card but silently leave these two stale.
  const passivePerception =
    10 +
    abilityMod(abilities.wis) +
    // Defensive: a system whose list has no "Perception" (or a character that has never touched it)
    // has no stored entry, and this card must still render.
    profContribution(stateOf('perception').prof, pb) +
    stateOf('perception').misc
  const saveDC = saveDc // single source (store) — honors the manual override, like the StatRail does

  // AUDITED, because these are BUILD changes, not play state.
  //
  // Both were direct `setChar` calls reaching none of the element editors, so clicking a proficiency dot
  // silently changed the character and the DM's review queue never heard about it — the same gap
  // `InlineNumber` had. Proficiency and expertise are exactly the kind of thing a DM reviews: they move
  // every roll with that skill, and expertise is a class feature's worth of value.
  //
  // Deliberately NOT audited elsewhere on this sheet: HP spent, slots used, conditions and prepared
  // toggles are how a character is PLAYED, not how it is built, and logging them would bury the build
  // changes the queue exists to surface.
  function cycleSkill(key: string) {
    const order: ProfLevel[] = ['none', 'proficient', 'expertise']
    const cur = stateOf(key).prof
    const next = order[(order.indexOf(cur) + 1) % order.length]
    logManualEdit(characterId, `skill.${key}.prof`, cur, next)
    // `stateOf` supplies the default for a key this character has never touched, so a new system skill
    // does not land without a `misc`.
    setChar((c) => ({ ...c, skills: { ...c.skills, [key]: { ...(c.skills[key] ?? { prof: 'none' as ProfLevel, misc: 0 }), prof: next } } }))
  }

  function toggleSave(key: (typeof ABILITIES)[number]['key']) {
    const next = !char.saves[key].proficient
    logManualEdit(characterId, `save.${key}.proficient`, char.saves[key].proficient, next)
    setChar((c) => ({ ...c, saves: { ...c.saves, [key]: { ...c.saves[key], proficient: next } } }))
  }

  return (
    <section id="core">
      <SectionHead num="03" title="Saves & Skills" optionsTip="Whether conditions, stances & exhaustion fold into these rolls is set by auto-mechanics (and the Dice Tray's vanilla toggle)" />
      <p className="lead">
        Tap any row to roll. Advantage / Disadvantage from the Dice Tray applies. Passive Perception{' '}
        <EffectStar target="ability_wis" label="Passive Perception"><strong>{passivePerception}</strong></EffectStar> · Save DC{' '}
        <EffectStar target="ability_str" label="Save DC"><strong>{saveDC}</strong></EffectStar>.
      </p>

      <div className="two">
        {/* SAVING THROWS */}
        <div className="card">
          <h2>Saving Throws</h2>
          <div className="rowlist">
            {ABILITIES.map((a) => {
              const s = char.saves[a.key]
              // Fold the ledger's save-bonus targets (a Cloak of Protection's +1 all saves, an item's
              // +2 to a specific save) — like initiative/death_save fold theirs. No-op when nothing grants
              // them, so no current character changes; it just makes those effects actually reach the roll.
              const mod = abilityMod(abilities[a.key]) + (s.proficient ? pb : 0) + s.misc
                + ledger.value(`${a.key}_saves`, 0) + ledger.value('all_saves', 0)
              const isDex = a.key === 'dex'
              const saveEf = rollFlagsUnion(`${a.key}_saves`, 'all_saves') // ledger advantage/disadvantage on this save
              const saveSrc = rollEffectSources(ledger, `${a.key}_saves`, 'all_saves') // named sources → shown on the roll
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
                    {/* Watch the ability AND the save-bonus targets the roll folds (line ~97): a
                        Cloak of Protection's `all_saves` +1 moves the number, so the ★ must light for it. */}
                    <EffectStar target={[`ability_${a.key}`, `${a.key}_saves`, 'all_saves']} label={`${a.full} save`} />
                    {isDex && <span className="rabil">DANGER SENSE · ADV</span>}
                  </div>
                  <div className="rmod">{signed(mod)}</div>
                  <button
                    className="rollbtn"
                    onClick={() => rollCheck(`${a.label} Save`, mod, { kind: 'save', advantage: isDex || saveEf.advantage, disadvantage: saveEf.disadvantage, disSources: saveSrc.disadvantage, advSources: saveSrc.advantage, tag: isDex ? 'Danger Sense' : undefined })}
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
          <h2>Skills</h2>
          {/* The rows above are now THIS SYSTEM's skills, so the "these are 5e's skills" warning that used
              to sit here has been removed rather than reworded — it would now be false. What remains worth
              saying is only which list you are looking at, and only when it is not the 5e one. */}
          {foreignSkillList && (
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6, lineHeight: 1.45 }}>
              {foreignSkillList.label} skills — including {foreignSkillList.sample}.
            </div>
          )}
          <div className="rowlist">
            {rows.map((sk) => {
              const st = stateOf(sk.key)
              const abil = ABILITIES.find((a) => a.key === sk.ability)!
              const mod = abilityMod(abilities[sk.ability]) + profContribution(st.prof, pb) + st.misc
                + ledger.value(`skill.${sk.key}`, 0) + ledger.value('all_skills', 0)
              // Base Form ("The Kid") is small and unassuming → advantage on Stealth.
              // The larger Surge forms (Brute, Titan…) are anything but subtle.
              const stealthAdv = sk.key === 'stealth' && activeFormId === 'base'
              const skillEf = rollFlagsUnion(`skill.${sk.key}`, 'all_skills') // ledger advantage/disadvantage on this skill
              const skillSrc = rollEffectSources(ledger, `skill.${sk.key}`, 'all_skills') // named sources → shown on the roll
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
                    {/* Watch the ability AND the skill-bonus targets the roll folds (line ~134): a
                        `skill.stealth`/`all_skills` item moves the number, so the ★ must light for it. */}
                    <EffectStar target={[`ability_${sk.ability}`, `skill.${sk.key}`, 'all_skills']} label={sk.label} />
                    <span className="rabil">{abil.label}</span>
                    {stealthAdv && <span className="rabil" style={{ color: 'var(--tealbright)' }}>BASE FORM · ADV</span>}
                  </div>
                  <button
                    className="rollbtn"
                    onClick={() => rollCheck(`${sk.label}`, mod, { advantage: stealthAdv || skillEf.advantage, disadvantage: skillEf.disadvantage, disSources: skillSrc.disadvantage, advSources: skillSrc.advantage, tag: stealthAdv ? 'Base Form' : abil.label })}
                  >
                    {signed(mod)}
                  </button>
                </div>
              )
            })}

            {/* Custom checks */}
            {customSkills.map((cs) => {
              const abil = ABILITIES.find((a) => a.key === cs.ability)!
              const mod = abilityMod(abilities[cs.ability]) + profContribution(cs.prof, pb) + cs.misc
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
                    <EffectStar target={`ability_${cs.ability}`} label={cs.label} />
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

          {/* Proficiencies granted by an active effect — weapons, tools, languages a pendant/boon
              hands you while worn. Sourced, so it's clear where it came from and that it's on loan. */}
          {grantedProfs.length > 0 && (
            <div className="granted-profs" style={{ marginTop: 12 }}>
              <div className="res-head">
                <span className="rn">Granted Proficiencies</span>
                <span className="rc">while active</span>
              </div>
              <ul className="clean" style={{ marginTop: 6 }}>
                {grantedProfs.map((g) => (
                  <li key={`${g.value}-${g.source}`}>
                    <span style={{ textTransform: 'capitalize' }}>{g.value}</span>{' '}
                    <span className="chip teal" style={{ fontSize: 10 }}>from {g.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
