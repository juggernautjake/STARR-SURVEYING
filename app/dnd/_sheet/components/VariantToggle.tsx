'use client'
// VariantToggle — turn this character between VANILLA (held to its class and level) and CUSTOM
// (may take anything, off-rules picks flagged rather than refused).
//
// This is the owner's "let users turn vanilla characters into custom characters and start adding
// custom feats and spells". The switch is REVERSIBLE and non-destructive: going back to vanilla
// keeps every custom element already on the sheet — it just re-arms the gate so NEW off-rules
// content is blocked again. So there is no scary one-way door here; the copy says so.
//
// Split into a PROPS-BASED VIEW plus a thin `useChar` wrapper, because it is needed in two places
// that do not share a data context: the shared 5e sheet (inside the store provider) AND the page
// chrome above a bespoke PF2/IG sheet (a server component, no provider). The view takes exactly
// what it needs — id, kind, write access — all of which the page already has server-side.
//
// Owner/DM only (a plain viewer sees the current state as a read-only chip). The server re-derives
// write access and the character's own system, so the button can only ever change the KIND.
import { useState } from 'react'
import { useChar } from '../state/store'

export function VariantToggleView({
  characterId,
  variantKind,
  canWrite,
}: {
  characterId?: string
  variantKind?: string
  canWrite?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const isCustom = variantKind === 'custom'

  // A plain viewer just sees which kind the sheet is — no control.
  if (!canWrite) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 12 }}>
        <span className="sec-num">BUILD {'//'}</span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{isCustom ? 'Custom — homebrew allowed' : 'Vanilla — rules-legal only'}</span>
      </div>
    )
  }

  const setKind = async (kind: 'vanilla' | 'custom') => {
    if (kind === variantKind || !characterId) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/dnd/characters/${characterId}/variant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setErr(j.error ?? 'Could not change the build.')
        return
      }
      // A FULL page reload, not the store's `reloadFromDb`. The variant kind is a SERVER-rendered
      // prop — the page reads it from `system_variants` and threads it through into the store /
      // bespoke sheet at mount — so it is not part of the sheet `data` a store refetch would touch.
      // Verified the hard way: the POST persisted `kind: vanilla` to the DB while the button stayed
      // on Custom. Re-running the server render is the only thing that updates the prop, and it also
      // re-arms the pickers and gates with the new kind in one step.
      if (typeof window !== 'undefined') window.location.reload()
    } catch {
      setErr('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', marginBottom: 12 }}>
      <span className="sec-num">BUILD {'//'}</span>
      <button
        className={`btn tiny ${!isCustom ? 'active' : ''}`}
        disabled={busy}
        aria-pressed={!isCustom}
        onClick={() => setKind('vanilla')}
        title="Hold this character to its class and level — off-rules picks are blocked. Existing custom content stays and keeps its ⚑ flag."
        style={{ opacity: !isCustom ? 1 : 0.7 }}
      >
        Vanilla
      </button>
      <button
        className={`btn tiny ${isCustom ? 'active' : ''}`}
        disabled={busy}
        aria-pressed={isCustom}
        onClick={() => setKind('custom')}
        title="Allow homebrew and off-rules feats, spells, weapons and more — each flagged ⚑ for review rather than refused."
        style={{ opacity: isCustom ? 1 : 0.7 }}
      >
        Custom
      </button>
      <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto', maxWidth: 380 }}>
        {isCustom
          ? 'Custom: add any feat, spell, weapon or homebrew — each is flagged ⚑, not blocked. Switch back to Vanilla anytime; nothing is lost.'
          : 'Vanilla: only rules-legal picks for your class and level. Switch to Custom to add homebrew and off-rules content.'}
      </span>
      {err && <span role="alert" style={{ fontSize: 12, color: 'var(--danger, #e0533a)', width: '100%' }}>{err}</span>}
    </div>
  )
}

/** The 5e-sheet wrapper: pulls id/kind/write from the store context. */
export default function VariantToggle() {
  const { characterId, variantKind, canWrite } = useChar()
  return <VariantToggleView characterId={characterId ?? undefined} variantKind={variantKind} canWrite={canWrite} />
}
