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

/**
 * The token a roller should treat as "already seen" when it mounts (RO-7).
 *
 * OWNER REPORT, 2026-07-28: *"I am on one template, then I click another template, and then it
 * automatically rerolls."*
 *
 * Switching roller template UNMOUNTS one roller and MOUNTS another. Each roller decides whether a roll is
 * new by comparing `activeRoll.token` against a `useRef` seeded with `-1`, so the freshly-mounted component
 * saw the roll still sitting in the store, found `token !== -1`, and replayed it from the top — the
 * "automatic reroll".
 *
 * IT WAS NOT ONLY COSMETIC. That same path calls `commitRoll(activeRoll.entry)`, so every template switch
 * logged the roll to the feed a SECOND time — and since P3-1 publishes committed rolls to the shared
 * campaign log, a duplicate reached the DM's feed and skewed the P3-3 statistics. Changing how a roll is
 * *displayed* must never change what was *rolled*.
 *
 * Seeding the ref with the token already in the store makes the mount a no-op: the roller adopts the roll,
 * renders it settled, and animates only the next genuinely new one. Returns `-1` when nothing is on screen,
 * which is the old behaviour and correct — there is no roll to adopt.
 */
export function adoptedToken(activeRoll: { token: number } | null | undefined): number {
  return activeRoll?.token ?? -1;
}
