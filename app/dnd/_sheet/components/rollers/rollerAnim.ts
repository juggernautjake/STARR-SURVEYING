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

/**
 * Strip the trailing `= N` summary from a breakdown before parsing it into terms (RO-14).
 *
 * `rollDiceExpr` returns `"1d4[1] = 1"` — the total is appended for readability. Every roller then splits
 * the breakdown on whitespace and treats a bare number as a flat modifier, so that trailing total was read
 * as a term: a plain d4 rendered a die row AND a phantom `flat +1`.
 *
 * Shared rather than duplicated because the bug was in TWO tokenisers at once (`buildDamageRows` in Impact
 * and `buildDamageTiles` in the Sigil Stack are near-identical), which is exactly how it survived — fixing
 * one would have left the other, and the Roll Board reads the same strings.
 *
 * Only a trailing `= <number>` is removed. A breakdown with no summary is returned untouched, and an `=`
 * appearing anywhere but the end is left alone rather than guessed at.
 */
export function stripTotalTail(breakdown: string): string {
  return (breakdown ?? '').replace(/\s*=\s*-?\d+\s*$/, '').trim();
}

/**
 * Drop EVERY `= N` summary from a breakdown, wherever it sits — not just a trailing one.
 *
 * FOUND IN THE BROWSER, on an Intuitive Games attack whose own breakdown contradicted its total: the rows
 * read 6, +3, +9, +3 above a total of 12. `rollDiceExpr('1d6+3')` returns `"1d6[6] +3 = 9"` — total appended
 * for readability — and then the IG damage roll APPENDS its stance bonus: `"1d6[6] +3 = 9 + 3 (stance)"`.
 * The internal `= 9` is no longer trailing, so `stripTotalTail` left it, and a bare `9` tokenises as a flat
 * modifier. The subtotal got added to its own parts.
 *
 * RO-14 fixed the trailing case, and this is the same defect one composition step later: any breakdown that
 * something else appends to turns a trailing summary into an interior one. The general rule is what should
 * have been written then — an `=` introduces a summary of everything to its left, so it is never a term,
 * wherever it appears.
 *
 * `= b` and other non-numeric right-hand sides are left alone: guessing at those would drop real terms.
 */
export function dropSummaries(breakdown: string): string {
  return (breakdown ?? '').replace(/\s*=\s*-?\d+/g, '').trim();
}

/** One die that was actually rolled, as recovered from a breakdown. */
export interface RolledDie {
  /** Faces on this die — 6 for a `2d6` group. */
  sides: number;
  /** What it came up. */
  value: number;
  /** False for the discarded die of an advantage/disadvantage pair. */
  kept: boolean;
}

/**
 * THE INDIVIDUAL DICE OF A ROLL, read from its breakdown.
 *
 * The store records `2d6[3,5]` — every die and what it showed — so the display never needs its own source of
 * truth for this, and multiple dice cost nothing to show correctly.
 *
 * FOUND BY WATCHING A DIE LIE. The Impact roller drew its die from `activeRoll.landing`, which for a d20 check is
 * the natural roll but for a DAMAGE roll is the folded total. So a `1d6+3` that rolled a 6 for 12 total handed
 * "12" to a six-sided die, which has no such face — the die fell back to showing 1 while the breakdown beneath it
 * correctly said 6. The number on the die and the number in the row disagreed, which is worse than either being
 * absent, and no test could see it because both values were individually right.
 *
 * `d20[7,18]→18` also yields both dice of an advantage pair, with the discarded one marked — so a roller can show
 * what a player actually saw hit the table rather than only the survivor.
 */
export function diceOf(breakdown: string): RolledDie[] {
  const out: RolledDie[] = [];
  // `NdM[v,v,…]` optionally followed by `→N` for the kept die of a pair.
  const re = /(\d*)d(\d+)\[([^\]]*)\](?:\s*→\s*(-?\d+))?/g;
  for (const m of dropSummaries(breakdown).matchAll(re)) {
    const sides = Number(m[2]);
    if (!Number.isFinite(sides) || sides < 2) continue;
    const kept = m[4] === undefined ? null : Number(m[4]);
    const values = m[3]
      .split(',')
      .map((v) => parseInt(v.trim(), 10))
      .filter((v) => Number.isFinite(v));
    let keptTaken = false;
    for (const value of values) {
      // With a `→N`, exactly one die is the kept one — the FIRST that matches, so a pair of equal rolls does not
      // mark both.
      const isKept = kept === null ? true : !keptTaken && value === kept;
      if (isKept && kept !== null) keptTaken = true;
      out.push({ sides, value, kept: isKept });
    }
  }
  return out;
}

/** One term of a roll's breakdown: a die group (`1d8[5]`) or a flat modifier. */
export interface BreakdownTerm {
  key: string;
  /** The die notation (`1d8`) or `'flat'`. */
  label: string;
  /** Display value — signed, EXCEPT a leading positive term (see below). */
  value: string;
  kind: 'die' | 'mod';
}

/**
 * Tokenise a roll breakdown into display terms. **This lives here because it was duplicated**: the Impact
 * and Sigil rollers each carried a near-identical copy, and SigilStack's own comment recorded why that
 * mattered — the phantom-flat-modifier bug (RO-14) appeared in both, so "fixing one would have left the
 * other looking correct while still being wrong". A third roller reading breakdowns would have made three.
 *
 * THE LEADING TERM PRINTS UNSIGNED. A bare `1d8` rendered "+8" as the first and only row above a total of
 * 8, which reads as a bonus applied to nothing. From the second row down the column genuinely is a running
 * sum, so those keep their signs.
 *
 * Callers still own their own presentation (Impact's rows, Sigil's glyph tiles) and the authoritative total
 * always comes from the store, so an imperfect parse changes how a roll is EXPLAINED, never its answer.
 */
export function breakdownTerms(breakdown: string): BreakdownTerm[] {
  const out: BreakdownTerm[] = [];
  const show = (n: number) => (out.length === 0 && n >= 0 ? String(n) : n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
  dropSummaries(breakdown)
    .split(/\s+/)
    .filter(Boolean)
    .forEach((tok, i) => {
      const dm = tok.match(/^(−|-)?(\d*d\d+)\[([^\]]*)\]$/);
      if (dm) {
        const sign = dm[1] ? -1 : 1;
        const sum = dm[3].split(',').reduce((a, v) => a + (parseInt(v.trim(), 10) || 0), 0) * sign;
        out.push({ key: `d${i}`, label: dm[2], value: show(sum), kind: 'die' });
      } else if (/^[+−-]?\d+$/.test(tok)) {
        const n = parseInt(tok.replace('−', '-'), 10);
        out.push({ key: `f${i}`, label: 'flat', value: show(n), kind: 'mod' });
      }
    });
  return out;
}

/**
 * How many past rolls a roller shows before it asks (D7-2).
 *
 * G7 is "the roller window never scrolls", and roll history is the one section with no natural bound —
 * the store keeps 40 and all three stages rendered every one of them into a `max-height: 260px;
 * overflow-y: auto` box. So the window was always one busy combat away from being a scroll container,
 * which is the defect D7-3's detector exists to catch.
 *
 * Five, because it is the number a player actually looks back over — "what did I just roll, and the one
 * before it" — and because five entries fit the collapsed section without the box needing to scroll at
 * all. Beyond that is history rather than context, and it is one click away.
 *
 * Shared rather than declared three times: the three stages have deliberately different identities but
 * this is not one of them, and three literals is how two of them end up at 5 and one at 8.
 */
export const HISTORY_PREVIEW = 5;
