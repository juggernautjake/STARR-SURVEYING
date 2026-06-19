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

### Slice 2 — Verification of SUR 292 ✅ (code + engine + DB; live visual pass deferred)
- [x] Renderer (`…/[lessonId]/page.tsx`) confirmed to handle every seeded block
      type (text, table, callout, key_takeaways, equation, accordion, link_reference).
- [x] **Fixed a real grading bug:** QuizRunner dropped the per-attempt dynamic
      fields on submit, so every randomized question graded against the placeholder
      answer and was always wrong. Now echoes `_generated_answer/_tolerance/…`.
      (commit) Typechecks clean.
- [x] Engine verification: all 18 SUR 292 problem templates generate randomized
      instances that self-grade correct within tolerance with no unsubstituted
      variables (`scripts/_tmp_landlaw/verify_engine.ts`, 18/18).
- [x] DB counts verified live (8 modules / 47 lessons / 315 blocks / 201 Q (18
      dynamic) / 190 flashcards / 18 templates).
- [x] **Live visual pass — DONE.** Booted the dev server, minted a valid Auth.js
      session (via `next-auth/jwt` encode), and drove Playwright: Module 1 detail
      renders (6 lessons + gated Module Test); Lesson 1 renders the full rich-block
      prose; the lesson quiz fetched, graded (33%, per-question Correct markers,
      70% pass line), and **persisted a quiz_attempt with org_id defaulted to the
      Starr org** — proving seed 330 + the QuizRunner fix work end-to-end on real
      data. (Pre-existing dev-only React "unique key" warning in LessonViewerPage
      noted; cosmetic, not introduced by this work.)

### Slices 3+ — Flesh out existing empty modules (college-level)
321 empty lessons across 36 modules. One module per slice via the same
agent→JSON→`gen_seed`-style pipeline (new generator keyed by existing module IDs;
upsert lessons by deterministic IDs, fill blocks/flashcards/questions/templates).
Pipeline built: `scripts/_tmp_landlaw/existing/{SCHEMA_EXISTING.md,fetch_module.js,gen_existing.js}`.
Each module slice is namespaced by a `buildout` tag + `created_by='buildout:m<n>'`
so it never clobbers pre-existing company rows. Verified per batch with
`verify_buildout.ts`.
Priority order (most foundational / boundary-law-adjacent first):
- [x] 13 Boundary Law Principles — seed 332 (8 lessons, 61 blocks, 30 cards, 23 Q, 2 tmpl)
- [x] 14 Metes and Bounds Descriptions — seed 333 (7/45/23/20/4)
- [x] 15 Texas Land Titles and Records — seed 334 (8/62/29/23/2)
- [x] 16 Boundary Retracement and Resolution — seed 335 (8/55/31/23/4)
- [x] 24 Texas Surveying Law and Regulations — seed 336 (8/59/26/25/2)
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

### Curriculum buildout — COMPLETE ✅
All 36 pre-existing modules fleshed out across batches (seeds 332–367). Final
live state: **44 modules, 381 lessons, 2,767 lesson_blocks, 1,522 flashcards,
2,370 quiz questions (158 randomized/dynamic), 158 problem templates — ZERO
empty lessons remain.** Every dynamic template generates + self-grades cleanly
(158/158). College/SIT level, Texas-specific.

### Seed application audit (user asked: "ensure all seeds applied") ✅/⚠️
- [x] Applied all learn schema + course seeds (330–367).
- [x] Applied previously-unapplied leads seeds 317–322 (DB was lagging main).
      Fixed a real bug in `seeds/321_reply_templates.sql` (INSERT named 5 columns
      but supplied 4 values — dropped the surplus `is_org_default`, which defaults
      to FALSE).
- [ ] ⚠️ **Payment seeds 323–327 NOT applied — pre-existing schema drift on main.**
      323 fails: an older `invoices` table exists WITHOUT the `issued_at` column
      323 indexes. This touches live payment infrastructure; it rolled back cleanly
      (no partial state, payments unchanged). Left for deliberate human review —
      reconcile the live `invoices` schema before re-running 323–327. NOT a course
      concern; flagged here for visibility.

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
