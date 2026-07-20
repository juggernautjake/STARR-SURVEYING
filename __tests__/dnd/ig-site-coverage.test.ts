// __tests__/dnd/ig-site-coverage.test.ts — every content page on intuitivegames.net has a
// collection behind it (S11.3, owner 2026-07-20).
//
// This is a STRUCTURAL guard, not a depth one: it proves we have a home for each of the site's
// content types, so a whole category can't go missing unnoticed. Depth — is every feat, is every
// power's effect text present — is covered separately by ig-content-complete/ig-content-gaps,
// which track Brendan's outstanding text against SITE_MASTER.md.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'lib/dnd/systems/intuitive-games';
const source = fs.readdirSync(path.join(process.cwd(), DIR))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => fs.readFileSync(path.join(process.cwd(), DIR, f), 'utf8'))
  .join('\n');

/** Each content page on intuitivegames.net → a collection that must exist for it. */
const PAGE_COLLECTIONS: Record<string, string[]> = {
  'Items': ['IG_EQUIPMENT_PACKS', 'IG_PROFESSIONAL_KITS'],
  'armor-shields': ['IG_ARMORS', 'IG_SHIELDS'],
  'backgrounds': ['IG_BACKGROUND_DEFS'],
  'character-building': ['IG_CLASS_RULES'],
  'classes': ['IG_CLASS_DETAILS'],
  'companion-creatures': ['IG_COMPANION_TYPES'],
  'conditions': ['IG_CONDITIONS'],
  'core-rules': ['IG_DAMAGE_SAVE_RULES', 'IG_COVER'],
  'equipment': ['IG_EQUIPMENT_PACKS'],
  'feats-combat': ['IG_FEATS'],
  'feats-general': ['IG_FEATS'],
  'magical-items': ['IG_ENCHANTMENTS'],
  'redistribution': ['IG_REDISTRIBUTION_RULES'],
  'skills': ['IG_COMBAT_SKILLS'],
  'spell-list': ['IG_SPELL_ROSTER'],
  'stances': ['IG_STANCE_DEFS'],
  'tools': ['IG_TOOL_RULES'],
  'traits-ancestries': ['IG_ANCESTRIES'],
  'weapons': ['IG_WEAPON_CLASS_DATA'],
};

describe('every IG site content page is represented', () => {
  for (const [page, symbols] of Object.entries(PAGE_COLLECTIONS)) {
    it(`/${page} has a collection`, () => {
      for (const sym of symbols) {
        expect(source.includes(`export const ${sym}`), `${page} → ${sym}`).toBe(true);
      }
    });
  }

  it('covers the owner’s full list of content types', () => {
    // "weapons, items, armour, spells, stances, conditions, abilities, feats, occupations,
    // races" — occupations are the site's BACKGROUNDS and races its ANCESTRIES, which is why
    // a name-based search for "occupation" finds nothing and is not evidence of a gap.
    const required = [
      'IG_WEAPON_CLASS_DATA', 'IG_EQUIPMENT_PACKS', 'IG_ARMORS', 'IG_SPELL_ROSTER',
      'IG_STANCE_DEFS', 'IG_CONDITIONS', 'IG_POWERS', 'IG_FEATS',
      'IG_BACKGROUND_DEFS', 'IG_ANCESTRIES',
    ];
    for (const sym of required) {
      expect(source.includes(`export const ${sym}`), sym).toBe(true);
    }
  });
});
