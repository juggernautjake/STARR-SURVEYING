// lib/http/constant-time.ts — stop a response's TIMING from answering a question its body refuses to.
//
// A1-4b: *"A 404 currently returns after one query while a hit does two more; the difference is
// measurable and confirms a guess even when the throttle stops the guessing being fast."*
//
// That is the whole threat, and it is worth being precise about how small it is: A1-4 already throttles
// the public invoice lookup to 30 attempts per 5 minutes, so nobody is enumerating anything quickly. What
// timing buys an attacker is CONFIRMATION — thirty guesses a window is useless if every answer looks the
// same, and quite useful if one of them comes back 40 ms slower than the other twenty-nine.
//
// ── TWO MECHANISMS, AND THE FIRST IS THE REAL ONE ──────────────────────────────────────────────────
//
//  1. **Do the same work either way.** A miss that skips the second query is a miss that is structurally
//     faster, and no amount of padding fixes a difference that scales with how busy the database is. The
//     route runs the same round trips on both paths; this module cannot do that for it, and the route's
//     comments say where.
//  2. **And do not answer before a floor.** Padding alone would be security theatre — an attacker
//     samples the distribution rather than one request, and a floor lower than the slow path's variance
//     leaks through it. Above the slow path, though, it collapses both into one number.
//
// ── WHAT THIS DOES NOT CLAIM ───────────────────────────────────────────────────────────────────────
//
// It does not make the handler constant-time in the cryptographic sense, and it cannot: the network, the
// serverless cold start and the database's own cache all add noise far larger than the difference being
// hidden. What it does is remove the SYSTEMATIC difference — the one an attacker can average out. The
// noise they cannot.

/**
 * The floor, in milliseconds — and it is the BACKSTOP, not the fix.
 *
 * Measured against the running app before this was written down, because the first draft of this comment
 * claimed the floor sat above the slow path and that turned out not to be the interesting part. With both
 * paths doing the same two round trips, a hit and a miss came back at a **median of 515 ms and 522 ms** —
 * seven milliseconds apart on five hundred, which is noise. The equal-work change is what did that; the
 * floor never fired, because the real work already exceeded it.
 *
 * It earns its place in the OTHER regime. In production against a regional database both paths are tens
 * of milliseconds, and there a residual 15 ms difference is 60% rather than 1% — proportion is what an
 * attacker averages, not absolute time. A floor collapses that case; it cannot help the slow one, and
 * does not claim to.
 */
export const MIN_RESPONSE_MS = 250;

/** Monotonic where available. `Date.now()` moves if the clock is adjusted mid-request. */
export const now = (): number =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

/**
 * Hold a response until at least `floorMs` has passed since `startedAt`.
 *
 * Returns the value unchanged; the only effect is when. Already-slow responses are NOT delayed further —
 * the point is a floor, not a fixed duration, and adding a constant to everything would make the whole
 * endpoint slower without hiding anything the floor does not already hide.
 */
export async function notBefore<T>(startedAt: number, value: T, floorMs: number = MIN_RESPONSE_MS): Promise<T> {
  const waited = now() - startedAt;
  const remaining = floorMs - waited;
  if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
  return value;
}
