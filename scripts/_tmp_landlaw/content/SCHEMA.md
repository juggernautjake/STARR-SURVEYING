# Content Output Contract — NMSU SUR 292 Land Law course

You are extracting & authoring course content for ONE module of a college-level
(NMSU SUR 292, Boundary/Land Law) course. Output **one JSON file** that strictly
matches the schema below. A generator script turns it into SQL — so the JSON must
be valid (no trailing commas, no comments, double-quoted keys/strings) and use the
exact field names here.

Write your file to: `C:\dev\STARR-SURVEYING\scripts\_tmp_landlaw\content\m<N>.json`
(replace `<N>` with your module number).

## Source priorities
1. Read EVERY assigned source PDF/handout fully (use the Read tool; for big PDFs
   read in page ranges). Extract the real teaching content — definitions, doctrines,
   rules, lists, examples, formulas. Do not invent facts not supported by the sources
   or well-established boundary-law principles.
2. Read `C:\dev\STARR-SURVEYING\scripts\_tmp_landlaw\content\texas_law.md` (a vetted
   Texas-law reference). Make the content **Texas-specific and compliant** — wherever
   Texas differs from general/common law, say so explicitly (use a `callout`).
3. The textbook is *Brown's Boundary Control and Legal Principles, 7th ed.* Align
   terminology with it.

## Difficulty / depth
College sophomore–junior surveying student. Rigorous but clear. Quizzes should make
a student think; include application/scenario questions, not just definitions.

## JSON schema (top level)
```json
{
  "module": {
    "order_index": 1,
    "title": "Module 1: ...",
    "description": "1–2 sentence catalog description.",
    "estimated_hours": 3.0,
    "learning_objectives": ["...", "..."],
    "textbook_chapters": "Brown ch. 1–3"
  },
  "lessons": [
    {
      "title": "Lesson title",
      "estimated_minutes": 25,
      "learning_objectives": ["..."],
      "blocks": [ <block objects, see below> ],
      "flashcards": [ {"term":"...", "definition":"...", "hint_1":"...(optional)"} ],
      "images_needed": [ {"slug":"m1-l1-fig1","caption":"What the diagram should show","kind":"diagram|map|photo|schematic"} ]
    }
  ],
  "quiz_questions": [
    {
      "lesson_index": 0,                      // which lesson (0-based) this belongs to; use null for module-level
      "question_text": "….",
      "question_type": "multiple_choice",      // multiple_choice | true_false | short_answer | numeric_input
      "options": ["A text","B text","C text","D text"],   // [] for short_answer/numeric_input; ["True","False"] for true_false
      "correct_answer": "exact correct option text",        // for MC must equal one option verbatim
      "explanation": "Why correct + why others wrong.",
      "difficulty": "easy|medium|hard"
    }
  ],
  "problem_templates": [ <only for computational modules; see below> ],
  "homework": [
    { "title":"Homework N", "prompt":"Multi-part applied assignment text (markdown ok).",
      "type":"computational|written|mixed", "images_needed":[ ... ] }
  ]
}
```

## Block objects (lesson_blocks). Use these block_type + content shapes EXACTLY:
- `{"block_type":"text","content":{"html":"<h3>Heading</h3><p>Rich teaching prose. 120–350 words. Use <ul><li>, <strong>, <em>.</p>"}}`
- `{"block_type":"callout","content":{"type":"info|warning|success|error","text":"Short emphasized note. Use type=warning for 'Texas differs:' notes."}}`
- `{"block_type":"key_takeaways","content":{"title":"Key Takeaways","items":["...","..."]}}`
- `{"block_type":"table","content":{"headers":["A","B"],"rows":[["1","2"],["3","4"]]}}`
- `{"block_type":"equation","content":{"latex":"A = \\frac{1}{2}|\\sum (x_i y_{i+1}-x_{i+1} y_i)|","label":"Shoelace area","display":"block"}}`
- `{"block_type":"accordion","content":{"sections":[{"title":"Case: Stafford v. King","content":"<p>HTML…</p>","open":false}]}}`
- `{"block_type":"link_reference","content":{"links":[{"url":"https://statutes.capitol.texas.gov/…","title":"Tex. Nat. Res. Code §21.001","type":"website","description":"Navigable stream definition"}]}}`
- `{"block_type":"image","content":{"url":"","alt":"alt text","caption":"Figure: …","alignment":"center"}}`  ← leave url:"" (placeholder) and ALSO add an entry to that lesson's images_needed.
- `{"block_type":"divider","content":{}}`

Each lesson: 5–10 blocks of real content. Start with a short intro `text` block,
develop the topic across several blocks (text/table/callout/equation/accordion),
end with a `key_takeaways` block.

## problem_templates (computational modules: conveyances, water, metes & bounds)
These power randomized practice/quiz questions. The engine evaluates `answer_formula`
and any `computed_vars[].formula` as JavaScript with these helpers available:
`sin,cos,tan,asin,acos,atan,atan2,sqrt,abs,pow,round(n,d),toRad(deg),toDeg(rad),
hypot,min,max,PI`, plus DMS helpers. Angles in the formulas are DEGREES unless you
convert with toRad(). `{{var}}` substitutes a value into question_template;
`{{var:f2}}` formats to 2 decimals; `{{var:dms}}` formats degrees as D°M'S".
Parameter `type` ∈ integer|float|angle_dms|bearing|choice|computed.

Example (excess/deficiency apportionment):
```json
{
  "name":"Proportionate distribution of record vs. measured distance",
  "category":"Boundary Law — Conveyances",
  "subcategory":"Apportionment",
  "difficulty":"medium",
  "question_type":"numeric_input",
  "question_template":"A block of {{n}} lots was platted, each with a record frontage of {{rec:f2}} ft (record total {{recTotal:f2}} ft). A resurvey finds the actual total measured distance between the original block corners is {{meas:f2}} ft. Using proportionate measurement, what is the corrected frontage (ft) of each lot?",
  "parameters":[
    {"name":"n","type":"integer","min":4,"max":10},
    {"name":"rec","type":"float","min":48,"max":60,"decimals":2},
    {"name":"surplus","type":"float","min":-3,"max":4,"decimals":2}
  ],
  "computed_vars":[
    {"name":"recTotal","formula":"n*rec"},
    {"name":"meas","formula":"recTotal+surplus"}
  ],
  "answer_formula":"meas/n",
  "answer_format":{"decimals":2,"unit":"ft","tolerance":0.05},
  "solution_steps_template":[
    {"step_number":1,"title":"Record total","formula":"n × record","calculation_template":"{{n}} × {{rec:f2}} = {{recTotal:f2}} ft"},
    {"step_number":2,"title":"Proportion factor","calculation_template":"{{meas:f2}} ÷ {{recTotal:f2}}"},
    {"step_number":3,"title":"Corrected lot frontage","result_template":"{{meas:f2}} ÷ {{n}} = {{_answer}} ft"}
  ],
  "explanation_template":"Proportionate measurement distributes the {{surplus:f2}} ft surplus/deficiency equally in proportion to record frontage: each lot becomes {{_answer}} ft.",
  "options_generator":{"method":"none"},
  "images_needed":[{"slug":"m4-apportion","caption":"Block of n equal lots with record vs measured total","kind":"diagram"}]
}
```
Provide 2–4 templates per computational module. Make the random ranges realistic and
ensure the math always yields a sensible, single correct number. For `numeric_input`
templates set `question_type":"numeric_input"` and `options_generator":{"method":"none"}`.

## Quantity targets (per module)
- 4–6 lessons, each 5–10 content blocks of real prose.
- 12–18 flashcards total.
- 18–28 quiz questions (mostly multiple_choice; a few true_false/short_answer; for
  computational modules include some numeric_input too).
- Computational modules: 2–4 problem_templates + 1–2 homework items.
- Non-computational modules: 1–2 homework items (written/applied).
- Add `images_needed` wherever a diagram/map would aid understanding (boundaries,
  conveyance order, riparian apportionment, metes-and-bounds traverse, court hierarchy).

Return only a short 4–6 line summary as your final chat message (counts of lessons/
blocks/flashcards/questions/templates). The real deliverable is the JSON file.
