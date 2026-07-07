'use client'
// Live-activity engagement (Phase J13) — turns real audience activity into a transient
// boost on top of the DM's engagement floor, so the patron-influence meter bobs off
// what chat is actually doing. Sources: stream ALERTS (sub/resub/donation/raid — via the
// J9 `dnd-stream-alert` window event + the character `:alert` broadcast), campaign
// REACTIONS (L9), and CHAT throughput (the caller bumps as lines land). The boost decays
// back toward 0 continuously. Pure amounts + decay live in lib/dnd/stream-influence.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { engagementBoostFor, ENGAGEMENT_BOOST_CAP, ENGAGEMENT_DECAY, type EngagementEvent } from '@/lib/dnd/stream-influence'

const ALERT_EVENTS = new Set(['sub', 'resub', 'donation', 'raid'])

export function useLiveEngagement(characterId: string | null, campaignId: string | null) {
  const [boost, setBoost] = useState(0)
  const boostRef = useRef(0)

  const add = useCallback((kind: EngagementEvent) => {
    boostRef.current = Math.min(ENGAGEMENT_BOOST_CAP, boostRef.current + engagementBoostFor(kind))
    setBoost(boostRef.current)
  }, [])

  // Continuous decay back toward the DM's floor.
  useEffect(() => {
    const t = setInterval(() => {
      if (boostRef.current <= 0.05) {
        if (boostRef.current !== 0) { boostRef.current = 0; setBoost(0) }
        return
      }
      boostRef.current *= ENGAGEMENT_DECAY
      setBoost(boostRef.current)
    }, 400)
    return () => clearInterval(t)
  }, [])

  // Alerts (character-scoped): the DM's own client hears the window event; other viewers
  // hear the broadcast. Both feed the boost.
  useEffect(() => {
    if (!characterId) return
    const onAlert = (e: Event) => {
      const d = (e as CustomEvent).detail as { characterId?: string; alert?: { type?: string } }
      if (d?.characterId !== characterId) return
      const t = d.alert?.type
      if (t && ALERT_EVENTS.has(t)) add(t as EngagementEvent)
    }
    window.addEventListener('dnd-stream-alert', onAlert)
    // Same topic the alert sender uses (StreamControl.fireAlert); a second subscription
    // on the topic is fine — Realtime multiplexes.
    const ch = supabase
      .channel(`dnd:stream:${characterId}:alert`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'alert' }, (m) => {
        const t = (m.payload as { type?: string })?.type
        if (t && ALERT_EVENTS.has(t)) add(t as EngagementEvent)
      })
      .subscribe()
    return () => { window.removeEventListener('dnd-stream-alert', onAlert); void supabase.removeChannel(ch) }
  }, [characterId, add])

  // Reactions (campaign-scoped, L9).
  useEffect(() => {
    if (!campaignId) return
    const ch = supabase
      .channel(`dnd:campaign:${campaignId}:reactions`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'react' }, () => add('reaction'))
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [campaignId, add])

  // Chat throughput — the caller bumps this as ambient/persisted lines land (capped so a
  // flood doesn't instantly max the meter).
  const bumpChat = useCallback((n = 1) => {
    for (let i = 0; i < Math.min(n, 5); i++) add('chat')
  }, [add])

  return { boost, bumpChat }
}
