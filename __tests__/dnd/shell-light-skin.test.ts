// Guards the light-skin fix: the shared Codex/Dashboard/Play shells paint their panels as
// `rgba(var(--panel-rgb), …)` TRANSLUCENT. Inside a bespoke PF2/IG sheet the shell wrapper must give
// them an OPAQUE skin-base background, or on a light skin the translucent light panels blend with the
// dark page behind and the whole sheet reads muddy-dark (the exact bug this pins). The base is the
// skin's own page tone (`var(--hx-navy-0)`), so every skin — light or dark — reads correctly.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('bespoke shell wrappers carry an opaque skin-base background (light-skin fix)', () => {
  for (const file of ['app/dnd/_ui/PF2Sheet.tsx', 'app/dnd/_ui/IGSheet.tsx']) {
    it(`${file} sets background: var(--hx-navy-0) on its shell wrapper`, () => {
      const src = read(file);
      // The shell wrapper style must carry BOTH the skin-derived shell tokens and an opaque base; without
      // the base the translucent shell panels go muddy on light skins.
      //
      // Matched on "shell tokens derived FROM `sheetType`" rather than on one function name. The bridge
      // was `shellThemeVars(sheetType)` and is now `skinThemeShellVars(sheetType, theme)` — a rename that
      // strengthened the light-skin guarantee (the theme no longer replaces the skin's grounds, which is
      // what turned the light skins dark in the first place) while this test failed it for changing
      // spelling. Pin the property, not the mechanism.
      expect(src).toMatch(/(shellThemeVars|skinThemeShellVars)\(sheetType/);
      expect(src).toMatch(/background:\s*'var\(--hx-navy-0\)'/);
    });
  }

  it('the floating roller window is effectively opaque so it reads on any skin', () => {
    // The window floats over the page, so a translucent window would be muddy on a light skin — its
    // panel/void fills are 0.98 opacity, i.e. opaque enough, and it inherits skin tokens.
    //
    // Asserted on the extracted `.fld` BLOCK rather than by one regex over the whole file: slice 23 nested
    // the fill as `rgba(var(--hx-panel-rgb, var(--panel-rgb, …)), 0.98)` so the dock follows the SKIN's
    // panel (see roller-dock-surface.test.ts), and a `[^)]*` pattern can't span a nested var().
    const css = read('app/dnd/_sheet/components/rollers/floatingRoller.css');
    const block = css.slice(css.indexOf('.fld {'), css.indexOf('}', css.indexOf('.fld {')));
    expect(block).toContain('--hx-panel-rgb');   // the skin's own panel wins…
    expect(block).toContain('--panel-rgb');      // …with the sheet's fixed triplet as the fallback
    expect(block).toMatch(/0\.9\d\)/);           // still effectively opaque
  });
});
