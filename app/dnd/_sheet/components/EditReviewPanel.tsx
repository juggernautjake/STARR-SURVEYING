'use client'
// EditReviewPanel — the DM's "yay or nay" review surface (Slice 26). Lists this character's recent
// edits from the audit trail (`dnd_sheet_edits`, now carrying old→new + author + timestamp) newest
// first, and offers a one-click **Revert** per edit — which reverses it exactly through the tested
// `revertSheetEdit` on the server. Shown only to someone who can write the sheet (the DM, or the
// owner reviewing their own history); a plain viewer never sees it.
//
// This is the "fully see what a player has modified, and say yay or nay" the request asks for. The
// ✎ marks on the sheet say WHICH elements differ; this says WHAT changed, from what, by whom, when —
// and lets it be undone.
import { useCallback, useEffect, useState } from 'react'
import { useChar } from '../state/store'
import { recentBatches, type EditHistoryRow } from '@/lib/dnd/edit-history'
import { describeEdit } from '@/lib/dnd/edit-describe'
import { isRevertableEditRow } from '@/lib/dnd/sheet-edits'

interface EditRow {
  id: string
  field_path: string | null
  editor_user_id: string | null
  is_dm: boolean | null
  old_value: unknown
  new_value: unknown
  created_at: string
  batch_id?: string | null
  source?: string | null
  summary?: string | null
  /** Resolved by the GET route from `editor_user_id`. Absent when the account is gone (the column is
   *  ON DELETE SET NULL), which is why the render below falls back rather than printing a placeholder. */
  editor_name?: string | null
}

// `describeEdit` now lives in `lib/dnd/edit-describe.ts`. It was local here and understood only AI-shaped
// rows, so every MANUAL edit rendered as its bare field path with no before/after — on the one panel whose
// whole purpose is showing what changed. Shared because the same diff is wanted on the inline ✎ hover next,
// and a second formatter there would drift from this one.

export default function EditReviewPanel() {
  const { characterId, canWrite, reloadFromDb, char, setChar } = useChar()

  // "Approve" — the DM's YAY (Slice 20/26): bless the current customizations by clearing every ✎ on
  // the sheet. Whole-sheet, not per-edit: the flag lives on the element, and "I've reviewed this sheet
  // and it's fine" is exactly this. Persists through the normal autosave; Revert still handles nay.
  const customizedCount =
    (char.attacks ?? []).filter((a) => a.customized).length +
    (char.inventory ?? []).filter((i) => i.customized).length +
    (char.features ?? []).filter((f) => f.customized).length +
    (char.spells ?? []).filter((s) => s.customized).length
  const approveAll = () =>
    setChar((c) => ({
      ...c,
      attacks: (c.attacks ?? []).map((a) => (a.customized ? { ...a, customized: false } : a)),
      inventory: (c.inventory ?? []).map((i) => (i.customized ? { ...i, customized: false } : i)),
      features: (c.features ?? []).map((f) => (f.customized ? { ...f, customized: false } : f)),
      spells: (c.spells ?? []).map((s) => (s.customized ? { ...s, customized: false } : s)),
    }))
  const [rows, setRows] = useState<EditRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!characterId || !canWrite) { setLoaded(true); return } // no history for a plain viewer
    fetch(`/api/dnd/characters/${characterId}/edits?limit=40`)
      .then((r) => (r.ok ? r.json() : { edits: [] }))
      .then((j) => setRows((j.edits ?? []) as EditRow[]))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [characterId, canWrite])

  useEffect(() => { load() }, [load])

  const revert = useCallback(async (id: string) => {
    if (!characterId) return
    setBusy(id); setErr(null)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/edits/revert`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editId: id }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr((j as { error?: string }).error ?? 'Revert failed.'); return }
      await reloadFromDb()   // pull the reverted sheet back in
      load()                 // and refresh the log (the revert itself is now audited)
    } catch {
      setErr('Revert failed.')
    } finally {
      setBusy(null)
    }
  }, [characterId, reloadFromDb, load])

  // Undo a whole AI change (a batch) or roll the sheet back to just after a chosen batch.
  const batchAction = useCallback(async (kind: 'revert-batch' | 'restore', batchId: string) => {
    if (!characterId) return
    setBusy(batchId); setErr(null)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/edits/${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr((j as { error?: string }).error ?? 'That could not be undone.'); return }
      await reloadFromDb()
      load()
    } catch {
      setErr('That could not be undone.')
    } finally {
      setBusy(null)
    }
  }, [characterId, reloadFromDb, load])

  // A viewer who can't write the sheet has no business in its edit history.
  if (!canWrite) return null

  // Skip the revert-audit rows themselves — you don't "revert a revert" from here.
  const visible = rows.filter((r) => !(r.field_path ?? '').startsWith('revert:'))
  // The AI changes grouped by request (newest first, reverted ones marked) — the "story" view.
  const batches = recentBatches(rows as EditHistoryRow[], 12, true)

  return (
    <div className="card ae-card">
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="ae-head" style={{ margin: 0 }}>✎ Customizations &amp; edit history</div>
        {customizedCount > 0 && (
          <button className="btn tiny teal" onClick={approveAll} title="Bless every customization on this sheet — clears the ✎ marks. Revert still undoes individual edits below.">
            ✓ Approve all ({customizedCount})
          </button>
        )}
      </div>
      {!loaded ? (
        <p className="ae-empty">Loading edit history…</p>
      ) : visible.length === 0 ? (
        <p className="ae-empty">No edits recorded yet — this sheet is as it was built.</p>
      ) : (
        <>
          {batches.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 6px' }}>Changes by request — undo a whole AI change, or roll back to an earlier point.</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {batches.map((b) => (
                  <div key={b.batchId} className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 6, opacity: b.reverted ? 0.55 : 1 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--ink)', wordBreak: 'break-word' }}>{b.summary || 'A change'}{b.reverted && <span style={{ color: 'var(--muted)' }}> · undone</span>}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(b.createdAt).toLocaleString()}</div>
                    </div>
                    {!b.reverted && (
                      <div className="flex" style={{ gap: 6 }}>
                        <button className="btn tiny danger" disabled={busy === b.batchId} onClick={() => batchAction('revert-batch', b.batchId)} title="Undo everything this change did">
                          {busy === b.batchId ? '…' : '⟲ Undo'}
                        </button>
                        <button className="btn tiny" disabled={busy === b.batchId} onClick={() => batchAction('restore', b.batchId)} title="Roll the character back to how it was right after this change (undo everything after it)">
                          ↩ Restore to here
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="ae-empty">Every individual change, newest first. Revert restores exactly what it replaced.</p>
          {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
          <div style={{ display: 'grid', gap: 6 }}>
            {visible.map((row) => (
              <div key={row.id} className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink)', wordBreak: 'break-word' }}>{describeEdit(row)}</div>
                  {/* The person, THEN their role — "Jacob (DM)" rather than a bare "DM". At a table with
                      three players "player" answers the wrong question: a DM reviewing a change wants to
                      know which one made it. Falls back to the old wording when the account is gone. */}
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {row.editor_name ? `${row.editor_name} (${row.is_dm ? 'DM' : 'player'})` : (row.is_dm ? 'DM' : 'player')}
                    {' · '}{new Date(row.created_at).toLocaleString()}
                  </div>
                </div>
                {/* Revert is offered only where it can actually work. The server refuses a row carrying no
                    `new_value` ("this edit carries no reversible change") — but this button was rendered on
                    every row, so a DM clicking it on a bespoke-sheet row (`ig:*` / `pf2:*`, which record a
                    change to a sidecar the 5e Character shape cannot express) got an error every time. One
                    predicate now answers for both, from `lib/dnd/sheet-edits.ts`.
                    These rows still SHOW — they are real history, and hiding a change from the DM to avoid
                    an awkward button would be the worse trade. They are simply not undo points. */}
                {isRevertableEditRow(row) ? (
                  <button className="btn tiny danger" disabled={busy === row.id} onClick={() => revert(row.id)} title="Undo this edit, restoring the prior value">
                    {busy === row.id ? '…' : '⟲ Revert'}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }} title="This entry records what changed, but not enough to put it back — undo it on the character's own sheet.">
                    record only
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
