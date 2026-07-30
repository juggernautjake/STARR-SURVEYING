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

// ── dice impacts ──────────────────────────────────────────────────────────────
//
// OWNER: *"Please make the dice rolling noises for the impact dice sound more like actual dice."*
//
// WHY `tick` WAS NEVER GOING TO SOUND LIKE A DIE. It is two oscillators — a pitched beep. A die striking a table
// has almost no pitch: it is a broadband transient, a click of noise shaped by a short resonance, and what tells
// you what the die is made of is the FILTER, not the note. Playing a beep faster does not converge on it.
//
// So `clack` synthesises the real thing: a burst of white noise through a band-pass (the "material"), plus a very
// short low resonant body (the "thud" of mass), decaying in ~30–70ms. Pitch falls as the die gets bigger, gain
// and brightness fall with the energy left in the throw, and everything is jittered per hit so no two are
// identical — a dozen identical clicks is the other way a synthesised sound gives itself away.

/** One second of white noise, generated once. Regenerating per hit would allocate on every impact. */
let noiseBuffer: AudioBuffer | null = null
function noise(a: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === a.sampleRate) return noiseBuffer
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.5), a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noiseBuffer = buf
  return buf
}

// A POLYPHONY CAP. Eight dice each firing eight impacts is sixty-four hits in a second, and simultaneous noise
// bursts sum into a clipped crunch rather than a handful of dice. Beyond four in a 40ms window the rest are
// dropped — you cannot hear them individually anyway, so dropping them costs nothing and saves the mix.
const recent: number[] = []
function tooBusy(now: number): boolean {
  while (recent.length && now - recent[0] > 0.04) recent.shift()
  if (recent.length >= 4) return true
  recent.push(now)
  return false
}

export interface ClackOpts {
  /** Faces on the die. More faces reads as a bigger, heavier die, so the impact sits lower. */
  sides?: number
  /** 1 at the start of a throw, →0 as it settles. Drives loudness and brightness. */
  energy?: number
  /** The final settle, which is a single firmer hit rather than one of the bouncing ones. */
  settle?: boolean
  skin?: string
}

export function clack({ sides = 20, energy = 1, settle = false, skin }: ClackOpts = {}) {
  const a = ac()
  if (!a || muted) return
  const t0 = a.currentTime
  if (!settle && tooBusy(t0)) return

  const v = voice(skin)
  // Bigger die → lower centre frequency. A d4 is a small hard tap, a d100 a duller knock.
  const size = Math.min(1, Math.max(0, (sides - 4) / 96))
  const jitter = 0.86 + Math.random() * 0.3
  const centre = (2600 - size * 1500) * v.pitch * jitter
  const e = Math.min(1, Math.max(0.12, energy))
  const dur = (settle ? 0.075 : 0.03 + 0.025 * e) * (0.9 + Math.random() * 0.25)
  const level = (settle ? 0.2 : 0.055 + 0.075 * e) * jitter

  // The material: noise through a band-pass. Q decides how "woody" versus "plastic" it reads.
  const src = a.createBufferSource()
  src.buffer = noise(a)
  src.playbackRate.value = 0.8 + Math.random() * 0.5
  const bp = a.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(centre, t0)
  // The transient darkens as it decays, like a real strike losing its high partials first.
  bp.frequency.exponentialRampToValueAtTime(Math.max(120, centre * 0.45), t0 + dur)
  bp.Q.value = 1.1 + v.grit * 1.6 + Math.random() * 0.7
  const g = a.createGain()
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(level, t0 + 0.0012) // near-instant attack: it is a strike
  g.gain.exponentialRampToValueAtTime(0.0006, t0 + dur)
  src.connect(bp)
  bp.connect(g)
  g.connect(a.destination)
  src.start(t0)
  src.stop(t0 + dur + 0.02)

  // The body: a very short low resonance, which is what makes it read as an object with mass rather than a hiss.
  tone({
    freq: (150 - size * 55) * v.pitch * (0.9 + Math.random() * 0.2),
    type: 'triangle',
    dur: dur * (settle ? 1.6 : 1.1),
    gain: level * 0.75,
    attack: 0.001,
  })
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

// ── Stream SFX ──────────────────────────────────────────────────────────────
// These live here rather than in the stream components so they share the single
// AudioContext above and — crucially — honour `muted`. An earlier copy of the
// poll chime built its own context and kept ringing after the sheet was muted.

// A poll's votes have finished trickling in: a rising two-note chime for the
// streamer, so she can look away from the sheet and still catch the result.
export function pollConclude(skin?: string) {
  const v = voice(skin)
  const notes = [660, 990].map((f) => f * v.pitch)
  notes.forEach((f, i) =>
    tone({ freq: f, type: v.alt, dur: 0.34, gain: 0.22, attack: 0.006, when: i * 0.16 }),
  )
}

// A donation / super chat landed. Deliberately unlike `pollConclude` and `tada`:
// a bright three-note arpeggio with a coin-like shimmer, so the streamer can tell
// money from a poll result without looking. `tier` (0-4, from superTier) makes the
// bigger ones ring higher, longer and brighter.
export function donationAlert(skin?: string, tier = 0) {
  const v = voice(skin)
  const t = Math.max(0, Math.min(4, tier))
  const lift = 1 + t * 0.06
  const notes = [783.99, 1046.5, 1318.5].map((f) => f * v.pitch * lift) // G5 C6 E6
  notes.forEach((f, i) =>
    tone({ freq: f, type: v.alt, dur: 0.2 + t * 0.04, gain: 0.16, attack: 0.004, when: i * 0.07 }),
  )
  // Coin shimmer on top; the top tiers get a second, longer ring.
  tone({ freq: 2093 * v.pitch * lift, type: 'sine', dur: 0.3 + t * 0.1, gain: 0.07, when: 0.2 })
  if (t >= 2) tone({ freq: 2637 * v.pitch, type: 'sine', dur: 0.45, gain: 0.05, when: 0.28 })
}

// Called on first user gesture to unlock audio on some browsers.
export function primeAudio() {
  ac()
}
