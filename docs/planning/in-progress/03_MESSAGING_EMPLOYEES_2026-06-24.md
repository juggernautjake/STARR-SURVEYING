# Messaging Employees — Build-Out & Mobile

**Status:** 🟡 In progress — internal chat exists (polling, desktop two-pane);
needs mobile single-pane + real-time + attachments.

## How this doc is driven

Stop-hook driven (`.claude/hooks/continue-until-planning-done.sh`): next
unchecked slice → read live code → smallest shippable change → typecheck + lint +
commit + push → check box + note. All boxes `[x]` → move to `completed/`. Keep
desktop intact; verify mobile at 390px.

## Current state (verified 2026-06-24)

- UI: `app/admin/messages/page.tsx` (desktop two-pane: conversation list +
  thread). APIs: `app/api/admin/messages/{send,conversations,contacts,read,search}/route.ts`.
- Send / edit / soft-delete messages, start direct/group chats, unread badges,
  search. **Polls every 15s** (no realtime). `attachments` exists in the schema
  but there is no upload/display UI.

## Slice plan

- [ ] **M1 — Mobile single-pane layout.** On phones the two-pane layout doesn't
  work. Show the conversation list full-screen; tapping a conversation pushes the
  thread full-screen with a back button; "new chat" is reachable. No horizontal
  overflow at 390px. Desktop two-pane unchanged. Verify via `ux-harness?page=messages`.
- [ ] **M2 — Real-time messages.** Replace the 15s poll with Supabase Realtime
  on the messages/conversation tables so new messages + unread counts appear
  instantly; keep a poll fallback. Verify two sessions exchange messages live.
- [ ] **M3 — Attachments.** Wire image/file upload + display in a conversation
  (the `attachments` field already exists). Storage + a thumbnail/file row in the
  thread. Mobile-friendly upload (camera/library on phones).
- [ ] **M4 — Compose + receipts polish.** Touch-friendly compose box
  (auto-grow, 44px send), surface read receipts/edited markers cleanly, and make
  "Messages" easy to find on mobile (nav + unread badge). Verify at 390px.
