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
      // The shell wrapper style must carry BOTH the skin-panel tokens (skinHxVars/shellThemeVars) and
      // an opaque base; without the base the translucent shell panels go muddy on light skins.
      expect(src).toContain('shellThemeVars(sheetType)');
      expect(src).toMatch(/background:\s*'var\(--hx-navy-0\)'/);
    });
  }

  it('the floating roller window is effectively opaque so it reads on any skin', () => {
    // The window floats over the (dark) page, so a translucent light window would be muddy on a light
    // skin — its panel/void fills are 0.98 opacity, i.e. opaque enough, and it inherits skin tokens.
    const css = read('app/dnd/_sheet/components/rollers/floatingRoller.css');
    expect(css).toMatch(/\.fld\s*\{[\s\S]*?rgba\(var\(--panel-rgb[^)]*\),\s*0\.9\d\)/);
  });
});
