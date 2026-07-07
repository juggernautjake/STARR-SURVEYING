import { useRef, useState } from 'react'
import { useChar } from '../state/store'
import RollStage from './RollStage'
import { setMuted, isMuted, primeAudio } from '../lib/audio'

export default function DiceTray() {
  const { log, clearLog, resetStage, activeRoll, advMode, setAdvMode, transformActive, topFormId, transform, endTransform, nextTurn, recklessActive, toggleReckless, rollCheck, rollExpr, char } = useChar()
  const [open, setOpen] = useState(true)
  const [diceCount, setDiceCount] = useState(1)
  const [muted, setMutedState] = useState(isMuted())
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const trayRef = useRef<HTMLDivElement>(null)
  const dragOff = useRef<{ dx: number; dy: number } | null>(null)

  const combat = char.combat
  const topForm = char.forms.find((f) => f.id === topFormId)
  const activeForm = char.forms.find((f) => f.id === char.activeFormId)

  const toggleMute = () => {
    primeAudio()
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  const onDragStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return // don't drag when hitting a control
    const el = trayRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragOff.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    setPos({ x: rect.left, y: rect.top })
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
  }
  const onDragMove = (e: PointerEvent) => {
    if (!dragOff.current) return
    const el = trayRef.current
    const w = el?.offsetWidth ?? 366
    const h = el?.offsetHeight ?? 300
    const x = Math.min(window.innerWidth - w - 6, Math.max(6, e.clientX - dragOff.current.dx))
    const y = Math.min(window.innerHeight - 44, Math.max(6, e.clientY - dragOff.current.dy))
    setPos({ x, y })
  }
  const onDragEnd = () => {
    dragOff.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
  }

  if (!open) {
    return (
      <button className="tray-fab" onClick={() => setOpen(true)} title="Open dice tray">
        🎲
      </button>
    )
  }

  const posStyle = pos
    ? { position: 'fixed' as const, left: pos.x, top: pos.y, right: 'auto' as const, bottom: 'auto' as const }
    : undefined

  return (
    <div className={`tray ${pos ? 'floating' : ''}`} ref={trayRef} style={posStyle} onMouseDown={primeAudio}>
      <div className="tray-head drag-handle" onPointerDown={onDragStart} title="Drag to move">
        <div className="tray-title">⠿ Dice Core</div>
        <div className="btn-row">
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
          <button className="btn tiny ghost" onClick={() => setOpen(false)} title="Minimize">
            ▾
          </button>
        </div>
      </div>

      <div style={{ padding: '12px 12px 0' }}>
        <RollStage />
      </div>

      <div className="tray-toggles">
        <div className="adv-seg" role="group" aria-label="advantage mode">
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
        <button className={`btn tiny ${recklessActive ? 'active' : ''}`} onClick={toggleReckless} title="Reckless: advantage on STR melee">
          {recklessActive ? '⚡ RECKLESS' : 'Reckless'}
        </button>
      </div>

      {/* Transformation / Surge controls */}
      <div className="tray-surge">
        {!transformActive ? (
          <button
            className="btn tiny solid pink"
            onClick={transform}
            disabled={!topFormId}
            title={topFormId ? `Surge into ${topForm?.name}` : 'No Surge form unlocked yet (level 3+)'}
          >
            🔥 Surge{topForm ? ` → ${topForm.name.split('—').pop()?.trim()}` : ''}
            {combat.transformsThisRest >= 1 ? ' (+1 EXH)' : ''}
          </button>
        ) : (
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
        {combat.exhaustion > 0 && <span className="exh-chip" title="Exhaustion: −2 to d20 rolls per level">EXH {combat.exhaustion}</span>}
      </div>

      <div className="tray-dice">
        <div className="dice-count" title="How many dice to roll at once">
          <button className="step" onClick={() => setDiceCount(Math.max(1, diceCount - 1))} disabled={diceCount <= 1}>
            −
          </button>
          <span className="dc-n">{diceCount}d</span>
          <button className="step" onClick={() => setDiceCount(Math.min(20, diceCount + 1))} disabled={diceCount >= 20}>
            +
          </button>
        </div>
        {[4, 6, 8, 10, 12, 20, 100].map((d) => (
          <button
            key={d}
            className="btn tiny"
            onClick={() => rollExpr(`${diceCount}d${d}`, `${diceCount}d${d}`)}
            title={`Roll ${diceCount}d${d}`}
          >
            d{d}
          </button>
        ))}
        <button className="btn tiny solid" onClick={() => rollCheck('Flat d20', 0, { kind: 'check' })} title="Straight d20 check, no modifier (respects Adv / Dis)">
          Flat d20
        </button>
      </div>

      <div className="tray-log">
        {log.length === 0 && (
          <div className="tray-empty">
            Tap any attack, ability, save, or skill.
            <br />
            Adv / Dis · Rage · Reckless apply automatically.
          </div>
        )}
        {log.map((e) => (
          <div key={e.id} className={`roll-entry ${e.crit ? 'crit' : ''} ${e.fumble ? 'fumble' : ''} ${e.kind === 'damage' || e.kind === 'heal' || e.kind === 'temp' ? 'dmg' : ''}`}>
            <div className="re-top">
              <div>
                <div className="re-label">{e.label}</div>
                {e.tag && <div className="re-tag">{e.tag}</div>}
              </div>
              <div className="re-total">{e.total}</div>
            </div>
            <div className="re-break">
              {e.mode === 'adv' && <span className="crit-flag">ADV </span>}
              {e.mode === 'dis' && <span className="fumble-flag">DIS </span>}
              {e.breakdown}
              {e.crit && e.kind !== 'damage' && <span className="crit-flag"> · NAT 20</span>}
              {e.fumble && e.kind !== 'damage' && <span className="fumble-flag"> · NAT 1</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
