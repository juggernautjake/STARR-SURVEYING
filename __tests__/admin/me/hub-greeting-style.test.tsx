// __tests__/admin/me/hub-greeting-style.test.tsx
//
// Slice 218 of hub-greeting-edit-affordances-2026-05-29.md. Locks
// the CSS contract for the hub greeting heading + the green Enter
// Work Mode CTA. The CSS file is read directly + asserted against
// known-good substrings — no DOM render needed.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS_PATH = path.join(__dirname, '..', '..', '..', 'app', 'admin', 'me', 'AdminMe.css');
const cssRaw = fs.readFileSync(CSS_PATH, 'utf8');
// Strip /* … */ comments before matching so a literal `}` inside an
// explanatory comment can't truncate a non-greedy block regex. (The
// 2026-05-30 Work-Mode follow-up added a comment containing
// `a:hover { color: var(--brand-blue) }`, which broke the old brittle
// block matchers.)
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');

// Pull a rule's declaration block by selector substring, robust to the
// extra :link/:visited selectors in the rest-state list + to comments.
function ruleBlock(openingSelector: string): string {
  const start = css.indexOf(openingSelector);
  if (start < 0) return '';
  const braceOpen = css.indexOf('{', start);
  const braceClose = css.indexOf('}', braceOpen);
  if (braceOpen < 0 || braceClose < 0) return '';
  return css.slice(start, braceClose + 1);
}

describe('Greeting heading — explicit white', () => {
  it('the heading carries an explicit #FFFFFF color', () => {
    // The .hub-greeting__heading block should pin color: #FFFFFF so
    // the heading reads as white even when a parent rule cascades a
    // darker value.
    const headingBlock = css.match(/\.hub-greeting__heading\s*\{[\s\S]*?\}/);
    expect(headingBlock).not.toBeNull();
    expect(headingBlock![0]).toMatch(/color:\s*#FFFFFF/i);
    expect(headingBlock![0]).toMatch(/font-weight:\s*700/);
  });

  it('the heading has a subtle text-shadow for contrast on the gradient', () => {
    const headingBlock = css.match(/\.hub-greeting__heading\s*\{[\s\S]*?\}/);
    expect(headingBlock![0]).toMatch(/text-shadow:/);
  });
});

describe('Greeting date + clock-status — readable on the navy gradient', () => {
  it('date + clock-status rules pin white-ish color', () => {
    const rule = css.match(/\.hub-greeting__date[\s\S]*?\.hub-greeting__clock-status\s*\{[\s\S]*?\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/color:\s*rgba\(255,\s*255,\s*255/);
  });
});

describe('Enter Work Mode CTA — gradient green pill (matches estimate banner)', () => {
  // Slice 221 — the button now uses the same --gradient-green token
  // the landing-page estimate banner CTA lives on, with rich hover +
  // active feedback that mirror the marketing button's lift.

  it('uses the --gradient-green token (same emerald gradient as the landing estimate banner)', () => {
    const block = ruleBlock('.hub-greeting__work-mode-btn.hub-btn,');
    expect(block).not.toBe('');
    expect(block).toMatch(/background:\s*var\(--gradient-green\)/);
    // The 2026-05-30 follow-up pins the label white with !important to
    // beat the global `a { color: var(--brand-red) }`.
    expect(block).toMatch(/color:\s*#FFFFFF\s*!important/i);
  });

  it('uses a fully rounded pill (border-radius: 9999px)', () => {
    const block = ruleBlock('.hub-greeting__work-mode-btn.hub-btn,');
    expect(block).toMatch(/border-radius:\s*9999px/);
  });

  it('has larger padding + heavier weight + min-width so it reads as the primary CTA', () => {
    // hub-greeting-button-polish 2026-05-30 — bumped from
    // 0.95rem 2.1rem / 1.08rem / 13rem to 1.2rem 2.6rem / 1.22rem /
    // 15rem so the CTA reads as a stronger landing affordance.
    const block = ruleBlock('.hub-greeting__work-mode-btn.hub-btn,');
    expect(block).toMatch(/padding:\s*1\.2rem\s+2\.6rem/);
    expect(block).toMatch(/font-size:\s*1\.22rem/);
    expect(block).toMatch(/font-weight:\s*700/);
    expect(block).toMatch(/min-width:\s*15rem/);
  });

  it('has a layered green-tinted shadow so it pops off the navy', () => {
    const block = ruleBlock('.hub-greeting__work-mode-btn.hub-btn,');
    expect(block).toMatch(/box-shadow:[\s\S]*?rgba\(16,\s*185,\s*129/);
  });

  it('hover lifts the CTA via translateY(-2px) + brightness(1.05) + a bigger glow', () => {
    const block = ruleBlock('.hub-greeting__work-mode-btn.hub-btn:hover,');
    expect(block).not.toBe('');
    expect(block).toMatch(/transform:\s*translateY\(-2px\)/);
    expect(block).toMatch(/filter:\s*brightness\(1\.05\)/);
    expect(block).toMatch(/box-shadow:[\s\S]*?rgba\(16,\s*185,\s*129/);
  });

  it('hover ENLARGES the CTA (scale) on top of the lift', () => {
    const block = ruleBlock('.hub-greeting__work-mode-btn.hub-btn:hover,');
    expect(block).toMatch(/transform:\s*translateY\(-2px\)\s+scale\(/);
  });
});

describe('Enter Work Mode CTA — stationary border, spinning colors', () => {
  // The red/white/blue frame must be a FIXED ring whose COLORS cycle.
  // Achieved by animating the conic-gradient `from` angle (a registered
  // @property), NOT by rotating the ::before element (which spins the
  // whole stadium-shaped ring geometry — the bug we're fixing).
  it('registers the --wm-border-angle custom property as an <angle>', () => {
    const prop = css.match(/@property\s+--wm-border-angle\s*\{[\s\S]*?\}/);
    expect(prop).not.toBeNull();
    expect(prop![0]).toMatch(/syntax:\s*'<angle>'/);
    expect(prop![0]).toMatch(/initial-value:\s*0deg/);
  });

  it('the ::before ring fills a conic-gradient driven by the angle property', () => {
    const block = ruleBlock('.hub-greeting__work-mode-btn.hub-btn::before');
    expect(block).not.toBe('');
    expect(block).toMatch(/conic-gradient\(\s*from\s+var\(--wm-border-angle/);
    // The ring must NOT be rotated as an element (that spins the shape).
    expect(block).not.toMatch(/transform:\s*rotate/);
  });

  it('the spin keyframe animates the gradient angle, not an element rotation', () => {
    const kf = css.match(/@keyframes\s+hub-greeting-work-mode-spin\s*\{[\s\S]*?\}\s*\}/);
    expect(kf).not.toBeNull();
    expect(kf![0]).toMatch(/--wm-border-angle:\s*360deg/);
    expect(kf![0]).not.toMatch(/transform:\s*rotate/);
  });

  it('the animation only runs on hover / focus-visible (calm at rest)', () => {
    const block = ruleBlock('.hub-greeting__work-mode-btn.hub-btn:hover::before,');
    expect(block).toMatch(/opacity:\s*1/);
    expect(block).toMatch(/animation:\s*hub-greeting-work-mode-spin/);
  });

  it('active state presses the CTA back to the base + dims slightly so the click registers', () => {
    const block = ruleBlock('.hub-greeting__work-mode-btn.hub-btn:active,');
    expect(block).not.toBe('');
    expect(block).toMatch(/transform:\s*translateY\(0\)/);
    expect(block).toMatch(/filter:\s*brightness\(0\.97\)/);
    // Faster transition on press for a snappy click feel.
    expect(block).toMatch(/transition:\s*transform\s+80ms/);
  });

  it('keyboard focus shows a 2px white ring with 3px offset', () => {
    const block = ruleBlock('.hub-greeting__work-mode-btn.hub-btn:focus-visible,');
    expect(block).not.toBe('');
    expect(block).toMatch(/outline:\s*2px solid #ffffff/i);
    expect(block).toMatch(/outline-offset:\s*3px/);
  });
});

describe('Greeting actions column — centered', () => {
  it('actions column centers its children so the CTA anchors the card', () => {
    const block = css.match(/\.hub-greeting__actions\s*\{[\s\S]*?\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/justify-content:\s*center/);
    expect(block![0]).toMatch(/align-items:\s*center/);
  });
});
