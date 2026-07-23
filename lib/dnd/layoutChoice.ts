'use client'
// layoutChoice — a per-character CLIENT cache + signal so switching the TEMPLATE (layout) is INSTANT on the
// bespoke PF2/IG sheets, with no full page reload (CM-1). The template chip used to POST `/layout` then
// reload; on a prop-driven sheet that works but the reload is jarring and can read as "nothing changed". Here
// the chip writes the cache and pings; the sheet reads the effective layout via `useLayoutChoice` and
// re-renders into the new shell at once. The choice still persists to `data.sheetLayout` via the background
// POST, so a real reload restores it.
import { useCallback, useSyncExternalStore } from 'react'

const cache = new Map<string, string>()
const listeners = new Map<string, Set<() => void>>()

/** Record the player's template pick for this character and notify its sheet to re-render. */
export function rememberLayout(characterId: string | null | undefined, layout: string) {
  if (!characterId) return
  cache.set(characterId, layout)
  listeners.get(characterId)?.forEach((l) => l())
}

/** The template to render: the session pick if made, else the saved `data.sheetLayout`, else 'classic'. */
export function effectiveLayout(characterId: string | null | undefined, saved: unknown): string {
  if (characterId) {
    const c = cache.get(characterId)
    if (c) return c
  }
  return typeof saved === 'string' && saved ? saved : 'classic'
}

function subscribe(characterId: string | null | undefined, cb: () => void): () => void {
  if (!characterId) return () => {}
  let set = listeners.get(characterId)
  if (!set) {
    set = new Set()
    listeners.set(characterId, set)
  }
  set.add(cb)
  return () => set!.delete(cb)
}

/** Read the character's effective template reactively — re-renders when the template chip picks a new one. */
export function useLayoutChoice(characterId: string | null | undefined, saved: unknown): string {
  const sub = useCallback((cb: () => void) => subscribe(characterId, cb), [characterId])
  const snapshot = useCallback(() => effectiveLayout(characterId, saved), [characterId, saved])
  const server = useCallback(() => (typeof saved === 'string' && saved ? saved : 'classic'), [saved])
  return useSyncExternalStore(sub, snapshot, server)
}
