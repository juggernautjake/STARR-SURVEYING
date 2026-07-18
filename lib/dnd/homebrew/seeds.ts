// lib/dnd/homebrew/seeds.ts — the starter homebrew catalog (Area H2). Seeds the shareable catalog with the
// two hand-authored pieces the owner named: the RANGOR race and the PUGILIST class (Jack's homebrew). The
// descriptions are lifted from the existing sheet data (app/dnd/_sheet/data/rangor.ts + jack.ts) — not
// invented — so the catalog entry says exactly what the character sheet already grants. Attributed to Jacob,
// scoped to 2024 (Jack is "D&D 5e 2024 with homebrew"), and approved so it shows in the library out of the box.
import type { HomebrewContent } from './model';

export const HOMEBREW_SEEDS: HomebrewContent[] = [
  {
    id: 'hb-rangor-race',
    kind: 'race',
    name: 'Rangor',
    system: 'dnd5e-2024',
    creator: { name: 'Jacob' },
    status: 'approved',
    summary: 'The galaxy’s “Unstoppable Force” — rocklike, momentum-driven aether-brawlers.',
    description: [
      '**Natural Armor (Rocklike Scales).** While not wearing armor, your AC = 13 + your DEX modifier.',
      '**Living Momentum.** When you hit with an attack after moving at least 15 ft in a straight line, choose one: push the target 15 ft; knock it Prone (STR save vs 8 + STR + PB); or deal extra damage equal to your STR modifier.',
      '**Powerful Build.** You count as one size larger for carrying capacity and what you can push, drag, or lift.',
      '**Unstoppable Force.** Twice per long rest, when an effect would reduce your speed or forcibly move you, you can ignore it.',
    ].join('\n\n'),
    tags: ['race', 'ancestry', 'neon-odyssey', 'brawler'],
  },
  {
    id: 'hb-pugilist-class',
    kind: 'class',
    name: 'Pugilist',
    system: 'dnd5e-2024',
    creator: { name: 'Jacob' },
    status: 'approved',
    summary: 'A bare-knuckle martial class built on Fisticuffs + a Moxie pool. Subclass: Sweet Science.',
    description: [
      '**Fisticuffs.** Your unarmed strikes are your signature weapon, scaling as you level.',
      '**Iron Chin.** While not wearing armor, your AC = 12 + your CON modifier (the sheet uses whichever unarmored formula is higher).',
      '**Moxie.** A pool of grit you spend on class maneuvers; it refreshes on a rest.',
      '**Bloodied But Unbowed / Swagger Streak / Heavy Hitter.** Low-level Pugilist features that reward staying in the fight.',
      '**Subclass — Sweet Science (Bare Knuckle Boxer).** Your Unarmed Strikes score a Critical Hit on a 19 or 20.',
    ].join('\n\n'),
    tags: ['class', 'martial', 'unarmed', 'brawler'],
  },
];
