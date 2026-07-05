# FS Prep — Practice section, Flashcards, and per-module study loop

> **Status:** IN PROGRESS — created 2026-07-05. Branch `claude/sit-prep-buildout-2026-07-02`.
> Self-editing plan. Update the slice table as work lands; move to `completed/` when done.

## Goal (user request)
For every FS (Fundamentals of Surveying) prep module, make sure the lesson is fully
fleshed out and give the student everything they need to prepare for the module quiz:
- A **Practice** section — work knowledge questions + practice problems for the module, untimed.
- A **Flashcards** section — review built-in cards for the module **and make your own**.
- Practice/flashcards should be usable **as you read and unlock** modules.
- "A bunch" of knowledge questions & practice problems per module, so you can drill every
  concept before the graded quiz.

## Current state (verified against LIVE Supabase, 2026-07-05)
Most of the substrate already exists — this is mostly **integration + one content gap**.

| Area | State | Evidence |
|---|---|---|
| **Lesson content** (Overview/Concepts/Formulas/Examples/Tips) | ✅ **Complete** for all 10 modules — every module has all 5 sections, 14k–26k chars, worked examples + calculator keystrokes | live `fs_study_modules.content_sections`; `seeds/368_fs_prep_buildout.sql` |
| **Knowledge Qs & practice problems** | ✅ **Exist**: 605 FS questions (360 MC, 204 numeric, 41 T/F), 32–81 per module | live `question_bank` where `exam_category='FS'` |
| **Dynamic generators** | ✅ 18 parametric `problem_templates` | `lib/problemEngine.ts`, `seeds/375/376/381/382/387` |
| **Untimed practice UI** | ✅ `ProblemCard` + stateless `/api/admin/learn/tutor-problem` (fetch/grade/another) | `app/admin/components/learn/ProblemCard.tsx` |
| **Graded quiz** | ✅ `QuizRunner` → `/api/admin/learn/quizzes` → `quiz_attempts` | `app/admin/components/QuizRunner.tsx` |
| **Flashcard SYSTEM** | ✅ Complete: 4 tables + SM‑2 API + viewer + create page + hub widget + discovery-on-completion | `app/api/admin/learn/flashcards/route.ts`, `app/admin/components/FlashcardViewer.tsx` |
| **Flashcard CONTENT for FS** | ❌ **ZERO** cards for any FS module (seeded cards were for the other course) | live `flashcards` where `module_id` in FS ids → 0 |
| **FS module page tabs** | ⚙️ Local tab array (overview/concepts/formulas/examples/tips) — easy to extend | `app/admin/learn/exam-prep/sit/module/[id]/page.tsx:300` |
| **Unlock "as you read"** | ❌ No read-progress tracking; module unlock is quiz-based **and not wired** (`complete_quiz` never called from the FS page; `QuizRunner` has no `onComplete`) | fs route `:182`; `quizzes/route.ts` (no `fs_module_progress`) |
| **Flashcard/`fs_study_modules` DDL** | ⚠️ Tables exist in live DB but their `CREATE TABLE` was never captured as a seed | full-repo search finds no DDL |

**Net:** content = done. The build is: two new module tabs (Practice, Flashcards) wiring
existing systems, **authoring ~15–25 flashcards × 10 modules**, a small reading-progress +
unlock layer, and capturing the missing DDL as a seed.

## FS module identity (live)
Route tree is under `.../exam-prep/sit/...` even though it's the FS course (historical). Module
UUIDs are `f5000001-…-…01` … and the two review modules 9–10. Questions link by
`module_id` + `exam_category='FS'`; "genre" is a `genre:<slug>` tag; difficulty is a column.

## Design

### Module page: two new tabs
Extend the tab array to: Overview · Key Concepts · Formulas · Examples · Exam Tips · **Practice** · **Flashcards**.
The two new tabs are **not** `content_sections`-backed; special-case them to mount panels.

### Practice tab — `PracticePanel`
Untimed, not-for-score (distinct from the graded quiz). Reuses `ProblemCard` + `tutor-problem`.
- New endpoint `GET /api/admin/learn/exam-prep/fs/practice?module_id&difficulty?&genre?&count?`
  → a shuffled **queue of question ids** for the module (mix of knowledge + numeric), plus
  per-difficulty/genre counts so the panel can offer filters.
- Panel fetches each id via `tutor-problem action:'fetch'` → renders `ProblemCard`
  (grading, worked solution, "Explain with AI", "Try another like this" all already work).
- `POST .../fs/practice` `{module_id, question_id, is_correct}` → best-effort upsert into
  new **`fs_practice_progress`** (`user_email, module_id, attempted, correct, last_practiced_at`)
  for a "you've practiced N problems (X% right)" indicator + a "ready for the quiz" nudge.
- Filters: difficulty (easy/med/hard) + optional genre; "knowledge only / problems only" toggle.

### Flashcards tab — `FlashcardsPanel`
Wire the existing flashcard system, scoped to this module.
- `GET /api/admin/learn/flashcards?module_id=<id>` (built-in + user cards + review state).
- Review with `FlashcardViewer`; ratings via `PUT {review_rating}` (SM‑2 already implemented).
- **Make your own:** inline create → `POST` `user_flashcards` with this `module_id`.
- **Discovery:** when the student opens the module (or the Flashcards tab), upsert its built-in
  cards into `user_flashcard_discovery` so they also flow into the global "due" queue → the
  "practice as you go" behavior. (Mirror the discovery logic in `progress/route.ts:105`.)

### Unlock "as you read"
- New **`fs_section_progress`** (`user_email, module_id, section_type, viewed_at`, unique
  triple) — mark a section read when its tab is viewed (debounced POST). Drives a per-module
  "3 / 5 sections read" indicator.
- Reading a module auto-discovers its flashcards (above), so cards accumulate as you go.
- **Fix the unlock wiring gap:** give `QuizRunner` an `onComplete(result)` and have the FS page
  call `POST .../fs {action:'complete_quiz', module_id, quiz_score, weak_topics}` so passing the
  module quiz actually flips `fs_module_progress` → next module `available` (today it doesn't).
- Practice/Flashcards tabs are available whenever the module itself is unlocked; a gentle hint
  ("skim the lessons first") shows if 0 sections read — not a hard gate (user wants to practice
  as they go).

### Flashcard content (the real lift)
Author **~15–25 cards per module** (term ↔ definition, + up to 3 hints, keywords, tags,
difficulty), derived from each module's existing Concepts/Formulas/Key-topics. Produce via the
reproducible pipeline: add a `flashcards[]` array to each `scripts/_tmp_landlaw/fs/m<N>.json`
and extend `gen_fs.js` to emit `flashcards` INSERTs (namespaced/idempotent), OR a dedicated
`seeds/40x_fs_prep_flashcards.sql`. Target ~180–220 FS cards total.

### DDL capture
`seeds/401_fs_and_flashcards_ddl.sql` — idempotent `CREATE TABLE IF NOT EXISTS` for
`flashcards`, `user_flashcards`, `flashcard_reviews`, `user_flashcard_discovery`,
`fs_study_modules` (introspect exact columns from live), plus the new `fs_practice_progress` /
`fs_section_progress`. RLS enabled; service-role bypass (tutor-conversations style).

## Slices
| # | What | Status |
|---|---|---|
| **P1** | `fs_practice_progress` + `fs_section_progress` tables (seed) + DDL capture of flashcard/fs tables (`401`) | **DONE** — `seeds/401_...`; applied to live |
| **P2** | `GET/POST /api/admin/learn/exam-prep/fs/practice` (queue + attempt record) | **DONE** — route added; tsc clean |
| **P3** | `PracticePanel` component (ProblemCard-driven, filters, next/another, progress) | **DONE** — `PracticePanel.tsx` + **Practice tab** added to the module page; `ProblemCard` gained optional `onGraded`/optional `onExplain`+`onAnother`; CSS added. tsc + lint clean. (Practice half of P5 shipped here.) |
| **P4** | `FlashcardsPanel` (module-scoped review + create-your-own) reusing flashcards API + `FlashcardViewer` | **DONE** — `FlashcardsPanel.tsx` + **Flashcards tab**; lists module cards, study via `FlashcardViewer`, create/delete your own (`?discovered=false`). tsc + lint clean. Note: 0 built-in FS cards until P7 (empty state prompts create-your-own). SM‑2 rating from this tab deferred to a follow-up (global flashcards page handles SRS). |
| **P5** | Add **Practice** + **Flashcards** tabs to the FS module page; section-read tracking + reading indicator; flashcard discovery on open | **MOSTLY DONE** — tabs landed in P3/P4. Section-read tracking shipped: `fs` route gained `POST action:'mark_section_read'` (idempotent upsert into `fs_section_progress`) + a `sections_read[]` field on the single-module GET; the page marks a section read on first view of each content tab and shows a "N/5 sections read" indicator. tsc + lint clean. **Remaining:** flashcard discovery-on-open — deferred with P7 (0 built-in FS cards exist yet, so discovery is a no-op until authoring lands; wire it alongside P7). |
| **P6** | Wire module quiz pass → `fs complete_quiz` unlock (`QuizRunner.onComplete`) | **DONE** — `QuizRunner` gained an optional `onComplete(summary)` fired once on grade; the FS module page passes `handleQuizComplete` → `POST .../exam-prep/fs {action:'complete_quiz', module_id, quiz_score}` then refetches so the pass flips `fs_module_progress` and unlocks the next module (route handler at `fs/route.ts:182` already existed). tsc + lint clean. |
| **P7** | Author FS flashcards (~15–25/module via `m<N>.json` + `gen_fs.js`), seed + apply | TODO |
| **P8** | Content spot-check (sections already rich — confirm, patch only if a gap surfaces) | TODO |
| **P9** | CSS (`fs-module__practice`, `fs-module__flashcards`), tests, verify end-to-end | TODO |

## Gotchas / watch-list
- **Route tree is `sit/`, API is `fs`** — the module page lives under `.../exam-prep/sit/module/[id]` but hits `/api/.../exam-prep/fs`. Keep new endpoints under `.../exam-prep/fs/`.
- **`complete_quiz` is currently unwired** — don't assume module unlock works today; P6 fixes it.
- **Flashcard tables have no DDL in repo** — capture from live before relying on exact columns; the API uses a known subset (`term, definition, hint_1..3, keywords, tags, module_id, lesson_id, category, is_published, review_status, difficulty_level`).
- **Idempotent seeds** — namespace authored cards (e.g. `created_by='fs:m<n>'` / a tag) so re-runs don't duplicate; mirror `gen_fs.js` conventions.
- **exam_weight** historically summed to 121 across modules (per prior FS work) — leave weighting alone; not in scope here.
- **Apply seeds to live** via node-pg + `SUPABASE_DB_URL` (CLI paths fail); verify via PostgREST + service key.
