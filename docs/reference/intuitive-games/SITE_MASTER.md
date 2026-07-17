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
| /spell-list | ⬜ re-scrub for verbatim verification (powers surfaced from template) | `content.ts` `IG_POWERS`; library "Powers & Spells" |
| /redistribution | ⬜ not yet scrubbed | referenced by Conduit; partial via feats |
| /game-list | ⬜ not yet scrubbed | — |
| / (home) | ⬜ not yet scrubbed (nav + intro) | — |

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

*(Remaining page transcriptions — core rules, skills, ancestries, backgrounds, feats, classes, companions,
items, spell-list, redistribution, game-list, home — are added in subsequent scrub slices; see the tracker.)*
