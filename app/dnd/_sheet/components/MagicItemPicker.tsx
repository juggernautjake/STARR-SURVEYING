'use client'
// MagicItemPicker — start a new item from the SRD magic-item catalogue (P8-2).
//
// The item builder was entirely free-form: to give a character an Amulet of Health you typed the name and
// then typed the rules text out of the book. Everything else on this platform is catalogued — spells,
// feats, weapons, armour, creatures — and magic items were the last content axis where the answer was
// "retype it". This is the door to the catalogue; the builder underneath is unchanged, so a picked item is
// a STARTING POINT that stays fully editable, which is the same contract the armour picker has in PF2.
//
// It prefills and then gets out of the way — no lock, no "catalogued" mode. The one thing it does NOT do
// is invent effects: the rules text arrives verbatim in the description and the numeric effect is still
// authored by hand below. See `magicItemToInvItem`.
import { useMemo, useState } from 'react'
import type { InvItem } from '../types'
import { MAGIC_ITEMS_5E, magicItemToInvItem, magicItemBrief, searchMagicItems, MAGIC_ITEM_GAPS } from '@/lib/dnd/magic-items'

/** How many rows to render at once. A 237-row list in a scroll box is slow to skim and slow to paint;
 *  the count of what is hidden is printed, because a silently truncated list reads as "that is all there
 *  is" — the same rule the bestiary and the walker option lists follow. */
const SHOWN = 40

const fieldStyle: React.CSSProperties = { width: '100%', padding: '6px 9px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel-2)', color: 'var(--ink)', fontSize: 13 }

export default function MagicItemPicker({ onPick }: { onPick: (item: InvItem) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const matches = useMemo(() => searchMagicItems(MAGIC_ITEMS_5E, q), [q])
  const shown = matches.slice(0, SHOWN)
  const hidden = matches.length - shown.length

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel-2)', padding: '9px 11px', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontSize: 13 }}>✨ Start from the SRD catalogue</strong>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>
            {MAGIC_ITEMS_5E.length} magic items. Picking one fills in the name and its rules text — everything stays editable.
          </div>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}>
          {open ? 'Close' : 'Browse'}
        </button>
      </div>

      {open && (
        <div style={{ display: 'grid', gap: 7 }}>
          <input
            value={q} onChange={(e) => setQ(e.target.value)} style={fieldStyle}
            placeholder="Search by name, kind or rarity — “amulet”, “legendary”, “wand”…"
            aria-label="Search magic items"
          />
          <div style={{ display: 'grid', gap: 4, maxHeight: 320, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {shown.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '6px 2px' }}>
                Nothing in the SRD matches “{q}”. It may still be a real item — see the note below — so type it in by hand.
              </div>
            )}
            {shown.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => { onPick(magicItemToInvItem(m)); setOpen(false); setQ('') }}
                style={{
                  textAlign: 'left', padding: '6px 9px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--ink)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{magicItemBrief(m)}</div>
              </button>
            ))}
          </div>
          {hidden > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              +{hidden} more match — keep typing to narrow it down.
            </div>
          )}
          {/* An absent item must read as "not catalogued", never as "does not exist" — the PF2 gaps
              convention. Without this, a DM who cannot find a Deck of Many Things concludes the search is
              broken rather than that the item is outside the open licence. */}
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
            This is the SRD subset under CC-BY. Items printed only in the Dungeon Master’s Guide are outside
            that licence and are deliberately absent rather than missing — type those in by hand, exactly as
            before. Nothing here carries automatic bonuses: the rules text comes across as written, and any
            numeric effect is still yours to add below.
            {MAGIC_ITEM_GAPS.count !== MAGIC_ITEMS_5E.length && ' (Catalogue count mismatch — regenerate.)'}
          </div>
        </div>
      )}
    </div>
  )
}
