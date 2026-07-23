'use client'
// ═══════════════════════════════════════════════════ ROLL BOARD (T-DICE-DASHBOARD)
// The Dashboard format's OWN dice roller — it replaces the shared Dice Core (`DiceTray` /
// `RollStage`) in the Dashboard shell only (see DashboardLayout). It consumes the EXACT same roll
// data every other roller does — `activeRoll` and `RollEntry` from the shared store — so the
// arithmetic is one answer everywhere and works for every system (5e/PF2/IG). What differs is the
// RENDER and the DEAL SIMULATION, not the maths.
//
// WHY IT LOOKS THE WAY IT DOES (owner 2026-07-22). Three cards sit face down on the felt. On a roll the
// shown card (if any) flips back over, the three cards slide OFF, three new ones slide IN, mix around, then
// ONE card flips face up to reveal the number — a longer, more theatrical reveal than the old deal-a-hand.
// A distinct card sequence, NOT the Sigil Stack's vertical cascade.
//
// THE TOTAL IS NEVER RECOMPUTED HERE. The store/feed is the single source of the answer; the revealed card
// prints `entry.total`, and the FULL calculation (breakdown + tag + named boosts/penalties + total) always
// reads BELOW the cards — never behind a "show breakdown" click. Works for every system (5e/PF2/IG) from the
// same `activeRoll`; boosts read non-red, penalties red, the same contract the other rollers keep.
import { useEffect, useRef, useState } from 'react'
import { useChar } from '../../state/store'
import type { ActiveRoll } from '../../state/store'
import { useSheetModule } from '../../state/sheetConfig'
import { tick, blip, errorBuzz, tada, whoosh, setMuted, isMuted, primeAudio } from '../../lib/audio'
import { useRollerDock, useExpandOnRoll } from './FloatingRoller'
import { shouldAnimateRoller } from './rollerAnim'
import { useRollFeed } from './rollFeed'
import './rollBoard.css'


// ── The resolution stage: three face-down cards; one flips to reveal the roll ────────────────
// The owner's card sequence (D-BOARD): three cards sit face down; when a roll comes in, the shown card (if
// any) flips back over, the three cards slide OFF, three new cards slide IN, mix around, then ONE flips face
// up to reveal the number. Deliberately a touch longer + more theatrical than the old deal-a-hand. The full
// calculation + total still reads BELOW the cards (the always-show-breakdown rule). Reads only the RollFeed.
const SUITS = ['♠', '♥', '♦', '♣'] as const
const SHUFFLE_PATTERNS = 3 // CSS variants (.rbn-shuf-0..2) picked at random each roll
type BoardPhase = 'idle' | 'flipback' | 'out' | 'in' | 'shuffle' | 'reveal' | 'shown'
interface Shown {
  value: number
  label: string
  breakdown: string
  tag?: string
  crit: boolean
  fumble: boolean
  boosts?: string[]
  penalties?: string[]
  natural?: number
  isD20?: boolean
}

interface Face { value: string; label: string; total?: boolean }
const signedStr = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

/** The three card faces for a roll. The TOTAL is the headline (revealed first); the other two show the
 *  supporting numbers — a d20's natural roll + its modifier, or (for a pool) the first breakdown numbers —
 *  so "reveal all" shows what the other two cards were. */
function boardFaces(s: Shown): Face[] {
  const total: Face = { value: String(s.value), label: 'total', total: true }
  if (s.isD20 && s.natural != null) {
    return [{ value: String(s.natural), label: 'natural' }, { value: signedStr(s.value - s.natural), label: 'modifier' }, total]
  }
  const nums = (s.breakdown.match(/\d+/g) ?? []).slice(0, 2)
  const other = (v: string | undefined, label: string): Face => (v ? { value: v, label } : { value: '·', label: '' })
  return [other(nums[0], 'dice'), other(nums[1], nums[1] ? 'dice' : ''), total]
}

export function BoardStage() {
  const { activeRoll, commitRoll, rollerAnim } = useRollFeed()
  useExpandOnRoll(activeRoll?.token) // click-to-roll pops the roller open even if it was minimized
  const animate = shouldAnimateRoller(rollerAnim)
  const [phase, setPhase] = useState<BoardPhase>('idle')
  const [shown, setShown] = useState<Shown | null>(null)
  const [revealIndex, setRevealIndex] = useState(1)
  const [deck, setDeck] = useState(0) // re-keys the cards each roll so the slide-in animation restarts
  const [revealAll, setRevealAll] = useState(false) // flips the other two cards to show what they were
  const [shufN, setShufN] = useState(0) // which random shuffle pattern this roll uses (.rbn-shuf-N)
  const timers = useRef<number[]>([])
  const lastToken = useRef(-1)
  const cardUp = useRef(false) // whether a card is currently face-up (drives the opening flip-back)
  const firstRoll = useRef(true) // the FIRST roll after load just shuffles + reveals; later rolls slide off first
  const pending = useRef<{ entry: ActiveRoll['entry']; done: boolean } | null>(null)

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const flush = () => {
    if (pending.current && !pending.current.done) {
      commitRoll(pending.current.entry)
      pending.current.done = true
    }
  }

  // Reset to idle (three face-down cards) when the stage is cleared.
  useEffect(() => {
    if (activeRoll === null) {
      clearTimers()
      flush()
      pending.current = null
      lastToken.current = -1
      cardUp.current = false
      setPhase('idle')
      setShown(null)
      setRevealAll(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoll])

  useEffect(() => {
    if (!activeRoll || activeRoll.token === lastToken.current) return
    lastToken.current = activeRoll.token
    clearTimers()
    flush()
    pending.current = { entry: activeRoll.entry, done: false }
    primeAudio()

    const e = activeRoll.entry
    const data: Shown = {
      value: e.total, label: e.label, breakdown: e.breakdown, tag: e.tag,
      crit: activeRoll.crit, fumble: activeRoll.fumble, boosts: e.boosts, penalties: e.penalties,
      natural: activeRoll.landing, isD20: activeRoll.isD20,
    }
    const idx = ((activeRoll.token % 3) + 3) % 3 // which of the three cards reveals (varies per roll)
    setRevealAll(false) // a new roll hides the other two again
    setShufN(Math.floor(Math.random() * SHUFFLE_PATTERNS)) // alternate shuffle patterns at random
    const chime = () => {
      if (activeRoll.fumble) errorBuzz()
      else if (activeRoll.crit) tada()
      else blip()
    }

    // Instant (animation off / reduced motion): lay the revealed card at once, still commit + chime.
    if (!animate) {
      setShown(data); setRevealIndex(idx); setDeck((d) => d + 1); setPhase('shown'); cardUp.current = true
      chime()
      const done = window.setTimeout(() => { commitRoll(e); if (pending.current) pending.current.done = true }, 60)
      timers.current.push(done)
      return () => clearTimers()
    }

    // The theatrical sequence. The FIRST roll after a page load has no cards to slide away yet, so the three
    // face-down cards just SHUFFLE then reveal. Every roll after that flips the shown card back, slides the
    // three OFF, slides three new ones IN, then shuffles + reveals.
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
    let t = 0
    if (firstRoll.current) {
      // No slide off/in — the initial deck just shuffles then reveals. Set the number now (behind the faces).
      setShown(data); setRevealIndex(idx)
    } else {
      if (cardUp.current) { setPhase('flipback'); t += 360 }
      at(t, () => { setPhase('out'); whoosh() }); t += 460
      at(t, () => { setShown(data); setRevealIndex(idx); setDeck((d) => d + 1); setPhase('in') }); t += 460
    }
    // A longer, more elaborate mix (owner) — the CSS shuffle patterns run ~1.5s with several passes.
    at(t, () => { setPhase('shuffle'); tick(0.3) }); at(t + 500, () => tick(0.6)); at(t + 1000, () => tick(0.9)); t += 1500
    at(t, () => { setPhase('reveal'); cardUp.current = true; chime() }); t += 640
    at(t, () => {
      setPhase('shown')
      commitRoll(e)
      if (pending.current) pending.current.done = true
    })
    firstRoll.current = false

    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoll?.token])

  const idle = phase === 'idle' && !shown
  const label = phase === 'out' || phase === 'in' ? 'shuffling…' : phase === 'shuffle' ? 'mixing…' : phase === 'reveal' || phase === 'shown' ? 'the reveal' : 'Roll Board'
  // Assign the three faces to the three card slots so the TOTAL lands on the reveal card and the other two
  // carry the supporting numbers (seen with "reveal all").
  const faces = shown ? boardFaces(shown) : null
  const totalFace = faces?.find((f) => f.total) ?? null
  const others = faces?.filter((f) => !f.total) ?? []
  const slotFace = (i: number): Face | null => (i === revealIndex ? totalFace : others[i < revealIndex ? i : i - 1] ?? null)
  // Font scales down as the number grows so up to 999 fits the card.
  const digitClass = (v: string) => `rbn-d${Math.min(4, (v.match(/\d/g)?.length ?? 1))}`

  return (
    <div className={`rb-felt rbn-phase-${phase} rbn-shuf-${shufN} ${revealAll ? 'rbn-all' : ''} ${shown?.crit ? 'is-crit' : ''} ${shown?.fumble ? 'is-fumble' : ''}`}>
      <div className="rb-felt-label">{label}</div>

      {/* Three cards. The reveal card flips face-up (`.is-up`); "reveal all" flips the other two too. Each
          card carries a suit (♠♥♦♣) on its FRONT corners, tinted like the back's star. */}
      <div className="rbn-cards" key={deck} aria-hidden={idle}>
        {[0, 1, 2].map((i) => {
          const suit = SUITS[(i + deck) % SUITS.length]
          const face = slotFace(i)
          const up = revealAll || ((phase === 'reveal' || phase === 'shown') && i === revealIndex)
          return (
            <div key={i} className={`rbn-card rbn-c${i}${i === revealIndex ? ' is-reveal' : ''}${up ? ' is-up' : ''}`}>
              <div className="rbn-inner">
                <div className="rbn-back" aria-hidden>
                  <span className="rbn-star">✦</span>
                </div>
                <div className="rbn-front">
                  <span className="rbn-pip rbn-pip-tl" aria-hidden>{suit}</span>
                  <span className={`rbn-num ${digitClass(face?.value ?? '')}`}>{face ? face.value : ''}</span>
                  {face?.label ? <span className="rbn-face-label">{face.label}</span> : null}
                  <span className="rbn-pip rbn-pip-br" aria-hidden>{suit}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Reveal-all toggle — flip the other two cards to see what they were. */}
      {(phase === 'shown') && others.length > 0 && (
        <button type="button" className="rbn-revealall" onClick={() => setRevealAll((v) => !v)}>
          {revealAll ? 'hide the other cards' : 'reveal all cards'}
        </button>
      )}

      {idle ? (
        <div className="rb-idle"><span>tap a stat to roll — a card reveals it</span></div>
      ) : (
        // The full calculation + total, always shown beneath the reveal (never a "show breakdown" click).
        <div className="rbn-readout" role="status">
          <span className="rbn-ro-label">{shown?.label}</span>
          <span className="rbn-ro-break">{shown?.breakdown}{shown?.tag ? ` · ${shown.tag}` : ''}</span>
          {(shown?.boosts?.length || shown?.penalties?.length) ? (
            <span className="rbn-ro-src">
              {shown?.boosts?.map((b) => <em key={b} className="rbn-src-up">▲ {b}</em>)}
              {shown?.penalties?.map((p) => <em key={p} className="rbn-src-dn">▼ {p}</em>)}
            </span>
          ) : null}
          <span className="rbn-ro-total">Total <strong>{shown?.value}</strong></span>
        </div>
      )}
    </div>
  )
}

export default function RollBoard() {
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

  // Reckless (Barbarian) and Surge/transform are character-only mechanics — gate them on the
  // sheet_type's registered modules, exactly as Dice Core does, so a Rogue gets no dead controls.
  const hasReckless = useSheetModule('reckless')
  const hasForms = useSheetModule('forms')
  const dock = useRollerDock()

  // Pop the floating window open when a fresh roll arrives while minimized, so the deal is seen.
  const rollToken = activeRoll?.token
  useEffect(() => {
    if (rollToken != null) dock.expand()
  }, [rollToken, dock])

  const [muted, setMutedState] = useState(isMuted())
  const [diceCount, setDiceCount] = useState(1)
  const combat = char.combat
  const topForm = char.forms.find((f) => f.id === topFormId)
  const activeForm = char.forms.find((f) => f.id === activeFormId)

  // Manual / IRL roll entry (Areas R3 + R5), defaulting to the campaign/player record mode.
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
      const face = parseInt(entryFace, 10)
      if (!Number.isFinite(face)) return
      manualD20(label, parseInt(entryMod, 10) || 0, face, { kind: 'check' })
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
    <div className="rboard" onMouseDown={primeAudio}>
      <div className="rboard-head">
        <div className="rboard-title">
          <span className="rboard-mark" aria-hidden>
            ♠
          </span>
          Roll Board
        </div>
        <div className="rboard-btns">
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

      <BoardStage />

      <div className="rboard-adv" role="group" aria-label="advantage mode">
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

      <div className="rboard-toggles">
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
            <span className="rboard-surge">
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
          <span className="rboard-exh" title="Exhaustion: bites your d20 rolls">
            EXH {combat.exhaustion}
          </span>
        )}
      </div>

      <div className="rboard-dice">
        <div className="rboard-count" title="How many dice to roll at once">
          <button onClick={() => setDiceCount(Math.max(1, diceCount - 1))} disabled={diceCount <= 1} aria-label="fewer dice">
            −
          </button>
          <span className="rboard-cn">{diceCount}d</span>
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
      <button type="button" className="rboard-sechead" onClick={() => setEntryOpen((v) => !v)} aria-expanded={entryOpen} title="Enter a physical roll">
        {entryOpen ? '▾' : '▸'} Enter a roll
      </button>
      {entryOpen && (
        <div className="rboard-entry">
          <div className="rboard-entry-modes" role="group" aria-label="Roll entry mode">
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
            <div className="rboard-entry-row">
              <input type="number" min={1} max={20} value={entryFace} onChange={(e) => setEntryFace(e.target.value)} placeholder="d20" title="The d20 face you rolled" onKeyDown={(e) => { if (e.key === 'Enter') submitEntry() }} />
              <input type="number" value={entryMod} onChange={(e) => setEntryMod(e.target.value)} placeholder="+mod" title="Your modifier — added to the die" onKeyDown={(e) => { if (e.key === 'Enter') submitEntry() }} />
              <button type="button" className="btn tiny solid" onClick={submitEntry} disabled={entryFace.trim() === ''}>
                Fold
              </button>
            </div>
          ) : (
            <div className="rboard-entry-row">
              <input type="number" value={entryTotal} onChange={(e) => setEntryTotal(e.target.value)} placeholder="result" title="The final result you rolled in person" onKeyDown={(e) => { if (e.key === 'Enter') submitEntry() }} />
              <button type="button" className="btn tiny solid" onClick={submitEntry} disabled={entryTotal.trim() === ''}>
                Log
              </button>
            </div>
          )}
        </div>
      )}

      <button type="button" className="rboard-sechead" onClick={() => setHistOpen((v) => !v)} aria-expanded={histOpen} title={histOpen ? 'Hide roll history' : 'Show roll history'}>
        {histOpen ? '▾' : '▸'} Roll history{log.length ? ` (${log.length})` : ''}
      </button>
      {histOpen && (
        <div className="rboard-log">
          {log.length === 0 && (
            <div className="rboard-empty">
              Tap any attack, ability, save, or skill.
              <br />
              Adv / Dis apply automatically.
            </div>
          )}
          {log.map((e) => (
            <div key={e.id} className={`rboard-re ${e.crit ? 'crit' : ''} ${e.fumble ? 'fumble' : ''}`}>
              <div className="rboard-re-top">
                <div className="rboard-re-label">{e.label}</div>
                <div className="rboard-re-total">{e.total}</div>
              </div>
              {(e.penalties?.length || e.boosts?.length) ? (
                <div className="rboard-re-effects">
                  {e.penalties?.map((p) => (
                    <span key={`p-${p}`} className="rboard-eff-down" title={`${p} reduced this roll`}>
                      ▼ {p}
                    </span>
                  ))}
                  {e.boosts?.map((b) => (
                    <span key={`b-${b}`} className="rboard-eff-up" title={`${b} helped this roll`}>
                      ▲ {b}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="rboard-re-break">
                {e.mode === 'adv' && <span className="rboard-mode-adv">ADV </span>}
                {e.mode === 'dis' && <span className="rboard-mode-dis">DIS </span>}
                {e.breakdown}
                {e.crit && e.kind !== 'damage' && <span className="rboard-mode-adv"> · NAT 20</span>}
                {e.fumble && e.kind !== 'damage' && <span className="rboard-mode-dis"> · NAT 1</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
