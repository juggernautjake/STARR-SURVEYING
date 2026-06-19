# Content contract — fleshing out an EXISTING curriculum module

You are filling in content for one EXISTING module of the Starr Surveying learning
platform whose lessons currently have titles but no body. You will be given the
module's `module_id` and its exact list of lessons (each with a stable `lesson_id`,
title, order). Author college-level, **Texas-aware** surveying content for each
lesson, plus flashcards, quiz questions, and (for computational modules) randomized
problem templates.

Read the vetted Texas reference first:
`C:\dev\STARR-SURVEYING\scripts\_tmp_landlaw\content\texas_law.md`
and the block/template shapes in
`C:\dev\STARR-SURVEYING\scripts\_tmp_landlaw\content\SCHEMA.md` (same block_type and
problem_template shapes apply here — reuse them exactly).

Audience: surveying students / interns (SIT level). Accurate, rigorous, practical.
Where Texas law differs from general practice, flag it with a `callout` (type
"warning"). Do not invent statutes/cases — only cite ones you are confident of
(the texas_law.md reference lists verified ones).

## Output: one JSON file
Write to `C:\dev\STARR-SURVEYING\scripts\_tmp_landlaw\existing\m<ORDER>.json` (use the
module's order_index). Strict valid JSON. Schema:

```json
{
  "order_index": 13,
  "module_id": "c100000d-0000-0000-0000-00000000000d",
  "title": "Boundary Law Principles",
  "lessons": [
    {
      "lesson_id": "<EXACT id you were given>",
      "title": "<the lesson title you were given>",
      "estimated_minutes": 30,
      "learning_objectives": ["...","..."],
      "key_takeaways": ["short point","short point"],
      "blocks": [ <block objects per SCHEMA.md: text/callout/key_takeaways/table/equation/accordion/link_reference/image> ],
      "flashcards": [ {"term":"...","definition":"...","hint_1":"(optional)"} ]
    }
  ],
  "quiz_questions": [
    { "lesson_id":"<id or null for module-level>", "question_text":"...",
      "question_type":"multiple_choice|true_false|short_answer|numeric_input",
      "options":["A","B","C","D"], "correct_answer":"exact option text",
      "explanation":"...", "difficulty":"easy|medium|hard" }
  ],
  "problem_templates": [ <only computational modules; exact shape from SCHEMA.md, include "category" and "difficulty"> ]
}
```

## Requirements
- Fill EVERY lesson you are given (match lesson_id exactly; do not invent lessons).
- Each lesson: 5–9 content blocks of real teaching prose (intro text → develop with
  text/table/callout/equation/accordion → final `key_takeaways` block). 120–320
  words per text block.
- 2–4 flashcards per lesson (so ~12–24 per module).
- 14–22 quiz questions total for the module (mostly multiple_choice; a few
  true_false/short_answer; numeric_input for computational modules). Every MC
  `correct_answer` must equal one option verbatim.
- Computational modules (math, measurements, traverse, area/volume, coordinates,
  GPS, leveling, construction, geodetic): include 2–4 problem_templates with
  realistic random ranges and formulas that yield a single sensible numeric answer
  (use the engine helpers: sin,cos,tan,toRad,sqrt,atan2,hypot,round, etc.).
- Add `image` blocks (url:"") where a diagram genuinely aids understanding.

Return only a 3–5 line summary (counts). The JSON file is the deliverable.
