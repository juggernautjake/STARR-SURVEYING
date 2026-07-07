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

export type ModActionType = 'timeout' | 'ban' | 'unban'

/** The system line a mod action posts into the feed. */
export function formatModAction(type: ModActionType, username: string): string {
  switch (type) {
    case 'timeout':
      return `⛔ ${username} has been timed out`
    case 'ban':
      return `🔨 ${username} has been permanently banned`
    case 'unban':
      return `♻️ ${username} has been unbanned`
  }
}
