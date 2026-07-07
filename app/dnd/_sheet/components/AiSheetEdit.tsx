import { useState } from 'react'
import { useChar } from '../state/store'

// "Ask AI to edit this sheet" (Phase I3) — a natural-language box in the DM panel.
// Sends the instruction to the I2 ai-edit route, then reloads the DB-backed sheet so
// the change appears live. DM-only + DB-backed (needs a characterId).
export default function AiSheetEdit() {
  const { isDM, characterId, reloadFromDb } = useChar()
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  if (!isDM || !characterId) return null

  const ask = async () => {
    const text = instruction.trim()
    if (!text || busy) return
    setBusy(true)
    setStatus(null)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/ai-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: text }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        setStatus({ ok: true, text: j.summary ?? `Applied ${j.editCount ?? 0} edit(s).` })
        setInstruction('')
        await reloadFromDb()
      } else {
        setStatus({ ok: false, text: j.error ?? 'The AI edit failed.' })
      }
    } catch {
      setStatus({ ok: false, text: 'Request failed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line, rgba(255,255,255,0.12))' }}>
      <span className="sec-num" style={{ color: 'var(--gold)', fontSize: 12 }}>AI {'//'} Ask</span>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder={'e.g. "give them a greatsword & +2 STR", "add a Multiattack feature", "level to 10"'}
          disabled={busy}
          style={{ flex: 1, minWidth: 220, padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 14 }}
        />
        <button className="btn" onClick={ask} disabled={busy || !instruction.trim()}>
          {busy ? 'Thinking…' : 'Ask AI'}
        </button>
      </div>
      {status && (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: status.ok ? 'var(--teal, #0ac8b9)' : 'var(--danger, #ff6b6b)' }}>
          {status.ok ? '✓ ' : '✕ '}{status.text}
        </p>
      )}
    </div>
  )
}
