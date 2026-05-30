// __tests__/hub/work-mode-button-style.test.ts
//
// Slice 1 of employee-hub-overhaul-2026-05-30.md. Locks the
// source-level styling of the "Enter Work Mode" CTA: white text, a
// SOLID white border at rest, and a hover-only spinning red/white/blue
// conic-gradient ring with a prefers-reduced-motion fallback that
// stops the spin. Source-regex on AdminMe.css since CSS animations
// can't be meaningfully asserted in jsdom.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS = fs.readFileSync(
  path.join(__dirname, '..', '..', 'app', 'admin', 'me', 'AdminMe.css'),
  'utf8',
);

// Pull just the work-mode-btn region so assertions don't accidentally
// match unrelated rules elsewhere in the file.
const BTN_REGION = (() => {
  const start = CSS.indexOf('.hub-greeting__work-mode-btn.hub-btn,');
  const end = CSS.indexOf('/* ── Buttons (shared across hub panels)');
  return start >= 0 && end > start ? CSS.slice(start, end) : CSS;
})();

describe('Slice 1 — Work Mode button rest state', () => {
  it('keeps white text', () => {
    expect(BTN_REGION).toMatch(/color:\s*#FFFFFF/i);
  });

  it('uses a SOLID white border (not the old transparent border-color)', () => {
    expect(BTN_REGION).toMatch(/border:\s*2px solid #FFFFFF/i);
  });

  it('no longer sets border-color: transparent on the rest rule', () => {
    // The rest-state block is the first chunk before the @property rule.
    const rest = BTN_REGION.slice(0, BTN_REGION.indexOf('@property'));
    expect(rest).not.toMatch(/border-color:\s*transparent/i);
  });
});

describe('Slice 1 — spinning tri-color hover ring', () => {
  it('declares an animatable --wm-angle custom property', () => {
    expect(CSS).toMatch(/@property --wm-angle\s*\{[\s\S]*?syntax:\s*'<angle>';[\s\S]*?\}/);
  });

  it('defines the wm-spin keyframes driving the angle to 360deg', () => {
    expect(CSS).toMatch(/@keyframes wm-spin\s*\{[\s\S]*?--wm-angle:\s*360deg;[\s\S]*?\}/);
  });

  it('paints a conic-gradient ring from the animated angle with red, white, and blue', () => {
    const conic = CSS.match(/background:\s*conic-gradient\(\s*from var\(--wm-angle\)[\s\S]*?\);/);
    expect(conic).not.toBeNull();
    const ring = conic![0];
    expect(ring).toMatch(/#E11D2A/i); // red
    expect(ring).toMatch(/#FFFFFF/i); // white
    expect(ring).toMatch(/#2447D6/i); // blue
  });

  it('masks the pseudo so only the rim shows (mask-composite: exclude)', () => {
    expect(BTN_REGION).toMatch(/mask-composite:\s*exclude/);
  });

  it('reveals + spins the ring only on hover via ::before', () => {
    expect(BTN_REGION).toMatch(
      /:hover::before[\s\S]*?opacity:\s*1;[\s\S]*?animation:\s*wm-spin\s+2\.4s\s+linear\s+infinite;/,
    );
  });

  it('keeps the ring hidden (opacity 0) at rest', () => {
    expect(BTN_REGION).toMatch(/::before[\s\S]*?opacity:\s*0;/);
  });
});

describe('Slice 1 — reduced-motion fallback', () => {
  it('disables the spin animation under prefers-reduced-motion', () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?:hover::before[\s\S]*?animation:\s*none;[\s\S]*?\}/,
    );
  });
});

describe('2026-05-30 follow-up — white text wins over the global anchor color', () => {
  it('pins the rest-state label white with !important (beats globals.css a{color:var(--brand-red)})', () => {
    expect(BTN_REGION).toMatch(/color:\s*#FFFFFF\s*!important/i);
  });

  it('targets :link / :visited so an <a> in either state stays white', () => {
    expect(BTN_REGION).toMatch(/\.hub-greeting__work-mode-btn\.hub-btn:link/);
    expect(BTN_REGION).toMatch(/\.hub-greeting__work-mode-btn\.hub-btn:visited/);
  });
});

describe('2026-05-30 follow-up — hover gradient bleeds through the label text', () => {
  it('declares a label rule that clips a conic gradient to the glyphs on hover', () => {
    const labelHover = CSS.match(
      /:hover \.hub-greeting__work-mode-label[\s\S]*?\}/,
    );
    expect(labelHover).not.toBeNull();
    const block = labelHover![0];
    expect(block).toMatch(/conic-gradient\(\s*from var\(--wm-angle\)/);
    expect(block).toMatch(/background-clip:\s*text/);
    expect(block).toMatch(/-webkit-text-fill-color:\s*transparent/);
    expect(block).toMatch(/animation:\s*wm-spin\s+2\.4s\s+linear\s+infinite/);
  });

  it('the hover-label gradient uses the same red/white/blue stops as the ring', () => {
    const labelHover = CSS.match(/:hover \.hub-greeting__work-mode-label[\s\S]*?\}/)![0];
    expect(labelHover).toMatch(/#E11D2A/i);
    expect(labelHover).toMatch(/#FFFFFF/i);
    expect(labelHover).toMatch(/#2447D6/i);
  });

  it('stops spinning the label gradient under prefers-reduced-motion', () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.hub-greeting__work-mode-label[\s\S]*?animation:\s*none;[\s\S]*?\}/,
    );
  });
});
