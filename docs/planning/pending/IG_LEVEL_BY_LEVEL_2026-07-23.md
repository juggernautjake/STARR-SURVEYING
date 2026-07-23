# Intuitive Games — level-by-level builder + multiclass (owner-blocked)

**Status:** PENDING · parked 2026-07-23 · carved out of `GUIDED_CHARACTER_BUILDER_2026-07-23.md` (now in
`completed/`) because it is **blocked on owner-provided rules data**, not on engineering effort.

## Why this is parked (not in-progress)

The 5e and Pathfinder 2e level-by-level builders shipped in full (see the completed guided-builder doc). The
IG equivalent needs a **per-level progression schedule that Intuitive Games does not publish**:

> `IG_PROGRESSION_NOTE` (verified in `lib/dnd/systems/intuitive-games/content.ts`) states that levels 2–10
> add "traits, powers, feats, and ability boosts on a **fixed schedule**" — but the site never enumerates
> that schedule. The IG **Ground Rules forbid inventing a rule** ([[vanilla_rules_enforcement]]), so the
> per-level table cannot be authored without the owner supplying it.

Everything IG *does* publish has already been surfaced (see "Already shipped" below), so this is the honest
stopping point: the remaining work is impossible to do correctly without owner input.

## What unblocks it (owner input needed)

1. **The IG per-level schedule** — for each class/subclass, levels 2–10: exactly what is gained at each level
   (traits, powers with their tier, feats, ability boosts, stance grants). The milestone anchors are already
   known and surfaced (specialization L4, unique power L6, greater specialization L8, capstone + manifestation
   L10); what is missing is the per-level detail between them.
2. **IG multiclass rules** — whether an IG character may hold multiple classes and, if so, how it works (IG has
   no 5e-style class levels, so "multiclass" may map to something else entirely — the owner must define it, or
   confirm IG has no multiclass concept, in which case MC-IG is closed as N/A).

When (1) arrives, author `IG_CLASS_PROGRESSIONS` and the rest follows the proven PF2 pattern
(engine → persistence route → walk UI → QA). Move this doc to `in-progress/` when the owner provides the data.

## Already shipped (the buildable-without-owner-input parts)

- **B15a — IG Foundations walk step-by-step** in `IGCharacterBuilder` (`layout='steps'`): Identity & class →
  Role & defense → Ability scores → Stances & powers → Feats/weapons/companion & finish, reusing all state,
  `IgBoostAllocator`, eligibility greying, and the `/ig-build` POST. Presentation only — needed no schedule.
- **B13 (first slice) — `igLevelMilestones(subclass, toLevel)`** (`lib/dnd/systems/intuitive-games/levelup.ts`)
  surfaces the DOCUMENTED milestones (specialization L4 with the subclass's real catalogued options, unique
  power L6, greater specialization L8, capstone+manifestation L10), faking nothing the site doesn't enumerate.
  Wired into `IGCharacterBuilder` as a read-only "Milestones through level N" preview. 8 tests.

## Remaining (all blocked on the owner input above)

- [ ] **B12 — author `IG_CLASS_PROGRESSIONS`** (per-level, per-subclass, L1→10) — needs owner input (1).
- [ ] **B13 (interactive) — `igPlanLevelUp`** producing per-level owed choices — needs B12's schedule.
- [ ] **B14 — IG per-level choice persistence** (`data.ig.build.choices` + `/ig-level` route) — needs B12.
- [ ] **B15 — IG wizard build plan** (per-level walk) reusing the allocator/picker/eligibility — needs B12.
- [ ] **B16 — IG wizard QA** (Playwright, vanilla L1→10) — needs B15.
- [ ] **MC-IG — IG multiclass** — needs owner input (2); may close as N/A if IG has no multiclass concept.
