# FS modules — click a highlighted term for a definition popup

> **Created** 2026-07-03. Self-editing plan. Branch `claude/sit-prep-buildout-2026-07-02`.

## Goal (user)
In the FS exam-prep modules, make **highlighted words/concepts clickable** → a
clear definition in a **stylized tooltip-style popup with a close button**.

## Approach
"Highlighted" = the **bold** key terms already in the content (`**term**` →
`<strong>`). Make those clickable with a subtle affordance (dotted underline).
On click, show a small anchored popup with the definition + a close button.
Definition source: a **curated FS glossary** (instant, accurate) with an **AI
fallback** (`/api/admin/learn/define`) for any term not in the glossary — so
*any* highlighted word works. Popup closes via its × button, outside-click, or Esc.

## What exists (reuse)
- FS page `renderMarkdown()` bolds at two spots (lines ~127 table-inline, ~186
  main): `.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')`.
- `handleContentClick` (line ~78) already does event-delegation on the content
  div (opens the MediaViewer for figures) — extend it for `.fs-term` clicks.
- Two content divs render markdown (lines ~368 with handler, ~372 without).

## Slices
| # | What | Status |
|---|---|---|
| **G1** | Curated `lib/learn/fsGlossary.ts` — ~70 key FS terms → concise, accurate definitions; `lookupTerm()` (normalized, alias-aware). | **DONE** |
| **G2** | `POST /api/admin/learn/define` — AI fallback: accurate 1–3 sentence definition of a surveying term (module context), no fabrication; 503 without key. | **DONE** |
| **G3** | `TermDefinitionPopup.tsx` — stylized anchored popup: term title, definition (glossary instant, or AI with a loading state), close button; outside-click + Esc close. | **DONE** |
| **G4** | Wire into the FS page: tag bold as `<strong class="fs-term">`, extend `handleContentClick` to open the popup at the clicked term (glossary-first → AI), add the handler to both content divs, CSS (dotted-underline affordance + popup). | **DONE** |
| **G5** | Verify visually (desktop + mobile); ensure it doesn't interfere with figure tap-to-zoom. | **DONE** |
