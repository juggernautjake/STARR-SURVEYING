// Stream moderation (Phase J10) — chat modes + mod actions for the fake streamer chat.
// Pure helpers so the StreamControl (DM) and StreamChat (viewers) agree on what a mode
// allows and how a mod action reads. The live state rides a broadcast channel; nothing
// here touches the DB (the ambient crowd is procedural, J1).

export type ChatMode = 'off' | 'slow' | 'sub' | 'emote' | 'follower'

export interface ModLine {
  /** Badges on the speaker (sub/prime/vip/mod/…), from the J1 crowd or a DM line. */
  badges?: string[]
  /** Whether the message contains at least one emote token (J8). */
  hasEmote: boolean
}

export const CHAT_MODES: { id: ChatMode; label: string; icon: string }[] = [
  { id: 'off', label: 'Normal', icon: '💬' },
  { id: 'slow', label: 'Slow', icon: '🐢' },
  { id: 'sub', label: 'Sub-only', icon: '⭐' },
  { id: 'emote', label: 'Emote-only', icon: '😹' },
  { id: 'follower', label: 'Follower-only', icon: '➕' },
]

const SUB_BADGES = new Set(['sub', 'subscriber', 'prime', 'vip', 'mod', 'founder'])

/** Whether a chat line is allowed to appear under the active mode. 'off', 'slow', and
 *  'follower' don't gate the procedural crowd (everyone in the sim is a "follower");
 *  'slow' only affects cadence (handled by the caller), not visibility. */
export function allowedInMode(line: ModLine, mode: ChatMode): boolean {
  switch (mode) {
    case 'sub':
      return !!line.badges?.some((b) => SUB_BADGES.has(b))
    case 'emote':
      return line.hasEmote
    default:
      return true
  }
}

/** Cadence multiplier for the ambient chatter interval under a mode (higher = slower). */
export function modeIntervalFactor(mode: ChatMode): number {
  return mode === 'slow' ? 4 : 1
}

export type ModActionType = 'timeout' | 'ban' | 'unban' | 'untimeout'

/** Timeout lengths offered in the UI. A timeout EXPIRES on its own; a ban doesn't. */
export const TIMEOUT_DURATIONS: { sec: number; label: string }[] = [
  { sec: 30, label: '30s' },
  { sec: 60, label: '1m' },
  { sec: 300, label: '5m' },
  { sec: 600, label: '10m' },
  { sec: 1800, label: '30m' },
  { sec: 3600, label: '1h' },
]
export const DEFAULT_TIMEOUT_SEC = 300

/** "5m" / "1h 30m" / "45s" — for the system line and the pending-timeout list. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
}

/** The system line a mod action posts into the feed. */
export function formatModAction(type: ModActionType, username: string, durationSec?: number): string {
  switch (type) {
    case 'timeout':
      return durationSec
        ? `⛔ ${username} has been timed out for ${formatDuration(durationSec)}`
        : `⛔ ${username} has been timed out`
    case 'ban':
      return `🔨 ${username} has been permanently banned`
    case 'unban':
      return `♻️ ${username} has been unbanned`
    case 'untimeout':
      return `♻️ ${username}'s timeout has been lifted`
  }
}

/** A silenced viewer. `until` is an epoch ms deadline; a ban has no deadline. */
export interface Silence { username: string; until: number | null }

/** Fold a mod action into the silence map. Pure so the DM's panel, the streamer's
 *  panel and every viewer derive the same state from the same broadcast. `unban`
 *  clears anything (ban or timeout); `untimeout` only lifts a timed one, so it can't
 *  be used to quietly undo a permanent ban. */
export function applyModAction(
  silences: Silence[],
  action: { type: ModActionType; username: string; durationSec?: number },
  now: number,
): Silence[] {
  const others = silences.filter((s) => s.username !== action.username)
  switch (action.type) {
    case 'ban':
      return [...others, { username: action.username, until: null }]
    case 'timeout':
      return [...others, { username: action.username, until: now + (action.durationSec ?? DEFAULT_TIMEOUT_SEC) * 1000 }]
    case 'unban':
      return others
    case 'untimeout': {
      const cur = silences.find((s) => s.username === action.username)
      return cur && cur.until !== null ? others : silences
    }
  }
}

/** The silences still in force at `now` — expired timeouts simply drop out, which is
 *  what makes a timeout self-releasing without anyone having to act. */
export function activeSilences(silences: Silence[], now: number): Silence[] {
  return silences.filter((s) => s.until === null || s.until > now)
}

/** Whether this handle is silenced right now. */
export function isSilenced(silences: Silence[], username: string, now: number): boolean {
  return activeSilences(silences, now).some((s) => s.username === username)
}
