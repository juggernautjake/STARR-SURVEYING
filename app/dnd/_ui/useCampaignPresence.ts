'use client'
// Campaign presence (Phase F6) — who's online, via Supabase Realtime presence.
// The /dnd cookie auth isn't a Supabase-auth session, so we key presence with the
// dnd user id the client already knows (`selfId`). Returns the set of online user
// ids. Presence is client-driven: each client tracks itself; sync recomputes the set.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useCampaignPresence(campaignId: string | null, selfId: string | null): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!campaignId || !selfId) return
    const ch = supabase.channel(`dnd:campaign:${campaignId}:presence`, { config: { presence: { key: selfId } } })
    ch.on('presence', { event: 'sync' }, () => {
      setOnline(new Set(Object.keys(ch.presenceState())))
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track({ userId: selfId, at: Date.now() })
    })
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [campaignId, selfId])

  return online
}
