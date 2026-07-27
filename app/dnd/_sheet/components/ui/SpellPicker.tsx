'use client'
// SpellPicker — add a spell to the sheet FROM THE RULES LIBRARY.
//
// The 2024 catalog (lib/dnd/spells) was reachable by the AI but not by the player: adding a
// spell still meant hand-typing its level, school, casting time, range, components and
// duration, which is both tedious and how a sheet ends up with a Fireball that has the wrong
// range. This picker searches the catalog and drops in a fully-populated spell (owner
// 2026-07-19). Hand-authoring is untouched — the editor is still there for homebrew.
//
// Scoped to the sheet's own system through `spellsForSystem`, so a 2014 or PF2 sheet gets an
// empty catalog and an honest message rather than another edition's numbers.
import { useMemo, useState } from 'react'
import { useChar } from '../../state/store'
import { useSheetSystem } from '../../state/sheetConfig'
import { spellsForSystem, spellCatalog, type SpellDef, type SpellClass } from '@/lib/dnd/spells'
import { spellEligibility } from '@/lib/dnd/spells/eligibility'
import { spellCountsFor } from '@/lib/dnd/spells/counts'
import { logManualEdit } from '../../lib/log-edit'
import { isRulesEnforcedKind, type SheetVariantKind } from '@/lib/dnd/system-variants'
import type { Spell, SpellLevel } from '../../types'

/** Turn a catalog entry into a sheet spell. The catalog holds the MECHANICS; the sheet copy is
 *  the player's own (they can then edit it freely without touching the library).
 *
 *  `offRules` carries WHY the pick was outside the character's class and level — set when a
 *  custom character takes something a vanilla one could not, so the sheet keeps a record rather
 *  than letting it pass as a normal class pick. */
export function spellFromCatalog(def: SpellDef, existingCount: number, offRules?: string): Spell {
  return {
    ...(offRules ? { offRules } : {}),
    id: `${def.key}-${existingCount}`,
    name: def.name,
    level: def.level as SpellLevel,
    school: def.school,
    castTime: def.castTime,
    range: def.range,
    components: def.components + (def.material ? ` (${def.material})` : ''),
    duration: def.duration,
    concentration: def.concentration,
    ritual: def.ritual,
    description: def.summary,
    higher: def.higher,
    prepared: false,
    // Structured resolution — this is what lets the sheet ROLL the spell rather than only
    // display it. The attack bonus and save DC are NOT copied: the sheet derives those from
    // the character (proficiency + spellcasting ability, ledger-overlaid), so a catalogued
    // spell automatically uses whoever is holding it.
    attack: def.attack,
    save: def.save,
    damage: def.damage,
    heal: def.heal,
  }
}

export default function SpellPicker({ onClose }: { onClose: () => void }) {
  const { char, setChar, isDM, variantKind, characterId } = useChar()
  const system = useSheetSystem()
  const [q, setQ] = useState('')
  const [level, setLevel] = useState<number | 'all'>('all')

  const catalog = useMemo(() => spellsForSystem(system), [system])
  const status = useMemo(() => spellCatalog(system), [system])
  // Names already on the sheet — so the list can mark them rather than silently adding a second copy.
  const have = useMemo(
    () => new Set((char.spells ?? []).map((s) => s.name.trim().toLowerCase())),
    [char.spells],
  )

  // The character's class, matched against the catalog's class lists. Defaults the picker to
  // spells this character can actually learn, which is the difference between a usable list
  // and 357 undifferentiated rows.
  const charClass = useMemo(() => {
    const raw = (char.meta.className ?? '').trim().toLowerCase()
    return (['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'] as SpellClass[])
      .find((c) => c.toLowerCase() === raw) ?? null
  }, [char.meta.className])
  const [onlyMyClass, setOnlyMyClass] = useState(true)

  // The highest spell level this character can currently cast, from their OWN slot table. Used
  // as an override so a multiclass or DM-adjusted sheet is judged on what it actually has,
  // rather than on what its class alone would grant.
  const maxCastable = useMemo(() => {
    const slots = char.spellcasting?.slots ?? {}
    const levels = Object.entries(slots)
      .filter(([, v]) => (v?.max ?? 0) > 0)
      .map(([k]) => Number(k))
    return levels.length ? Math.max(...levels) : 0
  }, [char.spellcasting])

  // Rules eligibility, from the shared core. A VANILLA character is hard-blocked from anything
  // ineligible; a CUSTOM one may take it and is told what it is doing (owner 2026-07-20).
  const eligCtx = useMemo(() => ({
    system,
    className: char.meta.className,
    level: char.meta.level,
    // Spells already on the sheet count as granted, so a subclass or DM gift the character
    // already holds never reads as illegal on a second look.
    extraSpells: (char.spells ?? []).map((s) => s.name),
    ...(maxCastable > 0 ? { maxSpellLevel: maxCastable } : {}),
  }), [system, char.meta.className, char.meta.level, char.spells, maxCastable])

  // Enforced for altered-vanilla too — see `isRulesEnforcedKind` and the note in FeatPicker.
  const isVanilla = isRulesEnforcedKind(variantKind as SheetVariantKind)

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return catalog
      .filter((s) => (level === 'all' || s.level === level))
      .filter((s) => !onlyMyClass || !charClass || s.classes.includes(charClass))
      .filter((s) => !needle || s.name.toLowerCase().includes(needle) || s.school.toLowerCase().includes(needle))
      .slice(0, 80)
  }, [catalog, q, level, onlyMyClass, charClass])

  // ── How many this class actually grants (slot plan S7b) ──────────────────────────────────────────
  //
  // WHICH count applies to THIS list is the whole subtlety, and getting it wrong breaks every preparer:
  //
  //  · CANTRIPS are a known list in both editions and for every class, so `cantripsKnown` caps the sheet
  //    list directly. A level-1 Bard gets two, not the whole cantrip catalog.
  //  · LEVELLED spells are a known list only for a KNOWING class (2014 Bard/Sorcerer/Warlock/Ranger).
  //    For a PREPARER, `spellsKnown` is the PREPARED count — and this list is not the prepared list. A
  //    Wizard's spellbook and a Cleric's access to the entire Cleric list are both far larger than the
  //    number they prepare. Capping this list by that number would refuse spells the class plainly has.
  //    A preparer's cap belongs on the prepared TOGGLE instead, which is where SpellsPanel applies it.
  //
  // Always-prepared spells (domain, oath, subclass grants) are excluded because every class's own rule
  // text says they "never count against this number".
  const counts = useMemo(
    () => spellCountsFor(system, char.meta.className, char.meta.level),
    [system, char.meta.className, char.meta.level],
  )
  const onSheet = char.spells ?? []
  const cantripsHeld = onSheet.filter((s) => s.level === 0 && !s.alwaysPrepared).length
  const knownHeld = onSheet.filter((s) => s.level > 0 && !s.alwaysPrepared).length

  /** Is this specific pick over the class's count? Never true for a preparer's levelled spells. */
  const overCount = (def: SpellDef): string | null => {
    if (def.level === 0) {
      return counts.cantripsKnown != null && cantripsHeld >= counts.cantripsKnown
        ? `your class grants ${counts.cantripsKnown} cantrip${counts.cantripsKnown === 1 ? '' : 's'} at level ${char.meta.level}`
        : null
    }
    if (counts.prepares || counts.spellsKnown == null) return null
    return knownHeld >= counts.spellsKnown
      ? `your class knows ${counts.spellsKnown} spell${counts.spellsKnown === 1 ? '' : 's'} at level ${char.meta.level}`
      : null
  }

  const add = (def: SpellDef) => {
    const elig = spellEligibility(def, eligCtx)
    // Belt and braces: the button is already disabled, but a blocked spell must not be addable
    // by any path through this component — a disabled attribute is a UI affordance, not a rule.
    if (isVanilla && !elig.ok && !isDM) return
    if (isVanilla && !isDM && overCount(def)) return
    const reason = elig.ok ? undefined : (isDM ? `granted by the DM — ${elig.reason}` : elig.reason)
    // AUDIT: learning a spell is a build change. Same gap the feat picker had — a direct `setChar` reaching
    // no element editor, so the DM's review queue never saw a spell arrive. `spell.<name>` matches
    // `SpellEditor`'s vocabulary so both read alike in the queue.
    logManualEdit(characterId, `spell.${def.name}`, null, def.name)
    setChar((c) => ({ ...c, spells: [...(c.spells ?? []), spellFromCatalog(def, (c.spells ?? []).length, reason)] }))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(2,4,10,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(720px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid var(--line-strong)', borderRadius: 12, overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
          {/* The DM holds write access on a player's sheet, so this same picker is how they hand
              out a spell — the wording just says so, rather than leaving them to guess. */}
          <strong style={{ flex: 1 }}>
            {isDM ? `Grant a spell to ${char.meta.name || 'this character'}` : 'Add a spell from the library'}
          </strong>
          <button className="btn tiny" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {isDM && (
          <div style={{ padding: '6px 14px', fontSize: 11.5, color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>
            Anything you add lands on their sheet immediately — off-list and above-slot spells are
            allowed on purpose, so you can hand out something they could not normally learn.
          </div>
        )}
        {/* The budget, stated up front. A cap the player only discovers by being refused reads as a bug;
            the same number shown while they choose reads as a rule. */}
        {!isDM && (counts.cantripsKnown != null || (!counts.prepares && counts.spellsKnown != null)) && (
          <div style={{ padding: '6px 14px', fontSize: 11.5, color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>
            {counts.cantripsKnown != null && <>Cantrips {cantripsHeld}/{counts.cantripsKnown}</>}
            {counts.cantripsKnown != null && !counts.prepares && counts.spellsKnown != null && ' · '}
            {!counts.prepares && counts.spellsKnown != null && <>Spells known {knownHeld}/{counts.spellsKnown}</>}
            {counts.prepares && <> · this class PREPARES from its list, so the number it prepares is capped on the sheet, not here</>}
          </div>
        )}

        {catalog.length === 0 ? (
          // Honest empty state: this system has no catalogued spells, which is NOT the same as
          // "this system has no spells". Never show another edition's list here.
          <div style={{ padding: 20, color: 'var(--muted)', fontSize: 14 }}>
            No spell library for this game system yet. You can still add a spell by hand with the
            spell editor.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or school…"
                style={{ flex: 1, minWidth: 180, padding: '6px 10px', fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'inherit' }}
              />
              <select
                value={String(level)} onChange={(e) => setLevel(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                aria-label="Filter by level"
                style={{ padding: '6px 8px', fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'inherit' }}
              >
                <option value="all">All levels</option>
                <option value="0">Cantrips</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => <option key={l} value={l}>Level {l}</option>)}
              </select>
              {charClass && (
                <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--ink)' }}>
                  <input type="checkbox" checked={onlyMyClass} onChange={(e) => setOnlyMyClass(e.target.checked)} />
                  {charClass} list only
                </label>
              )}
            </div>

            <div style={{ overflowY: 'auto', padding: '8px 14px 14px' }}>
              {results.length === 0 && (
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: '12px 0' }}>
                  Nothing matches. The library holds the commonly-played spells — if yours isn’t here yet,
                  add it by hand and it will work exactly the same.
                </p>
              )}
              {results.map((s) => {
                const already = have.has(s.name.toLowerCase())
                // One decision, from the shared core — replacing the ad-hoc off-list / too-high
                // checks this used to do inline, so the picker, the grant path and the AI all
                // agree on what is legal.
                const elig = spellEligibility(s, eligCtx)
                // The DM is never blocked: granting a spell a character could not normally take
                // is a legitimate DM act, and blocking it would make their job impossible.
                const full = isVanilla && !isDM ? overCount(s) : null
                const blocked = (isVanilla && !elig.ok && !isDM) || !!full
                return (
                  <div key={s.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                        {s.name}{' '}
                        <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>
                          {s.level === 0 ? 'cantrip' : `level ${s.level}`} · {s.school}
                          {s.concentration ? ' · concentration' : ''}{s.ritual ? ' · ritual' : ''}
                        </span>
                        {!elig.ok && (
                          <span className="tag" style={{ marginLeft: 6, color: blocked ? 'var(--danger-ink, var(--danger))' : '#e0a020' }} title={elig.reason}>
                            {blocked ? 'not available' : 'off-rules'}
                          </span>
                        )}
                        {/* Separate word from "not available": this spell IS legal for the character, they
                            have simply used the number their class grants. Saying the same thing for both
                            would send a player hunting for a prerequisite that is not the problem. */}
                        {elig.ok && full && (
                          <span className="tag" style={{ marginLeft: 6, color: '#e0a020' }} title={full}>
                            no room
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '1px 0 3px' }}>
                        {s.castTime} · {s.range} · {s.components} · {s.duration}
                      </div>
                      <div style={{ fontSize: 12.5 }}>{s.summary}</div>
                    </div>
                    <button
                      className={`btn tiny ${already || blocked ? '' : 'solid'}`}
                      onClick={() => add(s)}
                      // HARD BLOCK for a vanilla character. The row still renders, greyed, with
                      // its reason — "why can't I take this?" is a question the sheet should
                      // answer, and hiding the spell just makes the list look arbitrary.
                      disabled={blocked}
                      title={
                        full ? `No room: ${full}. Remove one first, or switch this character to Custom.`
                          : blocked ? `Not available: ${elig.reason} (this is a vanilla character — build a custom one to take it anyway)`
                            : already ? `${s.name} is already on this sheet — adding again makes a second copy`
                              : !elig.ok ? `Off-rules: ${elig.reason} — allowed because this character is custom`
                                : `Add ${s.name}`
                      }
                      style={blocked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                    >
                      {full ? '✕ No room' : blocked ? '✕ Blocked' : already ? '＋ again' : !elig.ok ? '＋ Anyway' : '＋ Add'}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* The catalog knows it is partial; say so here rather than letting a missing spell
                read as "this spell does not exist". */}
            {!status.complete && (
              <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--muted)' }}>
                {catalog.length} spells catalogued so far — not the full list yet. Anything missing can be added by hand.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
