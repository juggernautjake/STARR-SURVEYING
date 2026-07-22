'use client'
// ═══════════════════════════════════════════════════ ROLL BOARD (T-DICE-DASHBOARD)
// The Dashboard format's OWN dice roller — it replaces the shared Dice Core (`DiceTray` /
// `RollStage`) in the Dashboard shell only (see DashboardLayout). It consumes the EXACT same roll
// data every other roller does — `activeRoll` and `RollEntry` from the shared store — so the
// arithmetic is one answer everywhere and works for every system (5e/PF2/IG). What differs is the
// RENDER and the DEAL SIMULATION, not the maths.
//
// WHY IT LOOKS THE WAY IT DOES. The Dashboard is a grid of cards; the Roll Board echoes that
// identity. A roll is DEALT as a HAND OF CARDS onto a felt: the natural die flips face-up as the
// first card, each modifier / source flips down beside it, and the grand total reads as the final
// HAND VALUE. Advantage/disadvantage deals TWO d20 cards and visibly discards the unused one; a crit
// deals a highlighted flourish card. Distinct deal-and-flip settle (3D card flip, staggered), NOT
// the Sigil Stack's vertical cascade.
//
// THE TOTAL IS NEVER RECOMPUTED HERE. The store is the single source of the answer; the cards only
// EXPLAIN it by rendering the natural die (`activeRoll.landing`), the folded modifier
// (`entry.total − landing`, exactly what the store folded), the named boosts/penalties, and
// crit/fumble. The hand value always prints `entry.total`. Boosts read non-red, penalties red — the
// same contract Dice Core keeps.
import { useEffect, useRef, useState } from 'react'
import { useChar } from '../../state/store'
import type { ActiveRoll } from '../../state/store'
import { useSheetModule } from '../../state/sheetConfig'
import { tick, blip, errorBuzz, tada, whoosh, setMuted, isMuted, primeAudio } from '../../lib/audio'
import { useRollerDock } from './FloatingRoller'
import { shouldAnimateRoller } from './rollerAnim'
import { useRollFeed } from './rollFeed'
import './rollBoard.css'

type CardKind = 'die' | 'discard' | 'mod' | 'boost' | 'penalty' | 'crit' | 'fumble'
interface DealtCard {
  key: string
  pip: string
  label: string
  value: string
  kind: CardKind
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)
// Extract the kept die + (for adv/dis) the pair from a d20 breakdown: `d20[7,18]→18` / `d20[14]`.
const D20_RE = /d20\[([^\]]*)\](?:→(\d+))?/

/** Turn a damage/heal/expr breakdown into readable cards. Typed damage
 *  (`slashing d8[3,5]+3 (11) · poison d6[4] (4)`) splits on ` · ` into per-type cards;
 *  a plain expression (`d8[3,5] +3`) splits into per-die + flat cards. The hand value still
 *  owns the authoritative total, so an imperfect parse never changes the answer. */
function buildDamageCards(breakdown: string): DealtCard[] {
  const cards: DealtCard[] = []
  if (breakdown.includes(' · ')) {
    breakdown.split(' · ').forEach((part, i) => {
      const sub = part.match(/\((\d+)\)\s*$/)
      const label = part.trim().split(/\s+/)[0] || 'damage'
      cards.push({ key: `t${i}`, pip: '✦', label, value: sub ? sub[1] : part.trim(), kind: 'mod' })
    })
    return cards
  }
  breakdown.split(/\s+/).filter(Boolean).forEach((tok, i) => {
    const dm = tok.match(/^(−|-)?(\d*d\d+)\[([^\]]*)\]$/)
    if (dm) {
      const sign = dm[1] ? -1 : 1
      const sum = dm[3].split(',').reduce((a, v) => a + (parseInt(v.trim(), 10) || 0), 0) * sign
      cards.push({ key: `d${i}`, pip: '◆', label: dm[2], value: signed(sum), kind: 'die' })
    } else if (/^[+−-]?\d+$/.test(tok)) {
      const n = parseInt(tok.replace('−', '-'), 10)
      cards.push({ key: `f${i}`, pip: '♦', label: 'flat', value: signed(n), kind: 'mod' })
    }
  })
  return cards
}

/** Build the ordered hand of cards for one roll. */
function buildCards(roll: ActiveRoll): DealtCard[] {
  const { isD20, landing, entry } = roll
  const cards: DealtCard[] = []
  if (isD20) {
    const m = entry.breakdown.match(D20_RE)
    const pair = m?.[1] ?? String(landing)
    // Advantage/disadvantage: the store rolled a pair — deal BOTH d20 cards and mark the one
    // that was discarded, so the player sees the choice, not just the survivor.
    if (pair.includes(',') && (entry.mode === 'adv' || entry.mode === 'dis')) {
      const faces = pair.split(',').map((v) => parseInt(v.trim(), 10)).filter((n) => Number.isFinite(n))
      faces.forEach((f, i) => {
        const kept = f === landing && !cards.some((c) => c.kind === 'die')
        cards.push({
          key: `d20-${i}`,
          pip: '♠',
          label: kept ? (entry.mode === 'adv' ? 'd20 · kept high' : 'd20 · kept low') : 'd20 · discarded',
          value: String(f),
          kind: kept ? 'die' : 'discard',
        })
      })
    } else {
      cards.push({ key: 'die', pip: '♠', label: 'd20', value: String(landing), kind: 'die' })
    }
    // The folded modifier the store already computed — total = natural + mod, so this is exact.
    const mod = entry.total - landing
    if (mod !== 0) cards.push({ key: 'mod', pip: '♦', label: 'modifiers', value: signed(mod), kind: 'mod' })
  } else {
    buildDamageCards(entry.breakdown).forEach((c) => cards.push(c))
  }
  entry.boosts?.forEach((b, i) => cards.push({ key: `bo${i}`, pip: '♣', label: b, value: 'helped', kind: 'boost' }))
  entry.penalties?.forEach((p, i) => cards.push({ key: `pe${i}`, pip: '♥', label: p, value: 'hurt', kind: 'penalty' }))
  // Crit / fumble deal a highlighted flourish card of their own — the Dashboard's card identity.
  if (entry.crit && entry.kind !== 'damage') cards.push({ key: 'crit', pip: '★', label: 'NAT 20 · CRIT', value: '×', kind: 'crit' })
  if (entry.fumble && entry.kind !== 'damage') cards.push({ key: 'fumble', pip: '✖', label: 'NAT 1 · FUMBLE', value: '×', kind: 'fumble' })
  return cards
}

// ── The resolution stage: consumes `activeRoll` and deals the cards onto the felt ────────────
export function BoardStage() {
  const { activeRoll, commitRoll, rollerAnim } = useRollFeed()
  const animate = shouldAnimateRoller(rollerAnim)
  const [cards, setCards] = useState<DealtCard[]>([])
  const [visible, setVisible] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'dealing' | 'settled'>('idle')
  const [meta, setMeta] = useState<{ crit: boolean; fumble: boolean; total: number; label: string; tag?: string } | null>(null)
  const timers = useRef<number[]>([])
  const lastToken = useRef(-1)
  const pending = useRef<{ entry: ActiveRoll['entry']; done: boolean } | null>(null)

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  // Commit any not-yet-logged roll before starting a new one, so rapid clicks never drop entries.
  const flush = () => {
    if (pending.current && !pending.current.done) {
      commitRoll(pending.current.entry)
      pending.current.done = true
    }
  }

  // Reset to idle when the stage is cleared.
  useEffect(() => {
    if (activeRoll === null) {
      clearTimers()
      flush()
      pending.current = null
      lastToken.current = -1
      setPhase('idle')
      setCards([])
      setVisible(0)
      setMeta(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoll])

  useEffect(() => {
    if (!activeRoll || activeRoll.token === lastToken.current) return
    lastToken.current = activeRoll.token
    clearTimers()
    flush() // log the previous roll if it was still mid-deal
    pending.current = { entry: activeRoll.entry, done: false }
    const c = buildCards(activeRoll)
    const sound = () => {
      if (activeRoll.fumble) errorBuzz()
      else if (activeRoll.crit) tada()
      else blip()
    }
    setCards(c)
    setMeta({ crit: activeRoll.crit, fumble: activeRoll.fumble, total: activeRoll.entry.total, label: activeRoll.entry.label, tag: activeRoll.entry.tag })
    setPhase('dealing')
    setVisible(0)
    primeAudio()

    // Instant: no deal — lay the whole hand at once, still commit + chime. Taken when the player turned
    // animation off (RO-6) OR the OS asks for reduced motion (`shouldAnimateRoller`).
    if (!animate) {
      setVisible(c.length)
      setPhase('settled')
      sound()
      const done = window.setTimeout(() => {
        commitRoll(activeRoll.entry)
        if (pending.current) pending.current.done = true
      }, 60)
      timers.current.push(done)
      return () => clearTimers()
    }

    // Deal-and-flip: each card snaps face-up onto the felt in turn, then the hand value locks.
    whoosh()
    const START = 130
    const STEP = 135
    for (let i = 0; i < c.length; i++) {
      const id = window.setTimeout(() => {
        setVisible(i + 1)
        tick(c.length > 1 ? i / (c.length - 1) : 1)
      }, START + i * STEP)
      timers.current.push(id)
    }
    const end = START + c.length * STEP
    const settle = window.setTimeout(() => {
      setPhase('settled')
      sound()
    }, end)
    timers.current.push(settle)
    const commit = window.setTimeout(() => {
      commitRoll(activeRoll.entry)
      if (pending.current) pending.current.done = true
    }, end + 300)
    timers.current.push(commit)

    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoll?.token])

  return (
    <div className={`rb-felt ${phase === 'settled' ? 'rb-settled' : ''} ${meta?.crit ? 'is-crit' : ''} ${meta?.fumble ? 'is-fumble' : ''}`}>
      <div className="rb-felt-label">{phase === 'idle' ? 'Roll Board' : phase === 'dealing' ? 'dealing…' : 'hand'}</div>
      {phase === 'idle' ? (
        <div className="rb-idle">
          <span>
            <span className="rb-idlepips" aria-hidden>
              ♠ ♦ ♣
            </span>
            tap a stat to roll — the hand is dealt
            <br />
            adv / dis deal two cards, one discarded
          </span>
        </div>
      ) : (
        <>
          <div className="rb-hand">
            {cards.slice(0, visible).map((c) => (
              <div key={c.key} className={`rb-card rc-${c.kind}`}>
                <span className="rb-pip rb-pip-tl" aria-hidden>{c.pip}</span>
                <span className="rb-card-val">{c.value}</span>
                <span className="rb-card-label">{c.label}</span>
                <span className="rb-pip rb-pip-br" aria-hidden>{c.pip}</span>
              </div>
            ))}
          </div>
          {phase === 'settled' && meta && (
            <div className="rb-hand-value" role="status">
              <span className="rb-hv-label">{meta.label}</span>
              <span className="rb-hv-total">{meta.total}</span>
              {meta.tag && <span className="rb-hv-tag">{meta.tag}</span>}
            </div>
          )}
        </>
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
