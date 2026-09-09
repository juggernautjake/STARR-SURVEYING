// __tests__/admin/motion-system.test.ts — the motion system is loaded, used, and does not sprawl again.
//
// Owner, 2026-09-09: motion and styling must be "consistent and recognizable … clearly defined".
// docs/style/MOTION_SYSTEM.md is the definition; app/styles/motion.css is the code. This file keeps
// the two reference surfaces on the system and turns the keyframe count into a ratchet: measured at
// 218 declarations across app/**/*.css when the system shipped (207 distinct names — the same
// fade/rise/pulse written twenty times over, in sheets that override one another because keyframe
// names are global). It may only go down.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readSource } from '../helpers/read-source';

const ROOT = process.cwd();
const MOTION = 'app/styles/motion.css';
const REFERENCE_SHEETS = [
  'app/admin/components/listing/Listing.css',
  'app/admin/research/components/NewResearchProjectModal.css',
];

function walkCss(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walkCss(p, out); }
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

describe('the motion system is loaded once, after the tokens', () => {
  it('app/layout.tsx imports motion.css right after tokens.css', () => {
    const layout = readSource('app/layout.tsx');
    const tokensAt = layout.search(/import '\.\/styles\/tokens\.css'/);
    const motionAt = layout.search(/import '\.\/styles\/motion\.css'/);
    expect(tokensAt).toBeGreaterThan(-1);
    expect(motionAt).toBeGreaterThan(-1);
    expect(motionAt).toBeGreaterThan(tokensAt);
  });
  it('defines every token the document names', () => {
    const css = readSource(MOTION);
    for (const t of ['--motion-instant', '--motion-fast', '--motion-base', '--motion-slow', '--motion-stagger', '--ease-out', '--ease-in', '--ease-in-out', '--ease-spring', '--motion-rise', '--motion-lift', '--motion-press']) {
      expect(css, t).toMatch(new RegExp(`${t}:\\s*[^;]+;`));
    }
    // the older names keep resolving
    for (const t of ['--transition-fast', '--transition-base', '--transition-slow']) expect(css).toContain(`${t}: var(--motion-`);
  });
  it('declares the shared vocabulary and the utilities', () => {
    const css = readSource(MOTION);
    for (const k of ['ui-fade-in', 'ui-rise', 'ui-drop', 'ui-scale-in', 'ui-rise-scale', 'ui-fade-out', 'ui-sink', 'ui-unfold', 'ui-pop', 'ui-tick', 'ui-shimmer', 'ui-pulse', 'ui-sweep', 'ui-breathe']) {
      expect(css, k).toContain(`@keyframes ${k} `);
    }
    for (const u of ['.m-enter', '.m-stagger', '.m-unfold', '.m-skeleton', '.m-live-dot', '.m-refreshing', '.m-pressable']) expect(css, u).toContain(`${u} `);
  });
  it('one global reduced-motion rule, with an escape hatch for essential motion', () => {
    const css = readSource(MOTION);
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('*:not(.motion-essential)');
    expect(css).toContain('animation-iteration-count: 1 !important');
    expect(css).toContain('.motion-essential, .motion-essential::before, .motion-essential::after { animation-duration: 2s !important; }');
  });
  it('only opacity, transform, grid rows and the loading properties ever animate', () => {
    const css = readSource(MOTION);
    for (const m of css.matchAll(/@keyframes [a-z-]+ \{([^]*?)\}\s*\n/g)) {
      expect(m[1], m[0].slice(0, 30)).not.toMatch(/\b(width|height|margin|padding|top|font-size|color)\s*:/);
    }
  });
});

describe('the reference surfaces are on the system', () => {
  for (const sheet of REFERENCE_SHEETS) {
    it(`${path.basename(sheet)}: no local keyframes, no literal durations, no per-sheet reduced-motion block`, () => {
      const css = readSource(sheet);
      expect(css).not.toContain('@keyframes');
      expect(css).not.toContain('prefers-reduced-motion');
      // A transition or animation shorthand names a token, never a literal tempo. The loops
      // (shimmer, pulse, sweep, breathe, spin) keep literal periods — a token for "1.3 s" would be
      // a name for one number.
      const literal = [...css.matchAll(/(transition|animation)[^;]*\b\d*\.?\d+m?s\b[^;]*;/g)]
        .map((m) => m[0])
        .filter((decl) => !/ui-(shimmer|pulse|sweep|breathe)|\bspin\b/.test(decl));
      expect(literal, 'literal durations outside the loops').toEqual([]);
      expect(css).toContain('var(--motion-fast)');
      expect(css).toContain('var(--ease-out)');
    });
  }
  it('the modal marks its progress bar and spinner as essential motion', () => {
    const src = readSource('app/admin/research/components/NewResearchProjectModal.tsx');
    expect(src).toContain('className="nrp-progress motion-essential"');
    expect(src).toContain('className="nrp-spin motion-essential"');
  });
});

describe('THE RATCHET — keyframes outside motion.css may only go down', () => {
  // 218 when the system shipped (2026-09-09); 202 after the two reference sheets migrated. Every
  // page redesign that moves onto ui-* lowers this; a sheet adding its own fade raises it and fails.
  const BASELINE = 202;
  it('counts them', () => {
    const files = walkCss(path.join(ROOT, 'app')).filter((f) => !f.endsWith(path.join('styles', 'motion.css')));
    let total = 0;
    const perFile: Record<string, number> = {};
    for (const f of files) {
      const n = (fs.readFileSync(f, 'utf8').match(/@keyframes\s+[a-zA-Z0-9_-]+/g) ?? []).length;
      if (n) { total += n; perFile[path.relative(ROOT, f).split(path.sep).join('/')] = n; }
    }
    const worst = Object.entries(perFile).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${n}  ${f}`).join('\n  ');
    expect(total, 'sheets keep declaring their own keyframes (use ui-* from motion.css)').toBeLessThanOrEqual(BASELINE);
    expect(total, `the baseline is looser than the code — lower it:\n  ${worst}`).toBeGreaterThan(BASELINE - 40);
  });
});
