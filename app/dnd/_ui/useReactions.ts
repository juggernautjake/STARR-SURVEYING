'use client'
// Reaction emotes (Phase L9 / K4 extra). Ephemeral, campaign-scoped emote bursts that
// float up everyone's screen — think Twitch/FaceTime reactions. Payload-carrying
// broadcast on `dnd:campaign:{id}:reactions` (the emote glyph rides the channel; no DB
// row, nothing to persist), so it degrades gracefully offline (L10): if the socket is
// down you still see your own reaction locally, others just don't. Self is shown
// immediately + broadcast with self:false so we don't double-count our own.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface FloatReaction {
  id: string
  emote: string
  /** Optional sender label (character/handle) shown as a tooltip. */
  from?: string
  /** Horizontal spawn position, 6–92 (% of viewport width). */
  x: number
}

const LIFETIME_MS = 2600

export function useReactions(campaignId: string | null) {
  const [reactions, setReactions] = useState<FloatReaction[]>([])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const clientIdRef = useRef('')
  const seqRef = useRef(0)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const push = useCallback((emote: string, from?: string) => {
    const id = `${clientIdRef.current}_${seqRef.current++}`
    const x = 6 + Math.random() * 86
    setReactions((rs) => [...rs, { id, emote, from, x }].slice(-40))
    const t = setTimeout(() => {
      setReactions((rs) => rs.filter((r) => r.id !== id))
      timersRef.current = timersRef.current.filter((x) => x !== t) // prune fired timer
    }, LIFETIME_MS)
    timersRef.current.push(t)
  }, [])

  useEffect(() => {
    if (!campaignId) return
    if (!clientIdRef.current) clientIdRef.current = `c_${Math.random().toString(36).slice(2)}`
    const ch = supabase.channel(`dnd:campaign:${campaignId}:reactions`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'react' }, (m) => {
      const p = m.payload as { senderId?: string; emote?: string; from?: string }
      if (!p?.emote || p.senderId === clientIdRef.current) return
      push(p.emote, p.from)
    }).subscribe()
    channelRef.current = ch
    const timers = timersRef.current
    return () => {
      channelRef.current = null
      timers.forEach(clearTimeout)
      void supabase.removeChannel(ch)
    }
  }, [campaignId, push])

  const react = useCallback(
    (emote: string, from?: string) => {
      push(emote, from) // optimistic: my own reaction shows instantly, socket up or not
      channelRef.current?.send({ type: 'broadcast', event: 'react', payload: { senderId: clientIdRef.current, emote, from } })
    },
    [push],
  )

  return { reactions, react }
}
