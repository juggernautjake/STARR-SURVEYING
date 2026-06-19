# NMSU SUR 292 Land Law course + curriculum content buildout

**Owner:** automated overnight build (Jacob)
**Started:** 2026-06-19
**Goal:** Stand up a complete, Texas-compliant, college-level *Legal Principles and
Boundary Law I* (NMSU SUR 292) course in the Learn system, then progressively flesh
out the many existing modules that ship with empty lessons. Everything seed-driven,
applied to live Supabase, verified in the running app.

This doc drives the Stop-hook slice loop. Ship one slice at a time:
build → apply to live DB → verify → typecheck/lint → commit → push → annotate here.

## Architecture (established — do not relitigate)
- Content lives in the existing Learn schema: `learning_modules` → `learning_lessons`
  → `lesson_blocks` (typed JSONB), plus `flashcards`, `question_bank`, and
  `problem_templates` (randomized/dynamic questions via `lib/problemEngine.ts`).
- A "course" = a group of modules with `is_academic=true` + a shared `acc_course_id`
  (surfaces under "ACC Academic Courses" on `/admin/learn/modules`). SUR 292 uses
  `acc_course_id='nmsu-sur292'`.
- Build pipeline: per-module content authored as strict JSON
  (`scripts/_tmp_landlaw/content/m*.json`, contract in `SCHEMA.md`) → `gen_seed.js`
  emits idempotent SQL with deterministic UUIDs → applied with node-postgres
  (`SUPABASE_DB_URL`) → verified via SQL + Playwright.
- Texas-law reference vetted in `scripts/_tmp_landlaw/content/texas_law.md`.

## Schema fixes shipped (seed 330)
- [x] `question_bank.is_dynamic / template_id / tolerance` added (FK→problem_templates).
      Fixes a live bug: the quiz grader (`app/api/admin/learn/quizzes/route.ts`)
      selected these columns, so **every quiz submission was 500ing**. Now works +
      enables randomized template questions in quizzes.
- [x] `quiz_attempts.org_id` defaulted to the Starr org `00000000-…-0001` (was
      NOT NULL with no default → attempt saves failed).
- [x] `lesson_blocks.block_type` CHECK widened to the renderer's full vocabulary
      (key_takeaways, equation, accordion, link_reference, columns, tabs, html, …).

## Slice log

### Slice 1 — SUR 292 course seeded ✅ (seed 331)
8 modules (Getting Started + 7), 47 lessons, 315 blocks, 190 flashcards,
201 quiz questions (18 randomized/dynamic), 18 problem templates. Texas-specific
throughout (gradient boundary, dignity of calls, Texas adverse-possession tracks,
pure-notice recording, 22 TAC Ch. 138, vara, GLO). Applied + verified live.

### Slice 2 — Playwright QA of SUR 292  ⏳
- [ ] Course appears under ACC Academic Courses; modules in order.
- [ ] A lesson renders all block types (text, table, callout, key_takeaways,
      equation, accordion, link_reference) without errors.
- [ ] A module quiz loads, a static MC question grades correctly.
- [ ] A randomized/dynamic question generates concrete numbers and grades within
      tolerance (round-trip of `_generated_answer`). Fix the quiz client if it drops
      the hidden dynamic fields.
- [ ] Flashcards load for a module. Practice shows the new template categories.

### Slices 3+ — Flesh out existing empty modules (college-level)
321 empty lessons across 36 modules. One module per slice via the same
agent→JSON→`gen_seed`-style pipeline (new generator keyed by existing module IDs;
upsert lessons by deterministic IDs, fill blocks/flashcards/questions/templates).
Priority order (most foundational / boundary-law-adjacent first):
- [ ] 13 Boundary Law Principles
- [ ] 14 Metes and Bounds Descriptions
- [ ] 15 Texas Land Titles and Records
- [ ] 16 Boundary Retracement and Resolution
- [ ] 24 Texas Surveying Law and Regulations
- [ ] 2 Mathematics for Surveyors
- [ ] 3 Surveying Measurements & Error Theory
- [ ] 8 Traverse Computations
- [ ] 9 Area and Volume Computations
- [ ] 1 Introduction to Land Surveying
- [ ] 4–7 Field measurement modules (distance, angles, leveling, coordinates)
- [ ] 10–12 Technology modules (total station, GNSS, robotic/UAS)
- [ ] 17–23 Subdivision/construction/topo/geodetic/hydro/mining/business
- [ ] 25–28 SIT/RPLS exam review modules (heavy on randomized problems)
- [ ] 29–35 ACC SRVY academic courses
Each module slice: 1–2 content blocks per lesson minimum (intro→develop→takeaways),
8–15 flashcards, 12–20 quiz questions, and problem templates for computational
modules. Apply + verify each before committing.

## Deferred / needs the user (roadmap — keep this doc in-progress until addressed)
- [ ] **Figures & diagrams.** 75 `images_needed` specs captured in
      `scripts/_tmp_landlaw/content/images_manifest.json`; image blocks render as
      "📷 Figure (to be added)" placeholders. Generate/insert real diagrams
      (boundary sketches, riparian apportionment fans, traverse diagrams) later.
      Investigate consistent diagram generation that matches each word problem.
- [ ] **CAD-integrated problems (future phase).** Problems that launch the in-app
      CAD tool and ask the user to draw/adjust a line to a corrected bearing/
      distance, then validate their input. Needs a new question_type + a CAD-grader
      bridge to `lib/cad`. Design spike required.

## Notes
- All seeded rows: `status/review_status='approved'`, `is_published=true`,
  `deleted_at IS NULL` so they pass any delivery filter.
- Regenerate SUR 292 anytime: `node scripts/_tmp_landlaw/gen_seed.js` then apply
  `seeds/331_nmsu_sur292_landlaw.sql`.
