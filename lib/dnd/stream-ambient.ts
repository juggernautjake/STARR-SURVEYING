// Deterministic ambient chatter — so every viewer sees the SAME chat.
//
// The procedural crowd used to be generated per-browser with Math.random() on a
// self-scheduling jittered timeout. That meant two people watching the same stream
// saw completely different filler lines, which broke the illusion that they were
// watching one broadcast together (owner report 2026-07-19).
//
// The fix is to make ambient a pure function of state everyone already shares, rather
// than shipping the lines over the wire:
//
//   * Time is chopped into fixed BEAT_MS slots on the wall clock, so every client
//     agrees on which beat is "now" without a handshake.
//   * Each beat is seeded from (streamKey, beat) and run through a small deterministic
//     PRNG. Same seed → same burst size, same speakers, same bodies, everywhere.
//   * The rate is derived only from SHARED inputs (viewer count, chat mode, the DM's
//     focus window). Nothing local may influence it, or the feeds drift apart.
//
// The pay-off over electing one client to broadcast: no single point of failure, no
// throwaway rows, and a late joiner is instantly in sync because the schedule is a
// function of the clock rather than of what they missed.

/** Deterministic 32-bit PRNG (mulberry32). Small, fast, and stable across engines —
 *  which matters because different browsers must produce identical sequences. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable string→int hash (FNV-1a). Used to seed a beat from the stream identity. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function seedFor(streamKey: string, beat: number): number {
  return hashStr(`${streamKey}#${beat}`)
}

/** The length of one scheduling slot. Small enough that chat still feels organic,
 *  large enough that clients with slightly skewed clocks land on the same beat. */
export const BEAT_MS = 250

/** Which beat a wall-clock instant falls in. */
export function beatAt(ms: number): number {
  return Math.floor(ms / BEAT_MS)
}

export interface AmbientLine {
  /** Index into the caller's crowd array. */
  userIndex: number
  /** Index into the caller's phrase pool. */
  bodyIndex: number
  /** Emote decoration rolls, kept here so the BODY is deterministic too. */
  spam: boolean
  spamReps: number
  spamToken: number
  lead: boolean
  leadEmoji: number
  trailing: number[]
}

export interface BeatInput {
  /** Identifies the stream — normally the character id. */
  streamKey: string
  beat: number
  /** Messages per second, derived only from shared state. */
  perSec: number
  crowdSize: number
  poolSize: number
  emojiCount: number
  spamTokenCount: number
  maxBurst: number
}

/** The lines that fire on one beat. Empty most beats at a normal pace.
 *
 *  Burstiness is preserved from the original feel — mostly singles, occasional small
 *  clusters, rare floods — but every roll now comes from the seeded stream instead of
 *  Math.random(), so it is reproducible on every client. */
export function ambientBeat(inp: BeatInput): AmbientLine[] {
  const { streamKey, beat, perSec, crowdSize, poolSize, emojiCount, spamTokenCount, maxBurst } = inp
  if (crowdSize <= 0 || poolSize <= 0 || perSec <= 0 || maxBurst <= 0) return []
  const rng = mulberry32(seedFor(streamKey, beat))

  // Probability this beat speaks at all.
  const p = Math.min(1, perSec * (BEAT_MS / 1000))
  if (rng() >= p) return []

  // Cluster size — mirrors the original distribution.
  const r = rng()
  let burst = perSec < 0.5 ? 1 : r < 0.62 ? 1 : r < 0.9 ? 2 + Math.floor(rng() * 3) : 4 + Math.floor(rng() * 5)
  burst = Math.max(1, Math.min(burst, maxBurst))

  const lines: AmbientLine[] = []
  for (let i = 0; i < burst; i++) {
    const spam = rng() < 0.16
    const spamReps = 3 + Math.floor(rng() * 7)
    const spamToken = Math.floor(rng() * Math.max(1, spamTokenCount))
    const trailingCount = Math.floor(rng() * 4)
    const trailing: number[] = []
    for (let t = 0; t < trailingCount; t++) trailing.push(Math.floor(rng() * Math.max(1, emojiCount)))
    const lead = rng() < 0.3
    lines.push({
      userIndex: Math.floor(rng() * crowdSize),
      bodyIndex: Math.floor(rng() * poolSize),
      spam,
      spamReps,
      spamToken,
      lead,
      leadEmoji: Math.floor(rng() * Math.max(1, emojiCount)),
      trailing,
    })
  }
  return lines
}

/** Every ambient line across a half-open beat range, oldest first. Callers advance a
 *  cursor and drain — so a slow tick, a backgrounded tab or a late join all replay the
 *  same schedule rather than inventing their own. Bounded so a long pause can't flood. */
export function ambientBetween(inp: Omit<BeatInput, 'beat'>, fromBeat: number, toBeat: number, maxBeats = 40): Array<AmbientLine & { beat: number }> {
  const start = Math.max(fromBeat, toBeat - maxBeats)
  const out: Array<AmbientLine & { beat: number }> = []
  for (let b = start; b < toBeat; b++) {
    for (const l of ambientBeat({ ...inp, beat: b })) out.push({ ...l, beat: b })
  }
  return out
}
