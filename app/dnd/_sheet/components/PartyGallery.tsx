'use client'
// Party gallery container (Phase D5) — fetches a campaign's characters and renders
// the roster + combined art. Mounts on the campaign page / DM dashboard (E3).
import { useEffect, useState } from 'react'
import PartyRoster, { type PartyMember } from './PartyRoster'

interface CharacterRow {
  id: string
  name: string
  art_url?: string | null
  token_url?: string | null
}

export default function PartyGallery({ campaignId }: { campaignId: string }) {
  const [members, setMembers] = useState<PartyMember[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/dnd/characters?campaignId=${campaignId}`)
      .then((r) => (r.ok ? r.json() : { characters: [] }))
      .then((j) => {
        if (cancelled) return
        setMembers(
          ((j.characters ?? []) as CharacterRow[]).map((c) => ({
            id: c.id,
            name: c.name,
            artUrl: c.art_url,
            tokenUrl: c.token_url,
          })),
        )
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [campaignId])

  if (!loaded) return <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading party…</p>
  return <PartyRoster members={members} />
}
