# FS Exam Alignment Buildout — mirror the real NCEES FS practice exam into our course — 2026-07-10

> **Driver.** This doc is processed by the auto-continue **Stop hook**
> (`.claude/hooks/continue-until-planning-done.sh`, Phase 1). Each turn: pick the
> next unchecked slice (top-to-bottom in the Status table), do the actual work,
> run `npm run type-check` + `npm run lint`, commit + push, then tick the slice
> `**DONE**` with a one-line note + commit hash. Content lands in the **live
> Supabase DB** via new numbered seeds (start at `seeds/421_*`) applied with
> node-pg per `memory/project_apply_seeds_to_supabase.md`, verified via
> PostgREST/SQL, then committed. When every slice is `**DONE**` or
> `~~struck~~ — deferred: <reason>`, flip the header **Status** to
> `✅ COMPLETED`, `git mv` this doc to `docs/planning/completed/`, and update any
> cross-links.
>
> **Status:** IN PROGRESS (created 2026-07-10)
> **Owner:** Jacob Maddux   **Branch:** `claude/fs-prep-exam-alignment-2026-07-10`
> **Predecessor:** `docs/planning/completed/SIT_PREP_BUILDOUT_2026-07-02.md`
> **Source material:** `practice-exam/` (50 real FS practice-exam Q&A + 10 vector
> figures captured 2026-07-10; `practice-exam/fs-practice-exam-questions.json` is
> the machine-readable spec of every question).
>
> **Goal (user):** Catalogue every existing question type / lesson / material in
> our FS prep course; compare against the real 50-question NCEES BenchPrep FS
> practice exam; close the gaps; and make **every exam question a "common
> question" in our course that can be generated with different numbers /
> parameters / circumstances**. Figures/diagrams from the exam must be
> reproducible — **generate them programmatically** (preferred) and/or edit the
> captured art. This plan answers "is that possible?", recommends the approach,
> and builds it in slices.
>
> **This is a DYNAMIC, self-editing plan.** Append to the Discovery log and add
> slices as gaps/bugs surface. Do not mark a slice done until it
> typechecks/lints and is committed.

---

## 0. TL;DR — the answer to the user's core questions

1. **Can we generate the exam-style figures programmatically, parameterized by
   numbers/units? — YES, and it's the recommended path.** We already own a
   working, production, spec-driven SVG **figure generator**
   (`lib/diagrams/survey-diagram.ts`) wired end-to-end into the problem engine
   and quiz UI. It renders 6 figure families today (traverse, inverse, triangle,
   curve, leveling, compass) whose numbers/labels are **derived from the same
   random variables that drive the question**, so the picture always matches the
   math. We extend it with ~8 new renderers to cover the exam's figure types.

2. **Should we instead edit the 10 captured exam SVGs and swap the numbers? —
   NO (not viable as templates).** Verified: all 10 captured SVGs are Adobe
   Illustrator glyph-outline exports — **0 `<text>` elements; every digit/letter
   is a `<path>` curve**, and geometry is hard-coded and *not linked to the
   labels*. Find-replacing "40°"→"35°" is impossible (there's no text to
   replace) and wouldn't move the geometry anyway. **Use the captured SVGs as
   visual reference specs only** (and, optionally, as PNG visual-regression
   targets). Generate fresh instead.

3. **Can every exam question become a repeatable "common question" with varied
   parameters? — YES, via three mechanisms** (see §3): (a) computational →
   parametric `problem_templates`; (b) conceptual → a small "variant pool" of
   sibling questions + optional `choice`-parameter templates; (c) the 4 exam
   interaction types we don't support yet (multi-select, ordering, drag-label,
   hotspot) get first-class engine support in Phase A.

---

## 1. Baseline — what already exists (catalogue, 2026-07-10)

### 1.1 Question / generator engine
- **Tables:** `fs_study_modules` (10 modules, self-contained; lesson prose in
  `content_sections` jsonb), shared `question_bank` (~875 rows;
  `exam_category ∈ {FS, FS-MOCK}`; dynamic cols `is_dynamic`, `template_id`,
  `tolerance`), `problem_templates` (~99 dynamic generators; `question_template`,
  `answer_formula`, `parameters`, `computed_vars`, `answer_format`,
  `options_generator`, `solution_steps_template`, `explanation_template`,
  **`diagram` jsonb spec**), plus `fs_practice_progress`, `fs_section_progress`,
  `flashcards` (~190), `flashcard_reviews` (SM-2 SRS), `user_flashcards`.
- **Engine:** `lib/problemEngine.ts` (`generateFromTemplate` /
  `generateDynamicQuestion`; randomizes params by type — integer/float/angle_dms/
  bearing/choice/computed; `evalFormula` sandbox with **bare helpers**: `sin cos
  tan asin acos atan atan2 sqrt abs pow floor ceil log log10 exp min max round
  toRad toDeg dmsToDecimal decimalToDeg/Min/Sec sign hypot PI E`), plus 28
  hardcoded generators in `lib/problemGenerators.ts`. Grading in
  `lib/solutionChecker.ts` (exact / absolute-tolerance / relative-tolerance /
  partial-text).
- **Supported question types:** `numeric_input`, `multiple_choice`, `true_false`,
  `short_answer`, `fill_blank`, `math_template`. Usage across FS seeds: 629 MC,
  304 numeric, 41 T/F.
- **NOT supported:** `multi_select`, `ordering` (drag/rank), `drag_label`,
  `hotspot` — **exactly the 4 interaction types the real exam uses** beyond MC/
  numeric.

### 1.2 Diagram / image system
- **`lib/diagrams/survey-diagram.ts`** — spec→SVG-string generator. `DiagramSpec`
  stores *variable names*; `buildDiagramFromSpec(spec, vars)` resolves them
  against the generated numbers and dispatches to `renderTraverse / renderInverse
  / renderTriangle / renderCurve / renderLeveling / renderCompass`. `fitTransform`
  auto-scales/centers any world-coordinate point set (north-up). Fails soft
  (returns `null`). Rendered via `dangerouslySetInnerHTML` in
  `app/admin/components/QuizRunner.tsx` and
  `app/admin/components/learn/ProblemCard.tsx` — **no UI change needed to add
  figure types.**
- **House-style static SVGs:** `public/lessons/fs/diagrams/*.svg` (24 files —
  horizontal-curve, vertical-curve, average-end-area, profile-grade,
  differential-leveling, latitude-departure, coordinate-area, metes-and-bounds,
  plss-section, photo-scale, stereo-overlap, gnss-trilateration, gnss-heights,
  grid-ground, slope-reduction, normal-error-curve, accuracy-precision, …). These
  are the **visual style target** (brand blue `#1d3095`, red `#bd1218`, Arial,
  legend `<g>` for formulas, real `<text>`). Lesson figures are Markdown
  `![](/lessons/fs/diagrams/…svg)` appended into `content_sections`.
- **Captured exam figures:** `practice-exam/images/*.svg` (10) — glyph-outline
  art, reference-only (see §0.2).

### 1.3 Lessons / content
- FS course = `fs_study_modules` M1–M10 (IDs `f5000001…01` … `f500000a…0a`).
  Content areas & exam weights: M1 Fundamentals 15, M2 Leveling 12, M3 Distance &
  Angle 15, M4 Traversing & COGO 18, M5 Areas/Volumes/Curves 15, M6 GNSS/Geodesy
  14, M7 Boundary Law & Public Lands 12, M8 Photogrammetry/GIS/Construction 12,
  M9 Calculator Mastery, M10 Comprehensive Review + 110-q FS-MOCK.
- Flashcards ~190 (M1–M10), grounded AI tutor (Voyage embeddings + FTS fallback,
  `lib/learn/tutor-*.ts`, `seeds/403/404`), glossary 69 terms
  (`lib/learn/fsGlossary.ts`).
- Admin/study surface: `app/admin/learn/exam-prep/sit/` (module list, per-module
  sections + practice, mock-exam). RPLS track = placeholder shell.

### 1.4 Coverage vs the 7 NCEES FS categories
| # | NCEES category | Coverage | Notes |
|---|----------------|----------|-------|
| 1 | Surveying Processes and Methods | **Strong** | M1–M4 |
| 2 | Mapping Processes and Methods | **Moderate** | photogrammetry ok; **GIS/cartography/LiDAR thin** |
| 3 | Boundary Law and Real Property Principles | **Strong** | M7 + NMSU land-law course |
| 4 | Surveying Principles | **Moderate** | via M1/M6; no dedicated module |
| 5 | Survey Computations & Computer Applications | **Strong** | M4/M5/M9 + templates |
| 6 | Business Concepts | **GAP — none** | no module/questions/flashcards |
| 7 | Applied Mathematics and Statistics | **Moderate-Strong** | stats in M1; no standalone math module |

### 1.5 Build/verify mechanism
- Stop hook counts `.md` files in `docs/planning/in-progress/` and unchecked
  `- [ ]` in `docs/planning/QA_CHECKLIST.md`; blocks until both are zero. Per
  slice: typecheck + lint + commit + push; content → live Supabase via node-pg,
  verify via PostgREST, commit; move doc to `completed/` when done.

---

## 2. Image-generation strategy (recommended)

**Extend the existing engine; do not build a new system and do not template the
captured SVGs.** For each exam figure family, add one `renderX(numbers)` function
to `survey-diagram.ts`, a `type` + `*Var` fields to `DiagramSpec`, and a `case`
in `buildDiagramFromSpec`. Match the `public/lessons/fs/diagrams` house style.
Keep every number a real `<text>` bound to the same `vars` that drive geometry
(this is exactly what the captured Illustrator exports failed to do).

| Exam Q | Figure family | New renderer | Effort | Notes |
|--------|---------------|--------------|--------|-------|
| Q37 | Horizontal curve elements | enrich `renderCurve` (add T/E/M/LC + deflection labels) | S | already 80% there |
| Q46 | Height from two angles/setups | `renderTowerTwoAngles(d, α, β)` | S | baseline + 2 rays + triangle |
| Q6  | Grade/cut profile (sewer) | `renderProfile(stations[], inverts[], grades[])` | M | polyline over stationing |
| Q7  | Cut/fill cross-section | `renderCrossSection(cl, ground[], template, slopes)` | M | style ref `average-end-area.svg` |
| Q19,Q20 | Subdivision/recorded plat | `renderPlat(lots[])` | M | labeled lot polygons + dims |
| Q36 | Rounded-corner lot area | `renderRoundedCornerLot(sides, radius)` | S | polygon + arc fillet |
| Q13 | Tilted-photo / nadir diagram | `renderTiltedPhoto(tilt, H)` | S | schematic + few dims |
| Q28 | Geoid/ellipsoid heights (H,h,N) | `renderHeightRelations(H, h, N)` | S | style ref `gnss-heights.svg` |
| Q9  | Contour map (highest contour) | `renderContourMap(surface, interval)` | **L** | synthetic surface + marching squares; own slice |

Fallback for any renderer that proves too costly: hand-author 2–3 house-style
static SVG variants with **real `<text>`** labels and drive only the numeric
labels from params (partial parameterization). Contours (Q9) may ship this way
first.

---

## 3. "Every exam question = a common, regenerable question" — the three mechanisms

1. **Computational (numeric or number-driven MC):** author a
   `problem_templates` row with `parameters` (randomized ranges), `answer_formula`
   (bare helpers), `answer_format` (decimals/unit/tolerance), `options_generator`,
   `solution_steps_template`, `explanation_template`, and a `diagram` spec where a
   figure applies. A linked `question_bank` row (`is_dynamic=true`) surfaces it in
   quizzes. → Infinite variants with new numbers, matching figure.
2. **Conceptual (definitions / "which is true" / best-answer):** build a
   **variant pool** — 3–5 sibling `question_bank` rows with reworded stems and
   rotated option sets tagged to the same concept — and, where the scenario can be
   swapped, a `choice`-parameter template that rotates the correct term and
   distractors. → Varied circumstance without fake numbers.
3. **Interaction types (multi-select / ordering / drag-label / hotspot):** add
   first-class engine support (Phase A), then parameterize by shuffling option
   sets / correct sequences / labeled targets so each render differs.

Every one of the 50 exam questions is assigned a mechanism + target module +
build slice in **Appendix A**.

---

## 4. Gap summary (exam vs. built)
- **G1 — Interaction types:** exam uses multi-select (Q1, Q42), ordering (Q17,
  Q21, Q32), drag-label (Q13), hotspot (Q28); engine supports none. → Phase A.
- **G2 — Figure generators:** 8 new renderers needed. → Phase B.
- **G3 — Business Concepts (NCEES Cat 6) entirely missing:** exam Q41 (engineering
  economics), Q42 (OSHA/safety), Q43 (business entities), Q44 (contracts), Q45
  (ethics/Model Rules). → Phase C (new Module 11).
- **G4 — Thin topics with exam questions:** GIS topology (Q11), LiDAR/LAS (Q15),
  NSSDA accuracy 1.7308/1.9600 (Q12), FEMA Elevation Certificate (Q8), Lambert vs
  transverse-Mercator (Q30), spherical trigonometry (Q29), geoid height concept
  (Q3/Q28), simultaneous-conveyance & priority-of-calls nuance (Q17/Q19). →
  templates in Phase D + flashcards/figures in Phase E.
- **G5 — Exam-mirror practice set:** no 50-question set mirroring the real exam
  blueprint/mix. → Phase F.

---

## 5. Status (execution order — work top to bottom)

### Phase A — Engine: the 4 missing interaction types
| Slice | What | Status |
|---|---|---|
| **S1** | `multi_select` type. | **DONE** (1e9b77de) — found it was already wired in the quiz path (QuizRunner + `gradeMultiSelect` in the quizzes route); added `checkMultiSelect` + `multi_select` case to the universal `checkAnswer` (latent bug), 7 vitest cases (28 pass), seeds/421 with 3 select-all questions (Q1 mirror + siblings) applied to live DB + verified. |
| **S2** | `ordering` type (drag/rank): engine (store correct sequence, shuffle for display), `solutionChecker` sequence grading, drag-reorder UI (keyboard-accessible fallback = number inputs); author Q32, Q21, Q17. Vitest. | **TODO** |
| **S3** | `drag_label` type: engine (labels + target ids), diagram renderers expose named drop-zones, `solutionChecker` mapping grade, drag-onto-figure UI (+ dropdown fallback per target); author Q13. Vitest. | **TODO** |
| **S4** | `hotspot` type: engine (clickable regions on a diagram, correct region id + tolerance), `solutionChecker`, click-on-figure UI (+ labeled-choice fallback); author Q28. Vitest. | **TODO** |

### Phase B — Diagram renderers
| Slice | What | Status |
|---|---|---|
| **S5** | Enrich `renderCurve` (T/E/M/LC + deflection labels) for Q37; add `renderTowerTwoAngles` (Q46). House-style pass (brand colors, `<text>`). Vitest snapshot of SVG for given inputs. | **TODO** |
| **S6** | `renderProfile` (Q6) + `renderCrossSection` (Q7) with `fitTransform`; extend `DiagramSpec`. Snapshot tests. | **TODO** |
| **S7** | `renderPlat` (Q19/Q20) + `renderRoundedCornerLot` (Q36). Snapshot tests. | **TODO** |
| **S8** | `renderTiltedPhoto` (Q13) + `renderHeightRelations` (Q28, expose drop-zones/regions for S3/S4). Snapshot tests. | **TODO** |
| **S9** | `renderContourMap` (Q9) — synthetic surface + marching-squares; label index contours. Fallback to 2–3 static house-style variants if over-budget. | **TODO** |

### Phase C — Business Concepts module (NCEES Cat 6)
| Slice | What | Status |
|---|---|---|
| **S10** | New `fs_study_modules` **Module 11 "Business, Ethics & Professional Practice"** (`content_sections`: business entities, contracts & consideration, engineering economics, NCEES Model Rules/ethics, OSHA & field safety, project mgmt). Wire into SIT module list + readiness stats; note exam_weight. Seed `421_*`. | **TODO** |
| **S11** | Business `question_bank` + `problem_templates`: Q41 (declining-balance interest, parametric), Q42 (confined space, multi-select), Q43/Q44 (entities/contracts, variant pools), Q45 (ethics), + ~15 siblings across easy/med/hard. Seed `422_*`. | **TODO** |
| **S12** | Business flashcards (~20) + glossary terms (partnership, corporation, consideration, lien, NFIP, Model Rules, confined space, engineering economics). Seed `423_*`. | **TODO** |

### Phase D — Every exam question → template/variant-pool (by category)
| Slice | What | Status |
|---|---|---|
| **S13** | **Applied Math & Stats (Cat 7):** Q47 std-dev-of-mean, Q48 error-propagation(perimeter), Q46 two-angle height (+figure), Q29 spherical triangle, Q49 ft-in→decimal, Q39 order-of-operations. Parametric templates + linked bank rows. Seed `424_*`. | **TODO** |
| **S14** | **Survey Computations (Cat 5):** Q35 fractional-lot area, Q36 rounded-corner area (+figure), Q37 curve angle (+figure), Q38 vertical-curve low point, Q33 trig leveling, Q40 slope→horizontal, Q32 traverse-order (ordering). Seed `425_*`. | **TODO** |
| **S15** | **GNSS/Geodesy (Cat 4 / M6):** Q2 antenna height, Q3 geoid-limiting, Q4 ellipsoid heights, Q26 NGS source, Q27 historical scale factor, Q28 geoid-height (hotspot+figure), Q30 Lambert lines, Q31 SPCS "projected". Templates + variant pools. Seed `426_*`. | **TODO** |
| **S16** | **Boundary Law (Cat 3 / M7):** Q16 warranty deed, Q17 priority-of-calls (ordering), Q18 easement, Q19 simultaneous conveyance (+plat figure), Q20 remainder lot (+plat figure, parametric excess/deficiency), Q21 metes&bounds parts (ordering), Q22 obliterated corner, Q23 tidal datum, Q24 tax maps, Q25 recording dates. Seed `427_*`. | **TODO** |
| **S17** | **Mapping/Photogrammetry/GIS/Construction (Cat 2 / M8):** Q6 sewer cut (+profile figure, parametric), Q7 slope stake (+cross-section, parametric), Q8 FEMA cert, Q9 contour (+contour figure), Q10 photo scale, Q11 GIS topology, Q12 NSSDA, Q13 nadir label (drag-label+figure), Q14 photo scale (flight height), Q15 LiDAR/LAS. Seed `428_*`. | **TODO** |
| **S18** | **Surveying Processes/Principles (Cat 1/4):** Q1 leveling curvature/refraction (multi-select), Q5 survey-type, Q34 error ellipses, Q50 redundant observation. Seed `429_*`. | **TODO** |

### Phase E — Fill thin topics (flashcards, glossary, lesson figures)
| Slice | What | Status |
|---|---|---|
| **S19** | Flashcards + glossary for thin topics (GIS topology, LiDAR LAS, NSSDA 1.7308/1.9600, FEMA Elevation Certificate, Lambert vs TM, spherical trig, geoid height, obliterated vs lost corner). Seed `430_*`. | **TODO** |
| **S20** | Inject generated/house-style figures into text-only lesson sections (M8 contour/tilted-photo, M6 geoid heights, M7 plat, M5 cross-section/curve, M3/M7 two-angle height). Seed `431_*`. | **TODO** |

### Phase F — Exam-mirror set, verification, wrap
| Slice | What | Status |
|---|---|---|
| **S21** | Author an **"FS Exam Mirror"** 50-question practice set (`exam_category='FS-MIRROR'`) mirroring the real blueprint & the 7-category mix, drawing the new templates/pools, incl. every new interaction type. Surface it in the SIT mock/practice UI. Seed `432_*`. | **TODO** |
| **S22** | Apply all seeds `421–432` to **live Supabase** (node-pg), verify counts/render via PostgREST + SQL; run `type-check`, `lint`, `vitest` (engine + diagram snapshots); smoke-test each new question type + each new figure in the quiz route. Record verification in Discovery log. | **TODO** |
| **S23** | Final QA sweep vs Appendix A (all 50 covered); flip header **Status → ✅ COMPLETED**; `git mv` doc to `completed/`; update README/cross-links; open PR / merge per user direction. | **TODO** |

---

## 6. Guardrails
- **Slices small + shippable:** typecheck + lint + commit + push every slice.
- **Answers verified:** node-check every numeric answer_formula; confirm against
  the NCEES FS Reference Handbook. Watch the known SIT-prep gotchas
  (`exam_weight_percent` currently sums to 121; `study_ref` link format;
  computed-param rules) per `memory/project_sit_prep_buildout.md`.
- **Seeds are idempotent** (DELETE-by-tag then INSERT; `CREATE … IF NOT EXISTS`);
  never destructive to unrelated data. Apply to live DB per
  `memory/project_apply_seeds_to_supabase.md`, then verify, then commit.
- **Copyright:** do NOT ship the captured exam SVGs or exam wording verbatim into
  the course. Captured art is **reference only**; generate original figures and
  reword stems. Keep `practice-exam/` out of the shipped course.
- **No new UI framework:** reuse `dangerouslySetInnerHTML` diagram path and the
  existing QuizRunner/ProblemCard; add types behind the existing render switch.
- **Accessibility:** every drag/hotspot type ships a keyboard/no-pointer fallback
  (dropdowns / numbered inputs / labeled choices).

## 7. Discovery log
- _(start 2026-07-10)_ Baseline catalogued above (4 research passes). Verified
  captured SVGs are glyph-outline (0 `<text>`) → generate-fresh, not edit. Next
  seed number = **421**. Engine lacks multi-select/ordering/drag-label/hotspot.
  Business Concepts (Cat 6) has zero coverage.
- **2026-07-10 — S1 scope correction:** `multi_select` (and `fill_blank`) are
  actually **already wired in the quiz DELIVERY path** — `QuizRunner.tsx` renders
  + stores a JSON array of chosen option strings (with keyboard fallback), and
  `app/api/admin/learn/quizzes/route.ts` grades via `gradeMultiSelect`
  (set-equality + `partial_score`). The research agent's "unsupported" finding was
  about the *dynamic template generator* (`problemEngine`), a separate path.
  Implication: **S2–S4 (ordering/drag-label/hotspot) may likewise be partly
  wired — check the quizzes route + QuizRunner first before building.** Only the
  universal `checkAnswer` dispatch and authored content were missing for S1.
- **Seed numbering:** assigned in **build order** starting 421 (S1 = 421). The
  per-slice numbers in the Status table are indicative; use the next free number.

---

## Appendix A — all 50 exam questions → mechanism / module / figure / slice
Legend: mech = P(arametric template) · V(ariant pool) · I(nteraction type).
Full stems/answers/explanations: `practice-exam/fs-practice-exam-questions.json`.

| Q | Topic | Type | mech | Module/Cat | Figure renderer | Slice |
|---|-------|------|------|-----------|-----------------|-------|
| 1 | Leveling curvature & refraction | multi-select | I+V | M2/1 | — | S1, S18 |
| 2 | GNSS most important measurement | MC | V | M6/1 | — | S15 |
| 3 | GNSS elevations limiting factor (geoid) | MC | V | M6/4 | — | S15 |
| 4 | Geodetic heights = ellipsoid | MC | V | M6/4 | — | S15 |
| 5 | Survey type to link infrastructure | MC | V | M1/1 | — | S18 |
| 6 | Sewer grade / cut computation | numeric | P | M8/5 | `renderProfile` | S6, S17 |
| 7 | Slope stake trial position | MC | P | M8/5 | `renderCrossSection` | S6, S17 |
| 8 | FEMA Elevation Certificate | MC | V | M8/2 | — | S17, S19 |
| 9 | Highest contour elevation | numeric | P | M8/2 | `renderContourMap` | S9, S17 |
| 10 | Aerial photo scale (map cross-ref) | MC | P | M8/2 | — | S17 |
| 11 | GIS topology (odd one out) | MC | V | M8/2 | — | S17, S19 |
| 12 | NSSDA vertical multiplier 1.9600 | numeric | V | M8/2 | — | S17, S19 |
| 13 | Nadir / tilted-photo labeling | drag-label | I | M8/2 | `renderTiltedPhoto` | S3, S8, S17 |
| 14 | Photo scale from flight height | MC | P | M8/2 | — | S17 |
| 15 | LiDAR binary format (LAS) | MC | V | M8/2 | — | S17, S19 |
| 16 | Warranty deed = title guarantee | MC | V | M7/3 | — | S16 |
| 17 | Priority of conflicting title elements | ordering | I | M7/3 | — | S2, S16 |
| 18 | Easement extinguished by merger | MC | V | M7/3 | — | S16 |
| 19 | Simultaneous conveyances (subdivision) | MC | V | M7/3 | `renderPlat` | S7, S16 |
| 20 | Remainder-lot frontage | MC | P | M7/3 | `renderPlat` | S7, S16 |
| 21 | Metes & bounds parts order | ordering | I | M7/3 | — | S2, S16 |
| 22 | Obliterated PLSS corner | MC | V | M7/3 | — | S16 |
| 23 | Tidal datum epoch = 19 yr | numeric | V | M7/3 | — | S16 |
| 24 | County tax maps role | MC | V | M7/3 | — | S16 |
| 25 | Deed recording dates → order of conveyance | MC | V | M7/3 | — | S16 |
| 26 | NGS = control monument source | MC | V | M6/4 | — | S15 |
| 27 | Historical scale factor for resurvey | MC | V | M6/1 | — | S15 |
| 28 | Geoid height on diagram (h=H+N) | hotspot | I | M6/4 | `renderHeightRelations` | S4, S8, S15 |
| 29 | Spherical triangle (law of cosines) | MC | P | M6/7 | — | S13 |
| 30 | Lambert "equal distance apart" lines | MC | V | M6/2 | — | S15, S19 |
| 31 | SPCS "projected" meaning | MC | V | M6/2 | — | S15 |
| 32 | Traverse adjustment step order | ordering | I | M4/5 | — | S2, S14 |
| 33 | Trigonometric leveling elevation | MC | P | M2/5 | — | S14 |
| 34 | Error ellipses = adjusted coords | MC | V | M4/4 | — | S18 |
| 35 | Fractional government lot area | MC | P | M5/5 | — | S14 |
| 36 | Rounded-corner lot area | MC | P | M5/5 | `renderRoundedCornerLot` | S7, S14 |
| 37 | Tangent–chord angle = I/2 | MC | P | M5/5 | enrich `renderCurve` | S5, S14 |
| 38 | Sag vertical-curve low point | MC | P | M5/5 | — | S14 |
| 39 | Order of operations (spreadsheet) | MC | P | M9/5 | — | S13 |
| 40 | Slope → horizontal distance | MC | P | M3/5 | — | S14 |
| 41 | Financing cost (declining balance) | MC | P | M11/6 | — | S11 |
| 42 | OSHA confined space | multi-select | I | M11/6 | — | S1, S11 |
| 43 | Partnership definition | MC | V | M11/6 | — | S11 |
| 44 | Contract consideration | MC | V | M11/6 | — | S11 |
| 45 | Surveyor's foremost responsibility | MC | V | M11/6 | — | S11 |
| 46 | Tower height from two angles | numeric | P | M3/7 | `renderTowerTwoAngles` | S5, S13 |
| 47 | Standard deviation of the mean | MC | P | M1/7 | — | S13 |
| 48 | Error propagation (perimeter) | MC | P | M1/7 | — | S13 |
| 49 | Feet-inches → decimal feet | MC | P | M3/7 | — | S13 |
| 50 | Redundant observation (least squares) | MC | V | M4/4 | — | S18 |
