// __tests__/branding/demo-optout.test.ts
//
// ── AN ESCAPE HATCH NOBODY COUNTS BECOMES A HIDING PLACE ────────────────────────────────────────
//
// `_contrast-audit-probe.mjs` now skips anything inside `[data-demo="fail"]`. That was the right
// call — /admin/branding renders six pairings that MUST never ship, in their real colours, and a
// tile whose whole job is to demonstrate 1.71:1 genuinely measures 1.71:1 — but it is also the
// first opt-out the contrast instrument has ever had, and every opt-out is one `data-demo` away
// from being how a real failure gets silenced.
//
// So it is capped and located. There may be a small number, they must all live in the never-pair
// block of the branding portal, and the count is a ratchet that may only go down. If a future slice
// needs a seventh, the reviewer sees this number change rather than a quiet attribute appearing in
// a diff.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NEVER_PAIR } from '@/lib/branding/palette';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Every file in the app that opts out of the contrast probe. */
function optOutSites(): { file: string; count: number }[] {
  const hits: { file: string; count: number }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        walk(rel);
      } else if (/\.(tsx|jsx|css|html)$/.test(entry.name)) {
        const n = read(rel).split('data-demo="fail"').length - 1;
        if (n > 0) hits.push({ file: rel, count: n });
      }
    }
  };
  walk('app');
  return hits;
}

describe('the contrast probe honours the opt-out', () => {
  const probe = read('scripts/_contrast-audit-probe.mjs');

  it('and skips the element AND anything inside it', () => {
    // `.closest()` rather than an attribute read: the tile carries the marker and the two spans
    // inside it are what actually own the text, so checking only the element itself would skip
    // nothing at all.
    expect(probe).toContain(`el.closest('[data-demo="fail"]')`);
  });

  it('the skip is explained where somebody removing it would read', () => {
    const at = probe.indexOf('data-demo="fail"');
    const before = probe.slice(Math.max(0, at - 1200), at);
    expect(before, 'the opt-out has no rationale beside it').toMatch(/DELIBERATE DEMONSTRATION/);
  });

  it('control: the probe still measures ordinary elements', () => {
    // If the guard were written `if (el.closest(...)) return;` at the top of the whole function
    // with a typo'd selector that matched everything, the sweep would go green and mean nothing.
    // `#brand-portal` is not a demo marker and must not appear as one.
    expect(probe).not.toContain(`el.closest('[data-demo]')`);
    expect(probe).toContain('unreadable.push');
  });
});

describe('the opt-out is capped and located', () => {
  const sites = optOutSites();
  const total = sites.reduce((n, s) => n + s.count, 0);

  /**
   * MAY ONLY GO DOWN.
   *
   *   6  measured 2026-09-01, when the branding portal shipped — one per NEVER_PAIR entry.
   *
   * Raising it is not a maintenance step. Every one of these is a place the contrast instrument has
   * been told to look away, and the only honest reason to add another is a second block that
   * demonstrates failure on purpose.
   */
  const OPT_OUT_BUDGET = 6;

  it(`there are no more than ${OPT_OUT_BUDGET} opt-outs in the whole app`, () => {
    expect(total, `data-demo="fail" appears ${total} times:\n  ${sites.map((s) => `${s.count}  ${s.file}`).join('\n  ')}`)
      .toBeLessThanOrEqual(OPT_OUT_BUDGET);
  });

  it('and every one of them is in the branding portal', () => {
    const strays = sites.filter((s) => !s.file.includes('admin/branding'));
    expect(strays, `contrast opt-outs outside the brand guide:\n  ${strays.map((s) => s.file).join('\n  ')}`)
      .toEqual([]);
  });

  it('specifically in the never-pair block, which is the only thing entitled to fail', () => {
    const src = read('app/admin/branding/_tabs/ColoursTab.tsx');
    const at = src.indexOf('data-demo="fail"');
    expect(at, 'the opt-out moved out of ColoursTab').toBeGreaterThan(-1);
    // The marker must sit inside the NEVER_PAIR render, not somewhere convenient.
    const before = src.slice(0, at);
    expect(before).toContain('NEVER_PAIR.map');
  });

  it('control: the scan finds the real sites rather than passing on an empty list', () => {
    // A walk that silently found nothing would satisfy every assertion above.
    expect(sites.length, 'the opt-out scan found no files at all').toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);
  });

  it('one marker renders per banned pair, so the budget tracks the list', () => {
    // The budget is 6 because NEVER_PAIR has 6 entries and the tile is rendered once each. Tying
    // them together means adding a seventh banned pair fails here with an obvious reason rather
    // than looking like an unexplained ratchet breach.
    expect(NEVER_PAIR.length).toBe(OPT_OUT_BUDGET);
  });
});
