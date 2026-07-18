import { useEffect, useRef, useState } from 'react'
import { useChar } from '../state/store'
import type { RollEntry } from '../state/store'
import { tick, blip, errorBuzz, tada, whoosh, isMuted, primeAudio } from '../lib/audio'

// The rolling number cycles through the CHARACTER'S accent tokens, not a fixed rainbow.
// This used to be a hardcoded neon list (hot pink, magenta, cyan…), which meant every sheet's
// dice roller flashed the original neon palette regardless of its theme — jarring on the
// earthy/parchment skins. Resolved at paint time by the browser, so each theme supplies its own.
const NEON = [
  'var(--hotpink)', 'var(--pink)', 'var(--tealbright)', 'var(--teal)',
  'var(--gold)', 'var(--violet-2)', 'var(--violet)', 'var(--good)',
]
const FONTS = [
  "'Orbitron'", "'Audiowide'", "'Chakra Petch'", "'Rajdhani'", "'Syncopate'", "'Michroma'", "'JetBrains Mono'", "'Oswald'",
]
const WEIGHTS = [500, 600, 700, 800, 900]

function randOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function randInt(min: number, max: number): number {
  if (max < min) max = min
  return Math.floor(Math.random() * (max - min + 1)) + min
}

interface DisplayStyle {
  color: string
  fontFamily: string
  fontWeight: number
  rotate: number
}

// Per-skin number-display behaviour (Area D4d). The futuristic screen cycles colour + font + tilt as it
// spins; the others are calmer — some keep a STABLE font/size, some are a single MONO colour — so each roller
// has its own vibe while colours still come from the sheet's accent tokens.
interface DisplayMode { cycleColor: boolean; cycleFont: boolean; rotate: boolean; color?: string; font?: string; weight?: number }
const DISPLAY_MODES: Record<string, DisplayMode> = {
  futuristic: { cycleColor: true, cycleFont: true, rotate: true },
  fantasy: { cycleColor: true, cycleFont: false, rotate: false, font: "'Michroma'", weight: 700 }, // shimmering colour, steady glyphs
  natural: { cycleColor: false, cycleFont: false, rotate: false, color: 'var(--tealbright)', font: "'Rajdhani'", weight: 700 }, // calm mono teal
  rugged: { cycleColor: false, cycleFont: false, rotate: false, color: 'var(--gold)', font: "'Oswald'", weight: 900 }, // solid mono, heavy
  medieval: { cycleColor: false, cycleFont: false, rotate: false, color: 'var(--gold)', font: "Georgia, 'Times New Roman', serif", weight: 700 }, // classic serif mono
}

export default function RollStage({ roller = 'futuristic' }: { roller?: string }) {
  const mode = DISPLAY_MODES[roller] ?? DISPLAY_MODES.futuristic
  const { activeRoll, commitRoll } = useChar()
  const [display, setDisplay] = useState<number | string>('—')
  const [style, setStyle] = useState<DisplayStyle>({ color: 'var(--tealbright)', fontFamily: "'Orbitron'", fontWeight: 800, rotate: 0 })
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'crit' | 'fumble' | 'done'>('idle')
  const [reveal, setReveal] = useState<{ total: number; breakdown: string; label: string; tag?: string; isD20: boolean } | null>(null)
  const timer = useRef<number | null>(null)
  const lastToken = useRef<number>(-1)
  const pending = useRef<{ entry: Omit<RollEntry, 'id'>; done: boolean } | null>(null)

  // commit any not-yet-logged roll (called before starting a new spin so rapid
  // clicks never drop entries and nothing gets stuck mid-animation)
  const flush = () => {
    if (pending.current && !pending.current.done) {
      commitRoll(pending.current.entry)
      pending.current.done = true
    }
  }

  // reset to idle when the stage is cleared
  useEffect(() => {
    if (activeRoll === null) {
      if (timer.current) window.clearTimeout(timer.current)
      flush()
      pending.current = null
      lastToken.current = -1
      setPhase('idle')
      setDisplay('—')
      setReveal(null)
      setStyle({ color: 'var(--tealbright)', fontFamily: "'Orbitron'", fontWeight: 800, rotate: 0 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoll])

  useEffect(() => {
    if (!activeRoll || activeRoll.token === lastToken.current) return
    lastToken.current = activeRoll.token
    const { landing, min, max, crit, fumble, entry } = activeRoll

    if (timer.current) window.clearTimeout(timer.current)
    flush() // log the previous roll if it was still pending
    pending.current = { entry, done: false }
    setReveal(null)
    setPhase('spinning')
    // Wake the audio context immediately on the click. Browsers resume it
    // asynchronously, so on the first roll after idle it isn't running yet —
    // hence a short warm-up delay before the spin so the ticks land in sync
    // with the numbers instead of trailing behind them.
    primeAudio()
    const WARMUP = 200

    const steps = 15 + Math.floor(Math.random() * 10) // 15..24, varied each roll
    let i = 0

    const run = () => {
      const progress = i / steps
      if (i < steps) {
        setDisplay(randInt(min, max))
        setStyle({
          color: mode.cycleColor ? randOf(NEON) : (mode.color ?? 'var(--tealbright)'),
          fontFamily: mode.cycleFont ? randOf(FONTS) : (mode.font ?? "'Orbitron'"),
          fontWeight: mode.cycleFont ? randOf(WEIGHTS) : (mode.weight ?? 800),
          rotate: mode.rotate ? (Math.random() - 0.5) * 10 : 0,
        })
        tick(progress, roller)
        i++
        const ease = Math.pow(progress, 2.4)
        const delay = 32 + ease * 210 + Math.random() * 26
        timer.current = window.setTimeout(run, delay)
      } else {
        setDisplay(landing)
        setStyle({
          // Crit/fumble always read semantically (gold/danger) on every skin; a normal landing uses the skin's
          // display mode — cycling colour/font on futuristic, the skin's stable/mono colour otherwise (D4d).
          color: fumble ? 'var(--danger)' : crit ? 'var(--gold)' : mode.cycleColor ? randOf(NEON) : (mode.color ?? 'var(--tealbright)'),
          fontFamily: fumble ? "'Oswald'" : crit ? "'Orbitron'" : mode.cycleFont ? randOf(FONTS) : (mode.font ?? "'Orbitron'"),
          fontWeight: 900,
          rotate: 0,
        })
        if (fumble) {
          setPhase('fumble')
          errorBuzz(roller)
        } else if (crit) {
          setPhase('crit')
          tada(roller)
        } else {
          setPhase('done')
          blip(roller)
        }
        setReveal({ total: entry.total, breakdown: entry.breakdown, label: entry.label, tag: entry.tag, isD20: activeRoll.isD20 })
        timer.current = window.setTimeout(() => {
          commitRoll(entry)
          if (pending.current) pending.current.done = true
        }, 620)
      }
    }

    // Kick off after the warm-up: the whoosh and first tick fire together with
    // the first spinning number, once the audio context has had time to resume.
    timer.current = window.setTimeout(() => {
      whoosh(roller)
      run()
    }, WARMUP)

    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoll?.token])

  const spinning = phase === 'spinning'

  return (
    <div className={`stage stage-${phase}`}>
      <svg className="stage-wires" viewBox="0 0 340 150" preserveAspectRatio="none" aria-hidden>
        <path className="wire w1" d="M0,26 H120 L140,46 H240 L262,26 H340" />
        <path className="wire w2" d="M0,120 H90 L112,100 H210 L232,120 H340" />
        <path className="wire w3" d="M0,74 H60 L80,74 M260,74 L280,74 H340" />
        <circle className="node n1" cx="140" cy="46" r="3.5" />
        <circle className="node n2" cx="112" cy="100" r="3.5" />
        <circle className="node n3" cx="262" cy="26" r="3.5" />
        <circle className="node n4" cx="232" cy="120" r="3.5" />
      </svg>

      <div className="stage-scan" />
      <div className="stage-label">{reveal ? reveal.label : phase === 'spinning' ? 'ROLLING…' : 'DICE CORE'}</div>

      <div className="stage-core">
        <div
          className="stage-number"
          style={{
            color: style.color,
            fontFamily: style.fontFamily,
            fontWeight: style.fontWeight,
            transform: `rotate(${style.rotate}deg)`,
            textShadow: spinning ? `0 0 10px ${style.color}` : `0 0 18px ${style.color}, 0 0 42px ${style.color}`,
          }}
        >
          {display}
        </div>
      </div>

      <div className="stage-reveal">
        {reveal && phase !== 'spinning' ? (
          <>
            {phase === 'crit' && <span className="rv-flag crit">★ NAT 20 · CRITICAL ★</span>}
            {phase === 'fumble' && <span className="rv-flag fumble">✖ NAT 1 · FUMBLE ✖</span>}
            <div className="rv-line">
              <span className="rv-break">{reveal.breakdown}</span>
              {reveal.isD20 && reveal.total !== display && <span className="rv-total">= {reveal.total}</span>}
            </div>
            {reveal.tag && <div className="rv-tag">{reveal.tag}</div>}
          </>
        ) : (
          <span className="rv-idle">{phase === 'spinning' ? '· · ·' : 'tap a stat to roll'}</span>
        )}
      </div>

      {isMuted() && <div className="stage-mute">muted</div>}
    </div>
  )
}
