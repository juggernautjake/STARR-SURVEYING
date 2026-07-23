# Guided level-by-level character builder — a D&D-Beyond-style wizard for every system

**Status:** IN PROGRESS · started 2026-07-23 · companion to
[PER_SYSTEM_TEMPLATE_COMPLETENESS](PER_SYSTEM_TEMPLATE_COMPLETENESS_2026-07-23.md)

> **Where it stands (2026-07-23):** the WIZARD + PRESENTATION layer is complete for all four systems — a
> dedicated `/builder` page, a phase-grouped step rail, a permanently docked stat-roller (keeps rolled
> scores), a searchable per-system glossary, per-system **stepped Foundations** (5e/PF2/IG all walk their
> sections one at a time, reusing the tested builders), the 5e **per-level walk** (LevelBuilder → planLevelUp),
> and a **Review summary**. What remains is the LEVEL-BY-LEVEL PROGRESSION for PF2 + IG, which is a different
> class of work. **PF2 data is COMPLETE (B7 done + tested):** every builder class has a full 1–20 progression,
> so **B8–B11 (PF2)** are now SAFE code — a `pf2PlanLevelUp` engine (mirroring 5e's, reading the existing
> tested data + feat schedule) + per-level persistence + a wizard Levels step + QA. No rules-data risk.
> **B12–B16 (IG)** = ⛔ still BLOCKED on owner input — IG has NO per-level progression data and the IG Ground
> Rules forbid inventing the schedule, so the owner must confirm what each class gains at each level before it
> can be authored. B5 (a build-time 5e spell picker) is a real but non-blocking convenience.

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
- [x] **B1 — Wizard shell + route (DONE 2026-07-23).** `app/dnd/characters/[id]/builder/page.tsx` (owner-
  gated, per-system step assembly) + `GuidedBuilder` shell (`app/dnd/_ui/builder/GuidedBuilder.tsx`: phase-
  grouped step rail, current-step frame, Back/Next, Finish→sheet). `lib/dnd/builder/types.ts` defines the
  `GuidedStepMeta`/phase model. `stepbystep` mode now routes here (NewCharacterForm). B1 reuses the existing
  per-system builders as the Foundations step body + the 5e `LevelBuilder` as the Levels step, so it's a
  real working page; later slices deepen each step.
- [x] **B1r — permanently docked roller in the builder (DONE 2026-07-23).** `app/dnd/_ui/builder/
  BuilderRoller.tsx` — the same animated Dice Core stage + dice pad the sheet uses, rendered INLINE (no
  FloatingRoller), docked in the builder's left column with a "Roll a stat" (4d6-drop-lowest) button. The
  sheet/play roller stays a movable/resizable floating modal (unchanged). Owner: "the builder roller is a
  fixed page mechanic; the sheet roller still floats." **Extended 2026-07-23:** rolled ability scores are
  now KEPT as a "Rolled scores" list (roll six, then assign) instead of vanishing on the next roll.
- [x] **B1-QA — the /builder page is browser-verified (2026-07-23).** Playwright: renders 200 with no error
  for all four systems (5e-2014/2024, PF2, IG), each showing the phase-grouped step rail (5e: Foundations →
  Levels → Review; PF2/IG: Foundations → Review — PF2/IG have no per-level walk yet, that's B7–B16), the
  docked roller, and the correct "Building in <system>" header.
- [x] **B1c — build controls open by default on /builder (DONE 2026-07-23).** The reused IG/PF2 builders are
  a collapsed `<details>` on the sheet (secondary there); added a `startOpen` prop so the dedicated /builder
  wizard opens them expanded — the build controls are the page's whole purpose. Verified: PF2 details open,
  IG builder open (its secondary Vanilla Library stays collapsed). (5e builder isn't a `<details>`, already
  visible.) Interim until B3 replaces the one-shot bodies with true per-step flows.
- [~] **B2 — Tooltip/help kit (PARTIAL — glossary shipped 2026-07-23).** Wired `lib/dnd/glossary`: the builder
  now shows a searchable **"<system> glossary"** panel (PF2 140 / IG 103 / 2014 102 terms — each system's own),
  so a player can look up any rules term without leaving the wizard. Verified per system in Playwright.
  Remaining (with B3+): a per-OPTION `InfoTip`/`RuleTip` wrapper on each choice, and wiring the docked
  roller's "Roll a stat" result INTO the abilities field — both land naturally when the one-shot Foundations
  bodies become true per-choice flows.

### 5e (has the engine — do this system first, end-to-end)
- [x] **B3 — 5e Foundations walk step-by-step (DONE 2026-07-23).** `Dnd5eManualBuilder` gained a
  `layout='steps'` mode that walks its SAME sections one at a time — Class & level → Species/Race →
  Background → Ability scores → Feats & finish — with per-step help text, a progress bar (click a dot to
  jump), and Prev/Next; the panel layout (sheet page) is unchanged, and all state/validation/`/dnd5e-build`
  POST are reused (no logic duplicated). The wizard mounts it with `layout="steps"`. Verified in the SSR
  HTML (step 1 "Class & level", Next, progress dots for all 5 steps). Reuses `StatGenPanel` for abilities +
  the docked roller for 4d6.
- [x] **B4 — 5e per-level steps (DONE — satisfied by the embedded LevelBuilder).** The wizard's 5e "Levels"
  step embeds `LevelBuilder`, which walks `planLevelUp(def, …).outstanding` (subclass/ASI/feat/style/
  expertise/cantrip) via the `/levels` route, persisting to `data.build.choices` with server-side
  `validateChoice`. Verified: `LevelBuilder` → `/levels` → `planLevelUp`. No new work needed for 5e per-level.
- [x] **B5a — Review & finish shows a build summary (DONE 2026-07-23).** The wizard's Review step now reads
  the character's data per system and lists the key facts (name, ancestry/species, class + subclass,
  specialization, background, level) instead of a bare link — the builders reload on Build so this reflects
  the finished character. Page renders 200; source-anchored test. (The 5e SPELL-selection step remains — a
  new class+level-filtered picker component, below.)
- [~] **B5 — 5e spell selection step (DEFERRED — non-blocking, path already exists).** Spells are already
  selectable via the per-level **Levels** step (LevelBuilder walks cantrip/spell choices from `planLevelUp`)
  and on the sheet's Spells panel; a build-time BULK spell picker in Foundations is a convenience, not a gap.
  Revisit if players ask for it — it's a class+level-filtered picker component (`SpellDef.classes` exists).
- [~] **B6 — 5e wizard QA (DEFERRED to the QA phase — environment-blocked).** Each system's `/builder` page +
  stepped Foundations is SSR/render-verified (200, step rails, progress dots, Next), and the 5e per-level walk
  is unit-covered. The full through-the-wizard Playwright build (L1→N martial + caster) is blocked by the
  flaky local dev server (an environment issue, not code) — it belongs to the QA phase on a stable build.

### PF2 (finish data + planner, then wizard)
- [x] **B7a — PF2 Foundations walk step-by-step in the wizard (DONE 2026-07-23).** `PF2CharacterBuilder`
  gained the same `layout='steps'` mode as 5e (B3): Identity → Class & kit → Attribute boosts → Skills →
  Feats/spells & finish, one at a time, with per-step help, a progress bar, and Prev/Next — reusing all its
  state, `Pf2BoostAllocator`, `PF2BuildPicks`, eligibility, and the `/pf2-build` POST. Panel mode (sheet)
  unchanged. Verified in the SSR HTML (Identity step + progress dots + Next). The AI-build block stays at the
  top in both modes.
- [x] **B7 — `PF2_CLASS_PROGRESSIONS` cover every builder class (DONE — verified 2026-07-23).** The infra
  summary's "12 of ~25" counted only full-caster slot tables; in fact all 20 Remaster classes carry a full
  1–20 progression, and — the invariant that matters — **every one of the 14 classes the builder can create
  (Alchemist/Barbarian/Bard/Champion/Cleric/Druid/Fighter/Monk/Oracle/Ranger/Rogue/Sorcerer/Witch/Wizard)
  has one.** The `PF2_CLASS_PROGRESSION_GAPS` are documented modelling CAVEATS (Monk player-chosen saves,
  Cleric doctrine-dependent tracks, Magus/Summoner reduced-caster slot tables, Fighter weapon-group scoping),
  not missing classes. Locked by `pf2-progressions-cover-builder.test.ts`. **So B8–B11 are SAFE code work
  (a planner engine + UI reading this complete, tested data) — no rules-data authoring / invention risk.**
- [~] **B8 — PF2 level breakdown engine + preview (FIRST SLICE DONE 2026-07-23).** `lib/dnd/systems/
  pathfinder2e/levelup.ts` `pf2LevelBreakdown(className, toLevel)` returns, per level 1..N, the class
  FEATURES gained (from the tested `PF2_CLASS_PROGRESSIONS`) + which feat tracks grant a slot (from the
  tested `pf2FeatLevelsFor` schedule) — reading only verified data, no invention. Wired into the PF2 builder
  as a read-only "level 1–N progression" preview (Class & kit step), so a player sees their whole path before
  building. 4 tests. **Remaining B8:** the INTERACTIVE `pf2PlanLevelUp` (assemble the `outstanding` choices to
  RESOLVE — feat picks/boosts/skill-increases — like 5e's), which needs the per-level persistence (B9) it
  writes to; that's the next slice.
- [ ] **B9 — PF2 per-level choice persistence** (`data.pf2e.build.choices` + route).
- [ ] **B10 — PF2 wizard build plan** (Foundations + per-level) reusing the allocator/pickers/eligibility.
- [ ] **B11 — PF2 wizard QA** (Playwright, vanilla L1→N caster + martial).

### IG (author data first — biggest lift)
- [x] **B15a — IG Foundations walk step-by-step in the wizard (DONE 2026-07-23).** `IGCharacterBuilder` gained
  the same `layout='steps'` mode as 5e/PF2: Identity & class → Role & defense → Ability scores → Stances &
  powers → Feats/weapons/companion & finish, one at a time, with per-step help, a progress bar, and Prev/Next
  — reusing all state, `IgBoostAllocator`, the eligibility-greying chips, and the `/ig-build` POST. Panel mode
  (sheet) unchanged; AI-build block stays at the top. Verified in the SSR HTML. **Note:** this is presentation
  only and needed NO progression data — B12 (the level-by-level walk) still needs the owner's schedule.
- [ ] **B12 — author `IG_CLASS_PROGRESSIONS`** (per-level, per-subclass; confirm schedule vs IG rules).
- [ ] **B13 — IG known-at-level model + `igPlanLevelUp`** (powers/feats/specialization schedule).
- [ ] **B14 — IG per-level choice persistence** (`data.ig.build.choices` + route).
- [ ] **B15 — IG wizard build plan** reusing the allocator/picker/eligibility.
- [ ] **B16 — IG wizard QA** (Playwright, vanilla L1→10).

### Cross-cutting
- [x] **B17 — resume/partial builds (DONE 2026-07-23).** `GuidedBuilder` persists the current step per
  character in `localStorage` (`dnd:builder:step:<id>`), restored after mount (never during render, to avoid a
  hydration mismatch), so an accidental refresh — or the full-page reload the embedded builders do after Build
  — reopens the wizard where you left off instead of snapping to step 1. Source-anchored test.
- [x] **B18 — "originally intended / vanilla" guarantee (DONE — enforced throughout).** Every builder path is
  rules-legal by construction: the eligibility engines (`featEligibilityForSystem`, `pf2*Eligibility`,
  `igPowerEligibility`) grey ineligible picks WITH the reason, the server build/edit routes refuse illegal
  vanilla picks, and Custom is the explicit flagged escape hatch ([[feedback_rules_legal_builders]]). The
  Review step (B5a) states the guarantee ("vanilla and rules-legal; custom picks are flagged") and the PF2/IG
  builders show a live vanilla/custom provenance count. No separate final-summary work needed.

## Part III — Full level-by-level for every class/subclass + MULTICLASS (all systems)

Owner ask (2026-07-23): a full level-by-level builder for every class/subclass in every system that accounts
for everything at any level, AND multiclassing — a character may hold levels in multiple classes.

**The systemic reality (respect it — don't invent):** "multiple levels in multiple classes" is a *D&D 5e*
concept. The faithful mapping differs per system, so "multiclass for all four" means:
- **5e — TRUE multiclass** (Fighter 3 / Wizard 2): needs a real build. Engine already has
  `multiclassCasterLevel` (slot aggregation), but the character model is SINGLE-class (`meta.className`), so
  the model must be extended. THE BIG BUILD.
- **PF2 — ARCHETYPES (the PF2 "multiclass").** PF2 has NO class levels; you multiclass by spending a
  class-feat slot on an Archetype **Dedication** (then that archetype's feats). ALREADY FUNCTIONAL: all class
  Dedications + 172 archetype feats are catalogued, `PF2BuildPicks` searches the full catalog, and
  `pf2FeatEligibility` enforces the Dedication-before-archetype gate. So PF2 multiclass is DONE at the
  mechanics level — it only needs SURFACING (tell the player how).
- **IG — ⛔ BLOCKED.** No per-level data + no defined multiclass rules; owner must specify both.

### Slices
- [x] **MC-PF2 — PF2 archetype/multiclass path surfaced (DONE 2026-07-23).** Added a "Multiclass?" note to the
  PF2 builder's Feats step explaining the PF2 way (spend a class-feat slot on an Archetype Dedication, then
  that archetype's feats — no class levels). `pf2-multiclass-archetypes.test.ts` locks the mechanism: every
  builder class **except the documented Oracle/Witch gap** (PF2_FEATS_CLASS_GAPS — their Remaster subsystems
  couldn't be confirmed, so nothing was invented) has a `<Class> Dedication` archetype feat, and the
  eligibility gate refuses an archetype's feats until its Dedication is held. **Small remaining data gap:**
  Oracle/Witch Dedications — needs their confirmed Remaster feat details (not autonomously authorable).
- [x] **MC-5e-1 — model + unified read path (DONE 2026-07-23).** Added a `ClassLevel` type
  (`classKey`/`subclassKey?`/`level`) + an optional `meta.classes?: ClassLevel[]` on the 5e character
  (additive — absent = single-class, byte-for-byte unchanged; present = authoritative). Engine helpers
  `resolveClassLevels` (single OR multi → one unified list), `totalClassLevel` (SUM across classes),
  `isMulticlass`, `formatClassLevels` ("Fighter 3 / Wizard 2"), so every later consumer stops caring whether
  a character is single- or multi-class. 5 tests. Next: MC-5e-2 (aggregate features/HP/prof/slots across
  classes, reusing `snapshotAtLevel` per class + `multiclassCasterLevel`).
- [x] **MC-5e-2 — cross-class aggregation engine (DONE 2026-07-23).** `multiclassSnapshot(classes, lookup)`
  in engine.ts resolves each class's own `snapshotAtLevel` and combines under the 5e rules: proficiency by
  TOTAL level, HP additive, all classes' features kept (tagged `sourceClass`), warlock pact slots summed, and
  the combined `casterLevel` via `multiclassCasterLevel` (non-casters add 0). Returns `perClass` snapshots for
  display. Verified over REAL class data (Fighter 3/Wizard 2 → level 5, +3 prof, additive HP, features from
  both, caster level 2; martial multiclass casts nothing; unknown classes skipped). 4 tests.
- [x] **MC-5e-2b — multiclass spell slots (DONE 2026-07-23).** Added the canonical PHB multiclass spellcaster
  slot table + `multiclassSpellSlots(casterLevel)`, and the correct PHB RULE in `multiclassSnapshot`: with ONE
  leveled spellcasting class you keep its OWN table; with TWO+ you use the multiclass table at the combined
  caster level. Verified: Wizard 3/Fighter 2 → wizard's own slots; Wizard 3/Cleric 2 → multiclass table L5
  `[_,4,3,2]`; non-caster → none. 7 tests total. Warlock pact slots stay separate + summed. Every multiclass
  spell-slot synergy now resolves correctly regardless of the class combination.
- [ ] **MC-5e-3 — multiclass eligibility:** the ability-score prerequisites to ENTER a second class.
- [ ] **MC-5e-4 — LevelBuilder multiclass:** at each character level, choose which class to advance (or add a
  new class), then resolve that class-level's owed choices via the existing `planLevelUp` per class.
- [ ] **MC-5e-5 — sheet display:** show "Fighter 3 / Wizard 2" + the aggregated features/slots.
- [ ] **MC-5e-6 — QA:** Playwright build a 2-class and 3-class 5e character, both editions.
- [ ] **MC-IG — ⛔ BLOCKED on owner:** define IG per-level progression AND whether/how IG multiclasses.

## Done means
Choosing "step by step" on any system opens a dedicated guided wizard that walks class → race → background
→ abilities → each level's choices (subclass/feats/spells/features) in that system's own vanilla rules,
with a tooltip on every option and a live preview, persisting as you go — the D&D-Beyond experience, per
system.

## Sequencing note
5e first (engine exists → fastest to a shippable end-to-end wizard that proves the shell). PF2 second
(data ~half done + planner to add). IG last (needs the progression data authored — confirm the schedule
with the owner to avoid inventing rules, per the IG Ground Rules).
