'use client'
// /dnd/suggestions (Phase T) — the review page for everything dropped into the footer
// suggestion box. Open to anyone on the hidden hub. Each entry can be copied (to reuse the
// text when building the feature) or deleted (with a confirm prompt).
import { useEffect, useState } from 'react'
import styles from '@/app/dnd/_ui/hextech.module.css'

interface Suggestion {
  id: string
  body: string
  authorName: string | null
  pagePath: string | null
  createdAt: string
}

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

  useEffect(() => {
    let cancelled = false
    fetch('/api/dnd/suggestions')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load suggestions.'))))
      .then((j) => { if (!cancelled) setItems((j.suggestions ?? []) as Suggestion[]) })
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

          {items && items.length === 0 && !error && (
            <section className={styles.framedPanel}>
              <div className={styles.framedPanelTop} />
              <p style={{ color: 'var(--hx-muted)', margin: 0 }}>No suggestions yet. Use the box at the bottom of any /dnd page to add the first one.</p>
            </section>
          )}

          {items && items.length > 0 && (
            <div style={{ display: 'grid', gap: 12 }}>
              {items.map((s) => (
                <section key={s.id} className={styles.framedPanel} style={{ display: 'grid', gap: 10 }}>
                  <div className={styles.framedPanelTop} />
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.55, color: 'var(--hx-text)' }}>{s.body}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--hx-line)', paddingTop: 10 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
                      <span style={{ color: s.authorName ? 'var(--hx-gold-2)' : 'var(--hx-muted)' }}>{s.authorName || 'Anonymous'}</span>
                      <span> · {timeAgo(s.createdAt)}</span>
                      {s.pagePath && <span> · from {s.pagePath}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => copy(s)}
                        title="Copy this suggestion's text to your clipboard"
                        style={{ fontSize: 12, padding: '5px 12px', cursor: 'pointer', color: 'var(--hx-teal-1)', background: 'transparent', border: '1px solid var(--hx-teal-2)', borderRadius: 4 }}
                      >
                        {copiedId === s.id ? '✓ Copied' : '⧉ Copy'}
                      </button>
                      <button
                        onClick={() => remove(s)}
                        disabled={deleting === s.id}
                        title="Delete this suggestion (asks to confirm first)"
                        style={{ fontSize: 12, padding: '5px 12px', cursor: 'pointer', color: '#ff6b6b', background: 'transparent', border: '1px solid var(--hx-line)', borderRadius: 4 }}
                      >
                        {deleting === s.id ? 'Deleting…' : '🗑 Delete'}
                      </button>
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
