// rollerAnim — the shared "should this roller animate?" rule (RO-6).
//
// Every roller (Dice Core / Sigil Stack / Roll Board / Impact) has a rolling animation and an INSTANT
// resolution. Two things decide which plays, and this one helper is where they combine so no roller can
// disagree: the player's per-character toggle (`char.rollerAnim`, animated unless explicitly false) AND
// `prefers-reduced-motion` as a HARD override — an accessibility setting always wins, so a player who
// asked the OS for less motion never gets the tumble even with the toggle on.

/** True if the OS/browser asks for reduced motion. Mirrors the per-roller local checks it replaces. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Should the roller play its animation? Animated unless the player turned it off OR the OS wants
 *  reduced motion. Pass `char.rollerAnim`; `undefined` means "never chosen" → animated. */
export function shouldAnimateRoller(rollerAnim: boolean | undefined): boolean {
  return rollerAnim !== false && !prefersReducedMotion()
}
