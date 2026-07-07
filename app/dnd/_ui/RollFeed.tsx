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

  return (
    <div style={{ display: 'grid', gap: 6, maxHeight: 'min(50vh, 360px)', overflowY: 'auto' }}>
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
