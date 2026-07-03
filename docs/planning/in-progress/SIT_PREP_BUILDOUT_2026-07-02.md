# SIT / FS exam-prep buildout — richer lessons, images, robust problem generator

> **Created** 2026-07-02 ~7:15pm. **Deadline** tonight **9:00 pm** — self-edit
> this plan until 9:00pm, then stop self-editing and just finish the remaining
> listed items. Near the end, if any serious bug / error / contradiction shows
> up, fix it and take the time needed.
>
> **Goal (user):** flesh out the SIT prep (NCEES *Fundamentals of Surveying*
> exam = the Texas Surveyor-In-Training path) — more complete + robust lessons,
> more homework problems, a more accurate/varied problem generator across all
> genres, images/diagrams throughout (with references), and a clean **genre ×
> difficulty** taxonomy so premade problems and the generator are rated
> appropriately. All content must be **Texas-applicable and current**.
>
> **This is a DYNAMIC, self-editing plan.** As slices ship, update Status. As
> new gaps/bugs surface, append to the Discovery log and add a slice. Do not
> mark a slice done until it typechecks/verifies and is committed. Content lands
> in the **live Supabase DB** via a new seed applied with node-pg (per
> `memory/project_apply_seeds_to_supabase.md`) and verified via PostgREST, then
> committed to the repo.
>
> **Branch:** `claude/sit-prep-buildout-2026-07-02` (off main; PR workflow).

## What already exists (baseline, 2026-07-02)

- **Content model = live DB tables**, filled by seeds `030_fs_prep.sql`,
  `368_fs_prep_buildout.sql`:
  - `fs_study_modules` — **18 modules**, each with rich prose `content_sections`
    (overview / concepts / formulas / examples). **Zero images** — all text.
  - `question_bank` — **509 premade questions** (difficulty easy 182 / medium
    359 / hard 40; free-text categories).
  - `problem_templates` — **81 dynamic generators** (`answer_formula`,
    `parameters`, `solution_steps_template`, `options_generator`,
    `explanation_template`, `study_references`, **`diagram` jsonb**, `difficulty`,
    `category`/`subcategory`, `tags`). Categories are inconsistent free-text.
- **Engine:** `lib/problemEngine.ts` (`evalFormula` via a math scope with
  trig + DMS helpers) + `lib/problemGenerators.ts`. Diagrams:
  `lib/diagrams/survey-diagram.ts` renders 6 SVG types: **traverse, inverse,
  triangle, curve, leveling, compass**.
- **Lesson render:** `app/admin/learn/exam-prep/sit/module/[id]/page.tsx` →
  custom `renderMarkdown()` (bold/italic/code/headings/lists only — **no image
  support**). This is the linchpin for lesson images.
- **Resources** (`C:\Users\Jacob Maddux\STARR SURVEYING\SCHOOL\SIT Prep`):
  Ghilani/Wolf *Elementary Surveying* 13e, Kavanagh, *Engineering Surveying* 6e,
  legal-aspects guide, HP-33S/35S programs, study-group slides + exam, FS
  handbook, test strategies. `pdftotext` available for text mining.

## Image strategy (legal + high-quality)

- **Author original SVG diagrams** for the geometry-heavy topics → served from
  `public/lessons/fs/diagrams/*.svg`, copied to the resources `images/diagrams/`
  folder. Original work → no copyright issue, crisp at any size, exact fit.
- **Photos** (instruments, monuments) → public-domain / CC (Wikimedia, USGS,
  NOAA/NGS) via Playwright, saved to `public/lessons/fs/photos/` +
  resources `images/sourced/`, each with an inline **credit/reference**.
- Every figure gets a caption + source reference (markdown syntax below).

## Status

| Slice | What | Status |
|---|---|---|
| **S1** | `renderMarkdown` image support + `.fs-fig` CSS | **DONE** |
| **S2** | Core SVG diagrams (bearings/azimuths, horizontal curve, differential leveling, latitude/departure) | **DONE (4)** — +more in S10 |
| **S3** | Genre × difficulty **taxonomy** (9 genres, easy/medium/hard) via `genre:*` tags + difficulty | **DONE** |
| **S4** | Seed `369` injects figures into modules 2/3/4/5 (idempotent `fs_add_figure`) | **DONE** |
| **S5** | 18 hand-verified premade problems across 9 genres × 3 levels (question_bank) | **DONE** — templates deferred (31 generators already exist) |
| **S6** | Correctness — every numeric answer checked vs a node computation | **DONE** |
| **S7** | Apply seed to live Supabase + verify | **DONE** (18 Qs, figures in mods 2-5 verified) |
| **S8** | Sourced photo (geodetic monument, CC BY 2.5) via Playwright + sharp, injected into module 1 w/ credit | **DONE** |
| **S9** | Correctness/currency — every answer node-checked; MC↔option + numeric-format integrity (0 issues); all 10 images exist on disk; full `tsc` clean; Texas nuances handled (varas tagged `texas`; PLSS framed as national FS content, not TX) | **DONE** |
| **S10** | +5 diagrams (vertical curve, PLSS, coordinate area, photo scale, GNSS heights) → **8/8 modules illustrated**; +genres photogrammetry/boundary-legal/gnss + per-genre difficulty fill (39 problems, most easy/medium/hard) | **DONE** |

### Final tally (2026-07-02)
- **Images:** 9 authored SVG diagrams + 1 sourced CC-BY photo, all sized + captioned + referenced; **8/8 study modules illustrated**; `renderMarkdown` now supports `![caption](url "credit")` (full `tsc` clean).
- **Problems:** **39 new** hand-verified premade problems across **11 genres × up to 3 difficulty levels** (easy 12 / medium 20 / hard 7); 0 MC/numeric integrity issues; each has explanation + study reference + `genre:*` tag. Applied to live DB (seeds 369–373) + verified.
- **Generator:** the 31 existing dynamic generators already cover all genres; no new templates needed this pass (noted as strong existing coverage).
- **Optional follow-ups (not blockers):** more sourced photos (instruments); dynamic problem_templates with attached diagrams; deepen module 8 (Photogrammetry/Construction) prose.

### Continued buildout (time remaining before 9:00pm)
| Slice | What | Status |
|---|---|---|
| **S11** | 3 more sourced instrument photos (total station/level/GNSS) into modules 2/3/6 | **DONE** — 13 image refs, all on disk |
| **S12** | 4 dynamic `problem_templates` w/ diagrams (inverse, curve T, latitude, arc L) + quiz wiring | **DONE** — engine-verified |
| **S13** | 5 more dynamic templates (departure, external E, middle ordinate M, temp corr, triangle area) | **DONE** — 9 dynamic total; 48 new problems |
| **S14** | Deepen module 8 prose | **DONE — already robust** (~18K chars, 5 sections incl. calc strategy) |
| **S15** | +9 homework problems (batch 3) — 57 new total, balanced difficulty | **DONE** |
| **S16** | Public-domain USGS aerial photo → module 8 | **DONE** — 14 images total |

### FINAL VERIFIED TALLY (2026-07-02, ~8:00pm)
- **Lessons:** 10 FS modules, each with the full 5-section structure (overview/
  concepts/formulas/examples/tips) — structurally complete + consistent.
  **Modules 1–8 illustrated** (14 image refs).
- **Images:** 9 authored SVG diagrams + **5 sourced photos** (1 geodetic
  monument CC BY 2.5, total station PD, level CC BY 2.0, GNSS receiver
  CC BY-SA 4.0, USGS aerial PD) — all sized, captioned, referenced; saved to
  `public/lessons/fs/` + the SIT Prep resources folder; `renderMarkdown`
  supports figures (full `tsc` clean). **0 missing on disk.**
- **Problems:** **81 new** (67 hand-verified static + **14 dynamic generator
  templates with matched diagrams**) across **11 genres, EVERY genre spanning
  all 3 difficulty levels (easy/medium/hard)** — a complete genre×difficulty
  matrix. Mix of numeric + conceptual multiple-choice, incl. current Texas
  boundary law (adverse-possession statute ladder, priority of conflicting
  calls) and GNSS/photogrammetry concepts (DOP, stereo overlap). Integrity:
  **0 MC/option mismatches, 0 numeric-format issues, 0 non-finite dynamic
  templates** (dynamic ones round-tripped through the live engine). Each carries
  an explanation + study reference + `genre:*` tag.
- **Texas-current:** varas + PLSS (framed as national FS content, not TX);
  aligned to the current NCEES FS specification.
- **Delivery:** seeds 369–378 applied to the live Supabase DB + verified.

All planned + continued-buildout items are shipped and verified. Optional
future polish (non-blocking): figures for modules 9–10 (calc-strategy/review),
still more problems, more instrument photos.

## Figure markdown syntax (introduced in S1)

`![Caption text](/lessons/fs/diagrams/traverse-closure.svg "Credit: original diagram")`
→ `<figure class="fs-fig"><img loading="lazy" src=… alt="Caption text"><figcaption>Caption text <span class="fs-fig__credit">Credit…</span></figcaption></figure>`

## Genre taxonomy (S3 — draft; refine as we go)

NCEES FS surveying-specific genres (align categories to these):
1. Measurement & error theory  2. Distances & EDM/taping  3. Angles & directions
4. Leveling  5. Traverse & COGO  6. Areas & volumes  7. Horizontal curves
8. Vertical curves  9. GNSS/GPS  10. Photogrammetry & remote sensing
11. Boundary/legal (Texas)  12. Geodesy & datums.
Difficulty levels per genre: **1 Foundational · 2 Standard(exam) · 3 Challenge**.

## Discovery log
- _(start)_ Baseline captured above. Key enabler = renderMarkdown image support (S1).
- **Data issue (found near end, 2026-07-02):** `fs_study_modules.exam_weight_percent`
  for modules 1–8 sums to **121**, not 100 — an internal inconsistency (and the
  module prose quotes different figures, e.g. Photogrammetry "~7%" vs the stored
  12). Handled safely: the S17 study-priority chart is framed as *relative /
  approximate emphasis* (ranking), not a literal "% of exam", with an on-figure
  caveat to confirm the official NCEES FS split. **Not silently "fixed"** —
  fabricating exact NCEES percentages would be worse; flagged here for the
  office to reconcile against the current official spec.
- **S17 (done):** all **10/10 modules now illustrated** — added the exam-emphasis
  chart (module 10) and a DMS↔decimal calculator card (module 9). 16 image refs
  total (11 diagrams + 5 photos), 0 missing on disk.
- **Bug fixed (final QA, seed 385):** a `validateTemplate` sweep over all 95 FS
  `problem_templates` flagged **2 pre-existing invalid** generators (aliquot /
  section-area) — their divisor vars were listed both in `computed_vars` and as
  formula-less `computed` parameters. Removed the redundant parameter entries;
  both now validate and yield correct aliquot acreages. **Final sweep: 0 invalid,
  0 non-finite templates; 0 orphaned dynamic questions; 0 missing module refs; 0
  duplicate problems; 0 MC answer-not-in-options.**
- **Running totals (2026-07-02 ~8:00pm):** **102 new problems** (84 static + 18
  dynamic), **99 FS templates all valid (0 invalid, 0 non-finite)**, 16 images,
  10/10 modules illustrated, complete 11-genre × 3-level matrix — all applied to
  the live DB (seeds 369–388) and verified. **Every integrity check = 0 defects.**
- **S25 (done):** field-survey photo → module 4. Modules 5 & 7 kept diagram-only
  (their SVG diagrams already cover them; clean-licensed boundary/curve photos
  didn't turn up). 17 image refs (11 diagrams + 6 photos), 0 missing.
- **Currency verification vs the source PDFs (S27, done):** spot-checked content
  against the authoritative resources the user supplied. (a) The **official NCEES
  FS Reference Handbook v2.5** lists exactly the topic areas built here (Horizontal
  Circular Curves, Vertical Curve Formulas, Photogrammetry, Curvature & Refraction,
  Geodesy, State Plane Coordinates, EDM, Area/Earthwork Formulas, Probability &
  Statistics) — the 11 genres map cleanly. (b) **Kavanagh §2.3** gives curvature &
  refraction as `c + r = 0.0675·K²` (K in km); the `0.0206·F²` used here (F in
  thousands of ft) is the exact imperial equivalent (`0.0675·0.3048² = 0.0206`).
  Enhanced the C&R template + question explanations to show both forms (seed 391).
  **No content errors found; the buildout aligns with the official FS handbook.**
- **End-to-end render QA (S29, done):** replicated the page's exact
  `renderMarkdown` figure transform and ran it over all 10 modules' live content.
  **17 figures render; 0 unbalanced `<figure>` tags, 0 missing image sources, 0
  figures without a caption, 0 unexpected paths.** The student-facing lesson
  render is verified correct for every image.
- **FINAL STATE (2026-07-02 ~8:10pm):** 105 new problems (87 static + 18 dynamic),
  99 FS templates all valid, 17 images across 10/10 modules, complete 11-genre ×
  3-level matrix, content validated vs the official FS handbook + Kavanagh, all
  applied to the live DB (seeds 369–392) + verified. **Every QA layer = 0 defects.**
  All action items shipped/verified; remaining ideas are optional volume only.
- **Integration verified (S30, done):** traced the live quiz route
  (`app/api/admin/learn/quizzes/route.ts`). It selects `question_bank` by
  `module_id` (module tests) or `exam_category='FS'` (exam-prep), shuffles, and
  for `is_dynamic` rows loads the template via `dbRowToTemplate` +
  `generateDynamicQuestion`. All 105 new questions qualify; the 18 dynamic ones
  regenerate fresh each attempt. **Student-facing quiz path confirmed end-to-end.**
- **Reverted a low-value addition (S31/S32 → seed 395):** briefly appended worked
  examples to modules 1/2/3 (their examples sections looked "thin" by char count).
  A quality spot-read showed those sections **already held 5–6 worked examples**
  covering the same topics (dense prose, not thin) — the additions were duplicates.
  Stripped them (seed 395) and removed seeds 393/394. Net: no redundant content;
  examples restored to their original comprehensive state. Lesson: judge lesson
  depth by content, not character count.
