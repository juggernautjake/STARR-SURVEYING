# Content contract — FAA Part 107 (commercial drone / Remote Pilot) course

You are authoring ONE module of a complete FAA Part 107 prep course that must fully
prepare a student to PASS the FAA "Unmanned Aircraft General – Small (UAG)" knowledge
exam (60 questions, 70% to pass). Output ONE strict-valid JSON file; a generator turns
it into SQL for the `learning_modules` system.

## Read first
- `C:\dev\STARR-SURVEYING\scripts\_tmp_landlaw\part107\part107_spec.md` — researched FAA
  exam spec + deep content (USE ITS RULE NUMBERS VERBATIM: 400 ft AGL, 100 mph/87 kt,
  3 SM vis, 500-below/2000-horizontal cloud clearance, 107.9 reporting (10 days / $500
  / serious injury), 0.04 BAC + 8 hr, anti-collision lights ≥3 SM at night/twilight,
  Operations Over People Categories 1–4, Remote ID three options, recurrent training
  every 24 calendar months, etc.). Where the spec marks an item [VERIFY], phrase it
  cautiously (e.g., "generally", "as of this writing") rather than stating a hard fact.
- `C:\dev\STARR-SURVEYING\scripts\_tmp_landlaw\content\SCHEMA.md` — the EXACT lesson
  `block` shapes, flashcard shape, and `quiz_questions` shape. Reuse them verbatim
  (text, callout{type}, key_takeaways, table, accordion, link_reference, image,
  divider). This course is CONCEPTUAL — **do NOT include problem_templates**.

## Output JSON (subset of SCHEMA.md — no problem_templates)
```json
{
  "module": {"order_index": 2, "title": "Module 2: ...", "description": "...",
             "estimated_hours": 2.5, "learning_objectives": ["..."]},
  "lessons": [ {"title":"...","estimated_minutes":25,"learning_objectives":["..."],
                "blocks":[ <block objects per SCHEMA.md> ],
                "flashcards":[ {"term":"...","definition":"...","hint_1":"(optional)"} ],
                "images_needed":[ {"slug":"p107-m3-sectional-1","caption":"What the figure shows","kind":"chart|diagram|photo"} ] } ],
  "quiz_questions": [ {"lesson_index":0,"question_text":"...","question_type":"multiple_choice",
     "options":["A","B","C"],"correct_answer":"exact option text","explanation":"...","difficulty":"easy|medium|hard"} ],
  "homework": []
}
```

## Requirements
- Fill the module richly. 4–7 lessons; each lesson 5–9 content blocks of real teaching
  prose (intro text → develop with text/table/callout/accordion → `key_takeaways`).
- The FAA exam leans heavily on **sectional chart reading and METAR/TAF decoding** —
  wherever a real chart/figure/symbol is needed, add an `image` block (url:"") AND an
  `images_needed` entry so the user can drop the FAA figure in later. Be generous with
  these in the Airspace and Weather modules. Describe in the caption exactly what the
  figure should show (e.g., "Sectional excerpt showing a Class D airport with the
  blue dashed ring and the [41] ceiling box").
- Flashcards: 3–5 per lesson (key terms, rule numbers, chart symbols).
- quiz_questions: **20–30 per module** (this is exam prep — be question-heavy), all
  multiple_choice (FAA style: 3 options A/B/C), realistic and exam-representative,
  every `correct_answer` matching an option verbatim, with teaching explanations.
  Cover the airman-knowledge style (scenario questions, "you are operating...",
  chart/METAR interpretation questions phrased in words since images come later).
- Be ACCURATE and current per part107_spec.md. Multiple-choice distractors should be
  plausible (common misconceptions), not absurd.

Return a 4–6 line summary (counts). The JSON file is the deliverable.
