'use client'
// Streamer-side poll creator — lives in Susie's chat box. She writes a question + up to four
// answers and proposes the poll; it lands 'pending' for the DM (Andrew) to direct the outcome
// (see StreamPoll). Kept tiny and self-contained so it can drop into the chat dock with one line.
import { useState } from 'react'

export default function StreamPollCreate({ characterId }: { characterId: string }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const filled = options.map((o) => o.trim()).filter(Boolean)
  const canSubmit = question.trim().length > 0 && filled.length >= 2 && !busy

  function reset() { setQuestion(''); setOptions(['', '']); setErr(null) }

  async function submit() {
    if (!canSubmit) return
    setBusy(true); setErr(null)
    const res = await fetch(`/api/dnd/characters/${characterId}/stream/polls`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question.trim(), options: filled }),
    }).then((r) => r.json()).catch(() => null)
    setBusy(false)
    if (res?.error) { setErr(res.error); return }
    window.dispatchEvent(new Event('dnd-stream-poll')) // let the overlay pick it up instantly
    reset(); setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: '1px solid #c8aa6e', background: 'transparent', color: '#c8aa6e', cursor: 'pointer', whiteSpace: 'nowrap' }}
        title="Start a poll — the DM sets the result"
      >
        📊 Poll
      </button>
    )
  }

  return (
    <div style={{ border: '1px solid #c8aa6e', borderRadius: 6, padding: 10, marginBottom: 8, background: 'rgba(200,155,60,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.12em', color: '#c8aa6e' }}>📊 NEW POLL</span>
        <button type="button" onClick={() => { setOpen(false); reset() }} style={{ background: 'none', border: 'none', color: 'var(--muted, #9aa)', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>
      <input
        value={question} onChange={(e) => setQuestion(e.target.value.slice(0, 200))}
        placeholder="Ask chat a question…" maxLength={200}
        style={{ width: '100%', padding: '6px 8px', marginBottom: 8, borderRadius: 4, border: '1px solid var(--line, rgba(255,255,255,0.15))', background: 'var(--panel, rgba(0,0,0,0.25))', color: 'inherit', fontSize: 13 }}
      />
      <div style={{ display: 'grid', gap: 6 }}>
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', gap: 6 }}>
            <input
              value={opt}
              onChange={(e) => setOptions((prev) => prev.map((p, idx) => (idx === i ? e.target.value.slice(0, 60) : p)))}
              placeholder={`Answer ${i + 1}`} maxLength={60}
              style={{ flex: 1, padding: '5px 8px', borderRadius: 4, border: '1px solid var(--line, rgba(255,255,255,0.15))', background: 'var(--panel, rgba(0,0,0,0.25))', color: 'inherit', fontSize: 13 }}
            />
            {options.length > 2 && (
              <button type="button" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: '1px solid var(--line, rgba(255,255,255,0.15))', borderRadius: 4, color: 'var(--muted, #9aa)', cursor: 'pointer', padding: '0 8px' }}>✕</button>
            )}
          </div>
        ))}
      </div>
      {options.length < 4 && (
        <button type="button" onClick={() => setOptions((prev) => [...prev, ''])} style={{ marginTop: 6, fontSize: 12, background: 'none', border: 'none', color: '#c8aa6e', cursor: 'pointer' }}>+ Add answer</button>
      )}
      {err && <div style={{ marginTop: 6, fontSize: 12, color: '#e06' }}>{err}</div>}
      <button
        type="button" disabled={!canSubmit} onClick={submit}
        style={{ marginTop: 8, width: '100%', padding: '7px 0', background: '#c8aa6e', color: '#1a1206', border: 'none', borderRadius: 4, fontWeight: 800, cursor: canSubmit ? 'pointer' : 'default', opacity: canSubmit ? 1 : 0.6 }}
      >
        {busy ? 'Proposing…' : 'Propose poll to DM'}
      </button>
    </div>
  )
}
