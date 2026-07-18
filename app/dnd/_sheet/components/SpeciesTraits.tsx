// app/dnd/_sheet/components/SpeciesTraits.tsx — a well-formatted, all-viewers "Species / Ancestry
// traits" panel (Area B). Works for every system via lib/dnd/species/view.ts (2024 species with full
// per-trait text; PF2 ancestries with size/speed/senses/heritages; a graceful name-only card for a
// homebrew lineage). Collapsible so it never crowds the header, and readable by anyone viewing the sheet
// — not just in the 2024 edit flow the old inline card was limited to.
'use client'

import { useState } from 'react'
import { speciesView } from '@/lib/dnd/species/view'

export default function SpeciesTraits({ system, species }: { system: string | null | undefined; species: string | null | undefined }) {
  const [open, setOpen] = useState(false)
  const view = speciesView(system, species)
  if (!view) return null

  const facts: string[] = []
  if (view.size) facts.push(`Size: ${view.size}`)
  if (typeof view.speed === 'number') facts.push(`Speed: ${view.speed} ft`)
  if (view.senses?.length) facts.push(view.senses.join(' · '))

  return (
    <details className="card" style={{ marginTop: 8, fontSize: 13 }} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 12.5, listStyle: 'none' }}>
        <b style={{ color: 'var(--ink)' }}>{view.name}</b> {view.noun.toLowerCase()} traits
        {view.source === 'custom' && <span style={{ color: 'var(--muted)' }}> · custom / homebrew</span>}
        <span style={{ color: 'var(--muted)' }}> {open ? '▾' : '▸'}</span>
      </summary>

      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
        {facts.length > 0 && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: 'var(--muted)', fontSize: 12 }}>
            {facts.map((f) => <span key={f}>{f}</span>)}
          </div>
        )}

        {view.traits.length > 0 ? (
          <ul className="clean" style={{ display: 'grid', gap: 4, margin: 0 }}>
            {view.traits.map((t) => (
              <li key={t.name}><b>{t.name}.</b> {t.text}</li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>
            A custom {view.noun.toLowerCase()} — its traits live wherever this sheet records them (Features, DM notes). Pick a listed {view.noun.toLowerCase()} to see its rules-text here.
          </p>
        )}

        {view.heritages?.length ? (
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {view.noun === 'Ancestry' ? 'Heritages' : 'Lineages'}: {view.heritages.join(', ')}.
          </div>
        ) : null}
        {view.languages?.length ? (
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Languages: {view.languages.join(', ')}.</div>
        ) : null}
      </div>
    </details>
  )
}
