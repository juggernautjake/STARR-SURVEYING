# AI tutor — interactive practice problems in the chat

> **Created** 2026-07-03. Self-editing plan; update Status as slices ship. Do not
> mark DONE until it typechecks/lints and is committed. Branch
> `claude/sit-prep-buildout-2026-07-02`. Builds on the shipped AI-tutor feature
> (`AI_TUTOR_HIGHLIGHT_2026-07-03.md`, completed).

## Goal (user)
When the tutor suggests related problems, make them **clickable → the full problem
appears IN the chat**, where the student can **submit an answer** (multiple choice,
numeric, true/false, or written) and get **graded**. The tutor must be able to
**explain each problem and show the worked-out steps** when helpful. Add a
**"Try another like this"** to generate a fresh problem of the same kind. It must
**format well for any problem type** and stay intuitive + mobile-friendly.

## What already exists (reuse)
- `question_bank` rows: `question_type` (multiple_choice | numeric_input |
  true_false | fill_blank | short_answer/essay), `options` (jsonb), `correct_answer`,
  `explanation`, `tolerance`, `is_dynamic`, `template_id`, `module_id`, `tags`
  (incl. `genre:*`), `study_references`.
- Engine `lib/problemEngine.ts`: `dbRowToTemplate(row)` + `generateDynamicQuestion(row, template)`
  → `{ question_text, options, correct_answer, solution_steps, explanation, diagram }`.
  Static rows already carry answer/options/explanation.
- Grading convention (matches QuizRunner): MC = answer string equals `correct_answer`
  (which is one of the options); numeric = `|answer − correct| ≤ tolerance`.
- Diagrams render via inline SVG string (`diagram`) — reuse the messaging/tutor render.
- Shipped tutor: `DeeperLearningTutor.tsx` + `/api/admin/learn/ai-tutor`; the tutor
  already returns `relatedProblems: [{id, question_text, difficulty}]`.

## Design
- **Stateless grading:** a `fetch` returns the rendered problem WITHOUT the answer,
  plus an opaque `answerToken` = base64url(JSON({correct_answer, tolerance,
  question_type, explanation, solution_steps})). The client echoes the token +
  the student's answer to `grade`; the server decodes + scores. (Self-study tool —
  the token merely obfuscates the answer; acceptable, documented here.)
- **Any problem type** renders from one `ProblemCard`: MC→radios, true_false→2
  radios, numeric_input→number field, fill_blank/short_answer/essay→textarea.
- **Worked steps + explanation** come from the engine (`solution_steps`,
  `explanation`); shown after submit. An **"Explain with AI"** button hands the
  problem + the student's answer to the existing ai-tutor route for a step-by-step
  walk-through in the same chat.

## Slices
| # | What | Status |
|---|---|---|
| **P1** | `POST /api/admin/learn/tutor-problem` — actions `fetch` (id → rendered problem + answerToken, answer hidden), `grade` (token+answer → {correct, correctAnswer, explanation, solutionSteps}), `another` (id → a fresh problem of the same kind: same template if dynamic, else another `question_bank` row sharing the module + a `genre:*` tag). Handles static + dynamic + all question types. | **DONE** — fetch/grade/another; static+dynamic; all types; answerToken |
| **P2** | `ProblemCard.tsx` — renders any question type (MC/true-false radios, numeric field, textarea), Submit, result banner (✓/✗ + correct answer), collapsible **worked steps** + explanation, diagram, **"Explain with AI"**, **"Try another like this"**. | **DONE** — any type, grade, worked steps, explain/another buttons |
| **P3** | Refactor `DeeperLearningTutor` thread to an ordered `items` list (chat messages + problem cards interleaved); make each suggested-problem chip clickable → append a `ProblemCard`; keep the chat + cards scrolling together. | **DONE** — unified thread; suggestions tap → card interleaved with chat |
| **P4** | "Explain with AI" / worked-steps wiring — button posts the problem context + student's answer to `/api/admin/learn/ai-tutor` (extend it to accept an optional `problemContext`) and appends the reply into the thread. | **DONE** — "Explain with AI" reuses ai-tutor route (full problem context) |
| **P5** | CSS + responsive polish for the ProblemCard (radios, inputs, result colors, steps disclosure) on desktop + phone; keep the drawer usable. | **DONE (card CSS)** — radios, inputs, result colors, steps disclosure, responsive |
| **P6** | Written/essay grading — use the existing `/api/admin/learn/ai-grade` route for a rubric-style score + feedback, or graceful self-assessment when no reference answer. | **DONE** — written answers → "Get AI feedback" grades via the tutor (correct/missing/ideal) |
| **V1** | **Voice output (TTS):** a 🔊 "Read aloud" toggle in the tutor that speaks each AI reply via the browser `speechSynthesis` API (pick a clear en-US voice; strip markdown before speaking; stop on close). Free, client-side, no key. | **DONE** — 🔊 read-aloud toggle via speechSynthesis; mute/close/unmount stop it |
| **V2** | **Voice input (STT):** a 🎤 mic button on the composer that dictates into the input via `SpeechRecognition`/`webkitSpeechRecognition` (Chrome/Edge; hide gracefully where unsupported); interim + final transcript; tap again to stop. | **DONE** — 🎤 mic dictation (interim+final), pulsing state, hidden when unsupported |
| **V3** | Voice polish: "conversation mode" (auto-read replies + auto-listen after speaking for hands-free back-and-forth), a mute control, and clear unsupported-browser fallback. (Higher-fidelity server TTS e.g. ElevenLabs/OpenAI = optional future, needs a key.) | **DONE** — 🎧 hands-free mode: auto-read reply then auto-listen (echo-safe); server TTS deferred |

## Discovery log
- _(start)_ Reuse problemEngine (`generateDynamicQuestion` gives worked `solution_steps`)
  + question_bank; grade server-side via an echoed answerToken; render every type
  from one ProblemCard; "Explain with AI" reuses the ai-tutor route.
