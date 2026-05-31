// __tests__/hub/work-mode-button-style.test.ts
//
// Locks the source-level styling of the "Enter Work Mode" CTA.
//
// Timeline:
//   - Original: white text + solid white border + a hover-only
//     spinning red/white/blue conic ring.
//   - 2026-05-30 follow-up #1: user removed the spinning ring (felt
//     too busy).
//   - 2026-05-30 follow-up #2 (hub-greeting-button-polish): user
//     asked for the spinning border BACK on hover, the button
//     bigger, and vertical-centered in the panel. This file locks
//     the new contract.
//
// Source-regex on AdminMe.css since CSS rules can't be meaningfully
// asserted in jsdom.

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

describe('Work Mode button — white text + solid white border', () => {
  it('keeps the label white at rest, pinned with !important over the global anchor color', () => {
    expect(BTN_REGION).toMatch(/color:\s*#FFFFFF\s*!important/i);
  });

  it('uses a SOLID white border (not the old transparent border-color)', () => {
    expect(BTN_REGION).toMatch(/border:\s*2px solid #FFFFFF/i);
  });

  it('targets :link / :visited so an <a> in either state stays white', () => {
    expect(BTN_REGION).toMatch(/\.hub-greeting__work-mode-btn\.hub-btn:link/);
    expect(BTN_REGION).toMatch(/\.hub-greeting__work-mode-btn\.hub-btn:visited/);
  });

  it('keeps the label white on hover too', () => {
    const noComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const start = noComments.indexOf('.hub-greeting__work-mode-btn.hub-btn:hover,');
    const block = start >= 0
      ? noComments.slice(start, noComments.indexOf('}', start) + 1)
      : '';
    expect(block).not.toBe('');
    expect(block).toMatch(/color:\s*#FFFFFF\s*!important/i);
  });
});

describe('Work Mode button — hover-only spinning red/white/blue ring (2026-05-30 follow-up #2)', () => {
  it('paints a conic-gradient ring on a ::before pseudo of the button', () => {
    expect(CSS).toMatch(/\.hub-greeting__work-mode-btn\.hub-btn::before\s*\{[\s\S]*?conic-gradient\(/);
  });

  it('the ring is hidden at rest (opacity: 0) so the button reads calm', () => {
    const start = CSS.indexOf('.hub-greeting__work-mode-btn.hub-btn::before');
    const end = CSS.indexOf('}', start);
    const pseudo = start >= 0 ? CSS.slice(start, end + 1) : '';
    expect(pseudo).toMatch(/opacity:\s*0/);
  });

  it('reveals + spins the ring on :hover and :focus-visible', () => {
    expect(CSS).toMatch(/\.hub-greeting__work-mode-btn\.hub-btn:hover::before[\s\S]*?animation:\s*hub-greeting-work-mode-spin/);
    expect(CSS).toMatch(/\.hub-greeting__work-mode-btn\.hub-btn:focus-visible::before/);
  });

  it('declares the spin keyframes', () => {
    expect(CSS).toMatch(/@keyframes hub-greeting-work-mode-spin/);
  });

  it('honors prefers-reduced-motion (no animation when the user opted out)', () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation:\s*none/);
  });
});

describe('Work Mode button — vertical centering in the greeting actions column', () => {
  it('actions column stretches to the panel full height so align-items: center actually centers', () => {
    const start = CSS.indexOf('.hub-greeting__actions {');
    const end = CSS.indexOf('}', start);
    const block = start >= 0 ? CSS.slice(start, end + 1) : '';
    expect(block).toMatch(/align-self:\s*stretch/);
    expect(block).toMatch(/align-items:\s*center/);
  });
});
