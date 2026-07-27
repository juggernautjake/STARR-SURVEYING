// __tests__/dnd/ig-danger-text-contrast.test.ts — danger as TEXT clears AA on the IG sheet's panels.
//
// Final-QA walkthrough, contrast baseline. `--hx-danger` (#c6403b) is tuned as a BORDER and FILL accent;
// as small text on a hextech panel it lands at 3.19–3.50:1 against AA's 4.5. `hextech.module.css` added
// `--hx-danger-2` (#ef8b85) for that exact reason and converted the sites known at the time — then the
// browser sweep measured `COMBAT SKILLS` still failing at 3.33 on the live IG sheet, i.e. the token existed
// and the site had not been reached.
//
// This pins the RULE (text takes the lighter token, borders keep the base) rather than a list of line
// numbers, so a new danger-coloured label cannot quietly reintroduce it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, parseColor, flattenStack, aaThresholdForSize, CONTRAST } from '@/lib/dnd/theme-contrast';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/_ui/ig/useIgPanels.tsx'), 'utf8');
const CSS = readFileSync(join(process.cwd(), 'app/dnd/_ui/hextech.module.css'), 'utf8');

const DANGER = '#c6403b';
const DANGER_2 = '#ef8b85';
const PANEL = parseColor('#0b1a2c')!;
const rgb = (c: { r: number; g: number; b: number }) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;

describe('the tokens themselves still hold the values this rests on', () => {
  it('hextech.module.css defines both reds as measured', () => {
    // If someone retunes either token, these numbers stop describing reality — fail loudly rather than
    // keep asserting a ratio computed from a colour that moved.
    expect(CSS).toContain(`--hx-danger: ${DANGER}`);
    expect(CSS).toContain(`--hx-danger-2: ${DANGER_2}`);
  });
});

describe('danger TEXT on the IG panels clears AA', () => {
  // The surfaces these labels actually sit on: the bare panel, and the two red-tinted chip fills.
  const surfaces: Array<[string, string]> = [
    ['bare panel', '#0b1a2c'],
    ['condition chip (10% red)', 'rgba(198,64,59,0.10)'],
    ['CUSTOM badge (14% red)', 'rgba(198,64,59,0.14)'],
  ];

  for (const [label, bgCss] of surfaces) {
    it(`${label}: the base red FAILS and the lighter one passes`, () => {
      const bg = bgCss.startsWith('#') ? PANEL : flattenStack([parseColor(bgCss)!], PANEL);
      const before = contrastRatio(DANGER, rgb(bg))!;
      const after = contrastRatio(DANGER_2, rgb(bg))!;
      // Smallest text carrying this colour in the file is the 10.5px bold badge; bold under 18.66px still
      // needs the full 4.5, so one threshold covers every site here.
      const need = aaThresholdForSize(10.5, true);
      expect(need).toBe(4.5);
      expect(before).toBeLessThan(need);   // why the swap was needed
      expect(after).toBeGreaterThan(need); // that it actually fixed it
    });
  }

  it('the base red is still fine as a BORDER, which is why those are left alone', () => {
    expect(contrastRatio(DANGER, rgb(PANEL))!).toBeGreaterThan(CONTRAST.border);
  });
});

describe('the file follows the rule', () => {
  it('no danger-coloured TEXT is left on the base token', () => {
    // `color: 'var(--hx-danger)'` is the failing pattern. Borders read `1px solid var(--hx-danger)` and are
    // deliberately untouched, so match on the colour property specifically.
    expect(SRC).not.toMatch(/color: 'var\(--hx-danger\)'/);
  });

  it('and the borders were NOT swept along with them', () => {
    // A blanket find-and-replace would have taken the borders too. Keeping the accent language intact is
    // the reason this was done by property rather than by token.
    expect(SRC).toContain("border: '1px solid var(--hx-danger)'");
  });

  it('COMBAT SKILLS — the label the browser sweep actually caught — is on the lighter token', () => {
    expect(SRC).toMatch(/color: 'var\(--hx-danger-2\)'[^}]*\}\}>COMBAT SKILLS/);
  });

  it('records why the other files were not swept blind', () => {
    // The trap this codebase has already hit once: a surface painted from the skin-derived `--panel`
    // family while its text comes from `--hx-*`. On a LIGHT panel the lighter red is worse, not better.
    expect(SRC).toContain('are NOT swept');
    expect(SRC).toContain('measuring on its own surface');
  });
});
