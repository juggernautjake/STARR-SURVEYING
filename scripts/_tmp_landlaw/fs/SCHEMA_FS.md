# Content contract — FS (Fundamentals of Surveying / Texas SIT) exam-prep module

You are authoring ONE module of a comprehensive FS exam-prep course in the existing
`fs_study_modules` system. Output ONE strict-valid JSON file. A generator turns it
into SQL. The course goal: fully prep a student to pass the NCEES FS exam (Texas
"SIT"). Be rigorous, current, and exam-focused.

## Read these first
- `C:\dev\STARR-SURVEYING\scripts\_tmp_landlaw\fs\fs_exam_spec.md` — the current
  NCEES FS exam spec (knowledge areas + weights, calculator policy, handbook v2.5).
- `C:\dev\STARR-SURVEYING\scripts\_tmp_landlaw\fs\resources_extract.md` — the NCEES
  FS Reference Handbook formulas, calculator keystroke methods, real practice-exam
  problems, and textbook problem types. **Use the handbook formulas verbatim** so the
  course matches what examinees actually get.

## Output file
`C:\dev\STARR-SURVEYING\scripts\_tmp_landlaw\fs\m<MODULE_NUMBER>.json`, strict JSON:
```json
{
  "module_number": 1,
  "title": "...",
  "description": "1-2 sentences.",
  "week_range": "Weeks 1-2",
  "exam_weight_percent": 15,
  "icon": "📐",
  "xp_reward": 400,
  "prerequisite_module": null,
  "key_topics": ["...","..."],
  "key_formulas": [ {"name":"Standard Error of Mean","formula":"σ_m = σ / √n"} ],
  "content_sections": [
    {"type":"overview","title":"Module Overview","content":"<markdown/HTML>"},
    {"type":"concepts","title":"Key Concepts","content":"..."},
    {"type":"formulas","title":"Essential Formulas","content":"..."},
    {"type":"examples","title":"Worked Examples","content":"..."},
    {"type":"tips","title":"Exam Tips & Calculator Strategy","content":"..."}
  ],
  "questions": [
    {"question_text":"...","question_type":"multiple_choice","options":["A","B","C","D"],
     "correct_answer":"exact option text","explanation":"...","difficulty":"easy|medium|hard"}
  ],
  "problem_templates": [ <engine template, see below> ],
  "mock_questions": [
    {"question_text":"...","options":["A","B","C","D"],"correct_answer":"exact option text",
     "explanation":"...","difficulty":"medium","area":"computations"}
  ]
}
```

### content_sections (rendered as HTML via dangerouslySetInnerHTML)
- Provide ALL FIVE types: overview, concepts, formulas, examples, tips.
- Use `## Subheading`, `**bold**`, blank lines between paragraphs. You MAY use inline
  HTML: `<ul><li>`, `<table>`, and **`<img>`/`<svg>` for diagrams** (encouraged for
  COGO/traverse/curve/leveling examples — describe legs A,B,C,D with bearings &
  distances, or a curve, and show a labeled figure). Keep each section substantial
  (overview ~200 words; concepts/formulas/examples deep; tips practical).
- The `examples` section MUST include 3+ fully worked numeric examples with the
  calculator keystrokes (TI-36X Pro / Casio fx-991, and note HP-33S/35S where the
  resources give it) — e.g. inverse via R▸P (rectangular→polar), coordinates via
  P▸R, DMS↔decimal, area by coordinates.
- The `tips` section: exam strategy for this area + the approved-calculator tricks +
  common traps + how the handbook helps.

### questions (static module-quiz questions; exam_category FS)
18–28 per module, mostly multiple_choice (a few true_false/numeric_input). Mix recall
+ applied/computational. Every MC `correct_answer` must equal an option verbatim.

### problem_templates (RANDOMIZED — the heart of "generate unique problems")
3–6 per module for computational modules (fewer/none for pure-theory ones). These let
the app generate endless unique numeric problems. The engine evaluates formulas with
BARE helpers only (NEVER `Math.`): `sin,cos,tan,asin,acos,atan,atan2,sqrt,abs,pow,
round(n,d),floor,ceil,toRad(deg),toDeg(rad),hypot,min,max,PI,dmsToDecimal`. `{{v}}`
substitutes; `{{v:f2}}` formats 2 decimals; `{{v:dms}}` formats degrees as D°M'S".
Parameter types: integer|float|angle_dms|bearing|choice|computed. Shape:
```json
{"name":"Inverse between two points (distance)","category":"FS — Plane Survey Computations",
 "subcategory":"COGO","difficulty":"medium","question_type":"numeric_input",
 "question_template":"Point A is at (N {{nA:f2}}, E {{eA:f2}}). Point B is at (N {{nB:f2}}, E {{eB:f2}}). Compute the horizontal distance A→B (ft).",
 "parameters":[{"name":"nA","type":"float","min":1000,"max":5000,"decimals":2},{"name":"eA","type":"float","min":1000,"max":5000,"decimals":2},{"name":"dN","type":"float","min":-1500,"max":1500,"decimals":2},{"name":"dE","type":"float","min":-1500,"max":1500,"decimals":2}],
 "computed_vars":[{"name":"nB","formula":"nA+dN"},{"name":"eB","formula":"eA+dE"}],
 "answer_formula":"hypot(dN,dE)","answer_format":{"decimals":2,"unit":"ft","tolerance":0.1},
 "solution_steps_template":[{"step_number":1,"title":"Latitude & departure","calculation_template":"ΔN={{dN:f2}}, ΔE={{dE:f2}}"},{"step_number":2,"title":"Distance = √(ΔN²+ΔE²)","result_template":"{{_answer}} ft (calc: R▸P)"}],
 "explanation_template":"Use rectangular→polar: enter ΔN and ΔE, the calculator returns distance {{_answer}} ft and azimuth directly.",
 "options_generator":{"method":"none"}}
```
Cover (across the relevant modules): DMS↔decimal, DMS→total seconds, azimuth↔bearing,
back-azimuth, inverse (distance AND azimuth) between two coordinates, coordinates of a
point from azimuth+distance (P▸R), latitude/departure, traverse linear misclosure &
relative precision, angle balancing, area by coordinates (shoelace), leveling HI/FS,
curvature&refraction, EDM/temperature/slope correction, horizontal curve (T,L,R,deg),
vertical curve elevation, scale/GSD (photogrammetry), grid↔ground (combined factor),
standard error / error propagation. Make ranges realistic; verify each yields ONE
sensible numeric answer with a tolerance.

### mock_questions (exam_category FS-MOCK; for the 110-question final mock)
8–16 per module, all multiple_choice, `area` = one of:
`processes | mapping | boundary | principles | computations | business | math`.
These feed the comprehensive mock exam and are scored by category.

Return a 5-line summary (counts). The JSON file is the deliverable.
