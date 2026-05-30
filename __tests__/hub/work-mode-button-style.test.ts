// __tests__/hub/work-mode-button-style.test.ts
//
// Locks the source-level styling of the "Enter Work Mode" CTA: white
// text + a solid white border, no spinning gradient. The original
// Slice-1 version had a hover-only spinning red/white/blue conic ring;
// a 2026-05-30 follow-up removed it (the user disliked it) and kept
// the label plain white. Source-regex on AdminMe.css since CSS rules
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
    // Slice the hover rule from its selector to the next closing brace
    // after stripping comments (a comment in the block carries a stray
    // `{` that would otherwise truncate a naive block regex).
    const noComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const start = noComments.indexOf('.hub-greeting__work-mode-btn.hub-btn:hover,');
    const block = start >= 0
      ? noComments.slice(start, noComments.indexOf('}', start) + 1)
      : '';
    expect(block).not.toBe('');
    expect(block).toMatch(/color:\s*#FFFFFF\s*!important/i);
  });
});

describe('Work Mode button — the spinning gradient is gone', () => {
  it('no longer declares the --wm-angle @property', () => {
    expect(CSS).not.toMatch(/@property --wm-angle/);
  });

  it('no longer defines the wm-spin keyframes', () => {
    expect(CSS).not.toMatch(/@keyframes wm-spin/);
  });

  it('no longer paints a conic-gradient ring or label fill', () => {
    expect(CSS).not.toMatch(/conic-gradient/);
  });

  it('no longer renders a ::before ring pseudo on the button', () => {
    expect(BTN_REGION).not.toMatch(/work-mode-btn\.hub-btn::before/);
  });

  it('no longer clips a gradient through the label text', () => {
    expect(CSS).not.toMatch(/-webkit-text-fill-color:\s*transparent/);
    expect(BTN_REGION).not.toMatch(/background-clip:\s*text/);
  });
});
