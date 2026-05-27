# CAD Editing, Layers, Points, Preferences & Menus — Self-Updating Audit

Status: **in progress** · Owner: CAD/UX · Opened: 2026-05-27 01:37 CDT
Time-box: **work until 6:00 AM CDT (06:00), 2026-05-27.** On every resume:
check the clock (`TZ="America/Chicago" date "+%H:%M"`). If ≥ 06:00 CDT →
§7 Finalization and STOP. Otherwise keep working the §5 backlog.

---

## 0. How to use this document (READ FIRST, EVERY RESUME)

Self-updating audit loop. The Stop hook
(`.claude/hooks/continue-until-planning-done.sh`) keeps the session
running while this file is in `docs/planning/in-progress/`. Moving it to
`completed/` is the clean stop.

On EVERY resume:
1. `TZ="America/Chicago" date "+%H:%M"` — if ≥ 06:00 → §7, STOP.
2. Read the Audit Log (§6) bottom entry for where the last slice stopped.
3. Pick the single highest-priority open `[ ]` in §5.
4. Run one audit cycle (§3) on that one target — small slice, one commit.
5. Append a dated §6 entry. Add newly-found targets as `[ ]`.
6. Commit + push. The hook resumes the loop.

Prime directives: never leave the tree broken (`npx tsc --noEmit` + lint
touched files before every commit; relevant vitest CAD suites green).
Keep `claude-opus-4-7[1m]` out of every commit/artifact. Develop + push
only to `claude/nice-bardeen-YpOrt`. Verify in the Playwright harness
(`/cad-harness`) + screenshot where it makes sense. Commit messages end
with the session URL.

---

## 3. Audit cycle (per slice)

inspect → implement small → `npx tsc --noEmit` + eslint touched files →
unit test (vitest) where logic is added → live-verify in harness +
screenshot where feasible → record in §6 → commit + push.

---

## 5. Backlog (top = next)

### Concrete user requests (this engagement)
- [ ] **A. Suppress the native browser right-click menu across the CAD app.**
  Many right-clicks open the OS/browser context menu. Add a contextmenu
  preventDefault on the CAD shell root (so right-click is owned by the app),
  while still letting inputs/textareas keep native behavior where useful.
- [ ] **B. Filter… field formatting in the Point Data Viewer / Point table.**
  Fix the reported formatting issue (alignment/padding/contrast). Then sweep
  for other formatting glitches (misaligned inputs, clipped text, dark-on-dark).
- [ ] **C. Line-type symbols render ON TOP of the line.** A dashed line with an
  "O"/glyph should not have dashes crossing through the symbol — give the
  symbol a slight opaque (white) backing so the line never shows through it.
- [ ] **D. Infinity (and oriented) line-type symbols tilt with the line.** Rotate
  inline symbols so their long axis follows the segment direction.
- [ ] **E. Media attachments for points / lines / shapes / layers** (LARGE — stage):
  right-click "Add media for this point/feature/layer" → upload image/video;
  "View media…" appears only when media exists; Properties panel shows
  thumbnails; a media viewer with zoom + video controls. Decide storage
  (IndexedDB blob store keyed by feature/layer id) and data model first.
- [ ] **F. Import/Export deep review** (original ask): audit CSV/PNEZD/DXF/
  LandXML/GeoJSON readers + writers + the wizard for bugs/edge cases beyond
  the reset fix already shipped.

### Ongoing audit themes (open-ended — keep finding + fixing)
- [ ] **G. Editing** — selection, grips, move/rotate/scale, undo/redo integrity.
- [ ] **H. Layer control** — visibility/lock/isolate, active-layer safety, panel UX.
- [ ] **I. Point control** — viewer, naming, codes, derived points.
- [ ] **J. Preferences** — settings dialog, display prefs, persistence.
- [ ] **K. Menu control** — menubar/submenus, command bar, context menus.

Newly-discovered audit targets get appended here as `[ ]`.

---

## 6. Audit Log

- 2026-05-27 01:37 CDT — Opened. Already shipped earlier this session (pre-doc):
  import-wizard reset-on-open + cad:openImport; point name/code label order
  (name drawn last → on top); block drawing on a hidden active layer; right-
  click menu dismissal overlays (title-block + layer/panel menus). Backlog
  seeded above. Next: A (suppress native right-click menu).

---

## 7. Finalization (clock ≥ 06:00 CDT)

1. Tree green: `npx tsc --noEmit` clean, lint clean on touched files,
   vitest CAD suites green.
2. Every open `[ ]` left unfinished gets a one-line status/deferral note.
3. Flip Status (§top) to **completed**, add a closing §6 entry.
4. Repoint any `// Spec:` refs (`grep -rln` the in-progress path) to
   `completed/`, then `git mv` this doc to `docs/planning/completed/`.
5. Commit + push. in-progress/ empties; the hook routes onward.
