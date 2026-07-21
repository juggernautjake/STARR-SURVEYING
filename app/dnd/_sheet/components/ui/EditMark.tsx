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

export default function EditMark({ on }: { on?: boolean }) {
  if (!on) return null
  return (
    <Tip
      className="edit-mark"
      glyph="✎"
      bare
      title="Hand-customized"
      label="customized"
      tip="Someone edited this away from how it arrived, so its text or numbers no longer match the version the catalog gave you. The mark is a record, not a warning — nothing is broken and nothing needs undoing. It is a different thing from the star, which means something is modifying this value right now."
      triggerStyle={{ marginLeft: 4 }}
    />
  )
}
