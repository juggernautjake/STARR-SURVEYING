// __tests__/dnd/floating-roller-dock.test.ts — the shared floating-roller dock (R-1).
//
// Two pieces the browser pass cannot cheaply assert on their own: the PERSISTENCE round-trip (the
// window's remembered position/size/minimized survive a save→load per character) and the CLAMP the
// dock uses on every drag/resize/window-resize (the window can never strand off-screen or park its
// handle under the sticky header). The clamp is `clampBox`/`safeTop` from lib/floating — the exact
// functions useFloatingDock calls — so testing them here tests the dock's clamp.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { clampBox, safeTop, EDGE } from '@/app/dnd/_sheet/lib/floating'
import {
  rollerStoreKey,
  loadDockState,
  saveDockState,
  type DockState,
} from '@/app/dnd/_sheet/components/rollers/useFloatingDock'

const VW = 1024
const VH = 768

class MemStorage {
  private store = new Map<string, string>()
  get length() { return this.store.size }
  clear() { this.store.clear() }
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null }
  key(i: number) { return Array.from(this.store.keys())[i] ?? null }
  removeItem(k: string) { this.store.delete(k) }
  setItem(k: string, v: string) { this.store.set(k, String(v)) }
}

// The node test env has no `window`; the dock's clamp reads window.innerWidth/Height and its persistence
// reads window.localStorage. `document` stays undefined so safeTop uses its FALLBACK_TOP (a real /dnd
// header is measured in the browser, verified separately).
let savedWindow: unknown
beforeEach(() => {
  savedWindow = (globalThis as Record<string, unknown>).window
  ;(globalThis as Record<string, unknown>).window = {
    innerWidth: VW,
    innerHeight: VH,
    localStorage: new MemStorage(),
  }
})
afterEach(() => {
  ;(globalThis as Record<string, unknown>).window = savedWindow
})

describe('roller dock — persistence round-trip (a per-character VIEW preference)', () => {
  it('keys per character and defaults to anon', () => {
    expect(rollerStoreKey('abc')).toBe('dnd:roller:v1:abc')
    expect(rollerStoreKey(null)).toBe('dnd:roller:v1:anon')
    expect(rollerStoreKey(undefined)).toBe('dnd:roller:v1:anon')
  })

  it('saves and restores position, size, and minimized exactly', () => {
    const s: DockState = { x: 120, y: 200, w: 360, h: 420, minimized: true }
    saveDockState('char-1', s)
    expect(loadDockState('char-1')).toEqual(s)
  })

  it('round-trips a content-fit (null) height', () => {
    const s: DockState = { x: 10, y: 90, w: 370, h: null, minimized: false }
    saveDockState('char-h', s)
    expect(loadDockState('char-h')).toEqual(s)
  })

  it('does not leak one character’s window onto another', () => {
    saveDockState('char-a', { x: 1, y: 90, w: 300, h: 300, minimized: false })
    expect(loadDockState('char-b')).toBeNull()
  })

  it('falls back to null (default window) on missing or corrupt storage', () => {
    expect(loadDockState('nope')).toBeNull()
    // jsdom provides a real localStorage; write garbage under the key so the loader must survive it.
    window.localStorage.setItem(rollerStoreKey('bad'), 'not-json')
    expect(loadDockState('bad')).toBeNull()
  })
})

describe('roller dock — clamp keeps the window on-screen and below the header', () => {
  it('snaps a far off-screen top-left back to the edge and below safeTop', () => {
    const top = safeTop()
    expect(clampBox(-9999, -9999, 300, 200)).toEqual({ x: EDGE, y: top })
  })

  it('pulls a far off-screen bottom-right fully back into view', () => {
    const c = clampBox(99999, 99999, 300, 200)
    expect(c.x).toBe(VW - 300 - EDGE)
    expect(c.y).toBe(VH - 200 - EDGE)
    // The WHOLE box (not just its corner) is within the viewport.
    expect(c.x + 300).toBeLessThanOrEqual(VW - EDGE)
    expect(c.y + 200).toBeLessThanOrEqual(VH - EDGE)
  })

  it('never parks the handle above safeTop, whatever y is stored', () => {
    const top = safeTop()
    for (const y of [-100, 0, 30, top, 400, 100000]) {
      expect(clampBox(100, y, 300, 200).y).toBeGreaterThanOrEqual(top)
    }
  })
})
