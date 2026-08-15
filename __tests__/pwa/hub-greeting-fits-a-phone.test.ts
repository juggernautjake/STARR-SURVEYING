// __tests__/pwa/hub-greeting-fits-a-phone.test.ts
//
// Owner report with a screenshot, 2026-08-04: **the Enter Work Mode button hung off the LEFT edge of
// the phone.** It is the primary action on the first screen anyone sees after signing in.
//
// ── THE BUG, AND WHY IT IS A CLASS OF BUG RATHER THAN A TYPO ────────────────────────────────────
//
// The desktop rule pins the actions column with `position: absolute; right: 2.5rem`. The mobile
// block then set `width: 100%` — and never unset the positioning. A full-card-width box anchored
// 2.5 rem from the right edge starts 2.5 rem PAST the left edge, so it hangs off the side of the
// screen and the card cannot clip it.
//
// `width: 100%` is the giveaway: it only means anything on an element in normal flow. So the mobile
// rule was written for a static element and the absolute positioning arrived afterwards, in a
// different slice, and nothing connected the two. That is the shape worth guarding — **a mobile
// override that inherits a `position` it was not written for** — not this one selector.
//
// ── WHY A SOURCE CHECK ──────────────────────────────────────────────────────────────────────────
//
// `scripts/audit-mobile.mjs` measures real overflow in a real browser at 360/390/414 px, and it is
// the better instrument. It covers `/dnd` routes only, which is precisely why this reached a phone:
// the admin hub is behind a session the script does not mint. Extending it is the right follow-up;
// until then this pins the specific mistake so it cannot come back silently.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(process.cwd(), 'app/admin/me/AdminMe.css'), 'utf8');

/**
 * Every `@media (max-width: <px>)` block with that width, concatenated.
 *
 * ALL of them, not the first — this stylesheet has two separate `max-width: 640px` blocks (the
 * column grid, then the phone polish pass), and taking the first found an empty rule and reported
 * the CSS as broken. A probe that reads one of two blocks is the "widen it before believing it"
 * rule in miniature, and it fired on the first run of this file.
 */
function mediaBlock(maxWidth: number): string {
  const head = new RegExp(`@media\\s*\\(max-width:\\s*${maxWidth}px\\)\\s*\\{`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = head.exec(css)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    out.push(css.slice(start, i - 1));
  }
  return out.join('\n');
}

/** The declarations of one selector inside a block, including when it appears in a comma-separated
 *  group — `.a .b, .a .c { … }` is how half of this file is written, and matching only a
 *  selector immediately followed by `{` misses every one of them.
 *
 *  **Comments stripped**, and that is not tidiness. A `not.toContain('overflow-x')` assertion here
 *  failed on the comment explaining why the overflow was REMOVED. Third time today a check has
 *  confused prose for code — the AI-spend ratchet credited a file for a comment, a reachability
 *  guard passed on a comment naming its function, and this one failed on a comment describing the
 *  thing it was checking was gone. **In a codebase that documents its reasoning this heavily, any
 *  check that reads source must strip comments first.** */
function rule(block: string, selector: string): string {
  const code = block.replace(/\/\*[\s\S]*?\*\//g, '');
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[,{}])\\s*${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'm');
  return re.exec(code)?.[1] ?? '';
}

describe('the hub greeting fits on a phone', () => {
  // ── C0j (2026-08-15): the four CTA tests that stood here are gone with the button. ──────────
  //
  // They locked the mobile fix for the Enter Work Mode CTA: position:static, transform:none, a
  // padding override and a max-width cap. C0g deleted that button and C0j deleted its CSS, so all
  // four asserted the absence of nothing.
  //
  // The header of this file argues the bug was never one selector but a CLASS — a mobile override
  // inheriting a `position` it was not written for. That class is still worth guarding, so the
  // four are replaced by one test of the condition that made it possible: the greeting card no
  // longer positions any child absolutely, at any width. Nothing can inherit what is not there.
  it('positions no child of the greeting card absolutely', () => {
    const cardRules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders = [...cardRules.matchAll(/(\.hub-greeting[\w-]*)[^{}]*\{([^}]*)\}/g)]
      .filter(([, , decls]) => /position:\s*absolute/.test(decls))
      .map(([, sel]) => sel);
    expect(offenders, 'an absolutely-positioned child is what let a mobile override inherit a ' +
      'position it was not written for — see this file’s header').toEqual([]);
  });


  it('the role pills WRAP rather than running off the side', () => {
    // ── Inverted within the hour, on a second report, and the correction is the useful part. ─────
    //
    // The roles row was a horizontal swipe strip. First report: "the roles are cut off". I read that
    // as a missing affordance and added a fade to say *it scrolls* — pinned here as
    // `overflow-x: auto` + `mask-image`.
    //
    // Second report, same person, after seeing the fade: *"the little role tags are side by side
    // going off the screen to the right."* **The affordance was never the problem.** Anything
    // running off the edge of a phone reads as broken whether or not it scrolls, and these pills are
    // a read-only label — nobody needs to reach them, so nothing should ask to be swiped.
    //
    // I fixed the cue instead of the layout because the strip's own comment explained why it existed
    // (a four-line pill stack pushing widgets off the fold) and I took that constraint as fixed. It
    // was a real constraint with a better answer: smaller pills.
    const decls = rule(mediaBlock(640), '.hub-greeting__role-pills-list');
    expect(decls, 'the pills must wrap; a phone-width row that scrolls sideways reads as broken')
      .toContain('flex-wrap: wrap');
    expect(decls, 'nothing here scrolls any more').not.toContain('overflow-x');
    expect(decls, 'a scroll cue for a layout that no longer scrolls tells the reader to try nothing')
      .not.toMatch(/mask-image/);
  });

  it('pays for wrapping by shrinking the pills, not by taking the fold', () => {
    // The constraint the strip existed to satisfy is still real: an eleven-role account should not
    // push every widget below the fold. Wrapping alone would have traded one complaint for another.
    const pill = rule(mediaBlock(640), '.hub-greeting__role-pill');
    expect(pill, 'no phone-size override — eleven roles would wrap to five desktop-sized lines')
      .toMatch(/font-size/);
    expect(pill).toMatch(/max-width/);
  });
});
