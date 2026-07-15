# Add the Intuitive Games system to the character-builder rules catalog

**Goal (from the DM):** ingest the rules and races from https://www.intuitivegames.net (the "Intuitive
Games" tabletop RPG) so the platform understands that system — its ancestries, classes, skills, conditions,
and core mechanics — and can build/ground/validate characters in it exactly like it does for D&D 5e and
Pathfinder 2e. A character set to this system must never get the wrong (e.g. 5e/PF2) mechanics.

## What the system is (mechanical facts gathered from the site)

A d20 system, **levels 1–10**, with **degrees of success** (crit success = beat by 20 / partial success =
tie → minimum damage / crit failure = miss by 20), a **3-action economy** (+1 reaction), **level-as-
proficiency** (your level is added to trained rolls), the six abilities (Str/Dex/Con/Int/Wis/Cha, mod =
(score−10)/2), **three saves** — Fortitude/Reflex/Will — ability **boosts** (start 10, eight +2 boosts at
level 1, creation cap 14; more at 3/6/9), HP = class (10) + background, Stride 20 ft / Step 5 ft movement, a
Multiple Strike Penalty (−2 per extra attack), nine size categories, and signature **Stances**. Its content
is its OWN — ancestries (Dwarf, Elf, Gnome, Halfling, Human, Leshonki, Migoi, Naga, Ogre, Sprite, each with
stat mods + traits), a large class list, its own skill list, and 18 conditions.

We store **mechanical facts/numbers only** (paraphrased summaries, cite the site), consistent with how the
5e/PF2 catalog entries are stored — never verbatim descriptive prose.

## Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Add the system to the catalog + grounding + validation.** ✅ Registered `intuitive-games` in
  `GAME_SYSTEMS` and added its full `SYSTEM_RULES` entry — core facts (d20, **levels 1–10**, degrees of
  success incl. tie→partial→min damage, 3-action economy + Multiple Strike Penalty, **level-as-proficiency**,
  ability boosts starting at 10 with creation cap 14, **Fortitude/Reflex/Will** saves, HP = class 10 +
  background, movement/rest/damage-type facts) plus content (9 detailed classes + the full 18-name class list,
  10 ancestries + per-ancestry mechanical notes, 36 skills → abilities, 18 conditions, sample traits/feats) —
  all stored as **mechanical facts / my own concise summaries, attributed to intuitivegames.net** (no
  verbatim prose). Extended `SystemContent` with optional `classNames` (complete name list where some classes
  are name-only) and `ancestryNotes`, threaded through `systemRulesBlock`, the new `systemClassNames`
  accessor (used by the validator's class-recognition so a real Intuitive Games class like "Freebooter" isn't
  flagged), and `systemRulesEntries` (emits name-only classes + per-ancestry note entries). The system now
  appears automatically in the new-character picker and the transposition switcher (both iterate
  `GAME_SYSTEMS`). Verified: `tsc` clean, lint clean, `__tests__/dnd/system-intuitive-games.test.ts` (4 tests)
  + updated `system-grounding-e2e.test.ts`; the existing content/rules/entries invariants still hold for it;
  full dnd suite (266) green.
- **Slice 2 — QA + docs.** Full dnd vitest suite green, tsc + lint clean, then move this doc to `completed/`.

## Considerations
- **No cross-contamination:** the same per-system scoping already used for 5e/PF2 applies — grounding and
  validation are keyed strictly to `intuitive-games`.
- **Facts, not prose:** store concise mechanical summaries + attribute to intuitivegames.net.
- **Extensible:** this exercises the "adding a system = one `GAME_SYSTEMS` row + one catalog entry" path.

### Status: IN PROGRESS (Slices 0–1 shipped; 2 (QA) pending)
