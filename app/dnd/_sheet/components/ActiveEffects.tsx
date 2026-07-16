'use client'
// ActiveEffects — everything currently modifying this character (Slice 12).
//
// The scenario this exists for, from the request verbatim: a character drinks a potion that makes
// them super strong for 12 hours, forgets to end it, comes back next session strong and doesn't
// know why. Without this panel that state is invisible and the sheet quietly lies.
//
// It is a READ of the effect ledger — it re-derives nothing. It used to format effects with its
// own local `fmtEffect` and list equipped items by hand, which is the exact drift the ledger
// exists to prevent: two places computing "what is this item doing to me" WILL disagree, and the
// sheet has no way to say which is right. Now the ★ tooltips, this panel and the builder preview
// all render through one describeEffect.
//
// Mounted above the tabs in App, so it is on EVERY template.
import { useMemo } from 'react'
import { useChar } from '../state/store'
import type { Contribution, SourceKind } from '@/lib/dnd/effects/ledger'

/** How each kind of source is labelled, and the verb for ending it. */
const KIND_META: Record<SourceKind, { label: string; end: string; hint: string }> = {
  form: { label: 'Form', end: 'End form', hint: 'Leave this form.' },
  consumed: { label: 'Consumed', end: 'End effect', hint: 'End this effect. The item itself was used up when you took it.' },
  spell: { label: 'Spell', end: 'End effect', hint: 'End this spell effect.' },
  condition: { label: 'Condition', end: 'End effect', hint: 'Clear this condition.' },
  dm: { label: 'DM boon', end: 'End effect', hint: 'End this boon.' },
  attuned: { label: 'Attuned', end: 'Unequip', hint: 'Take it off — an item cannot be worn but switched "off".' },
  item: { label: 'Worn', end: 'Unequip', hint: 'Take it off — an item cannot be worn but switched "off".' },
  // A class/species feature is not something you "end" — it is what the character IS.
  feature: { label: 'Feature', end: '', hint: '' },
}

const ORDER: SourceKind[] = ['form', 'consumed', 'spell', 'condition', 'dm', 'attuned', 'item', 'feature']

interface SourceRow {
  id: string
  name: string
  kind: SourceKind
  contributions: Contribution[]
}

export default function ActiveEffects() {
  const { char, ledger, canWrite, setChar, removeActiveEffect } = useChar()

  // Group by SOURCE, not by target: the question this panel answers is "what is doing things to
  // me", so the causes are the rows.
  const rows = useMemo(() => {
    const map = new Map<string, SourceRow>()
    for (const entry of Object.values(ledger.byTarget)) {
      for (const c of entry.contributions) {
        const key = `${c.sourceKind}:${c.sourceId ?? c.source}`
        if (!map.has(key)) map.set(key, { id: c.sourceId ?? c.source, name: c.source, kind: c.sourceKind, contributions: [] })
        map.get(key)!.contributions.push(c)
      }
    }
    const all = [...map.values()]
    return ORDER.flatMap((k) => all.filter((r) => r.kind === k))
  }, [ledger])

  const durationFor = (id: string) => (char.activeEffects ?? []).find((e) => e.id === id)?.duration

  function end(row: SourceRow) {
    // ONE rule: you end an effect by removing its CAUSE.
    //  · A worn item's effect is caused by wearing it → unequip. "Worn but off" is unrepresentable
    //    and pretending otherwise would make the sheet lie about its own state.
    //  · A consumed potion's item is already gone; its effect stands alone → just drop it.
    if (row.kind === 'item' || row.kind === 'attuned') {
      setChar((c) => ({
        ...c,
        inventory: (c.inventory ?? []).map((i) =>
          i.id === row.id
            ? { ...i, equipped: false, attuned: false, tags: (i.tags ?? []).filter((t) => t !== 'equipped') }
            : i,
        ),
      }))
      return
    }
    removeActiveEffect(row.id)
  }

  // Nothing active is a fact worth stating, not a reason to vanish. A panel that disappears when
  // empty trains you not to look for it — and "is anything on me?" is the question it answers.
  if (rows.length === 0) {
    return (
      <div className="card ae-card">
        <div className="ae-head">✦ Active Effects</div>
        <p className="ae-empty">Nothing is modifying this character — every number on the sheet is its own.</p>
      </div>
    )
  }

  return (
    <div className="card ae-card">
      <div className="ae-head">✦ Active Effects</div>
      <p className="ae-empty">
        Everything changing this character right now. If a number is not what you expect, it is here.
      </p>

      {rows.map((row) => {
        const dur = durationFor(row.id)
        return (
          <div className="ae-row" key={`${row.kind}:${row.id}`}>
            <div className="ae-main">
              <div className="ae-name">
                {row.name}
                <span className="ae-kind">{KIND_META[row.kind].label}</span>
                {dur && <span className="ae-dur">· {dur}</span>}
              </div>
              <ul className="ae-fx">
                {row.contributions.map((c, i) => (
                  <li key={i} className={c.suppressed ? 'ae-off' : undefined}>
                    {c.label}
                    {/* A suppressed contribution is shown, never hidden. "My belt says +2 but my
                        STR didn't move" is precisely the confusion this panel exists to end. */}
                    {c.suppressed && <span className="ae-off-tag">overridden — doing nothing</span>}
                  </li>
                ))}
              </ul>
            </div>
            {canWrite && KIND_META[row.kind].end && (
              <button className="btn tiny danger" title={KIND_META[row.kind].hint} onClick={() => end(row)}>
                {KIND_META[row.kind].end}
              </button>
            )}
          </div>
        )
      })}

      {/* Durations are shown as authored and never expire on a timer. This is a table aid, not a
          simulation — the DM decides when time passes. Noticing next session is the whole point. */}
      <p className="ae-note">Durations never run out on their own — the DM decides when time passes.</p>
    </div>
  )
}
