'use client'
// Session recap (Phase I5) — shows the AI draft (or final) recap; the DM can generate
// / regenerate from the session's rolls + notes. Rendered read-only here; I6 turns the
// draft into a DM+player collaborative editor that produces the saved final.
import { useCallback, useEffect, useState } from 'react'
import styles from './hextech.module.css'
import { useCampaignChannel } from './useCampaignChannel'

interface Recap { id: string; draft_markdown: string | null; final_markdown: string | null; status: string }

export default function RecapPanel({ sessionId, campaignId, isDM, initialRecap }: { sessionId: string; campaignId: string; isDM: boolean; initialRecap?: Recap | null }) {
  const [recap, setRecap] = useState<Recap | null>(initialRecap ?? null)
  const [loaded, setLoaded] = useState(initialRecap !== undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')

  const load = useCallback(() => {
    fetch(`/api/dnd/sessions/${sessionId}/recap`)
      .then((r) => (r.ok ? r.json() : { recap: null }))
      .then((j) => setRecap(j.recap ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [sessionId])

  useEffect(() => { if (initialRecap === undefined) load() }, [load, initialRecap])

  // Realtime (I6): co-editors refetch when anyone saves. Don't clobber a local edit.
  const { ping } = useCampaignChannel(campaignId, 'recap', () => { if (!editing) load() })

  async function save(markFinal: boolean) {
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch(`/api/dnd/sessions/${sessionId}/recap`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalMarkdown: editText, status: markFinal ? 'final' : 'draft' }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        setRecap(j.recap ?? null)
        setEditing(false)
        ping()
      } else {
        setErr(j.error ?? 'Save failed.')
      }
    } catch {
      setErr('Request failed.')
    } finally {
      setBusy(false)
    }
  }

  async function generate() {
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch(`/api/dnd/sessions/${sessionId}/recap`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (r.ok) setRecap(j.recap ?? null)
      else setErr(j.error ?? 'Recap generation failed.')
    } catch {
      setErr('Request failed.')
    } finally {
      setBusy(false)
    }
  }

  const text = recap?.final_markdown || recap?.draft_markdown

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <h3 className={styles.panelTitle} style={{ fontSize: 13, margin: 0 }}>
          Session Recap{recap?.status === 'final' ? ' — final' : recap ? ' — draft' : ''}
        </h3>
        {!editing && (
          <div style={{ display: 'flex', gap: 6 }}>
            {text && (
              <button className={styles.hexBtn} style={{ padding: '6px 11px', fontSize: 12 }} onClick={() => { setEditText(text); setEditing(true) }}>✎ Edit</button>
            )}
            {isDM && (
              <button className={styles.hexBtn} style={{ padding: '6px 11px', fontSize: 12 }} onClick={generate} disabled={busy}>
                {busy ? 'Generating…' : recap ? '↻ Regenerate' : '✨ Generate draft'}
              </button>
            )}
          </div>
        )}
      </div>
      {err && <p style={{ color: 'var(--hx-danger)', fontSize: 13, margin: '0 0 8px' }}>✕ {err}</p>}
      {editing ? (
        <div>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={14}
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 14, lineHeight: 1.5, padding: '10px 12px', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={() => save(false)} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button className={`${styles.hexBtn} ${styles.hexBtnTeal}`} onClick={() => save(true)} disabled={busy}>✓ Save as final</button>
            <button className={styles.hexBtn} onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : !loaded ? (
        <p style={{ color: 'var(--hx-muted)', fontSize: 13 }}><span className={styles.spinner} style={{ display: 'inline-block', width: 14, height: 14, verticalAlign: 'middle', marginRight: 6 }} />Loading…</p>
      ) : text ? (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55, color: 'var(--hx-text)', border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', padding: '10px 12px', maxHeight: 380, overflowY: 'auto' }}>{text}</div>
      ) : (
        <p style={{ color: 'var(--hx-muted)', fontSize: 13 }}>No recap yet.{isDM ? ' Generate a draft from the session’s rolls + notes.' : ''}</p>
      )}
    </div>
  )
}
