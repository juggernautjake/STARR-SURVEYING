'use client'
// ═══════════════════════════════════════════════════ IMPACT ROLLER (T-DICE-PLAY)
// The Play format's OWN dice roller — it replaces the shared Dice Core (`DiceTray` / `RollStage`) in
// the Play shell only (see PlayLayout). It consumes the EXACT same roll data every other roller does
// — `activeRoll` and `RollEntry` from the shared store — so the arithmetic is one answer everywhere
// and works for every system (5e/PF2/IG). What differs is the RENDER and the TUMBLE SIMULATION, not
// the maths.
//
// WHY IT LOOKS THE WAY IT DOES. Play is the at-the-table format — big vitals, big actions, read from
// across the room. The Impact Roller matches that: a roll THROWS an OVERSIZED DIE that tumbles and
// LANDS with a shake + flash, the result reads HUGE and immediate, and the source breakdown is a tap
// away (collapsible), never in the way. Distinct tumble-and-land settle, NOT the Sigil Stack's
// vertical cascade nor the Roll Board's card deal.
//
// THE TOTAL IS NEVER RECOMPUTED HERE. The store is the single source of the answer; the roller only
// EXPLAINS it — the die shows the natural face (`activeRoll.landing`), the breakdown shows the folded
// modifier (`entry.total − landing`, exactly what the store folded) plus named boosts/penalties, and
// the headline always prints `entry.total`. Boosts read non-red, penalties red — the Dice Core
// contract, kept.
import { useEffect, useRef, useState } from 'react'
import { useChar } from '../../state/store'
import type { ActiveRoll } from '../../state/store'
import { useSheetModule } from '../../state/sheetConfig'
import { tick, blip, errorBuzz, tada, whoosh, setMuted, isMuted, primeAudio } from '../../lib/audio'
import { useRollerDock, useExpandOnRoll } from './FloatingRoller'
import { shouldAnimateRoller, adoptedToken, breakdownTerms, diceOf, type RolledDie } from './rollerAnim'
import { useRollFeed } from './rollFeed'
import { dieSides } from './dieShape'
import Die3D from './Die3D'
import './impactRoller.css'

// The tumble length, shared by the stage's timeline (sounds, commit) and the die's own trajectory so the throw
// and the clack land together. One constant, because two that happened to match would drift apart.
const TUMBLE_MS = 1080

/**
 * The dice to draw for a roll.
 *
 * Normally straight from the breakdown, which records every die and its face. The fallback matters though: a roll
 * whose breakdown carries no die notation at all — a manually entered IRL result, or a recorded total — still has
 * to show something, and for a d20 check the natural roll (`landing`) IS a real face of a real d20. Anything else
 * gets nothing, and the stage falls back to its neutral box rather than inventing a die (plan ground rule G2:
 * the renderer displays, it never decides).
 */
function diceForRoll(roll: ActiveRoll): RolledDie[] {
  const parsed = diceOf(roll.entry.breakdown ?? '')
  if (parsed.length) return parsed
  if (roll.isD20 && roll.landing >= 1 && roll.landing <= 20) {
    return [{ sides: 20, value: roll.landing, kept: true }]
  }
  return []
}

/** How big each die is drawn, for a handful of `n`. The tray must fit the arena at every count, never scroll. */
function dieSizeFor(n: number): number {
  if (n <= 1) return 108
  if (n === 2) return 82
  if (n <= 4) return 64
  if (n <= 6) return 52
  if (n <= 9) return 44
  if (n <= 16) return 36
  return 30
}

/** A coarse bucket for the tray's layout class, so CSS can adjust gaps without a style per count. */
function trayBucket(n: number): 'one' | 'few' | 'many' | 'lots' {
  if (n <= 1) return 'one'
  if (n <= 4) return 'few'
  if (n <= 9) return 'many'
  return 'lots'
}

type RowKind = 'die' | 'mod' | 'boost' | 'penalty' | 'total'
interface BreakRow {
  key: string
  label: string
  value: string
  kind: RowKind
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)
const D20_RE = /d20\[([^\]]*)\](?:→(\d+))?/

/** Split a damage/heal/expr breakdown into readable rows for the collapsible detail. The headline
 *  still owns the authoritative total, so an imperfect parse never changes the answer. */
function buildDamageRows(breakdown: string): BreakRow[] {
  const rows: BreakRow[] = []
  if (breakdown.includes(' · ')) {
    breakdown.split(' · ').forEach((part, i) => {
      const sub = part.match(/\((\d+)\)\s*$/)
      const label = part.trim().split(/\s+/)[0] || 'damage'
      rows.push({ key: `t${i}`, label, value: sub ? sub[1] : part.trim(), kind: 'mod' })
    })
    return rows
  }
  // The per-term tokenising (drop the trailing `= N` summary, split die groups from flat modifiers, leave
  // the leading term unsigned) is SHARED — see `breakdownTerms`. It used to be a copy of Sigil Stack's, and
  // the phantom-flat-modifier bug (RO-14) proved why that was wrong: the same defect sat in both, so fixing
  // either one alone would have left the other looking correct while still being wrong.
  breakdownTerms(breakdown).forEach((t) => rows.push({ ...t }))
  return rows
}

/** The ordered breakdown rows for one roll — a clear, top-to-bottom calculation (D-10): the natural die,
 *  each contribution with its signed value, the named conditions/feats that helped or hurt, then the
 *  final Total. The headline still owns the authoritative total, so an imperfect parse never changes it. */
function buildRows(roll: ActiveRoll): BreakRow[] {
  const { isD20, landing, entry } = roll
  const rows: BreakRow[] = []
  if (isD20) {
    const m = entry.breakdown.match(D20_RE)
    const pair = m?.[1] ?? String(landing)
    // The die row leads with the natural d20. For adv/dis it NAMES the mode and shows BOTH dice that were
    // rolled ("rolled 7, 18"), while the value column is the KEPT die (the higher for advantage, lower for
    // disadvantage) — the one that actually factors into the total.
    const rolledPair = pair.includes(',') ? ` · rolled ${pair.split(',').map((s) => s.trim()).join(', ')}` : ''
    const advTag = entry.mode === 'adv' ? ` advantage${rolledPair}`
      : entry.mode === 'dis' ? ` disadvantage${rolledPair}` : ''
    rows.push({ key: 'die', label: `d20${advTag}`, value: String(landing), kind: 'die' })
    const mod = entry.total - landing
    if (mod !== 0) rows.push({ key: 'mod', label: 'Ability + proficiency', value: signed(mod), kind: 'mod' })
  } else {
    buildDamageRows(entry.breakdown).forEach((r) => rows.push(r))
  }
  // Conditions/feats that adjusted the roll — named, with a ▲ (helped) / ▼ (hurt) marker. Their numeric
  // effect is already folded into the modifier above; this names the SOURCE so the total is explainable.
  entry.boosts?.forEach((b, i) => rows.push({ key: `bo${i}`, label: b, value: '▲', kind: 'boost' }))
  entry.penalties?.forEach((p, i) => rows.push({ key: `pe${i}`, label: p, value: '▼', kind: 'penalty' }))
  // The final calculation, always last and emphasised.
  rows.push({ key: 'total', label: 'Total', value: String(entry.total), kind: 'total' })
  return rows
}

// ── The resolution stage: consumes `activeRoll`, tumbles the die, lands it big ────────────
export function ImpactStage() {
  const { activeRoll, commitRoll, rollerAnim } = useRollFeed()
  useExpandOnRoll(activeRoll?.token) // click-to-roll pops the roller open even if it was minimized
  const animate = shouldAnimateRoller(rollerAnim)
  // ADOPT the roll already on screen rather than replaying it (RO-7 — see `adoptedToken`). Seeded with -1,
  // switching template re-tumbled the die AND re-committed the roll to the log.
  const adopted = useRef(activeRoll).current
  const [rows, setRows] = useState<BreakRow[]>(adopted ? buildRows(adopted) : [])
  const [phase, setPhase] = useState<'idle' | 'tumbling' | 'landed'>(adopted ? 'landed' : 'idle')
  const [face, setFace] = useState<number | null>(adopted ? adopted.landing : null)
  // How many sides the die SHAPE has, from the die being rolled (D-4). null → the neutral rounded shape.
  const [sides, setSides] = useState<number | null>(adopted ? dieSides(adopted) : null)
  // The individual dice of the roll, read from the breakdown (`2d6[3,5]` → two d6s showing 3 and 5). This is what
  // the tray renders, and it is why the die can no longer contradict the rows beneath it.
  const [dice, setDice] = useState<RolledDie[]>(() => (adopted ? diceForRoll(adopted) : []))
  const [meta, setMeta] = useState<{ crit: boolean; fumble: boolean; total: number; label: string; landing: number; isD20: boolean; tag?: string } | null>(
    adopted
      ? { crit: adopted.crit, fumble: adopted.fumble, total: adopted.entry.total, label: adopted.entry.label, landing: adopted.landing, isD20: adopted.isD20, tag: adopted.entry.tag }
      : null,
  )
  const timers = useRef<number[]>([])
  const scrambler = useRef<number | null>(null)
  const lastToken = useRef(adoptedToken(activeRoll))
  const pending = useRef<{ entry: ActiveRoll['entry']; done: boolean } | null>(null)

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    if (scrambler.current != null) {
      window.clearInterval(scrambler.current)
      scrambler.current = null
    }
  }
  const flush = () => {
    if (pending.current && !pending.current.done) {
      commitRoll(pending.current.entry)
      pending.current.done = true
    }
  }

  useEffect(() => {
    if (activeRoll === null) {
      clearTimers()
      flush()
      pending.current = null
      lastToken.current = -1
      setPhase('idle')
      setRows([])
      setFace(null)
      setMeta(null)
      setSides(null)
      setDice([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoll])

  useEffect(() => {
    if (!activeRoll || activeRoll.token === lastToken.current) return
    lastToken.current = activeRoll.token
    clearTimers()
    flush()
    pending.current = { entry: activeRoll.entry, done: false }
    const r = buildRows(activeRoll)
    const { landing, min, max, isD20, entry } = activeRoll
    const sound = () => {
      if (activeRoll.fumble) errorBuzz()
      else if (activeRoll.crit) tada()
      else blip()
    }
    setRows(r)
    setMeta({ crit: activeRoll.crit, fumble: activeRoll.fumble, total: entry.total, label: entry.label, landing, isD20, tag: entry.tag })
    setSides(dieSides(activeRoll))
    setDice(diceForRoll(activeRoll))
    primeAudio()

    // Instant: no tumble — land the die and headline immediately, still commit + chime. Taken when the
    // player turned animation off (RO-6) OR the OS asks for reduced motion (`shouldAnimateRoller`).
    if (!animate) {
      setPhase('landed')
      setFace(landing)
      sound()
      const done = window.setTimeout(() => {
        commitRoll(activeRoll.entry)
        if (pending.current) pending.current.done = true
      }, 60)
      timers.current.push(done)
      return () => clearTimers()
    }

    // Tumble-and-land: the oversized die scrambles through faces, then SLAMS to its landing with a
    // shake + flash. Distinct from the tile cascade / card deal.
    setPhase('tumbling')
    whoosh()
    const lo = Math.max(1, Math.min(min, max))
    const hi = Math.max(min, max)
    // D-2/D-3: a slightly slower scramble (85ms vs 70) over a longer tumble, so the die spins a touch
    // longer before it slams to its landing — the owner likes the sound this makes and wanted more of it.
    scrambler.current = window.setInterval(() => {
      setFace(lo + Math.floor(Math.random() * (hi - lo + 1)))
      tick(Math.random())
    }, 85)
    const TUMBLE = TUMBLE_MS
    const land = window.setTimeout(() => {
      if (scrambler.current != null) {
        window.clearInterval(scrambler.current)
        scrambler.current = null
      }
      setFace(landing)
      setPhase('landed')
      sound()
    }, TUMBLE)
    timers.current.push(land)
    const commit = window.setTimeout(() => {
      commitRoll(activeRoll.entry)
      if (pending.current) pending.current.done = true
    }, TUMBLE + 320)
    timers.current.push(commit)

    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoll?.token])

  if (phase === 'idle') {
    return (
      <div className="ir-arena">
        <div className="ir-idle">
          <span className="ir-idledie" aria-hidden>⬢</span>
          <span>
            tap a stat to roll — the die is thrown
            <br />
            adv / dis apply automatically
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={`ir-arena ${phase === 'landed' ? 'ir-landed' : 'ir-throwing'} ${meta?.crit ? 'is-crit' : ''} ${meta?.fumble ? 'is-fumble' : ''}`}>
      <div className="ir-stage">
        {/* A REAL ROTATING SOLID (`Die3D`), not a picture of a die. It projects the actual polyhedron every
            frame — faces come round, catch the light, turn away and vanish at the silhouette — and every visible
            face carries its own numeral, so a d20 mid-throw is eight or nine numbers wheeling past. The rolled
            value is a PROP: the trajectory is planned to end with that face square-on, so the die cannot disagree
            with the total beneath it.

            When the die is ambiguous (a mixed pool like 2d6+1d4 has no single shape) the neutral box keeps the
            scrambling numeral it always had — a made-up shape would be a worse answer than an honest one. */}
        <div className="ir-cast">
          {dice.length ? (
            // EVERY DIE THAT WAS ROLLED, each its own solid with its own trajectory (owner: "make it so that we
            // can roll multiple dice at once"). They come from the breakdown, which already records what each die
            // showed — so a handful is not a special mode, it is just what the data said all along.
            //
            // Sized down as the handful grows, never scrolled: the tray has to fit the arena at any count.
            <div className={`ir-tray ir-tray-${trayBucket(dice.length)}`}>
              {dice.map((d, i) => (
                <Die3D
                  key={`${lastToken.current}-${i}`}
                  sides={d.sides}
                  // The die's OWN value, not the roll's total. Handing a d6 the folded total of 12 is what made
                  // the die show 1 while the breakdown said 6.
                  value={d.value}
                  // Index in the seed, so dice in one throw tumble differently but reproducibly.
                  seed={lastToken.current * 31 + i}
                  animate={animate && phase === 'tumbling'}
                  size={dieSizeFor(dice.length)}
                  duration={TUMBLE_MS}
                  className={`${meta?.crit ? 'is-crit' : ''} ${meta?.fumble ? 'is-fumble' : ''}${d.kept ? '' : ' is-discarded'}`}
                />
              ))}
            </div>
          ) : (
            // Nothing parseable in the breakdown — show the neutral box rather than inventing a die.
            <div className="ir-die" aria-hidden>
              <span className="ir-die-face">{face ?? '·'}</span>
            </div>
          )}
          <span className="ir-die-shadow" aria-hidden />
        </div>
        {phase === 'landed' && meta && (
          <div className="ir-result" role="status">
            <span className="ir-result-label">{meta.label}</span>
            <span className="ir-result-total">{meta.total}</span>
            {meta.isD20 && meta.total !== meta.landing && (
              <span className="ir-result-nat">natural {meta.landing}</span>
            )}
          </div>
        )}
      </div>
      {phase === 'landed' && meta?.crit && <div className="ir-flag crit">★ NAT 20 · CRITICAL ★</div>}
      {phase === 'landed' && meta?.fumble && <div className="ir-flag fumble">✖ NAT 1 · FUMBLE ✖</div>}
      {/* The full breakdown is ALWAYS shown beneath the result (D-7) — every source that fed the total
          (the natural die, ability/proficiency, adv/dis kept pair, condition/feat bonuses & penalties),
          then the final total — never behind a "show breakdown" toggle. */}
      {phase === 'landed' && (
        <div className="ir-detail is-open">
          {/* Row class is `ir-r-<kind>`, NOT `ir-<kind>` — a bare `ir-die` row would collide with the
              `.ir-die` DICE element selector and get styled as a 108px square (the "weird square" bug). */}
          {rows.map((row) => (
            <div key={row.key} className={`ir-row ir-r-${row.kind}`}>
              <span className="ir-row-label">{row.label}</span>
              <span className="ir-row-val">{row.value}</span>
            </div>
          ))}
          {meta?.tag && <div className="ir-detail-tag">{meta.tag}</div>}
        </div>
      )}
    </div>
  )
}

export default function ImpactRoller() {
  const {
    log,
    clearLog,
    resetStage,
    activeRoll,
    advMode,
    setAdvMode,
    vanillaMode,
    setVanillaMode,
    recklessActive,
    toggleReckless,
    transformActive,
    topFormId,
    transform,
    endTransform,
    nextTurn,
    activeFormId,
    char,
    rollCheck,
    rollExpr,
    manualD20,
    recordRoll,
    preferences,
  } = useChar()

  const hasReckless = useSheetModule('reckless')
  const hasForms = useSheetModule('forms')
  const dock = useRollerDock()

  // Pop the floating window open when a fresh roll arrives while minimized, so the throw is seen.
  const rollToken = activeRoll?.token
  useEffect(() => {
    if (rollToken != null) dock.expand()
  }, [rollToken, dock])

  const [muted, setMutedState] = useState(isMuted())
  const [diceCount, setDiceCount] = useState(1)
  const combat = char.combat
  const topForm = char.forms.find((f) => f.id === topFormId)
  const activeForm = char.forms.find((f) => f.id === activeFormId)

  const recordMode = preferences.recordMode.value
  const [entryOpen, setEntryOpen] = useState(recordMode !== 'auto')
  const [entryMode, setEntryMode] = useState<'fold' | 'log'>(recordMode === 'irl' ? 'log' : 'fold')
  const [entryLabel, setEntryLabel] = useState('')
  const [entryFace, setEntryFace] = useState('')
  const [entryMod, setEntryMod] = useState('')
  const [entryTotal, setEntryTotal] = useState('')
  const [histOpen, setHistOpen] = useState(true)

  const submitEntry = () => {
    const label = entryLabel.trim() || (entryMode === 'fold' ? 'Manual d20' : 'IRL roll')
    if (entryMode === 'fold') {
      const faceVal = parseInt(entryFace, 10)
      if (!Number.isFinite(faceVal)) return
      manualD20(label, parseInt(entryMod, 10) || 0, faceVal, { kind: 'check' })
    } else {
      const total = parseInt(entryTotal, 10)
      if (!Number.isFinite(total)) return
      recordRoll(label, total)
    }
    setEntryLabel('')
    setEntryFace('')
    setEntryMod('')
    setEntryTotal('')
  }

  const toggleMute = () => {
    primeAudio()
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  return (
    <div className="iroller" onMouseDown={primeAudio}>
      <div className="iroller-head">
        <div className="iroller-title">
          <span className="iroller-mark" aria-hidden>
            ⬢
          </span>
          Impact Roller
        </div>
        <div className="iroller-btns">
          <button className="btn tiny ghost" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            className="btn tiny ghost"
            onClick={() => {
              clearLog()
              resetStage()
            }}
            disabled={!log.length && !activeRoll}
          >
            Clear
          </button>
        </div>
      </div>

      <ImpactStage />

      <div className="iroller-adv" role="group" aria-label="advantage mode">
        <button className={advMode === 'dis' ? 'on-dis' : ''} onClick={() => setAdvMode('dis')} title="Disadvantage">
          DIS
        </button>
        <button className={advMode === 'flat' ? 'on-flat' : ''} onClick={() => setAdvMode('flat')} title="Straight roll">
          FLAT
        </button>
        <button className={advMode === 'adv' ? 'on-adv' : ''} onClick={() => setAdvMode('adv')} title="Advantage">
          ADV
        </button>
      </div>

      <div className="iroller-toggles">
        {hasReckless && (
          <button className={`btn tiny ${recklessActive ? 'active' : ''}`} onClick={toggleReckless} title="Reckless: advantage on STR melee">
            {recklessActive ? '⚡ RECKLESS' : 'Reckless'}
          </button>
        )}
        {/* Vanilla roller (Area R2): flip OFF all auto-folded effects for a straight roll. */}
        <button
          className={`btn tiny ${vanillaMode ? 'active' : ''}`}
          onClick={() => setVanillaMode(!vanillaMode)}
          title={vanillaMode ? 'Vanilla roller ON — effects are NOT applied. Click for the effects roller.' : 'Effects roller ON — conditions/stances/exhaustion fold into rolls. Click for a straight vanilla roll.'}
        >
          {vanillaMode ? '🎲 VANILLA' : '✨ Effects'}
        </button>
        {hasForms && !transformActive && (
          <button className="btn tiny solid pink" onClick={transform} disabled={!topFormId} title={topFormId ? `Surge into ${topForm?.name}` : 'No Surge form unlocked yet (level 3+)'}>
            🔥 Surge{topForm ? ` → ${topForm.name.split('—').pop()?.trim()}` : ''}
            {combat.transformsThisRest >= 1 ? ' (+1 EXH)' : ''}
          </button>
        )}
        {hasForms && transformActive && (
          <>
            <span className="iroller-surge">
              🔥 {activeForm?.name.split('—').pop()?.trim()} · <strong>{combat.transformTurnsLeft}</strong> turns
            </span>
            <button className="btn tiny" onClick={nextTurn} title="Advance a turn (Surge counts down)">
              ▸ Turn
            </button>
            <button className="btn tiny danger" onClick={endTransform} title="Drop the Surge">
              End
            </button>
          </>
        )}
        {combat.exhaustion > 0 && (
          <span className="iroller-exh" title="Exhaustion: bites your d20 rolls">
            EXH {combat.exhaustion}
          </span>
        )}
      </div>

      <div className="iroller-dice">
        <div className="iroller-count" title="How many dice to roll at once">
          <button onClick={() => setDiceCount(Math.max(1, diceCount - 1))} disabled={diceCount <= 1} aria-label="fewer dice">
            −
          </button>
          <span className="iroller-cn">{diceCount}d</span>
          <button onClick={() => setDiceCount(Math.min(20, diceCount + 1))} disabled={diceCount >= 20} aria-label="more dice">
            +
          </button>
        </div>
        {[4, 6, 8, 10, 12, 20, 100].map((d) => (
          <button key={d} className="btn tiny" onClick={() => rollExpr(`${diceCount}d${d}`, `${diceCount}d${d}`)} title={`Roll ${diceCount}d${d}`}>
            d{d}
          </button>
        ))}
        <button className="btn tiny solid" onClick={() => rollCheck('Flat d20', 0, { kind: 'check' })} title="Straight d20 check, no modifier (respects Adv / Dis)">
          Flat d20
        </button>
      </div>

      {/* Manual / IRL roll entry (Areas R3 + R5). */}
      <button type="button" className="iroller-sechead" onClick={() => setEntryOpen((v) => !v)} aria-expanded={entryOpen} title="Enter a physical roll">
        {entryOpen ? '▾' : '▸'} Enter a roll
      </button>
      {entryOpen && (
        <div className="iroller-entry">
          <div className="iroller-entry-modes" role="group" aria-label="Roll entry mode">
            <button type="button" className={entryMode === 'fold' ? 'on' : ''} aria-pressed={entryMode === 'fold'} onClick={() => setEntryMode('fold')}>
              Manual d20
            </button>
            <button type="button" className={entryMode === 'log' ? 'on' : ''} aria-pressed={entryMode === 'log'} onClick={() => setEntryMode('log')}>
              Record IRL
            </button>
          </div>
          <input
            value={entryLabel}
            onChange={(e) => setEntryLabel(e.target.value)}
            placeholder={entryMode === 'fold' ? 'What for? (e.g. Stealth)' : 'What for? (e.g. Attack)'}
            maxLength={40}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitEntry()
            }}
          />
          {entryMode === 'fold' ? (
            <div className="iroller-entry-row">
              <input type="number" min={1} max={20} value={entryFace} onChange={(e) => setEntryFace(e.target.value)} placeholder="d20" title="The d20 face you rolled" onKeyDown={(e) => { if (e.key === 'Enter') submitEntry() }} />
              <input type="number" value={entryMod} onChange={(e) => setEntryMod(e.target.value)} placeholder="+mod" title="Your modifier — added to the die" onKeyDown={(e) => { if (e.key === 'Enter') submitEntry() }} />
              <button type="button" className="btn tiny solid" onClick={submitEntry} disabled={entryFace.trim() === ''}>
                Fold
              </button>
            </div>
          ) : (
            <div className="iroller-entry-row">
              <input type="number" value={entryTotal} onChange={(e) => setEntryTotal(e.target.value)} placeholder="result" title="The final result you rolled in person" onKeyDown={(e) => { if (e.key === 'Enter') submitEntry() }} />
              <button type="button" className="btn tiny solid" onClick={submitEntry} disabled={entryTotal.trim() === ''}>
                Log
              </button>
            </div>
          )}
        </div>
      )}

      <button type="button" className="iroller-sechead" onClick={() => setHistOpen((v) => !v)} aria-expanded={histOpen} title={histOpen ? 'Hide roll history' : 'Show roll history'}>
        {histOpen ? '▾' : '▸'} Roll history{log.length ? ` (${log.length})` : ''}
      </button>
      {histOpen && (
        <div className="iroller-log">
          {log.length === 0 && (
            <div className="iroller-empty">
              Tap any attack, ability, save, or skill.
              <br />
              Adv / Dis apply automatically.
            </div>
          )}
          {log.map((e) => (
            <div key={e.id} className={`iroller-re ${e.crit ? 'crit' : ''} ${e.fumble ? 'fumble' : ''}`}>
              <div className="iroller-re-top">
                <div className="iroller-re-label">{e.label}</div>
                <div className="iroller-re-total">{e.total}</div>
              </div>
              {(e.penalties?.length || e.boosts?.length) ? (
                <div className="iroller-re-effects">
                  {e.penalties?.map((p) => (
                    <span key={`p-${p}`} className="iroller-eff-down" title={`${p} reduced this roll`}>
                      ▼ {p}
                    </span>
                  ))}
                  {e.boosts?.map((b) => (
                    <span key={`b-${b}`} className="iroller-eff-up" title={`${b} helped this roll`}>
                      ▲ {b}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="iroller-re-break">
                {e.mode === 'adv' && <span className="iroller-mode-adv">ADV </span>}
                {e.mode === 'dis' && <span className="iroller-mode-dis">DIS </span>}
                {e.breakdown}
                {e.crit && e.kind !== 'damage' && <span className="iroller-mode-adv"> · NAT 20</span>}
                {e.fumble && e.kind !== 'damage' && <span className="iroller-mode-dis"> · NAT 1</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
