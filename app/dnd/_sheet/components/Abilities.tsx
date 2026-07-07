import { useChar } from '../state/store'
import { ABILITIES, abilityMod, signed } from '../rules/dnd'
import SectionHead from './ui/SectionHead'
import InlineNumber from './ui/InlineNumber'

export default function Abilities() {
  const { char, setChar, editMode, rollCheck } = useChar()

  return (
    <section id="abilities">
      <SectionHead num="02" title="Ability Scores" />
      <p className="lead">
        Built for a hands-on brawler: Strength carries the punches, Constitution keeps him standing, Dexterity powers his
        Unarmored Defense and laser aim. Tap any score to roll a straight ability check.
      </p>
      <div className="abils">
        {ABILITIES.map((a) => {
          const score = char.abilities[a.key]
          const mod = abilityMod(score)
          const primary = char.primaryAbilities.includes(a.key)
          return (
            <div
              key={a.key}
              className={`ab clickable ${primary ? 'primary' : ''}`}
              onClick={() => !editMode && rollCheck(`${a.full} Check`, mod, { tag: a.label })}
              title={editMode ? '' : `Roll ${a.full} check`}
            >
              <div className="name">{a.label}</div>
              <div className="score">
                <InlineNumber
                  value={score}
                  min={1}
                  max={30}
                  stopClick
                  path={`ability.${a.key}`}
                  onCommit={(n) => setChar((c) => ({ ...c, abilities: { ...c.abilities, [a.key]: n } }))}
                  title="Double-click to edit score"
                />
              </div>
              <div className="mod">{signed(mod)}</div>
              <button
                className="rollbtn roll-mini"
                onClick={(e) => {
                  e.stopPropagation()
                  rollCheck(`${a.full} Check`, mod, { tag: a.label })
                }}
              >
                Roll
              </button>
            </div>
          )
        })}
      </div>
      <div className="callout">
        <h4>How these were built</h4>
        <p>
          Rolled with 4d6-drop-lowest — results <strong>17, 14, 14, 13, 13, 11</strong> — then assigned to optimize an
          unarmed brawler-tank. The Jenovan species adds <strong>+2 STR</strong> and <strong>+1 CON</strong> (2024
          floating bonuses). Final: STR 19, DEX 14, CON 15, INT 11, WIS 13, CHA 13.
        </p>
      </div>
    </section>
  )
}
