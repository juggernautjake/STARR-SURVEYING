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
| **A8** | 4 more diagrams (units, curvature/refraction, slope reduction, grid vs ground) | **DONE** — modules 1/2/3/6 |
| **A9** | Visual QA pass: screenshot every module body, confirm all figures look good in-context | TODO |
| **A10** | **Overlap/formatting audit — CRITICAL:** zoom-check EVERY diagram for overlapping text/symbols, wrong size, wrong color vs background, clipping; fix all. Triple-check every number/label for accuracy. | IN PROGRESS |
| **A11** | Populate the ENTIRE course: add diagrams to any thin module/section (profile leveling, taping, angle sets, contours, curve stationing…) until every concept that benefits has a figure | TODO |
| **A12** | Copyright manifest `IMAGE_CREDITS.md` (CLEAR/ATTRIB/REVIEW/REPLACE) | **DONE** |
| **A13** | Every diagram: label all equipment/points/lines clearly; realistic, intuitive, helpful | IN PROGRESS |

### Consolidated user requirements (all prompts through 2026-07-03)
1. **Diagrams perfect:** no overlapping/ clipped/ overflowing text or symbols;
   correct size; readable color vs background; **all equipment, points, and lines
   labeled**; realistic + intuitive + helpful; every number/label **triple-checked**.
2. **Populate the ENTIRE FS course** with helpful images — generate originals +
   source PD/CC; personal-use capture OK if flagged in `IMAGE_CREDITS.md`.
3. **Messaging (Track B):** "seen" receipts + checkmarks; send pictures/videos/
   mp3/mp4/links; more emojis; built-in image/video/audio **viewer with zoom**;
   links open **new tab**; fully **responsive** (desktop/tablet/phone); phenomenal.
4. **DB equipped** for all of it (verified 2026-07-03).
5. **Build fully + triple-check**; keep going until complete, even past 3:30.

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
| **B1** | "Seen" read receipts UI — show Sent/Delivered/Seen (+ avatars/✓✓) under my last sent message, from `message_read_receipts`/`last_read_at`; verify GET returns the data both surfaces need | **DONE** — popup + MessageBubble; full page already had it |
| **B2** | Built-in **MediaViewer** (reusable): image lightbox with **zoom + pan + pinch** (mobile) + fullscreen; inline **video** (`<video controls>`) + **audio** (`<audio>`) players; keyboard + touch close; used by MessageBubble | TODO |
| **B3** | Attachments: ensure the composer file inputs `accept` images/video/mp3/mp4; render video/audio inline in the bubble (thumbnail → opens MediaViewer); size/type guards + friendly errors | TODO |
| **B4** | **Linkify** URLs in message text + render as `<a target="_blank" rel="noopener noreferrer">` (both plain + rich); safe (no javascript: URLs) | **DONE** — linkify + target=_blank hook |
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
- **Diagram QA (2026-07-03):** screenshot-reviewed ALL 22 authored diagrams
  (originals + both new batches) for correctness AND readability. All technically
  correct. Fixed: caption overflow (curvature-refraction), clipped factor labels
  (grid-ground → viewBox widened), a misleading "to scale" bar chart (survey-units
  now truly proportional + readable in-bar label), and a clipped gnss-heights
  caption. Batches injected → 28 image refs, 10/10 modules, 0 missing.
- **Copyright/licensing (2026-07-03):** added `public/lessons/fs/IMAGE_CREDITS.md`
  — every image flagged CLEAR / ATTRIB / REVIEW(share-alike) / REPLACE. Currently
  0 REPLACE (all originals or PD/CC); 2 CC BY-SA photos flagged REVIEW for
  commercial. Any future copyrighted capture is personal-use + gets a 🔴 REPLACE flag.
- **DB readiness (2026-07-03):** verified — FS imagery stored in content_sections
  (28 refs); all messaging tables present (conversations, participants w/
  last_read_at, messages w/ attachments+reply_to_id, message_read_receipts,
  message_reactions, messaging_preferences). Data layer ready for Track B.

## Diagram QA revision log (2026-07-03)
- **Text readability (root cause + fix):** SVG text was hard to read / looked
  outlined because the module renders diagrams as `<img src=svg>` (isolated
  context) and 'Segoe UI' Semibold isn't available there → faux-bold outline +
  thin/light strokes. FIXED: switched ALL diagram text to **Arial** (universal,
  real 400/700 faces), weight **700**, min **12px**, dark **#111827**,
  `text{stroke:none}`. Verified dark + crisp via actual `<img>` render.
- **Overlaps:** programmatic getBoundingClientRect audit across all 22 diagrams.
  Fixed coordinate-area (D-coordinate; shoelace formula vs point C),
  horizontal-curve (M⟷L), average-end-area (L line vs station labels).
  **Final: 0 text overlaps.**
- **Overflow/clipping:** fixed survey-units + stereo-overlap captions.
  **Final: 0 text overflow** (transform-aware screen-coord check).
- **A10 + A13: DONE** — every diagram triple-checked (readability + overlap +
  overflow + correctness), verified programmatically + visually.
- **Still TODO:** subscripts audit (mostly using Unicode ₁₂ already); mobile
  render check of figures; A11 (more diagrams to fully populate); Track B messaging.
