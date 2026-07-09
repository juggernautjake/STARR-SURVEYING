'use client'
// SuggestionBox (Phase T) — the "leave a tip / feature request" field that lives in the
// /dnd site footer, so it appears at the bottom of EVERY /dnd page (login, sheets, hubs,
// streams…). Self-contained + styled with the --hx-* tokens declared on .siteChrome, so
// it looks right whether the page above it is a Hextech hub or a bespoke character sheet.
import { useRef, useState } from 'react'

export default function SuggestionBox() {
  const [body, setBody] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  function grow() {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }

  async function submit() {
    const text = body.trim()
    if (!text || status === 'sending') return
    setStatus('sending'); setMsg(null)
    try {
      const res = await fetch('/api/dnd/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: text,
          authorName: name.trim() || undefined,
          pagePath: typeof window !== 'undefined' ? window.location.pathname : undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        setStatus('sent'); setBody(''); setMsg('Thanks — your suggestion was sent!')
        if (areaRef.current) areaRef.current.style.height = 'auto'
      } else {
        setStatus('error'); setMsg(j.error || 'Could not send. Try again.')
      }
    } catch {
      setStatus('error'); setMsg('Could not send. Try again.')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'rgba(1,10,19,0.55)',
    border: '1px solid var(--hx-line, #1e2d3d)', color: 'var(--hx-text, #f0e6d2)',
    borderRadius: 4, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
  }

  return (
    <section
      style={{
        width: '100%', maxWidth: 620, margin: '0 auto', textAlign: 'left',
        border: '1px solid var(--hx-gold-0, #785a28)', borderRadius: 6,
        background: 'linear-gradient(180deg, rgba(16,35,59,0.6), rgba(11,26,44,0.6))',
        padding: '16px 18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15, letterSpacing: '0.06em', color: 'var(--hx-gold-2, #c8aa6e)', fontFamily: 'var(--hx-font-display, Cinzel, serif)' }}>
          💡 Suggestions &amp; Requests
        </h3>
        <a href="/dnd/suggestions" style={{ fontSize: 12, color: 'var(--hx-teal-1, #0ac8b9)', textDecoration: 'none' }}>
          View all suggestions →
        </a>
      </div>
      <p style={{ margin: '6px 0 12px', fontSize: 12, color: 'var(--hx-muted, #a09b8c)', lineHeight: 1.5 }}>
        Want a build, item, mechanic, campaign setup, or quality-of-life tweak? Drop it here — every idea lands on the review page.
      </p>

      <textarea
        ref={areaRef}
        value={body}
        onChange={(e) => { setBody(e.target.value); grow(); if (status !== 'idle') { setStatus('idle'); setMsg(null) } }}
        placeholder="Your tip, feature request, or idea…"
        rows={2}
        style={{ ...inputStyle, resize: 'none', minHeight: 44, lineHeight: 1.5 }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          style={{ ...inputStyle, width: 'auto', flex: '1 1 160px' }}
        />
        <button
          onClick={submit}
          disabled={!body.trim() || status === 'sending'}
          style={{
            padding: '9px 18px', cursor: body.trim() && status !== 'sending' ? 'pointer' : 'default',
            background: 'linear-gradient(180deg, var(--hx-gold-2, #c8aa6e), var(--hx-gold-1, #c89b3c) 55%, var(--hx-gold-0, #785a28))',
            color: '#1a1206', border: '1px solid var(--hx-gold-1, #c89b3c)', borderRadius: 4,
            fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', opacity: !body.trim() || status === 'sending' ? 0.55 : 1,
          }}
        >
          {status === 'sending' ? 'Sending…' : 'Send suggestion'}
        </button>
      </div>
      {msg && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: status === 'error' ? '#ff8080' : 'var(--hx-teal-1, #0ac8b9)' }}>
          {msg}
        </div>
      )}
    </section>
  )
}
