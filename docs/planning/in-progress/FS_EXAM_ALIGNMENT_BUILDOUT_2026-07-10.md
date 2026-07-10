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

## FS exam facts (NCEES — authoritative, per user 2026-07-10)
- **Fee** $225. **Computer-based** at Pearson VUE, year-round.
- **Attempt limits:** 1 per testing window (calendar quarters Jan–Mar, Apr–Jun,
  Jul–Sep, Oct–Dec); **max 3 per 12 months** (NOT unlimited).
- **Format:** **110 questions** (~100 scored + ~10 unscored pretest), **5h20m**
  working time, ~5h55m appointment, **two halves + a 25-min scheduled break**.
  Closed book with an on-screen searchable **FS Reference Handbook**. **SI + US
  units.**
- **Scoring:** pass/fail, scaled (passing score not published — psychometric
  standard-setting); **no penalty for wrong answers**; results in 7–10 days.
- **Blueprint — 7 knowledge areas (scored-Q ranges):** Boundary Law & Real
  Property **19–29**; Survey Computations & Computer Apps **17–26**; Surveying
  Processes & Methods **16–24**; Mapping Processes & Methods **14–21**; Surveying
  Principles **13–20**; Business Concepts **11–17**; Applied Math & Statistics
  **10–15**. (Range minimums sum to exactly 100.)

**Our 110-question simulator blueprint** (all within NCEES ranges, sums to 110):
| Knowledge area | Sim count |
|---|---|
| Boundary Law & Real Property | 23 |
| Survey Computations & Computer Apps | 20 |
| Surveying Processes & Methods | 17 |
| Mapping Processes & Methods | 15 |
| Surveying Principles | 14 |
| Business Concepts | 11 |
| Applied Mathematics & Statistics | 10 |
| **Total** | **110** |

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
| **S2** | `ordering` type. | **DONE** (9f286d43) — built end-to-end (none existed): QuizRunner shuffle-on-load + ▲/▼ reorder list (keyboard-accessible) + styling, `gradeOrdering` in quizzes route, `checkOrdering` + dispatch + 6 vitest (34 pass), widened question_type CHECK constraint (also admits drag_label/hotspot for S3/S4), seeds/422 with Q32/Q21/Q17 applied to live DB + verified. |
| **S3** | `drag_label` type. | **DONE** (69ae25f7) — built end-to-end: options is a `{terms,targets}` object, tap-a-term-then-tap-a-target UI (touch + keyboard accessible) + styling, client shaping shuffles terms/keeps targets, position-wise grading (reuses ordering grader), dispatch + vitest (35 pass), seeds/423 Q13 (tilted-photo geometry) applied + verified. Figure attaches in S8. |
| **S4** | `hotspot` type. | **DONE** (de117940) — built end-to-end: options is a `{regions:[{id,label}]}` object, accessible radiogroup of selectable regions + optional figure, region-id string grading (reuses MC), dispatch + vitest (36 pass), seeds/424 Q28 (geoid height h=H+N) applied + verified. **Phase A complete** — all 4 interaction types live. Figure attaches in S8. |

### Phase B — Diagram renderers
| Slice | What | Status |
|---|---|---|
| **S5** | Curve + tower-height renderers. | **DONE** (a911227a) — enriched `renderCurve` with full element set (T, LC, E, M, R, I) + tangent-chord = I/2 (existing curve templates upgrade automatically); added `renderTowerTwoAngles` (h = d/(cotα−cotβ), fails soft when β≤α) + `towerTwoAngles` spec type; 8 vitest cases (44 total). Content wiring: Q37 in S14, Q46 in S13. |
| **S6** | Profile + cross-section renderers. | **DONE** (431a173f) — `renderProfile` (independent-axis grade/invert line, X+YY.YY station labels, "cut = ?" marker; Q6) + `renderCrossSection` (road CL + side slope s:1, cut/fill; Q7); `profile`/`crossSection` spec types + dispatcher + `staLabel`; 14 diagram tests. Content wiring in S17. |
| **S7** | Plat + rounded-corner-lot renderers. | **DONE** (62a12bd7) — `renderPlat` (lot strip: numbered lots, frontage dims incl. "±" remainder, monuments, street name; Q19/Q20) + `renderRoundedCornerLot` (rectangle with a 90° corner arc, uniform-scaled; Q36); `plat`/`roundedLot` spec types + dispatcher; 19 diagram tests. Content wiring in S14/S16. |
| **S8** | Height-relations + tilted-photo renderers + static-question figures. | **DONE** (f12373f9) — `renderHeightRelations` (h=H+N; Q28) + `renderTiltedPhoto` (Q13); added `question_bank.diagram` jsonb + route resolves it to `_diagram` for static drag_label/hotspot/standard rows; seeds/425 back-fills the Q13 & Q28 figures (applied + verified); 23 diagram tests. |
| **S9** | Contour-map renderer. | **DONE** (828fab3c) — `renderContourMap`: synthetic Gaussian-hill surface + marching-squares extraction; bolder index contours, two lowest index contours labelled, peak unlabelled (student deduces interval + highest contour); `contour` spec type; 27 diagram tests. **Phase B complete** — 10 exam-figure families generate parametrically. Content wiring in S17. |

### Phase C — Business Concepts module (NCEES Cat 6)
| Slice | What | Status |
|---|---|---|
| **S10** | Business Concepts module. | **DONE** (e04a6597) — new `fs_study_modules` Module 11 (id `f500000b…0b`, weight 13) with full 5-section lesson (entities, contracts/consideration, engineering economics, Model Rules ethics, liability/standard of care, OSHA confined spaces) + 6 econ formulas + 12 topics. Applied to live DB (11 modules); SIT API lists it automatically. Seed 426. |
| **S11** | Business questions + econ templates. | **DONE** (61a7dfea) — 3 regenerable econ templates (financing P·i·(n+1)/2 = Q41, compound worth, straight-line depreciation; verified 40/40 finite via the engine) + 15 static questions (Q42 confined-space multi_select, Q43 partnership, Q44 consideration, Q45 ethics + 11 siblings). Applied to live DB (18 rows + 3 templates), all Module 11. Seed 427. |
| **S12** | Business flashcards + glossary. | **DONE** (06d53331) — 20 Module 11 flashcards (entities, contracts, econ, ethics, safety) applied to live DB + 17 new `fsGlossary.ts` terms (sole proprietorship, partnership, corporation, LLC, consideration, standard of care, negligence, Model Rules, conflict of interest, confined/permit-required space, simple/compound interest, present worth, depreciation, NFIP, One-Call). Seed 428. **Phase C complete.** |

### Phase D — Every exam question → template/variant-pool (by category)
| Slice | What | Status |
|---|---|---|
| **S13** | Applied Math & Stats templates. | **DONE** (8468601b) — 5 regenerable templates (verified 40/40): Q48 perimeter error-prop (0.50), Q46 two-angle tower height + `towerTwoAngles` figure attaching 40/40, Q29 spherical triangle, Q49 ft-in→decimal, Q39 order-of-ops; + static Q47 std-dev-of-mean mirror (±0.9"). Seed 429, applied to live DB. |
| **S14** | Survey Computations templates. | **DONE** (bc4510f2) — 6 regenerable templates (40/40): Q35 fractional-lot area, Q36 rounded-corner area + `roundedLot` figure (40/40), Q37 tangent-chord = I/2 + `curve` figure (40/40), Q38 vertical-curve low point, Q33 trig leveling, Q40 slope→horizontal. Q32 traverse-order shipped in S2. Seed 430, applied to live DB. |
| **S15** | GNSS/Geodesy questions. | **DONE** (35413419) — 14 Module 6 concept questions (7 exam mirrors + 7 siblings): Q2 antenna height, Q3 geoid-limiting, Q4 ellipsoid heights (+h=H−N), Q26 NGS (+NSRS), Q27 scale factor, Q30 Lambert, Q31 SPCS "projected" (+projections, datums, combined factor). Q28 hotspot shipped S4/S8. Verified 0 option/answer mismatches. Seed 431, applied to live DB. |
| **S16** | Boundary Law questions. | **DONE** (a22efe64) — Q20 remainder-lot parametric template + plat figure (40/40), Q19 simultaneous conveyance + static plat figure, Q16 warranty deed, Q18 easement/merger, Q22 obliterated corner, Q23 tidal datum (19), Q24 tax maps, Q25 recording dates + 4 siblings (senior rights, monument-vs-distance, riparian/littoral, adverse possession). Q17/Q21 ordering shipped S2. 0 MC mismatches. Seed 432, applied to live DB. |
| **S17** | **Mapping/Photogrammetry/GIS/Construction (Cat 2 / M8):** Q6 sewer cut (+profile figure, parametric), Q7 slope stake (+cross-section, parametric), Q8 FEMA cert, Q9 contour (+contour figure), Q10 photo scale, Q11 GIS topology, Q12 NSSDA, Q13 nadir label (drag-label+figure), Q14 photo scale (flight height), Q15 LiDAR/LAS. Seed `428_*`. | **TODO** |
| **S18** | **Surveying Processes/Principles (Cat 1/4):** Q1 leveling curvature/refraction (multi-select), Q5 survey-type, Q34 error ellipses, Q50 redundant observation. Seed `429_*`. | **TODO** |

### Phase E — Fill thin topics (flashcards, glossary, lesson figures)
| Slice | What | Status |
|---|---|---|
| **S19** | Flashcards + glossary for thin topics (GIS topology, LiDAR LAS, NSSDA 1.7308/1.9600, FEMA Elevation Certificate, Lambert vs TM, spherical trig, geoid height, obliterated vs lost corner). Seed `430_*`. | **TODO** |
| **S20** | Inject generated/house-style figures into text-only lesson sections (M8 contour/tilted-photo, M6 geoid heights, M7 plat, M5 cross-section/curve, M3/M7 two-angle height). Seed `431_*`. | **TODO** |

### Phase F — Exam-mirror set, full simulator, verification, wrap
| Slice | What | Status |
|---|---|---|
| **S21** | Author a short **"FS Exam Mirror"** 50-question practice set (`exam_category='FS-MIRROR'`) mirroring the blueprint proportions and drawing the new templates/pools incl. every interaction type. Surface it in the SIT practice UI. | **TODO** |
| **S24** | **Full-length end-of-course "FS Exam Simulator" — 110 questions** (`exam_category='FS-SIM'`) built to the blueprint table above (BL 23 / SC 20 / SP 17 / MP 15 / Prin 14 / Bus 11 / Math 10), mixing all question types (MC, multi-select, numeric, ordering, drag-label, hotspot) and SI + US-unit items. Delivery UI: a dedicated **timed** simulator (target 5h20m, two halves + a 25-min break, no wrong-answer penalty, on-screen reference-handbook link), placed at the very end of the course (Module 10 / a new capstone). Reuse the existing mock-exam surface; extend for timing/halves/break. Regenerate on each attempt where items are dynamic. | **TODO** |
| **S25** | **Exam logistics & strategy lesson** — encode the NCEES facts (fee, quarterly attempt limits / max 3 per 12 mo, 110-Q / 5h20m / two-halves+break format, closed-book searchable handbook, SI+US units, pass/fail scaled scoring, no wrong-answer penalty, blueprint weights) into Module 9/10 `content_sections` + a few flashcards, so students know what to expect. | **TODO** |
| **S22** | Apply all new seeds to **live Supabase** (node-pg), verify counts/render via PostgREST + SQL; run `type-check`, `lint`, `vitest` (engine + diagram snapshots); smoke-test each new question type + each new figure in the quiz route; run one full 110-Q simulator end-to-end. Record verification in Discovery log. | **TODO** |
| **S23** | Final QA sweep vs Appendix A (all 50 covered) + simulator built to blueprint; flip header **Status → ✅ COMPLETED**; `git mv` doc to `completed/`; update README/cross-links; merge to main per user authorization. | **TODO** |

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
- **2026-07-10 — S8 static-figure mechanism:** added a `question_bank.diagram`
  jsonb column + `staticDiagram()` in the quiz route so **any static question can
  carry a fixed figure** (spec with literal values, resolved via
  `buildDiagramFromSpec(spec,{})`). Reuse this for other conceptual figure
  questions; computational ones get their figure via the dynamic template's
  `diagram` spec instead.
- **2026-07-10 — user additions:** (1) Course must end with a **full 110-question
  FS Exam Simulator** imitating the real exam → added slice **S24** with the
  blueprint (BL 23/SC 20/SP 17/MP 15/Prin 14/Bus 11/Math 10 = 110, all within
  NCEES ranges). (2) Received authoritative **NCEES exam facts** (fee, quarterly
  attempt limits, 110-Q/5h20m/two-halves+break format, searchable handbook,
  SI+US, pass/fail no-penalty scoring, blueprint ranges) — captured in the "FS
  exam facts" block above and added slice **S25** to teach them in-course.
- **2026-07-10 — S3:** `drag_label` built full-stack. Its `options` is an OBJECT
  `{terms,targets}` (not a string[]), so the quiz API's client-shaping had to be
  guarded (it blindly `.sort()`ed options — would crash on the object). Grading
  reuses the ordering grader (answers are parallel arrays). Figure attaches in S8.
- **2026-07-10 — S2:** `ordering` did not exist anywhere; built full-stack. The
  live `question_bank_question_type_check` constraint blocked new types — seed
  422 now widens it to also admit `drag_label` + `hotspot`, so **S3/S4 need not
  touch the constraint.** New interaction types follow a clear recipe: (1) add to
  QuizRunner QuestionType union + render + answered-check + results formatter,
  (2) add `gradeX` in `app/api/admin/learn/quizzes/route.ts` + type handler, (3)
  add `checkX` + dispatch in `lib/solutionChecker.ts` + vitest, (4) seed content.

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
