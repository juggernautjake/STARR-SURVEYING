// Synthesized SFX via the Web Audio API — no audio files, fully offline.
// A wheel-of-fortune tick while spinning, an error buzz on nat 1, a happy
// "tada" fanfare on nat 20, plus soft blips for generic rolls.

let ctx: AudioContext | null = null
let muted = false

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function setMuted(m: boolean) {
  muted = m
}
export function isMuted() {
  return muted
}

interface ToneOpts {
  freq: number
  type?: OscillatorType
  dur?: number
  gain?: number
  attack?: number
  decay?: number
  glideTo?: number
  when?: number
}

function tone({ freq, type = 'square', dur = 0.08, gain = 0.14, attack = 0.004, glideTo, when = 0 }: ToneOpts) {
  const a = ac()
  if (!a || muted) return
  const t0 = a.currentTime + when
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur)
  osc.connect(g)
  g.connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

// A short mechanical "click/tick" — pitch rises slightly with progress so the
// slowdown reads like a real prize wheel.
export function tick(progress = 0) {
  const base = 620 + progress * 520
  tone({ freq: base, type: 'square', dur: 0.035, gain: 0.09, attack: 0.001 })
  tone({ freq: base * 1.5, type: 'triangle', dur: 0.02, gain: 0.04, attack: 0.001 })
}

// Generic soft blip when a roll is committed (non-crit / non-fumble).
export function blip() {
  tone({ freq: 880, type: 'sine', dur: 0.09, gain: 0.12, glideTo: 1200 })
}

// NAT 1 — descending error buzz.
export function errorBuzz() {
  const a = ac()
  if (!a || muted) return
  tone({ freq: 300, type: 'sawtooth', dur: 0.5, gain: 0.16, glideTo: 90 })
  tone({ freq: 150, type: 'square', dur: 0.5, gain: 0.1, glideTo: 60, when: 0.02 })
  // gritty warble
  for (let i = 0; i < 4; i++) tone({ freq: 220 - i * 20, type: 'square', dur: 0.08, gain: 0.06, when: i * 0.11 })
}

// NAT 20 — cheerful ascending "tada" fanfare.
export function tada() {
  const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  notes.forEach((f, i) =>
    tone({ freq: f, type: 'triangle', dur: 0.28, gain: 0.15, attack: 0.006, when: i * 0.08 }),
  )
  // shimmer on top
  tone({ freq: 1568, type: 'sine', dur: 0.6, gain: 0.08, when: 0.32 })
  tone({ freq: 2093, type: 'sine', dur: 0.5, gain: 0.05, when: 0.36 })
}

// Whoosh when the spin starts.
export function whoosh() {
  tone({ freq: 180, type: 'sawtooth', dur: 0.22, gain: 0.08, glideTo: 900 })
}

// Called on first user gesture to unlock audio on some browsers.
export function primeAudio() {
  ac()
}
