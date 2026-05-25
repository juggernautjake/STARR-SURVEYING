# AI Chat Consolidation — One Right-Docked Tabbed Panel

**Status:** IN-PROGRESS
**Goal:** A single, consistent, right-docked AI chat with multiple conversation
tabs (auto-named from the first request, user-renamable, closable). The panel
can also be **undocked and moved/resized like a modal**. Every "Ask AI" entry
point routes into it. Conversations keep their full context and survive
reloads, and the user can **always attach an image or file** for the AI to
analyze.

**Resolves (user reports):** "Whenever I start an AI chat it should be on the
right side unless I move it. Sometimes two chat boxes open for no reason —
consolidate to one consistent box." + "Conversations get cut short and forget
all previous context — they need to keep going." + (chosen end state) "an
all-in-one right-docked panel with conversation tabs, dynamically named from
the first request, renamable and closable." + "Make the docked sidebar also
undockable and movable like a modal." + "Always let me upload images/files for
the AI to analyze — there should be an add file or image button."

---

## Decision locked with the user

- Build **one new right-docked panel** that merges the drawing chat + copilot
  asks + element-scoped asks, with **conversation tabs**: each tab is
  auto-named from the focus of its first request, can be renamed, and can be
  closed. Retire the three existing chat surfaces.
- The panel can be **docked (right) or undocked (free-floating)** and, when
  floating, moves/resizes like a modal. Dock state + geometry persist.
- An **attach image/file** button is always present in the composer; attached
  images are sent to the model for vision analysis.

---

## Current state

- Multiple independent chat surfaces, all mountable at once (root cause of "two
  boxes"):
  - `DrawingChatPanel.tsx` (right-docked) + `drawing-chat-store.ts` (in-memory,
    single conversation, no persistence).
  - `InlineAIChat.tsx` (floating popup, local state) — opened by `cad:openInlineAI`
    from right-click "Ask AI about this…".
  - `AICopilotSidebar.tsx` + `ai-store.ts` (`isCopilotSidebarOpen`,
    `copilotChat`, `openCopilotWithPrompt`).
  - `ElementExplanationPopup.tsx` embeds its own chat.
- Entry points: MenuBar "AI drawing chat…", AISidebar "Assistant" tab, hotkey
  Ctrl+Shift+C (opens copilot), right-click "Ask AI about this…" (feature +
  layer), all in `CADLayout.tsx` mount block.

### Already shipped

- [x] Engine continuity fix: `drawing-chat.ts` + `element-chat.ts` now send a
  real multi-turn Anthropic `messages` array (context in the system prompt) and
  window to the last 40 messages, so long conversations keep earlier context.

---

## Design

**New store `lib/cad/store/ai-conversations-store.ts`** (Zustand + `persist`):

- `conversations: Conversation[]` where `Conversation = { id, title,
  titleIsAuto, scope, messages, createdAt }`.
- `activeId`, `isOpen`, `dock` ('right' default | 'float') + `panelRect` (for
  the floating move/resize geometry) + `dockedWidth`, persisted to
  `localStorage`. A dock/undock toggle in the header flips `dock`.
- Actions: `openWith({ scope, seedPrompt })` (creates or focuses a tab),
  `newConversation`, `closeConversation`, `renameConversation`,
  `setActive`, `send`, `applyAction`, `open/close/toggle`.
- Auto-title: derive from the first user message / scoped element on first send;
  `titleIsAuto` flips false once the user renames.
- Routing helper so existing entry points call one function.

**New component `AIChatDock.tsx`** (replaces DrawingChatPanel + InlineAIChat +
AICopilotSidebar usage):

- **Docked mode:** pinned right, full-height, resizable width (`dockedWidth`).
  **Floating mode:** rendered via `ModalFrame` (drag + resize + persisted rect).
  A header dock/undock button toggles between the two.
- Tab strip: one chip per conversation with inline rename (double-click) and an
  X per tab; "+" opens a new conversation.
- Body reuses the existing message-list UI from `DrawingChatPanel`, with an
  upgraded composer: a text area plus an **attach image/file** button
  (paperclip). Attachments preview as thumbnails/chips above the input and can
  be removed before send.

**Image/file upload + vision:**

- Composer accepts images via the attach button (and ideally paste/drag-drop).
  Images are read as base64 and sent as Anthropic image content blocks
  alongside the text in the user turn; the engine
  (`drawing-chat.ts`/`element-chat.ts` or a shared chat handler) must accept
  `content` blocks, not just a string. Non-image files (e.g. PDF/CSV) are
  attached as text/document context where supported, or rejected with a clear
  message otherwise.
- Enforce reasonable per-image size/count limits client-side; show upload
  state and errors inline.

**Migration:** point every entry point (MenuBar, AISidebar, hotkey,
right-click "Ask AI") at `openWith(...)`; stop rendering the old three surfaces
in `CADLayout`; keep `ElementExplanationPopup`'s "why" explanation but route its
chat into a scoped conversation. Delete dead stores/components once unreferenced.

---

## Action items

- [x] Engine continuity fix (multi-turn messages + windowing).
- [x] `ai-conversations-store.ts` — persisted (zustand `persist`)
  multi-conversation store: open/close/toggle, dock/undock + `panelRect` +
  `dockedWidth`, `openWith`, new/close/rename/setActive, `send` (auto-titles the
  tab from the first request, forwards the full transcript to the drawing-chat
  engine), and ported `applyAction` (title-block / setting / regenerate). Pure
  helpers `deriveConversationTitle` + `pickNextActiveId` unit-tested (7 tests).
- [ ] `AIChatDock.tsx` — right-docked, draggable/resizable, tab strip with
  rename + close + new, message list + composer.
- [ ] Dock/undock toggle: floating mode renders through `ModalFrame` (drag +
  resize + persisted rect); docked mode pins right with resizable width; the
  chosen mode + geometry persist.
- [ ] Composer attach image/file button (always visible): base64 read,
  thumbnail/chip previews, removable before send; paste + drag-drop where
  feasible; client-side size/count limits.
- [ ] Engine: accept Anthropic image content blocks in the user turn so
  attached images are analyzed (vision); extend the chat request/response
  types + the API route accordingly; keep multi-turn + windowing intact.
- [ ] Route MenuBar "AI drawing chat…", AISidebar Assistant tab, and the
  Ctrl+Shift+C hotkey into `openWith`.
- [ ] Route right-click "Ask AI about this…" (feature + layer) into a scoped
  conversation in the dock; remove the floating `InlineAIChat` mount.
- [ ] Remove `AICopilotSidebar` + `DrawingChatPanel` mounts; migrate any unique
  copilot proposal UI into the dock or preserve it explicitly.
- [ ] Persistence + single-instance guarantee: only the dock ever renders; only
  one panel can be open; reload restores conversations + panel rect.
- [ ] Delete now-dead stores/components (`drawing-chat-store` if fully
  superseded, `InlineAIChat`, etc.) and fix imports.

---

## Definition of done

Exactly one chat panel exists, right-docked by default but undockable into a
free-floating movable/resizable window; every "Ask AI" path opens or focuses a
tab in it; tabs auto-name, rename, and close; the composer always offers an
attach image/file button and attached images are analyzed by the model;
conversations retain full context and survive reload; no second chat box can
appear.

## Risks / verification

- Largest change; touches several stores + `CADLayout` mount block. Land the
  store first (unit-testable), then the dock, then route entry points one at a
  time, deleting old surfaces last.
- Live chat round-trips and docking need manual browser QA (not available
  here); store logic is unit-tested; each slice type-checks + lints.
