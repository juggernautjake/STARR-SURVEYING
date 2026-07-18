// Synthesized SFX via the Web Audio API — no audio files, fully offline.
// A wheel-of-fortune tick while spinning, an error buzz on nat 1, a happy
// "tada" fanfare on nat 20, plus soft blips for generic rolls.
//
// Each dice-roller SKIN (Area D4e) has its own VOICE — the SAME events, but a
// different timbre + pitch so the rugged tray sounds like stone/iron, the natural
// one soft + woody, fantasy bell-like + shimmery, medieval hornlike, futuristic the
// original digital synth. Every SFX takes an optional skin and falls back to the
// futuristic voice, so callers that don't pass one keep the original sound.

let ctx: AudioContext | null = null
let muted = false

// A per-skin voice: the two oscillator waveforms it favours, a pitch multiplier, and
// a `grit` amount (extra detuned partials) for the rougher trays.
interface Voice { wave: OscillatorType; alt: OscillatorType; pitch: number; grit: number }
const VOICES: Record<string, Voice> = {
  futuristic: { wave: 'square', alt: 'triangle', pitch: 1.0, grit: 0 },
  rugged: { wave: 'sawtooth', alt: 'square', pitch: 0.72, grit: 1 },
  natural: { wave: 'sine', alt: 'triangle', pitch: 0.92, grit: 0 },
  fantasy: { wave: 'sine', alt: 'sine', pitch: 1.16, grit: 0 },
  medieval: { wave: 'triangle', alt: 'square', pitch: 0.82, grit: 0.5 },
}
function voice(skin?: string): Voice { return VOICES[skin ?? 'futuristic'] ?? VOICES.futuristic }

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
// slowdown reads like a real prize wheel. Per skin: futuristic clicks digitally,
// rugged/medieval knock lower + grittier, natural taps softly, fantasy chimes.
export function tick(progress = 0, skin?: string) {
  const v = voice(skin)
  const base = (620 + progress * 520) * v.pitch
  tone({ freq: base, type: v.wave, dur: 0.035, gain: 0.09, attack: 0.001 })
  tone({ freq: base * 1.5, type: v.alt, dur: 0.02, gain: 0.04, attack: 0.001 })
  if (v.grit) tone({ freq: base * 0.5, type: 'square', dur: 0.03, gain: 0.05 * v.grit, attack: 0.001 })
}

// Generic soft blip when a roll is committed (non-crit / non-fumble).
export function blip(skin?: string) {
  const v = voice(skin)
  tone({ freq: 880 * v.pitch, type: v.alt, dur: 0.09, gain: 0.12, glideTo: 1200 * v.pitch })
  if (skin === 'fantasy') tone({ freq: 1760, type: 'sine', dur: 0.18, gain: 0.05, when: 0.02 }) // bell overtone
}

// NAT 1 — descending error buzz.
export function errorBuzz(skin?: string) {
  const a = ac()
  if (!a || muted) return
  const v = voice(skin)
  tone({ freq: 300 * v.pitch, type: 'sawtooth', dur: 0.5, gain: 0.16, glideTo: 90 * v.pitch })
  tone({ freq: 150 * v.pitch, type: v.wave, dur: 0.5, gain: 0.1, glideTo: 60, when: 0.02 })
  // gritty warble — rougher voices warble harder + longer
  const steps = 4 + Math.round(v.grit * 3)
  for (let i = 0; i < steps; i++) tone({ freq: (220 - i * 20) * v.pitch, type: 'square', dur: 0.08, gain: 0.06, when: i * 0.11 })
}

// NAT 20 — cheerful ascending "tada" fanfare, coloured by the skin's voice.
export function tada(skin?: string) {
  const v = voice(skin)
  const notes = [523.25, 659.25, 783.99, 1046.5].map((f) => f * v.pitch) // C5 E5 G5 C6
  notes.forEach((f, i) =>
    tone({ freq: f, type: v.alt, dur: 0.28, gain: 0.15, attack: 0.006, when: i * 0.08 }),
  )
  // shimmer on top — fantasy rings longest + brightest, rugged/medieval are darker
  const shimmerGain = skin === 'fantasy' ? 0.12 : skin === 'rugged' || skin === 'medieval' ? 0.05 : 0.08
  tone({ freq: 1568 * v.pitch, type: 'sine', dur: 0.6, gain: shimmerGain, when: 0.32 })
  tone({ freq: 2093 * v.pitch, type: 'sine', dur: 0.5, gain: shimmerGain * 0.6, when: 0.36 })
}

// Whoosh when the spin starts.
export function whoosh(skin?: string) {
  const v = voice(skin)
  tone({ freq: 180 * v.pitch, type: v.wave, dur: 0.22, gain: 0.08, glideTo: 900 * v.pitch })
}

// Called on first user gesture to unlock audio on some browsers.
export function primeAudio() {
  ac()
}
