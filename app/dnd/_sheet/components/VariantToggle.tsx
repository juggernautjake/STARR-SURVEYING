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
import { exceptionsIn, describeException } from '@/lib/dnd/slots/entitlement'

export function VariantToggleView({
  characterId,
  variantKind,
  canWrite,
  exceptions = [],
}: {
  characterId?: string
  variantKind?: string
  canWrite?: boolean
  /** Already-worded departures from the rules — e.g. ["Magic Initiate (DM-granted, level 4)"] (S8b). */
  exceptions?: string[]
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const isCustom = variantKind === 'custom'
  // The THIRD kind. This control read `variantKind === 'custom'` and treated everything else as vanilla,
  // so an altered-vanilla sheet displayed "Vanilla — rules-legal only" — a plain false statement about a
  // character deliberately holding picks its class and level do not grant, on the one control whose whole
  // job is to say which build this is. Fourth instance of the same union-widening trap (the gates in S8a,
  // IG's `powerReason` in S6c, this).
  const isAltered = variantKind === 'altered-vanilla'

  // What this build is, in one line. Named exceptions rather than a count: a badge that reports a departure
  // without saying what departed is the thing the owner asked us not to build.
  const stateLine = isCustom
    ? 'Custom — homebrew allowed'
    : isAltered
      ? `Altered vanilla — rules-legal except: ${exceptions.length ? exceptions.join('; ') : 'recorded exceptions'}`
      : 'Vanilla — rules-legal only'

  // A plain viewer just sees which kind the sheet is — no control.
  if (!canWrite) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 12 }}>
        <span className="sec-num">BUILD {'//'}</span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{stateLine}</span>
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
          : isAltered
            ? 'Altered vanilla: still held to your class and level, apart from the exceptions named below. Remove them to go back to plain Vanilla.'
            : 'Vanilla: only rules-legal picks for your class and level. Switch to Custom to add homebrew and off-rules content.'}
      </span>
      {/* NAMED, on the sheet itself. This is the whole point of the third kind: the player and the DM can
          both see exactly which picks are not the usual, and why, without opening the builder. */}
      {isAltered && exceptions.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--gold, #c8aa6e)', width: '100%', lineHeight: 1.5 }}>
          <strong style={{ fontWeight: 700 }}>Exceptions:</strong> {exceptions.join('; ')}
        </div>
      )}
      {err && <span role="alert" style={{ fontSize: 12, color: 'var(--danger, #e0533a)', width: '100%' }}>{err}</span>}
    </div>
  )
}

/** The 5e-sheet wrapper: pulls id/kind/write from the store context. */
export default function VariantToggle() {
  const { characterId, variantKind, canWrite, char } = useChar()
  // Read straight off `build.choices` rather than through `sheetExceptions`: this wrapper only ever mounts
  // inside the shared 5e engine (a built PF2/IG character renders its bespoke sheet and gets the view
  // mounted from the page instead, with the system known there), and the store carries no `system` to
  // dispatch on. `exceptionsIn` is shape-only, so it needs none.
  const exceptions = exceptionsIn(char?.build?.choices as { level?: number; exception?: unknown }[] | undefined)
  return (
    <VariantToggleView
      characterId={characterId ?? undefined}
      variantKind={variantKind}
      canWrite={canWrite}
      exceptions={exceptions.map(describeException)}
    />
  )
}
