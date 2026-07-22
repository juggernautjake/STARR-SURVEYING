'use client'
// CustomizationSummary — the character's "what have I customized" panel.
//
// The owner's ask, concretely: open it and every category is listed. A category the character HAS
// customized is GREEN, sorts to the TOP, and carries a count — "Weapons (1)", "Feats & Features
// (3)". A category with nothing is GREY, empty, and sits below. Click a green category to see the
// actual customizations, each labelled by WHY it counts (homebrew / outside the rules / edited /
// DM granted).
//
// All of that ordering and counting is done once in `customizationReport` (lib/dnd/customizations)
// so this component never re-sorts or re-derives — it renders the report it is handed. Styling is
// inline with the sheet's own `var(--…)` theme tokens, so the panel inherits every skin and colour
// theme exactly as the rest of the sheet does, with no stylesheet of its own to keep in sync.
import { useMemo, useState } from 'react'
import { useChar } from '../state/store'
import { useSheetSystem } from '../state/sheetConfig'
import { customizationReport, customizationTypeLabel, type CustomizationType } from '@/lib/dnd/customizations'

/** Badge colour per customization type. Off-rules is the warning gold the ⚑ marker already uses;
 *  homebrew and edited are the sheet's own accent teals; granted is the violet used for DM actions.
 *  All theme tokens, so they track the active skin. */
const TYPE_TONE: Record<CustomizationType, string> = {
  homebrew: 'var(--tealbright)',
  'off-rules': 'var(--gold, #e0a83a)',
  edited: 'var(--tealbright)',
  granted: 'var(--violet-2, #8b5cf6)',
}

export default function CustomizationSummary({ grantedNames = [] }: { grantedNames?: string[] }) {
  const { char } = useChar()
  const system = useSheetSystem()
  // Collapsed by default: the panel is a summary you OPEN, and a totally-vanilla character should
  // not spend vertical space on a wall of grey categories unless asked.
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Recompute only when the character or system actually changes — the report walks every element,
  // and re-running it on unrelated re-renders (a dice roll, a hover) would be wasteful.
  const report = useMemo(() => customizationReport(char as never, system, grantedNames), [char, system, grantedNames])

  const { total } = report

  return (
    <div className="card" style={{ padding: '10px 14px', marginBottom: 12 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none',
          color: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'left', font: 'inherit',
        }}
      >
        <span aria-hidden style={{ fontSize: 13, color: total > 0 ? 'var(--tealbright)' : 'var(--muted)' }}>{open ? '▾' : '▸'}</span>
        <span className="sec-num" style={{ letterSpacing: '0.06em' }}>CUSTOMIZATIONS {'//'}</span>
        {/* The at-a-glance count, so the header answers "does this character have any?" without
            opening. Green when there are customizations, muted when the sheet is clean vanilla. */}
        <span
          style={{
            marginLeft: 'auto', fontSize: 12.5, fontWeight: 700,
            color: total > 0 ? 'var(--tealbright)' : 'var(--muted)',
          }}
        >
          {total > 0 ? `${total} across ${report.categories.filter((c) => c.count > 0).length} categor${report.categories.filter((c) => c.count > 0).length === 1 ? 'y' : 'ies'}` : 'none — vanilla build'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'grid', gap: 5 }}>
          {report.categories.map((c) => {
            const has = c.count > 0
            const isExpanded = expanded === c.category
            return (
              <div key={c.category}>
                <button
                  onClick={() => has && setExpanded((e) => (e === c.category ? null : c.category))}
                  aria-expanded={has ? isExpanded : undefined}
                  disabled={!has}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    padding: '6px 10px', borderRadius: 8, font: 'inherit', cursor: has ? 'pointer' : 'default',
                    // Green + solid for a customized category; grey + faint for an untouched one.
                    // This IS the owner's green-above-grey, and the ORDER already puts green first.
                    border: `1px solid ${has ? 'rgba(10,200,185,0.4)' : 'var(--line)'}`,
                    background: has ? 'rgba(10,200,185,0.08)' : 'transparent',
                    color: has ? 'var(--ink)' : 'var(--muted)',
                    opacity: has ? 1 : 0.7,
                  }}
                >
                  {has && <span aria-hidden style={{ fontSize: 11, color: 'var(--tealbright)' }}>{isExpanded ? '▾' : '▸'}</span>}
                  <span style={{ fontWeight: has ? 700 : 400, fontSize: 13 }}>{c.category}</span>
                  <span
                    aria-label={`${c.count} customization${c.count === 1 ? '' : 's'}`}
                    style={{
                      marginLeft: 'auto', fontSize: 12, fontVariantNumeric: 'tabular-nums',
                      fontWeight: 700, color: has ? 'var(--tealbright)' : 'var(--muted)',
                    }}
                  >
                    ({c.count})
                  </span>
                </button>

                {has && isExpanded && (
                  <ul style={{ listStyle: 'none', margin: '4px 0 6px', padding: '0 0 0 22px', display: 'grid', gap: 4 }}>
                    {c.items.map((it) => (
                      <li key={it.name} style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', fontSize: 12.5 }}>
                        <span style={{ color: 'var(--ink)' }}>{it.name}</span>
                        {it.types.map((t) => (
                          <span
                            key={t}
                            title={it.detail && (t === 'off-rules') ? it.detail : undefined}
                            style={{
                              fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em',
                              padding: '1px 6px', borderRadius: 10, whiteSpace: 'nowrap',
                              border: `1px solid ${TYPE_TONE[t]}`, color: TYPE_TONE[t],
                            }}
                          >
                            {customizationTypeLabel(t)}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
