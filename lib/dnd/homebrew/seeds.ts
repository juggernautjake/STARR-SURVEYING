// lib/dnd/homebrew/seeds.ts — the starter homebrew catalog (Area H2). Seeds the shareable catalog with the
// two hand-authored pieces the owner named: the RANGOR race and the PUGILIST class (Jack's homebrew). The
// descriptions are lifted from the existing sheet data (app/dnd/_sheet/data/rangor.ts + jack.ts) — not
// invented — so the catalog entry says exactly what the character sheet already grants. Approved, so both
// show in the library out of the box.
//
// SCOPE + CREDIT set by the owner 2026-07-27: Rangor is `'any'` (every system's custom races), Pugilist
// stays `'dnd5e-2024'` (that system's custom classes) and is co-credited to **Andrew & Jacob**.
//
// WHAT THESE ENTRIES ARE NOT, and it matters. Neither carries a mechanical `payload`, so neither is
// ADOPTABLE onto a character yet — `homebrewToClassDefinition` requires a structurally-valid 20-level
// `ClassDefinition` and refuses anything less rather than storing a class the level builder cannot level.
// The repo holds real Pugilist rules only through **level 3** (jack.ts, plus the Fisticuffs die's 1d8 →
// 1d10 @5 → 1d12 @11 → 2d6 @17 scaling and Extra Attack); the authoritative source is the shared PDF named
// in `completed/DND_JACK_RANGOR_PUGILIST_2026-07-15.md`, which is not in the repo. Writing levels 4–20 from
// the shape of the first three would be inventing a class, which is the one thing Ground Rule 3 forbids —
// the same reason the Magus/Summoner tables are blocked. So these are findable and readable now, and
// become usable the moment the PDF lands. `homebrew-library.test.ts` pins that boundary in both
// directions so it cannot be quietly forgotten OR quietly filled in.
import type { HomebrewContent } from './model';

export const HOMEBREW_SEEDS: HomebrewContent[] = [
  {
    id: 'hb-rangor-race',
    kind: 'race',
    name: 'Rangor',
    // `'any'`, not `'dnd5e-2024'` — owner 2026-07-27: *"The rangor will be shown in the custom races for
    // ALL systems"*. The model has carried a system-agnostic scope since H1 (`homebrewAppliesToSystem`
    // returns true for `'any'` against every system), so this is a scope correction rather than a new
    // capability: the race now appears in the custom-races section of every system's library, while the
    // Pugilist below stays scoped to 2024 as instructed.
    system: 'any',
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
    // Co-credited per the owner 2026-07-27: *"The Pugilist will be custom class that is attributed to
    // Andrew and Jacob"*. `HomebrewCreator.name` is a single credited string and stays that way — a
    // `creators[]` array would be the tidier model, but nothing else in the catalog has co-authored
    // content, and inventing a plural field for one entry costs more than it carries. If a second
    // co-authored piece ever lands, that is the moment to widen it.
    creator: { name: 'Andrew & Jacob' },
    status: 'approved',
    summary: 'A bare-knuckle martial class built on Fisticuffs + a Moxie pool. Seven Fight Clubs in 2014; six subclasses in the 2024 revision.',
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
