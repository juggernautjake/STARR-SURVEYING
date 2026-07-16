// app/dnd/_sheet/components/ui/EditMark.tsx — the ✎ "hand-customized" marker (Slice 20).
//
// Deliberately NOT the ★ (Slice 13): ★ = something is modifying this right now; ✎ = this differs
// from how it came, because someone hand-tuned it. A hand-edited spell nothing is buffing has ✎ and
// no ★; a vanilla score under a magic belt has ★ and no ✎. Conflating them makes a marker that means
// "something, somewhere, maybe" — noise the reader learns to ignore.
export default function EditMark({ on }: { on?: boolean }) {
  if (!on) return null
  return (
    <span className="edit-mark" title="Hand-customized — this was edited away from how it came." aria-label="customized">
      {' '}✎
    </span>
  )
}
