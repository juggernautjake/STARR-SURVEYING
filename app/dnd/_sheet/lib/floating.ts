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

/**
 * The width that puts every template button on ONE ROW — measured, not chosen.
 *
 * OWNER, 2026-07-31: *"Make it a little wider so that all of the template button choices sit side by
 * side, and then make the modal be tall enough to reveal all of the digital dice roller elements. Only
 * the dice roll history should have its own little scrollable section."*
 *
 * That instruction replaced the approach that preceded it, and the replacement was better. At 396 the five
 * chips (four templates + the Animated toggle) needed 458px of a 372px row, so the bar wrapped and spent a
 * second 29px line. The fix being attempted was to make the chips smaller — hide their glyphs, tighten
 * their padding — which is squeezing the content to fit the box when the box is the thing that was wrong.
 * All of that was reverted.
 *
 * Measured: the bar's own `scrollWidth` is **458** on the 5e sheets (434 on PF2/IG, which have fewer
 * controls). The body pads it 12px each side and the window has a 1px border, so the window needs
 * 458 + 24 + 2 = **484**. 500 is that with a little room, and it also gives the dice stage a better shape.
 */
export const ROLLER_IDEAL_W = 500

/**
 * The height that reveals every element, with roll history as the one scrollable section.
 *
 * 560 was never derived from anything — it was the 07-28 constant, still sitting there after the 07-30
 * decision said the size comes from *"the tallest roller's content"*. D7-3's first real sweep failed 42 of
 * 88 cells against it, on a 1280×900 desktop with 300px to spare: the window was never too big for the
 * screen, it was too small for its own contents.
 *
 * Measured, and re-measured after the WIDTH changed — the two are not independent. A wider window puts the
 * template bar on one row and stops some control rows wrapping, so widening it made it shorter.
 *
 * Method: shrink the window until the body overflows, then read what the content demands with the
 * permitted scrollers at their 48px floor. Across four systems × four templates, after a real roll, with
 * history open: **508–575**, the 5e Dice Core being tallest.
 *
 * 680 is that maximum plus about 100px, and the 100 is not padding — it is what turns roll history from a
 * 48px floor into a section you can read a few rolls in, which is what the owner asked for: *"only the
 * dice roll history should have its own little scrollable section"*. Everything else shows at natural size.
 *
 * What stops this growing without end is the history CAP from D7-2: five entries, the rest behind
 * "show all n" INSIDE the log's own scroller. A busy session cannot push the window taller, so the height
 * is bounded by design rather than by luck.
 *
 * It remains a CEILING. Where a screen has less room the window clamps down (D7-1) and the content
 * compresses in a fixed order — the stage first, since it is built to scale, then history, then the
 * breakdown — and if even that is not enough the body scrolls and D7-3 reports it rather than hiding it.
 */
export const ROLLER_IDEAL_H = 680

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
