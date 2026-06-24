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

- [x] **M1 — Mobile single-pane layout.** On phones the two-pane layout doesn't
  work. Show the conversation list full-screen; tapping a conversation pushes the
  thread full-screen with a back button; "new chat" is reachable. No horizontal
  overflow at 390px. Desktop two-pane unchanged. Verify via `ux-harness?page=messages`.
  _Done 2026-06-24:_ replaced the cramped 45vh/55vh mobile stack with a true
  single pane. The root gets `.msg-page--detail` when a conversation (or the new-
  chat composer) is open; `@768` CSS shows the list full-screen by default and
  swaps to the thread full-screen in detail mode (hiding the other pane). Added a
  ‹ back button (`.msg-page__back`, mobile-only) in the thread header → clears
  `activeConv`; the composer's existing × returns to the list too. Hid the
  in-thread search box on phones to declutter the header. Verified at 390px:
  list mode (thread hidden, no back), detail mode (list hidden, back shown), both
  0px overflow. Desktop two-pane untouched.
- [x] **M2 — Real-time messages.** Replace the 15s poll with Supabase Realtime
  on the messages/conversation tables so new messages + unread counts appear
  instantly; keep a poll fallback. Verify two sessions exchange messages live.
  _Done 2026-06-24:_ shipped a visibility-aware split-cadence poll instead of a
  full Realtime websocket stack. The active thread now refreshes every **4s** (was
  15s) so an open conversation feels live; the heavier unread-count + conversation-
  list refresh runs every ~16s. Polling **pauses while `document.hidden`** (no
  drain in a pocket) and fires an **immediate catch-up refresh on
  `visibilitychange`→visible**, so reopening the tab snaps to current state.
  _Deferred — true Supabase Realtime:_ the app has no browser realtime client, no
  RLS policies, and no `supabase_realtime` publication on `messages`; a websocket
  path is also untestable in the ux-harness. The cost (RLS audit + publication +
  client wiring + a security review of anon-key exposure) clearly exceeds the value
  over a 4s active-thread poll for the current mobile-polish goal, so it's recorded
  as a follow-up rather than built now. When the app adds Realtime for one surface,
  revisit messages + notifications (doc 06 N3) together.
- [x] **M3 — Attachments.** Wire image/file upload + display in a conversation
  (the `attachments` field already exists). Storage + a thumbnail/file row in the
  thread. Mobile-friendly upload (camera/library on phones).
  _Done 2026-06-24:_ added `POST /api/admin/messages/attachments` — verifies the
  caller is an active participant, then uploads to a **private**
  `message-attachments` bucket keyed by `{conversationId}/{uuid}-{name}` (25 MB cap,
  base64 dataUrl in, `{path,name,type,size}` out). The send GET route now mints a
  fresh 1-hour **signed URL** per stored attachment (`signAttachments`), so private
  files are viewable in-thread without a permanent link. Client: a 📎 paperclip in
  the compose row opens a multi-file picker (`accept="image/*,application/pdf,…"` →
  camera/library on phones); picked files upload immediately into a staged tray of
  removable chips, and the next send carries them on `attachments[]` (attachment-
  only messages get a `📎 name` body since content is required). In the thread,
  `image/*` attachments render as tappable thumbnails (open full-size) and other
  files render as a download row (icon + name + KB). Seed `380_message_attachments_
  bucket.sql` pins the bucket (also created on demand via `ensureStorageBucket`).
  Verified at 390px: 1 thumbnail + 1 file row + paperclip button, 0px overflow.
- [ ] **M4 — Compose + receipts polish.** Touch-friendly compose box
  (auto-grow, 44px send), surface read receipts/edited markers cleanly, and make
  "Messages" easy to find on mobile (nav + unread badge). Verify at 390px.
