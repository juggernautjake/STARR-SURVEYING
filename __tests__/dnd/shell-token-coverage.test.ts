// The cross-system contract: a shell (Codex/Dashboard/Play) can render inside a bespoke PF2/IG sheet
// ONLY because `shellThemeVars` declares every 5e-engine theme token the shell CSS reads. If someone
// adds a `var(--newtoken)` to codex.css/play.css but forgets to bridge it, that token would resolve to
// nothing (or an inherited wrong value) inside a PF2/IG sheet — a silent cross-theme break. This test
// keeps the bridge COMPLETE by construction: every `--x` the shell CSS uses (except the bespoke `--hx-*`
// namespace) must be a key `shellThemeVars` provides.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shellThemeVars } from '@/lib/dnd/skin-tokens';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** All `var(--token…)` names used by a stylesheet, minus the bespoke `--hx-*` namespace (those are
 *  declared by `skinHxVars`, not the shell bridge) and minus tokens only used as fallbacks of others. */
function shellTokensUsed(...files: string[]): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    const css = read(f);
    for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      const name = m[1];
      if (!name.startsWith('--hx-')) out.add(name);
    }
  }
  return out;
}

describe('shellThemeVars covers every token the shared format CSS uses', () => {
  it('has a value for each --token in codex.css + play.css (no silent cross-theme gap)', () => {
    const used = shellTokensUsed('app/dnd/_sheet/styles/codex.css', 'app/dnd/_sheet/styles/play.css');
    const provided = shellThemeVars('lazzuh') as Record<string, string>;
    const missing = [...used].filter((t) => !(t in provided));
    expect(missing, `shell CSS uses tokens the bridge does not provide: ${missing.join(', ')}`).toEqual([]);
  });
});
