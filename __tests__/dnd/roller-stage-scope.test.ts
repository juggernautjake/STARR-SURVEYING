// __tests__/dnd/roller-stage-scope.test.ts — a roller STAGE must be styled wherever it is mounted.
//
// THE DEFECT, reported with a screenshot: on the Pathfinder 2e and Intuitive Games sheets the Impact
// roller drew a black polygon with no numeral, and its breakdown rows printed as run-together text
// ("1d8 (raw)8", "Total8"). Nothing was wrong with the markup. Every one of the ~35 rules for the stage
// was written `.iroller .ir-die`, `.iroller .ir-row`, … — a descendant of `.iroller`, the root of the
// FULL 5e roller panel.
//
// But `rollerStageFor` exists precisely to mount the stage WITHOUT that panel: the bespoke PF2 and IG
// sheets publish into the shared roll feed and pair the stage with their own controls (RO-5). So on two of
// the four systems the stage rendered with no styles at all — an SVG polygon with no `fill` paints black,
// and unstyled rows put the label hard against its value. The Roll Board had the same flaw in its felt.
//
// WHY THE SUITE MISSED IT: 7,712 passing tests, and not one of them could see it. The components were
// correct, the CSS was valid, and the two halves only disagreed about a class name at the point where they
// met — a seam no unit test was looking at. The mount site even documented the hazard, wrapping the stage
// in `.dnd-sheet` "so the stages' `.dnd-sheet`-scoped CSS (Dice Core, Sigil) resolves" — naming the two
// stages that needed it and silently leaving out the two that did not use that scope.
//
// So this asserts the GUARANTEE at that seam: for each stage, the CSS is scoped to a class the stage's own
// markup renders, and never to a wrapper only its panel provides.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'app/dnd/_sheet/components/rollers';
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Roots that exist ONLY on the full roller panel — never on the stage `rollerStageFor` mounts. */
const PANEL_ONLY = ['.iroller', '.rboard'];

/** Every stage the registry can mount, with its stylesheet and what that stylesheet is scoped to.
 *
 *  There are two legitimate scopes, and the bug was a stage using NEITHER. `own` means the CSS keys off a
 *  root the stage's own markup renders, so it travels with the component. `wrapper` means it keys off
 *  `.dnd-sheet`, which every mount site must therefore supply — a contract asserted below. */
const STAGES = [
  { stage: 'ImpactStage', file: 'ImpactRoller.tsx', css: 'impactRoller.css', scope: 'own', root: 'ir-arena' },
  { stage: 'BoardStage', file: 'RollBoard.tsx', css: 'rollBoard.css', scope: 'own', root: 'rb-felt' },
  { stage: 'SigilStage', file: 'SigilStack.tsx', css: 'sigilStack.css', scope: 'wrapper', root: 'sigil-stage' },
  { stage: 'RollStage', file: '../RollStage.tsx', css: 'rollStage.css', scope: 'wrapper', root: null },
] as const;

/** Everywhere a bare stage is mounted. Each must supply `.dnd-sheet` for the wrapper-scoped stages. */
const MOUNT_SITES = [
  'app/dnd/_ui/pf2/usePf2Panels.tsx',
  'app/dnd/_ui/ig/useIgPanels.tsx',
  'app/dnd/_ui/builder/BuilderRoller.tsx',
];

describe('the registry really does mount bare stages', () => {
  // If this ever stopped being true the rest of the file would be guarding nothing.
  const registry = read(`${DIR}/rollerFor.tsx`);
  for (const { stage } of STAGES) {
    it(`rollerStageFor can return ${stage}`, () => {
      expect(registry).toMatch(new RegExp(`<${stage}\\s*/>`));
    });
  }
});

describe('no stage stylesheet requires the 5e PANEL as an ancestor', () => {
  for (const { css } of STAGES) {
    it(`${css}`, () => {
      // COMMENT-STRIPPED, and this test needed the rule as much as any: the header comment in
      // impactRoller.css explains the very selector shape being forbidden, so scanning the raw file failed
      // on its own documentation. A negative source assertion must look at code only.
      const src = read(`${DIR}/${css}`).replace(/\/\*[\s\S]*?\*\//g, '');
      // A descendant selector rooted at a panel-only class: `.iroller .ir-die`, `.rboard .rb-felt`, …
      // Rules for the panel's OWN chrome are fine — those are distinct class names (`.iroller-head`),
      // not a panel ancestor, which is why the pattern requires whitespace then a class.
      for (const panel of PANEL_ONLY) {
        const offenders = [...src.matchAll(new RegExp(`^[^{}]*\\${panel}\\s+\\.[a-zA-Z]`, 'gm'))].map((m) =>
          m[0].trim(),
        );
        expect(offenders, `${css} scopes stage rules under ${panel}, so they vanish on PF2/IG`).toEqual([]);
      }
    });
  }
});

describe('a stage scoped to its OWN root renders that root', () => {
  for (const { stage, file, css, scope, root } of STAGES) {
    if (scope !== 'own' || !root) continue;
    it(`${stage} renders .${root}, and ${css} styles it`, () => {
      // The component's markup must emit the root the stylesheet keys off — the exact agreement that
      // broke. Both halves were individually correct; only the join between them was wrong.
      expect(read(`${DIR}/${file}`), `${file} must render the .${root} root`).toContain(root);
      expect(read(`${DIR}/${css}`), `${css} must scope to .${root}`).toMatch(
        new RegExp(`^\\.${root}[\\s.,{:]`, 'm'),
      );
    });
  }
});

describe('a stage scoped to .dnd-sheet gets it from every mount site', () => {
  // The other half of the same guarantee. Sigil Stack and the Dice Core stage are styled through
  // `.dnd-sheet`, so a mount site that forgot the wrapper would leave them as unstyled as Impact was —
  // and the two sheets that mount bare stages are exactly the ones nobody was checking.
  for (const site of MOUNT_SITES) {
    it(site, () => {
      const src = read(site);
      expect(src).toContain('rollerStageFor');
      expect(src, `${site} mounts a bare stage, so it must supply the .dnd-sheet wrapper`).toMatch(
        /className="dnd-sheet"/,
      );
    });
  }
});

describe('the die reads as a solid on every system, not just where 5e variables exist', () => {
  // The stage mounts on sheets that define the hextech tokens (`--hx-*`) rather than the 5e ones. A chain
  // that stopped at `var(--tealbright, #6ee0cf)` silently used the hardcoded default there, ignoring the
  // player's chosen theme on half the systems.
  const css = read(`${DIR}/impactRoller.css`);
  it('the die edge, body and numeral all fall back through --hx-*', () => {
    expect(css).toMatch(/\.ir-die-edge\s*\{[^}]*--hx-accent/);
    expect(css).toMatch(/\.ir-die-body\s*\{[^}]*--hx-panel-rgb/);
    expect(css).toMatch(/\.ir-die-face\s*\{[^}]*--hx-text/);
  });

  it('and the facets are painted as light, not as a colour', () => {
    // Shading composes over any body fill on any skin; a facet palette in one accent would fight every
    // theme it is not. The component supplies the alpha, so the rule must not hardcode a fill.
    expect(read(`${DIR}/ImpactRoller.tsx`)).toMatch(/fill=\{f\.shade >= 0 \? '#ffffff' : '#000000'\}/);
  });
});
