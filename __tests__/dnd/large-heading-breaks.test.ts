// __tests__/dnd/large-heading-breaks.test.ts — any heading big enough to outgrow a phone must be breakable.
//
// Slice 81, generalising slice 80. That slice fixed ONE selector: `.dnd-sheet h1.name` floors at 44px via
// `clamp(44px, 8vw, 82px)`, so on a 360px screen a long name was 350px inside a 285px box and `.hero`'s
// `overflow-x: hidden` clipped 50px of it away. The fix was `overflow-wrap: anywhere`.
//
// One selector fixed is an instance. This asserts the RULE, which is the shape this repo already uses for
// exactly this problem — `clamped-token-surface.test.ts` was written after the same bug appeared in three
// sibling tokens, one at a time. The layout axis makes that likely here too: there are four templates
// (classic / codex / dashboard / play), each with its own name selector in its own stylesheet, so a fifth
// is a plausible future and would not inherit slice 80's fix.
//
// THE RULE: a rule whose font-size can resolve to >= 40px, and which names a heading, must let a long word
// break. Below 40px this does not bite — measured: the classic name at 44px needed ~350px for a 16-char
// name, while `.codex-name` (22px) and `.play-name` (28px, 23px under 720px) sit far inside a 360px screen.
//
// WHY THE THRESHOLD IS ON THE FLOOR, NOT THE MAX: `clamp(44px, 8vw, 82px)` is 82px on a desktop and that is
// harmless — the container is wide. The defect lives at the SMALL end, where `8vw` (28.8px at 360px) loses
// to the 44px floor and the type stops shrinking while the screen keeps going. So the number that matters
// is the first argument of the clamp, or a bare `font-size`, and never the maximum.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'app/dnd/_sheet/styles');
const SHEETS = readdirSync(DIR).filter((f) => f.endsWith('.css'));

/** Rules that look like a heading: the selector mentions a name/title/heading, or is an h1/h2. */
const HEADINGISH = /(^|[\s.#>])(h1|h2)([\s.:,{]|$)|name|title|heading|hero/i;

/** The smallest size this rule can resolve to: a clamp's floor, else the bare px value. */
function minFontSize(body: string): number | null {
  const clamp = body.match(/font-size:\s*clamp\(\s*([\d.]+)px/);
  if (clamp) return parseFloat(clamp[1]);
  const bare = body.match(/font-size:\s*([\d.]+)px/);
  return bare ? parseFloat(bare[1]) : null;
}

interface Rule { file: string; selector: string; body: string; min: number }

function largeHeadingRules(): Rule[] {
  const out: Rule[] = [];
  for (const file of SHEETS) {
    const css = readFileSync(join(DIR, file), 'utf8');
    // Strip comments so prose about font sizes cannot be read as a declaration.
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim().split('\n').pop()!.trim();
      const body = m[2];
      if (!HEADINGISH.test(selector)) continue;
      const min = minFontSize(body);
      if (min == null || min < 40) continue;
      out.push({ file, selector, body, min });
    }
  }
  return out;
}

describe('the scan finds something — otherwise every claim below is vacuous', () => {
  it('there are stylesheets to read', () => {
    // Slice 75's floor. An empty or moved directory would make this file pass while checking nothing.
    expect(SHEETS.length).toBeGreaterThanOrEqual(4);
  });

  it('and it locates at least the one rule slice 80 fixed', () => {
    const rules = largeHeadingRules();
    expect(rules.length).toBeGreaterThanOrEqual(1);
    expect(rules.some((r) => r.selector.includes('h1.name')), 'h1.name should match the scan').toBe(true);
  });
});

describe('every large heading can break a word that will not fit', () => {
  it('each rule that can resolve to 40px+ declares overflow-wrap: anywhere', () => {
    const offenders = largeHeadingRules()
      .filter((r) => !/overflow-wrap:\s*anywhere/.test(r.body))
      .map((r) => `${r.file}: ${r.selector} (min ${r.min}px)`);
    expect(offenders, `these can outgrow a 360px screen with no way to break:\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('and none uses break-word, which does not shrink min-content', () => {
    // The distinction slice 80 measured: `break-word` breaks a line but leaves min-content at the whole
    // word's width, so the block still refuses to shrink and the clipping survives the "fix".
    const wrong = largeHeadingRules()
      .filter((r) => /overflow-wrap:\s*break-word/.test(r.body))
      .map((r) => `${r.file}: ${r.selector}`);
    expect(wrong).toEqual([]);
  });
});

describe('the small headings are below the bar on purpose, and that is recorded', () => {
  it('codex and play name their character at a size that fits a phone', () => {
    // Not required to carry the property, and asserting WHY keeps a future "make the codex name bigger"
    // change honest: cross 40px and the rule above starts applying to it.
    const codex = readFileSync(join(DIR, 'codex.css'), 'utf8');
    const play = readFileSync(join(DIR, 'play.css'), 'utf8');
    expect(codex).toMatch(/\.codex-name\s*\{[^}]*font-size:\s*22px/);
    expect(play).toMatch(/\.play-name\s*\{[^}]*font-size:\s*28px/);
  });
});
