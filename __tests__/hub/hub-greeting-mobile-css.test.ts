// __tests__/hub/hub-greeting-mobile-css.test.ts
//
// hub-mobile-build-out Slice 4 — locks the phone-only (<640 px) media
// rule on the hub greeting: card padding + heading typography
// tightened, and the role-pills list turns into a swipeable horizontal
// strip so a surveyor with many roles doesn't get a tall pill stack
// pushing widgets off the fold.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS = fs.readFileSync(
  path.join(__dirname, '..', '..', 'app', 'admin', 'me', 'AdminMe.css'),
  'utf8',
);

// Slice the phone polish block out (balanced braces). There's an
// earlier `@media (max-width: 640px)` rule for `.hub-columns`, so we
// anchor on the Slice-4 marker comment to find ours.
/**
 * The phone-polish block, WITH COMMENTS REMOVED.
 *
 * The stripping is not tidiness. A `not.toMatch(/overflow-x/)` assertion here failed on the comment
 * explaining why the overflow had been removed — the fourth time in one day a check in this repo
 * has read prose as code (an AI-spend ratchet credited a file for a comment; a reachability guard
 * passed on a comment naming its function; a CSS check failed on a comment describing a deletion).
 *
 * **In a codebase that documents its reasoning this heavily, prose is the common case, not an edge
 * one.** Any check that greps source has to strip comments first, or it is testing the commentary.
 */
function phoneBlock(): string {
  const marker = CSS.indexOf('hub-mobile-build-out Slice 4');
  if (marker < 0) return '';
  const opener = CSS.indexOf('@media (max-width: 640px)', marker);
  if (opener < 0) return '';
  const braceStart = CSS.indexOf('{', opener);
  if (braceStart < 0) return '';
  let depth = 1;
  for (let i = braceStart + 1; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}') {
      depth--;
      if (depth === 0) return CSS.slice(braceStart + 1, i).replace(/\/\*[\s\S]*?\*\//g, '');
    }
  }
  return '';
}

describe('hub-greeting phone (<640 px) polish', () => {
  it('has a phone-only @media block', () => {
    expect(CSS).toMatch(/@media \(max-width: 640px\)/);
  });

  it('tightens .hub-page padding on phones', () => {
    expect(phoneBlock()).toMatch(/\.hub-page\s*\{[\s\S]*?padding:/);
  });

  it('tightens the greeting heading typography on phones', () => {
    expect(phoneBlock()).toMatch(/\.hub-greeting__heading\s*\{[\s\S]*?font-size:\s*1\.35rem/);
  });

  it('WRAPS the role pills instead of running them off the side', () => {
    // ── Inverted 2026-08-04, on the owner's report, and kept rather than deleted. ────────────────
    //
    // This asserted a horizontal swipeable strip: `nowrap` + `overflow-x: auto` with the scrollbar
    // hidden. The reasoning was sound — six roles wrapping to four lines pushes every widget below
    // the fold — and it was wrong in practice, reported twice from a real phone: first as "the roles
    // are cut off", then, after a fade cue was added to say the strip scrolls, as *"the little role
    // tags are side by side going off the screen to the right."*
    //
    // The second report is the finding: **the affordance was never the problem.** Anything running
    // off the edge of a phone reads as broken whether or not it scrolls — and these pills are a
    // read-only label, so nothing anyone needs to reach should be asking to be swiped.
    //
    // The fold constraint was real and is met a different way: smaller pills on phones, so eleven
    // roles take three tight lines rather than five loose ones. Asserted below.
    const block = phoneBlock();
    expect(block).toMatch(/\.hub-greeting__role-pills-list\s*\{[\s\S]*?flex-wrap:\s*wrap/);
    expect(
      /\.hub-greeting__role-pills-list\s*\{[\s\S]*?overflow-x:/.test(block),
      'the strip scrolls again — a phone-width row that runs off the side reads as broken',
    ).toBe(false);
  });

  it('pays for wrapping by shrinking the pills rather than taking the fold', () => {
    // Without this the inversion above just trades one complaint for another.
    const block = phoneBlock();
    expect(block).toMatch(/\.hub-greeting__role-pill\s*\{[\s\S]*?font-size:/);
    expect(block).toMatch(/\.hub-greeting__role-pill\s*\{[\s\S]*?max-width:\s*100%/);
  });

  it('pins each pill so the flex strip never squashes them', () => {
    expect(phoneBlock()).toMatch(/\.hub-greeting__role-pill\s*\{[\s\S]*?flex:\s*0 0 auto/);
  });
});
