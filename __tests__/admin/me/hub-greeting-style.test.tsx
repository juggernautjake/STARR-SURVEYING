// __tests__/admin/me/hub-greeting-style.test.tsx
//
// The CSS contract for the hub greeting card. The stylesheet is read directly and asserted against
// known-good substrings — no DOM render needed.
//
// ── REWRITTEN IN C0j (2026-08-15) ───────────────────────────────────────────────────────────────
//
// Two thirds of this file used to lock the "Enter Work Mode" CTA: its gradient-green pill, its
// conic-gradient ::before ring, the spin keyframes, the hover lift and scale, the focus ring. That
// button was deleted with the Work Mode shell (C0g) and its ~155 lines of CSS went with it, so
// those assertions described nothing.
//
// What replaces them is coverage of the restyle, and of the two REPAIRS that came with it — both
// of which had been shipping unnoticed and neither of which any test would have caught:
//
//   · the heading column carried `padding-right: 14rem`, reserving space for the deleted button;
//   · `.hub-greeting__clock-dot` was rendered by the component and styled nowhere at all.
//
// The heading-colour and readability assertions from the original file are kept as they were —
// they were about the greeting itself, not the button, and they still hold.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS_PATH = path.join(__dirname, '..', '..', '..', 'app', 'admin', 'me', 'AdminMe.css');
const cssRaw = fs.readFileSync(CSS_PATH, 'utf8');
// Strip /* … */ comments before matching so a literal `}` inside an explanatory comment cannot
// truncate a non-greedy block regex.
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');

/** A rule's declaration block, by exact selector. */
function block(selector: string): string {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[\\s\\S]*?\\}`);
  const m = css.match(re);
  return m ? m[0] : '';
}

describe('Greeting heading — explicit white', () => {
  it('the heading carries an explicit #FFFFFF color', () => {
    const b = block('.hub-greeting__heading');
    expect(b).not.toBe('');
    expect(b).toMatch(/color:\s*#FFFFFF/i);
    expect(b).toMatch(/font-weight:\s*700/);
  });

  it('the heading has a subtle text-shadow for contrast on the gradient', () => {
    expect(block('.hub-greeting__heading')).toMatch(/text-shadow:/);
  });

  it('scales with clamp() rather than stepping at a breakpoint', () => {
    // C0j — a hard `font-size` in the 640px block used to override this. Two sizes with a jump
    // between them means there is a width where the heading is briefly wrong for its card.
    expect(block('.hub-greeting__heading')).toMatch(/font-size:\s*clamp\(/);
  });
});

describe('Greeting date + clock status — readable on the gradient', () => {
  it('the date is white-ish', () => {
    expect(block('.hub-greeting__date')).toMatch(/color:\s*rgba\(255,\s*255,\s*255/);
  });

  it('the clock line renders as a status chip, not a bare line of text', () => {
    const b = block('.hub-greeting__clock-status');
    expect(b).toMatch(/border-radius:\s*9999px/);
    expect(b).toMatch(/background:\s*rgba\(255,\s*255,\s*255/);
    expect(b).toMatch(/display:\s*inline-flex/);
  });

  it('the clock DOT is actually styled — it was an invisible empty span', () => {
    // The component has rendered `.hub-greeting__clock-dot` since it shipped. Only
    // `.work-mode-prompt__clock-dot` ever had rules, and that component is deleted. Without width,
    // height and a background this element paints nothing at all.
    const b = block('.hub-greeting__clock-dot');
    expect(b, 'the clock dot must have its own rule').not.toBe('');
    expect(b).toMatch(/width:/);
    expect(b).toMatch(/height:/);
    expect(b).toMatch(/border-radius:\s*9999px/);
    expect(b).toMatch(/background:\s*#34D399/i);
  });
});

describe('the card no longer reserves space for a button that is gone', () => {
  it('nothing in the stylesheet still styles the Work Mode CTA', () => {
    // C0g deleted the button; C0j deleted its ~155 lines of CSS. A rule that outlives its element
    // is the exact failure the M5 and U-7 notes in this stylesheet both describe.
    expect(cssRaw).not.toMatch(/hub-greeting__work-mode-btn/);
    expect(cssRaw).not.toMatch(/hub-greeting__actions\s*\{/);
    expect(cssRaw).not.toMatch(/@keyframes\s+hub-greeting-work-mode-spin/);
  });

  it('the heading column reserves no right-hand padding', () => {
    // `padding-right: 14rem` on a ~318px-wide phone card left the heading ~94px and wrapped
    // "Good night, Audit." down three lines. It guarded against an absolutely-positioned CTA that
    // no longer exists, at any width.
    expect(block('.hub-greeting__primary')).not.toMatch(/padding-right/);
    expect(cssRaw).not.toMatch(/\.hub-greeting\s*>\s*div:first-child/);
  });

  it('the card is a single column at every width', () => {
    const b = block('.hub-greeting');
    expect(b).toMatch(/flex-direction:\s*column/);
    expect(b).toMatch(/align-items:\s*flex-start/);
  });
});
