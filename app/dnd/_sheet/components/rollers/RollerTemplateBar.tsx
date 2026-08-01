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
  anim,
  onToggleAnim,
  onPick,
}: {
  characterId: string | null | undefined
  /** The effective roller id (already resolved), so the active chip is highlighted. */
  current: RollerTemplateId
  /** Only the owner/DM may change it; a read-only viewer sees the row disabled. */
  canWrite?: boolean
  /** Whether the roller currently ANIMATES (RO-6). When provided together with `onToggleAnim`, the bar
   *  renders an instant/animated toggle. Omitted → no toggle (e.g. a context with no live store). */
  anim?: boolean
  /** Flip the animation preference. Live (store-backed), so no reload — omit to hide the toggle. */
  onToggleAnim?: () => void
  /** Switch the roller LIVE (no page reload): the mount holds the current template in local state and this
   *  updates it instantly; the choice still persists to the row in the BACKGROUND. When provided, the picker
   *  never reloads. Omit → the legacy POST-then-reload path (for a mount that reads the id from a store a
   *  soft refresh wouldn't re-hydrate). */
  onPick?: (id: RollerTemplateId) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!characterId) return null

  async function pick(id: RollerTemplateId) {
    if (id === current || busy || !canWrite) return
    // Instant client-side switch: change the displayed roller NOW, persist in the background, no reload.
    if (onPick) {
      onPick(id)
      setBusy(id); setErr(null)
      try {
        const r = await fetch(`/api/dnd/characters/${characterId}/roller`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roller: id }),
        })
        if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? 'Switched, but could not save the choice.') }
      } catch {
        setErr('Switched, but could not save (network).')
      }
      setBusy(null)
      return
    }
    // Legacy path: POST then full reload (a store that a soft refresh wouldn't re-hydrate).
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
      // WRAPPING IS ALLOWED TO STAY. The chips fit one row because the WINDOW is wide enough for them
      // (`ROLLER_IDEAL_W`, sized from this row's measured width), not because they were squeezed — the
      // owner asked for the modal to be made wider, not for the buttons to be made smaller. `flexWrap`
      // remains as the graceful fallback on a phone, where one row is not possible at any padding.
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
              // THE INK COMES FROM THE SAME TOKEN FAMILY AS THE SURFACE. That is the whole rule, and it took
              // four attempts and a real browser to land it.
              //
              // Measured on a live streamer-skinned sheet (2026-07-26): the dock's gradient resolved to
              // `rgba(255,250,254,.98)` — near-WHITE — because `.fld` reads `--panel-rgb`, which the shell
              // bridge (`shellVarsFromHx`) derives from the skin. That same bridge also sets `--ink: #5a1050`
              // and `--muted: #8a3f7c`, dark inks correctly clamped FOR that light panel. But these inline
              // styles reached for `--hx-muted`, which on that sheet is the DEFAULT `#a09b8c` — a light warm
              // grey meant for a dark panel, because `skinHxVars` is not applied at this scope at all
              // (`--hx-panel` was still `#0b1a2c`). Light ink on a near-white dock: **2.59:1**, and the
              // active teal tab **1.76:1**.
              //
              // Slice 23's fix (emitting `--hx-panel-rgb`) never reached this surface — the token was empty
              // here — so its claim that "the clamp's precondition now holds" was wrong. `floatingRoller.css`
              // had it right all along: everything IT paints uses `--ink`/`--muted`. Only these inline styles
              // used the other family. So: shell family first, sheet family as the fallback for a scope where
              // only that one exists, literal last.
              //
              // The ACTIVE tab cannot use the accent for its text — neither family's teal clears AA on a
              // near-white dock (1.76:1) — so it takes `--ink` and stays recognisable through its teal border
              // and tint instead. Re-measured in the browser after the change, not computed.
              color: on
                ? 'var(--ink, var(--hx-text, #e8e6f0))'
                : 'var(--muted, var(--hx-muted, #93a1b5))',
              opacity: !canWrite && !on ? 0.5 : 1,
            }}
          >
            <span aria-hidden style={{ fontSize: 12 }}>{t.glyph}</span>
            <span>{t.label}</span>
            {busy === t.id && <span aria-hidden>…</span>}
          </button>
        )
      })}
      {/* RO-6 — instant vs. animated. A live, store-backed toggle (no reload): OFF resolves rolls at
          once, ON plays the template's animation. prefers-reduced-motion still forces instant regardless. */}
      {onToggleAnim && (
        <button
          type="button"
          disabled={!canWrite}
          onClick={onToggleAnim}
          aria-pressed={anim === false}
          title={anim === false ? 'Rolls appear instantly — click for animation' : 'Rolls animate — click for instant'}
          style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px',
            borderRadius: 999, fontSize: 11, lineHeight: 1.2, cursor: canWrite ? 'pointer' : 'default',
            fontFamily: 'var(--hx-font-display, inherit)', letterSpacing: '0.03em',
            border: '1px solid var(--hx-line, rgba(255,255,255,0.14))',
            // Same bar, same 11px, same family as the template tabs above — the shell's `--muted`, which is
            // clamped for the surface `.fld` actually paints. Kept in step with them rather than fixed
            // independently, since they sit on the same strip.
            background: 'rgba(255,255,255,0.03)', color: 'var(--muted, var(--hx-muted, #93a1b5))',
            opacity: canWrite ? 1 : 0.5,
          }}
        >
          <span aria-hidden>{anim === false ? '⚡' : '🎲'}</span>
          <span>{anim === false ? 'Instant' : 'Animated'}</span>
        </button>
      )}
      {err && <span style={{ fontSize: 10.5, color: 'var(--hx-danger, #ff6b6b)', width: '100%' }}>{err}</span>}
    </div>
  )
}
