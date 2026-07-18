'use client'
// /dnd/suggestions (Phase T) — the review page for everything dropped into the footer
// suggestion box. Open to anyone on the hidden hub. Each entry can be copied (to reuse the
// text when building the feature) or deleted (with a confirm prompt).
import { useEffect, useState } from 'react'
import styles from '@/app/dnd/_ui/hextech.module.css'

type ReqStatus = 'untouched' | 'pending' | 'complete'
interface Suggestion {
  id: string
  body: string
  authorName: string | null
  userKey: string | null
  pagePath: string | null
  status: ReqStatus
  createdAt: string
}

const STATUS_META: Record<ReqStatus, { label: string; color: string }> = {
  untouched: { label: 'Untouched', color: 'var(--hx-muted)' },
  pending: { label: 'Pending', color: 'var(--hx-gold-2)' },
  complete: { label: 'Complete', color: 'var(--hx-teal-1)' },
}
const FILTERS: { key: ReqStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'untouched', label: 'Untouched' },
  { key: 'pending', label: 'Pending' },
  { key: 'complete', label: 'Complete' },
]

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function SuggestionsPage() {
  const [items, setItems] = useState<Suggestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  // Only the owner (Jacob) may delete/manage; non-owners get a read-only board.
  const [owner, setOwner] = useState(false)
  const [filter, setFilter] = useState<ReqStatus | 'all'>('all')

  useEffect(() => {
    let cancelled = false
    fetch('/api/dnd/suggestions')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load suggestions.'))))
      .then((j) => { if (!cancelled) { setItems((j.suggestions ?? []) as Suggestion[]); setOwner(!!j.owner) } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load suggestions.') })
    return () => { cancelled = true }
  }, [])

  async function copy(s: Suggestion) {
    const text = s.authorName ? `${s.body}\n\n— ${s.authorName}` : s.body
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for browsers without clipboard permission.
      const ta = document.createElement('textarea')
      ta.value = text; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      document.body.removeChild(ta)
    }
    setCopiedId(s.id)
    setTimeout(() => setCopiedId((c) => (c === s.id ? null : c)), 1600)
  }

  async function setStatus(s: Suggestion, status: ReqStatus) {
    // Optimistic; revert on failure.
    setItems((list) => (list ? list.map((x) => (x.id === s.id ? { ...x, status } : x)) : list))
    try {
      const r = await fetch(`/api/dnd/suggestions/${s.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (!r.ok) throw new Error()
    } catch {
      setItems((list) => (list ? list.map((x) => (x.id === s.id ? { ...x, status: s.status } : x)) : list))
      window.alert('Could not update the status.')
    }
  }

  async function remove(s: Suggestion) {
    const preview = s.body.length > 60 ? `${s.body.slice(0, 60)}…` : s.body
    if (!window.confirm(`Delete this suggestion?\n\n"${preview}"\n\nThis can't be undone.`)) return
    setDeleting(s.id)
    try {
      const r = await fetch(`/api/dnd/suggestions/${s.id}`, { method: 'DELETE' })
      if (r.ok) setItems((list) => (list ? list.filter((x) => x.id !== s.id) : list))
      else { const j = await r.json().catch(() => ({})); window.alert(j.error || 'Could not delete.') }
    } catch {
      window.alert('Could not delete.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 820, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <a className={styles.hexBtn} href="/dnd" style={{ marginBottom: 10 }}>← Lobby</a>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>Suggestions &amp; Requests</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0' }}>
              Every tip, feature request, and idea dropped into the footer box. Copy one to reuse it while building, or delete it once it&apos;s handled.
            </p>
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {!items && !error && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--hx-muted)' }}>
              <span className={styles.spinner} /> Loading suggestions…
            </div>
          )}

          {items && items.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTERS.map((f) => {
                const count = f.key === 'all' ? items.length : items.filter((s) => s.status === f.key).length
                const active = filter === f.key
                return (
                  <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                    style={{ fontSize: 12, padding: '5px 12px', borderRadius: 14, cursor: 'pointer',
                      border: `1px solid ${active ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                      background: active ? 'rgba(10,200,185,0.15)' : 'transparent',
                      color: active ? 'var(--hx-teal-1)' : 'var(--hx-muted)' }}>
                    {f.label} ({count})
                  </button>
                )
              })}
            </div>
          )}

          {items && items.length === 0 && !error && (
            <section className={styles.framedPanel}>
              <div className={styles.framedPanelTop} />
              <p style={{ color: 'var(--hx-muted)', margin: 0 }}>No suggestions yet. Use the box at the bottom of any /dnd page to add the first one.</p>
            </section>
          )}

          {items && items.length > 0 && (
            <div style={{ display: 'grid', gap: 12 }}>
              {items.filter((s) => filter === 'all' || s.status === filter).map((s) => (
                <section key={s.id} className={styles.framedPanel} style={{ display: 'grid', gap: 10 }}>
                  <div className={styles.framedPanelTop} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: STATUS_META[s.status].color, border: `1px solid ${STATUS_META[s.status].color}`, borderRadius: 4, padding: '1px 7px' }}>
                      {STATUS_META[s.status].label}
                    </span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.55, color: 'var(--hx-text)' }}>{s.body}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--hx-line)', paddingTop: 10 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
                      <span style={{ color: s.authorName ? 'var(--hx-gold-2)' : 'var(--hx-muted)' }}>{s.authorName || 'Anonymous'}</span>
                      {owner && s.userKey && <span style={{ color: 'var(--hx-muted)' }}> ({s.userKey})</span>}
                      <span> · {timeAgo(s.createdAt)}</span>
                      {s.pagePath && <span> · from {s.pagePath}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {owner && (
                        <select value={s.status} onChange={(e) => setStatus(s, e.target.value as ReqStatus)}
                          title="Change this request's status"
                          style={{ fontSize: 12, padding: '5px 8px', cursor: 'pointer', color: 'var(--hx-text)', background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', borderRadius: 4 }}>
                          <option value="untouched">Untouched</option>
                          <option value="pending">Pending</option>
                          <option value="complete">Complete</option>
                        </select>
                      )}
                      <button
                        onClick={() => copy(s)}
                        title="Copy this suggestion's text to your clipboard"
                        style={{ fontSize: 12, padding: '5px 12px', cursor: 'pointer', color: 'var(--hx-teal-1)', background: 'transparent', border: '1px solid var(--hx-teal-2)', borderRadius: 4 }}
                      >
                        {copiedId === s.id ? '✓ Copied' : '⧉ Copy'}
                      </button>
                      {owner && (
                        <button
                          onClick={() => remove(s)}
                          disabled={deleting === s.id}
                          title="Delete this suggestion (asks to confirm first)"
                          style={{ fontSize: 12, padding: '5px 12px', cursor: 'pointer', color: '#ff6b6b', background: 'transparent', border: '1px solid var(--hx-line)', borderRadius: 4 }}
                        >
                          {deleting === s.id ? 'Deleting…' : '🗑 Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
