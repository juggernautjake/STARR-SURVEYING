// Keeping floating windows (the dice tray, the stream chat dock) grabbable.
//
// Both windows used to clamp their top edge to 6px, which keeps them inside the
// viewport but happily parks the drag handle UNDERNEATH the sticky page header —
// the header paints over it, so there is nothing left to grab and the window is
// stranded for good (owner report 2026-07-19). Two defences here:
//
//   safeTop()  — the y below which a handle is actually clickable, measured from
//                whatever fixed/sticky chrome is currently pinned to the top of
//                the viewport, so it follows the real header instead of guessing.
//   clampBox() — keeps a window on screen AND below that line.
//
// Callers also get a reset affordance (see RESET_TITLE) so a window that somehow
// still ends up unreachable can always be recovered.

export const EDGE = 6 // breathing room from the viewport edges
const FALLBACK_TOP = 64 // if we can't measure the header, assume a typical one

export const RESET_TITLE = 'Reset position'

// The bottom edge of any chrome pinned to the top of the viewport. We look at real
// fixed/sticky elements rather than hard-coding a height, because /dnd renders its
// own Hextech header and the sheet skins vary. Only elements that actually sit at
// the top and span a meaningful width count as "header" — this deliberately ignores
// the floating windows themselves and small pinned buttons.
export function safeTop(): number {
  if (typeof document === 'undefined') return FALLBACK_TOP
  let bottom = 0
  try {
    const els = document.querySelectorAll<HTMLElement>('header, [data-app-header], .siteHeader, .stickyhead')
    els.forEach((el) => {
      const cs = getComputedStyle(el)
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return
      if (cs.visibility === 'hidden' || cs.display === 'none') return
      const r = el.getBoundingClientRect()
      // Must be pinned near the top and wide enough to actually occlude a handle.
      if (r.top > 8 || r.bottom <= 0) return
      if (r.width < window.innerWidth * 0.5) return
      bottom = Math.max(bottom, r.bottom)
    })
  } catch {
    return FALLBACK_TOP
  }
  return (bottom > 0 ? bottom : 0) + EDGE
}

// ── The roller window's size (D7-1) ─────────────────────────────────────────
//
// OWNER DECISION, 2026-07-30, resolving two asks that had pulled opposite ways
// since 07-28: **one size per screen.** Every roller template shares ONE size,
// and that size is derived from the viewport rather than being a universal
// constant — so "consistent, template to template" is read as consistent AT A
// GIVEN SCREEN, which is what makes "never scrolls" achievable at the same time.
//
// The two asks, and why neither survives on its own:
//   07-28: *"the modal when open is a consistent size and is not resizable."*
//   07-29: *"always … fully contain all of the content … never … a scrolling bar."*
// A universal 396×560 honours the first and overflows a 360×640 phone. A
// content-derived size honours the second and changes shape per template, which
// is the complaint 07-28 was about. Clamping ONE shared size to the viewport
// honours both, and only stops working on a screen too small for the content —
// which is D7-3's job to detect and report, not this function's to hide.

/** What the window WANTS wherever there is room: the 07-28 constants, now a ceiling. */
export const ROLLER_IDEAL_W = 396
export const ROLLER_IDEAL_H = 560

/**
 * The one size every roller template uses on this screen.
 *
 * Pure: it takes the viewport rather than reading it, so it is testable without a
 * DOM and cannot disagree with itself between a render and a resize.
 *
 * NOTE THERE IS NO MINIMUM. `MIN_W`/`MIN_H` exist for the drag-resize path, and
 * applying them here would be actively wrong: a floor can only bind when the
 * screen is SMALLER than it, and the one thing worse than a cramped window is a
 * window hanging off the side of the phone. Staying on the screen always wins.
 */
export function rollerSize(viewportW: number, viewportH: number, topInset: number): { w: number; h: number } {
  const availW = viewportW - 2 * EDGE
  const availH = viewportH - topInset - EDGE
  return {
    // An unmeasured viewport (SSR, a zero-size frame) falls back to the ideal rather
    // than to zero — a window with no size at all is not a smaller window.
    w: availW > 0 ? Math.min(ROLLER_IDEAL_W, availW) : ROLLER_IDEAL_W,
    h: availH > 0 ? Math.min(ROLLER_IDEAL_H, availH) : ROLLER_IDEAL_H,
  }
}

/** The live version of `rollerSize`, for callers that are already in the browser. */
export function currentRollerSize(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: ROLLER_IDEAL_W, h: ROLLER_IDEAL_H }
  return rollerSize(window.innerWidth, window.innerHeight, safeTop())
}

export interface Box { x: number; y: number }

// Clamp a window's top-left so the whole box stays on screen and its handle stays
// clear of the header. Width/height are the window's current size.
export function clampBox(x: number, y: number, w: number, h: number): Box {
  const top = safeTop()
  const maxX = Math.max(EDGE, window.innerWidth - w - EDGE)
  const maxY = Math.max(top, window.innerHeight - h - EDGE)
  return {
    x: Math.min(maxX, Math.max(EDGE, x)),
    y: Math.min(maxY, Math.max(top, y)),
  }
}

// True when a stored position would leave the window's handle unreachable — used on
// restore, so a dock saved under the header in an older build heals itself instead of
// coming back broken.
export function isStranded(y: number, x: number, w: number): boolean {
  if (typeof window === 'undefined') return false
  return y < safeTop() - 1 || x > window.innerWidth - 40 || x + w < 40
}
