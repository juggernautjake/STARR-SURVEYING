'use client'
// Dynamic initiative tracker (Phase G5) — the DM adds PCs/NPCs, sets initiative,
// and advances turns; the list reorders (G4 order) and highlights whose turn it is.
// Consumes the G4 API. Players see the order live (realtime hookup is G11).
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './hextech.module.css'
import { useCampaignChannel } from './useCampaignChannel'
import QuickSheet from './QuickSheet'

interface Entry {
  id: string
  name: string
  token_url?: string | null
  initiative: number | null
  hp?: number | null
  max_hp?: number | null
  conditions?: string[] | null
  character_id?: string | null
  legendary_max?: number | null
  legendary_used?: number | null
}
interface Encounter { id: string; name: string | null; round: number; current_turn_index: number; status: string }
interface Char { id: string; name: string }
interface Initial { encounter: Encounter | null; entries: Entry[]; currentEntryId: string | null; characters: Char[] }

export default function InitiativeTracker({ sessionId, campaignId, isDM, initial }: { sessionId: string; campaignId: string; isDM: boolean; initial?: Initial }) {
  const [encounter, setEncounter] = useState<Encounter | null>(initial?.encounter ?? null)
  const [entries, setEntries] = useState<Entry[]>(initial?.entries ?? [])
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(initial?.currentEntryId ?? null)
  const [characters, setCharacters] = useState<Char[]>(initial?.characters ?? [])
  const [loaded, setLoaded] = useState(!!initial)
  const [add, setAdd] = useState({ name: '', initiative: '', hp: '', characterId: '' })
  const [amt, setAmt] = useState<Record<string, string>>({})
  const [cond, setCond] = useState<Record<string, string>>({})
  const [leg, setLeg] = useState<Record<string, string>>({})
  const [quickOpen, setQuickOpen] = useState<string | null>(null)
  const [requested, setRequested] = useState(false)
  const [initEdit, setInitEdit] = useState<Record<string, string>>({})
  const initRollChanRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const loadEncounter = useCallback(async (encId: string) => {
    const r = await fetch(`/api/dnd/encounters/${encId}`)
    if (!r.ok) return
    const j = await r.json()
    setEncounter(j.encounter)
    setEntries(j.entries ?? [])
    setCurrentEntryId(j.currentEntryId ?? null)
  }, [])

  // Load (or reload) the session's active encounter — shared by the initial load
  // and the realtime refetch so players see the current order/turn (G11).
  const refresh = useCallback(async () => {
    const r = await fetch(`/api/dnd/sessions/${sessionId}/encounters`)
    if (!r.ok) return
    const j = await r.json()
    const first = j.encounters?.[0]
    if (first) await loadEncounter(first.id)
    else { setEncounter(null); setEntries([]); setCurrentEntryId(null) }
  }, [sessionId, loadEncounter])

  useEffect(() => {
    if (initial) return
    let cancelled = false
    ;(async () => {
      fetch(`/api/dnd/characters?campaignId=${campaignId}`).then((r) => (r.ok ? r.json() : { characters: [] })).then((j) => { if (!cancelled) setCharacters(j.characters ?? []) }).catch(() => {})
      await refresh()
      if (!cancelled) setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [sessionId, campaignId, initial, refresh])

  // Realtime (G11): the DM's changes broadcast on the 'initiative' channel; other
  // clients refetch to see the reordered list + current turn.
  const { ping } = useCampaignChannel(campaignId, 'initiative', () => { void refresh() })

  // Broadcast an "roll for initiative" prompt to the table (G-init). Every player's
  // sheet dims and shows the dice roller (with their bonus); as they submit, entries
  // fill in and the order reorders on the resulting pings.
  useEffect(() => {
    if (!campaignId) return
    const ch = supabase.channel(`dnd:campaign:${campaignId}:initroll`).subscribe()
    initRollChanRef.current = ch
    return () => { initRollChanRef.current = null; void supabase.removeChannel(ch) }
  }, [campaignId])
  const requestRolls = () => {
    if (!encounter) return
    const characterIds = entries.filter((e) => e.character_id).map((e) => e.character_id as string)
    initRollChanRef.current?.send({ type: 'broadcast', event: 'request', payload: { encounterId: encounter.id, characterIds } })
    setRequested(true)
    setTimeout(() => setRequested(false), 2500)
  }

  async function createEncounter() {
    const r = await fetch(`/api/dnd/sessions/${sessionId}/encounters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Encounter' }) })
    if (r.ok) { const j = await r.json(); await loadEncounter(j.encounter.id); ping() }
  }
  async function addEntry() {
    if (!encounter) return
    const hp = add.hp ? Number(add.hp) : undefined
    const body = add.characterId
      ? { characterId: add.characterId, initiative: add.initiative ? Number(add.initiative) : undefined, hp, maxHp: hp }
      : { name: add.name, initiative: add.initiative ? Number(add.initiative) : undefined, hp, maxHp: hp }
    const r = await fetch(`/api/dnd/encounters/${encounter.id}/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) { setAdd({ name: '', initiative: '', hp: '', characterId: '' }); await loadEncounter(encounter.id); ping() }
  }
  async function turn(action: 'next' | 'prev') {
    if (!encounter) return
    const r = await fetch(`/api/dnd/encounters/${encounter.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    if (r.ok) { await loadEncounter(encounter.id); ping() }
  }
  async function patchEntry(entryId: string, patch: Record<string, unknown>) {
    if (!encounter) return
    const r = await fetch(`/api/dnd/initiative-entries/${entryId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    if (r.ok) { await loadEncounter(encounter.id); ping() }
  }
  // Preroll (G12): roll a d20 initiative for every combatant that doesn't have one
  // yet, so the fight opens pre-ordered. (The DM can still tweak any value.)
  async function rollInitiative() {
    if (!encounter) return
    const toRoll = entries.filter((e) => e.initiative == null)
    if (toRoll.length === 0) return
    await Promise.all(
      toRoll.map((e) =>
        fetch(`/api/dnd/initiative-entries/${e.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initiative: Math.floor(Math.random() * 20) + 1 }),
        }).catch(() => {}),
      ),
    )
    await loadEncounter(encounter.id)
    ping()
  }
  async function removeEntry(entryId: string) {
    if (!encounter) return
    const r = await fetch(`/api/dnd/initiative-entries/${entryId}`, { method: 'DELETE' })
    if (r.ok) { await loadEncounter(encounter.id); ping() }
  }
  function applyHp(entry: Entry, sign: 1 | -1) {
    const n = Number(amt[entry.id] || 0)
    if (!n) return
    patchEntry(entry.id, { delta: sign * Math.abs(n) })
    setAmt((a) => ({ ...a, [entry.id]: '' }))
  }
  function addCondition(entry: Entry) {
    const c = (cond[entry.id] || '').trim()
    if (!c) return
    const next = Array.from(new Set([...(entry.conditions ?? []), c]))
    patchEntry(entry.id, { conditions: next })
    setCond((s) => ({ ...s, [entry.id]: '' }))
  }
  function removeCondition(entry: Entry, c: string) {
    patchEntry(entry.id, { conditions: (entry.conditions ?? []).filter((x) => x !== c) })
  }

  if (!loaded) return <p style={{ color: 'var(--hx-muted)' }}><span className={styles.spinner} style={{ display: 'inline-block', width: 16, height: 16, verticalAlign: 'middle', marginRight: 8 }} />Loading…</p>

  if (!encounter) {
    return (
      <div>
        <p style={{ color: 'var(--hx-muted)', marginTop: 0 }}>No encounter running.</p>
        {isDM && <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={createEncounter}>Start Encounter</button>}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', letterSpacing: '0.1em' }}>ROUND {encounter.round}</span>
        {isDM && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className={`${styles.hexBtn} ${styles.hexBtnTeal}`} onClick={requestRolls} disabled={!entries.some((e) => e.character_id)} title="Dim every player's screen and send them the initiative dice roller">
              {requested ? '📣 Sent!' : '📣 Request Rolls'}
            </button>
            <button className={styles.hexBtn} onClick={rollInitiative} disabled={!entries.some((e) => e.initiative == null)} title="Roll a d20 initiative for every combatant that doesn't have one yet (NPCs, or players who didn't roll)">🎲 Roll Init</button>
            <button className={styles.hexBtn} onClick={() => turn('prev')} disabled={entries.length === 0}>‹ Prev</button>
            <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={() => turn('next')} disabled={entries.length === 0}>Next ›</button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {entries.length === 0 && <p style={{ color: 'var(--hx-muted)' }}>No combatants yet.</p>}
        {entries.map((e) => {
          const current = e.id === currentEntryId
          return (
            <div key={e.id} style={{ border: '1px solid', borderColor: current ? 'var(--hx-gold-1)' : 'var(--hx-line)', background: current ? 'rgba(200,155,60,0.12)' : 'rgba(1,10,19,0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
                {isDM ? (
                  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 42, flexShrink: 0 }}>
                    <input
                      className={styles.input}
                      style={{ width: 42, padding: '2px 2px', textAlign: 'center', fontSize: 14, fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}
                      inputMode="numeric"
                      placeholder="—"
                      title="Type this combatant's initiative"
                      value={initEdit[e.id] ?? (e.initiative != null ? String(e.initiative) : '')}
                      onChange={(ev) => setInitEdit((s) => ({ ...s, [e.id]: ev.target.value }))}
                      onBlur={(ev) => {
                        const v = ev.target.value.trim()
                        setInitEdit((s) => { const n = { ...s }; delete n[e.id]; return n })
                        if (v !== '' && Number(v) !== e.initiative) patchEntry(e.id, { initiative: Number(v) })
                      }}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }}
                    />
                    <button className={styles.hexBtn} style={{ padding: '1px 6px', fontSize: 11 }} title="Roll a d20 for this combatant" onClick={() => patchEntry(e.id, { initiative: Math.floor(Math.random() * 20) + 1 })}>🎲</button>
                  </span>
                ) : (
                  <span style={{ width: 30, textAlign: 'center', fontFamily: 'var(--hx-font-display)', fontSize: 16, color: 'var(--hx-gold-2)' }}>{e.initiative ?? '—'}</span>
                )}
                {e.token_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={`${styles.portrait} ${current ? styles.portraitActive : ''}`} src={e.token_url} alt="" style={{ width: 34, height: 34 }} />
                ) : (
                  <span className={`${styles.portrait} ${current ? styles.portraitActive : ''}`} style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'var(--hx-gold-2)' }}>{e.name.charAt(0).toUpperCase()}</span>
                )}
                <span style={{ flex: 1, color: 'var(--hx-text)', fontSize: 14 }}>{e.name}</span>
                {(e.hp != null || e.max_hp != null) && (
                  <span style={{ fontSize: 12, color: e.hp === 0 ? 'var(--hx-danger)' : 'var(--hx-teal-1)' }}>{e.hp ?? '?'}{e.max_hp != null ? ` / ${e.max_hp}` : ''} HP</span>
                )}
                {e.conditions?.map((c) => (
                  <span key={c} onClick={isDM ? () => removeCondition(e, c) : undefined} style={{ fontSize: 10, color: 'var(--hx-danger)', border: '1px solid currentColor', padding: '0 4px', cursor: isDM ? 'pointer' : 'default' }} title={isDM ? 'Remove condition' : undefined}>{c}{isDM ? ' ✕' : ''}</span>
                ))}
                {(e.legendary_max ?? 0) > 0 && (
                  <span title={`Legendary actions: ${(e.legendary_max ?? 0) - (e.legendary_used ?? 0)} left`} style={{ fontSize: 12, color: 'var(--hx-gold-2)', letterSpacing: '1px' }}>
                    {'◆'.repeat(Math.max(0, (e.legendary_max ?? 0) - (e.legendary_used ?? 0)))}{'◇'.repeat(Math.min(e.legendary_max ?? 0, e.legendary_used ?? 0))}
                  </span>
                )}
              </div>
              {isDM && (
                <div style={{ display: 'flex', gap: 5, padding: '0 10px 8px 10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input className={styles.input} style={{ width: 52, padding: '6px 7px', fontSize: 13 }} placeholder="±" inputMode="numeric" value={amt[e.id] ?? ''} onChange={(ev) => setAmt((a) => ({ ...a, [e.id]: ev.target.value }))} />
                  <button className={styles.hexBtn} style={{ padding: '6px 10px' }} onClick={() => applyHp(e, -1)}>− Dmg</button>
                  <button className={styles.hexBtn} style={{ padding: '6px 10px' }} onClick={() => applyHp(e, 1)}>+ Heal</button>
                  <input className={styles.input} style={{ width: 90, padding: '6px 7px', fontSize: 13 }} placeholder="condition" value={cond[e.id] ?? ''} onChange={(ev) => setCond((s) => ({ ...s, [e.id]: ev.target.value }))} onKeyDown={(ev) => ev.key === 'Enter' && addCondition(e)} />
                  <button className={styles.hexBtn} style={{ padding: '6px 10px' }} onClick={() => addCondition(e)}>+ Cond</button>
                  <span title="Legendary actions per round" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 11, color: 'var(--hx-gold-2)' }}>◆</span>
                    <input className={styles.input} style={{ width: 38, padding: '6px 4px', fontSize: 13 }} placeholder="0" inputMode="numeric" value={leg[e.id] ?? String(e.legendary_max ?? 0)} onChange={(ev) => setLeg((s) => ({ ...s, [e.id]: ev.target.value }))} onBlur={(ev) => patchEntry(e.id, { legendaryMax: Number(ev.target.value) || 0 })} />
                  </span>
                  {(e.legendary_max ?? 0) > 0 && (
                    <button className={styles.hexBtn} style={{ padding: '6px 10px' }} onClick={() => patchEntry(e.id, { legendarySpend: 1 })} disabled={(e.legendary_max ?? 0) - (e.legendary_used ?? 0) <= 0} title="Spend a legendary action">Spend ◆</button>
                  )}
                  {e.character_id && (
                    // Quick sheet (G7) — one-tap rolls without opening the full sheet.
                    <button className={styles.hexBtn} style={{ padding: '6px 10px', marginLeft: 'auto' }} onClick={() => setQuickOpen(quickOpen === e.id ? null : e.id)}>⚡ Quick</button>
                  )}
                  {e.character_id && (
                    // Open the combatant's full character sheet (G9) — view/edit everything.
                    <a className={styles.hexBtn} style={{ padding: '6px 10px' }} href={`/dnd/characters/${e.character_id}`} target="_blank" rel="noreferrer">⤢ Sheet</a>
                  )}
                  <button className={styles.hexBtn} style={{ padding: '6px 10px', borderColor: 'var(--hx-danger)', color: 'var(--hx-danger)', marginLeft: e.character_id ? 0 : 'auto' }} onClick={() => removeEntry(e.id)}>✕</button>
                </div>
              )}
              {isDM && quickOpen === e.id && e.character_id && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid var(--hx-line)' }}>
                  <div style={{ height: 10 }} />
                  <QuickSheet characterId={e.character_id} campaignId={campaignId} sessionId={sessionId} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {isDM && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className={styles.input} style={{ width: 'auto', padding: '8px 10px' }} value={add.characterId} onChange={(e) => setAdd((a) => ({ ...a, characterId: e.target.value }))}>
            <option value="">Manual…</option>
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!add.characterId && <input className={styles.input} style={{ width: 120, padding: '8px 10px' }} placeholder="Name" value={add.name} onChange={(e) => setAdd((a) => ({ ...a, name: e.target.value }))} />}
          <input className={styles.input} style={{ width: 64, padding: '8px 10px' }} placeholder="Init" inputMode="numeric" value={add.initiative} onChange={(e) => setAdd((a) => ({ ...a, initiative: e.target.value }))} />
          <input className={styles.input} style={{ width: 64, padding: '8px 10px' }} placeholder="HP" inputMode="numeric" value={add.hp} onChange={(e) => setAdd((a) => ({ ...a, hp: e.target.value }))} />
          <button className={styles.hexBtn} onClick={addEntry}>+ Add</button>
        </div>
      )}
    </div>
  )
}
