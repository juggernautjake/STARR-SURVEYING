'use client'
// Image-reveal realtime (Phase H1). Unlike the F2 ping+refetch channels, a reveal
// carries its payload on the broadcast (image + audience) so recipients can show it
// instantly. The DM sends; each client shows it only if it's in the audience
// (recipientIds null = everyone). Sender is excluded (self:false) — the DM picked it.
import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export interface RevealPayload {
  imageUrl: string
  caption?: string | null
  recipientIds: string[] | null // null = everyone
  fromName?: string | null
}

type Channel = ReturnType<typeof supabase.channel>

export function useReveals(campaignId: string | null, selfId: string | null, onReveal: (p: RevealPayload) => void) {
  const chRef = useRef<Channel | null>(null)
  const onRef = useRef(onReveal)
  onRef.current = onReveal

  useEffect(() => {
    if (!campaignId) return
    const ch = supabase.channel(`dnd:campaign:${campaignId}:reveals`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'reveal' }, (m) => {
      const p = m.payload as RevealPayload
      if (!p?.imageUrl) return
      if (p.recipientIds === null || (selfId != null && p.recipientIds.includes(selfId))) onRef.current(p)
    }).subscribe()
    chRef.current = ch
    return () => {
      chRef.current = null
      void supabase.removeChannel(ch)
    }
  }, [campaignId, selfId])

  const broadcastReveal = useCallback((p: RevealPayload) => {
    chRef.current?.send({ type: 'broadcast', event: 'reveal', payload: p })
  }, [])

  return { broadcastReveal }
}
