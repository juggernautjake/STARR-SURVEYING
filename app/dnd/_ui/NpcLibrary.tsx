'use client'
// NPC library (Phase G3) — browse/search the campaign's NPCs, mark reusable ones as
// ★ Library, and open their full sheet. NPCs are campaign-scoped so they reuse
// across sessions; "drop a copy" into an encounter is the initiative tab's
// add-from-character (each drop is an independent instance — G5/G4).
import { useCallback, useEffect, useState } from 'react'
import styles from './hextech.module.css'

interface Npc { id: string; name: string; token_url?: string | null; is_library?: boolean; sheet_type?: string }

export default function NpcLibrary({ campaignId, isDM, initialNpcs }: { campaignId: string; isDM: boolean; initialNpcs?: Npc[] }) {
  const [npcs, setNpcs] = useState<Npc[]>(initialNpcs ?? [])
  const [q, setQ] = useState('')
  const [loaded, setLoaded] = useState(!!initialNpcs)
  const [buildDesc, setBuildDesc] = useState('')
  const [building, setBuilding] = useState(false)
  const [buildMsg, setBuildMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(() => {
    fetch(`/api/dnd/characters?campaignId=${campaignId}&npc=1`)
      .then((r) => (r.ok ? r.json() : { characters: [] }))
      .then((j) => setNpcs(j.characters ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [campaignId])

  useEffect(() => {
    if (!initialNpcs) load()
  }, [load, initialNpcs])

  async function toggleLibrary(npc: Npc) {
    await fetch(`/api/dnd/characters/${npc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_library: !npc.is_library }) }).catch(() => {})
    load()
  }

  // Agentic AI build (G2): create a blank NPC, then have the AI (I2 ai-edit) fill in a
  // complete playable sheet from the DM's description. Refine later via the sheet's
  // "Ask AI" box (I3).
  async function buildNpc() {
    const desc = buildDesc.trim()
    if (!desc || building) return
    setBuilding(true)
    setBuildMsg({ ok: true, text: 'Creating NPC…' })
    try {
      const cr = await fetch('/api/dnd/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, name: 'New NPC', isNpc: true }),
      })
      const cj = await cr.json().catch(() => ({}))
      if (!cr.ok || !cj.character?.id) {
        setBuildMsg({ ok: false, text: cj.error ?? 'Could not create the NPC.' })
        return
      }
      setBuildMsg({ ok: true, text: 'Building the sheet with AI…' })
      const ai = await fetch(`/api/dnd/characters/${cj.character.id}/ai-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: `Build a complete, playable, level-appropriate D&D 5e NPC from this description: ${desc}` }),
      })
      const aj = await ai.json().catch(() => ({}))
      if (ai.ok) {
        setBuildMsg({ ok: true, text: `Built “${aj.name ?? 'NPC'}” (${aj.editCount ?? 0} edits). Open it to review or refine.` })
        setBuildDesc('')
        load()
      } else {
        setBuildMsg({ ok: false, text: `Created the NPC but the AI build failed: ${aj.error ?? 'unknown error'}. Open it and try “Ask AI”.` })
        load()
      }
    } catch {
      setBuildMsg({ ok: false, text: 'Build request failed.' })
    } finally {
      setBuilding(false)
    }
  }

  const filtered = npcs.filter((n) => n.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div>
      <p style={{ color: 'var(--hx-muted)', margin: '0 0 10px', fontSize: 13 }}>
        NPCs reuse across sessions. Mark one ★ Library to keep it handy; add NPCs to a fight from the Initiative tab.
      </p>

      {isDM && (
        <div style={{ border: '1px solid var(--hx-gold-1)', background: 'rgba(200,155,60,0.06)', padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--hx-gold-2)', marginBottom: 6 }}>✨ BUILD AN NPC WITH AI</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              className={styles.input}
              style={{ flex: 1, minWidth: 240, padding: '8px 10px' }}
              placeholder="Describe an NPC — e.g. “a cunning goblin boss, level 3, with a nasty crossbow and a pet wolf”"
              value={buildDesc}
              disabled={building}
              onChange={(e) => setBuildDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buildNpc()}
            />
            <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={buildNpc} disabled={building || !buildDesc.trim()}>
              {building ? 'Building…' : '✨ Build'}
            </button>
          </div>
          {buildMsg && <p style={{ margin: '8px 0 0', fontSize: 13, color: buildMsg.ok ? 'var(--hx-teal-1)' : 'var(--hx-danger)' }}>{buildMsg.text}</p>}
        </div>
      )}

      <input className={styles.input} style={{ padding: '8px 10px', marginBottom: 10 }} placeholder="Search NPCs…" value={q} onChange={(e) => setQ(e.target.value)} />

      {!loaded ? (
        <p style={{ color: 'var(--hx-muted)' }}><span className={styles.spinner} style={{ display: 'inline-block', width: 16, height: 16, verticalAlign: 'middle', marginRight: 8 }} />Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--hx-muted)' }}>{npcs.length === 0 ? 'No NPCs yet — create one from the campaign page.' : 'No NPCs match your search.'}</p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {filtered.map((n) => (
            <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)' }}>
              {n.token_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.portrait} src={n.token_url} alt="" style={{ width: 34, height: 34 }} />
              ) : (
                <span className={styles.portrait} style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'var(--hx-gold-2)' }}>{n.name.charAt(0).toUpperCase()}</span>
              )}
              <span style={{ flex: 1, color: 'var(--hx-text)', fontSize: 14 }}>{n.name}</span>
              {n.is_library && <span style={{ fontSize: 10, color: 'var(--hx-gold-2)', border: '1px solid currentColor', padding: '1px 5px' }}>★ Library</span>}
              {isDM && <button className={styles.hexBtn} style={{ padding: '4px 9px' }} onClick={() => toggleLibrary(n)}>{n.is_library ? 'Unpin' : '★ Library'}</button>}
              <a className={styles.hexBtn} style={{ padding: '4px 9px' }} href={`/dnd/characters/${n.id}`}>Open</a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
