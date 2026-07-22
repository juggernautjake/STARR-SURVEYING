'use client'
// ═══════════════════════════════════════════════════ SIGIL STACK (T-DICE-CODEX)
// The Codex format's OWN dice roller — it replaces the shared Dice Core (`DiceTray` /
// `RollStage`) in the Codex shell only (see CodexLayout). It consumes the EXACT same roll
// data every other roller does — `activeRoll` and `RollEntry` from the shared store — so the
// arithmetic is one answer everywhere and works for every system (5e/PF2/IG). What differs is
// the RENDER and the SETTLE SIMULATION, not the maths.
//
// WHY IT LOOKS THE WAY IT DOES. The Codex is a vertical stack of resizable panes; the Sigil
// Stack echoes that identity. A roll does not spin a wheel (Dice Core) — it ASSEMBLES A
// VERTICAL STACK OF GLYPH TILES: the die lands as the base tile, each modifier / source tile
// cascades in beneath it with its own label, and the grand total locks in as the capstone.
//
// THE TOTAL IS NEVER RECOMPUTED HERE. The store is the single source of the answer; the tiles
// only EXPLAIN it by rendering the natural die (`activeRoll.landing`), the folded modifier
// (`entry.total − landing`, exactly what the store folded), the named boosts/penalties, and
// crit/fumble. The capstone always prints `entry.total`. Boosts render non-red, penalties red
// — the same contract Dice Core keeps.
import { useEffect, useRef, useState } from 'react'
import { useChar } from '../../state/store'
import type { ActiveRoll } from '../../state/store'
import { useSheetModule } from '../../state/sheetConfig'
import { tick, blip, errorBuzz, tada, whoosh, setMuted, isMuted, primeAudio } from '../../lib/audio'
import { shouldAnimateRoller } from './rollerAnim'
import { useRollFeed } from './rollFeed'
import './sigilStack.css'

type TileKind = 'die' | 'mod' | 'boost' | 'penalty' | 'total'
interface StackTile {
  key: string
  glyph: string
  label: string
  value: string
  kind: TileKind
  /** For an adv/dis d20, the raw pair the die kept from (e.g. "7,18"). */
  rolls?: string
  crit?: boolean
  fumble?: boolean
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)
// Extract the kept die + (for adv/dis) the pair from a d20 breakdown: `d20[7,18]→18` / `d20[14]`.
const D20_RE = /d20\[([^\]]*)\](?:→(\d+))?/

/** Turn a damage/heal/expr breakdown into readable stacked tiles. Typed damage
 *  (`slashing d8[3,5]+3 (11) · poison d6[4] (4)`) splits on ` · ` into per-type tiles;
 *  a plain expression (`d8[3,5] +3`) splits into per-die + flat tiles. The capstone still
 *  owns the authoritative total, so an imperfect parse never changes the answer. */
function buildDamageTiles(breakdown: string): StackTile[] {
  const tiles: StackTile[] = []
  if (breakdown.includes(' · ')) {
    breakdown.split(' · ').forEach((part, i) => {
      const sub = part.match(/\((\d+)\)\s*$/)
      const label = part.trim().split(/\s+/)[0] || 'damage'
      tiles.push({ key: `t${i}`, glyph: '✦', label, value: sub ? sub[1] : part.trim(), kind: 'mod' })
    })
    return tiles
  }
  breakdown.split(/\s+/).filter(Boolean).forEach((tok, i) => {
    const dm = tok.match(/^(−|-)?(\d*d\d+)\[([^\]]*)\]$/)
    if (dm) {
      const sign = dm[1] ? -1 : 1
      const sum = dm[3].split(',').reduce((a, v) => a + (parseInt(v.trim(), 10) || 0), 0) * sign
      tiles.push({ key: `d${i}`, glyph: '⬢', label: dm[2], value: signed(sum), kind: 'die' })
    } else if (/^[+−-]?\d+$/.test(tok)) {
      const n = parseInt(tok.replace('−', '-'), 10)
      tiles.push({ key: `f${i}`, glyph: '◈', label: 'flat', value: signed(n), kind: 'mod' })
    }
  })
  return tiles
}

/** Build the ordered tile stack for one roll. */
function buildTiles(roll: ActiveRoll): StackTile[] {
  const { isD20, landing, entry } = roll
  const tiles: StackTile[] = []
  if (isD20) {
    const m = entry.breakdown.match(D20_RE)
    const pair = m?.[1] ?? String(landing)
    tiles.push({
      key: 'die',
      glyph: '⬢',
      label: entry.mode === 'adv' ? 'd20 · advantage' : entry.mode === 'dis' ? 'd20 · disadvantage' : 'd20',
      value: String(landing),
      kind: 'die',
      rolls: pair.includes(',') ? pair : undefined,
      crit: entry.crit,
      fumble: entry.fumble,
    })
    // The folded modifier the store already computed — total = natural + mod, so this is exact.
    const mod = entry.total - landing
    if (mod !== 0) tiles.push({ key: 'mod', glyph: '◈', label: 'modifiers', value: signed(mod), kind: 'mod' })
  } else {
    buildDamageTiles(entry.breakdown).forEach((t) => tiles.push(t))
  }
  entry.boosts?.forEach((b, i) => tiles.push({ key: `bo${i}`, glyph: '▲', label: b, value: 'helped', kind: 'boost' }))
  entry.penalties?.forEach((p, i) => tiles.push({ key: `pe${i}`, glyph: '▼', label: p, value: 'hurt', kind: 'penalty' }))
  tiles.push({
    key: 'total',
    glyph: '◆',
    label: entry.label,
    value: String(entry.total),
    kind: 'total',
    crit: entry.crit,
    fumble: entry.fumble,
  })
  return tiles
}

// ── The resolution stage: consumes `activeRoll` and cascades the tiles into place ────────────
function SigilStage() {
  const { activeRoll, commitRoll, rollerAnim } = useRollFeed()
  const animate = shouldAnimateRoller(rollerAnim)
  const [tiles, setTiles] = useState<StackTile[]>([])
  const [visible, setVisible] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'assembling' | 'locked'>('idle')
  const [meta, setMeta] = useState<{ crit: boolean; fumble: boolean; tag?: string } | null>(null)
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
      setTiles([])
      setVisible(0)
      setMeta(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoll])

  useEffect(() => {
    if (!activeRoll || activeRoll.token === lastToken.current) return
    lastToken.current = activeRoll.token
    clearTimers()
    flush() // log the previous roll if it was still mid-cascade
    pending.current = { entry: activeRoll.entry, done: false }
    const t = buildTiles(activeRoll)
    const sound = () => {
      if (activeRoll.fumble) errorBuzz()
      else if (activeRoll.crit) tada()
      else blip()
    }
    setTiles(t)
    setMeta({ crit: activeRoll.crit, fumble: activeRoll.fumble, tag: activeRoll.entry.tag })
    setPhase('assembling')
    setVisible(0)
    primeAudio()

    // Instant: no cascade — compose the whole stack at once, still commit + chime. Taken when the player
    // turned animation off (RO-6) OR the OS asks for reduced motion (`shouldAnimateRoller`).
    if (!animate) {
      setVisible(t.length)
      setPhase('locked')
      sound()
      const c = window.setTimeout(() => {
        commitRoll(activeRoll.entry)
        if (pending.current) pending.current.done = true
      }, 60)
      timers.current.push(c)
      return () => clearTimers()
    }

    // Cascade-and-lock: each tile snaps in beneath the last, then the capstone locks.
    whoosh()
    const START = 140
    const STEP = 120
    for (let i = 0; i < t.length; i++) {
      const id = window.setTimeout(() => {
        setVisible(i + 1)
        tick(t.length > 1 ? i / (t.length - 1) : 1)
      }, START + i * STEP)
      timers.current.push(id)
    }
    const end = START + t.length * STEP
    const lock = window.setTimeout(() => {
      setPhase('locked')
      sound()
    }, end)
    timers.current.push(lock)
    const commit = window.setTimeout(() => {
      commitRoll(activeRoll.entry)
      if (pending.current) pending.current.done = true
    }, end + 300)
    timers.current.push(commit)

    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoll?.token])

  return (
    <div className={`sigil-stage ${phase === 'locked' ? 'sigil-locked' : ''}`}>
      <div className="sigil-stagelabel">{phase === 'idle' ? 'Sigil Stack' : phase === 'assembling' ? 'assembling…' : 'locked'}</div>
      {phase === 'idle' ? (
        <div className="sigil-idle">
          <span>
            <span className="sigil-idleglyph" aria-hidden>
              ⬢ ◈ ◆
            </span>
            tap a stat to roll — the stack assembles
            <br />
            adv / dis apply automatically
          </span>
        </div>
      ) : (
        <>
          <div className="sigil-tiles">
            {tiles.slice(0, visible).map((t) => (
              <div
                key={t.key}
                className={`sigil-tile st-${t.kind} ${t.crit ? 'is-crit' : ''} ${t.fumble ? 'is-fumble' : ''}`}
              >
                <span className="sigil-glyph" aria-hidden>
                  {t.glyph}
                </span>
                <span className="sigil-label">
                  {t.label}
                  {t.rolls && <span className="sigil-rolls">({t.rolls})</span>}
                </span>
                <span className="sigil-val">{t.value}</span>
              </div>
            ))}
          </div>
          {phase === 'locked' && meta?.crit && <span className="sigil-flag crit">★ NAT 20 · CRITICAL ★</span>}
          {phase === 'locked' && meta?.fumble && <span className="sigil-flag fumble">✖ NAT 1 · FUMBLE ✖</span>}
          {phase === 'locked' && meta?.tag && <div className="sigil-tag">{meta.tag}</div>}
        </>
      )}
    </div>
  )
}

export default function SigilStack() {
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
    <div className="sigil" onMouseDown={primeAudio}>
      <div className="sigil-head">
        <div className="sigil-title">
          <span className="sigil-mark" aria-hidden>
            ◈
          </span>
          Sigil Stack
        </div>
        <div className="sigil-btns">
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

      <SigilStage />

      <div className="sigil-adv" role="group" aria-label="advantage mode">
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

      <div className="sigil-toggles">
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
            <span className="surge-state">
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
          <span className="sigil-exh" title="Exhaustion: bites your d20 rolls">
            EXH {combat.exhaustion}
          </span>
        )}
      </div>

      <div className="sigil-dice">
        <div className="sigil-count" title="How many dice to roll at once">
          <button onClick={() => setDiceCount(Math.max(1, diceCount - 1))} disabled={diceCount <= 1} aria-label="fewer dice">
            −
          </button>
          <span className="sigil-cn">{diceCount}d</span>
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
      <button type="button" className="sigil-sechead" onClick={() => setEntryOpen((v) => !v)} aria-expanded={entryOpen} title="Enter a physical roll">
        {entryOpen ? '▾' : '▸'} Enter a roll
      </button>
      {entryOpen && (
        <div className="sigil-entry">
          <div className="sigil-entry-modes" role="group" aria-label="Roll entry mode">
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
            <div className="sigil-entry-row">
              <input type="number" min={1} max={20} value={entryFace} onChange={(e) => setEntryFace(e.target.value)} placeholder="d20" title="The d20 face you rolled" onKeyDown={(e) => { if (e.key === 'Enter') submitEntry() }} />
              <input type="number" value={entryMod} onChange={(e) => setEntryMod(e.target.value)} placeholder="+mod" title="Your modifier — added to the die" onKeyDown={(e) => { if (e.key === 'Enter') submitEntry() }} />
              <button type="button" className="btn tiny solid" onClick={submitEntry} disabled={entryFace.trim() === ''}>
                Fold
              </button>
            </div>
          ) : (
            <div className="sigil-entry-row">
              <input type="number" value={entryTotal} onChange={(e) => setEntryTotal(e.target.value)} placeholder="result" title="The final result you rolled in person" onKeyDown={(e) => { if (e.key === 'Enter') submitEntry() }} />
              <button type="button" className="btn tiny solid" onClick={submitEntry} disabled={entryTotal.trim() === ''}>
                Log
              </button>
            </div>
          )}
        </div>
      )}

      <button type="button" className="sigil-sechead" onClick={() => setHistOpen((v) => !v)} aria-expanded={histOpen} title={histOpen ? 'Hide roll history' : 'Show roll history'}>
        {histOpen ? '▾' : '▸'} Roll history{log.length ? ` (${log.length})` : ''}
      </button>
      {histOpen && (
        <div className="sigil-log">
          {log.length === 0 && (
            <div className="sigil-empty">
              Tap any attack, ability, save, or skill.
              <br />
              Adv / Dis apply automatically.
            </div>
          )}
          {log.map((e) => (
            <div key={e.id} className={`sigil-re ${e.crit ? 'crit' : ''} ${e.fumble ? 'fumble' : ''}`}>
              <div className="sigil-re-top">
                <div className="sigil-re-label">{e.label}</div>
                <div className="sigil-re-total">{e.total}</div>
              </div>
              {(e.penalties?.length || e.boosts?.length) ? (
                <div className="sigil-re-effects">
                  {e.penalties?.map((p) => (
                    <span key={`p-${p}`} className="sigil-eff-down" title={`${p} reduced this roll`}>
                      ▼ {p}
                    </span>
                  ))}
                  {e.boosts?.map((b) => (
                    <span key={`b-${b}`} className="sigil-eff-up" title={`${b} helped this roll`}>
                      ▲ {b}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="sigil-re-break">
                {e.mode === 'adv' && <span className="sigil-mode-adv">ADV </span>}
                {e.mode === 'dis' && <span className="sigil-mode-dis">DIS </span>}
                {e.breakdown}
                {e.crit && e.kind !== 'damage' && <span className="sigil-mode-adv"> · NAT 20</span>}
                {e.fumble && e.kind !== 'damage' && <span className="sigil-mode-dis"> · NAT 1</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
