# CAD Multi-Select Editing + File-Manager I/O — Build Plan

Status: **completed** · Owner: CAD/UX · Opened: 2026-05-27 · Closed: 2026-05-27

This doc drives the Stop-hook build loop. While it sits in
`docs/planning/in-progress/`, the loop keeps shipping the next slice.
When every slice below is shipped (or explicitly deferred with a
one-line rationale), move this doc to `docs/planning/completed/` — that
is the clean stop.

## How to run (every resume)
1. Read the Audit Log (§3) bottom entry for where the last slice stopped.
2. Pick the top unchecked `[ ]` slice in §2.
3. Implement the smallest meaningful increment. `npx tsc --noEmit` +
   eslint touched files; vitest where logic is added; verify in the
   Playwright harness (`/cad-harness`) where feasible.
4. Append a dated §3 entry; commit + push to `claude/nice-bardeen-YpOrt`.
5. When all slices are done, move this doc to `completed/`.

Prime directives: never leave the tree broken; keep `claude-opus-4-7[1m]`
out of every commit/artifact; commit messages end with the session URL.

---

## 2. Backlog (top = next)

- [x] **S1. Multi-select edit panel — per-type tabs.** DONE — the Property
  panel now groups a multi-selection into Lines/Areas/Points/Text/Other tabs
  and bulk-edits color, line weight, opacity (+ line type for lines/areas, +
  symbol for points via the existing pickers) as a single undo entry; bulk
  Move-to-Layer retained. Verified `multiselect-edit.spec`.
- [x] ~~S1 (orig)~~ When >1 feature is
  selected, the right Property panel shows tabs grouped by feature kind
  (e.g. "Lines (N)" / "Points (N)" / "Areas (N)"). Each tab edits ALL
  selected features of that kind at once: color, line weight, opacity,
  and line type for lines/areas; color + symbol + opacity for points.
  Edits push a single batched undo entry. Keep the existing bulk
  "Move to Layer". Replaces the current bare "N objects selected +
  one color swatch" multi-select view.

- [x] **S2a. File manager — duplicate / import + in-app drag.** DONE —
  per-file Duplicate (server copy into same folder), Import button + hidden
  input (.starr/.json → POST into current folder), draggable file rows that
  drop onto folder nodes / the All-drawings root to move, draggable folder
  nodes that reparent (PATCH parent_id, cycle-guarded), and the file pane is
  an OS drop zone that imports dropped .starr files. (DB-backed actions
  verified by code/types; the harness has no DB, so only modal chrome is
  e2e-checked.) Next: S2b.
- [x] ~~S2a (orig)~~ Add a
  Duplicate action per file (server-side copy of the document into the
  same folder, name " copy"). Add an Import control (upload one or more
  `.starr` files → POST to the drawings API → land in the current
  folder). Make file rows draggable onto folder nodes in the tree (and
  onto the "All drawings" root) to move them; make folder nodes valid
  drop targets with a highlight. Folder rows draggable onto other folders
  to reparent (uses the existing PATCH parent_id + cycle guard).

- [x] **S2b. File manager — OS drag in/out.** DONE — drag a file row OUT to
  the desktop downloads its `.starr` via a Chromium `DownloadURL`
  DataTransfer pointing at a new GET `/api/admin/cad/drawings/export?id=`
  (returns the stored document as a JSON attachment). Dropping `.starr`
  files FROM the OS onto the file pane imports them (S2a path).
  DEFERRED (one line): OS *folder* drag-in/out and drag-out in
  non-Chromium browsers are browser-API-limited — scoped to files + the
  in-app folder tree, which covers the surveyor's workflow on the
  Chromium-based desktop app.

---

## 3. Audit Log

- 2026-05-27 — Opened. Prior session shipped: name/code point search in
  the New Layer dialog + Point Viewer; single collapsible Point Data
  dock; layer-scoped editing preference. Remaining specified work
  captured above as S1–S2b. Next: S1.
- 2026-05-27 — S1 shipped. Property panel multi-select rebuilt into per-type
  tabs with batched-undo bulk styling (color/weight/opacity + line type +
  symbol) and retained bulk Move-to-Layer. tsc + eslint clean;
  `multiselect-edit.spec` green. Next: S2a.
- 2026-05-27 — S2a shipped. File manager Duplicate + Import + in-app drag
  (file→folder move, folder reparent) + OS-file drop-to-import. tsc + eslint
  clean; modal chrome e2e green (DB actions unverifiable headless).
- 2026-05-27 — S2b shipped + loop CLOSED. OS drag-out via new export
  endpoint + DownloadURL; drag-in done in S2a. OS folder drag + non-Chromium
  drag-out deferred-with-rationale. All slices complete; moving this doc to
  completed/.
