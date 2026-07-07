'use client'
// Initiative prompt (§6 initiative broadcast) — when the DM sends out the roller,
// this dims the player's screen and shows a digital d20 that already accounts for the
// character's initiative bonus. Rolling physical dice instead? Flip to manual and
// type the d20 face; the bonus is still applied. Submitting sets the character's
// initiative on the encounter and pings the tracker, which reorders the turn order
// for the DM and everyone. Mounted on the character sheet.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useChar } from '../state/store'
import { abilityMod } from '../rules/dnd'
import { rollD20 } from '../lib/dice'
import { useCampaignChannel } from '@/app/dnd/_ui/useCampaignChannel'

export default function InitiativePrompt() {
  const { char, characterId, campaignId } = useChar()
  const [encounterId, setEncounterId] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [roll, setRoll] = useState<{ face: number; total: number } | null>(null)
  const [manualFace, setManualFace] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState<number | null>(null)
  // Ping the initiative channel after submitting so the DM's tracker refetches + reorders.
  const { ping } = useCampaignChannel(campaignId ?? null, 'initiative', () => {})

  const initBonus = abilityMod(char.abilities.dex) + (char.combat.initiativeMisc || 0)
  const bonusStr = initBonus >= 0 ? `+${initBonus}` : `${initBonus}`

  useEffect(() => {
    if (!campaignId || !characterId) return
    const ch = supabase
      .channel(`dnd:campaign:${campaignId}:initroll`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'request' }, (m) => {
        const p = m.payload as { encounterId?: string; characterIds?: string[] }
        if (p.encounterId && (!p.characterIds || p.characterIds.includes(characterId))) {
          setEncounterId(p.encounterId)
          setManual(false)
          setRoll(null)
          setManualFace('')
          setLocked(null)
        }
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [campaignId, characterId])

  if (!encounterId || !characterId) return null

  const doRoll = () => { const r = rollD20(initBonus, 'flat'); setRoll({ face: r.natural, total: r.total }) }
  const face = manual ? (manualFace === '' ? null : Math.max(1, Math.min(20, Number(manualFace) || 0))) : roll?.face ?? null
  const total = manual ? (face == null ? null : face + initBonus) : roll?.total ?? null

  const submit = async () => {
    if (total == null || busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/dnd/encounters/${encounterId}/initiative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, total }),
      })
      if (r.ok) { setLocked(total); ping(); setTimeout(() => setEncounterId(null), 1800) }
    } finally { setBusy(false) }
  }

  return (
    <div
      role="dialog"
      aria-label="Roll for initiative"
      style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(2,4,10,0.86)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
    >
      <div className="card" style={{ maxWidth: 430, width: '100%', textAlign: 'center', padding: '26px 24px', border: '2px solid var(--line-strong)', boxShadow: '0 0 44px -8px var(--hotpink)' }}>
        <div className="sec-num" style={{ fontSize: 13 }}>ENCOUNTER {'//'} INITIATIVE</div>
        <h2 style={{ margin: '6px 0 2px', fontFamily: 'var(--font-display)' }}>Roll for Initiative!</h2>
        <p style={{ color: 'var(--muted)', margin: '0 0 16px', fontSize: 14 }}>
          {char.meta.name} · bonus <strong>{bonusStr}</strong>
        </p>

        {locked != null ? (
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 56, lineHeight: 1, color: 'var(--hotpink)', textShadow: '0 0 18px var(--hotpink)' }}>{locked}</div>
            <p style={{ color: 'var(--good)', marginTop: 10, fontWeight: 700 }}>Locked in! Waiting for the table…</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'inline-flex', gap: 6, marginBottom: 16 }}>
              <button className={`btn tiny ${!manual ? 'active' : ''}`} onClick={() => setManual(false)}>🎲 Digital</button>
              <button className={`btn tiny ${manual ? 'active' : ''}`} onClick={() => setManual(true)}>✋ Physical dice</button>
            </div>

            {!manual ? (
              <div>
                <button className="btn solid" style={{ fontSize: 16, padding: '12px 22px' }} onClick={doRoll}>{roll ? '↻ Reroll d20' : '🎲 Roll d20'}</button>
                {roll && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 52, lineHeight: 1, color: 'var(--ink)' }}>{roll.total}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>d20 [{roll.face}] {bonusStr}</div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', color: 'var(--muted)', fontSize: 13, marginBottom: 6 }}>Enter your d20 roll (1–20)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  autoFocus
                  value={manualFace}
                  onChange={(e) => setManualFace(e.target.value)}
                  style={{ width: 110, textAlign: 'center', fontSize: 24, fontFamily: 'var(--font-display)', padding: '8px 10px' }}
                />
                {face != null && (
                  <div style={{ marginTop: 12, color: 'var(--muted)', fontSize: 14 }}>
                    {face} {bonusStr} = <strong style={{ color: 'var(--ink)', fontSize: 20 }}>{total}</strong>
                  </div>
                )}
              </div>
            )}

            <button
              className="btn solid"
              style={{ marginTop: 18, width: '100%', padding: '12px', fontSize: 15, opacity: total == null || busy ? 0.5 : 1 }}
              disabled={total == null || busy}
              onClick={submit}
            >
              {busy ? 'Submitting…' : total == null ? 'Roll first' : `Lock in ${total}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
