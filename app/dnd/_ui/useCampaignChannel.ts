'use client'
// Realtime channel hook for /dnd (Phase F2) — a per-campaign, per-channel Supabase
// BROADCAST channel. Same rationale as the sheet sync (C11b): the /dnd cookie auth
// isn't a Supabase-auth session, so we don't use table Realtime/RLS. A sender pings
// after a successful send; other clients receive the ping and refetch through the
// authed message API — so chat content never rides the public channel.
import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Channel = ReturnType<typeof supabase.channel>

/**
 * Subscribe to `dnd:campaign:{campaignId}:{channel}`. `onPing` fires when ANOTHER
 * client broadcasts (self is ignored). Returns `ping()` to notify others after you
 * send. `onPing` is kept in a ref so re-renders don't re-subscribe.
 */
export function useCampaignChannel(campaignId: string | null, channel: string, onPing: () => void) {
  const channelRef = useRef<Channel | null>(null)
  const clientIdRef = useRef<string>('')
  const onPingRef = useRef(onPing)
  onPingRef.current = onPing

  useEffect(() => {
    if (!campaignId) return
    if (!clientIdRef.current) {
      clientIdRef.current = `c_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
    }
    const ch = supabase.channel(`dnd:campaign:${campaignId}:${channel}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'msg' }, (m) => {
      if ((m.payload as { senderId?: string })?.senderId === clientIdRef.current) return
      onPingRef.current()
    }).subscribe()
    channelRef.current = ch
    return () => {
      channelRef.current = null
      void supabase.removeChannel(ch)
    }
  }, [campaignId, channel])

  const ping = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'msg', payload: { senderId: clientIdRef.current } })
  }, [])

  return { ping }
}
