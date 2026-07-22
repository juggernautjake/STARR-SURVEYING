// The shell token bridge (T-SHELL-TOKENS). The shared Codex/Dashboard/Play shells style with the 5e
// engine's theme vars (--gold/--ink/--line/--tealbright + the rgba(var(--panel-rgb)) / var(--void-rgb)
// TRIPLETS), which don't exist inside the bespoke PF2/IG sheets (those render off --hx-*). `shellThemeVars`
// maps a skin to that shell token set so a shell dropped into a PF2/IG sheet keeps its colours. These
// guard the contract every PF2/IG format wiring slice depends on.
import { describe, expect, it } from 'vitest';
import { shellThemeVars } from '@/lib/dnd/skin-tokens';
import { SHEET_STYLES } from '@/lib/dnd/sheet-styles';

const asRecord = (v: unknown) => v as Record<string, string>;
const TRIPLET = /^\d{1,3}, \d{1,3}, \d{1,3}$/;

describe('shellThemeVars — the shell token bridge', () => {
  it('emits every shell token the format CSS reads, for the default skin', () => {
    const v = asRecord(shellThemeVars('default'));
    for (const k of ['--gold', '--ink', '--muted', '--line', '--line-strong', '--tealbright',
      '--danger', '--font-display', '--panel-rgb', '--void-rgb', '--hotpink', '--hotpink-rgb',
      '--violet-rgb']) {
      expect(v[k], `missing ${k}`).toBeTruthy();
    }
  });

  it('produces valid "r, g, b" triplets for the rgba() tokens (pure CSS can not derive these)', () => {
    const v = asRecord(shellThemeVars('default'));
    expect(v['--panel-rgb']).toMatch(TRIPLET);
    expect(v['--void-rgb']).toMatch(TRIPLET);
    expect(v['--hotpink-rgb']).toMatch(TRIPLET);
    // channels in range
    for (const n of v['--panel-rgb'].split(', ').map(Number)) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(255);
    }
  });

  it('inherits each named skin’s own colours (so the shell re-skins with the sheet)', () => {
    // Every non-default skin must yield a token set, and at least one colour must differ from the
    // default — otherwise the shell would ignore the skin the bespoke sheet is wearing.
    const def = asRecord(shellThemeVars('default'));
    for (const s of SHEET_STYLES.filter((x) => x.id !== 'default')) {
      const v = asRecord(shellThemeVars(s.id));
      expect(v['--gold']).toBeTruthy();
      expect(v['--panel-rgb']).toMatch(TRIPLET);
      const differs = v['--gold'] !== def['--gold'] || v['--ink'] !== def['--ink'] ||
        v['--panel-rgb'] !== def['--panel-rgb'] || v['--line'] !== def['--line'];
      expect(differs, `skin ${s.id} produced default-identical shell tokens`).toBe(true);
    }
  });

  it('an unknown skin id falls back to the default token set, never blank', () => {
    const v = asRecord(shellThemeVars('does-not-exist'));
    expect(v['--gold']).toBe(asRecord(shellThemeVars('default'))['--gold']);
  });
});
