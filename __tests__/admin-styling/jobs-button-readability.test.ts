// __tests__/admin-styling/jobs-button-readability.test.ts
//
// User feedback (button-readability-2026-06-17): "the +new job
// button needs to have white text, not blue and black …  Also,
// for the text that appears on hover, put it into a popup text
// tip on cursor hover, not text that shifts everything around.
// Make the text in the tool tip wrap on multiple lines."
//
// Root cause for the unreadable button: the .admin-layout `<a>`
// color rule had higher specificity than .jobs-page__btn--primary,
// so the global rule's navy color wins over the button's white. The
// fix excludes [class*="jobs-page__btn"] from the global rule's
// :not() chain so the button CSS wins.
//
// The hover-tooltip is already a fixed-position popup via the
// research-tip CSS (white text on dark gray, multiline). This test
// also locks the wrap/multiline contract so a future tooltip
// refactor can't regress to text-that-shifts-the-layout.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('AdminLayout — jobs-page button class is excluded from the global anchor tint', () => {
  const CSS = read('app/admin/styles/AdminLayout.css');

  it('the resting color rule excludes [class*="-btn"] (catches every button-shaped anchor in the admin)', () => {
    expect(CSS).toMatch(
      /\.admin-layout a:not\(\.btn\)[\s\S]*?:not\(\[class\*="-btn"\]\)\s*\{[\s\S]*?color:\s*var\(--color-brand-navy/,
    );
  });

  it('the hover color rule excludes [class*="-btn"]', () => {
    expect(CSS).toMatch(
      /\.admin-layout a:not\(\.btn\)[\s\S]*?:not\(\[class\*="-btn"\]\):hover\s*\{[\s\S]*?color:\s*var\(--color-brand-navy-d/,
    );
  });
});

describe('AdminJobs — primary action button stays white-on-navy', () => {
  const CSS = read('app/admin/styles/AdminJobs.css');

  it('the primary button declares white text on a navy background', () => {
    expect(CSS).toMatch(/\.jobs-page__btn--primary\s*\{[\s\S]*?background:\s*var\(--color-brand-navy\);[\s\S]*?color:\s*#fff/);
  });

  it('the header-actions row is align-items: center so the Tooltip <span> wrappers do not stretch + shift the buttons', () => {
    expect(CSS).toMatch(/\.jobs-page__header-actions\s*\{[\s\S]*?align-items:\s*center/);
  });
});

// WHY THIS BLOCK READS AdminLayout.css AND NOT AdminResearch.css.
//
// It used to read AdminResearch.css, because that is where the tooltip was born. Slice
// button-tooltip-portal-2026-06-20 moved the CSS to AdminLayout.css so the popup would work on
// every admin page rather than only /admin/research — but the old copy was never deleted, and
// AdminResearch.css loads AFTER AdminLayout.css on research routes. So the superseded rules kept
// winning on exactly the pages the tooltip was written for, and THIS TEST WAS WHAT HELD THEM
// THERE: it asserted against the stale file, so deleting the dead copy looked like a regression.
//
// A test pinned to the wrong file is worse than no test. It went green for two months while the
// thing it described was not what rendered. Pointed at the live rules 2026-08-23, with the values
// the live rules actually use (320px, not the old 300px).
describe('Research tooltip — multiline popup, not layout-shifting text', () => {
  const CSS = read('app/admin/styles/AdminLayout.css');

  it('the tooltip is position: fixed so it cannot reflow the page on hover', () => {
    expect(CSS).toMatch(/\.research-tip\s*\{[\s\S]*?position:\s*fixed/);
  });

  it("pointer-events: none — hovering the tooltip itself can't re-trigger anything", () => {
    expect(CSS).toMatch(/\.research-tip\s*\{[\s\S]*?pointer-events:\s*none/);
  });

  it('the tooltip wraps onto multiple lines (max-width + word-wrap)', () => {
    expect(CSS).toMatch(/\.research-tip\s*\{[\s\S]*?max-width:\s*320px/);
    expect(CSS).toMatch(/\.research-tip\s*\{[\s\S]*?word-wrap:\s*break-word/);
    expect(CSS).toMatch(/\.research-tip\s*\{[\s\S]*?white-space:\s*normal/);
  });

  it('the tooltip text is light (#F9FAFB) on dark (#1F2937) so it stays readable', () => {
    expect(CSS).toMatch(/\.research-tip\s*\{[\s\S]*?color:\s*#F9FAFB/);
    expect(CSS).toMatch(/\.research-tip\s*\{[\s\S]*?background:\s*#1F2937/);
  });

  // The point of the move: one definition. If a second one reappears in a route-scoped sheet it
  // will load later and win, and this whole block goes back to describing something invisible.
  it('is declared once — no route-scoped stylesheet redeclares it', () => {
    const scoped = read('app/admin/styles/AdminResearch.css');
    expect(scoped).not.toMatch(/^\.research-tip\s*\{/m);
    expect(scoped).not.toMatch(/^\.research-tip-wrap\s*\{/m);
    expect(scoped).not.toMatch(/^\.research-tip__shortcut\s*\{/m);
  });
});

describe('Jobs page wires the popup Tooltip around the header buttons', () => {
  const SRC = read('app/admin/jobs/page.tsx');

  it('imports the Tooltip component', () => {
    expect(SRC).toMatch(/import Tooltip from '\.\.\/research\/components\/Tooltip'/);
  });

  it('wraps the Import Legacy + New Job buttons with <Tooltip text="…" position="bottom">', () => {
    expect(SRC).toMatch(/<Tooltip text="[^"]*Import historical surveys[\s\S]*?<Link href="\/admin\/jobs\/import"/);
    expect(SRC).toMatch(/<Tooltip text="[^"]*Create a new survey job[\s\S]*?<Link href="\/admin\/jobs\/new"/);
  });
});
