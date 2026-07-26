// app/dnd/_sheet/components/ui/EditMark.tsx — the ✎ "hand-customized" marker (Slice 20).
//
// Deliberately NOT the ★ (Slice 13): ★ = something is modifying this right now; ✎ = this differs
// from how it came, because someone hand-tuned it. A hand-edited spell nothing is buffing has ✎ and
// no ★; a vanilla score under a magic belt has ★ and no ✎. Conflating them makes a marker that means
// "something, somewhere, maybe" — noise the reader learns to ignore.
//
// CX-11 moved the explanation off the native `title` and onto a Tip, so it is reachable by tap and
// by keyboard rather than by a second of steady mouse-hover. The copy says what ✎ MEANS and, just
// as importantly, that it is a record rather than a warning — a pencil next to a spell's damage
// otherwise invites a player to "fix" something nobody broke.
import Tip from '@/app/dnd/_ui/Tip'
import { useChar } from '../../state/store'
import { useElementEdits, editFor } from '../../lib/use-element-edits'

const GENERIC = 'Someone edited this away from how it arrived, so its text or numbers no longer match the version the catalog gave you. The mark is a record, not a warning — nothing is broken and nothing needs undoing. It is a different thing from the star, which means something is modifying this value right now.'

export default function EditMark({ on, name }: { on?: boolean; name?: string }) {
  const { characterId } = useChar()
  const edits = useElementEdits(characterId)
  if (!on) return null

  // SAY WHAT CHANGED, when the audit log knows. The marker has always meant "this differs from how it
  // came"; the log has always held the specific before/after; nothing joined them, so a player hovering ✎
  // learned only that *something* was different. Given a `name`, the newest audited change to that element
  // now leads the tooltip — "spell.Fireball.damage: 8d6 → 10d6 — Jacob (DM), 26/07/2026" — with the
  // general explanation kept underneath, since it is still what the MARK means.
  //
  // Falls back to the generic text whenever the join misses, and that is expected rather than exceptional:
  // a standalone sheet has no server log, an edit older than the 40 most recent has aged out, and a RENAMED
  // element no longer matches its rows (they are keyed by the pre-edit name — the remaining known gap).
  const detail = editFor(edits, name)
  return (
    <Tip
      className="edit-mark"
      glyph="✎"
      bare
      title="Hand-customized"
      label="customized"
      tip={detail ? `${detail.summary} — ${detail.who}, ${detail.when}. ${GENERIC}` : GENERIC}
      triggerStyle={{ marginLeft: 4 }}
    />
  )
}
