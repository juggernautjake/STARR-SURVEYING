# Manual, vanilla, per-system character builder (all 4 systems)

**Status:** IN PROGRESS · started 2026-07-22

## Owner ask (verbatim, stitched)

> Make character building better. Three modes:
> 1. **Auto/ruthless** — builds everything from whatever info is given, however much or little; make it super
>    refined so it produces good results for all 4 systems every time.
> 2. **Questioning** — takes the info, fills what's clear, then asks about gaps/contradictions to finish;
>    fully fleshed out and geared per system.
> 3. **Manual** — *the one I want most.* Least AI. The player manually builds each part: choose race, class,
>    level, background, etc. via **dropdown menus**. Then, depending on choices, they're taken through the
>    build. They can **manually roll dice and input scores, or use the digital dice roller**. **Each ability
>    score its own input.** Represent **all the modifiers/bonuses from race + class + background**. Stat
>    rolling **geared per system**. The user **chooses their feats and subclass and builds up to the level
>    they first picked, with the exact mechanics designed for the system per class per level.**
>
> Less "write down what you want so the AI can build it", more "select from this dropdown, roll your stats,
> choose your gear". Make the manual builder for each system **totally vanilla** in the options it provides.
> Build each one out; I'll review and probably make changes. Explore the stat-generation methods/mechanics
> for 5e-2014, 5e-2024, PF2 and IG, then build the manual builder for each and use the correct one per the
> selected system.

## What exists today (from the code map)

- The 3 "modes" (`lib/dnd/build-modes.ts`: `ruthless`/`questioning`/`stepbystep`) are **prompt variants** on ONE
  AI path (`app/api/dnd/characters/[id]/ingest/route.ts`). `stepbystep` is NOT a real manual builder — it just
  tells the AI "don't auto-fill". Entry: `NewCharacterForm.tsx` (system + mode picker) → `/ingest`.
- **PF2:** `PF2CharacterBuilder.tsx` — dropdowns for ancestry/heritage/background/class/subclass/deity/skills/
  level, but ability entry is **raw modifier number inputs** (no boost picker). Assembles via
  `pathfinder2e/builder.ts` (`pf2ApplyBoosts`/`pf2ComputeAttributes` — a real boost engine EXISTS but the UI
  doesn't drive it). Endpoint `pf2-build`.
- **IG:** `IGCharacterBuilder.tsx` — dropdowns for ancestry/class/subclass/stances/powers/feats, ability entry
  is **raw score inputs defaulting to 10** (no boost widget). `intuitive-games/builder.ts` deliberately does
  NOT apply ancestry/class/background boosts. Endpoint `ig-build`.
- **5e (2014 + 2024):** NO dedicated manual builder. Uses `LevelBuilder.tsx` (a level-up choice walker) +
  the AI import form. Ability entry is inline number fields on the sheet (`Abilities.tsx`), no gen method.
- **No stat-generation engine anywhere** — no point-buy, standard-array, 4d6-drop-lowest, or a driven boost
  allocator. PF2's boost engine is the closest, unused by UI. 5e-2024 has `backgrounds/apply.ts`
  (`reconcileBackgroundIncreases`) for background increases.
- Catalog richness: 5e races (both) RICH; 5e-2024 backgrounds/feats RICH; 5e-2014 backgrounds/feats SPARSE;
  PF2 ancestry/class/background/feats RICH (class 1–20 partial); IG backgrounds/feats RICH, ancestry SPARSE
  (names only), no IG level table.

## Stat-generation mechanics per system (the researched spec)

### D&D 5e — 2014 (`dnd5e-2014`)
- **Three generation methods:**
  - **Standard array:** `15, 14, 13, 12, 10, 8`, each assigned to one ability.
  - **Point buy:** 27 points; each score 8–15; cost `{8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9}`.
  - **Roll:** `4d6 drop lowest`, six times, assign the six results to abilities (manual entry OR the digital
    roller). A "roll in order" variant assigns down the list.
- **Then apply racial ASI** (2014 races DO grant them — `species/dnd5e-2014.ts`), e.g. +2/+1 or a subrace's
  increase; free-choice races (Half-Elf) pick. Creation cap 20.

### D&D 5e — 2024 (`dnd5e-2024`)
- **Same three methods** (array / point buy / 4d6).
- **ASIs come from the BACKGROUND, not the species:** +2 to one and +1 to another, OR +1/+1/+1, among the
  background's three listed abilities (`backgrounds/dnd5e-2024.ts` `abilityScores`); apply via
  `reconcileBackgroundIncreases`. Species grant NO ability increase. Creation cap 20.

### Pathfinder 2e (`pathfinder2e`)
- **Ability-boost system** (no roll/point-buy by default). Start every attribute at **+0** (score 10). Apply,
  in stages, sets of **boosts** (each +2, but only **+1 if the attribute is already +4/18** — the partial
  rule `pf2ApplyBoosts` already models):
  - **Ancestry:** its listed boosts + one **free**, minus one **flaw** (−2) for most ancestries (some offer a
    "two free boosts, no flaw" alternative — `PF2_ALTERNATE_BOOSTS_RULE`).
  - **Background:** 2 boosts (one from a set of two, one free).
  - **Class:** 1 boost to the **key attribute**.
  - **Free:** 4 boosts.
  - Within any ONE set, each boost must go to a **different** attribute.
- **FIX to wire:** the builder currently uses `content.ts` ancestries (no flaws); the flaw-aware data is in
  `data/ancestries.ts`. The allocator must apply flaws.

### Intuitive Games (`intuitive-games`) — bespoke
- Start all six at **10 (+0)**. Apply **8 Ability Score Boosts**, each **+2**, **creation cap 14** per ability
  (NOT point-buy, NOT PF2 partial-boosts). Contributors also grant boosts: **Background +2 boosts**, **Class
  +1 boost to its primary**, **Traits up to +2**; ancestry adjustments arrive through traits. Modifier =
  `floor((score−10)/2)`. (Source: `system-rules.ts:310,608-612`; the method is specified but NOT automated —
  `builder.ts` leaves boosts to the player today.)

## Architecture

1. **A pure, unit-tested stat-generation library** `lib/dnd/statgen/` — the foundation, browser-free:
   - `dnd5e.ts` — point-buy cost/validation, standard array, 4d6-drop-lowest (RNG-injected, deterministic in
     tests), assignment, and racial-ASI (2014) / background-increase (2024) application.
   - `pf2.ts` — a boost-allocation state machine (staged sets, distinct-per-set, partial-at-+4, flaws) →
     resolved attributes + validation, layered on the existing `pf2ApplyBoosts`.
   - `ig.ts` — the "start 10 / eight +2 / cap 14 / contributor boosts" allocator + validation.
   - Each returns a `{ scores/mods, valid, errors, remaining }` shape the UI binds to.
2. **A shared `StatGenPanel` UI** — the method picker (array / point-buy / roll / manual, or the boost
   allocator for PF2/IG), one input per ability, a **digital-roller hookup** (roll 4d6 in the roller, drop
   into a slot), a live **modifier** readout, and a **contribution breakdown** (base + racial/background/class).
3. **A guided manual builder per system** that walks: system → race/ancestry → class → subclass (at the
   system's subclass level) → level → background → ability scores (via the panel) → feats (at the system's
   feat/ASI levels) → gear, then **assembles to the chosen level with the exact per-class-per-level
   mechanics** using the existing engines (`classes/engine.ts` + `levelup.ts`; PF2 `data/classes.ts`
   progressions; IG powers/specializations), and posts to the existing `*-build` endpoints.

## Slices

### Phase 1 — the stat-generation engine (pure, tested; no browser needed)
- [x] **SG-1 — 5e generation (`statgen/dnd5e.ts`) SHIPPED 2026-07-22.** Point-buy (cost curve + 27-pt budget +
  8–15 clamp/validation), standard array (permutation validation), 4d6-drop-lowest with an INJECTED roll
  (deterministic tests + the digital roller can feed its own faces via `scoreFourDice`), the modifier helper,
  and increase-application clamped to 20. 15 unit tests. EXEMPT in no-orphan pending MB-2.
- [~] **SG-1 (orig) — 5e generation (`statgen/dnd5e.ts`).** Point-buy (cost table + 27-pt validation + per-score
  8–15 clamp), standard array (assign the six fixed values, each once), 4d6-drop-lowest (inject a
  `roll: () => number` so tests are deterministic; return the six sorted results + the dropped die), and
  assignment helpers. Racial-ASI apply (2014) reusing `species` data; background-increase apply (2024) reusing
  `backgrounds/apply.ts`. Full unit tests (cost curve, over-budget, array completeness, roll determinism).
- [x] **SG-2 — PF2 boost allocator (`statgen/pf2.ts`) SHIPPED 2026-07-22.** Staged boost sets with per-slot
  restrictions (background = one-of-two + one-free; class key fixed or a choice), `pf2ResolveAttributes` +
  `pf2ValidateAllocation` (distinct-per-set, the +4 partial via `pf2ApplyBoosts`), and — the fix — the
  ANCESTRY FLAW applied (−1 modifier), which the old builder skipped. `pf2StandardSets` assembles the four
  sets from catalog data. 10 unit tests. EXEMPT in no-orphan pending MB-3.
- [~] **SG-2 (orig) — PF2 boost allocator (`statgen/pf2.ts`).** A staged model (ancestry/background/class/free sets)
  → apply through `pf2ApplyBoosts` with the partial-at-+4 rule, enforce distinct-per-set, and APPLY ANCESTRY
  FLAWS (switch to `data/ancestries.ts`). Validation (each set filled, no dup within a set). Unit tests
  including the +4 partial and a flaw.
- [x] **SG-3 — IG boost allocator (`statgen/ig.ts`) SHIPPED 2026-07-22.** Start 10, eight +2 boosts, per-ability
  creation cap 14 (two boosts max), + ancestry adjustments applied on top; `igResolveScores` +
  `igValidateAllocation` (exactly 8 spent, cap enforced) + the modifier helper. 9 unit tests. **Phase 1 (the
  stat-gen engine) is COMPLETE.** EXEMPT in no-orphan pending MB-4.
- [~] **SG-3 (orig) — IG boost allocator (`statgen/ig.ts`).** Start 10, eight +2 boosts, per-ability creation cap 14,
  plus contributor boosts (background 2 / class 1 / traits) as pre-filled-but-editable. Validation (exactly 8
  spent, no ability over 14). Unit tests.

### Phase 2 — the manual builder UI, per system
- [ ] **MB-1 — shared `StatGenPanel`.** Method picker + one input per ability + digital-roller hookup + live
  modifier + contribution breakdown. Colour tokens so it reads on every skin. Render-tested.
- [ ] **MB-2 — the 5e manual builder (the missing one).** Dropdowns: species (+subrace/lineage) · class ·
  subclass (shown at the class's subclass level) · background · level (1–20). The StatGenPanel (array/
  point-buy/roll) + racial ASI (2014) or background spread (2024). Feat picks at the class's ASI/feat levels
  (`feats/eligibility.ts`). Assemble to the chosen level via the shared engine + `levelup.ts`, posting through
  a new `dnd5e-build` route (mirrors pf2/ig-build) or the existing sheet-apply path. Gear from the class's
  starting equipment.
- [ ] **MB-3 — PF2 manual builder upgrade.** Replace the raw modifier inputs with the SG-2 boost allocator;
  keep the existing ancestry/class/subclass/background/level/skill/feat pickers; build to level via the
  progression data. Feats + subclass at the correct feat levels.
- [ ] **MB-4 — IG manual builder upgrade.** Replace the raw score inputs with the SG-3 allocator; wire the
  background/class boosts; keep the ancestry/class/subclass/stance/power/feat pickers; powers/specializations
  at their levels.
- [ ] **MB-5 — wire the manual mode into entry.** From `NewCharacterForm`, the "manual/step-by-step" choice
  routes to the per-system manual builder (by selected system) instead of the AI ingest, so "manual" means the
  dropdown/roll builder, not an AI prompt variant.

### Phase 3 — refine the AI modes per system (secondary)
- [ ] **AM-1 — ruthless refinement.** Per-system grounding so a bare prompt yields a complete, rules-legal
  level-appropriate character on every system, every time.
- [ ] **AM-2 — questioning refinement.** Per-system gap/contradiction detection so the questions asked are the
  ones that system actually needs to resolve (e.g. PF2 boosts, IG stance, 5e subclass level).

## Done means
- Selecting a system + "manual" opens a vanilla, dropdown-and-roll builder for THAT system: pick race/class/
  subclass/background/level, generate abilities by the system's real method (array/point-buy/roll for 5e,
  boosts for PF2/IG) with each ability its own input and the digital roller available, see every race/class/
  background modifier applied, choose feats, and build to the chosen level with the exact per-class-per-level
  mechanics — no free-text-to-AI required. The ruthless + questioning AI modes remain, refined per system.
