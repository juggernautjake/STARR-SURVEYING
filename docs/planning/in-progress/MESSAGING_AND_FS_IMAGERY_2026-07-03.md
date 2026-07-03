# Messaging overhaul + FS-module imagery — self-editing build plan

> **Created** 2026-07-03. **This is a DYNAMIC, self-editing plan.** As slices
> ship, update the Status tables. As new gaps/bugs surface, append to the
> Discovery log and add a slice. Do not mark a slice DONE until it typechecks,
> is verified (screenshot / DB query / render check), and is committed. Keep
> refining until the messaging experience is **phenomenal, intuitive, and easy
> to use on desktop, tablet, and phone**, and until every FS module is richly
> and correctly illustrated. When every action item is shipped or explicitly
> deferred (cost > value, with a one-line reason), move this doc to `completed/`.
>
> **Branches (PR workflow — never push to main):**
> - Track A (FS imagery): `claude/sit-prep-buildout-2026-07-02` (continues the FS work).
> - Track B (messaging): `claude/messaging-overhaul-2026-07-03` (off main).
>
> **User intent (verbatim asks distilled):**
> - Messaging: "seen" read receipts + check marks; send pictures, videos, mp3/mp4,
>   website links, more emojis; a built-in image/video **viewer/player** with
>   **zoom**; links open in a **new browser tab** on click; works on **all screen
>   sizes** — desktop, tablet, phone (verify mobile). Reuse an existing viewer if
>   one exists (there isn't a reusable one — see Discovery). Make it phenomenal.
> - FS imagery: pull imagery/graphs/diagrams from the saved resources AND the
>   internet AND **generate** original images where needed; **evaluate each image
>   to make sure it looks good**; disperse examples + imagery throughout every FS
>   module to show what's going on.

---

## Track A — FS module imagery

**Baseline (2026-07-03):** 17 images live (11 authored SVG diagrams + 6 sourced
CC/PD photos) across modules 1–10; `renderMarkdown` now supports figures, HTML +
markdown tables, and inline SVG (formatting fix shipped). Copyright note: the
saved textbooks (Ghilani/Kavanagh/Engineering Surveying) are copyrighted and
their figures must NOT be reproduced on the app — instead **author faithful
original diagrams** modeled on them, and source **public-domain / CC** photos
from the internet. User approved generating images + evaluating each.

**Method for every image:** author SVG (or source PD/CC photo) → render/screenshot
it standalone → eyeball that it looks good and is accurate → inject into the
right module/section with a caption + credit → re-verify it renders in-context.

| Slice | What | Status |
|---|---|---|
| **A1** | Diagram: accuracy vs precision (4 targets) → module 1 concepts | **DONE** — module 1 |
| **A2** | Diagram: normal error curve w/ 68-95-99.7 bands → module 1 concepts | **DONE** — module 1 |
| **A3** | Diagram: full closed traverse (legs, closure) → module 4 | **DONE** — module 4 |
| **A4** | Diagram: earthwork average-end-area cross-section → module 5 | **DONE** — module 5 |
| **A5** | Diagram: GNSS trilateration / constellation → module 6 | **DONE** — module 6 |
| **A6** | Diagram: metes-and-bounds parcel (bearings+distances) → module 7 | **DONE** — module 7 |
| **A7** | Diagram: stereo overlap / aerial photo geometry → module 8 | **DONE** — module 8 |
| **A8** | Source 2–3 more PD/CC photos (contour map, plat, dumpy vs total station) | TODO |
| **A9** | Visual QA pass: screenshot every module body, confirm all figures look good in-context | TODO |

## Track B — Messaging overhaul

**Baseline (from investigation, 2026-07-03):**
- Data model (`seeds/314_messaging_tables.sql`): `conversations`,
  `conversation_participants` (has `last_read_at`), `messages` (has `attachments`
  JSONB, `reply_to_id`, `is_edited`, `is_deleted`), **`message_read_receipts`
  (message_id,user_email,read_at)**, `message_reactions`.
- Attachments ALREADY work: upload → `message-attachments` bucket (25MB, any
  MIME) via `app/api/admin/messages/attachments/route.ts`; stored in
  `messages.attachments` JSONB; served via 1-hour signed URLs; images render in a
  grid in `MessageBubble.tsx`; non-images are download links.
- Read data EXISTS but there is **no "Seen" UI**.
- Emojis: hardcoded 12–16 in `FloatingMessenger`/`ComposeBox`; reactions 6.
- Links: NOT auto-linkified; rendered `<a>` has no `target="_blank"`.
- No image lightbox/zoom, no inline video/audio player, no link previews.
- Realtime = polling (15s popup / 4s active thread). Responsive = partial CSS
  breakpoints (768/480), touch-ok buttons, no pinch-zoom.
- Surfaces: `FloatingMessenger.tsx` (popup), `app/admin/messages/page.tsx` (full
  page), shared `components/messaging/*` (MessageBubble, ComposeBox, etc.).

| Slice | What | Status |
|---|---|---|
| **B1** | "Seen" read receipts UI — show Sent/Delivered/Seen (+ avatars/✓✓) under my last sent message, from `message_read_receipts`/`last_read_at`; verify GET returns the data both surfaces need | TODO |
| **B2** | Built-in **MediaViewer** (reusable): image lightbox with **zoom + pan + pinch** (mobile) + fullscreen; inline **video** (`<video controls>`) + **audio** (`<audio>`) players; keyboard + touch close; used by MessageBubble | TODO |
| **B3** | Attachments: ensure the composer file inputs `accept` images/video/mp3/mp4; render video/audio inline in the bubble (thumbnail → opens MediaViewer); size/type guards + friendly errors | TODO |
| **B4** | **Linkify** URLs in message text + render as `<a target="_blank" rel="noopener noreferrer">` (both plain + rich); safe (no javascript: URLs) | TODO |
| **B5** | Link **previews** (OpenGraph title/desc/image) — server route fetches OG tags for the first URL; card under the message. (Defer if cost > value.) | TODO |
| **B6** | **Emoji picker** upgrade — categorized, searchable, a few hundred common emojis (curated list or lightweight lib), on both composers + reactions; keep it fast | TODO |
| **B7** | **Responsive/mobile** pass — messenger + full page + MediaViewer verified at phone (≤480), tablet (≤820), desktop; pinch-zoom images; safe-area insets; screenshot each | TODO |
| **B8** | Polish/intuitiveness pass — empty states, loading, hover/tap targets, scroll-to-bottom, "new messages" divider, send affordances; make it feel phenomenal | TODO |

---

## Discovery log
- _(start 2026-07-03)_ Investigation done (see baselines). Biggest leverage:
  read-receipt DATA already exists (B1 is UI-only); attachments already upload +
  images already render (B2/B3 add a viewer + video/audio, not the pipe).
- **No reusable image/video viewer exists** in the codebase (CAD's PixiJS
  CanvasViewport is domain-specific). So B2 builds a small standalone,
  reusable `MediaViewer` — usable by messaging now and anywhere later.
- **PDF figure extraction from the saved textbooks is not viable** (pdfimages/
  pdftoppm/gs/mutool all missing; pdfjs embedded-image extraction hangs) AND is
  copyright-unsafe. Resolution: generate original SVG diagrams (crisp, free) +
  source PD/CC photos; evaluate each visually before shipping.
