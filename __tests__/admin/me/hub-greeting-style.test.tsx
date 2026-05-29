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

describe('Enter Work Mode CTA — green pill', () => {
  it('overrides the generic primary chrome with the success color', () => {
    const blockMatch = css.match(
      /\.hub-greeting__work-mode-btn\.hub-btn,[\s\S]*?\.hub-greeting__work-mode-btn\.hub-btn--primary\s*\{[\s\S]*?\}/,
    );
    expect(blockMatch).not.toBeNull();
    expect(blockMatch![0]).toMatch(/background:\s*var\(--color-success\)/);
    expect(blockMatch![0]).toMatch(/color:\s*#FFFFFF/i);
  });

  it('uses a fully rounded pill (border-radius: 9999px)', () => {
    const blockMatch = css.match(
      /\.hub-greeting__work-mode-btn\.hub-btn,[\s\S]*?\.hub-greeting__work-mode-btn\.hub-btn--primary\s*\{[\s\S]*?\}/,
    );
    expect(blockMatch![0]).toMatch(/border-radius:\s*9999px/);
  });

  it('uses larger padding + heavier weight + min-width so it reads as the primary CTA', () => {
    const blockMatch = css.match(
      /\.hub-greeting__work-mode-btn\.hub-btn,[\s\S]*?\.hub-greeting__work-mode-btn\.hub-btn--primary\s*\{[\s\S]*?\}/,
    );
    expect(blockMatch![0]).toMatch(/padding:\s*0\.85rem\s+2rem/);
    expect(blockMatch![0]).toMatch(/font-weight:\s*700/);
    expect(blockMatch![0]).toMatch(/min-width:\s*12rem/);
  });

  it('has a glow shadow tied to the success color so it pops off the navy', () => {
    const blockMatch = css.match(
      /\.hub-greeting__work-mode-btn\.hub-btn,[\s\S]*?\.hub-greeting__work-mode-btn\.hub-btn--primary\s*\{[\s\S]*?\}/,
    );
    expect(blockMatch![0]).toMatch(/box-shadow:[\s\S]*?rgba\(16,\s*185,\s*129/);
  });

  it('hover state darkens the green + lifts the shadow', () => {
    const hoverMatch = css.match(
      /\.hub-greeting__work-mode-btn\.hub-btn:hover,[\s\S]*?\.hub-greeting__work-mode-btn\.hub-btn--primary:hover\s*\{[\s\S]*?\}/,
    );
    expect(hoverMatch).not.toBeNull();
    expect(hoverMatch![0]).toMatch(/background:\s*#059669/);
    expect(hoverMatch![0]).toMatch(/transform:\s*translateY\(-1px\)/);
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
