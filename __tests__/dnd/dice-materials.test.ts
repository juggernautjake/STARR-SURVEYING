// __tests__/dnd/dice-materials.test.ts — the dice follow the sheet's style, and its theme, on every system.
//
// OWNER: *"Please make it so that the dice change appearance and style and theme along with the style and theme
// selected."*
//
// TWO AXES, AND THE TEST'S JOB IS TO KEEP THEM APART. **Style** (the skin) picks the MATERIAL — metal, neon
// plastic, resin, bone, gem. **Theme** (the palette) picks the COLOUR, and it does so through CSS tokens on the
// sheet, which is what makes it work identically on 5e, PF2 and IG where the available variables differ.
//
// A material that named colours would collapse those axes and quietly win: a "neon" material with a hardcoded pink
// would look wrong in every theme that is not pink, on every system. So the load-bearing assertion here is that no
// material contains a colour at all.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIE_MATERIALS, MATERIAL_LIST, materialForSkin } from '@/lib/dnd/dice/materials';
import { SHEET_STYLES } from '@/lib/dnd/sheet-styles';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('a material describes a surface, never a colour', () => {
  it('no material carries a hex, rgb, hsl or named colour', () => {
    // THE WHOLE POINT. Colours come from the sheet's own custom properties, so the die follows the player's theme
    // on any system — including the two whose sheets define `--hx-*` rather than the 5e tokens, which is exactly
    // where the Impact roller previously ignored the theme entirely.
    const src = read('lib/dnd/dice/materials.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\b(rgba?|hsla?)\s*\(/);
  });

  it('and every material is a complete set of surface numbers', () => {
    for (const m of MATERIAL_LIST) {
      expect(m.contrast, `${m.id} contrast`).toBeGreaterThan(0);
      expect(m.specular, `${m.id} specular`).toBeGreaterThanOrEqual(0);
      expect(m.seam, `${m.id} seam`).toBeGreaterThanOrEqual(0);
      expect(m.edge, `${m.id} edge`).toBeGreaterThan(0);
      expect(m.bloom, `${m.id} bloom`).toBeGreaterThanOrEqual(0);
      expect(m.label.length).toBeGreaterThan(2);
    }
  });

  it('and the materials are actually distinguishable from one another', () => {
    // Five entries that all shade alike would be five names for one die. The owner asked for the dice to CHANGE
    // with the style, so the values have to differ enough to see.
    const contrasts = new Set(MATERIAL_LIST.map((m) => m.contrast));
    const speculars = new Set(MATERIAL_LIST.map((m) => m.specular));
    expect(contrasts.size).toBeGreaterThanOrEqual(4);
    expect(speculars.size).toBeGreaterThanOrEqual(4);
    // Bone must be visibly matte against neon's gloss, or "printed bone" is a label rather than a material.
    expect(DIE_MATERIALS.bone.specular).toBeLessThan(DIE_MATERIALS.neon.specular / 2);
    expect(DIE_MATERIALS.bone.bloom).toBe(0);
    expect(DIE_MATERIALS.neon.bloom).toBeGreaterThan(0.3);
  });
});

describe('every sheet style resolves to a material', () => {
  for (const style of SHEET_STYLES) {
    it(`${style.id}`, () => {
      // Read from SHEET_STYLES rather than a list of skin names typed here, so a new skin cannot be added without
      // this noticing — the "authored but not wired" failure, caught at the one place it would show up.
      const m = materialForSkin(style.id);
      expect(m).toBeDefined();
      expect(MATERIAL_LIST).toContain(m);
    });
  }

  it('and an unknown skin gets handsome dice rather than none', () => {
    // A new skin should look good on the day it is added; hand-tuning it later is an improvement, not a repair.
    expect(materialForSkin('some-future-skin')).toBe(DIE_MATERIALS.gem);
    expect(materialForSkin(null)).toBe(DIE_MATERIALS.gem);
    expect(materialForSkin(undefined)).toBe(DIE_MATERIALS.gem);
  });
});

describe('the style reaches the dice from every mount site', () => {
  // The stage has no store access — that is precisely what lets one stage run on all four systems — so the style
  // travels through the roll feed. A mount site that forgot it would silently render gem dice on a neon sheet, and
  // look perfectly fine while doing it.
  const MOUNTS = [
    'app/dnd/_sheet/App.tsx',
    'app/dnd/_ui/ig/useIgPanels.tsx',
    'app/dnd/_ui/pf2/usePf2Panels.tsx',
  ];

  for (const file of MOUNTS) {
    it(file, () => {
      const src = read(file);
      expect(src).toContain('RollFeedProvider');
      expect(src, `${file} must pass sheetType into the roll feed`).toMatch(/value=\{\{[^}]*sheetType/);
    });
  }

  it('and the feed declares it, so a mount site that passes it is not silently ignored', () => {
    expect(read('app/dnd/_sheet/components/rollers/rollFeed.tsx')).toMatch(/sheetType\?: string \| null/);
  });

  it('and the Impact stage resolves a material from it', () => {
    expect(read('app/dnd/_sheet/components/rollers/ImpactRoller.tsx')).toContain('materialForSkin(sheetType)');
  });
});

describe('the die renderer applies the material without hardcoding one', () => {
  const src = read('app/dnd/_sheet/components/rollers/Die3D.tsx');

  it('shading contrast comes from the material', () => {
    expect(src).toMatch(/contrast: material\.contrast/);
  });

  it('and the sheen is per material, not one shared gradient id', () => {
    // Two rollers on a page can carry different materials; a single hardcoded gradient id would let the glossier
    // one restyle the matte one, which is the sort of bug that only shows up on the one screen that has both.
    expect(src).toMatch(/d3-sheen-\$\{material\.id\}/);
  });

  it('and the surface numbers reach CSS as custom properties', () => {
    for (const v of ['--d3-seam', '--d3-edge-w', '--d3-bloom']) expect(src).toContain(v);
  });
});
