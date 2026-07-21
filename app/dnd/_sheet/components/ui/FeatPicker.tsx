'use client'
// FeatPicker — add a feat to the sheet from the library, under the character's OWN edition's rules.
//
// S9 of DND_2024_COMPLETE_LIBRARY_2026-07-20. Spells got a picker; feats had none, so the only
// way onto a sheet was hand-typing a feature — which loses the feat's real benefit text and its
// ability increase, and silently allows anything.
//
// RULES-LEGAL BY DEFAULT. The repo's standing rule is that builders offer only what a character
// may legally take at the right slot and level, with custom as the EXPLICIT escape hatch — so
// this runs every feat through the gate and states the reason when one is barred. Ineligible
// feats are shown greyed with their reason rather than hidden: "why can't I take Grappler?" is a
// question the sheet should answer, and hiding it just makes the list look arbitrary. Taking one
// anyway is possible but deliberate, and marked.
//
// SYSTEM-SCOPED SINCE 14-S6a (2026-07-21). This picker used to hard-code `FEATS_2024` and judge
// with the 2024-typed `featEligibility`, so a 2014 character was told "No feat library for this
// game system yet" — while a real 2014 catalog and a real 2014 gate both sat one import away.
// 14-S6b had already built `featEligibilityForSystem` and wired it into every WRITE path; the
// picker was the read path nobody wired, which is this codebase's most familiar defect.
//
// Both halves now dispatch on the character's system: `featCatalogForSystem` for the list and the
// slot options, `featEligibilityForSystem` for the verdict. The two must agree about which system
// is in play, so both are given the same `system` value from one place.
import { useMemo, useState } from 'react'
import { useChar } from '../../state/store'
import { useSheetSystem } from '../../state/sheetConfig'
import { featCatalogForSystem, featCatalogNote, featSlotsForSystem, type PickerFeat } from '@/lib/dnd/feats/catalog'
import { featEligibilityForSystem, type FeatSlot } from '@/lib/dnd/feats/eligibility'
import type { AbilityKey } from '../../rules/dnd'

export default function FeatPicker({ onClose }: { onClose: () => void }) {
  const { char, setChar, isDM, variantKind } = useChar()
  // A VANILLA character is hard-blocked from an ineligible feat; a custom one may take it and is
  // told what it is doing (owner 2026-07-20). This picker previously offered "＋ Anyway" to
  // everyone, which made "rules-legal by default" a suggestion rather than a rule.
  const isVanilla = variantKind === 'vanilla'
  const system = useSheetSystem()
  const [q, setQ] = useState('')

  // The system's own catalog and its own slot model. 2014 offers ONE slot (a feat replaces an ASI);
  // 2024 offers three tracks. Defaulting the selection to the first slot the SYSTEM offers, rather
  // than to a hard-coded 'origin', is what stops a 2014 sheet opening on a track its edition has no
  // concept of.
  const slots = useMemo(() => featSlotsForSystem(system), [system])
  const pool = useMemo(() => featCatalogForSystem(system), [system])
  const [slot, setSlot] = useState<FeatSlot | null>(null)
  const activeSlot: FeatSlot = slot ?? slots[0]?.id ?? 'asi'

  const ctx = useMemo(() => ({
    slot: activeSlot,
    level: char.meta.level,
    abilities: char.abilities as Partial<Record<AbilityKey, number>>,
    // Names, not keys. Each system's gate resolves them against ITS OWN catalog, which is exactly
    // what stops this component having to know which catalog is live — and it matches how the
    // sheet actually stores a taken feat (as a feature whose name is the feat's name).
    takenFeatureNames: (char.features ?? []).map((x) => x.name),
    // 2014 needs the class: a 2014 feat is legal precisely at the levels that class grants an ASI.
    // 2024's rule ignores it, so passing it always is harmless and passing it never is not.
    className: char.meta.className,
    has: (char.spells?.length ?? 0) > 0 || char.spellcasting?.ability ? ['spellcasting'] : [],
  }), [activeSlot, char.meta.level, char.meta.className, char.abilities, char.features, char.spells, char.spellcasting])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return pool
      .filter((f) => !needle || f.name.toLowerCase().includes(needle) || f.benefit.toLowerCase().includes(needle))
      .map((f) => ({ feat: f, elig: featEligibilityForSystem(system, f.key, ctx) }))
      // Eligible first, so the list opens on what you can actually take.
      .sort((a, b) => Number(b.elig.ok) - Number(a.elig.ok) || a.feat.name.localeCompare(b.feat.name))
  }, [pool, q, ctx, system])

  const add = (f: PickerFeat) => {
    const elig = featEligibilityForSystem(system, f.key, ctx)
    // Re-checked here, not only on the button: `disabled` is an affordance, not an enforcement
    // point.
    if (isVanilla && !elig.ok && !isDM) return
    const offRules = elig.ok ? undefined : (isDM ? `granted by the DM — ${elig.reason}` : elig.reason)
    setChar((c) => ({
      ...c,
      features: [...(c.features ?? []), {
        id: `${f.key}-${(c.features ?? []).length}`,
        name: f.name,
        // From the catalog, per system: "General feat" is 2024 phrasing, and a 2014 sheet should
        // say what 2014 calls it.
        source: f.sourceLabel,
        body: [f.benefit],
        unlockLevel: c.meta.level,
        ...(offRules ? { offRules } : {}),
      }],
    }))
  }

  const already = (f: PickerFeat) => (char.features ?? []).some((x) => x.name === f.name)

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
          // The note is per-system because the two empty cases are NOT the same: a 5e catalog is
          // complete at whatever our licensed sources publish, while PF2 and IG simply do not use
          // this feat model at all. "No feat library yet" implies unfinished work, and is wrong in
          // both cases.
          <div style={{ padding: 20, color: 'var(--muted)', fontSize: 14 }}>
            {featCatalogNote(system)}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* In 2024 the slot decides which CATEGORY is legal — an Origin feat can't come from
                  an ASI. 2014 has one slot, so the control renders only when there is a choice to
                  make; a single-option dropdown is a decision the player does not have. */}
              {slots.length > 1 && (
                <select
                  value={activeSlot} onChange={(e) => setSlot(e.target.value as FeatSlot)} aria-label="Feat slot"
                  style={{ padding: '6px 8px', fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'inherit' }}
                >
                  {slots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              )}
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search feats…"
                style={{ flex: 1, minWidth: 160, padding: '6px 10px', fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'inherit' }}
              />
            </div>
            <div style={{ padding: '6px 14px 0', fontSize: 11.5, color: 'var(--muted)' }}>
              {slots.find((s) => s.id === activeSlot)?.hint}
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
                      {feat.name}
                      {/* Only where the system HAS categories. 2014 feats are one undifferentiated
                          list, so labelling them would invent a 2024 structure on a 2014 sheet. */}
                      {feat.categoryLabel && (
                        <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12, marginLeft: 6 }}>{feat.categoryLabel}</span>
                      )}
                      {feat.prerequisiteText && (
                        <span className="tag" style={{ marginLeft: 6, color: 'var(--muted)' }}>{feat.prerequisiteText}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, marginTop: 2 }}>{feat.summary ?? feat.benefit}</div>
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
