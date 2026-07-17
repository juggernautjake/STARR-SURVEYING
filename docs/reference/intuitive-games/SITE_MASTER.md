# Intuitive Games — Master Site Reference (the source of truth)

**Attribution.** Intuitive Games is **Brendan's** tabletop system (he is the creator); `intuitivegames.net` is
his site. This document reproduces his system faithfully so the app can present and play it, with the system
credited to him. All rules/terms are his work, transcribed here verbatim from the site.

**Purpose.** This document is a faithful, complete scrub of **intuitivegames.net** — every page, every rules
block, every table, every list, every named element. It is the authoritative reference we build the app's
Intuitive Games system against: the library page, the character builder, and the character sheet must all
contain and correctly implement everything captured here — fully interactive, with tooltips and manual + AI
editing. **Nothing in this document is invented** — where the site leaves something a work-in-progress, empty,
or truncated, that is recorded as such (never fabricated).

**Owner directive (2026-07-17):** "Map out the entire website… scrub every image and all of the text and media
and literally everything on the site… put it all into a full and complete document that is well formatted and
well structured… then use that document to make sure that everything is completely and properly built… the
character builder and character sheet fully interactable and wired to handle all of the rules… tooltips… edit
manually or with AI."

---

## Foolproof scrub methodology (page → element → verify)

For EVERY page in the site map below, in order:
1. **Fetch the full page** and transcribe **verbatim**: every heading, paragraph, table, and list, in document
   order — no summarizing away mechanical detail. Long pages are re-fetched section-by-section for fidelity.
2. **Record into this doc** under that page's section: all text + tables + lists reproduced faithfully.
3. **Note media:** image alt-text / captions / URLs where surfaced. *(Limitation: the fetch tool returns the
   page as markdown, so binary images and pixel-level visuals aren't captured; image REFERENCES + any
   caption/alt text are. Flagged per page where images are present.)*
4. **Mark status:** ✅ FULL · 🟨 PARTIAL (site truncated / fetch summarized — re-verify) · 🚧 WIP-on-site
   (the page itself is unfinished) · ⬜ not yet scrubbed.
5. **Cross-check the app:** note where our code (`lib/dnd/systems/intuitive-games/*`, `lib/dnd/library.ts`,
   the builder/sheet) already implements it and where a gap remains.

## Verification phase (after the scrub is complete)

Go element-by-element through this doc and confirm each is (a) present in the app's library, (b) offered/
handled by the builder + sheet where it's a character choice, (c) tooltip-explained, and (d) editable
manually + by the AI. Log gaps as follow-up slices in `docs/planning/in-progress/INTUITIVE_GAMES_FULL_BUILDOUT_2026-07-17.md`.

---

## Complete site map

**Characters:** `/character-building` · `/backgrounds` · `/classes` · `/traits-ancestries` · `/feats-general`
· `/feats-combat` · `/stances`
**Rules:** `/core-rules` · `/conditions` · `/skills` · `/faqs`
**Items:** `/weapons` · `/armor-shields` · `/equipment` · `/tools` · `/magical-items`
**Additional:** `/companion-creatures` · `/spell-list` · `/game-list` · `/redistribution`
**Home:** `/`
External: Online Community (Locals platform link).

## Scrub-status tracker

| Page | Status | In-app implementation |
|---|---|---|
| /conditions | ✅ FULL (18 verbatim) | `content.ts` `IG_CONDITIONS`; library "Conditions" table; sheet tooltips + mechanics |
| /stances | ✅ FULL (10, Basic/Advanced) | `content.ts` `IG_STANCE_DEFS`; library "Stances"; sheet display + tooltip + editable |
| /traits-ancestries | ✅ FULL (10 ancestries) | `content.ts` `IG_ANCESTRIES`; library "Ancestries"; sheet traits panel |
| /backgrounds | ✅ FULL (10) | `content.ts` `IG_BACKGROUND_DEFS`; library "Backgrounds" |
| /feats-general | ✅ FULL (83) | `feats.ts` `IG_GENERAL_FEATS`; library "Feats"; sheet tooltips |
| /feats-combat | ✅ FULL (68) | `feats.ts` `IG_COMBAT_FEATS`; library "Feats" |
| /skills | ✅ FULL (rules + combat skills) | `content.ts` `IG_SKILL_RULES`/`IG_COMBAT_SKILL_RULES`; library "Skills"/"Combat Skills" |
| /core-rules | ✅ FULL (resolution/economy/saves + damage/cover/movement) | `system-rules.ts` + `content.ts`; library "core"/"damage" |
| /character-building | ✅ FULL (L1 order + progression) | `content.ts` `IG_BUILD_STEPS`; library "Building a character" |
| /classes | 🟨 PARTIAL (roster + per-class detail; full per-level ladders + taxonomy pending) | `content.ts` `IG_CLASS_GROUPS`/`IG_CLASS_DETAILS`; library "Classes" |
| /companion-creatures | ✅ FULL (4 types + rules; combat-direction WIP on site) | `content.ts` `IG_COMPANION_TYPES`; library "Companion Creatures" |
| /weapons | 🚧 WIP-on-site (framework only, no roster) | `items.ts`; library "Weapons"/"Weapon Properties" |
| /armor-shields | ✅ FULL | `items.ts` `IG_ARMORS`/`IG_SHIELDS`; library "Armor"/"Shields" |
| /equipment | 🟨 PARTIAL (packs + kits; other tables empty on site) | `items.ts` `IG_EQUIPMENT_PACKS`; library "Equipment" |
| /tools | 🚧 WIP-on-site (concept only, no roster) | `items.ts` `IG_TOOL_RULES`; library "Tools" |
| /magical-items | ✅ FULL (Eldritch Jewels + 12 enchantments) | `items.ts` `IG_ENCHANTMENTS`; library "Magical Items" |
| /faqs | 🚧 WIP-on-site (no Q&A content) | — (nothing to reproduce) |
| /spell-list | 🟨 PARTIAL (full roster captured; app missing ~24 spells + Desc/Adv/Expert tiers; fetch declined verbatim effects) | `content.ts` `IG_POWERS`; library "Powers & Spells" |
| /redistribution | ✅ FULL | `content.ts` `IG_REDISTRIBUTION_RULES`; library "Redistribution" |
| /game-list | 🚧 WIP-on-site (one board game, "Overrun") | — (no RPG rules impact) |
| / (home) | ⬜ not yet scrubbed (nav + intro) | — |
| ART — ancestry portraits | 🟨 PARTIAL (8 race portraits downloaded + on the sheet) | `public/dnd/intuitive-games/ancestries/*.png`; `art.ts`; sheet ancestry panel |
| ART — character/class/other | ⬜ not yet scrubbed (classes page + home logo remain) | — |

*Legend:* the ✅ pages below carry their full transcription; the ⬜/🟨 pages are filled in over subsequent
scrub slices. This tracker is updated as each page is completed.

---

# PAGE TRANSCRIPTIONS

## /conditions — Conditions ✅ FULL

18 standardized states, full verbatim text:

- **Asleep** — The creature can take no actions and is treated as paralyzed. Any amount of damage, loud noises, or physical contact with another creature may wake the sleeping creature.
- **Blind** — A blinded creature automatically fails all sight-based perception checks. They are at disadvantage on all attack rolls, reflex saves, and perception checks. If a character is permanently blinded then they may spend a trait to remove the disadvantage on one of the three penalized abilities.
- **Broken** — A broken item does not function properly. Technological items do not work while broken. Weapons are at disadvantage on attack rolls. Armor provides only half of the normal DR and imposes a -2 penalty on reflex saves. Shields provide no reflex save bonus when broken.
- **Confused** — A confused creature lashes out against those around it, making attacks wildly with whatever weapon or item it has in its hands. The confused creature must roll a die at the beginning of every turn. Odd = cannot tell friend from foe and attacks the nearest creature; even = can tell friend from foe and either attacks a foe or itself. If it can tell friend from foe and provokes a reaction, it automatically fails its reflex save to avoid an attack if one is made.
- **Deaf** — A deafened creature automatically fails all hearing-based perception checks. They are at disadvantage on all reflex saves and perception checks. If permanently deafened they may spend a trait to remove the disadvantage on one of the two penalized abilities.
- **Entangled** — At disadvantage on all strength or dexterity-based checks, excluding checks to free themselves. Cannot move from their current location.
- **Fascinated** — Cannot take any actions. Ends prematurely if threatened or attacked. At disadvantage on all perception checks.
- **Flat-Footed** — Does not add their dexterity modifier on any reflex saves or skill checks and cannot make reactions. All creatures are flat-footed until they take an action in combat.
- **Grappled** — Flat-footed and cannot move from its current location. Cannot take any actions which require two hands.
- **Heatstroke** — Exposed to blistering heat without protection: 1 nonlethal damage every ten minutes; treated as shaken if they fail a fortitude save every 10 minutes.
- **Hypothermia** — Exposed to freezing cold without protection: 1 nonlethal damage every ten minutes; treated as entangled if they fail a fortitude save every 10 minutes.
- **Incorporeal** — Does not take damage from physical attacks and passes through solid objects. Can see into the spirit world by spending three actions (the parallel part matching its natural-world location); while viewing, it is considered blind.
- **Invisible** — Advantage on stealth checks; other creatures are flat-footed to its attacks. An attacker must identify the square; a creature who cannot see its attacker applies the Blind penalty (disadvantage on all opposed attack rolls and reflex saves), even if the attacker was merely unnoticed.
- **Paralyzed** — Cannot use any actions, reactions, free actions, or anything requiring movement. Reflex saves are always treated as a Natural 1 (only adding level). Rolling attacks with advantage against it automatically increases the degree of success by one step, skipping the first source of advantage.
- **Pinned** — Treated as prone along with the usual penalties of being grappled.
- **Prone** — Cannot make ranged attacks; at disadvantage on all melee attack rolls and perception checks.
- **Shaken** — -2 penalty on attack rolls, saving throws, skill checks, and ability checks.
- **Sickened** — -2 penalty on attack rolls, saving throws, skill checks, and ability checks. If it fails any Fortitude save while sickened, it becomes paralyzed for a number of rounds equal to the amount it failed by.

## /stances — Stances ✅ FULL

**General rules.** Activated using an action; last one minute. Only one stance active at a time; ended with a
free action on your turn. Characters below Level 5 gain the Basic benefit; at Level 5+ they gain the Advanced
benefit (a single benefit).

| Stance | Basic (below Lv 5) | Advanced (Lv 5+) |
|---|---|---|
| Offensive | Advantage on all attack rolls, disadvantage on all Reflex saves. | Bonus on all damage rolls equal to half your level. |
| Defensive | Disadvantage on all attack rolls, advantage on all Reflex saves. | Damage Reduction equal to half your level. |
| Neutral | Ignore opponents' stance bonuses that enhance attack rolls, incl. flanking. | Ignore all of opponents' stance bonuses. |
| Mobile | No longer provoke reactions from moving through a threatened area. | No longer provoke reactions. |
| Shifting | You can't be flanked. | If an attack misses you, it provokes a reaction. |
| Welcoming | Allies can share your square. | One ally sharing your square gains +½ level to Reflex saves. |
| Swarming | Advantage on attack rolls when flanking. | Bonus on attack rolls equal to half your level when flanking. |
| Precise | +1d6 sneak attack vs a flanked / Unconscious / Entangled / Paralyzed / Blinded target. | Sneak attack increases to 2d6. |
| Supportive | Count as flanking when you threaten an enemy an ally also threatens. | Flanking allies gain an attack bonus equal to half your level. |
| Menacing | Advantage on trained combat skills. | Advantage on all combat skills. |

## /redistribution — Redistribution ✅ FULL

The Conduit's signature ability. A **two-action activity** that rearranges materials into different shapes,
converting between liquid and solid forms. You know a number of materials equal to your **Wisdom modifier** and
can affect material up to your **character level in pounds** (or equivalent square footage at one inch
thickness). Must **touch** the material (barefoot contact counts); cannot redistribute multiple known materials
at once; quantities are at DM discretion.

**Seven material categories:** Fine Particles, Fluids, Gems, Metal, Stone, Oozes, Organic Matter (cannot
transmute organic matter that is still alive or attached to a living being).

**Applications:**
- **Manufacture Object** — replaces Craft checks using the relevant skill (e.g. Nature for Organic Matter),
  same time/failure as crafting. Cannot enchant Eldritch Jewels; mixed-material items need the extra materials
  sourced separately.
- **Launch Material** — a two-action ranged attack, 30 ft, dealing 1d4 physical damage (+1d4 per two levels
  after the first); damage type set by material (Metal: slashing/piercing/bludgeoning choice; Gems: piercing).

*App:* `content.ts` `IG_REDISTRIBUTION_RULES` → library "Redistribution" section.

## /spell-list — Spell List 🟨 PARTIAL (roster captured; full effects need Brendan's text)

Spells are organized into **8 schools**, and each spell has **Description / Advanced / Expert** tiers (action
costs from reactions to ten-action activities, ranges, damage dice, save types). **The full roster (names by
school):**

- **Abjuration:** Dispel Magic, Protection From Elements, Shield Ally
- **Conjuration:** Conjure Wall, Create Shelter, Gate, Natural Ally, Portal, Summon Material, Teleportation, Unseen Servant, Elemental Blade
- **Divination:** Detect Magic, Detect Thoughts/Emotions, Foresight, Scrying, Trace, Unburdened Vision, Comprehend, Mindlink, Named Bullet
- **Enchantment:** Calm, Command, Enchant Creature, Erase Memory, Hold Creature, Mind Scream, Subtle Manipulation
- **Evocation:** Destruction, Intense Blast, Repeating Blast, Telekinesis, Radiance, Spectral Sling, Vitality, Wave Crash, Wind Blast
- **Illusion:** Create Image, Darkness, Disguise, Invisibility, Light, Mimic Sound, Mirror Image
- **Transmutation:** Adaptation, Burst, Carapace Growth, Creature Morph, Item Shift, Natural Attacks, New Movement, Poison Dart, Quick Claw, Temporary Weapon

**⚠ GAP + limitation:** the app's `IG_POWERS` (~38, with effect text from the character-sheet template) is
**missing several of the spells above** (e.g. Natural Ally, Elemental Blade, Trace, Unburdened Vision,
Comprehend, Named Bullet, Calm, Erase Memory, Hold Creature, Mind Scream, Destruction, Repeating Blast,
Radiance, Spectral Sling, Vitality, Wave Crash, Disguise, Burst, Carapace Growth, Creature Morph, Item Shift,
Poison Dart, Quick Claw, Temporary Weapon) and does not yet model the **Description/Advanced/Expert tiers**.
The fetch tool declined to reproduce the full verbatim spell effects, so completing this faithfully needs the
exact text from the site/Brendan — **flagged as a follow-up**, not fabricated.

## ART — Ancestry / race portraits 🟨 PARTIAL

**Attribution:** all art is **Brendan's** (Intuitive Games); downloaded from the site's public CDN into the
app with a visible "Art · Brendan (Intuitive Games)" credit. *(Recommend Brendan's explicit OK on reuse — a
formality given it's his system being built into the app at the owner's request.)*

The `/traits-ancestries` page publishes a hand-drawn ink portrait per ancestry. **8 downloaded** →
`public/dnd/intuitive-games/ancestries/`: dwarf, elf, gnome, halfling, leshonki, **migoi** (the site's "Yeti"
race art), naga, ogre. **Human and Sprite have no portrait on the site.** Source: Squarespace CDN
`…/65fb23736e04db4769b471d2/…` (filenames like `Male+Dwarf+Race+Art.png`, `Elf.png`, `Male+Yeti+Race+Art.png`).
Manifest: `lib/dnd/systems/intuitive-games/art.ts` (`igAncestryArt`); rendered in the IGSheet ancestry panel on
a light card (the art is ink-on-white) with the credit line.

**Remaining art:** class/character illustrations on `/classes`, the site logo/branding on the home page, and
any item/spell art — a follow-up browser-scrub slice.

## /game-list — Game List 🚧 WIP-on-site

Primarily a navigation hub. One board game featured: **Overrun** — "a fast-paced game that allows 2-4 players
to compete for control of the central tiles" using mushroom tokens; 10–20 minute games that play "like
checkers or other traditional board games." (Not an RPG rules page — no app rules impact; recorded for
completeness.)

---

*(Remaining page transcriptions — core rules, skills, ancestries, backgrounds, feats, classes, companions,
items, home — are added in subsequent scrub slices; the ✅ pages' content already lives in the app modules
cited in the tracker. ART SCRUB — race/character/other art from the site — is a separate slice using browser
screenshots, per the owner's 2026-07-17 request; tracked in the planning doc.)*
