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
- [x] **B3-AI — in-builder "Ask AI" for 5e (DONE 2026-07-23).** Owner: the manual builder is primary, but a
  player should be able to ask AI to build/tweak mid-build (parity with PF2/IG). Added an "✨ Ask AI" box to
  `Dnd5eManualBuilder` (both layouts) that posts a natural-language `{instruction}` to the shared `ai-edit`
  route + refreshes; wired `aiConfigured` from the wizard page. Verified it renders in the 5e wizard. The
  dropdowns stay the primary manual path; AI editing also remains available from the sheet afterward.
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
  building. 4 tests. **B8 COMPLETE (2026-07-23):** added the interactive `pf2PlanLevelUp({className, to,
  recorded, from})` + `pf2RecordChoice` — the PF2 mirror of 5e's `planLevelUp`/`recordChoice`. It returns the
  `outstanding` choices owed at levels 1..to: one FEAT prompt per track that grants a slot that level (tested
  `pf2FeatLevelsFor`), the class's SUBCLASS moment (Instinct/Bloodline/Doctrine… from the class's own
  `subclassName`/`subclassLevels`), and the universal 4-attribute BOOSTS at 5/10/15/20. **Honest omissions
  held** (per this module's existing caveats + `PF2_CLASS_PROGRESSION_GAPS`): per-class SKILL-INCREASE
  schedules and concrete subclass OPTIONS are NOT surfaced (the subclass prompt names the moment; the picker
  supplies the legal list) — no invented rules. 6 tests (`pf2-plan-levelup.test.ts`).
- [x] **B9 — PF2 per-level choice persistence (DONE 2026-07-23).** New `/pf2-levels` route (GET plan / POST
  record+commit), the PF2 mirror of `/levels`: GET `?to=N` returns `pf2PlanLevelUp`; POST records one choice
  (coerced/validated, `pf2RecordChoice`) into `data.pf2Build.choices` (additive field on `PF2Build`) and/or
  commits a level — but ONLY when the plan is `ready` (409 otherwise), the same "level moves only through a
  fully-resolved plan" invariant 5e enforces. PF2-only, behind `requireCharacterWrite`. 6 tests
  (`pf2-levels-route.test.ts`). **Remaining PF2 wizard: B10 (walk these prompts in the GuidedBuilder UI) +
  B11 (Playwright QA).**
- [x] **B10 — PF2 per-level walk UI (DONE 2026-07-23).** New `PF2LevelBuilder` client component walks the
  tested `/pf2-levels` plan IN ORDER (subclass → feat slots → attribute boosts), refusing to advance the
  level past an outstanding choice — the same invariant the 5e builder enforces. Each prompt reads only
  verified data: the class's own `subclassOptions`, the feat catalog filtered to the slot's track + level
  (class feats scoped to the class), and the four universal boosts. Records/commits both go through the
  route, so the server stays the source of truth. The **levels page now dispatches by system** — PF2 →
  `PF2LevelBuilder`, everything else → the 5e `LevelBuilder` (PF2 characters previously got the 5e builder,
  which fetches the 5e-only `/levels` and can't work for them). 6 tests (`pf2-level-builder.test.ts`).
  **Feat projection DONE (2026-07-23):** `pf2ProjectLevelUpFeats` — committing a level now projects the
  EARNED feat choices (level ≤ current) into the pf2e sidecar's `feats` so they actually show on the sheet.
  Idempotent (stable `lvl-<level>-<track>` ids → re-projecting replaces, never duplicates), leaves base-build
  feats untouched, resolves catalog traits/body, flags a not-in-catalog pick `customized` (DM review + ✎),
  and removes a feat that a level-down no longer earns. The route also keeps `pf2e.identity.level` in step
  with `meta.level`. 7 projector tests + route test. **Boost projection DEFERRED (one-line rationale):** PF2's
  partial-boost rule (a boost to a +4-or-higher attribute needs two boosts to raise it) needs half-step state
  the flat `PF2Attributes` modifier map doesn't carry — a naive +1 would over-boost — so boosts stay
  recorded-and-visible-in-the-plan until the model can track partial boosts. Cost of that model change
  clearly exceeds the value of auto-applying 4 boosts a player can set on the sheet directly.
- [~] **B11 — PF2 wizard QA (browser-verified 2026-07-23).** Drove the running dev server against a live
  level-9 Wizard (Orin Sallowmere): the levels page dispatches to `PF2LevelBuilder`, which renders correctly,
  fetches `GET /pf2-levels?to=9` → 200, and surfaces the RIGHT first choice — the Wizard's **Arcane Thesis**
  (its real subclass moment) with the real Remaster thesis options (Improved Familiar Attunement, Spell
  Blending, Spell Substitution, Metamagical Experimentation, Experimental Spellshaping), plus "15 choices left
  before level 9" and a 9→20 target selector. No component console errors (only a benign extension-injected
  `fdprocessedid` hydration warning on an unrelated header button). **Not exercised in-browser** (deliberate):
  recording each choice + committing, to avoid mutating the seed character via flaky native-select
  automation — those write + feat-projection paths are covered by the 13 unit tests (`pf2-plan-levelup`,
  `pf2-levels-route`, `pf2-project-feats`). A full manual L1→20 caster+martial walk remains a nice-to-have but
  the critical path is proven live.

### IG (author data first — biggest lift)
- [x] **B15a — IG Foundations walk step-by-step in the wizard (DONE 2026-07-23).** `IGCharacterBuilder` gained
  the same `layout='steps'` mode as 5e/PF2: Identity & class → Role & defense → Ability scores → Stances &
  powers → Feats/weapons/companion & finish, one at a time, with per-step help, a progress bar, and Prev/Next
  — reusing all state, `IgBoostAllocator`, the eligibility-greying chips, and the `/ig-build` POST. Panel mode
  (sheet) unchanged; AI-build block stays at the top. Verified in the SSR HTML. **Note:** this is presentation
  only and needed NO progression data — B12 (the level-by-level walk) still needs the owner's schedule.
- [ ] **B12 — author `IG_CLASS_PROGRESSIONS`** (per-level, per-subclass) — ⛔ STILL BLOCKED. Confirmed against
  the live IG data: `IG_PROGRESSION_NOTE` says levels 2–10 add "traits, powers, feats, and ability boosts on
  a FIXED SCHEDULE" but the site never enumerates that schedule, and the IG Ground Rules forbid inventing it.
  So the full per-level table needs the owner. (What IS published — the milestone levels — is now surfaced;
  see B13.)
- [~] **B13 — IG milestones engine (FIRST SLICE DONE 2026-07-23).** `lib/dnd/systems/intuitive-games/
  levelup.ts` `igLevelMilestones(subclass, toLevel)` returns the DOCUMENTED IG milestones through a level —
  specialization at 4 (with the subclass's real catalogued options from `IG_CLASS_DETAILS`), unique power at
  6, greater specialization at 8, capstone + manifestation at 10 — reading only published data and faking no
  options for the moments the site doesn't enumerate. **Wired** (not an orphan) into `IGCharacterBuilder` as a
  read-only "Milestones through level N" preview in both the panel and stepped layouts, so a player sees their
  real milestone path + can see their specialization choices. 8 tests (`ig-level-milestones.test.ts`, incl.
  the wiring assertion). **Remaining B13:** the INTERACTIVE `igPlanLevelUp` (outstanding→resolve) — but it
  needs B12's full schedule to be more than the four milestones, so it waits on the owner with B12.
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
- [x] **MC-5e-3 — multiclass entry prerequisites (DONE 2026-07-23).** The PHB ability-score gate:
  `multiclassPrereqFor(classKey)` (13 in the listed ability; `'all'` needs every one, `'any'` is the Fighter's
  STR-or-DEX) + `meetsMulticlassPrereq(classKey, abilities)`. Unknown/homebrew classes are unrestricted (the
  custom escape hatch); system-prefixed keys tolerated. 5 tests. The level manager (MC-5e-4) gates entering a
  new class on this.
- [x] **MC-5e-4 — the level manager UI + save route (DONE 2026-07-23).** `MulticlassManager` — a D&D-Beyond-
  style panel with −/+ level steppers per class, an "add a class" picker annotated with each class's multiclass
  ability prereq, and a LIVE aggregated summary (total level, proficiency, HP, combined spell slots, pact)
  straight from `multiclassSnapshot`. Saves `data.meta.classes` via a new owner-gated, 5e-only,
  total-capped-at-20 `/classes` route. Mounted on the `/levels` page above the per-level walker. Verified: the
  panel renders on `/levels`, and the route round-trips live (POST Rogue 3 / Wizard 1 → persisted
  `meta.classes`, total 4). 3 wiring tests + the engine tests underneath. **Next: MC-5e-5** — make the SHEET
  read `meta.classes` (via `multiclassSnapshot`) so a multiclass character's slots/features/HP actually render.
- [~] **MC-5e-5 — sheet renders the multiclass (IN PROGRESS — resolver foundation done 2026-07-23).** Built
  the ONE multiclass-aware resolver every sheet path will route through: `lib/dnd/classes/multiclass-resolve.ts`
  — `characterMulticlass(system, single, multi)` → `{ classes, snapshot }` (+ `classLookupFor`), living above
  engine + registry so it owns the lookup without a cycle. Already wired into the level manager (its preview
  now uses the exact resolver the sheet will), so the two can never disagree. **First sheet consumer routed
  (2026-07-23):** `classDisplayFor(system, meta)` shows the multiclass split ("Fighter 3 / Wizard 2") on the
  Codex identity column when a character holds 2+ classes, single-class unchanged — a safe, display-only step.
  4 resolver tests. **Play + classic-header display routed too (2026-07-23):** `PlayLayout` subtitle and the
  Play `Hero` now show the split (Hero still lets an identity EFFECT override the class; the split subsumes the
  subclass line when multiclass). So the multiclass split shows on **Codex + Play**. **Remaining:** the
  STAT-computing consumers (App.tsx main resolution, FeatPicker, SpellPicker) — the spread-out, high-risk
  part, one at a time with render tests. **Classic/dashboard footer routed too (2026-07-23):** the App
  overview footer shows the split for multiclass (subsuming the total level + single subclass) and keeps
  species+class+level for single-class. **So the split now shows on all four template headers** (Classic +
  Codex via Hero, Codex identity via IdentityColumn, Play via PlayLayout, classic footer via App). Anti-drift
  pinned in `multiclass-display-consumers.test.ts`. DISPLAY layer of MC-5e-5 is complete.

  **STAT layer resolved (2026-07-23).** Investigated what the sheet actually RECOMPUTES vs stores: the derive
  engine keys proficiency / save-DC / skills / initiative off `meta.level` — which the `/classes` route keeps
  = the TOTAL level — so those are already multiclass-correct with no change. Spell slots are STORED (not
  auto-derived from class+level for single-class either), so the only genuine gap was the flagship synergy:
  the level manager PREVIEWED the PHB combined caster-level table ("(multiclass table)") but saving didn't
  apply it. Closed it — the `/classes` route now writes the rules-correct multiclass slots into an existing
  spellcasting block via `applyMulticlassSlots`, preserving spent pips (old `current` clamped to new max, new
  ranks start full; pact/warlock slots left separate; a non-caster split untouched; no spellcasting block
  invented for a caster-dip since the sheet models a single casting ability). Pinned in
  `multiclass-slots-apply.test.ts` (incl. end-to-end Cleric 3 / Wizard 2 → CL5 table). **MC-5e-5 done.**
  Original assessment: Make the 5e sheet resolve
  `meta.classes` through `multiclassSnapshot` so a multiclass character's features / HP / proficiency / spell
  slots actually render. **Assessed 2026-07-23:** the class is resolved in MANY sheet components (App.tsx,
  codex/IdentityColumn, codex/PlayLayout, Hero, FeatPicker, SpellPicker) — there is NO single integration
  point, so this is a spread-out change where a mistake mis-renders every 5e sheet. It must be done as a
  deliberate, thoroughly-tested refactor (ideally routing every consumer through one multiclass-aware
  resolver first), NOT a quick slice. The engine it needs (`multiclassSnapshot`, spell-slot rule) is built +
  proven, and the manager already shows the aggregated result live, so the character data is correct — this
  is purely the render-path integration.
- [~] **MC-5e-6 — QA (browser-verified 2026-07-23).** Drove the running dev server against a live 5e
  character (Perrin Underbough, Rogue 4): `/levels` renders the `MulticlassManager` with the −/+ per-class
  stepper, the live snapshot ("Total level 4 · Proficiency +2 · HP (before CON) 23"), SAVE CLASS SPLIT, and —
  the correctness proof — the ADD-A-CLASS picker is fully **prereq-annotated against the character's real
  ability scores**: "Barbarian — needs STR 13 (not met)", "Fighter — needs STR or DEX 13" (met), "Wizard —
  needs INT 13 (not met)", etc., so an illegal multiclass is visible before it's taken. The 5e `LevelBuilder`
  renders below it (Rogue · Thief, Build to Level 5, expertise-skill walk). No mutations made (read-only QA);
  the write round-trip (POST → persisted `meta.classes`) is unit-covered. A full 2-class/3-class L1→20 build
  in both editions remains a nice-to-have; the manager + prereq engine + snapshot are proven live.
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
