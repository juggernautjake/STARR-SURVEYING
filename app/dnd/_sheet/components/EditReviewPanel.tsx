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

interface EditRow {
  id: string
  field_path: string | null
  editor_user_id: string | null
  is_dm: boolean | null
  old_value: unknown
  new_value: unknown
  created_at: string
}

/** A compact "what changed" line from the stored SheetEdit + old_value. */
function describeEdit(row: EditRow): string {
  const e = row.new_value as { op?: string; to?: string; value?: unknown } | null
  const path = row.field_path ?? 'sheet'
  if (!e?.op) return path
  if (e.op.startsWith('rename_') && e.to) return `${path}: renamed → “${e.to}”`
  if (e.op.startsWith('set_') && e.value !== undefined) {
    const from = row.old_value === null || row.old_value === undefined ? '' : `${JSON.stringify(row.old_value)} → `
    return `${path}: ${from}${JSON.stringify(e.value)}`
  }
  return `${path}: ${e.op}`
}

export default function EditReviewPanel() {
  const { characterId, canWrite, reloadFromDb } = useChar()
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

  // A viewer who can't write the sheet has no business in its edit history.
  if (!canWrite) return null

  // Skip the revert-audit rows themselves — you don't "revert a revert" from here.
  const visible = rows.filter((r) => !(r.field_path ?? '').startsWith('revert:'))

  return (
    <div className="card ae-card">
      <div className="ae-head">✎ Customizations &amp; edit history</div>
      {!loaded ? (
        <p className="ae-empty">Loading edit history…</p>
      ) : visible.length === 0 ? (
        <p className="ae-empty">No edits recorded yet — this sheet is as it was built.</p>
      ) : (
        <>
          <p className="ae-empty">Every change to this sheet, newest first. Revert restores exactly what it replaced.</p>
          {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
          <div style={{ display: 'grid', gap: 6 }}>
            {visible.map((row) => (
              <div key={row.id} className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink)', wordBreak: 'break-word' }}>{describeEdit(row)}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {row.is_dm ? 'DM' : 'player'} · {new Date(row.created_at).toLocaleString()}
                  </div>
                </div>
                <button className="btn tiny danger" disabled={busy === row.id} onClick={() => revert(row.id)} title="Undo this edit, restoring the prior value">
                  {busy === row.id ? '…' : '⟲ Revert'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
