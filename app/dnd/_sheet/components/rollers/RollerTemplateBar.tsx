'use client'
// RollerTemplateBar — the on-roller TEMPLATE PICKER (RO-4): a compact row of the four roller glyphs at
// the top of the floating roller, so the player switches roller presentation (Dice Core / Sigil Stack /
// Roll Board / Impact) from ON the roller itself — independently of the sheet template.
//
// It POSTs the choice to `/api/dnd/characters/[id]/roller` (the RO-2 endpoint) and then does a FULL
// reload, for the SAME reason `TemplateBrowser` does: the 5e sheet reads `char.rollerTemplate` from the
// client store, which a soft refresh does not re-hydrate — and the store's autosave could otherwise
// write the OLD value back over this POST. A reload re-hydrates from the just-saved row so the chosen
// roller actually takes effect and sticks.
//
// Styling is token-only (`var(--hx-*)` with fallbacks) so it reads correctly inside the floating window
// under any skin/theme. Hidden when there is no character id (a brand-new unsaved sheet has nothing to
// persist to yet).
import { useState } from 'react'
import { ROLLER_TEMPLATES, type RollerTemplateId } from '@/lib/dnd/roller-templates'

export default function RollerTemplateBar({
  characterId,
  current,
  canWrite = true,
}: {
  characterId: string | null | undefined
  /** The effective roller id (already resolved), so the active chip is highlighted. */
  current: RollerTemplateId
  /** Only the owner/DM may change it; a read-only viewer sees the row disabled. */
  canWrite?: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!characterId) return null

  async function pick(id: RollerTemplateId) {
    if (id === current || busy || !canWrite) return
    setBusy(id); setErr(null)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/roller`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roller: id }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? 'Could not switch roller.'); setBusy(null); return }
      window.location.reload()
    } catch {
      setErr('Network error.'); setBusy(null)
    }
  }

  return (
    <div
      role="group"
      aria-label="Roller style"
      style={{ display: 'flex', gap: 4, padding: '2px 2px 8px', flexWrap: 'wrap', alignItems: 'center' }}
    >
      {ROLLER_TEMPLATES.map((t) => {
        const on = t.id === current
        return (
          <button
            key={t.id}
            type="button"
            disabled={!!busy || !canWrite}
            onClick={() => pick(t.id)}
            aria-pressed={on}
            title={canWrite ? `${t.label} — ${t.blurb}` : t.label}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999,
              fontSize: 11, lineHeight: 1.2, cursor: busy || !canWrite ? 'default' : 'pointer',
              fontFamily: 'var(--hx-font-display, inherit)', letterSpacing: '0.03em',
              border: on ? '1px solid var(--hx-teal-1, #0ac8b9)' : '1px solid var(--hx-line, rgba(255,255,255,0.14))',
              background: on ? 'rgba(10,200,185,0.14)' : 'rgba(255,255,255,0.03)',
              color: on ? 'var(--hx-teal-1, #0ac8b9)' : 'var(--hx-muted, #93a1b5)',
              opacity: !canWrite && !on ? 0.5 : 1,
            }}
          >
            <span aria-hidden style={{ fontSize: 12 }}>{t.glyph}</span>
            <span>{t.label}</span>
            {busy === t.id && <span aria-hidden>…</span>}
          </button>
        )
      })}
      {err && <span style={{ fontSize: 10.5, color: 'var(--hx-danger, #ff6b6b)', width: '100%' }}>{err}</span>}
    </div>
  )
}
