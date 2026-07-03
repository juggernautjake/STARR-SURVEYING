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
| **S1** | Extend `renderMarkdown` for images `![caption](url "credit")` + `.fs-fig` CSS | TODO |
| **S2** | Author core SVG diagram library (angles/bearings, traverse, curves, leveling, DMD area, vertical curve, contours) | TODO |
| **S3** | Genre × difficulty **taxonomy** (canonical genres + 3 levels each) — doc + apply as `category`/`difficulty`/`tags` | TODO |
| **S4** | New seed `369_fs_prep_buildout_v2.sql`: wire figures into modules' `content_sections` (images + references) | TODO |
| **S5** | New varied **problem_templates** across genres × difficulties, each with correct formula + steps + diagram + references | TODO |
| **S6** | Correctness harness — eval every new template's `answer_formula`; verify solution steps | TODO |
| **S7** | Apply seed to live Supabase (node-pg) + verify (PostgREST); commit | TODO |
| **S8** | Sourced photos (instruments/monuments) via Playwright w/ credit, placed | TODO |
| **S9** | Currency/correctness pass (Texas-applicable; NCEES FS spec current) | TODO |

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
