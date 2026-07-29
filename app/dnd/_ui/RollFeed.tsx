'use client'
// Shared roll log feed (Phase G10) — the live campaign roll feed. Subscribes to the
// F2 'rolls' channel and refetches on a ping (posters ping after recording a roll).
// Shows actor, label, result, formula/breakdown, crit/fumble.
import { useCallback, useEffect, useState } from 'react'
import { useCampaignChannel } from './useCampaignChannel'

export interface RollRow {
  id: string
  actor_name: string | null
  label: string
  formula: string | null
  result: number | null
  breakdown: string | null
  crit: boolean
  fumble: boolean
  created_at: string
}

// Post a roll to the shared log. Returns the row (or null). Callers should ping the
// campaign's 'rolls' channel afterward so other clients' feeds refetch.
export async function postRoll(payload: {
  campaignId: string
  sessionId?: string
  characterId?: string
  actorName?: string
  label: string
  formula?: string
  result?: number
  breakdown?: string
  crit?: boolean
  fumble?: boolean
}): Promise<RollRow | null> {
  try {
    const r = await fetch('/api/dnd/rolls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (!r.ok) return null
    return (await r.json()).roll as RollRow
  } catch {
    return null
  }
}

export default function RollFeed({ campaignId, sessionId, initialRolls }: { campaignId: string; sessionId?: string; initialRolls?: RollRow[] }) {
  const [rolls, setRolls] = useState<RollRow[]>(initialRolls ?? [])
  const [manualLabel, setManualLabel] = useState('')
  const [manualResult, setManualResult] = useState('')
  const [manualNote, setManualNote] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)

  const load = useCallback(() => {
    const qs = new URLSearchParams({ campaignId })
    if (sessionId) qs.set('sessionId', sessionId)
    fetch(`/api/dnd/rolls?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : { rolls: [] }))
      .then((j) => setRolls(j.rolls ?? []))
      .catch(() => {})
  }, [campaignId, sessionId])

  useEffect(() => {
    if (initialRolls) return
    load()
  }, [load, initialRolls])

  useCampaignChannel(campaignId, 'rolls', load)

  // MANUAL ENTRY (P14-8). `postRoll` has been exported from this file all along and the module header
  // calls this component "the manual dice box", but no control ever existed — so a roll made with real
  // dice on the table could not reach the feed at all. Owner: "users can record manual rolls if they
  // want."
  //
  // Deliberately just LABEL + RESULT, with an optional breakdown. A formula field would imply the app
  // rolls it, and this exists precisely for the rolls it did NOT roll — the ones already sitting on the
  // table. `actorName` is left to the server session rather than typed, so nobody can post as someone
  // else from this box.
  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(manualResult);
    if (!manualLabel.trim() || !Number.isFinite(value)) return;
    setPosting(true);
    const row = await postRoll({
      campaignId,
      sessionId,
      label: manualLabel.trim(),
      result: value,
      breakdown: manualNote.trim() || undefined,
    });
    setPosting(false);
    if (!row) { setManualError('Could not record that roll.'); return; }
    setManualLabel(''); setManualResult(''); setManualNote(''); setManualError(null);
    load();
  }

  return (
    <div style={{ display: 'grid', gap: 6, maxHeight: 'min(50vh, 360px)', overflowY: 'auto' }}>
      <form onSubmit={submitManual} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '7px 10px', border: '1px solid var(--hx-line)', borderRadius: 8, background: 'var(--hx-inset-soft)' }}>
        <span style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-muted)', flex: '0 0 100%' }}>
          Rolled with real dice? Record it here.
        </span>
        <input
          aria-label="What the roll was for" value={manualLabel} onChange={(e) => setManualLabel(e.target.value)}
          placeholder="Perception check" required
          style={{ flex: '2 1 150px', minWidth: 0, fontSize: 13, padding: '5px 8px', background: 'var(--hx-inset-strong)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 6 }} />
        <input
          aria-label="Result" type="number" value={manualResult} onChange={(e) => setManualResult(e.target.value)}
          placeholder="17" required
          style={{ flex: '0 0 74px', fontSize: 13, padding: '5px 8px', background: 'var(--hx-inset-strong)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 6 }} />
        <input
          aria-label="How it was rolled (optional)" value={manualNote} onChange={(e) => setManualNote(e.target.value)}
          placeholder="d20+5, advantage"
          style={{ flex: '1 1 120px', minWidth: 0, fontSize: 12.5, padding: '5px 8px', background: 'var(--hx-inset-strong)', color: 'var(--hx-muted)', border: '1px solid var(--hx-line)', borderRadius: 6 }} />
        <button type="submit" disabled={posting}
          style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px', cursor: posting ? 'default' : 'pointer', background: 'none', border: '1px solid var(--hx-teal-1)', color: 'var(--hx-teal-1)', borderRadius: 6 }}>
          {posting ? 'Recording…' : 'Record'}
        </button>
        {manualError && <span style={{ flex: '0 0 100%', fontSize: 12, color: 'var(--hx-danger-2)' }}>{manualError}</span>}
      </form>

      {rolls.length === 0 ? (
        <p style={{ color: 'var(--hx-muted)', fontSize: 14 }}>No rolls yet — the feed fills as the party rolls.</p>
      ) : (
        rolls.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)' }}>
            <span
              style={{
                fontFamily: 'var(--hx-font-display)',
                fontSize: 20,
                minWidth: 34,
                textAlign: 'center',
                color: r.crit ? 'var(--hx-teal-1)' : r.fumble ? 'var(--hx-danger)' : 'var(--hx-gold-2)',
              }}
            >
              {r.result ?? '—'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--hx-text)' }}>
                {r.actor_name && <span style={{ color: 'var(--hx-gold-2)' }}>{r.actor_name} · </span>}
                {r.label}
                {r.crit && <span style={{ color: 'var(--hx-teal-1)', marginLeft: 6, fontSize: 10 }}>CRIT</span>}
                {r.fumble && <span style={{ color: 'var(--hx-danger)', marginLeft: 6, fontSize: 10 }}>FUMBLE</span>}
              </div>
              {r.breakdown && <div style={{ fontSize: 11, color: 'var(--hx-muted)', fontFamily: 'var(--hx-font-mono, monospace)' }}>{r.breakdown}</div>}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
