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
- **Slice 1 — Add the system to the catalog + grounding + validation.** Register `intuitive-games` in
  `GAME_SYSTEMS`; add its full `SYSTEM_RULES` entry (core facts + content: classes, ancestries + ancestry
  stat/trait notes, skills, conditions, feats/traits). Extend `SystemContent` with optional `classNames`
  (complete class-name list where some classes lack full mechanical detail) and `ancestryNotes` (per-ancestry
  mechanical one-liners), and thread them through `systemRulesBlock`, the validator's class-recognition, and
  `systemRulesEntries`. Tests: the new system grounds with its own facts (levels 1–10, degrees of success,
  three saves), never another system's; validation accepts an Intuitive Games ancestry/class and flags a
  5e/PF2 one; the existing content invariants still hold for it.
- **Slice 2 — QA + docs.** Full dnd vitest suite green, tsc + lint clean, then move this doc to `completed/`.

## Considerations
- **No cross-contamination:** the same per-system scoping already used for 5e/PF2 applies — grounding and
  validation are keyed strictly to `intuitive-games`.
- **Facts, not prose:** store concise mechanical summaries + attribute to intuitivegames.net.
- **Extensible:** this exercises the "adding a system = one `GAME_SYSTEMS` row + one catalog entry" path.

### Status: IN PROGRESS (Slice 0 shipped; 1–2 pending)
