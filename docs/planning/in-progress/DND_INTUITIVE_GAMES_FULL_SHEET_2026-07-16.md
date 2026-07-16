# Intuitive Games — the FULL character builder + sheet (everything in the spreadsheet & the system)

**Goal (from the DM):** build the **complete** Intuitive Games character builder and sheet so it handles
**everything in the Character Sheet Template** (the uploaded 9-tab spreadsheet) and **all of the rules,
traits, features, actions, powers, stances, skills, and creatures from intuitivegames.net**. It must build a
character faithfully to the system's own math, flag custom vs vanilla on every element (already built), plug
into the DM approval workflow (already built), and be **fully styleable / customizable** like every other
sheet on the platform.

This is the deep follow-on to `completed/DND_INTUITIVE_GAMES_BUILDER_2026-07-15.md` (which shipped the
vanilla content library, catalog, provenance model, DM approval, campaign policy, DM grants, and a first
build-from-vanilla picker on the shared 5e-shaped sheet). That gave us **correct provenance + approval**; this
doc gives us the **real IG data model, rules math, complete content, and a bespoke 9-tab sheet**.

## The spreadsheet, tab by tab (what the build must cover)

1. **Character Introduction** — Level, Class, Subclass, Specialization, Background; character photo; bio
   prose; Height, Weight, Eyes, Hair, Age, Age Category (Young Adult…), Culture, Alignment, Ancestry, Games;
   Common + Uncommon Languages, Tools, Vehicles, Religion, Values; Notes.
2. **Basic Information** — the six **Ability Scores** (STR/DEX/CON/INT/WIS/CHA, score + modifier — same six
   as 5e); **General Feats**, **Combat Feats**, **Powers**; **Ancestry & Traits**; **Stances**; **Weapon
   Groups**; a **Dice Roller** (Attack / Skill / Artistry with misc modifiers, damage, sneak attack,
   advantage, roll type), **Saving Throw** + **Ability Check / Initiative**; Notes.
3. **Combat** — **Attacks** (Weapon Name, Attack, Total Damage, Bonus Damage, Weapon Type, Properties,
   Proficient, Weapon Focus, Weapon Specialization, Strength Modifier); **Hit Points** (Class+Background HP,
   Nonlethal damage taken, Lethal damage taken); **Damage Reduction**; **Saves** (Fortitude, Reflex, Will —
   THREE, not six); Misc Bonuses; **Stances**; **Situational Bonuses**; **Defensive Power**; **Conditions**;
   Notes.
4. **Skills** — a **rank budget** (Skill Ranks Available / Ranks Spent / Proficiency = level); **General
   Skills** grouped by ability (Strength/Dexterity/Intelligence/Wisdom/Charisma-Based) each with
   Ranks/Prof/Misc/Total; **Combat Skills** (Dirty Trick, Disarm, Grapple, Overrun, Reposition, Steal,
   Sunder, Trip, Feint — Str/Dex variants); a **Proficient Skills** roll-up; Notes.
5. **Reference Sheet** — **Actions** grouped by economy (**Single / Double / Triple / Reactions / Other**);
   **Feats & Special Powers** descriptions; **Stance Descriptions** (all 10 with their A/B effects).
6. **Equipment** — worn slots **Arms / Head / Torso / Legs / Hands**; **Other Possessions**; Notes.
7. **Companion Creature** — its own **Ability Scores, Skills (ranks), Attacks, Powers, Conditions, Hit
   Points, Saves, Damage Reduction, Movement, Type, Resistances, Vulnerabilities**, Situational Bonuses,
   Notes.
8. **Summary** — a condensed one-page view (identity, ability scores + mods, HP, the three saves, key
   skills, attacks, Starting Power, Defensive Power, Stance 1/2).
9. **Data Sheet** — the reference registry: **Creatures** (full bestiary), **Movement Types**, **Weapon
   Types**, **Stances**, **Spell List** (by school, with effects), **Class List** (13), **Subclass List** (5),
   **Defensive Powers** (with effects). This is our content library — audit + complete it.

## Architecture (deterministic-first, additive on what shipped)

- **IG character model** (`lib/dnd/systems/intuitive-games/model.ts`): a typed `IGCharacter` that captures all
  nine tabs. Stored as a **sidecar on `character.data.ig`** so the shared 5e-shaped sheet keeps working (the
  builder already writes a 5e projection — meta/features/attacks — for compatibility + provenance), while the
  bespoke IG sheet reads the rich `data.ig`. No DB migration: `data` is jsonb.
- **Rules engine** (`lib/dnd/systems/intuitive-games/rules.ts`): pure IG math so stats are never wrong —
  ability modifier, **proficiency = level**, **save total = rank + level + governing attribute**
  (Fort/Con, Reflex/Dex, Will/Wis), **skill total = ranks + (prof? level : 0) + misc + attribute**, attack /
  total-damage, sneak attack, **degrees of success** (crit-fail/fail/success/crit-success by ±10). Grounded
  by the existing `system-rules.ts` IG entry.
- **Complete content** (`content.ts` + catalog): finish the Data-Sheet registry — all spells by school with
  effects, every defensive power, the full bestiary (companion creatures), the full skill list with governing
  ability, feats with effect text, and the **actions taxonomy** by economy.
- **Bespoke IG sheet** (`app/dnd/_sheet` IG skin / panels): render the 9 tabs from `IGCharacter`, every
  element carrying its **VANILLA / CUSTOM / DM-GRANTED** badge, fully editable, and **styleable via the
  existing custom-sheet engine** (SheetStyleBrowser + custom layout/CSS already apply to IG characters).
- **Provenance / approval / policy / DM grants** — already shipped; extend provenance extraction to read the
  full model so every element across all tabs is flagged.

## Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Content completeness (the Data Sheet).** ✅ Completed `content.ts` + catalog against the
  template's Data Sheet: **all 37 powers now carry a mechanical effect summary** (from the Spell List
  descriptions); added the **actions taxonomy** `IG_ACTIONS` grouped by the 3-action economy (Single /
  Double / Triple / Reaction / Other, feat/free notes) + `igActionsByEconomy`; added the **full bestiary**
  `IG_CREATURES` (70+ companion creatures grouped Animals / Dragons / Elementals / Fey / Magical Beasts /
  Undead) + `igCreaturesByGroup`, and the classifier now recognizes both a group name (Dragons) and a
  specific creature (Griffon) as a vanilla `creature-type`. The catalog surfaces new **Creatures · <group>**
  and **Actions · <economy>** sections. Verified: `tsc` clean, lint clean,
  `__tests__/dnd/ig-content-complete.test.ts` (4 tests: every power has effect text, actions cover the whole
  economy, bestiary complete + grouped + classifies vanilla by name-or-group, catalog surfaces both); full
  dnd suite (303) green. *(Deferred within this slice: per-feat effect text — the provided template dump
  leaves the "Feats & Special Powers descriptions" cells `#N/A`, and inventing feat mechanics would violate
  the anti-wrong-mechanics rule; feats stay name+category until authoritative text is sourced from
  intuitivegames.net. The skill list + combat-skill variants already live in the `system-rules.ts` IG entry
  and are exercised by the Skills sheet slice.)*
- **Slice 2 — IG character model + rules engine.** ✅ `model.ts` — the typed `IGCharacter` over every tab
  (identity/intro, six ability scores, ranked skills, the three saves, combat: attacks/HP/DR/stances/
  conditions/defensive power, feats general+combat, powers, weapon groups, equipment slots, companion
  creature) + `blankIGCharacter` + `isIGCharacter`; `IG_ABILITIES` / `IG_SAVES` / `IG_SAVE_ABILITY`
  (Fort/Con, Reflex/Dex, Will/Wis). `rules.ts` — the pure anti-wrong-mechanics math: `igAbilityMod`,
  `igProficiency` (= level), `igSaveTotal`/`igSaves` (rank + level + governing attribute — defaults to 1 at
  level 1, matching the template), `igSkillTotal`/`igSkillTotals` + `igRanksSpent`, `igAttackBonus`/
  `igDamageBonus`/`igResolveAttack` (proficiency + Weapon Focus/Specialization + STR-melee → "2d6+6"),
  `igDegreeOfSuccess` (PF2-style ±10 with nat-20-up/nat-1-down), `igMaxHp`/`igCurrentHp` (Class+Background HP
  + CON×level), and an `igDerived` roll-up for the Summary tab. Verified: `tsc` clean, lint clean,
  `__tests__/dnd/ig-rules.test.ts` (6 tests: modifier + proficiency, the three saves = 1 at L1 and scale with
  rank/level/attr, skill totals trained vs untrained, attack + damage with focus/spec/STR-melee, degrees of
  success incl. nat 20/1, max HP + derived summary); full dnd suite (309) green.
- **Slice 3 — Full builder → model.** ✅ `buildIGModel(picks)` assembles a complete `IGCharacter` (identity
  incl. specialization/background/ancestry/alignment/culture/bio, ability scores, stances, powers, feats
  **split general/combat by catalog category**, weapon groups, defensive power, weapon→attack shells) and
  `assembleIGVanillaCharacter` now attaches it as the **`.ig` sidecar** alongside the existing 5e projection +
  kinded `igBuild`, so the shared sheet + provenance keep working while the bespoke IG sheet reads `data.ig`.
  `IGPicks` gained optional `abilities` + identity fields (the guided builder collects these). The `ig-build`
  route already persists the whole assembled character, so the sidecar is saved with no route change.
  Verified: `tsc` clean, lint clean, `__tests__/dnd/ig-builder.test.ts` (+2 = 9 tests: the `.ig` sidecar is a
  valid IGCharacter with level/abilities/stances/defensive-power/attacks, feats split general/combat, and the
  rules engine resolves it — proficiency 4, Fortitude = rank+level+CON; `buildIGModel` pure/standalone); full
  dnd suite (311) green.
- **Slice 4 — IG sheet: Identity + Basic Info + Summary.** Bespoke panels rendering intro/bio, the six
  ability scores + mods, the three saves, and the summary top-line from `data.ig`, with provenance badges;
  editable; styleable.
- **Slice 5 — IG sheet: Skills.** The rank-budgeted, ability-grouped skills + combat skills with
  Ranks/Prof/Misc/Total computed by `rules.ts`; ranks-available/spent tracker.
- **Slice 6 — IG sheet: Combat.** Attacks table (focus/specialization/proficient, attack + total damage from
  `rules.ts`), HP + nonlethal/lethal + Damage Reduction, the three saves, stances, situational bonuses,
  defensive power, conditions.
- **Slice 7 — IG sheet: Reference + Equipment + Notes.** Actions grouped by economy, feats/powers/stance
  descriptions, the worn-slot equipment + other possessions, notes.
- **Slice 8 — IG sheet: Companion Creature.** The companion's own scores/skills/attacks/powers/HP/saves/DR/
  movement/resistances/vulnerabilities.
- **Slice 9 — Full guided builder UI.** Upgrade `IGCharacterBuilder` into a step-through that drives the whole
  model (identity → scores → skills w/ rank budget → feats/powers/stances → weapon groups → defensive power →
  equipment → companion), live vanilla/custom count throughout, writing `data.ig`.
- **Slice 10 — AI-customize over the full model.** Ground the AI to Intuitive Games so an AI build/edit fills
  the real `IGCharacter` and any invented element is auto-flagged custom (via the same `igBuild`/provenance
  path), matching IG mechanics.
- **Slice 11 — QA + docs.** End-to-end pass across every tab (vanilla build → all-vanilla, custom → flagged,
  vanilla-only blocks, DM grant allowed, approve/reject + notification, styling applies), full dnd vitest
  suite green, tsc + lint clean; then move this doc to `completed/`.

## Considerations
- **Deterministic guarantee:** the model, rules math, content, classification and policy all work with zero
  external services — the AI is additive, never required for correctness (the anti-wrong-mechanics rule).
- **No cross-system leakage:** everything keyed to `intuitive-games`; the shared sheet stays valid via the 5e
  projection.
- **Facts, not prose:** store mechanical summaries attributed to the template / intuitivegames.net.
- **Backward compatible:** `data.ig` is a sidecar; existing IG characters (built by the first builder) keep
  working and gain the rich sheet once rebuilt/edited.
- **Reuse:** build on the shipped content library, catalog, provenance, submission/approval, DM grants,
  campaign policy, the custom-sheet/style engine, and `/ai-edit` grounding — don't fork them.

### Status: IN PROGRESS (Slices 0–3 shipped; 4–11 pending)
