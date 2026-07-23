'use client'
// The Codex identity column (CX-2) — the left third of the sheet.
//
// Block order is the owner's, stated verbatim in the plan doc: portrait, identity, health,
// defence, abilities, rest. The additions below it (conditions, speed/init/proficiency, passive
// perception, concentration, currency) are the call the owner explicitly delegated, each argued
// in the doc rather than chosen by taste.
//
// WHAT THIS COMPONENT DOES NOT DO: any arithmetic of its own. Every number here comes from the
// store's already-derived values — `abilities` (ledger-effective), `acInfo`, `saveDc`, `pb`,
// `ledger.value(...)`. That is not laziness; it is the platform's "one answer" rule. The StatRail
// and the Combat panel read the same sources, and a column that recomputed AC or effective max HP
// locally would eventually disagree with them, which is worse than not showing it at all.
//
// System adaptation runs entirely through `codexDescriptorFor` — see that file's header for why
// PF2/IG blocks are SUPPRESSED rather than invented.
import { useState } from 'react'
import { useChar } from '../state/store'
import { ABILITIES, abilityMod, signed } from '../rules/dnd'
import { useSheetSystem } from '../state/sheetConfig'
import { codexDescriptorFor } from './descriptor'
import InlineNumber from '../components/ui/InlineNumber'
import ConditionTracker from '../components/ConditionTracker'
import ActiveEffects from '../components/ActiveEffects'
import { profContribution } from '../rules/dnd'
import { classDisplayFor } from '@/lib/dnd/classes/multiclass-resolve'

export default function IdentityColumn({ artUrl, ownerName }: { artUrl?: string | null; ownerName?: string | null }) {
  const {
    char, abilities, acInfo, saveDc, pb, ledger, setChar, canWrite, characterId,
    adjustHp, rollDeathSave, spendHitDie, shortRest, longRest, rollCheck,
  } = useChar()
  const system = useSheetSystem()
  const d = codexDescriptorFor(system)
  const { combat } = char
  const [amt, setAmt] = useState(5)

  const effMaxHp = ledger.value('hp_max', combat.maxHp)
  const walkSpeed = ledger.value('speed_walk', combat.speed)
  const dexMod = abilityMod(abilities.dex)
  const init = ledger.value('initiative', dexMod + combat.initiativeMisc)
  const hpRatio = combat.currentHp / Math.max(1, effMaxHp)
  const hpTone = combat.currentHp <= 0 || hpRatio <= 0.35 ? 'crit' : hpRatio <= 0.6 ? 'warn' : 'ok'
  // Same formula and the same ledger-effective inputs as SavesSkills, deliberately — see the note
  // above about not recomputing. If this ever needs to change it changes in both places or the
  // sheet contradicts itself.
  const passivePerception =
    10 + abilityMod(abilities.wis) + profContribution(char.skills.perception.prof, pb) + char.skills.perception.misc

  const setCombat = (patch: Partial<typeof combat>) => setChar((c) => ({ ...c, combat: { ...c.combat, ...patch } }))
  const setDeath = (kind: 'deathSuccess' | 'deathFail', v: number) =>
    setCombat({ [kind]: Math.max(0, Math.min(3, v)) } as Partial<typeof combat>)
  const longRestPrompt = `Take a long rest? Restores HP, hit dice, resources, death saves${char.longRestNote ? `, ${char.longRestNote}` : ''}.`

  // Only coins actually held. `currencies` is the flexible per-system list (lib/dnd/currency.ts),
  // so IG's Penny/Coin/Solidas render as themselves rather than being forced into 5e's cp/sp/gp.
  const coins = (char.currencies ?? []).filter((c) => c.amount !== 0)

  return (
    <aside className="codex-identity" aria-label={`${char.meta.name} — at a glance`}>
      {/* 1 — PORTRAIT. Uses the same focus point + zoom the TokenFramer already set, so art
          framed on the classic sheet carries over rather than needing reframing per layout. */}
      {artUrl && (
        <div className="card codex-portrait">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artUrl}
            alt={`${char.meta.name} — character art`}
            style={{
              objectPosition: char.tokenFocus ? `${char.tokenFocus.x}% ${char.tokenFocus.y}%` : '50% 12%',
              transform: char.tokenFocus && char.tokenFocus.zoom > 1 ? `scale(${char.tokenFocus.zoom})` : undefined,
              transformOrigin: char.tokenFocus ? `${char.tokenFocus.x}% ${char.tokenFocus.y}%` : 'center',
            }}
          />
        </div>
      )}

      {/* 2 — IDENTITY. The species label comes from the descriptor: 2014 says Race, 2024 says
          Species, PF2 says Ancestry. Getting that word wrong reads to a player as the sheet not
          knowing which book they are playing. */}
      <div className="card codex-ident">
        <h3 className="codex-name">{char.meta.name}</h3>
        <dl className="codex-idlist">
          {char.meta.className && (
            <>
              <dt>Class</dt>
              {/* Shows the multiclass split ("Fighter 3 / Wizard 2") when the character holds more than one
                  class (MC-5e-5), else the single class · subclass exactly as before. */}
              <dd>{classDisplayFor(system, char.meta)}</dd>
            </>
          )}
          {char.meta.species && (
            <>
              <dt>{d.speciesLabel}</dt>
              <dd>{char.meta.species}</dd>
            </>
          )}
          <dt>Level</dt>
          <dd>
            {char.meta.level}
            {/* Level is not a stepper here for the same reason it is not one on the StatRail:
                bumping the number skips the choices the level unlocks and leaves the sheet
                quietly wrong. Levelling goes through the builder, which walks them in order. */}
            {canWrite && characterId && (
              <a className="codex-levels" href={`/dnd/characters/${characterId}/levels`}>Manage</a>
            )}
          </dd>
          {/* The owner's display name is resolved server-side (dnd_users.display_name) and
              threaded in, because the sheet's `Character` has no owner field — it is DB
              metadata about the row, not part of the character's rules data. Omitted rather
              than guessed when the character has no owner (an unclaimed NPC). */}
          {ownerName && (
            <>
              <dt>Owner</dt>
              <dd>{ownerName}</dd>
            </>
          )}
          <dt>System</dt>
          <dd className="codex-system">{system}</dd>
        </dl>
      </div>

      {/* 3 — HEALTH, with its controls. The heal ceiling is the LEDGER-effective max, matching
          the store's own clamp, so a +HP item genuinely lets you heal higher. */}
      <div className={`card codex-hp ${hpTone}`}>
        <div className="codex-hp-read">
          <InlineNumber value={combat.currentHp} min={0} path="combat.currentHp" onCommit={(n) => setCombat({ currentHp: n })} title="Double-click to set current HP" />
          <span className="codex-hp-sep">/</span>
          <InlineNumber
            value={combat.maxHp}
            min={1}
            path="combat.maxHp"
            onCommit={(n) => setCombat({ maxHp: n })}
            title={effMaxHp !== combat.maxHp ? `Max HP ${combat.maxHp} base → ${effMaxHp} with effects · double-click to set base` : 'Double-click to set max HP'}
            display={<span className={effMaxHp !== combat.maxHp ? 'is-modified' : undefined}>{effMaxHp}{effMaxHp !== combat.maxHp && <span className="mod-star" aria-hidden>★</span>}</span>}
          />
          {combat.tempHp > 0 && <span className="codex-temp" title="Temporary hit points">+{combat.tempHp}</span>}
        </div>
        <div className="codex-hp-bar" role="img" aria-label={`${combat.currentHp} of ${effMaxHp} hit points`}>
          <span style={{ width: `${Math.max(0, Math.min(100, hpRatio * 100))}%` }} />
        </div>
        {canWrite && (
          <div className="codex-hp-ctl">
            <button className="btn danger" onClick={() => adjustHp(-amt)}>− Damage</button>
            <input type="number" value={amt} min={0} onChange={(e) => setAmt(Math.max(0, Number(e.target.value) || 0))} aria-label="Amount to damage or heal" />
            <button className="btn teal" onClick={() => adjustHp(amt)}>+ Heal</button>
          </div>
        )}
        {d.hitDice && (
          <div className="codex-hd">
            <span>Hit Dice {combat.hitDiceRemaining}/{combat.hitDiceTotal} · d{combat.hitDiceSize}</span>
            {canWrite && <button className="btn tiny gold" onClick={spendHitDie} disabled={combat.hitDiceRemaining <= 0}>Spend</button>}
          </div>
        )}
        {/* Death saves appear only when they are in play. A row of empty pips on a healthy
            character is noise in the most-read column on the sheet. */}
        {d.deathSaves && (combat.currentHp <= 0 || combat.deathSuccess > 0 || combat.deathFail > 0) && (
          <div className="codex-death">
            <div className="codex-pips">
              <span className="codex-pipk">Saves</span>
              {[1, 2, 3].map((i) => (
                <button key={`s${i}`} className={`pip round teal ${i <= combat.deathSuccess ? 'filled' : ''}`} onClick={() => setDeath('deathSuccess', combat.deathSuccess === i ? i - 1 : i)} aria-label={`Death save success ${i}`} />
              ))}
            </div>
            <div className="codex-pips">
              <span className="codex-pipk">Fails</span>
              {[1, 2, 3].map((i) => (
                <button key={`f${i}`} className={`pip round danger ${i <= combat.deathFail ? 'filled' : ''}`} onClick={() => setDeath('deathFail', combat.deathFail === i ? i - 1 : i)} aria-label={`Death save failure ${i}`} />
              ))}
            </div>
            {canWrite && <button className="btn tiny danger" onClick={rollDeathSave}>🎲 Death Save</button>}
          </div>
        )}
      </div>

      {/* 4 — DEFENCE. AC, plus Inspiration where the system has one. */}
      <div className="card codex-def">
        <div className="codex-stat">
          <span className="codex-k">AC</span>
          <span className="codex-v">
            {acInfo.fromEquipment ? <span title={`From ${acInfo.source}`}>{acInfo.ac}</span> : (
              <InlineNumber value={combat.ac} min={0} path="combat.ac" onCommit={(n) => setCombat({ ac: n })} title="Double-click to set AC" />
            )}
          </span>
        </div>
        {d.inspiration && (
          <button
            className={`btn gold codex-insp ${char.inspiration ? 'active' : ''}`}
            disabled={!canWrite}
            aria-pressed={char.inspiration}
            onClick={() => canWrite && setChar((c) => ({ ...c, inspiration: !c.inspiration }))}
            title="Inspiration — spend it for advantage on one roll"
          >
            {char.inspiration ? '✦ INSPIRED' : '✧ Inspiration'}
          </button>
        )}
      </div>

      {/* The constantly-consulted derived numbers. Cheap in space, and the doc's argument for
          including them is simply how often a table asks for them mid-session. */}
      <div className="card codex-quick">
        <button className="codex-stat click" onClick={() => rollCheck('Initiative', init, { tag: 'DEX' })} title="Roll initiative">
          <span className="codex-k">Init</span>
          <span className="codex-v">{signed(init)}</span>
        </button>
        <div className="codex-stat">
          <span className="codex-k">Speed</span>
          <span className="codex-v">
            <span className={walkSpeed !== combat.speed ? 'is-modified' : undefined}>{walkSpeed}</span>
          </span>
        </div>
        <div className="codex-stat">
          <span className="codex-k">Prof</span>
          <span className="codex-v">{signed(pb)}</span>
        </div>
        <div className="codex-stat">
          <span className="codex-k">Save DC</span>
          <span className="codex-v">{saveDc}</span>
        </div>
        {d.passivePerception && (
          <div className="codex-stat" title="Passive Perception — 10 + your Perception check bonus. What you notice without looking.">
            <span className="codex-k">Passive</span>
            <span className="codex-v">{passivePerception}</span>
          </div>
        )}
      </div>

      {/* 5 — ABILITIES. Edit the base, show the ledger-effective, star when they differ — the
          same contract as the StatRail's pills, so the two can never disagree. */}
      <div className="card codex-abils">
        {ABILITIES.map((a) => {
          const score = abilities[a.key]
          const base = char.abilities[a.key]
          const mod = abilityMod(score)
          const modified = ledger.isModified(`ability_${a.key}`)
          const why = modified
            ? `${a.label} ${base} base\n${ledger.explain(`ability_${a.key}`).map((c) => `${c.suppressed ? '(no effect) ' : ''}${c.label} — ${c.source}`).join('\n')}\n= ${score}`
            : `Click to roll ${a.full} · double-click the score to edit`
          return (
            <button key={a.key} className={`codex-ab ${char.primaryAbilities.includes(a.key) ? 'primary' : ''}`} onClick={() => rollCheck(`${a.full} Check`, mod, { tag: a.label })} title={why}>
              <span className="codex-abk">{a.label}</span>
              <span className="codex-abm">{signed(mod)}</span>
              <span className="codex-abs">
                <InlineNumber
                  value={base}
                  min={1}
                  max={30}
                  stopClick
                  path={`ability.${a.key}`}
                  onCommit={(n) => setChar((c) => ({ ...c, abilities: { ...c.abilities, [a.key]: n } }))}
                  display={<span className={modified ? 'is-modified' : undefined}>{score}{modified && <span className="mod-star" aria-hidden>★</span>}</span>}
                  title={why}
                />
              </span>
            </button>
          )
        })}
      </div>

      {/* 6 — REST & RECOVERY. Absent entirely for a system whose recovery is not a short/long
          pair this engine can drive, rather than showing buttons that would run 5e's routine on
          a character that does not use it. */}
      {d.rests && canWrite && (
        <div className="card codex-rest">
          <button className="btn teal" onClick={shortRest} title="Restore short-rest resources">{d.rests.short}</button>
          <button className="btn pink" onClick={() => { if (confirm(longRestPrompt)) longRest() }}>{d.rests.long}</button>
        </div>
      )}

      {/* Conditions and active effects. These CHANGE every number above them — a player reading
          AC 15 while Frightened needs to see why without hunting — which is the whole argument
          for their being in this column rather than in a pane. Both components are already
          system-aware internally (ConditionTracker gates its 5e concentration save), so they are
          rendered whole rather than re-implemented. */}
      <ConditionTracker />
      <ActiveEffects />

      {/* A compact currency line — the same bleed CX-17's B4 fixed at the data layer, kept fixed
          at the display layer by rendering the character's own currency names. */}
      {coins.length > 0 && (
        <div className="card codex-coin">
          {coins.map((c) => (
            <span key={c.id}><b>{c.amount}</b> {c.abbrev ?? c.name}</span>
          ))}
        </div>
      )}

      {/* Where a system's own numbers live, when this shared engine cannot model them. Without
          this line an absent Hero Points block reads as the sheet having forgotten. */}
      {d.bespokeSheetNote && <p className="codex-bespoke">{d.bespokeSheetNote}</p>}
    </aside>
  )
}
