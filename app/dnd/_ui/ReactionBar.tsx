'use client'
// Reaction emote bar + floating overlay (Phase L9 / K4 extra). A row of quick emotes
// anyone in the campaign can tap; each fires an ephemeral burst that drifts up every
// connected client's screen via useReactions. Mounted on the sheet (SheetChatPanel) so
// the party can react to rolls/moments without opening chat. Overlay is fixed +
// pointer-events:none so it never blocks the sheet underneath.
import { useReactions } from './useReactions'
import styles from './hextech.module.css'

const EMOTES = ['👍', '😂', '🔥', '🎉', '💀', '❤️', '🎲', '⚔️', '🛡️', '😱']

export default function ReactionBar({ campaignId, from }: { campaignId: string; from?: string }) {
  const { reactions, react } = useReactions(campaignId)

  return (
    <>
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 55 }}>
        {reactions.map((r) => (
          <span key={r.id} className={styles.reactFloat} style={{ left: `${r.x}%` }} title={r.from}>
            {r.emote}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', padding: '4px 0' }}>
        {EMOTES.map((e) => (
          <button
            key={e}
            className={styles.hexBtn}
            onClick={() => react(e, from)}
            aria-label={`React ${e}`}
            style={{ fontSize: 18, padding: '5px 9px', lineHeight: 1 }}
          >
            {e}
          </button>
        ))}
      </div>
    </>
  )
}
