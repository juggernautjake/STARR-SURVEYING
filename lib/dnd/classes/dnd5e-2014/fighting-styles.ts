// lib/dnd/classes/dnd5e-2014/fighting-styles.ts — the 2014 Fighting Styles, as DATA.
//
// 2014 differs from 2024 in two ways that matter here:
//
//  1. A Fighting Style is not a feat. The 2024 catalog models each one as a `category: 'fighting-style'`
//     feat, so the level walker can offer them straight from `featCatalogForSystem`. In 2014 they exist
//     only as prose inside each class's feature body — which meant the walker demanded a Fighting Style
//     and had nothing to present, exactly the bug fixed for 2024 in the final-QA walkthrough (slice 4)
//     and missed for 2014 because `featCatalogForSystem('dnd5e-2014')` returns `category: null` for
//     everything, so the category filter matched none of them.
//
//  2. The list is PER CLASS. A 2014 Fighter has six styles, a Ranger four, a Paladin four — and the
//     Paladin's four are not the Ranger's four. A single shared list would offer a Paladin "Archery",
//     which the 2014 rules do not.
//
// Nothing here is invented: each entry is the same style, with the same effect, already written into the
// corresponding class's Fighting Style feature body in this directory (fighter.ts / ranger.ts /
// paladin.ts). This module only gives that prose a structure the picker can render.
export interface Fighting2014Style {
  key: string;
  name: string;
  description: string;
}

const S = {
  archery: { key: 'fs14-archery', name: 'Archery', description: '+2 bonus to attack rolls you make with ranged weapons.' },
  defense: { key: 'fs14-defense', name: 'Defense', description: '+1 bonus to AC while you are wearing armor.' },
  dueling: { key: 'fs14-dueling', name: 'Dueling', description: '+2 bonus to damage when you are wielding a melee weapon in one hand and no other weapons.' },
  greatWeapon: { key: 'fs14-great-weapon', name: 'Great Weapon Fighting', description: 'Reroll a 1 or 2 on a damage die for a melee weapon you are wielding with two hands (including versatile). You must use the new roll.' },
  protection: { key: 'fs14-protection', name: 'Protection', description: 'When a creature you can see attacks a target other than you within 5 feet, you can use your Reaction to impose Disadvantage on the attack roll. You must be wielding a Shield.' },
  twoWeapon: { key: 'fs14-two-weapon', name: 'Two-Weapon Fighting', description: 'When you engage in two-weapon fighting, you can add your ability modifier to the damage of the second attack.' },
} satisfies Record<string, Fighting2014Style>;

/**
 * The styles each 2014 class may choose from, keyed by class key.
 *
 * Only these three classes grant a Fighting Style in the 2014 PHB (the Artificer in this repo's catalog
 * does not), so an unlisted class correctly resolves to an empty list rather than a default one.
 */
export const FIGHTING_STYLES_2014: Record<string, Fighting2014Style[]> = {
  fighter: [S.archery, S.defense, S.dueling, S.greatWeapon, S.protection, S.twoWeapon],
  ranger: [S.archery, S.defense, S.dueling, S.twoWeapon],
  paladin: [S.defense, S.dueling, S.greatWeapon, S.protection],
};

/** The legal 2014 Fighting Styles for a class key; empty for a class that grants none. */
export function fightingStyles2014(classKey: string): Fighting2014Style[] {
  return FIGHTING_STYLES_2014[classKey.toLowerCase()] ?? [];
}
