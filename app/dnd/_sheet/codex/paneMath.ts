// The Codex pane-stack arithmetic (CX-3/CX-4), kept as pure functions.
//
// This is separated from the React hook on purpose. The opening rule — "existing panes shrink
// proportionally toward their minimum to make room, and if they are all already at minimum the
// stack scrolls instead" — is the one genuinely fiddly piece of the whole layout, and it is the
// piece most likely to be quietly wrong at the boundaries (one pane open, every pane at minimum,
// a container shorter than a single minimum). Pure functions let the tests assert the resulting
// HEIGHTS rather than poking at a rendered component and hoping.

/** A pane's natural height when it opens, in px. Roomy enough for a useful amount of a skills
 *  list without swallowing the viewport. */
export const DEFAULT_PANE_H = 380
/** Below this a pane cannot usefully show rows, so it becomes header-only instead. That is a
 *  STATE (collapsed), not a smaller size — see `COLLAPSED_H`. */
export const MIN_PANE_H = 120
/** Header-only. Not a height a drag can land on; you reach it by collapsing. */
export const COLLAPSED_H = 40

export interface Pane {
  id: string
  height: number
  /** Collapsed panes render header-only and are excluded from proportional shrinking — there is
   *  nothing left to take from them. */
  collapsed?: boolean
  /** The section's natural CONTENT height in px — the MAX a drag may grow this pane to (D-11). The
   *  owner's rule: a section opens at the minimum height that reveals all of ITS content for THIS
   *  character, and the user may only shrink it below that, never grow past it (no empty space under
   *  the content). Measured from the rendered content; unset until first measured. */
  max?: number
}

/** A pane's rendered height, which is COLLAPSED_H regardless of the stored height when
 *  collapsed. Stored height is preserved across a collapse so expanding restores the size the
 *  player chose rather than resetting to the default — losing a deliberate size is exactly the
 *  kind of small betrayal that makes a layout feel unreliable. */
export function renderedHeight(p: Pane): number {
  return p.collapsed ? COLLAPSED_H : p.height
}

/** Total rendered height of a stack, including the grab bar allowance per pane. */
export function stackHeight(panes: Pane[], gap = 0): number {
  if (panes.length === 0) return 0
  return panes.reduce((sum, p) => sum + renderedHeight(p), 0) + gap * (panes.length - 1)
}

/**
 * Shrink `panes` proportionally toward MIN_PANE_H until they fit in `target` px.
 *
 * "Proportionally" means each pane gives up the same FRACTION of its slack (height above the
 * minimum), not the same number of pixels. Equal pixels would drive a small pane to its minimum
 * while a large one barely moved, which reads as the layout picking a victim; equal fractions
 * preserve the relative sizes the player set, which is what "shrink a bit to make room" means.
 *
 * Returns the panes unchanged when they already fit. Never returns a pane below MIN_PANE_H —
 * when the target cannot be met even at all-minimum, every pane sits at its minimum and the
 * caller lets the stack scroll. That overflow is the owner's asked-for "second scroll bar", and
 * it is deliberately preferred over shrinking panes into uselessness.
 */
export function shrinkToFit(panes: Pane[], target: number, gap = 0): Pane[] {
  const gaps = gap * Math.max(0, panes.length - 1)
  const budget = target - gaps
  // Collapsed panes are fixed furniture here: they cost COLLAPSED_H and cannot give anything up.
  const fixed = panes.filter((p) => p.collapsed).length * COLLAPSED_H
  const flexible = panes.filter((p) => !p.collapsed)
  if (flexible.length === 0) return panes

  const current = flexible.reduce((s, p) => s + p.height, 0)
  const avail = budget - fixed
  if (current <= avail) return panes

  const floor = flexible.length * MIN_PANE_H
  // Even at minimum they do not fit: everything goes to minimum and the stack scrolls.
  if (avail <= floor) {
    return panes.map((p) => (p.collapsed ? p : { ...p, height: MIN_PANE_H }))
  }

  const slack = current - floor // total px available to give up
  const need = current - avail // total px we must reclaim
  const ratio = need / slack // same fraction of slack from every pane
  return panes.map((p) => {
    if (p.collapsed) return p
    const paneSlack = p.height - MIN_PANE_H
    const next = Math.round(p.height - paneSlack * ratio)
    return { ...p, height: Math.max(MIN_PANE_H, next) }
  })
}

/**
 * Open `id`, inserting it in CANONICAL order. It arrives at `DEFAULT_PANE_H` and is then measured to
 * its content height (`capPaneToContent`); the OTHER open sections are left exactly as they are.
 *
 * The accordion model (D-11): each open section stays at its own content height and the column simply
 * grows — opening a section PUSHES the ones below it down rather than squeezing every pane to share a
 * fixed viewport. (The old shrink-to-fit behaviour fought the content-sizing rule, which caps each pane
 * to its content and only shrinks.)
 *
 * Canonical order — not click order — is deliberate: a player reaching for Spells should find it in the
 * same place every time. Returns the stack unchanged if `id` is already open (idempotent).
 */
export function openPane(panes: Pane[], id: string, order: readonly string[]): Pane[] {
  if (panes.some((p) => p.id === id)) return panes
  return [...panes, { id, height: DEFAULT_PANE_H }].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  )
}

/** Close `id`. The remaining panes keep their heights — they do NOT expand to fill the gap.
 *  Growing a pane the player sized by hand, because a different pane closed, would be the layout
 *  overriding an explicit choice. The empty space is honest; the fit control is one double-click
 *  away. */
export function closePane(panes: Pane[], id: string): Pane[] {
  return panes.filter((p) => p.id !== id)
}

/** Resize one pane, clamped to the minimum AND to its content-height max (D-11 — only shrink, never
 *  grow past what reveals all the content). Other panes are untouched: a drag adjusts the pane you
 *  grabbed, and the stack scrolls if that overflows. Redistributing on every drag frame makes the
 *  whole stack squirm under the cursor, which is unusable. */
export function resizePane(panes: Pane[], id: string, height: number): Pane[] {
  return panes.map((p) => {
    if (p.id !== id) return p
    const cap = p.max ?? Infinity
    return { ...p, height: Math.min(cap, Math.max(MIN_PANE_H, Math.round(height))), collapsed: false }
  })
}

/** The pane HEIGHT needed to reveal `content` px of section content with NO in-pane scroll (Part A).
 *
 *  The pane's set height covers the whole `.codex-pane`: header + body(padding + content) + grab + borders.
 *  Measuring the inner content alone and using THAT as the pane height (the old bug) left every auto-opened
 *  pane ~60px short — the body scrolled and clipped the last stretch of content. So the needed height is the
 *  content plus everything around it: `chromeOutsideBody` (header + grab + pane borders — the flex:none parts,
 *  a stable figure regardless of overflow) and the body's own vertical padding. All clamped ≥0 so a
 *  transient zero measurement can't produce a negative. +2 is a hair of breathing room. */
export function neededPaneHeight(content: number, chromeOutsideBody: number, bodyPadV: number): number {
  return Math.ceil(Math.max(0, content) + Math.max(0, chromeOutsideBody) + Math.max(0, bodyPadV)) + 2
}

/** Record a section's natural CONTENT height (D-11) and size the pane to it.
 *
 *  The owner's rule, in two parts:
 *   - On the FIRST measure (no `max` yet — the section just opened), the pane OPENS AT its content
 *     height: the minimum height that reveals all of that section's content for this character, tall or
 *     short. That is the height the section is meant to appear at.
 *   - On every measure the content height becomes the resize CAP, and the current height is clamped to
 *     it — so the user can only ever shrink a section below its content, never grow it past (no empty
 *     space under the content). A later measure (the content itself changed) keeps the size the player
 *     has since chosen, only re-capping it.
 *  The cap is floored at MIN_PANE_H so a tiny section stays grabbable. */
export function capPaneToContent(panes: Pane[], id: string, contentH: number): Pane[] {
  const cap = Math.max(MIN_PANE_H, Math.round(contentH))
  return panes.map((p) => {
    if (p.id !== id) return p
    if (p.max == null) return { ...p, max: cap, height: cap } // first measure → open at content height
    if (p.max === cap && p.height <= cap) return p // unchanged
    return { ...p, max: cap, height: Math.min(p.height, cap) } // re-cap, keep the player's size
  })
}

/** Toggle header-only. Keeps the stored height so expanding restores the player's size. */
export function toggleCollapse(panes: Pane[], id: string): Pane[] {
  return panes.map((p) => (p.id === id ? { ...p, collapsed: !p.collapsed } : p))
}

/** Collapse everything except `id`, and give `id` whatever is left (CX-9 "solo"). The common
 *  "I need the whole screen for Spells right now" without closing anything — closing would lose
 *  the set of panes the player assembled, which is the thing they would have to rebuild. */
export function soloPane(panes: Pane[], id: string, target: number, gap = 0): Pane[] {
  const others = panes.filter((p) => p.id !== id).length
  const room = target - others * COLLAPSED_H - gap * Math.max(0, panes.length - 1)
  return panes.map((p) =>
    p.id === id ? { ...p, collapsed: false, height: Math.max(MIN_PANE_H, Math.round(room)) } : { ...p, collapsed: true },
  )
}
