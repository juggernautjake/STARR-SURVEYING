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
const css = fs.readFileSync(CSS_PATH, 'utf8');

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
    const blockMatch = css.match(
      /\.hub-greeting__work-mode-btn\.hub-btn,[\s\S]*?\.hub-greeting__work-mode-btn\.hub-btn--primary\s*\{[\s\S]*?\}/,
    );
    expect(blockMatch).not.toBeNull();
    expect(blockMatch![0]).toMatch(/background:\s*var\(--gradient-green\)/);
    expect(blockMatch![0]).toMatch(/color:\s*#FFFFFF/i);
  });

  it('uses a fully rounded pill (border-radius: 9999px)', () => {
    const blockMatch = css.match(
      /\.hub-greeting__work-mode-btn\.hub-btn,[\s\S]*?\.hub-greeting__work-mode-btn\.hub-btn--primary\s*\{[\s\S]*?\}/,
    );
    expect(blockMatch![0]).toMatch(/border-radius:\s*9999px/);
  });

  it('has larger padding (0.95rem 2.1rem) + heavier weight + min-width so it reads as the primary CTA', () => {
    const blockMatch = css.match(
      /\.hub-greeting__work-mode-btn\.hub-btn,[\s\S]*?\.hub-greeting__work-mode-btn\.hub-btn--primary\s*\{[\s\S]*?\}/,
    );
    expect(blockMatch![0]).toMatch(/padding:\s*0\.95rem\s+2\.1rem/);
    expect(blockMatch![0]).toMatch(/font-weight:\s*700/);
    expect(blockMatch![0]).toMatch(/min-width:\s*13rem/);
  });

  it('has a layered green-tinted shadow so it pops off the navy', () => {
    const blockMatch = css.match(
      /\.hub-greeting__work-mode-btn\.hub-btn,[\s\S]*?\.hub-greeting__work-mode-btn\.hub-btn--primary\s*\{[\s\S]*?\}/,
    );
    expect(blockMatch![0]).toMatch(/box-shadow:[\s\S]*?rgba\(16,\s*185,\s*129/);
  });

  it('hover lifts the CTA via translateY(-2px) + brightness(1.05) + a bigger glow', () => {
    const hoverMatch = css.match(
      /\.hub-greeting__work-mode-btn\.hub-btn:hover,[\s\S]*?\.hub-greeting__work-mode-btn\.hub-btn--primary:hover\s*\{[\s\S]*?\}/,
    );
    expect(hoverMatch).not.toBeNull();
    expect(hoverMatch![0]).toMatch(/transform:\s*translateY\(-2px\)/);
    expect(hoverMatch![0]).toMatch(/filter:\s*brightness\(1\.05\)/);
    expect(hoverMatch![0]).toMatch(/box-shadow:[\s\S]*?rgba\(16,\s*185,\s*129/);
  });

  it('active state presses the CTA back to the base + dims slightly so the click registers', () => {
    const activeMatch = css.match(
      /\.hub-greeting__work-mode-btn\.hub-btn:active,[\s\S]*?\.hub-greeting__work-mode-btn\.hub-btn--primary:active\s*\{[\s\S]*?\}/,
    );
    expect(activeMatch).not.toBeNull();
    expect(activeMatch![0]).toMatch(/transform:\s*translateY\(0\)/);
    expect(activeMatch![0]).toMatch(/filter:\s*brightness\(0\.97\)/);
    // Faster transition on press for a snappy click feel.
    expect(activeMatch![0]).toMatch(/transition:\s*transform\s+80ms/);
  });

  it('keyboard focus shows a 2px white ring with 3px offset', () => {
    const focusMatch = css.match(
      /\.hub-greeting__work-mode-btn\.hub-btn:focus-visible,[\s\S]*?\.hub-greeting__work-mode-btn\.hub-btn--primary:focus-visible\s*\{[\s\S]*?\}/,
    );
    expect(focusMatch).not.toBeNull();
    expect(focusMatch![0]).toMatch(/outline:\s*2px solid #ffffff/i);
    expect(focusMatch![0]).toMatch(/outline-offset:\s*3px/);
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
