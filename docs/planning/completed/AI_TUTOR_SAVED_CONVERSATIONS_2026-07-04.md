# AI tutor — saved conversations, history menu, and safe open/close

> ✅ **COMPLETED 2026-07-04.** Conversations persist to learn_tutor_conversations
> (auto-save + on close); a 🕘 history menu opens/deletes past chats; the panel is a
> non-modal drawer so a stray click never loses it; the launcher is a menu with
> "Open a chat" / "Highlight & explore" / "Past conversations". tsc clean;
> committed + pushed. Moved to completed/.

> **Created** 2026-07-04. Self-editing plan. Branch `claude/sit-prep-buildout-2026-07-02`.

## Goal (user)
- Clicking off the panel currently **closes it and loses the conversation** — stop that.
- **Save conversations** so they can be **reopened and reviewed** later while studying.
- Keep the highlight-to-explore entry, but also a plain **"open chat / start a
  conversation"** entry.
- A **menu button** that reveals **all previous chats** to browse / reopen / delete.
- Create DB storage as needed.

## Design
- **Storage:** one table `learn_tutor_conversations` (per-user), thread stored as
  JSONB (message items only — the conversation text, for review). Timestamps +
  a derived title + topic + module context. Applied to live Supabase.
- **API** `/api/admin/learn/tutor-conversations`: GET list (user's, newest first),
  GET `?id=` one, POST upsert (save on each assistant reply + on close), DELETE `?id=`.
  Auth = signed-in user; rows scoped to `user_email`.
- **Non-destructive close:** the panel becomes a **non-modal side drawer** — no
  full-screen scrim swallowing clicks; you can read the lesson beside it. Close is
  the × (which saves). So nothing is lost on a stray click.
- **History menu:** a 📋 button in the header + on the launcher opens a list of past
  conversations (title, topic, when); click loads it; trash icon deletes.
- **Start fresh:** launcher offers "Open chat" (general conversation, no highlight)
  in addition to "Highlight & explore".

## Slices
| # | What | Status |
|---|---|---|
| **H1** | Seed `learn_tutor_conversations` table (jsonb thread, user_email, title, topic, module, timestamps, index); apply to live Supabase. | **DONE** — table applied + verified live |
| **H2** | API `GET/POST/DELETE /api/admin/learn/tutor-conversations` (list/get/save/delete, user-scoped). | **DONE** — list/get/save/delete, user-scoped |
| **H3** | Client persistence: keep `conversationId`; auto-save (debounced) on each assistant reply + on close; derive a title from the topic/first message. | **DONE** |
| **H4** | Non-destructive close: drop the modal scrim so an outside click never loses the chat; keep × (saves) + Esc off the destructive path (Esc closes but it's saved). | **DONE** |
| **H5** | History menu: 📋 button → panel listing past conversations; open loads thread; delete removes. | **DONE** |
| **H6** | Launcher menu: "Open chat" (start a general conversation with no highlight) + "Highlight & explore" + "Past conversations". | **DONE** |
| **H7** | CSS + verify (desktop + mobile); ensure highlight flow + resize + top-scroll still work. | **DONE** |
