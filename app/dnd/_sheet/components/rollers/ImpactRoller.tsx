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
import { useRollerDock } from './FloatingRoller'
import './impactRoller.css'

type RowKind = 'die' | 'mod' | 'boost' | 'penalty'
interface BreakRow {
  key: string
  label: string
  value: string
  kind: RowKind
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)
const D20_RE = /d20\[([^\]]*)\](?:→(\d+))?/

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

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
  breakdown.split(/\s+/).filter(Boolean).forEach((tok, i) => {
    const dm = tok.match(/^(−|-)?(\d*d\d+)\[([^\]]*)\]$/)
    if (dm) {
      const sign = dm[1] ? -1 : 1
      const sum = dm[3].split(',').reduce((a, v) => a + (parseInt(v.trim(), 10) || 0), 0) * sign
      rows.push({ key: `d${i}`, label: dm[2], value: signed(sum), kind: 'die' })
    } else if (/^[+−-]?\d+$/.test(tok)) {
      const n = parseInt(tok.replace('−', '-'), 10)
      rows.push({ key: `f${i}`, label: 'flat', value: signed(n), kind: 'mod' })
    }
  })
  return rows
}

/** The ordered breakdown rows for one roll — the "tap away" explanation of the headline total. */
function buildRows(roll: ActiveRoll): BreakRow[] {
  const { isD20, landing, entry } = roll
  const rows: BreakRow[] = []
  if (isD20) {
    const m = entry.breakdown.match(D20_RE)
    const pair = m?.[1] ?? String(landing)
    rows.push({
      key: 'die',
      label: entry.mode === 'adv' ? `d20 · advantage${pair.includes(',') ? ` (${pair})` : ''}` : entry.mode === 'dis' ? `d20 · disadvantage${pair.includes(',') ? ` (${pair})` : ''}` : 'd20',
      value: String(landing),
      kind: 'die',
    })
    const mod = entry.total - landing
    if (mod !== 0) rows.push({ key: 'mod', label: 'modifiers', value: signed(mod), kind: 'mod' })
  } else {
    buildDamageRows(entry.breakdown).forEach((r) => rows.push(r))
  }
  entry.boosts?.forEach((b, i) => rows.push({ key: `bo${i}`, label: b, value: 'helped', kind: 'boost' }))
  entry.penalties?.forEach((p, i) => rows.push({ key: `pe${i}`, label: p, value: 'hurt', kind: 'penalty' }))
  return rows
}

// ── The resolution stage: consumes `activeRoll`, tumbles the die, lands it big ────────────
function ImpactStage() {
  const { activeRoll, commitRoll } = useChar()
  const [rows, setRows] = useState<BreakRow[]>([])
  const [phase, setPhase] = useState<'idle' | 'tumbling' | 'landed'>('idle')
  const [face, setFace] = useState<number | null>(null)
  const [meta, setMeta] = useState<{ crit: boolean; fumble: boolean; total: number; label: string; landing: number; isD20: boolean; tag?: string } | null>(null)
  const [open, setOpen] = useState(false)
  const timers = useRef<number[]>([])
  const scrambler = useRef<number | null>(null)
  const lastToken = useRef(-1)
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
    primeAudio()

    // Reduced motion: no tumble — land the die and headline immediately, still commit + chime.
    if (prefersReducedMotion()) {
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
    scrambler.current = window.setInterval(() => {
      setFace(lo + Math.floor(Math.random() * (hi - lo + 1)))
      tick(Math.random())
    }, 70)
    const TUMBLE = 760
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
        <div className="ir-die" aria-hidden>
          <span className="ir-die-face">{face ?? '·'}</span>
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
      {phase === 'landed' && (
        <>
          <button type="button" className="ir-detail-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? '▾ Hide breakdown' : '▸ Show breakdown'}
          </button>
          {open && (
            <div className="ir-detail">
              {rows.map((row) => (
                <div key={row.key} className={`ir-row ir-${row.kind}`}>
                  <span className="ir-row-label">{row.label}</span>
                  <span className="ir-row-val">{row.value}</span>
                </div>
              ))}
              {meta?.tag && <div className="ir-detail-tag">{meta.tag}</div>}
            </div>
          )}
        </>
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
