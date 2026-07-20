'use client'
// SpellDetail — click a spell, read everything about it, and ask the AI about it.
//
// The sheet's spell card is a summary; this is the full read (owner 2026-07-19). Three things
// it does that the card cannot:
//
//  1. ENRICHES from the rules library. The sheet's own Spell record is the player's copy and
//     carries only what they (or the picker) filled in. Where the spell is catalogued we can
//     also show its material component, its class lists, and the 2024-vs-2014 note — the last
//     of which is exactly the detail that silently breaks a table.
//  2. Resolves the numbers AGAINST THIS CHARACTER: attack bonus, save DC, slot state. Those
//     come from the sheet's single sources (spellSaveDc, ledger spell_attack), never from
//     anything stored on the spell.
//  3. Asks the librarian about it — including situational rulings — through the SAME grounded
//     endpoint the library uses, with this character's id passed so it can reason about the
//     actual sheet rather than a generic caster.
import { useState } from 'react'
import { useChar } from '../../state/store'
import { useSheetSystem } from '../../state/sheetConfig'
import { findSpellForSystem } from '@/lib/dnd/spells'
import { abilityMod, signed } from '../../rules/dnd'
import { md } from '../../lib/inline'
import type { Spell } from '../../types'

export default function SpellDetail({ spell, onClose }: { spell: Spell; onClose: () => void }) {
  const { char, abilities, pb, ledger, castSpell, spellSaveDc, characterId } = useChar()
  const system = useSheetSystem()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  // The library's record for this spell, when it is catalogued. Matched by name because the
  // sheet copy may have been renamed or hand-authored; a miss just means less to show.
  const def = findSpellForSystem(system, spell.name)

  const ability = char.spellcasting?.ability
  const mod = ability ? abilityMod(abilities[ability]) : 0
  const attackBonus = ledger.value('spell_attack', pb + mod)
  const slot = spell.level > 0 ? char.spellcasting?.slots?.[spell.level as 1] : undefined

  const ask = async (q: string) => {
    const text = q.trim()
    if (!text || asking) return
    setAsking(true); setAnswer(null)
    try {
      const r = await fetch('/api/dnd/library/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // characterId lets the librarian reason about THIS sheet — "with my stats", "at my
        // level" — rather than answering for a generic caster.
        body: JSON.stringify({ question: `About the spell ${spell.name}: ${text}`, system, history: [], characterId }),
      })
      const j = await r.json().catch(() => ({}))
      setAnswer(r.ok ? (j.reply ?? 'No answer came back.') : (j.error ?? 'Could not reach the librarian.'))
    } catch {
      setAnswer('Could not reach the librarian.')
    } finally { setAsking(false) }
  }

  const stat = (k: string, v?: string | null) =>
    v ? <div key={k}><span style={{ color: 'var(--muted)', fontSize: 11 }}>{k}</span><div style={{ fontSize: 13 }}>{v}</div></div> : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(2,4,10,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(680px, 100%)', maxHeight: '88vh', overflowY: 'auto', background: 'var(--panel)', border: '1px solid var(--line-strong)', borderRadius: 12, padding: '16px 18px' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{spell.name}</h2>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}{spell.school ? ` · ${spell.school}` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn tiny" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
          {spell.concentration && <span className="tag">concentration</span>}
          {spell.ritual && <span className="tag">ritual</span>}
          {spell.alwaysPrepared && <span className="tag gold">always prepared</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, padding: '10px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
          {stat('Casting time', spell.castTime)}
          {stat('Range', spell.range)}
          {stat('Components', spell.components)}
          {stat('Duration', spell.duration)}
          {/* Only the library knows the material component's detail and cost. */}
          {def?.material ? stat('Material', def.material) : null}
        </div>

        {/* The numbers, resolved against THIS character — not stored on the spell. */}
        {(spell.attack || spell.save || spell.damage?.length || spell.heal) && (
          <div style={{ margin: '10px 0', padding: '8px 10px', borderRadius: 8, background: 'var(--panel-2)', fontSize: 13 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>WITH YOUR STATS</div>
            {spell.attack && <div>Spell attack <b style={{ color: 'var(--tealbright)' }}>{signed(attackBonus)}</b></div>}
            {spell.save && <div>{spell.save.ability.toUpperCase()} save vs DC <b style={{ color: 'var(--tealbright)' }}>{spellSaveDc}</b> — {spell.save.effect}</div>}
            {spell.damage?.map((d, i) => <div key={i}>Damage <b>{d.dice}</b> {d.type}</div>)}
            {spell.heal && <div>Heals <b>{spell.heal}</b>{ability ? ` + ${signed(mod)} (${ability.toUpperCase()})` : ''}</div>}
          </div>
        )}

        {spell.description && <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{md(spell.description)}</div>}
        {spell.higher && (
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}><b>At higher levels:</b> {spell.higher}</p>
        )}

        {/* Library extras — the class lists and the edition difference. */}
        {def && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
            <div>Class lists: {def.classes.join(', ')}</div>
            {def.editionNote && (
              <div style={{ marginTop: 4, color: '#e0a020' }}>
                <b>2024 vs 2014:</b> {def.editionNote}
              </div>
            )}
          </div>
        )}

        <div className="flex" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            className="btn tiny solid"
            disabled={spell.level > 0 && (!slot || slot.current <= 0)}
            onClick={() => { castSpell(spell); onClose() }}
            title={spell.level > 0 ? (slot && slot.current > 0 ? `Cast — spends a level-${spell.level} slot` : 'No slots left') : 'Cast (cantrip — free)'}
          >
            ✨ Cast{spell.level > 0 ? ` (L${spell.level})` : ''}
          </button>
        </div>

        {/* Ask the librarian — grounded, and aware of this character. */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>✦ ASK ABOUT THIS SPELL</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {['How does it work?', 'What are the common mistakes?', 'Can I use it while grappled?'].map((q) => (
              <button key={q} className="btn tiny" disabled={asking} onClick={() => { setQuestion(q); void ask(q) }}>{q}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={question} onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void ask(question) }}
              placeholder="Or ask your own — e.g. “what if two of us cast it at once?”"
              style={{ flex: 1, padding: '6px 10px', fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'inherit' }}
            />
            <button className="btn tiny solid" disabled={asking || !question.trim()} onClick={() => void ask(question)}>
              {asking ? '…' : 'Ask'}
            </button>
          </div>
          {answer && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--panel-2)', borderRadius: 8, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {answer}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
