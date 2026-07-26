// __tests__/dnd/roller-tab-contrast.test.ts — the roller template tabs are readable in both states.
//
// Measured during the skin sweep (final-QA walkthrough, slices 18–19). The template tabs and the
// animation toggle are **11px**, so WCAG AA asks 4.5:1 — and `--hx-muted`, a deliberately de-emphasised
// token, measured **2.78:1 on the dark skins and 2.83:1 on the light ones**. Consistently sub-AA on every
// skin, which is the signal that the token was doing a job it isn't for, rather than one theme being off.
//
// Selection is already carried by the border and the background fill, so the label never had to be the
// thing that dimmed. Paying for state with legibility is paying in the wrong currency.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/rollers/RollerTemplateBar.tsx'), 'utf8');

describe('roller template bar labels', () => {
  it('uses the full text token for the inactive state, not the muted one', () => {
    expect(SRC).toMatch(/color: on \? 'var\(--hx-teal-1, #0ac8b9\)' : 'var\(--hx-text, #f0e6d2\)'/);
    // The muted token must not come back for a LABEL colour in this file.
    expect(SRC).not.toMatch(/color: 'var\(--hx-muted/);
    expect(SRC).not.toMatch(/: 'var\(--hx-muted, #93a1b5\)',\s*$/m);
  });

  it('still distinguishes the selected tab — by border and fill, which is where state belongs', () => {
    expect(SRC).toMatch(/border: on \? '1px solid var\(--hx-teal-1/);
    expect(SRC).toMatch(/background: on \? 'rgba\(10,200,185,0\.14\)'/);
    // …and by an accessible state, not colour alone.
    expect(SRC).toContain('aria-pressed={on}');
  });

  it('keeps every label token backed by a literal fallback', () => {
    // A token that fails to resolve must not drop the label to the browser default on a dark panel — the
    // exact failure mode behind the invisible `.btn` in slice 18.
    for (const m of SRC.match(/var\(--hx-[a-z0-9-]+[^)]*\)/g) ?? []) {
      if (/--hx-font/.test(m)) continue;              // font stacks legitimately fall back to `inherit`
      expect(m, `${m} has no literal fallback`).toMatch(/var\(--hx-[a-z0-9-]+,\s*[^)]+\)/);
    }
  });
});
