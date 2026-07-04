# "Deeper learning with AI" — highlight-to-tutor for the learning platform

> **Created** 2026-07-03. Self-editing plan; update Status as slices ship. Do not
> mark a slice DONE until it typechecks/lints and is committed. Branch
> `claude/sit-prep-buildout-2026-07-02` (keeps FS work together; PR to main).

## Goal (user)
While studying, let the learner **highlight a word / sentence / passage** and open
a focused **AI conversation** about it — for deeper understanding. Flow: click a
**"Deeper learning with AI"** button → it asks the user to highlight → user
highlights (can re-highlight) → user clicks **"Take me deeper"** (NOT auto-start) →
a conversation thread opens, scoped to that text. The AI must:
- give **accurate, genuine** info (honest about uncertainty; no hallucinated facts),
- point to **reputable online resources** about the topic,
- point to **related practice problems / material on the platform** when relevant,
- support a full back-and-forth conversation.
Must be **cancelable/closable** and **intuitive**.

## Architecture (reuse existing AI infra)
- Anthropic SDK already present (`@anthropic-ai/sdk`), model `claude-sonnet-4-5`,
  pattern = `withErrorHandler` + `auth()` + 503 when `ANTHROPIC_API_KEY` unset
  (see `app/api/admin/cad/element-chat`, `learn/ai-grade`). Learn routes need only
  an authenticated user.
- Related practice: `question_bank` (+ `problem_templates`) filtered by `module_id`
  and keyword-matched to the highlighted text (reuse FS `genre:*` tags).

## Slices
| # | What | Status |
|---|---|---|
| **T1** | API route `POST /api/admin/learn/ai-tutor` — accepts {highlightedText, module ctx, messages[]}; builds a rigorous tutor system prompt; fetches related practice problems from the DB; calls Claude; returns {reply, relatedProblems}. 503 without key. | **DONE** — accuracy-first prompt + related-problem lookup + 503 guard |
| **T2** | `AITutorPanel` — side drawer chat UI: shows the highlighted excerpt, message thread, input, related-problem links, close. Reuses the messaging chat styling idiom. | **DONE** — chat drawer, topic chip, markdown replies, related-problem card |
| **T3** | `DeeperLearningTutor` — launcher button + highlight-mode banner + floating "Take me deeper" on selection (re-highlightable, explicit start) + cancel; orchestrates the panel. | **DONE** — launcher + banner + floating "Take me deeper" + cancel/Esc |
| **T4** | Wire into the FS module page (`.../sit/module/[id]`); works on all study tabs. Mobile-responsive. | **DONE** — wired into FS module page (all tabs); responsive |
| **T5** | Polish: loading/typing state, error banner (AI offline), keyboard (Esc closes), accuracy guardrails in the prompt, resource links open new tab. | **DONE** — typing state, error banner, Esc close, safe markdown, accuracy prompt, resources |
| **T6** | (Optional) generalize to other learn surfaces (lesson pages) if cheap. | **DONE** — wired into the general lesson pages too; prompt broadened to all surveying |

## Discovery log
- _(start)_ Reuse element-chat pattern; learn auth = any signed-in user; model claude-sonnet-4-5.
