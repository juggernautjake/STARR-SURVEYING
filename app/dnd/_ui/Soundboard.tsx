'use client'
// DM soundboard (Phase H5/H6/H7) — tabbed pads of SFX/music the DM uploads and fires.
// Each pad can PREVIEW locally (DM-only monitor) or PLAY TO PARTY (broadcast on the
// campaign `:sound` channel → every member's PartyAudio, H8). Music loops replace the
// current bed; SFX overlap. Tabs + uploads persist (dnd_soundboard_tabs / dnd_sounds).
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './hextech.module.css'

interface Tab { id: string; name: string; sort_order: number }
interface Sound { id: string; tab_id: string; label: string; url: string; kind: 'sfx' | 'music'; volume: number; loop: boolean; sort_order: number }

export default function Soundboard({ campaignId }: { campaignId: string }) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [sounds, setSounds] = useState<Sound[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [newTab, setNewTab] = useState('')
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch(`/api/dnd/campaigns/${campaignId}/soundboard`)
      .then((r) => (r.ok ? r.json() : { tabs: [], sounds: [] }))
      .then((j) => {
        setTabs(j.tabs ?? [])
        setSounds(j.sounds ?? [])
        setActiveTab((cur) => cur ?? j.tabs?.[0]?.id ?? null)
      })
      .catch(() => {})
  }, [campaignId])

  useEffect(() => { load() }, [load])

  // Broadcast channel to the party (H7).
  useEffect(() => {
    const ch = supabase.channel(`dnd:campaign:${campaignId}:sound`, { config: { broadcast: { self: false } } }).subscribe()
    chanRef.current = ch
    return () => { chanRef.current = null; void supabase.removeChannel(ch) }
  }, [campaignId])

  const stopPreview = () => { if (previewRef.current) { previewRef.current.pause(); previewRef.current = null } }

  // Stop any DM-local preview/music when the board unmounts (e.g. leaving the console),
  // so looping audio doesn't keep playing forever.
  useEffect(() => () => { if (previewRef.current) { previewRef.current.pause(); previewRef.current = null } }, [])

  const preview = (s: Sound) => {
    stopPreview()
    const a = new Audio(s.url)
    a.loop = s.loop
    a.volume = s.volume
    previewRef.current = a
    void a.play().catch(() => {})
  }

  const playToParty = (s: Sound) => {
    // DM hears it locally + broadcasts to every member.
    preview(s)
    chanRef.current?.send({ type: 'broadcast', event: 'play', payload: { url: s.url, volume: s.volume, loop: s.loop, kind: s.kind } })
  }

  const stopAll = () => {
    stopPreview()
    chanRef.current?.send({ type: 'broadcast', event: 'stop', payload: {} })
  }

  const addTab = async () => {
    const name = newTab.trim()
    if (!name) return
    const r = await fetch(`/api/dnd/campaigns/${campaignId}/soundboard`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok && j.tab) { setTabs((t) => [...t, j.tab]); setActiveTab(j.tab.id); setNewTab('') }
    else setErr(j.error ?? 'Could not create tab.')
  }

  const upload = async (file: File, kind: 'sfx' | 'music', loop: boolean) => {
    if (!activeTab) { setErr('Create or pick a tab first.'); return }
    setUploading(true)
    setErr('')
    try {
      const fd = new FormData()
      fd.set('tabId', activeTab)
      fd.set('label', file.name.replace(/\.[^.]+$/, ''))
      fd.set('kind', kind)
      fd.set('loop', String(loop))
      fd.set('file', file)
      const r = await fetch(`/api/dnd/campaigns/${campaignId}/soundboard/sounds`, { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.sound) setSounds((s) => [...s, j.sound])
      else setErr(j.error ?? 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const setVolume = (s: Sound, volume: number) => {
    setSounds((list) => list.map((x) => (x.id === s.id ? { ...x, volume } : x)))
    void fetch(`/api/dnd/campaigns/${campaignId}/soundboard/sounds/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ volume }) }).catch(() => {})
  }

  const remove = async (s: Sound) => {
    setSounds((list) => list.filter((x) => x.id !== s.id))
    await fetch(`/api/dnd/campaigns/${campaignId}/soundboard/sounds/${s.id}`, { method: 'DELETE' }).catch(() => {})
  }

  const tabSounds = sounds.filter((s) => s.tab_id === activeTab)

  return (
    <div className={styles.framedPanel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ fontFamily: 'var(--hx-font-display)', letterSpacing: '0.1em', color: 'var(--hx-gold-2)' }}>🎵 Soundboard</strong>
        <button className={styles.hexBtn} onClick={stopAll} style={{ marginLeft: 'auto', fontSize: 12 }}>⏹ Stop all</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {tabs.map((t) => (
          <button key={t.id} className={`${styles.hexBtn} ${activeTab === t.id ? styles.hexBtnPrimary : ''}`} onClick={() => setActiveTab(t.id)} style={{ fontSize: 12 }}>
            {t.name}
          </button>
        ))}
        <input value={newTab} onChange={(e) => setNewTab(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTab()} placeholder="+ tab name" style={{ width: 110, padding: '5px 8px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 12 }} />
        <button className={styles.hexBtn} onClick={addTab} disabled={!newTab.trim()} style={{ fontSize: 12 }}>＋ Tab</button>
      </div>

      {/* Upload */}
      {activeTab && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, fontSize: 12, color: 'var(--hx-muted)' }}>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, 'sfx', false) }}
            style={{ fontSize: 12, maxWidth: 200 }}
          />
          <span>as SFX, or</span>
          <button className={styles.hexBtn} disabled={uploading} onClick={() => { const f = fileRef.current?.files?.[0]; if (f) void upload(f, 'music', true) }} style={{ fontSize: 12 }}>
            ⤓ Add as looping music
          </button>
          {uploading && <span>uploading…</span>}
        </div>
      )}
      {err && <p style={{ color: 'var(--hx-danger)', fontSize: 12 }}>{err}</p>}

      {/* Pads */}
      {tabs.length === 0 ? (
        <p style={{ color: 'var(--hx-muted)', fontSize: 13 }}>Create a tab (e.g. “Ambience”, “Combat”, “Stingers”) then upload sounds.</p>
      ) : tabSounds.length === 0 ? (
        <p style={{ color: 'var(--hx-muted)', fontSize: 13 }}>No sounds in this tab yet — upload one above.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {tabSounds.map((s) => (
            <div key={s.id} style={{ border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', padding: 8, display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12.5, color: 'var(--hx-text)', wordBreak: 'break-word' }}>
                {s.kind === 'music' ? '🎼' : '🔊'} {s.label}{s.loop ? ' ↻' : ''}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button className={styles.hexBtn} onClick={() => preview(s)} title="Preview (you only)" style={{ fontSize: 11, flex: 1 }}>▶</button>
                <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={() => playToParty(s)} title="Play to the whole party" style={{ fontSize: 11, flex: 2 }}>📢 Party</button>
              </div>
              <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => setVolume(s, Number(e.target.value))} title="Volume" />
              <button className={styles.hexBtn} onClick={() => remove(s)} style={{ fontSize: 10, color: 'var(--hx-danger)' }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
