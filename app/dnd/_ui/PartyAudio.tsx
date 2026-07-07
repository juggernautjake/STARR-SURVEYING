'use client'
// Party audio client (Phase H8) — every campaign member mounts this so the DM's
// soundboard can play SFX/music to the table. Browsers block autoplay until a user
// gesture, so it shows a one-tap "Enable table audio" button that unlocks playback;
// after that it listens on the campaign's `:sound` broadcast channel and plays what the
// DM broadcasts (H7). Music/looping clips replace the current bed; SFX overlap.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface PlayPayload { url?: string; volume?: number; loop?: boolean; kind?: 'sfx' | 'music' }

export default function PartyAudio({ campaignId }: { campaignId: string }) {
  const [enabled, setEnabled] = useState(false)
  const musicRef = useRef<HTMLAudioElement | null>(null)
  const sfxRef = useRef<Set<HTMLAudioElement>>(new Set()) // overlapping one-shots
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const stopAll = useCallback(() => {
    if (musicRef.current) {
      musicRef.current.pause()
      musicRef.current = null
    }
    // Stop every in-flight SFX too (not just the music bed).
    sfxRef.current.forEach((a) => a.pause())
    sfxRef.current.clear()
  }, [])

  const playSound = useCallback((p: PlayPayload) => {
    if (!p?.url) return
    const vol = Math.max(0, Math.min(1, p.volume ?? 1))
    if (p.kind === 'music' || p.loop) {
      if (musicRef.current) musicRef.current.pause()
      const a = new Audio(p.url)
      a.loop = !!p.loop
      a.volume = vol
      musicRef.current = a
      void a.play().catch(() => {})
    } else {
      const a = new Audio(p.url)
      a.volume = vol
      sfxRef.current.add(a)
      a.addEventListener('ended', () => sfxRef.current.delete(a))
      void a.play().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const ch = supabase
      .channel(`dnd:campaign:${campaignId}:sound`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'play' }, (m) => playSound(m.payload as PlayPayload))
      .on('broadcast', { event: 'stop' }, stopAll)
      .subscribe()
    chanRef.current = ch
    return () => {
      chanRef.current = null
      stopAll()
      void supabase.removeChannel(ch)
    }
  }, [enabled, campaignId, playSound, stopAll])

  const enable = () => {
    // Unlock the autoplay policy inside this click by playing a silent blip.
    try {
      const blip = new Audio('data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA')
      blip.volume = 0
      void blip.play().catch(() => {})
    } catch {
      /* ignore */
    }
    setEnabled(true)
  }

  if (!enabled) {
    return (
      <button
        onClick={enable}
        style={{ fontSize: 12, padding: '6px 12px', border: '1px solid var(--hx-gold-0, #785a28)', color: 'var(--hx-gold-2, #c8aa6e)', background: 'rgba(1,10,19,0.5)', borderRadius: 3, cursor: 'pointer' }}
      >
        🔊 Enable table audio
      </button>
    )
  }
  return <span style={{ fontSize: 12, color: 'var(--hx-teal-1, #0ac8b9)' }}>🔊 Table audio on</span>
}
