'use client'
// AI prep assistant (Phase I4) — quick presets + a freeform prompt that generate plot
// hooks / lore / NPCs and hand the text back via onInsert (the console appends it to
// the DM's private notes). DM-only; rendered inside the Notes tab.
import { useState } from 'react'
import styles from './hextech.module.css'

const PRESETS: { label: string; prompt: string }[] = [
  { label: 'Plot hooks', prompt: 'Give me 3 plot hooks to open or complicate this session.' },
  { label: 'Local lore', prompt: 'Give me a few pieces of evocative local lore or history the party might uncover.' },
  { label: 'An NPC', prompt: 'Invent a memorable NPC: name, vibe, a secret, and one hook.' },
  { label: 'A twist', prompt: 'Suggest one surprising but fair mid-session twist.' },
]

export default function AiNotesBox({ sessionId, onInsert }: { sessionId: string; onInsert: (text: string) => void }) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function generate(p: string) {
    const q = p.trim()
    if (!q || busy) return
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch(`/api/dnd/sessions/${sessionId}/ai-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.text) {
        onInsert(String(j.text))
        setPrompt('')
      } else {
        setErr(j.error ?? 'Generation failed.')
      }
    } catch {
      setErr('Request failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--hx-gold-1)', background: 'rgba(200,155,60,0.06)', padding: '10px 12px', marginBottom: 12 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--hx-gold-2)', marginBottom: 8 }}>✨ AI PREP ASSISTANT</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {PRESETS.map((p) => (
          <button key={p.label} className={styles.hexBtn} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => generate(p.prompt)} disabled={busy}>{p.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input
          className={styles.input}
          style={{ flex: 1, minWidth: 220, padding: '8px 10px' }}
          placeholder="…or ask for anything (a rumor, a trap, a villain's plan)"
          value={prompt}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && generate(prompt)}
        />
        <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={() => generate(prompt)} disabled={busy || !prompt.trim()}>
          {busy ? 'Thinking…' : 'Generate'}
        </button>
      </div>
      {err && <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--hx-danger)' }}>✕ {err}</p>}
    </div>
  )
}
