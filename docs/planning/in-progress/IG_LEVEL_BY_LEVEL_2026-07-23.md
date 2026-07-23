# Intuitive Games — level-by-level builder + multiclass

**Status:** IN PROGRESS · unblocked 2026-07-23 (owner authorized scraping the source + designing multiclass).
Carved out of `GUIDED_CHARACTER_BUILDER_2026-07-23.md` (now in `completed/`).

## The schedule was found (no invention needed)

Earlier this doc was blocked because `IG_PROGRESSION_NOTE` said levels 2–10 follow a "fixed schedule" the app
had not captured. The owner asked me to scrape the source — and the schedule **is** published, on
`intuitivegames.net/character-building` (a Squarespace accordion the earlier scrape had not expanded). It is
**universal across all classes**; only the per-subclass option lists vary (powers/specializations/
manifestation), and those are already in `IG_CLASS_DETAILS`. Scraped verbatim (raw capture kept in the
session scratchpad `ig-progression-scrape.md`):

| Lvl | Gains (in site order) | Solidas (cum.) |
|-----|-----------------------|------|
| 2 | New Trait · Subclass Defensive Power · General Feat | 50 |
| 3 | Ability Boosts ×2 · New Subclass Power · Combat Feat | 75 |
| 4 | New Skill Proficiency · Specialization · General Feat | 115 |
| 5 | Improved stances · New Subclass Power · Combat Feat | 175 |
| 6 | Ability Boosts ×2 · Unique Power · General Feat | 265 |
| 7 | New Trait · New Subclass Power · Combat Feat | 400 |
| 8 | New Skill Proficiency · Greater Specialization · General Feat | 600 |
| 9 | Ability Boosts ×2 · New Subclass Power · Combat Feat | 900 |
| 10 | Capstone · Manifestation · General Feat | 1350 |

Feats alternate (even → General, odd → Combat); 2 ability boosts at 3/6/9; specialization L4, greater L8,
unique power L6 (DM-set), capstone + manifestation L10. The 12 Capstones were scraped too (`IG_CAPSTONES`).

## Multiclass — DESIGNED (owner-authorized house-rule)

IG has **no official multiclass** (confirmed: no mention on /classes, /core-rules, /faqs — consistent with
its subclass-chosen-at-level-1 design). The owner authorized designing a balanced one. Planned design (echoes
Freebooter's "Dabbler" specialization, which literally grants "subclass powers from other classes"): a
one-time **Multiclass Dedication** taken with a General/Combat feat slot, after which the character may spend
their "New Subclass Power" slots (L3/5/7/9) on powers from the dedicated other subclass. Balanced — it costs a
feat slot and consumes power slots, no free stacking — and it will be authored as an explicit **flagged
house-rule** (provenance: custom, not vanilla), never presented as official IG.

## Slices

- [x] **IG-1 — scrape + author the schedule (DONE 2026-07-23).** `lib/dnd/systems/intuitive-games/levelup.ts`:
  `IG_LEVEL_SCHEDULE` (the scraped universal table) + `IG_CAPSTONES` (12) + `igLevelBreakdown(subclass,
  toLevel)` → per-level rows with each gain's label / choose-vs-auto / count / subclass option list (powers,
  specializations, capstones) resolved from `IG_CLASS_DETAILS`. Replaced the thin `igLevelMilestones`. Wired
  into `IGCharacterBuilder` as a full "Level 2–N progression" preview (both layouts). 10 tests.
- [x] **IG-2 — interactive `igPlanLevelUp` (DONE 2026-07-23).** `igPlanLevelUp({subclass, to, recorded, from})` + `igRecordChoice` — the IG mirror of `pf2PlanLevelUp`. Surfaces every player-choice gain (trait / feat-by-category / ability-boosts×2 / subclass-power / specialization / skill / capstone) across levels 2..to as an outstanding prompt until recorded; automatic grants never block. Options come from the scraped breakdown. 6 tests (`ig-plan-levelup.test.ts`).
- [x] **IG-3 — per-level choice persistence (DONE 2026-07-23).** New `/ig-levels` route (GET plan / POST
  record+commit), the IG mirror of `/pf2-levels`: records validated choices into `data.igBuild.choices`
  (additive field on `IGBuild`) and commits a level only when the plan is `ready` (409 otherwise), keeping the
  `ig` sidecar's level in step. IG-only, behind `requireCharacterWrite`. 6 tests (`ig-levels-route.test.ts`).
- [x] **IG-4 — IG level-by-level walk UI (DONE 2026-07-23).** New `IGLevelBuilder` walks the tested
  `/ig-levels` plan IN ORDER (trait / feat / boosts / subclass power / specialization / skill / capstone),
  refusing to advance past an outstanding choice. Each prompt's options come from the plan (subclass power /
  specialization / capstone) or the right IG catalog (feats by category from `IG_FEATS`, skills from
  `systemSkills`, the five documented trait benefits); ability boosts are a distinct-N attribute pick. The
  levels page now dispatches IG → `IGLevelBuilder` (PF2 → `PF2LevelBuilder`, 5e → `LevelBuilder`). 5 tests.
- [ ] **MC-IG — multiclass house-rule** — the Multiclass Dedication above: eligibility + how it opens other
  subclasses' power lists at the subclass-power slots; flagged as custom provenance.
- [ ] **IG-5 — QA** (browser, vanilla L1→10 for a martial + a caster subclass).

## Done means
Choosing "step by step" for an IG character walks each level's real (scraped) choices with tooltips and a live
preview, persisting as you go — parity with the 5e/PF2 builders — plus the optional flagged multiclass path.
