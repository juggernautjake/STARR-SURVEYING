# Category 14 — Communication & team widgets

*Part of the Hub Widget Excellence plan (`…-00-master-…`). Widgets:
**messages, open-discussions, mentions-inbox, recent-announcements,
team-status**. Each: Build/Wire + 4 audit rounds. These tie into the
notification/unread reconciliation in Foundation Doc 03.*

---

## messages
- **Endpoint:** `/api/admin/messages/conversations?limit=…`. Fields:
  id, title, last_message_at, last_message_preview, unread_count,
  is_group, is_external.
- **Track (matches the sketch's Messages list):** conversation title,
  last message preview, time, unread dot, group/external flag.
- **Per-bucket:** tiny → unread count; small → sender/title + time;
  medium → + preview; large+ → + group/external badges + more rows.
- **Footer link:** "Go to messages →" `/admin/messages`.
- **Row deep link:** → `/admin/messages/{conversationId}`.
- **Editor:** includeGroups, senderFilter, markAsReadOnView,
  showPreview, messageLimit.
- **Notifications:** new message / mention (reconcile with bell which
  excludes DMs — Doc 03 Slice 4).
- **Slices:** Build/Wire (footer link + row deep links + unread dots
  per sketch) + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** R1: the
  conversations GET returns `{ conversations }` (raw rows +
  participants) — id/title/last_message_at line up, but the group flag
  is the `type` column ('group'), not `is_group` (so the group badge +
  include-groups filter never fired). **Row deep links** (the headline):
  each row is now a `next/link` to `conversationHref(c.id)` →
  `/admin/messages/{id}`; a new pure exported `toConversation(c)`
  normalizes `is_group` from `type`. The widget was otherwise complete
  (unread dot + tiny count, preview, filters, editor). Footer "Go to
  messages →" is global. 2 specs. Full hub suite (1626) green; typecheck
  + lint clean. (`unread_count` isn't computed by this endpoint — the
  widget degrades to the conversation count; per-conversation unread
  needs read-receipt aggregation, flagged.) **messages is done.**

## open-discussions
- **Endpoint:** `/api/admin/messages/conversations?limit=20`. Fields:
  id, title, unread_count, last_message_at, last_sender_email,
  has_mention.
- **Track:** discussion, unread, last sender, time, mention flag.
- **Per-bucket:** tiny → open count; small → title + unread; medium+ →
  + last sender + mention chip.
- **Footer link:** "Go to discussions →" `/admin/discussions`.
- **Row deep link:** → `/admin/discussions/{id}`.
- **Editor:** scope.
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found the
  widget read the messages conversations API, but discussions are a
  SEPARATE feature** — `/api/admin/discussions?status=open` returns
  `{ threads }` (`discussion_threads` rows with title/status/created_at)
  with its own `/admin/discussions/{id}` page. So the widget's
  `unread_count`/`has_mention`/`last_sender_email` were all phantom.
  **Realigned:** fetch the discussions endpoint + map via a new pure
  exported `toDiscussion(t)` (strips the stored "[Discussion] " title
  prefix, defaults status). **Row deep links** to
  `/admin/discussions/{id}`; medium+ shows a non-open status chip +
  relative time. The scope editor is now open/all (the data's real
  axis), replacing the phantom mine/mentions. Footer "Go to discussions
  →" is global. 2 specs. Full hub suite (1624) green; typecheck + lint
  clean. **open-discussions is done.**

## mentions-inbox
- **Endpoint:** `/api/admin/messages/mentions`. Fields: id, message_id,
  conversation_id, conversation_title, author_email, body_preview,
  created_at.
- **Track:** who mentioned you, where, preview, when.
- **Per-bucket:** tiny → mention count; small → author + conversation;
  medium+ → + preview + time.
- **Footer link:** "Go to messages →" `/admin/messages`.
- **Row deep link:** → `/admin/messages/{conversation_id}` (jump to the
  mentioning message where the API supports an anchor).
- **Editor:** dateRange.
- **Notifications:** mention → bell/reminder (Doc 03).
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found
  `/api/admin/messages/mentions` didn't exist** (no mentions table) →
  the widget always showed empty. **Built the minimal mentions
  endpoint** — it scans recent messages in the caller's conversations
  (from other senders) for the user's @-handle via the pure
  `lib/messages/mentions.ts` → `detectMentions(messages, email,
  titleByConv)` (matches `@{email}` or `@{local-part}`,
  case-insensitive) + `mentionHandles(email)`; the route enriches with
  the conversation title. **Row deep links** to
  `conversationHref(conversation_id)` → `/admin/messages/{id}`. The
  widget's date-range filter + count render were already fine. Footer
  "Go to messages →" is global. 3 specs (handles, detect + enrich +
  case-insensitive + blank-email guard). Full hub + messages suites
  (1624) green; typecheck + lint clean. **mentions-inbox is done.**

## recent-announcements
- **Endpoint:** `/api/admin/announcements?limit=…`. Fields: id, title,
  body, author, created_at, unread.
- **Track:** title, body snippet, author, time, unread.
- **Per-bucket:** tiny → unread count; small → title + time; medium+ →
  + snippet + author.
- **Footer link:** "Go to announcements →" `/admin/announcements`.
- **Row deep link:** → announcement detail if one exists, else the
  list (R2).
- **Editor:** unreadOnly, itemLimit.
- **Notifications:** new announcement → notify (Doc 03).
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found the
  announcements GET returns `{ releases }`** — the org's visible
  platform release notes (`version` / `release_type` / `notes_markdown`
  / `published_at`), NOT `{ announcements }` with title/body/author. The
  "announcements" in this app ARE the release notes. **Realigned:** read
  `data.releases` + map via a new pure exported `toAnnouncement(r)`
  (title `Feature · v4.8`, body = first stripped line of the notes via
  `notesPreview`, time = published_at). The widget's unreadOnly filter +
  itemLimit + render were already fine (unread isn't tracked on
  releases, so unreadOnly shows nothing — graceful). Footer "Go to
  announcements →" is global (no per-release detail page, so rows aren't
  separately linked). 4 specs (toAnnouncement map + version fallback,
  notesPreview). Full hub suite (1627) green; typecheck + lint clean.
  **recent-announcements is done.**

## team-status
- **Endpoint:** `/api/admin/team/status`. Fields: user_email,
  user_name, role, shift, status, since.
- **Track:** member, role, shift, status (working/off/break), since.
- **Per-bucket:** tiny → on-shift count; small → name + status dot;
  medium+ → + role + shift + since; group-by status.
- **Footer link:** "Go to team →" `/admin/team`.
- **Row deep link:** → `/admin/team/{email}`.
- **Editor:** groupBy.
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 found
  `/api/admin/team/status` was a `{ members: [] }` stub** (it was
  awaiting a never-built server-side active-clock table) — so the widget
  always rendered "No one's clocked in". There's no live-clock state on
  the server, but today's `daily_time_logs` are a real "who's working
  today" signal. **Wired the real endpoint:** query `daily_time_logs`
  where `log_date = today` (UTC), de-dupe emails, join
  `registered_users` (email/name/roles) and map via a new pure exported
  `lib/team/status.buildTeamStatus(todayLogs, roster)` — anyone who
  logged time today surfaces as `clocked-in` with name + first role
  (graceful nulls when off-roster). **Row deep links** (the headline):
  each member row is now a `next/link` to `teamMemberHref(email)` →
  `/admin/team/{email}`. The widget's tiny-count, group-by, skeleton, +
  editor were already fine. Footer "Go to team →" is global. The old
  stub-endpoints spec's `{ members: [] }` assertion was retired (the
  route hits the DB now); its 401 guard moved to the still-stubbed
  weather route. 5 new specs for `buildTeamStatus` (active→clocked-in,
  dedupe + trim + order, off-roster nulls, blank/empty guard, empty
  roles → null role). Full hub suite (1627) green; typecheck + lint
  clean. **team-status is done.**

## Doc 14 complete
All 5 communication & team widgets shipped (Build/Wire + Rounds 1–4):
**messages, open-discussions, mentions-inbox, recent-announcements,
team-status**. R1 in each case exposed a data mismatch and fixed it
honestly: messages' group flag is the `type` column (not `is_group`);
open-discussions reads the *separate* discussions feature
(`/api/admin/discussions` → `{ threads }`), not the messages API;
mentions-inbox + team-status both had endpoints that were missing/stubs
and now hit real data (a `messages.content` @-scan and today's
`daily_time_logs` respectively); recent-announcements' "announcements"
are the platform release notes (`{ releases }`). Every list row now deep
links (conversation / discussion / mentioning message / teammate
profile) and the global "Go to …" footer is wired. New pure helpers —
`toConversation`, `toDiscussion`, `lib/messages/mentions`,
`toAnnouncement`/`notesPreview`, `lib/team/status.buildTeamStatus` — are
each unit-tested. Full hub suite green throughout; typecheck + lint clean.

## Guardrails
- Unread counts in these widgets must reconcile with the
  notification/message sources (Doc 03 Slice 4) — no divergent counts.
- Respect tenancy: team-status + messages only show the user's org +
  conversations they're a member of.
