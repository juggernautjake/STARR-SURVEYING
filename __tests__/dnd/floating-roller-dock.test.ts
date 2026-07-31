// __tests__/dnd/floating-roller-dock.test.ts — the shared floating-roller dock (R-1).
//
// Two pieces the browser pass cannot cheaply assert on their own: the PERSISTENCE round-trip (the
// window's remembered position/size/minimized survive a save→load per character) and the CLAMP the
// dock uses on every drag/resize/window-resize (the window can never strand off-screen or park its
// handle under the sticky header). The clamp is `clampBox`/`safeTop` from lib/floating — the exact
// functions useFloatingDock calls — so testing them here tests the dock's clamp.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { clampBox, rollerSize, safeTop, EDGE, ROLLER_IDEAL_W, ROLLER_IDEAL_H } from '@/app/dnd/_sheet/lib/floating'
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

  // RE-POINTED 2026-07-28. These asserted that SIZE round-trips, which was correct while the window was
  // drag-resizable. The owner asked for the opposite: *"the modal when open is a consistent size and is not
  // resizable… always big enough to show all of the elements… regardless of the roller template chosen."*
  // Position is still a preference; size is now fixed, and a stored size from before the change must NOT be
  // restored — that is exactly how a too-small box would survive the fix.
  it('restores POSITION and minimized exactly', () => {
    saveDockState('char-1', { x: 120, y: 200, w: 360, h: 420, minimized: true })
    expect(loadDockState('char-1')).toMatchObject({ x: 120, y: 200, minimized: true })
  })

  it('but NOT a stored size — the size is DERIVED from this screen', () => {
    // RE-POINTED AGAIN 2026-07-30 (D7-1). The owner's answer to the two conflicting asks is "one size per
    // screen": every template shares one size, and that size comes from the viewport rather than from a
    // universal constant. So a stored size must not survive — not because it is drag-resized, but because
    // it belongs to whatever screen it was saved on.
    saveDockState('char-h', { x: 10, y: 90, w: 370, h: null, minimized: false })
    const back = loadDockState('char-h')
    // 1024×768 with no measurable header has room for the ideal, so here it IS the ideal.
    expect(back).toMatchObject({ x: 10, y: 90, w: ROLLER_IDEAL_W, h: ROLLER_IDEAL_H })
    // The old "fit content" height is what made the window change shape per template.
    expect(back?.h, 'a content-fit height must not survive').not.toBeNull()
  })

  it('and a size saved on a laptop does not come back on a phone', () => {
    // THE DEFECT D7-1 FIXES. `loadDockState` used to return the 396×560 constant whatever the screen, so a
    // window saved on a desktop reopened on a 360×640 phone wider than the phone itself.
    saveDockState('char-p', { x: 10, y: 90, w: ROLLER_IDEAL_W, h: ROLLER_IDEAL_H, minimized: false })
    const w = globalThis as unknown as { window: { innerWidth: number; innerHeight: number } }
    w.window.innerWidth = 360
    w.window.innerHeight = 640
    const back = loadDockState('char-p')!
    expect(back.w).toBeLessThanOrEqual(360)
    expect(back.h!).toBeLessThanOrEqual(640)
    // Full-width sheet: everything the screen has, less the edge gutters.
    expect(back.w).toBe(360 - 2 * EDGE)
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

  // CX-R3 — a FRESH default roller snaps flush to the bottom-right once its real (content-fit) height
  // is measured, rather than hanging where the 440px guess placed it. The effect computes
  // `y = innerHeight - measuredH - EDGE` then clamps; a short roller must sit against the bottom edge.
  it('fresh-default bottom-snap sits a short content-fit roller flush to the bottom-right', () => {
    const h = 300 // shorter than the 440px placement guess
    const snapped = clampBox(VW - 396 - EDGE, VH - h - EDGE, 396, h)
    expect(snapped.y).toBe(VH - h - EDGE)
    expect(snapped.y + h).toBe(VH - EDGE) // flush to the bottom edge, no gap below
  })
})

describe('one size per screen (D7-1)', () => {
  // OWNER, 2026-07-30, resolving two asks that had pulled opposite ways since 07-28:
  //   07-28: "the modal when open is a consistent size and is not resizable"
  //   07-29: "always … fully contain all of the content … never … a scrolling bar"
  // A universal 396×560 honours the first and overflows a 360×640 phone; a content-derived size honours
  // the second and changes shape per template. ONE shared size, clamped to the viewport, honours both.
  const TOP = 70 // FALLBACK_TOP (64) + EDGE, which is what safeTop returns with no document

  it('gives the ideal wherever there is room for it', () => {
    expect(rollerSize(1440, 900, TOP)).toEqual({ w: ROLLER_IDEAL_W, h: ROLLER_IDEAL_H })
  })

  it('never exceeds the ideal on a huge screen — consistency, not "as big as possible"', () => {
    // The 07-28 ask is for a CONSISTENT size. A window that grew with the monitor would be a different
    // size on every machine, which is the same complaint in a nicer disguise.
    expect(rollerSize(3840, 2160, TOP)).toEqual({ w: ROLLER_IDEAL_W, h: ROLLER_IDEAL_H })
  })

  it('becomes a full-width sheet on a phone rather than hanging off it', () => {
    const s = rollerSize(360, 640, TOP)
    expect(s.w).toBe(360 - 2 * EDGE)
    expect(s.w).toBeLessThan(360)
    // The HEIGHT is untouched here, and that is the point of clamping each axis on its own: a 360×640
    // phone has 564px of usable height, which is more than the 560px ideal. Only the width was ever the
    // problem on this device — the old 396px constant was 36px wider than the whole screen.
    expect(s.h).toBe(ROLLER_IDEAL_H)
  })

  it('clamps the HEIGHT too, on a screen that is genuinely short', () => {
    // A phone in landscape, or a small laptop with a tall header. 380 − 70 − 6 = 304.
    const s = rollerSize(740, 380, TOP)
    expect(s.h).toBe(380 - TOP - EDGE)
    expect(s.h).toBeLessThan(ROLLER_IDEAL_H)
    // …and the width is left alone, because 740 has room for the ideal.
    expect(s.w).toBe(ROLLER_IDEAL_W)
  })

  it('is the SAME size for every template, because it does not take one', () => {
    // The property stated as a test: `rollerSize` has no template parameter, so Impact's tall arena and
    // Sigil Stack's shorter stack cannot produce different windows. That is the whole of the 07-28 ask,
    // and it is now structural rather than maintained by hand.
    expect(rollerSize.length).toBe(3) // viewportW, viewportH, topInset — and nothing else
  })

  it('leaves room for the header, so the drag handle is never under it', () => {
    // A window as tall as the viewport would park its own handle beneath the sticky /dnd header, which is
    // the exact stranding `safeTop` exists to prevent.
    const tall = rollerSize(1024, 400, TOP)
    expect(tall.h).toBe(400 - TOP - EDGE)
    expect(TOP + tall.h + EDGE).toBeLessThanOrEqual(400)
  })

  it('falls back to the ideal on an unmeasured viewport rather than to zero', () => {
    // SSR, or a frame that has not been laid out yet. A window with no size at all is not a smaller window.
    expect(rollerSize(0, 0, TOP)).toEqual({ w: ROLLER_IDEAL_W, h: ROLLER_IDEAL_H })
    expect(rollerSize(-100, -100, TOP)).toEqual({ w: ROLLER_IDEAL_W, h: ROLLER_IDEAL_H })
  })

  it('applies NO minimum, because staying on the screen beats staying comfortable', () => {
    // MIN_W/MIN_H belong to the drag-resize path. A floor here could only ever bind when the screen is
    // smaller than it — and the one thing worse than a cramped window is one hanging off the phone.
    const tiny = rollerSize(200, 300, TOP)
    expect(tiny.w).toBe(200 - 2 * EDGE)
    expect(tiny.w).toBeLessThan(248)
  })

  it('never returns a box that would not fit the screen it was given', () => {
    for (const [vw, vh] of [[320, 568], [360, 640], [390, 844], [768, 1024], [1024, 768], [1920, 1080]]) {
      const s = rollerSize(vw, vh, TOP)
      expect(s.w + 2 * EDGE, `${vw}x${vh} width`).toBeLessThanOrEqual(vw)
      expect(TOP + s.h + EDGE, `${vw}x${vh} height`).toBeLessThanOrEqual(vh)
    }
  })
})
