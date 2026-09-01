// __tests__/admin/portal-tab-keyboard.test.ts
//
// ── SEVENTEEN PORTALS, FOURTEEN COPIES OF THE SAME EIGHT LINES, NONE WITH HOME ──────────────────
//
// E1b, from `RESEARCH_UI_OVERHAUL_2026-08-30.md`, and the last engineering item left open in it.
//
// `role="tablist"` is a PROMISE about the keyboard. A screen reader announces "tab 2 of 7", so the
// user reaches for an arrow key, because that is what the role MEANS. Measured 2026-08-31: three of
// seventeen admin portals declared the role and implemented none of the behaviour, and the other
// fourteen each hand-rolled the same eight lines — not one of them handling Home or End.
//
// A bar with no roving `tabIndex` is worse still: every tab becomes its own Tab stop, so reaching
// the panel behind a seven-tab bar takes eight presses. Plain buttons would have been more honest.
//
// `usePortalTabs` returns `tabKeyDown` and has since the research portal needed it. Fifteen portals
// now spread it. This file is why a sixteenth cannot quietly hand-roll a ninth copy.
//
// ── WHY THIS IS A SOURCE SCAN AND NOT A RENDER TEST ─────────────────────────────────────────────
//
// This repository has no DOM test environment on purpose — components render through
// `react-dom/server` under `environment: 'node'`, so a keydown cannot be dispatched at a rendered
// bar. `tab-keyboard.ts` is built around that: everything that can be wrong in an interesting way
// (the wrap at both ends, Home/End, an unknown current id, a one-tab bar) lives in a pure function
// with its own tests, and what is left in the hook is a query and a `.focus()`.
//
// So the thing worth asserting here is the WIRING, which a source scan can see exactly.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** Every admin page that builds a tab bar from the shared hook. */
function portalPages(): string[] {
  const out: string[] = [];
  const base = path.join(ROOT, 'app', 'admin');
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(base, entry.name, 'page.tsx');
    if (!fs.existsSync(file)) continue;
    if (!fs.readFileSync(file, 'utf8').includes('usePortalTabs')) continue;
    out.push(path.relative(ROOT, file).replace(/\\/g, '/'));
  }
  return out;
}

/** Comments blanked, length-preserving. Every one of these files now explains the change. */
const stripJs = (src: string) =>
  src
    // Anchored: an unanchored `/*` strip starts a comment inside a string containing `*/` — a MIME
    // type like `application/json, text/plain, */*` blanked six thousand characters of the worker's
    // bis-cad.ts before this was noticed. Every real block comment here begins a line.
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));

const pages = portalPages();

describe('every portal tab bar uses the shared keyboard', () => {
  it('control: the scan found the portals', () => {
    // Without this, every assertion below passes against an empty list — the failure mode that has
    // hit this repository more than a dozen times.
    expect(pages.length, 'no admin portal pages found').toBeGreaterThanOrEqual(15);
    expect(pages).toContain('app/admin/jobs/page.tsx');
    expect(pages).toContain('app/admin/settings/page.tsx');
  });

  it('none of them hand-rolls the arrow dance any more', () => {
    // The tell is a raw `ArrowRight` comparison in a page that has a tab bar. `tabMoveTarget` is the
    // only place that string belongs.
    const handRolled = pages.filter((p) => /['"]ArrowRight['"]/.test(stripJs(fs.readFileSync(path.join(ROOT, p), 'utf8'))));
    expect(handRolled,
      `these portals compare arrow keys themselves instead of using tabKeyDown:\n  ${handRolled.join('\n  ')}`)
      .toEqual([]);
  });

  it('control: that scan would notice a hand-rolled handler', () => {
    expect(/['"]ArrowRight['"]/.test("if (e.key !== 'ArrowRight') return;")).toBe(true);
    expect(/['"]ArrowRight['"]/.test('onKeyDown={tabKeyDown}')).toBe(false);
  });

  it('each one spreads tabKeyDown onto its tab button', () => {
    const missing = pages.filter((p) => !stripJs(fs.readFileSync(path.join(ROOT, p), 'utf8')).includes('onKeyDown={tabKeyDown}'));
    expect(missing, `these portals have a tab bar and no keyboard:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('and carries data-tab-id, which is how the helper finds the siblings', () => {
    // Without it `siblingTabs` reads an empty id off every tab, `tabMoveTarget` cannot locate the
    // current one, and it returns null — arrow keys silently do nothing. The handler would be
    // present and useless, which is the worst of the three states.
    const missing = pages.filter((p) => !stripJs(fs.readFileSync(path.join(ROOT, p), 'utf8')).includes('data-tab-id='));
    expect(missing, `these portals wire the handler but give it nothing to read:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('every tab bar declares the role it behaves like', () => {
    const missing = pages.filter((p) => !stripJs(fs.readFileSync(path.join(ROOT, p), 'utf8')).includes('role="tablist"'));
    expect(missing, `these have keyboard behaviour and do not announce it:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('and a roving tabIndex, so the bar is one Tab stop and not fourteen', () => {
    const missing = pages.filter((p) => !/tabIndex=\{[^}]*\? 0 : -1\}/.test(stripJs(fs.readFileSync(path.join(ROOT, p), 'utf8'))));
    expect(missing, `these make every tab its own Tab stop:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('control: the roving-tabIndex pattern is what it looks for', () => {
    expect(/tabIndex=\{[^}]*\? 0 : -1\}/.test('tabIndex={isActive ? 0 : -1}')).toBe(true);
    expect(/tabIndex=\{[^}]*\? 0 : -1\}/.test('tabIndex={0}')).toBe(false);
  });
});

describe('the hook still offers what the portals depend on', () => {
  const hook = fs.readFileSync(path.join(ROOT, 'lib/admin/portal/usePortalTabs.ts'), 'utf8');

  it('returns tabKeyDown', () => {
    expect(hook).toMatch(/tabKeyDown/);
    expect(hook).toMatch(/return \{[^}]*tabKeyDown[^}]*\}/);
  });

  it('reads data-tab-id rather than assuming an id convention', () => {
    // An id-based lookup that drifts focuses NOTHING, which looks exactly like arrow keys never
    // having been wired — and the seventeen portals do not share an id scheme.
    expect(hook).toContain("getAttribute('data-tab-id')");
  });

  it('and goes through the shared pure helper', () => {
    expect(hook).toContain('tabMoveTarget(');
    expect(hook).toContain('siblingTabs(');
  });
});
