import { useChar } from '../state/store'
import { ABILITIES, abilityMod, signed } from '../rules/dnd'
import InlineNumber from './ui/InlineNumber'

export default function StatRail() {
  const { char, pb, setChar, rollCheck, setLevel, maxLevel } = useChar()
  const { combat } = char
  const level = char.meta.level
  const feralInstinct = level >= 7 // Advantage on Initiative
  const strMod = abilityMod(char.abilities.str)
  const dexMod = abilityMod(char.abilities.dex)
  const init = dexMod + combat.initiativeMisc
  const dc = combat.saveDCOverride ?? 8 + pb + strMod
  const activeForm = char.forms.find((f) => f.id === char.activeFormId)
  const formLabel = activeForm ? activeForm.name.split('—').pop()?.trim() : 'Base'
  const hpRatio = combat.currentHp / Math.max(1, combat.maxHp)
  const hpTone = combat.currentHp <= 0 ? 'crit' : hpRatio <= 0.35 ? 'crit' : hpRatio <= 0.6 ? 'warn' : 'ok'

  const setCombat = (patch: Partial<typeof combat>) => setChar((c) => ({ ...c, combat: { ...c.combat, ...patch } }))

  return (
    <div className="statrail">
      <div className="rail-vitals">
        <div className="vpill level">
          <span className="vk">Level</span>
          <div className="lvl-ctrl">
            <button className="step" onClick={() => setLevel(level - 1)} disabled={level <= 1} title="Level down">−</button>
            <span className="vv">{level}</span>
            <button className="step" onClick={() => setLevel(level + 1)} disabled={level >= maxLevel} title="Level up">+</button>
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
          onClick={() => rollCheck('Initiative', init, { tag: feralInstinct ? 'Feral Instinct' : 'DEX', advantage: feralInstinct })}
          title={feralInstinct ? 'Roll initiative (Advantage — Feral Instinct)' : 'Roll initiative'}
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

        {combat.exhaustion > 0 && (
          <div className="vpill" title="Exhaustion — −2 to all d20 rolls per level">
            <span className="vk">Exhaustion</span>
            <span className="vv" style={{ color: 'var(--danger)' }}>{combat.exhaustion}</span>
          </div>
        )}
      </div>

      <div className="rail-abils">
        {ABILITIES.map((a) => {
          const score = char.abilities[a.key]
          const mod = abilityMod(score)
          const primary = char.primaryAbilities.includes(a.key)
          return (
            <button
              key={a.key}
              className={`apill ${primary ? 'primary' : ''}`}
              onClick={() => rollCheck(`${a.full} Check`, mod, { tag: a.label })}
              title={`Click to roll ${a.full} · double-click the score to edit`}
            >
              <span className="ak">{a.label}</span>
              <span className="asc">
                <InlineNumber
                  value={score}
                  min={1}
                  max={30}
                  stopClick
                  path={`ability.${a.key}`}
                  onCommit={(n) => setChar((c) => ({ ...c, abilities: { ...c.abilities, [a.key]: n } }))}
                  title="Double-click to edit score"
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
