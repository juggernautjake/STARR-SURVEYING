import { useChar } from '../state/store'
import { ABILITIES, abilityMod, signed } from '../rules/dnd'
import InlineNumber from './ui/InlineNumber'

export default function StatRail() {
  const { char, abilities, ledger, pb, setChar, rollCheck, setExhaustion, canWrite, characterId, activeFormId } = useChar()
  const { combat } = char
  const level = char.meta.level
  // Advantage on Initiative is the Barbarian's Feral Instinct — a class feature, not something
  // every character gets for reaching level 7. It's now declared by the character (see
  // `initiativeAdvantage`) instead of being inferred from the level.
  const feralInstinct = !!char.initiativeAdvantage && level >= (char.initiativeAdvantage.unlockLevel ?? 1)
  const initAdvLabel = char.initiativeAdvantage?.label ?? 'Advantage'
  const strMod = abilityMod(char.abilities.str)
  const dexMod = abilityMod(char.abilities.dex)
  const init = dexMod + combat.initiativeMisc
  const dc = combat.saveDCOverride ?? 8 + pb + strMod
  const activeForm = char.forms.find((f) => f.id === activeFormId)
  const formLabel = activeForm ? activeForm.name.split('—').pop()?.trim() : 'Base'
  const hpRatio = combat.currentHp / Math.max(1, combat.maxHp)
  const hpTone = combat.currentHp <= 0 ? 'crit' : hpRatio <= 0.35 ? 'crit' : hpRatio <= 0.6 ? 'warn' : 'ok'

  const setCombat = (patch: Partial<typeof combat>) => setChar((c) => ({ ...c, combat: { ...c.combat, ...patch } }))

  return (
    <div className="statrail">
      <div className="rail-vitals">
        {/* Level is NOT a stepper. Bumping the number skips the choices a level unlocks
            (subclass, ASI/feat, expertise…) and leaves the sheet quietly wrong, so levelling
            goes through the builder, which walks those choices in order. */}
        <div className="vpill level">
          <span className="vk">Level</span>
          <div className="lvl-ctrl">
            <span className="vv">{level}</span>
            {canWrite && characterId && (
              <a className="manage-levels" href={`/dnd/characters/${characterId}/levels`} title="Open the character builder to level up and make this level’s choices">
                Manage Levels
              </a>
            )}
          </div>
        </div>

        <div className={`vpill hp ${hpTone}`}>
          <span className="vk">HP</span>
          <span className="vv">
            <InlineNumber value={combat.currentHp} min={0} path="combat.currentHp" onCommit={(n) => setCombat({ currentHp: n })} title="Double-click to set current HP" />
            <span className="vslash">/</span>
            <InlineNumber value={combat.maxHp} min={1} path="combat.maxHp" onCommit={(n) => setCombat({ maxHp: n })} title="Double-click to set max HP" />
          </span>
          {combat.tempHp > 0 && <span className="vtemp">+{combat.tempHp}</span>}
        </div>

        <div className="vpill">
          <span className="vk">AC</span>
          <span className="vv">
            <InlineNumber value={combat.ac} min={0} path="combat.ac" onCommit={(n) => setCombat({ ac: n })} title="Double-click to set AC" />
          </span>
        </div>

        <div className="vpill">
          <span className="vk">Save DC</span>
          <span className="vv">
            <InlineNumber value={dc} min={0} path="combat.saveDC" onCommit={(n) => setCombat({ saveDCOverride: n })} title="Double-click to override save DC" />
          </span>
        </div>

        <div className="vpill">
          <span className="vk">Speed</span>
          <span className="vv">
            <InlineNumber value={combat.speed} min={0} path="combat.speed" onCommit={(n) => setCombat({ speed: n })} title="Double-click to set speed" />
          </span>
        </div>

        <button
          className="vpill click"
          onClick={() => rollCheck('Initiative', init, { tag: feralInstinct ? initAdvLabel : 'DEX', advantage: feralInstinct })}
          title={feralInstinct ? `Roll initiative (Advantage — ${initAdvLabel})` : 'Roll initiative'}
        >
          <span className="vk">Init{feralInstinct ? ' ⌃' : ''}</span>
          <span className="vv">{signed(init)}</span>
        </button>

        <div className="vpill">
          <span className="vk">Prof</span>
          <span className="vv">{signed(pb)}</span>
        </div>

        <div className="vpill" title={combat.transformActive ? `Surged · ${combat.transformTurnsLeft} turns left` : 'Current form'}>
          <span className="vk">Form{combat.transformActive ? ' 🔥' : ''}</span>
          <span className="vv" style={{ fontSize: 16 }}>
            {formLabel}
            {combat.transformActive && <span className="vslash"> · {combat.transformTurnsLeft}t</span>}
          </span>
        </div>

        {(combat.exhaustion > 0 || canWrite) && (
          <div className="vpill" title={`Exhaustion — each level is −2 to all d20 rolls (attacks, saves, checks) AND −5 ft Speed (max 6 levels)${combat.exhaustion > 0 ? `. Now: −${2 * combat.exhaustion} to d20, −${5 * combat.exhaustion} ft Speed` : ''}`}>
            <span className="vk">Exhaustion</span>
            {canWrite && (
              <button className="step" style={{ marginRight: 2 }} onClick={() => setExhaustion(Math.max(0, combat.exhaustion - 1))} title="Reduce exhaustion">−</button>
            )}
            <span className="vv" style={{ color: combat.exhaustion > 0 ? 'var(--danger)' : 'var(--muted)' }}>{combat.exhaustion}</span>
            {canWrite && (
              <button className="step" style={{ marginLeft: 2 }} onClick={() => setExhaustion(Math.min(6, combat.exhaustion + 1))} title="Add exhaustion">+</button>
            )}
            {combat.exhaustion > 0 && (
              <span className="vslash" style={{ fontSize: 10.5, color: 'var(--muted)' }}> −{2 * combat.exhaustion} d20 · −{5 * combat.exhaustion}ft</span>
            )}
          </div>
        )}
      </div>

      <div className="rail-abils">
        {ABILITIES.map((a) => {
          // Effective score (Slice 10) — the rail and the Abilities tab must never disagree, so
          // both read the ledger rather than each doing their own arithmetic.
          const score = abilities[a.key]
          const base = char.abilities[a.key]
          const mod = abilityMod(score)
          const primary = char.primaryAbilities.includes(a.key)
          const modified = ledger.isModified(`ability_${a.key}`)
          const why = modified
            ? `${a.label} ${base} base\n${ledger.explain(`ability_${a.key}`).map((c) => `${c.suppressed ? '(no effect) ' : ''}${c.label} — ${c.source}`).join('\n')}\n= ${score}`
            : ''
          return (
            <button
              key={a.key}
              className={`apill ${primary ? 'primary' : ''}`}
              onClick={() => rollCheck(`${a.full} Check`, mod, { tag: a.label })}
              title={modified ? why : `Click to roll ${a.full} · double-click the score to edit`}
            >
              <span className="ak">{a.label}</span>
              <span className="asc">
                <InlineNumber
                  // Edit the base; show the effective. See Abilities.tsx for why.
                  value={base}
                  min={1}
                  max={30}
                  stopClick
                  path={`ability.${a.key}`}
                  onCommit={(n) => setChar((c) => ({ ...c, abilities: { ...c.abilities, [a.key]: n } }))}
                  display={
                    <span className={modified ? 'is-modified' : undefined}>
                      {score}
                      {modified && <span className="mod-star" aria-hidden>★</span>}
                    </span>
                  }
                  title={modified ? why : 'Double-click to edit score'}
                />
              </span>
              <span className="am">{signed(mod)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
