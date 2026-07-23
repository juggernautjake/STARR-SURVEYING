# Guided level-by-level character builder — a D&D-Beyond-style wizard for every system

**Status:** IN PROGRESS · started 2026-07-23 · companion to
[PER_SYSTEM_TEMPLATE_COMPLETENESS](PER_SYSTEM_TEMPLATE_COMPLETENESS_2026-07-23.md)

## Owner ask (verbatim intent)

> When building a character step by step (fully manual), we should be taken to a dedicated "build from the
> system" page that walks through EVERY aspect of the character, level by level — picking class, race,
> background, ability scores, subclass, feats, spells, abilities, everything — in the most vanilla,
> originally-intended way for that system. Break the build down by level; determine what feats/spells/
> abilities become available for each class at each level in each system. Make it intuitive and easy to
> follow, like the D&D Beyond or Roll20 builder. Dedicated page, a series of guided sections, with ample
> tooltip info blurbs and explanations. Plan it in depth for each system.

## What exists today (verified — see the infra map)

- **Creation flow:** `app/dnd/characters/new` → `NewCharacterForm` → `POST /api/dnd/characters/import`
  with `mode ∈ {questioning, ruthless, stepbystep}` (`lib/dnd/build-modes.ts`). Today `stepbystep` just
  opens the **sheet** with a one-shot dropdown builder — there is **no dedicated wizard route**.
- **Per-system one-shot builders** (`app/dnd/_ui/`): `Dnd5eManualBuilder`, `PF2CharacterBuilder`,
  `IGCharacterBuilder` — panels of dropdowns + a Build button that assembles a character AT a target
  level in one shot (not a guided per-level walk). Each has a pure, tested assembler + statgen allocator.
- **5e per-level engine (COMPLETE):** `lib/dnd/classes/{types,engine,levelup,registry}.ts`.
  `ClassDefinition.features[]` carry `{level, name, body, choice?}` where `choice ∈
  asi|subclass|fighting-style|expertise|cantrip|epic-boon|other` — a real "choice at level N" primitive.
  `planLevelUp()` returns `outstanding[]` (owed choices 1..N), `gained[]`, `ready`; `validateChoice`
  enforces legality server-side. `LevelBuilder.tsx` + `/levels` route is a working (utilitarian) 5e
  choice-queue walker. All 13 (2014) + 12 (2024) classes authored 1–20 with subclasses. `data.build.
  choices[]` persists per-level decisions.
- **5e spells:** `SpellDef{level 0–9, classes[]}` — class + level filterable, both editions.
- **PF2 (PARTIAL):** `data/classes.ts` `PF2_CLASS_PROGRESSIONS` = full 1–20 for **~12 of ~25** classes
  (`PF2_CLASS_PROGRESSION_GAPS` lists the rest; reduced casters `slotTableModelled:false`). Per-track
  feat schedule/budget (`eligibility.ts` `pf2FeatLevelsFor`/`pf2FeatBudget`). Spells filter by tradition
  + rank (`data/spells-*.ts`, `pf2SpellEligibility`). **No `planLevelUp`-equivalent** and no persisted
  per-level choice record on the `data.pf2e` sidecar.
- **IG (MINIMAL):** `IG_CLASS_DETAILS` is per-subclass but **not level-indexed**; progression is prose
  only (`IG_PROGRESSION_NOTE`: "specializations at 4, greater at 8, unique powers at 6, capstone at 10").
  No per-level table, no choice-per-level model, no spell/power slot model.
- **Eligibility:** 5e `feats/eligibility.ts`; PF2 `eligibility.ts` (fails closed); IG `eligibility.ts`
  (fails open). **Statgen:** all methods, all four systems, pure + tested.
- **Tooltip scaffolding:** `BuilderHelp.tsx`, `InfoTip`, `RuleTip.tsx`, `lib/dnd/glossary/*` — exist,
  not yet wired into a per-level flow.

## Target UX (all systems)

A dedicated **`/dnd/characters/[id]/builder`** wizard page (the `stepbystep` mode routes here). Layout:

- **Left rail = the build plan**: an ordered, numbered step list grouped into `Foundations` (class → race/
  ancestry → background → ability scores) then `Level 1 … Level N` (each level a group whose sub-steps are
  the choices that level grants: subclass, feats, spells, ASI/boosts, class features with choices). Each
  step shows a state chip: done ✓ / current ● / owed ! / locked. Click to jump (locked until prereqs met).
- **Center = the current step**: a titled panel with the choices (cards/chips/dropdowns), each option
  carrying an **InfoTip / RuleTip** blurb (the rules text, prerequisites, what it grants). "Vanilla only"
  by default (ineligible options greyed WITH the reason, from the eligibility engines); a Custom toggle is
  the escape hatch (flagged, per [[feedback_rules_legal_builders]]).
- **Right (or top) = the live character preview**: HP, key stats, and what this level adds — updates as
  you pick, so the build reads like D&D Beyond's running summary.
- **Footer = Back / Next (+ "owed choices remaining")**; Next is gated until the step's required choices
  are made. A final **Review & Finish** commits.
- **Persistence:** every choice writes incrementally to the per-level choice record (5e `data.build.
  choices`; PF2/IG need an equivalent) via the system's build/level API, so a half-finished build resumes.
- **Tooltips everywhere** (owner: "ample tooltip info blurps"): every class/feat/spell/feature/ability
  option hover-explains itself from the tested rules text; a persistent "?" opens a glossary definition.

## Architecture — one wizard, per-system build plans

Mirror FORMAT=shell/SYSTEM=panels: **WIZARD = shell, SYSTEM = build plan.**

- `app/dnd/_ui/builder/GuidedBuilder.tsx` — the shell: renders the step rail, the current step, the live
  preview, nav, persistence. Knows nothing system-specific.
- A system exposes a **`BuildPlan`**: `{ steps: BuildStep[] }` where a `BuildStep` is
  `{ id, group: 'Foundations' | `Level ${n}`, title, help, status(char), render(ctx), required(char) }`.
  The plan is derived from that system's progression engine, so the steps and their choices come straight
  from the rules — no duplication.
- Per system: `lib/dnd/builder/plan.<system>.ts` builds the plan from the existing engines
  (5e: `planLevelUp`/`engine`; PF2: progressions + feat budget; IG: new per-level data).
- Reuse the existing statgen allocators (`StatGenPanel`/`Pf2BoostAllocator`/`IgBoostAllocator`), pickers
  (`PF2BuildPicks`, `IGContentPicker`), and eligibility engines inside step renders — don't reinvent them.

## Per-system depth

### D&D 5e (2014 & 2024) — reuse the engine; build the wizard first
Data is COMPLETE. Steps:
1. **Foundations:** Class (cards + feature preview) → Species/Race (traits tooltips) → Background (2024:
   ability-spread assigner + origin feat; 2014: skills/tools) → Ability scores (`StatGenPanel`: standard/
   point-buy/roll) with racial increases shown.
2. **Per level 1..N:** driven by `planLevelUp().outstanding` — subclass (at `subclassLevel`), ASI-or-feat
   (at `asiLevels`, via feat eligibility), fighting-style/expertise/cantrip choices, spell selection
   (prepared/known filtered by `SpellDef.classes` + slot level from `engine` spellcasting), and a
   read-only "gained at this level" list (features, slots, proficiency). Persist to `data.build.choices`
   via `/levels` (extend it to also carry the foundation picks). `validateChoice` stays authoritative.
- **Work:** almost all UI. The engine, planner, spell filter, eligibility, and persistence already exist.

### Pathfinder 2e — finish the data, add a planner, then the wizard
1. **Complete `PF2_CLASS_PROGRESSIONS`** to all ~25 classes (close `PF2_CLASS_PROGRESSION_GAPS`; model
   reduced casters' slot tables). *(Data-authoring slices — reference the PF2 rules already in `content.ts`
   + the remaster.)*
2. **Add `pf2PlanLevelUp(char, toLevel)`** (mirror 5e `planLevelUp`): assemble the per-level owed choices
   from `pf2FeatLevelsFor`/`pf2FeatBudget` (ancestry/class/skill/general feats), attribute boosts (levels
   5/10/15/20), skill increases, proficiency increases (`increases[]`), and spell picks (tradition+rank).
   Return `outstanding[]` in the same shape the wizard shell consumes.
3. **Persist per-level choices** on `data.pf2e` (add a `build.choices[]` record) via an extended
   `/pf2-build` or a new `/pf2-level` route; keep `assemblePF2VanillaCharacter` as the projector.
4. **Wizard build plan** from steps 2–3; reuse `Pf2BoostAllocator` + `PF2BuildPicks` + `pf2*Eligibility`.

### Intuitive Games — author the progression data first (biggest lift)
1. **Author a per-level progression model** `IG_CLASS_PROGRESSIONS` (level 1..10 per subclass): what each
   level grants — traits, powers (with the tier from `spell-tiers.ts`), feats, specialization (L4) /
   greater specialization (L8), unique power (L6), capstone (L10), ability boosts, stance grants — turning
   the prose `IG_PROGRESSION_NOTE` + non-indexed `IG_CLASS_DETAILS` into a real table. *(Confirm the exact
   schedule with the IG rules / owner before authoring — Ground Rule: don't invent rules.)*
2. **A power/ability "known at level N" model** (IG has no slots; it's a known-list that grows) + a
   `igPlanLevelUp` producing per-level owed choices (powers to learn, feat picks, specialization at 4/8).
3. **Persist per-level choices** on `data.ig` (`build.choices[]`) via an extended `/ig-build` or `/ig-level`.
4. **Wizard build plan**; reuse `IgBoostAllocator` + `IGContentPicker` + `igPowerEligibility`.

## Slice roadmap (ordered, buildable)

### Foundations
- [ ] **B1 — Wizard shell + route.** `app/dnd/characters/[id]/builder/page.tsx` + `GuidedBuilder` shell
  (step rail, current-step frame, live preview, Back/Next, owed-choices gating). Route `stepbystep` mode
  here (NewCharacterForm + import route redirect). Define the `BuildPlan`/`BuildStep` interface. Ship with
  a stub plan so the shell renders end-to-end.
- [ ] **B2 — Tooltip/help kit.** Standardize an `InfoTip`/`RuleTip` wrapper the steps use for every option
  (rules text + prereqs + "what it grants"), + a glossary "?" affordance. Wire `lib/dnd/glossary`.

### 5e (has the engine — do this system first, end-to-end)
- [ ] **B3 — 5e Foundations steps** (class/species/background/abilities) reusing `StatGenPanel` + catalogs,
  persisting foundation picks.
- [ ] **B4 — 5e per-level steps** from `planLevelUp().outstanding` (subclass/ASI/feat/style/expertise/
  cantrip) with eligibility + tooltips, persisting to `data.build.choices` via `/levels`.
- [ ] **B5 — 5e spell selection step** (prepared/known filtered by class + slot level) + Review & Finish.
- [ ] **B6 — 5e wizard QA** (Playwright: build a vanilla character L1→N for a martial + a caster, both
  editions; confirm every choice is rules-legal and tooltip'd).

### PF2 (finish data + planner, then wizard)
- [ ] **B7 — complete `PF2_CLASS_PROGRESSIONS`** for the remaining classes (+ reduced-caster slot tables).
- [ ] **B8 — `pf2PlanLevelUp` engine** + per-level `outstanding` choices (feats/boosts/skills/prof/spells).
- [ ] **B9 — PF2 per-level choice persistence** (`data.pf2e.build.choices` + route).
- [ ] **B10 — PF2 wizard build plan** (Foundations + per-level) reusing the allocator/pickers/eligibility.
- [ ] **B11 — PF2 wizard QA** (Playwright, vanilla L1→N caster + martial).

### IG (author data first — biggest lift)
- [ ] **B12 — author `IG_CLASS_PROGRESSIONS`** (per-level, per-subclass; confirm schedule vs IG rules).
- [ ] **B13 — IG known-at-level model + `igPlanLevelUp`** (powers/feats/specialization schedule).
- [ ] **B14 — IG per-level choice persistence** (`data.ig.build.choices` + route).
- [ ] **B15 — IG wizard build plan** reusing the allocator/picker/eligibility.
- [ ] **B16 — IG wizard QA** (Playwright, vanilla L1→10).

### Cross-cutting
- [ ] **B17 — resume/partial builds** (a half-finished wizard reopens where it left off).
- [ ] **B18 — "originally intended / vanilla" guarantee** — every default path is rules-legal; Custom is
  the flagged escape hatch; final provenance summary before Finish.

## Done means
Choosing "step by step" on any system opens a dedicated guided wizard that walks class → race → background
→ abilities → each level's choices (subclass/feats/spells/features) in that system's own vanilla rules,
with a tooltip on every option and a live preview, persisting as you go — the D&D-Beyond experience, per
system.

## Sequencing note
5e first (engine exists → fastest to a shippable end-to-end wizard that proves the shell). PF2 second
(data ~half done + planner to add). IG last (needs the progression data authored — confirm the schedule
with the owner to avoid inventing rules, per the IG Ground Rules).
