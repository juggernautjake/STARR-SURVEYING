'use client'
// FeatPicker — add a 2024 feat to the sheet from the library, respecting the rules.
//
// S9 of DND_2024_COMPLETE_LIBRARY_2026-07-20. Spells got a picker; feats had none, so the only
// way onto a sheet was hand-typing a feature — which loses the feat's real benefit text and its
// ability increase, and silently allows anything.
//
// RULES-LEGAL BY DEFAULT. The repo's standing rule is that builders offer only what a character
// may legally take at the right slot and level, with custom as the EXPLICIT escape hatch — so
// this runs every feat through `featEligibility` and states the reason when one is barred.
// Ineligible feats are shown greyed with their reason rather than hidden: "why can't I take
// Grappler?" is a question the sheet should answer, and hiding it just makes the list look
// arbitrary. Taking one anyway is possible but deliberate, and marked.
import { useMemo, useState } from 'react'
import { useChar } from '../../state/store'
import { useSheetSystem } from '../../state/sheetConfig'
import { FEATS_2024, type Feat, type FeatCategory } from '@/lib/dnd/feats/dnd5e-2024'
import { featEligibility, type FeatSlot } from '@/lib/dnd/feats/eligibility'
import type { AbilityKey } from '../../rules/dnd'

const SLOTS: { id: FeatSlot; label: string; hint: string }[] = [
  { id: 'origin', label: 'Origin', hint: 'From your background at level 1. Grants no ability increase.' },
  { id: 'fighting-style', label: 'Fighting Style', hint: 'From a martial class feature. Grants no ability increase.' },
  { id: 'asi', label: 'ASI / Epic Boon', hint: 'At an Ability Score Improvement level. General feats grant +1 to an ability.' },
]

const CATEGORY_LABEL: Record<FeatCategory, string> = {
  origin: 'Origin',
  general: 'General',
  'fighting-style': 'Fighting Style',
  'epic-boon': 'Epic Boon',
}

export default function FeatPicker({ onClose }: { onClose: () => void }) {
  const { char, setChar, isDM, variantKind } = useChar()
  // A VANILLA character is hard-blocked from an ineligible feat; a custom one may take it and is
  // told what it is doing (owner 2026-07-20). This picker previously offered "＋ Anyway" to
  // everyone, which made "rules-legal by default" a suggestion rather than a rule.
  const isVanilla = variantKind === 'vanilla'
  const system = useSheetSystem()
  const [slot, setSlot] = useState<FeatSlot>('origin')
  const [q, setQ] = useState('')

  // Feats are 2024-only content. Any other system gets an honest empty state rather than
  // another edition's feat list.
  const pool = system === 'dnd5e-2024' ? FEATS_2024 : []

  const ctx = useMemo(() => ({
    slot,
    level: char.meta.level,
    abilities: char.abilities as Partial<Record<AbilityKey, number>>,
    // Match on NAME because the sheet stores features, not feat keys — a feat added earlier
    // exists as a feature whose name is the feat's name.
    takenFeatKeys: FEATS_2024.filter((f) => (char.features ?? []).some((x) => x.name === f.name)).map((f) => f.key),
    has: (char.spells?.length ?? 0) > 0 || char.spellcasting?.ability ? ['spellcasting'] : [],
  }), [slot, char.meta.level, char.abilities, char.features, char.spells, char.spellcasting])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return pool
      .filter((f) => !needle || f.name.toLowerCase().includes(needle) || f.benefit.toLowerCase().includes(needle))
      .map((f) => ({ feat: f, elig: featEligibility(f, ctx) }))
      // Eligible first, so the list opens on what you can actually take.
      .sort((a, b) => Number(b.elig.ok) - Number(a.elig.ok) || a.feat.name.localeCompare(b.feat.name))
  }, [pool, q, ctx])

  const add = (f: Feat) => {
    const elig = featEligibility(f, ctx)
    // Re-checked here, not only on the button: `disabled` is an affordance, not an enforcement
    // point.
    if (isVanilla && !elig.ok && !isDM) return
    const offRules = elig.ok ? undefined : (isDM ? `granted by the DM — ${elig.reason}` : elig.reason)
    setChar((c) => ({
      ...c,
      features: [...(c.features ?? []), {
        id: `${f.key}-${(c.features ?? []).length}`,
        name: f.name,
        source: `${CATEGORY_LABEL[f.category]} feat`,
        body: [f.benefit],
        unlockLevel: c.meta.level,
        ...(offRules ? { offRules } : {}),
      }],
    }))
  }

  const already = (f: Feat) => (char.features ?? []).some((x) => x.name === f.name)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(2,4,10,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(720px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid var(--line-strong)', borderRadius: 12, overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
          <strong style={{ flex: 1 }}>{isDM ? 'Grant a feat' : 'Add a feat from the library'}</strong>
          <button className="btn tiny" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {pool.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--muted)', fontSize: 14 }}>
            No feat library for this game system yet. You can still add one by hand as a feature.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* The slot decides which CATEGORY is legal — an Origin feat can't come from an ASI. */}
              <select
                value={slot} onChange={(e) => setSlot(e.target.value as FeatSlot)} aria-label="Feat slot"
                style={{ padding: '6px 8px', fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'inherit' }}
              >
                {SLOTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search feats…"
                style={{ flex: 1, minWidth: 160, padding: '6px 10px', fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'inherit' }}
              />
            </div>
            <div style={{ padding: '6px 14px 0', fontSize: 11.5, color: 'var(--muted)' }}>
              {SLOTS.find((s) => s.id === slot)?.hint}
            </div>

            <div style={{ overflowY: 'auto', padding: '8px 14px 14px' }}>
              {results.map(({ feat, elig }) => {
                // The DM is never blocked — granting a feat a character could not normally take
                // is a legitimate DM act.
                const blocked = isVanilla && !elig.ok && !isDM
                return (
                <div key={feat.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--line)', opacity: elig.ok ? 1 : 0.6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {feat.name}{' '}
                      <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>{CATEGORY_LABEL[feat.category]}</span>
                      {feat.abilityIncrease && (
                        <span className="tag" style={{ marginLeft: 6, color: 'var(--tealbright)' }}>+{feat.abilityIncrease.amount} ability</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, marginTop: 2 }}>{feat.benefit}</div>
                    {/* Why it's barred — the question the sheet should answer rather than hide. */}
                    {!elig.ok && (
                      <div style={{ fontSize: 11.5, color: blocked ? 'var(--danger)' : '#e0a020', marginTop: 3 }}>
                        {blocked ? '✕' : '⚠'} {elig.reason}
                      </div>
                    )}
                  </div>
                  <button
                    className={`btn tiny ${elig.ok && !already(feat) ? 'solid' : ''}`}
                    onClick={() => add(feat)}
                    disabled={blocked}
                    title={
                      blocked ? `Not available: ${elig.reason} (this is a vanilla character — build a custom one to take it anyway)`
                        : already(feat) ? `${feat.name} is already on this sheet — adding again makes a second copy`
                          : elig.ok ? `Add ${feat.name}`
                            : `Not legal here: ${elig.reason} — adding anyway is a deliberate override`
                    }
                    style={blocked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  >
                    {blocked ? '✕ Blocked' : already(feat) ? '＋ again' : elig.ok ? '＋ Add' : '＋ Anyway'}
                  </button>
                </div>
                )
              })}
              {results.length === 0 && (
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: '12px 0' }}>Nothing matches that search.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
