'use client'
// SpellsPanel — the Spells tab (DND_SPELLS_AND_ABILITIES, Slice 3, read view). Shows the
// caster header (ability · save DC · attack bonus · prepared/cap), then cantrips + one section
// per spell level with slot pips, and a readable card per spell (stat line, description, typed
// damage / save / heal). Casting + prepare-toggle come in Slice 4. Theme-token styled → all skins.
import { useState } from 'react'
import { useChar } from '../state/store'
import { isItemActive } from '@/lib/dnd/effects/ledger'
import { abilityMod, profBonusForLevel, signed } from '../rules/dnd'
import { md } from '../lib/inline'
import SectionHead from './ui/SectionHead'
import ElementMenu from './ui/ElementMenu'
import SpellEditor from './ui/SpellEditor'
import type { Spell, SpellLevel } from '../types'

const ORDINAL = ['Cantrips', '1st Level', '2nd Level', '3rd Level', '4th Level', '5th Level', '6th Level', '7th Level', '8th Level', '9th Level']
const lab: React.CSSProperties = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }

function damageLine(s: Spell): string {
  const parts: string[] = []
  if (s.damage?.length) parts.push(s.damage.map((d) => `${d.dice} ${d.type}`).join(' + '))
  if (s.heal) parts.push(`heal ${s.heal}`)
  return parts.join(' · ')
}

export default function SpellsPanel() {
  const { char, setChar, editMode, canWrite, ledger, castSpell, setSpellSlot, restoreSpellSlots } = useChar()
  const [editing, setEditing] = useState<Spell | null>(null)
  const duplicate = (sp: Spell) =>
    setChar((c) => ({ ...c, spells: [...(c.spells ?? []), { ...sp, id: `${sp.id}-copy-${(c.spells ?? []).length}`, name: `${sp.name} (copy)` }] }))
  const remove = (sp: Spell) => {
    if (!confirm(`Delete “${sp.name}”? This cannot be undone.`)) return
    setChar((c) => ({ ...c, spells: (c.spells ?? []).filter((x) => x.id !== sp.id) }))
  }
  const sc = char.spellcasting
  const spells = char.spells ?? []

  // Spells GRANTED by an equipped item (Slice 11 grant-half) — a wand of Fireball. Read-only and
  // badged; works even for a non-caster (no `sc`), so the panel shows whenever there's a grant.
  const grantedSpells = (char.inventory ?? [])
    .filter((i) => isItemActive(i) && i.grantsSpell)
    .map((i) => ({ sp: i.grantsSpell as Spell, source: i.name }))

  function togglePrepared(id: string) {
    setChar((c) => ({ ...c, spells: (c.spells ?? []).map((s) => (s.id === id ? { ...s, prepared: !s.prepared } : s)) }))
  }

  // Show the tab if the character casts OR an item grants them a spell.
  if ((!sc || spells.length === 0) && grantedSpells.length === 0) return null

  const mod = sc ? abilityMod(char.abilities[sc.ability]) : 0
  const pb = profBonusForLevel(char.meta.level)
  // Route the DC + attack through the ledger (Slice 33) so an item that grants `spell_save_dc` /
  // `spell_attack` composes with the caster's own base — a Rod of the Pact Keeper's +1 DC lands on
  // top of 8+PB+mod rather than being ignored. `value(target, base)` respects the caller's base
  // (Slice 10's derived-target fix), so an unmodified caster is unchanged.
  const saveDC = ledger.value('spell_save_dc', char.combat.saveDCOverride ?? 8 + pb + mod)
  const attackBonus = ledger.value('spell_attack', pb + mod)
  const preparedCount = spells.filter((s) => s.prepared && !s.alwaysPrepared && s.level > 0).length

  // Levels present = any spell level OR any level with slots defined.
  const levels = sc ? [...new Set([...spells.map((s) => s.level), ...(sc.slots ? Object.keys(sc.slots).map(Number) as SpellLevel[] : [])])].sort((a, b) => a - b) : []

  return (
    <section id="spells">
      <SectionHead num="✨" title="Spellcasting" />

      {sc && spells.length > 0 && (
        <>
      {/* Caster header */}
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
          {[
            ['Ability', sc.ability.toUpperCase()],
            ['Spell Save DC', String(saveDC)],
            ['Spell Attack', signed(attackBonus)],
            ['Prepared', sc.preparedCap ? `${preparedCount} / ${sc.preparedCap}` : String(preparedCount)],
          ].map(([k, v]) => (
            <div key={k} style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={lab}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--hotpink)', fontFamily: 'var(--font-mono)' }}>{v}</div>
            </div>
          ))}
        </div>
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            Domain/feat spells are always prepared and don’t count against the cap. Cantrips are always available.
          </p>
          {canWrite && <button className="btn tiny solid" onClick={restoreSpellSlots} title="Restore every spell slot (e.g. after a long rest)">↻ Restore slots</button>}
        </div>
      </div>

      {levels.map((lvl) => {
        const atLevel = spells.filter((s) => s.level === lvl)
        const slot = lvl > 0 ? sc.slots?.[lvl as 1] : undefined
        return (
          <div className="card" key={lvl}>
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>{ORDINAL[lvl]}</h3>
              {slot && (
                <div className="flex" style={{ gap: 4, alignItems: 'center' }} title={canWrite ? 'Click a pip to spend or restore a slot' : `${slot.current} of ${slot.max} slots left`}>
                  <span style={{ ...lab, marginRight: 4 }}>Slots</span>
                  {Array.from({ length: slot.max }).map((_, i) => (
                    <span
                      key={i}
                      className={`pip ${i < slot.current ? 'filled' : ''}`}
                      style={canWrite ? { cursor: 'pointer' } : undefined}
                      onClick={canWrite ? () => setSpellSlot(lvl, i < slot.current ? i : i + 1) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {atLevel.map((s) => (
                <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px', background: 'var(--panel-2)' }}>
                  <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 800, color: 'var(--ink)' }}>
                      {s.name}
                      {s.alias && <span style={{ fontSize: 12, color: 'var(--violet)', marginLeft: 6 }}>“{s.alias}”</span>}
                      {canWrite && (
                        <ElementMenu
                          label={s.name}
                          actions={[
                            { label: 'Edit spell', onClick: () => setEditing(s) },
                            { label: 'Duplicate', onClick: () => duplicate(s) },
                            { label: 'Delete', danger: true, onClick: () => remove(s) },
                          ]}
                        />
                      )}
                    </div>
                    <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {s.concentration && <span className="tag">conc</span>}
                      {s.ritual && <span className="tag">ritual</span>}
                      {s.alwaysPrepared ? <span className="tag gold">always</span> : s.prepared && s.level > 0 ? <span className="tag teal">prepared</span> : null}
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0 4px' }}>
                    {[s.school, s.castTime, s.range, s.components, s.duration].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink)' }}>{md(s.description)}</div>
                  {(damageLine(s) || s.attack || s.save) && (
                    <div style={{ fontSize: 12, marginTop: 5, color: 'var(--tealbright)', fontWeight: 700 }}>
                      {s.attack && <span>Spell attack {signed(attackBonus)} · </span>}
                      {s.save && <span>{s.save.ability.toUpperCase()} save DC {saveDC} · </span>}
                      {damageLine(s)}
                    </div>
                  )}
                  {s.higher && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Higher levels: {s.higher}</div>}
                  <div className="flex" style={{ gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                    <button
                      className="btn tiny solid"
                      disabled={s.level > 0 && (!slot || slot.current <= 0)}
                      onClick={() => castSpell(s)}
                      title={s.level > 0 ? (slot && slot.current > 0 ? `Cast — spends a level-${s.level} slot` : 'No slots left') : 'Cast (cantrip — free)'}
                    >
                      ✨ Cast{s.level > 0 ? ` (L${s.level})` : ''}
                    </button>
                    {editMode && s.level > 0 && !s.alwaysPrepared && (
                      <button className={`btn tiny ${s.prepared ? 'active' : ''}`} onClick={() => togglePrepared(s.id)}>
                        {s.prepared ? '✓ Prepared' : 'Prepare'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {atLevel.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No spells known at this level yet.</div>}
            </div>
          </div>
        )
      })}
        </>
      )}

      {/* Spells granted by an equipped item (Slice 11). Read-only and badged — a non-caster granted
          a spell still sees it. Casting from granted slots is a follow-up. */}
      {grantedSpells.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Granted Spells</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {grantedSpells.map(({ sp, source }, gi) => (
              <div key={`granted-${source}-${sp.id}-${gi}`} style={{ border: '1px solid var(--tealbright)', borderRadius: 10, padding: '9px 11px', background: 'var(--panel-2)' }}>
                <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 800, color: 'var(--ink)' }}>
                    {sp.name}
                    <span className="tag" style={{ marginLeft: 8, color: 'var(--tealbright)' }}>{sp.level === 0 ? 'cantrip' : `L${sp.level}`}</span>
                  </div>
                  <span className="tag" style={{ color: 'var(--tealbright)' }} title={`Granted by ${source}`}>granted · {source}</span>
                </div>
                {[sp.school, sp.range, sp.components, sp.duration].filter(Boolean).length > 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0 4px' }}>
                    {[sp.school, sp.range, sp.components, sp.duration].filter(Boolean).join(' · ')}
                  </div>
                )}
                {sp.description && <div style={{ fontSize: 13, color: 'var(--ink)' }}>{md(sp.description)}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && <SpellEditor spell={editing} onClose={() => setEditing(null)} />}
    </section>
  )
}
