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
import { useState } from 'react'
import Tip from '@/app/dnd/_ui/Tip'
import { useChar } from '../../state/store'
import { useElementEdits, editFor } from '../../lib/use-element-edits'

const GENERIC = 'Someone edited this away from how it arrived, so its text or numbers no longer match the version the catalog gave you. The mark is a record, not a warning — nothing is broken and nothing needs undoing. It is a different thing from the star, which means something is modifying this value right now.'

export default function EditMark({ on, name }: { on?: boolean; name?: string }) {
  const { characterId, canWrite, reloadFromDb } = useChar()
  const edits = useElementEdits(characterId)
  const [busy, setBusy] = useState(false)
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

  // REVERT, from the marker itself. The whole ask was "see what changed and undo it where you're looking",
  // and the Revert has existed per-edit in `EditReviewPanel` all along — reaching it meant leaving the
  // element behind and hunting for its row in a list of forty. Same endpoint, same pure `revertSheetEdit`;
  // this is a second door onto it, not a second implementation.
  const revert = async () => {
    if (!characterId || !detail || busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/edits/revert`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editId: detail.id }),
      })
      if (r.ok) await reloadFromDb()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Tip
      className="edit-mark"
      glyph="✎"
      bare
      title="Hand-customized"
      label="customized"
      tip={detail ? `${detail.summary} — ${detail.who}, ${detail.when}. ${GENERIC}` : GENERIC}
      triggerStyle={{ marginLeft: 4 }}
      // Offered only when there is a specific change to undo AND the viewer may write. A plain viewer sees
      // the explanation and no button, which is the same rule every other write control on the sheet follows.
      actions={detail && canWrite ? (
        <button
          type="button" className="btn tiny danger" disabled={busy}
          onClick={(e) => { e.stopPropagation(); void revert() }}
          title="Undo this change, restoring the prior value"
        >{busy ? '…' : '⟲ Revert'}</button>
      ) : undefined}
    />
  )
}
