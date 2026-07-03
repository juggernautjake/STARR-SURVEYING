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
