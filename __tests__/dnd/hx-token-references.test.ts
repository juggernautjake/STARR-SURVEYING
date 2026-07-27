// __tests__/dnd/hx-token-references.test.ts — every `var(--hx-…)` names a token that exists.
//
// THE DEFECT. `--hx-ink` is not part of the hextech token set — it exists only in `custom-sheet.ts`'s
// standalone-export CSS, a different scope entirely. `IGCharacterBuilder` used `color: var(--hx-ink)` on
// four text elements with **no fallback**, which makes the declaration INVALID: the browser drops it and
// the text inherits its parent's colour.
//
// That is exactly the bug slice 34 fixed on the IG stance emblem — *"the one child of this card that named
// no colour, so it inherited the page's base #0f1419, a near-black meant for light surfaces, onto the
// card's teal-tinted dark fill: measured 1.39:1"* — surviving in a second place because nothing looks for
// the SHAPE, only for the instance.
//
// `useIgPanels` had the same thing with `border: 1px solid var(--hx-gold)`: invalid, so the border falls
// back to `currentColor` and a "this value changed" affordance renders in the text colour instead of gold.
//
// THE RULE: a `var(--hx-…)` with no fallback must name a real token. With a fallback it is merely
// skin-blind (see the inventory below), which is a lesser problem and is recorded rather than swept —
// the same call slice 34 made about the 22 files it deliberately did not touch.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { skinHxVars } from '@/lib/dnd/skin-tokens';

const ROOT = join(process.cwd(), 'app/dnd');

function sources(dir = ROOT): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...sources(full)); continue; }
    if (/\.(tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every `--hx-*` the system actually declares: the module's own `:root`/`.root` block, plus everything
 *  `skinHxVars` emits for a skin (the two sets a bespoke sheet resolves against). */
function definedTokens(): Set<string> {
  const css = readFileSync(join(ROOT, '_ui/hextech.module.css'), 'utf8');
  const out = new Set<string>();
  for (const m of css.matchAll(/(--hx-[a-z0-9-]+)\s*:/g)) out.add(m[1]);
  for (const k of Object.keys(skinHxVars('streamer'))) out.add(k);
  return out;
}

/** Each `var(--hx-…)` reference, with whether it supplies a fallback. */
function references() {
  const defined = definedTokens();
  const out: Array<{ file: string; token: string; hasFallback: boolean }> = [];
  for (const file of sources()) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/var\((--hx-[a-z0-9-]+)\s*(,)?/g)) {
      out.push({ file: file.slice(ROOT.length + 1).split('\\').join('/'), token: m[1], hasFallback: !!m[2] });
    }
  }
  return { refs: out, defined };
}

describe('the scan is real', () => {
  it('finds the token declarations and a healthy number of references', () => {
    const { refs, defined } = references();
    expect(defined.has('--hx-text')).toBe(true);
    expect(defined.has('--hx-gold-2')).toBe(true);
    expect(refs.length).toBeGreaterThan(200);
  });
});

describe('a var() with NO fallback must name a real token', () => {
  it('otherwise the declaration is invalid and the element inherits', () => {
    const { refs, defined } = references();
    const broken = refs.filter((r) => !r.hasFallback && !defined.has(r.token));
    // Was: 4× `color: var(--hx-ink)` in IGCharacterBuilder (text inheriting the page ink — slice 34's
    // glyph bug again) and 2× `border: … var(--hx-gold)` in useIgPanels (border falling back to
    // currentColor, so a "changed" affordance rendered in the text colour).
    expect(broken.map((b) => `${b.file}: ${b.token}`)).toEqual([]);
  });
});

describe('the tokens that are only SKIN-BLIND are inventoried, not swept', () => {
  // These name no real token but DO supply a literal fallback, so they render — just always the same
  // colour, ignoring the skin. That is a lesser defect than an invalid declaration, and fixing eleven of
  // them blind is precisely what slice 34 refused to do across 22 files: a hardcoded dark-theme value can
  // be *worse* on a light skin, so each needs its own surface measured.
  //
  // Listed so the count cannot grow quietly. Shrinking it is welcome; growing it should be argued for.
  const KNOWN_SKIN_BLIND = ['--hx-accent', '--hx-bad', '--hx-bg', '--hx-bg-1', '--hx-bg-2', '--hx-gold', '--hx-hotpink', '--hx-ink', '--hx-pink-1', '--hx-teal', '--hx-teal-rgb'];

  it('no NEW undefined token appears with a fallback either', () => {
    const { refs, defined } = references();
    const undef = [...new Set(refs.filter((r) => !defined.has(r.token)).map((r) => r.token))].sort();
    expect(undef.filter((t) => !KNOWN_SKIN_BLIND.includes(t))).toEqual([]);
  });

  it('and the two that were REAL bugs are gone from the no-fallback set for good', () => {
    // `--hx-ink` and `--hx-gold` stay on the list above (other sites still use them WITH fallbacks), but
    // must never again appear without one — which the previous describe enforces globally. This pins the
    // specific files, so a revert is named rather than merely counted.
    const igBuilder = readFileSync(join(ROOT, '_ui/IGCharacterBuilder.tsx'), 'utf8');
    const igPanels = readFileSync(join(ROOT, '_ui/ig/useIgPanels.tsx'), 'utf8');
    expect(igBuilder).not.toContain('var(--hx-ink)');
    expect(igBuilder).toContain('var(--hx-text)');
    expect(igPanels).not.toContain("'var(--hx-gold)'");
  });
});
