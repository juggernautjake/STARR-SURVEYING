'use client'
// Quick sheet (Phase G7) — a compact per-combatant panel so the DM can run an NPC
// without opening the full sheet: token/HP/AC + one-tap ability checks, saves, and
// attack/damage rolls. Every roll posts to the shared feed (G10) and pings realtime.
// Rolls are computed straight off the Character model (abilities/saves/attacks) —
// no full-engine derive needed for these basics.
import { useCallback, useEffect, useState } from 'react'
import styles from './hextech.module.css'
import { ABILITIES, SKILLS, profContribution, type AbilityKey } from '../_sheet/rules/dnd'
import { rollD20, rollDamage, type D20Roll } from '../_sheet/lib/dice'
import type { Character } from '../_sheet/types'
import { postRoll } from './RollFeed'
import { useCampaignChannel } from './useCampaignChannel'

const mod = (score: number) => Math.floor((score - 10) / 2)
const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

export default function QuickSheet({ characterId, campaignId, sessionId, initialChar }: { characterId: string; campaignId: string; sessionId?: string; initialChar?: { name: string; data: Character } }) {
  const [char, setChar] = useState<Character | null>(initialChar?.data ?? null)
  const [name, setName] = useState(initialChar?.name ?? '')
  const [last, setLast] = useState<{ label: string; total: number | null; breakdown: string; crit?: boolean; fumble?: boolean } | null>(null)
  const { ping } = useCampaignChannel(campaignId, 'rolls', () => {})

  useEffect(() => {
    if (initialChar) return
    fetch(`/api/dnd/characters/${characterId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.character) { setChar(j.character.data ?? null); setName(j.character.name ?? '') } })
      .catch(() => {})
  }, [characterId, initialChar])

  const emit = useCallback(async (label: string, total: number | null, breakdown: string, crit = false, fumble = false) => {
    setLast({ label, total, breakdown, crit, fumble })
    await postRoll({ campaignId, sessionId, characterId, actorName: name, label, result: total ?? undefined, breakdown: breakdown || undefined, crit, fumble })
    ping()
  }, [campaignId, sessionId, characterId, name, ping])

  if (!char) return <p style={{ color: 'var(--hx-muted)', fontSize: 13 }}><span className={styles.spinner} style={{ display: 'inline-block', width: 14, height: 14, verticalAlign: 'middle', marginRight: 6 }} />Loading…</p>

  const level = char.meta?.level ?? 1
  const prof = char.profBonusOverride ?? 2 + Math.floor((level - 1) / 4)

  function check(k: AbilityKey, abbr: string) {
    const r: D20Roll = rollD20(mod(char!.abilities[k]))
    void emit(`${abbr} check`, r.total, r.breakdown, r.crit, r.fumble)
  }
  function save(k: AbilityKey, abbr: string) {
    const s = char!.saves?.[k]
    const m = mod(char!.abilities[k]) + (s?.proficient ? prof : 0) + (s?.misc ?? 0)
    const r: D20Roll = rollD20(m)
    void emit(`${abbr} save`, r.total, r.breakdown, r.crit, r.fumble)
  }
  function attackToHit(a: Character['attacks'][number]) {
    const m = mod(char!.abilities[a.ability]) + (a.proficient ? prof : 0) + (a.bonusToHit ?? 0)
    const r: D20Roll = rollD20(m)
    void emit(`${a.name} — to hit`, r.total, r.breakdown, r.crit, r.fumble)
  }
  function attackDamage(a: Character['attacks'][number]) {
    const bonus = mod(char!.abilities[a.ability]) + (a.bonusDamage ?? 0)
    const expr = bonus === 0 ? a.damage : `${a.damage}${fmt(bonus)}`
    const r = rollDamage(expr)
    void emit(`${a.name} — damage${a.damageType ? ` (${a.damageType})` : ''}`, r.total, r.breakdown)
  }
  // Quick-actions (G8) — skill-based ones roll a contest; declarative ones just
  // announce to the feed. Skill mods derive from the NPC's kit so they scale.
  function skillMod(skillKey: string) {
    const def = SKILLS.find((s) => s.key === skillKey)
    if (!def) return 0
    const st = char!.skills?.[skillKey]
    return mod(char!.abilities[def.ability]) + profContribution(st?.prof ?? 'none', prof) + (st?.misc ?? 0)
  }
  function rollAction(label: string, skillKey: string) {
    const r: D20Roll = rollD20(skillMod(skillKey))
    void emit(label, r.total, r.breakdown, r.crit, r.fumble)
  }
  function declareAction(action: string) {
    void emit(action, null, '')
  }

  const btn: React.CSSProperties = { padding: '4px 8px', fontSize: 12 }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className={styles.portrait} style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'var(--hx-gold-2)' }}>{(name || '?').charAt(0).toUpperCase()}</span>
        <span style={{ flex: 1, color: 'var(--hx-text)', fontSize: 15 }}>{name}</span>
        <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>AC {char.combat?.ac ?? 10}</span>
        <span style={{ fontSize: 12, color: 'var(--hx-teal-1)' }}>{char.combat?.currentHp ?? char.combat?.maxHp ?? '?'}/{char.combat?.maxHp ?? '?'} HP</span>
      </div>

      {last && (
        <div style={{ padding: '6px 10px', border: '1px solid var(--hx-gold-1)', background: 'rgba(200,155,60,0.1)', fontSize: 13 }}>
          <span style={{ fontFamily: 'var(--hx-font-display)', fontSize: 18, color: last.crit ? 'var(--hx-teal-1)' : last.fumble ? 'var(--hx-danger)' : 'var(--hx-gold-2)', marginRight: 8 }}>{last.total ?? '—'}</span>
          {last.label}{last.breakdown && <span style={{ color: 'var(--hx-muted)', fontFamily: 'var(--hx-font-mono, monospace)', fontSize: 11 }}> · {last.breakdown}</span>}
        </div>
      )}

      <div>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', color: 'var(--hx-muted)', marginBottom: 5 }}>CHECKS</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {ABILITIES.map((a) => (
            <button key={a.key} className={styles.hexBtn} style={btn} onClick={() => check(a.key as AbilityKey, a.label)}>{a.label} {fmt(mod(char!.abilities[a.key as AbilityKey]))}</button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', color: 'var(--hx-muted)', marginBottom: 5 }}>SAVES</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {ABILITIES.map((a) => {
            const s = char!.saves?.[a.key as AbilityKey]
            const m = mod(char!.abilities[a.key as AbilityKey]) + (s?.proficient ? prof : 0) + (s?.misc ?? 0)
            return <button key={a.key} className={`${styles.hexBtn} ${s?.proficient ? styles.hexBtnTeal : ''}`} style={btn} onClick={() => save(a.key as AbilityKey, a.label)}>{a.label} {fmt(m)}</button>
          })}
        </div>
      </div>

      {char.attacks?.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', color: 'var(--hx-muted)', marginBottom: 5 }}>ATTACKS</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {char.attacks.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--hx-text)' }}>{a.name}</span>
                <button className={styles.hexBtn} style={btn} onClick={() => attackToHit(a)}>Hit</button>
                <button className={styles.hexBtn} style={btn} onClick={() => attackDamage(a)}>Dmg</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', color: 'var(--hx-muted)', marginBottom: 5 }}>ACTIONS</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {['Dodge', 'Dash', 'Disengage', 'Help'].map((a) => (
            <button key={a} className={styles.hexBtn} style={btn} onClick={() => declareAction(a)}>{a}</button>
          ))}
          <button className={styles.hexBtn} style={btn} onClick={() => rollAction('Hide (Stealth)', 'stealth')}>Hide</button>
          <button className={styles.hexBtn} style={btn} onClick={() => rollAction('Grapple (Athletics)', 'athletics')}>Grapple</button>
          <button className={styles.hexBtn} style={btn} onClick={() => rollAction('Shove (Athletics)', 'athletics')}>Shove</button>
        </div>
      </div>
    </div>
  )
}
