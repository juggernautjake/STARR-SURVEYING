// __tests__/dnd/skin-accents.test.ts — the bespoke PF2/IG sheets carry a skin-<id> hook + per-skin texture.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { skinClass } from '@/lib/dnd/skin-tokens';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('skinClass', () => {
  it('returns skin-<id> for known styles, empty for unknown', () => {
    expect(skinClass('lazzuh')).toBe('skin-lazzuh');
    expect(skinClass('jack')).toBe('skin-jack');
    expect(skinClass('default')).toBe('skin-default');
    expect(skinClass('nonesuch')).toBe('');
    expect(skinClass(undefined)).toBe('');
  });
});

describe('the bespoke sheet roots carry the skin hook', () => {
  it('PF2Sheet + IGSheet add ${skin} to every layout root', () => {
    for (const f of ['app/dnd/_ui/PF2Sheet.tsx', 'app/dnd/_ui/IGSheet.tsx']) {
      const src = read(f);
      expect(src).toContain('const skin = skinClass(sheetType)');
      expect(src).toMatch(/\$\{skin\}/); // interpolated into a root className
    }
  });
});

describe('per-skin surface textures load on every page', () => {
  it('the layout imports skinAccents.css', () => {
    expect(read('app/dnd/layout.tsx')).toContain("import './_sheet/styles/skinAccents.css'");
  });
  it('skinAccents defines a distinct texture per non-default skin', () => {
    const css = read('app/dnd/_sheet/styles/skinAccents.css');
    for (const sel of ['.skin-lazzuh::before', '.skin-streamer::before', '.skin-donata::before', '.skin-jack::before']) {
      expect(css).toContain(sel);
    }
    expect(css).not.toContain('.skin-default::before'); // Hextech = the baseline surface, no overlay
  });
});
